# Wealth Manager

A local-first desktop app (Windows, via Electron) for tracking net worth across bank
accounts, investments, real estate, and loans — plus insurance, ID documents, credit
cards, and a password vault, all behind one master password.

Everything lives on your machine. There is no cloud backend, no account, and no
telemetry.

## Running it

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
database file lives at `%APPDATA%/wealth-manager/wealth.db.enc`.

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
- No packaged installer yet (`npm run dist` is wired to `electron-builder` with an
  icon configured, but no code signing/publish config). Fine for running from source;
  worth finishing if you want a double-click installer.
- Single-user, single-machine by design. If you ever want it on your phone too, the
  cleanest path discussed was a small self-hosted sync server — deliberately left out
  of this version.
- No clipboard auto-clear timer on the vault's "Copy" button — the password stays on
  your OS clipboard until overwritten by something else.

## Project layout

- `src/main` — Electron main process: encrypted DB (`db.ts`, `auth.ts`), encrypted
  document storage (`fileStore.ts`), secrets (`secrets.ts`), business logic
  (`services/`), IPC (`ipc.ts`), reminder scheduler.
- `src/preload` — context-bridge API exposed to the renderer.
- `src/renderer` — React UI.
- `src/shared` — types and IPC channel names shared across processes.
