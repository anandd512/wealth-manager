# Artha sync backend

Azure Functions backend for Artha's cloud sync. It is a **zero-knowledge relay**: every
record is encrypted on-device before it ever reaches this API, so the server (and
Cosmos DB, and anyone who compromises either) only ever sees ciphertext plus
non-secret metadata (record id, type, timestamp). The master password and the
data-encryption key it derives never leave the device.

See the repo root for the wider plan — this covers Phase 1 (backend) only. The
Electron app's crypto/sync client (Phase 3) and the iOS app (Phase 4) are separate,
later changes.

## What's here

- `src/functions/verifyRequest.ts` — `POST /api/auth/verify/request` — emails a
  6-digit code to an address, before any account exists for it. Step 1 of registration.
- `src/functions/verifyConfirm.ts` — `POST /api/auth/verify/confirm` — exchanges a
  correct code for a short-lived `verificationToken` (15 min). Step 2.
- `src/functions/authSalt.ts` — `GET /api/auth/salt?email=` — public lookup so a new
  device can fetch the KDF salt/params for an email before it can derive the auth key.
- `src/functions/register.ts` — `POST /api/auth/register` — creates a user record
  from `{ email, kdfSalt, kdfParams, authKey, verificationToken }`. Rejects without a
  valid, matching `verificationToken` from the step above — no way to create an
  account for an email you don't control. `authKey` is already derived client-side
  (scrypt); the server hashes it again with its own salt before storing it, so a
  Cosmos data breach alone isn't a replayable credential (`src/lib/verifier.ts`).
- `src/functions/login.ts` — `POST /api/auth/login` — verifies `authKey`, issues a JWT.
- `src/functions/syncPush.ts` / `syncPull.ts` — JWT-protected batch upload/download of
  encrypted items, using the client-assigned `updatedAt` for last-write-wins and
  incremental pulls via a `since` cursor.
- `infra/main.bicep` — Cosmos DB (serverless), Storage (file blobs), Key Vault,
  Application Insights, Azure Communication Services Email (verification codes), and
  a Consumption-plan Function App wired together with managed identity (no connection
  strings in app settings — Key Vault references and identity-based storage access
  instead, except `AzureWebJobsStorage` — see the gotcha further down on why).

### Data model (Cosmos DB, database `artha`)

- `users` (partition key `/id`): `{ id, email, kdfAlgorithm, kdfSalt, kdfParams, authVerifierSalt, authVerifier, createdAt }`
- `items` (partition key `/userId`): `{ id, userId, type, ciphertext, updatedAt, deleted, createdAt }`
  — one document per synced record (account, insurance policy, credit card, etc.);
  `deleted` is a tombstone so other devices learn about deletions instead of just
  losing the row.
- `verifications` (partition key `/id`, id = the email being verified): `{ id, code, createdAt, ttl }`
  — pending registration OTPs. `defaultTtl: -1` on the container plus each item's own
  `ttl` (900s) means Cosmos garbage-collects an expired/unused code on its own.

## Local development

1. Install [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
   and [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (or point `AzureWebJobsStorage` at a real storage account).
2. `npm install`
3. Copy `local.settings.json.example` to `local.settings.json` and fill in:
   - `COSMOS_CONNECTION_STRING` — from an actual Cosmos DB account (there's no good
     local emulator substitute once deployed; the [Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/emulator)
     works for local-only testing if you'd rather not touch the cloud account yet).
   - `JWT_SIGNING_KEY` — any random 32+ byte string (`openssl rand -base64 32`).
4. `npm start` — builds and runs `func start`, serving on `http://localhost:7071/api/...`.

## Deploying to Azure

Prerequisites: `az login` (already done in this environment), Azure Functions Core
Tools v4 installed for the publish step.

```bash
# 1. Resource group — pick a region close to you
az group create --name artha-rg --location centralindia

# 2. Provision everything (Cosmos, Storage, Key Vault, Function App, App Insights)
#    namePrefix must be short and globally-unique-ish (storage/Cosmos/KeyVault names are global)
az deployment group create \
  --resource-group artha-rg \
  --template-file infra/main.bicep \
  --parameters namePrefix=arthaad

# 3. Populate the two Key Vault secrets the Function App reads at runtime.
#    (Grant yourself access first if RBAC blocks you: az role assignment create
#    --role "Key Vault Administrator" --assignee <your-email> --scope <keyvault-resource-id>)
COSMOS_CONN=$(az cosmosdb keys list --name arthaad-cosmos --resource-group artha-rg --type connection-strings --query "connectionStrings[0].connectionString" -o tsv)
az keyvault secret set --vault-name arthaad-kv --name cosmos-connection-string --value "$COSMOS_CONN"
az keyvault secret set --vault-name arthaad-kv --name jwt-signing-key --value "$(openssl rand -base64 32)"

# 4. Build and publish the Functions code
npm run build
func azure functionapp publish arthaad-func --typescript
```

After that, `https://arthaad-func.azurewebsites.net/api/auth/register` etc. are live.

> **Gotcha:** `siteConfig.appSettings` in `infra/main.bicep` *replaces* the Function
> App's entire app settings list on every `az deployment group create` — it doesn't
> merge. `func azure functionapp publish` sets its own settings (notably
> `WEBSITE_RUN_FROM_PACKAGE`) outside this template, so **re-running step 2 after the
> app is live wipes the deployed package reference and the app silently loses all its
> functions** (host stays "Running", `/admin/functions` just returns `[]`). If you
> redeploy infra after the first deploy, always run step 4 again immediately after.

## Email verification

Registration requires proving the email address before an account is created —
`verifyRequest.ts` emails a 6-digit code, `verifyConfirm.ts` exchanges a correct one
for a short-lived token `register.ts` checks before writing anything to the `users`
container. (Google/Microsoft sign-in was tried and then removed — the mobile app
runs in plain Expo Go, which can't handle an OAuth provider's redirect back into the
app, so it never worked end-to-end there. Email/password plus this verification step
replaced it.)

**Email delivery**: Azure Communication Services Email, using its free "Azure Managed
Domain" (`<generated-guid>.azurecomm.net`) — no custom domain purchase or DNS records
needed, SPF/DKIM/DMARC are already verified the moment the domain resource finishes
provisioning. Chosen over a third-party provider (Resend, SendGrid, etc.) specifically
to avoid a new account: it's provisioned in the same resource group, billed against
the same credit, and `az` was already authenticated in this environment.

The default (and only) sender address on an Azure Managed Domain is
`DoNotReply@<the generated domain>` — there's no "add a custom sender username" step
available on the managed domain tier. The actual domain isn't known until the
`emailServices/domains` resource finishes provisioning (a couple of minutes after
first deploy), so read it back and set it explicitly:

```bash
DOMAIN=$(az deployment group show --resource-group artha-rg --name main \
  --query properties.outputs.emailDomainMailFromSenderDomain.value -o tsv)
az functionapp config appsettings set --name arthaad-func --resource-group artha-rg \
  --settings "ACS_SENDER_ADDRESS=DoNotReply@$DOMAIN"

ACS_CONN=$(az communication list-key --name arthaad-acs --resource-group artha-rg --query primaryConnectionString -o tsv)
az keyvault secret set --vault-name arthaad-kv --name acs-connection-string --value "$ACS_CONN"
```

(`az extension add --name communication --yes` first, if not already installed.)

### Cost

Cosmos DB serverless and the Functions Consumption plan both have Azure's
Always-Free allowances (1000 RU/s + 25GB Cosmos storage, 1M Functions executions/month),
which this app's traffic (one or two devices, small encrypted records) should stay
well inside. Storage and Key Vault are a few cents/month at this scale. Expect
effectively $0 against the $150/mo credit — Application Insights is the one line
item worth watching if you leave verbose logging on for a long time.

## What's intentionally not here yet

- The `ai-proxy` endpoint (Anthropic/OpenAI extraction without embedding API keys on
  each device) — planned, not yet needed until the iOS app exists.
- Rate limiting / abuse protection on `register` and `login` — fine for personal use,
  worth adding (e.g. Azure Functions built-in throttling or a simple Cosmos-backed
  counter) before this is exposed to more than a couple of trusted devices.
- Field-level or CRDT-style merge on conflicting edits — `syncPush` currently resolves
  conflicts as whole-record last-write-wins, which is simple and fine for append-heavy
  data (most of this app's tables) but can silently drop a concurrent edit to the same
  record. Revisit once the Electron/iOS sync clients exist and you can test real
  two-device conflicts (Phase 5 in the overall plan).
