# Division 1 UI Polish Design

## Goal

Polish SariSync so every screen feels like a normal, trustworthy sari-sari finance app, with Stellar as the quiet security layer in the background.

## Approved Direction

Use **Choice A: Warm Companion** across the whole app.

The visual tone is local, warm, and confidence-building:

- Friendly Taglish copy
- Big, readable money and score numbers
- Soft paper-like surfaces
- Deep green as the primary trust and money color
- Orange for expenses
- Minimal visible blockchain language
- Optional proof details for advanced users

The app should feel like a digital cashbox and ledger companion for a sari-sari store owner, not like a crypto dashboard.

## Core Layout Pattern

Use the approved mobile layout pattern throughout:

1. Top app bar with `Kaha` screen title and optional dark/light toggle.
2. Warm brand/header area with the SariSync mark and short plain-language explanation.
3. Large bento-style metric cards for the main numbers.
4. Tappable full-width primary actions with pill shapes.
5. Bottom or near-bottom icon navigation for the main areas.
6. Optional proof or transaction details hidden behind a secondary action.

The layout must work cleanly on:

- Android emulator at `1080 x 2400`
- iPhone demo through Expo Go

## Navigation

Use icon + label tabs for the core app sections:

| Section | Label | Icon Direction | Purpose |
| --- | --- | --- | --- |
| Dashboard | `Kaha` | wallet, cashbox, or peso icon | Main money overview |
| Tracker | `Tracker` | trend or line-chart icon | Sales, expenses, capital movement |
| Debt | `Utang` | hand-coins, credit-card, or loan icon | Loans and repayments |
| Receipts | `Proof` | receipt, check-circle, or document-check icon | Receipts and transaction proof |

Avoid raw text-only navigation chips. Icons should make the app feel easier to scan on a phone.

## Metric Cards

Primary metrics must be big and instantly readable.

Use these display examples as the visual target:

- `2500` for Benta
- `777` for expenses
- `32` for Tiwala Score
- `0` for loan limit

Rules:

- Numbers should be the largest text inside metric cards.
- Do not shrink key metrics into small rows.
- Use green for sales and positive money movement.
- Use orange for expenses.
- Use dark text for neutral scores and limits.
- Keep cards rounded and spacious.

## Language

Prefer normal finance and sari-sari language:

- `Wallet`
- `Loan`
- `Bayad`
- `Benta`
- `Mga Gastos`
- `Receipts`
- `Proof`
- `Konek Wallet`
- `Gumawa ng Dokumento`

Avoid showing technical terms by default:

- Stellar
- Horizon
- transaction hash
- blockchain
- Testnet
- trustline
- Soroban

Those terms may appear only inside optional details such as:

- `View proof`
- `Transaction details`
- `Advanced details`

## Proof Pattern

Blockchain proof should be present but quiet.

Use a short row or card such as:

```text
Proof hidden · Tap to view transaction details
```

When expanded, proof details may show:

- Transaction status
- Amount
- Date
- Counterparty
- Transaction hash
- Explorer link

The default screen should continue to feel like a normal finance app.

## Screen-Specific Direction

### Wallet Gate

Make the first screen demo-ready:

- Clear SariSync branding
- Friendly `Konek Wallet` headline
- Short explanation that records are secured in the background
- Easy-to-type public key input
- Strong primary `Konek Freighter Wallet` button
- Clear demo-account fallback
- Dark/light toggle visible but not distracting

### Kaha Dashboard

Make this the most polished screen:

- Large bento metrics for Benta, expenses, Tiwala Score, and loan limit
- Clear online/offline state
- Sales graph remains secondary to the core numbers
- Recent activity preview
- Hidden proof hint for transaction details

### Tracker

Tracker should feel like business movement, not blockchain analysis:

- Use plain labels: spent, earned, capital, active debt
- Show microloan offers as normal loan cards
- Keep interest rate visible
- Keep Stellar details hidden unless the user opens proof/details

### Utang

Debt flow should feel like repayment management:

- Rename or display this section as `Utang`
- Make active loans easy to scan
- Use `Bayad` for payment action
- Show offline repayment drafts as pending local work
- Keep transaction proof collapsed by default

### Proof

Receipts should become a proof center:

- Label the tab `Proof`
- Keep `Receipts` as a subheading if needed
- Show transaction records, loan records, and generated documents
- Empty state should be short: `No recorded transactions.`
- `Create Document` should be renamed to `Gumawa ng Dokumento` or equivalent friendly copy

### Offline Mode

Offline mode should still feel purposeful:

- Show the red offline banner.
- Keep local Benta and expense logging usable.
- Keep drafts visible.
- Hide online ledger numbers while offline.
- Use copy that explains local saving, not failure.

## Dark Mode

Dark mode should be a true designed mode, not just inverted colors.

Rules:

- Use deep charcoal-green surfaces.
- Keep text warm and readable.
- Use mint green for primary actions.
- Keep orange expenses visible.
- Use the same layout and hierarchy as light mode.
- Check every card, input, modal, tab, and proof detail in dark mode.

## Input Rules

All inputs must work with the native phone keyboard.

Rules:

- No `showSoftInputOnFocus={false}` on typing fields.
- Money fields use `keyboardType="number-pad"`.
- Wallet and hash fields use normal typing with no autocorrect.
- Inputs keep at least `48px` tap height.

## Acceptance Criteria

- The approved Choice A visual direction is applied across all main screens.
- Kaha, Tracker, Utang, and Proof use icon + label navigation.
- Core numbers are large and readable.
- App feels like normal finance software, not a crypto dashboard.
- Blockchain proof is hidden by default and available on demand.
- Light and dark modes both look intentional.
- No text overlap or clipped buttons on `1080 x 2400`.
- Native phone keyboard works on all inputs.
- Existing functionality is preserved.
- Existing tests pass.
- App runs on Expo SDK 52.

## Non-Goals

- Do not add new financial products in Division 1.
- Do not implement PHP/XLM conversion in Division 1.
- Do not add Soroban smart contracts in Division 1.
- Do not rewrite the Stellar transaction layer in Division 1.

## Implementation Preference

Refactor UI in small, testable slices:

1. Shared design tokens and reusable UI primitives.
2. Wallet gate polish.
3. Kaha dashboard metrics and nav polish.
4. Tracker, Utang, and Proof screen polish.
5. Dark mode and responsive QA.

Preserve business logic while changing presentation.
