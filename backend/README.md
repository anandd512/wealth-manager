# Artha sync backend

Azure Functions backend for Artha's cloud sync. It is a **zero-knowledge relay**: every
record is encrypted on-device before it ever reaches this API, so the server (and
Cosmos DB, and anyone who compromises either) only ever sees ciphertext plus
non-secret metadata (record id, type, timestamp).

Sign-in is **passwordless** — Google, Microsoft, or a 6-digit code emailed through
Azure Communication Services. Signing in only proves who you are; it never yields the
key that decrypts your data. That key (the *Data Key*) is generated on the first
device and reaches other devices only by being approved from an already-signed-in
device, or by typing the account's *Recovery Key*. See "Keys" below.

## What's here

Sign-in (all return the same `SessionResponse` — see `src/lib/users.ts`):

- `authEmail.ts` — `POST /api/auth/email/start` emails a sign-in code;
  `POST /api/auth/email/verify` exchanges it for a session (creating the account on
  first use). 5 wrong guesses burn a code; a new one can be requested every 30 s.
- `authOAuth.ts` — Google / Microsoft, brokered by the backend:
  `GET /api/auth/oauth/start?provider&redirect_uri&code_challenge` → provider →
  `GET /api/auth/oauth/callback` (exchanges the code with a client secret held in Key
  Vault) → redirect to the app with a sealed, 3-minute `handoff` →
  `POST /api/auth/oauth/exchange {handoff, codeVerifier}`. PKCE binds the handoff to
  the app instance that started it. Brokering server-side is what makes this work
  from Expo Go and keeps client secrets out of every install.
  `redirect_uri` is allowlisted (`src/lib/oauth.ts`): `http://127.0.0.1:<port>/callback`
  (desktop loopback), `artha://auth` (mobile builds), and `exp://<LAN IP>/--/auth`
  (Expo Go, switch off with `ALLOW_EXPO_GO_REDIRECTS=false`).
- Account linking: the same *verified* email across Google, Microsoft and email codes
  lands in one account. An unverified address (a Microsoft work account whose tenant
  hasn't proven the domain) is never used to link or stored as the account email.

Keys (`keys.ts`, `deviceLinks.ts`, all JWT-protected):

- `GET /api/account` — current `keyState`: `none` (new — create a key), `ready`
  (get the key from another device or the Recovery Key), `legacy` (old password
  account — convert it).
- `POST /api/keys/setup` — first device registers `recoveryWrappedKey` (Data Key
  sealed under the Recovery Key) and `keyProofHash`.
- `GET|PUT /api/keys/recovery` — fetch the sealed key / replace the Recovery Key.
- `POST /api/keys/migrate` — converts a pre-passwordless account: the client proves
  the old password one last time; the password verifier and KDF salt are deleted and
  the *same* Data Key is re-sealed under a new Recovery Key, so nothing re-encrypts.
- `POST /api/keys/reset` — lost every device *and* the Recovery Key: deletes the
  unreadable cloud copy so the account can start over.
- `POST /api/devices/link`, `GET /api/devices/pending`,
  `POST /api/devices/link/{id}/approve`, `GET|DELETE /api/devices/link/{id}` —
  "approve this device from one you're signed in on". The new device posts an X25519
  public key; the approving device seals the Data Key to it. Both screens show a
  6-digit code derived from that public key, so a key swapped by a malicious relay
  shows a different code. Requests expire after 10 minutes.

Approving a device and replacing the Recovery Key require a *key proof*
(`HKDF(DataKey, 'artha-key-proof')`; the server stores only its SHA-256), so a stolen
session alone can't do either.

Everything else:

- `verifyRequest.ts` / `verifyConfirm.ts` — email codes that authorize reminder
  emails to an address (`notifySend.ts`); no account needed.
- `syncPush.ts` / `syncPull.ts` / `filesUpload.ts` / `filesDownload.ts` —
  JWT-protected encrypted records and files, last-write-wins on `updatedAt`.
- `infra/main.bicep` — Cosmos DB (serverless), Storage (file blobs), Key Vault,
  Application Insights, Azure Communication Services Email, and a Consumption-plan
  Function App wired together with managed identity (no connection strings in app
  settings — Key Vault references and identity-based storage access instead, except
  `AzureWebJobsStorage` — see the gotcha further down on why).

### Data model (Cosmos DB, database `artha`)

- `users` (partition key `/id`): `{ id, email (verified only), identities: [{ provider, subject, email }], recoveryWrappedKey, keyProofHash, createdAt }`
  — plus `kdfSalt/kdfParams/authVerifier/authVerifierSalt` on accounts not yet converted from passwords.
- `items` (partition key `/userId`): `{ id, userId, type, ciphertext, updatedAt, deleted, createdAt }`
  — one document per synced record (account, insurance policy, credit card, etc.);
  `deleted` is a tombstone so other devices learn about deletions instead of just
  losing the row.
- `verifications` (partition key `/id`, id = `signin:<email>` or `notify:<email>`): `{ id, code, attempts, createdAt, ttl }`
  — pending one-time codes. `defaultTtl: -1` on the container plus each item's own
  `ttl` (900s) means Cosmos garbage-collects an expired/unused code on its own.
- `deviceLinks` (partition key `/userId`): `{ id, userId, publicKey, deviceName, status, ephemeralPublicKey?, wrappedKey?, createdAt, ttl }`
  — pending device approvals, self-expiring after 10 minutes.

## Local development

1. Install [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
   and [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (or point `AzureWebJobsStorage` at a real storage account).
2. `npm install`
3. Copy `local.settings.json.example` to `local.settings.json` and fill in:
   - `COSMOS_CONNECTION_STRING` — from an actual Cosmos DB account (there's no good
     local emulator substitute once deployed; the [Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/emulator)
     works for local-only testing if you'd rather not touch the cloud account yet).
   - `JWT_SIGNING_KEY` — any random 32+ byte string (`openssl rand -base64 32`).
   - `GOOGLE_*` / `MICROSOFT_*` — optional locally; see "Google and Microsoft sign-in".
     Add `http://localhost:7071/api/auth/oauth/callback` as a redirect URI on both
     OAuth clients and set `OAUTH_CALLBACK_URL` to it.
4. `npm start` — builds and runs `func start`, serving on `http://localhost:7071/api/...`.

## Deploying to Azure

Prerequisites: `az login` (already done in this environment), Azure Functions Core
Tools v4 installed for the publish step.

```bash
# 1. Resource group — pick a region close to you
az group create --name artha-rg --location centralindia

# 2. Provision everything (Cosmos, Storage, Key Vault, Function App, App Insights)
#    namePrefix must be short and globally-unique-ish (storage/Cosmos/KeyVault names are global)
#    The two client ids come from "Google and Microsoft sign-in" below (leave empty to skip).
az deployment group create \
  --resource-group artha-rg \
  --template-file infra/main.bicep \
  --parameters namePrefix=arthaad googleClientId=<google-client-id> microsoftClientId=<entra-app-client-id>

# 3. Populate the two Key Vault secrets the Function App reads at runtime.
#    (Grant yourself access first if RBAC blocks you: az role assignment create
#    --role "Key Vault Administrator" --assignee <your-email> --scope <keyvault-resource-id>)
COSMOS_CONN=$(az cosmosdb keys list --name arthaad-cosmos --resource-group artha-rg --type connection-strings --query "connectionStrings[0].connectionString" -o tsv)
az keyvault secret set --vault-name arthaad-kv --name cosmos-connection-string --value "$COSMOS_CONN"
az keyvault secret set --vault-name arthaad-kv --name jwt-signing-key --value "$(openssl rand -base64 32)"
az keyvault secret set --vault-name arthaad-kv --name google-client-secret --value "<google client secret>"
az keyvault secret set --vault-name arthaad-kv --name microsoft-client-secret --value "<entra client secret value>"

# 4. Build and publish the Functions code
npm run build
func azure functionapp publish arthaad-func --typescript
```

After that, `https://arthaad-func.azurewebsites.net/api/auth/email/start` etc. are live.

> **Gotcha:** `siteConfig.appSettings` in `infra/main.bicep` *replaces* the Function
> App's entire app settings list on every `az deployment group create` — it doesn't
> merge. `func azure functionapp publish` sets its own settings (notably
> `WEBSITE_RUN_FROM_PACKAGE`) outside this template, so **re-running step 2 after the
> app is live wipes the deployed package reference and the app silently loses all its
> functions** (host stays "Running", `/admin/functions` just returns `[]`). If you
> redeploy infra after the first deploy, always run step 4 again immediately after.

## Google and Microsoft sign-in

Both providers send the user back to **one** URL on this backend:
`https://<function-app>.azurewebsites.net/api/auth/oauth/callback`. Each provider is
optional — a missing client id/secret just makes that button report "not configured".

**Google** (Google Cloud console → APIs & Services):

1. OAuth consent screen: External, app name "Artha", scopes `openid`, `email`, `profile`.
2. Credentials → Create OAuth client ID → **Web application**. Authorized redirect URI:
   the callback URL above.
3. Client ID → bicep `googleClientId`; client secret → Key Vault `google-client-secret`.

**Microsoft** (Entra admin center → App registrations → New registration):

1. Supported account types: **Accounts in any organizational directory and personal
   Microsoft accounts**. Redirect URI: platform **Web**, the callback URL above.
2. Certificates & secrets → New client secret → Key Vault `microsoft-client-secret`
   (it expires — note the date). Application (client) ID → bicep `microsoftClientId`.
3. Recommended: Token configuration → Add optional claim → ID → `xms_edov`. Without it,
   work/school accounts are treated as having an unverified email (they still sign
   in, but won't auto-link to an existing account with the same address). Personal
   Microsoft accounts are always treated as verified.

Mobile builds also need `artha://` (already the `scheme` in `mobile/app.json`); Expo Go
works via `exp://<LAN IP>` as long as the phone loads the app from your LAN address
(not tunnel mode).

## Email codes

Emailed one-time codes are used for passwordless sign-in (`authEmail.ts`) and for
authorizing reminder emails (`verifyRequest.ts`/`verifyConfirm.ts`). They're stored
per purpose, so a reminder-verification code can never sign anyone in.

**Email delivery**: Azure Communication Services Email, using its free "Azure Managed
Domain" (`<generated-guid>.azurecomm.net`) — no custom domain purchase or DNS records
needed, SPF/DKIM/DMARC are already verified the moment the domain resource finishes
provisioning. Chosen over a third-party provider (Resend, SendGrid, etc.) specifically
to avoid a new account: it's provisioned in the same resource group, billed against
the same credit, and `az` was already authenticated in this environment.

The default (and only) sender address on an Azure Managed Domain is
`DoNotReply@<the generated domain>` — there's no "add a custom sender username" step
available on the managed domain tier. `infra/main.bicep` sets `ACS_SENDER_ADDRESS`
from the domain resource itself. On the very first deploy the domain may still be
provisioning, so if emails fail, run the deployment again (and publish again after —
see the gotcha above). The ACS connection string goes in Key Vault once:

```bash
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
- Per-IP rate limiting. Codes are capped per address (5 guesses, one send per 30 s),
  but nothing stops one client spraying `auth/email/start` across many addresses
  (which costs ACS email sends). Add Azure Front Door / API Management throttling
  before opening this up beyond a few trusted users.
- Field-level or CRDT-style merge on conflicting edits — `syncPush` currently resolves
  conflicts as whole-record last-write-wins, which is simple and fine for append-heavy
  data (most of this app's tables) but can silently drop a concurrent edit to the same
  record. Revisit once the Electron/iOS sync clients exist and you can test real
  two-device conflicts (Phase 5 in the overall plan).
