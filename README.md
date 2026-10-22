# Artha

A local-first desktop app (Windows, via Electron) for tracking net worth across bank
accounts, investments, real estate, and loans — plus insurance, ID documents, credit
cards, and a password vault, all behind one master password.

Everything lives on your machine. There is no cloud backend, no account, and no
telemetry.

## Installing Artha

1. Download `Artha-Setup-<version>.exe` from the
   [latest release](https://github.com/anandd512/wealth-manager/releases/latest).
2. Optional but recommended — check the file wasn't altered on the way. In PowerShell:
   `Get-FileHash .\Artha-Setup-<version>.exe -Algorithm SHA256` and compare the result
   with the SHA-256 listed in the release notes.
3. Run it. If Windows shows **"Windows protected your PC"**, click **More info → Run
   anyway**. You'll see this for unsigned releases, and sometimes for a new signed
   release until Windows has seen enough installs of it.

On first launch Artha asks whether to check for updates automatically. If you agree, new
releases download in the background and Artha asks you to restart. You can change this,
or check manually, in **Settings → Help**.

To uninstall, use **Windows Settings → Apps → Installed apps → Artha → Uninstall**. Your
data folder (`%APPDATA%\Artha`) is left in place so a reinstall picks it up; delete that
folder too if you want everything gone.

**Before you start using it, know that:**

- **Your master password can't be recovered.** It encrypts everything; if you forget
  it, the data is gone. Store it in a safe place.
- **Backups are on you.** Your data exists only on this computer. Use
  **Settings → Data → Export backup** regularly and keep the file somewhere other than
  this PC (a USB drive or your own cloud storage). The backup is encrypted with your
  master password.
- **AI auto-fill is optional and uses your own API key.** If you turn it on in
  **Settings → AI**, each document you upload for auto-fill is sent to the provider you
  choose (Anthropic, or your own OpenAI-compatible endpoint) to be read. The extracted
  details are saved only on your device. Without a key, everything else works and you
  enter details by hand.
- Email reminders are optional too and use your own SMTP account.

## Running it from source

```bash
npm install
npm run dev     # dev mode with hot reload
```

```bash
npm run build   # production build to out/
npm start       # preview the production build
```

On first launch you'll set a **master password**. This encrypts the entire local
database (AES-256-GCM, key derived from your password via scrypt). There is
no password reset — if you forget it, the data cannot be recovered. The
database file lives at `%APPDATA%\Artha\wealth.db.enc` (the dev build uses the same
folder, so running from source on a machine with the app installed opens the same data).

### Troubleshooting `npm run dev`

**`Error: Electron uninstall` / `getElectronPath`** — the `electron` npm package's
postinstall step, which downloads the actual Electron binary, didn't complete (flaky
network, antivirus, or an interrupted `npm install`). Fix:

```bash
node node_modules/electron/install.js
```

This re-downloads the binary into `node_modules/electron/dist`. If it still fails,
delete `node_modules/electron` and reinstall.

**`TypeError: Cannot read properties of undefined (reading 'whenReady')`** — the
`ELECTRON_RUN_AS_NODE` environment variable is set, which makes `electron.exe` run as
plain Node instead of launching the app, so `require('electron')` doesn't return the
real API. This is commonly inherited from VS Code's integrated terminal (VS Code is
itself an Electron app and can leak this into terminals it spawns). Fix, in that
terminal, before running `npm run dev`:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

Or just run `npm run dev` from a terminal outside VS Code.

## Releasing a new version

Releases are built by GitHub Actions (`.github/workflows/release.yml`) and published to
GitHub Releases, which is also where installed copies look for updates.

1. Bump `version` in `package.json` (e.g. `0.1.1`) and commit.
2. Tag and push: `git tag v0.1.1 && git push origin master v0.1.1`.
3. The workflow builds the installer and uploads it, with `latest.yml` (used by the
   auto-updater), to a **draft** release. Its summary lists the installer's SHA-256.
4. Review the draft on GitHub, paste the SHA-256 into the notes, and click **Publish**.
   Installed copies pick it up within a few hours, or on their next launch.

The tag must match the `package.json` version, or the workflow fails before building.
To build an installer locally without publishing: `npm run dist` (output in `release/`).

Once code signing is set up (the `SIGNPATH_API_TOKEN` secret exists), the workflow also
sends `Artha.exe` and then the installer to SignPath. Each signing request waits for a
manual approval in SignPath before the workflow continues, so approve both while the run
is in progress. See [Code signing policy](#code-signing-policy).

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

*SignPath Foundation approval is pending. Until then, releases are unsigned.*

- Committers and reviewers: [Anand Deshpande](https://github.com/anandd512)
- Approvers: [Anand Deshpande](https://github.com/anandd512)

Only `Artha.exe` and the `Artha-Setup-<version>.exe` installer, built by GitHub Actions
from this repository's source, are signed. Every signing request is approved manually.

## Privacy policy

This program will not transfer any information to other networked systems unless
specifically requested by the user or the person installing or operating it.

Each of these happens only when you turn it on or ask for it:

- **AI auto-fill** sends the document you upload to the AI provider you chose in
  **Settings → AI**: [Anthropic](https://www.anthropic.com/legal/privacy), or an
  OpenAI-compatible endpoint you configure yourself (its operator's privacy policy applies).
- **Email reminders** are sent through the SMTP server you configure.
- **Update checks** contact [GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)
  to look for a newer release, if you allow automatic checks or click **Check now**.
- **Stock price lookups** query [Yahoo Finance](https://legal.yahoo.com/us/en/yahoo/privacy/index.html)
  for the ticker you ask about.

Everything else, including all your financial data, stays encrypted on your device.

## What's implemented

- **Dashboard**: net worth, assets vs. liabilities, allocation by category, net worth
  over time (recorded automatically on every change you make).
- **Accounts**: bank accounts (with account number, IFSC, and optional debit card
  details), investments (stocks, Mutual Funds/SIPs, PPF, EPF, NPS, bonds, physical
  gold, crypto), real estate, and loans/liabilities.
  - For Mutual Funds/SIPs, enter one combined current value rather than itemizing
    every fund.
  - **Stock price auto-sync**: for stock holdings, set a ticker (e.g. `RELIANCE.NS`,
    `AAPL`) and quantity, and the app fetches the live price from Yahoo Finance's
    public quote endpoint (no account linking, no API key) and computes the value. A
    non-INR quote is converted to rupees automatically using a live FX rate from the
    same endpoint (e.g. for US-listed RSUs).
  - **RSU/ESPP**: tracked as a manual quantity + current value in ₹ (e.g. from your
    broker's portal like Morgan Stanley StockConnect) — no ticker/auto-sync.
  - **Loans**: upload the lender's repayment/amortization schedule PDF and the model
    reads the installment table itself to fill in the principal, interest rate,
    tenure, EMI, start date, and — using today's date — the current outstanding
    balance and how many installments are paid vs. remaining. The schedule PDF is
    stored (encrypted) and viewable/downloadable from the app afterward; re-run
    extraction any time via "Re-sync" without re-uploading. Manual entry still works
    if you'd rather not upload anything.
  - **Mutual Funds/SIPs**: optionally record your net invested amount to see overall
    gain/loss (₹ and %) displayed under the current value.
- **Insurance**: upload a policy PDF or photo and an LLM extracts the policy number,
  type (Term Life, Health, 2/4-Wheeler Vehicle, Home, Travel, etc. — with vehicle
  number for vehicle policies), insurer, insured person, sum assured, premium, expiry
  date, and a separate renewal date when the document states one. View or download
  the original document any time.
- **IDs**: Aadhaar, PAN, Passport, Driving License, Voter ID, Birth Certificate,
  vehicle Registration Certificate (RC), etc. in one place. Upload a PDF or photo and
  the model extracts ID number, name, date of birth, issue/expiry dates, and anything
  else relevant (address, vehicle class, parents' names, etc.) into a free-form
  "additional details" field — same extraction pipeline as insurance. View/download
  any time, with expiry reminders for documents that expire (e.g. Passport, DL, RC).
  - Document extraction (insurance, IDs, and loan repayment schedules) has two
    providers, switchable in Settings:
    - **Anthropic (Claude)**: your own Anthropic Console API key.
    - **Azure AI Foundry / OpenAI-compatible**: point it at a model deployed on
      Foundry's OpenAI-compatible surface (`.../openai/v1`) plus a deployment name
      (e.g. a GPT model you deployed yourself) — useful if you have Azure credits
      (such as a Visual Studio Enterprise subscription) instead of a separate
      Anthropic key. Uses the OpenAI Responses API with inline base64 file input, so
      PDFs work without a separate conversion step (as long as the deployed model
      supports file input in the Responses API).
- **Credit Cards**: a simple list with number, network, expiry, and CVV — masked by
  default, click "Show" to reveal.
- **Logins & Passwords**: a basic vault for service name, username/ID, and password —
  masked by default, with show/copy actions.
- **Reminders**: insurance and ID-document expiries trigger a desktop notification
  and/or email (your own SMTP app password), a configurable number of days before
  expiry (default 30), checked once at launch and every 12 hours while running.
- **Security**:
  - The master password encrypts the whole database (AES-256-GCM).
  - Every uploaded document (insurance PDFs, ID scans, loan repayment schedules) is
    separately encrypted at rest with the same key — files on disk are never
    plaintext. They're decrypted to a temp file only when you click View/Download,
    and that temp copy is deleted when
    you lock the app or quit.
  - The Anthropic API key and SMTP app password are stored via Electron's
    `safeStorage`, backed by the Windows Credential/DPAPI store — tied to your Windows
    user account, independent of the master password.

## Deliberate scope decisions (from your answers during setup)

- **No bank/brokerage account linking** (no Plaid or similar). Values are entered
  manually. This keeps your real banking credentials out of any third party entirely.
- **No mobile/LAN access** — this is a single-machine desktop app only.
- **Document parsing uses a cloud LLM** (Anthropic or your own Azure/OpenAI-compatible
  deployment), not local OCR — uploaded insurance policies *and* ID documents (PAN,
  Aadhaar, passport, etc.) are sent to whichever provider you've configured, using
  your own key, when you click "Upload". If that's not something you want for your
  most sensitive ID scans, use "+ Add manually" instead — extraction is just a
  time-saver; every field is editable before saving either way.
- **Storing CVVs and passwords**: you asked for this explicitly. It's protected by
  the same master-password-encrypted database as everything else, same threat model
  as a password manager's local vault — but it's still worth knowing the data is
  there and decrypted in memory whenever the app is unlocked.

## Known limitations / good next steps

- Price auto-sync only covers individual stocks via ticker (Yahoo Finance's free
  endpoint). Mutual fund NAVs aren't covered by that free endpoint, so MF/SIP values
  stay manual — a good follow-up would be wiring up AMFI's public NAV file for Indian
  mutual funds, and a spot-price feed for gold.
- Reminders only fire while the app is running (checked on launch + every 12h). For
  more reliable delivery, consider enabling "Start at login" via Windows settings so
  the app is normally open, or add a Windows Task Scheduler entry that launches it
  periodically.
- Releases are unsigned until the SignPath Foundation application is approved, so
  Windows SmartScreen warns on install. Even signed, new releases may warn until they
  build up reputation.
- Single-user, single-machine by design. If you ever want it on your phone too, the
  cleanest path discussed was a small self-hosted sync server — deliberately left out
  of this version.

## Project layout

- `src/main` — Electron main process: encrypted DB (`db.ts`, `auth.ts`), encrypted
  document storage (`fileStore.ts`), secrets (`secrets.ts`), business logic
  (`services/`), IPC (`ipc.ts`), reminder scheduler.
- `src/preload` — context-bridge API exposed to the renderer.
- `src/renderer` — React UI.
- `src/shared` — types and IPC channel names shared across processes.
