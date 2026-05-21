# Choice A Filipino Fintech UX Design

## Goal

Apply the approved **Choice A: Warm Companion** direction to the current SariSync app so it feels like a friendly Filipino fintech product for sari-sari store owners, while preserving the latest repo functionality: onboarding, Tindahan Cash, sales and expense logging, offline drafts, supplier financing, microloans, debt repayment, cash-out, Soroban trust profile sync, receipts, and proof details.

## Current Repo Baseline

The repo is current with `origin/main` at commit `297d471`. The app is on Expo SDK 52 and already includes core Choice A primitives in `components/SariSyncUI.js`, plus newer flows in `app/index.js`, `app/onboarding.js`, and `app/scanner.js`.

Existing functionality must remain intact:

- Store onboarding and wallet setup
- `Tindahan Cash` summary and cash-out/off-ramp flow
- Benta and expense recording modal
- Online/offline mode and local draft handling
- Trust Score and Credit Limit synced through Soroban
- Supplier invoice scanner and shortfall financing
- Microloan offers from Kaagapay Microfinance and Tindahan Capital Co.
- Debt repayment and proof/receipt/document flows

## Product Tone

SariSync should feel closer to GCash, GoTyme, and other Filipino-friendly finance apps than to a blockchain dashboard.

Use:

- Short, clear labels
- Large money numbers
- Familiar words: `Kaha`, `Benta`, `Gastos`, `Utang`, `Proof`, `Tindahan Cash`, `Cash Out`, `Wallet`
- Confidence-building copy that explains outcomes, not protocol mechanics
- Proof/details as optional transparency, not default complexity

Avoid default-visible technical words unless the user opens proof/details:

- Horizon
- Soroban
- RPC
- Testnet
- transaction hash
- smart contract
- trustline

These terms may remain inside `Proof`, `Transaction details`, modal internals, logs, tests, and developer-facing messages when needed.

## UX Standards

The design must follow practical fintech UX standards:

- Make the main balance and primary next action obvious within the first viewport.
- Use consistent button sizes with at least 48px tap height.
- Keep important money values large enough for quick scanning.
- Group secondary details under clear rows/cards.
- Keep all phone typing fields usable with native keyboards.
- Use error and offline states as guidance, not blame.
- Do not hide failures; explain what the user can still do.
- Reduce visual noise in dashboard and modal surfaces.

## Visual Direction

Choice A remains the base visual language:

- Warm paper-like cards
- Deep green primary color for trust and money
- Orange for expenses and outflow
- Soft surfaces, clear borders, restrained shadows
- Rounded but not toy-like controls
- Light and dark modes that feel intentionally designed

The visual polish should be applied to the current app, not by reverting to the older mockup.

## Navigation

Use icon + label navigation for four main sections:

| Section | Label | Purpose |
| --- | --- | --- |
| Dashboard | `Kaha` | Main balance, quick actions, daily metrics, trust progress |
| Tracker | `Tracker` | Business movement, capital, loan offers |
| Debt | `Utang` | Active loans, repayments, repayment drafts |
| Proof | `Proof` | Receipts, loan records, cash-out records, generated documents |

The current `Cash`, `Debt`, and English-heavy labels should be moved toward the approved labels where it improves demo clarity. English can remain in supporting copy when it is more natural, but the main navigation should match the approved Filipino-friendly model.

## Onboarding

Onboarding should feel like opening a finance app account, not filling a developer form.

Changes:

- Rename the first impression from `B2B Settlement & Credit Ladder` to a simpler sari-sari finance explanation.
- Replace numbered section titles with friendly headings:
  - `Store Profile`
  - `Business Snapshot`
  - `Connect Wallet`
- Keep the public key field but label it as wallet connection, with the technical public key explanation as helper text.
- Add a short reassurance that SariSync secures records in the background.
- Keep validation strict for wallet format.

## Dashboard / Kaha

The Kaha dashboard should be the most polished screen.

Required hierarchy:

1. Top app bar with SariSync brand and theme toggle.
2. Connection/offline pill.
3. `Tindahan Cash` as the main balance card.
4. Primary action row:
   - `Record`
   - `Cash Out`
   - `Pay Supplier` when enabled, or locked guidance when not.
5. Big metric cards:
   - `Benta`
   - `Gastos`
   - `Tiwala Score`
   - `Limit`
6. Trust progress card.
7. Offline work panel only when relevant.
8. Icon navigation.

The dashboard should not feel like a developer ledger. Technical explanations about PHPC, on-chain balances, or Stellar should be collapsed into helper rows or proof/details.

## Record Modal

The record modal should be simple and phone-friendly.

Use tab labels:

- `Benta`
- `Gastos`

Use field labels:

- `Halaga`
- `Pinambayad`

Use buttons:

- `Save Benta`
- `Save Gastos`

Keep `keyboardType="number-pad"` for money fields.

## Tracker

Tracker should show business movement and financing access.

Use plain metrics:

- `Gastos`
- `Kita`
- `Capital`
- `Active Utang`

Loan offers should feel like normal microfinance offers:

- Lender name
- Loan amount
- Purpose
- Monthly interest
- Clear `Humingi` or `Request` button

Detailed network language should stay hidden unless the user opens transaction details.

## Utang

Debt management should feel like loan repayment, not blockchain transfer management.

Use:

- Section title `Utang`
- Subheading `Active loans`
- Primary action `Bayad`
- Offline state copy that explains repayment is saved as a local draft.

The transaction validator stays available behind `Proof hidden · Tap to view transaction details`.

Fix needed from the prior review: the expanded proof validation panel must use a vertical layout, not the horizontal lender card style.

## Proof

Proof should be a proof center, not just receipts.

It should include:

- Supplier settlement receipts
- Loan records
- Cash-out records
- Generated document action
- Optional transaction details

Empty state:

`No recorded transactions.`

Document button:

`Gumawa ng Dokumento`

Technical proof fields may appear only after the user asks for details.

## Scanner

Scanner should preserve its current supplier financing behavior, but copy should align with Choice A:

- Use `Pay Supplier`
- Use `Tindahan Cash`
- Use shortfall copy that sounds like financing guidance, not system failure.
- Keep QR validation and shortfall borrowing behavior unchanged.

## Offline Mode

Offline mode must feel purposeful.

Rules:

- Show a clear offline banner.
- Keep Benta and Gastos logging available.
- Keep drafts visible.
- Hide online-only balances or mark them as unavailable.
- Explain that records are saved locally and will sync when online.
- Disable cash-out, supplier payment, live loan request, and repayment broadcast while offline, but allow draft creation where supported.

## Dark Mode

Dark mode should be a true designed fintech mode:

- Charcoal-green surfaces
- Warm readable text
- Mint/green primary actions
- Orange expense accents
- Clear borders and disabled states
- No low-contrast helper text

Check all modals, inputs, nav tabs, and proof details.

## Testing And Acceptance

Acceptance criteria:

- App remains on Expo SDK 52.
- `npm test` passes.
- `npm run doctor` passes if available.
- Android emulator at 1080x2400 has no clipped text, overlapping buttons, or unusable inputs.
- iPhone Expo Go demo has usable keyboard inputs.
- Main nav uses `Kaha`, `Tracker`, `Utang`, `Proof`.
- Blockchain complexity is hidden by default.
- Proof/details remain available when tapped.
- All current finance flows still work or preserve their existing behavior.

## Non-Goals

- Do not rewrite the Stellar or Soroban transaction layer.
- Do not add new financial products.
- Do not change lender credentials or loan math.
- Do not change Expo SDK version.
- Do not replace the app with a website.
