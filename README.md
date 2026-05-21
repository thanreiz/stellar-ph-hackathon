# SariSync Ledger

SariSync Ledger is a 72-hour hackathon MVP for sari-sari store B2B inventory financing on Stellar Testnet.

The app is strictly for store inventory financing, supplier invoice settlement, business debt visibility, and business capital upgrades. It is built as a mobile-first React Native Expo app with Expo Router for Android and iPhone demos.

## Current Status

- App type: React Native Expo mobile app
- Demo targets: Android Studio emulator and physical iPhone through Expo
- Network: Stellar Testnet only
- Wallet model: wallet connection gate for a Stellar/Freighter Testnet public account, with app-owned demo signing keys for hackathon transactions
- Browser wallet extensions: not used
- Core state model: offline-first local ledger with AsyncStorage
- Current demo scope: local ledger, stage/score logic, dashboard modules, QR invoice parsing, and graceful Stellar settlement handling

## Product Scope

SariSync Ledger helps a sari-sari store owner prove store activity and unlock B2B inventory financing.

The MVP focuses on:

- Logging daily **Benta**
- Keeping Benta usable offline
- Syncing pending offline records when online
- Calculating **Tiwala Score**
- Showing stage-based capital upgrade limits
- Scanning supplier invoice QR payloads
- Preparing Stellar Testnet settlement for B2B inventory invoices
- Tracking store spend, earnings, capital, business debt, and receipts
- Creating a proof trail for the store owner’s hard-earned credit profile

## UI Dictionary

These labels are used in the app:

| Meaning | App Label |
| --- | --- |
| Dashboard | Kaha |
| Sales | Benta |
| Trust/Credit Score | Tiwala Score |
| Stage 1 action | Pondohan ang Upgrade |
| Stage 2 action | Utangin ang kulang |
| Paid/Settled | Bayad Na |
| Offline warning | Naka-Offline Mode. I-save muna sa phone. |

Color rules:

- Shortages/debt: `#FF3B30`
- Settled payments/sales: `#34C759`

## Online Mode

When the device is connected to the internet, the app shows the full dashboard.

### Loading Screen

The app first shows a loading screen while checking:

- Network status
- Local Kaha ledger records
- Pending offline queue

### Kaha Dashboard

The dashboard displays:

- Sales today
- Total synced Benta
- Tiwala Score
- Loan Limit
- Sales graph

The graph has selectable ranges:

- Year
- Month
- Week
- Day

### Dashboard Buttons

The Kaha screen includes these interactive modules:

1. **Profile**
   - Store settings
   - Store type
   - Current stage
   - Tiwala Score
   - Loan limit

2. **Tracker**
   - Tracks store spend, earnings, capital, and business debt
   - Shows available capital upgrade limit
   - Shows stage-specific financing action
   - Links to supplier invoice scanning

3. **Debt**
   - Tracks business debt with microlending companies
   - Includes Stellar payment action
   - Includes Stellar invoice validation action
   - Validated payment history can increase Tiwala Score
   - Delayed business payments can lower Tiwala Score

4. **Receipts**
   - Shows transaction proof
   - Shows paid business debt, received inventory financing, and supplier stock purchase records
   - Includes **Create document** action for credit proof packaging

## Offline Mode

When the device loses internet, the app keeps the same module structure but changes what is allowed.

### Offline Warning

A persistent banner appears at the top:

```text
Naka-Offline Mode. I-save muna sa phone.
```

### Kaha And Benta

Still works offline:

- The owner can manually input daily Benta.
- The app saves the payload locally in `pendingSyncQueue`.

Paused offline:

- Benta is not sent to the synced ledger until internet returns.

### Graphs

Graphs remain visible in offline mode, but switch to cached/read-only behavior.

They show the data from the last successful sync.

### Tracker And Debt

Still works offline:

- View current loan limit
- View past capital spent
- View Tiwala Score
- View tracked business debt records

Disabled offline:

- `Pondohan ang Upgrade`
- `Utangin ang kulang`
- Stellar payment actions
- Stellar invoice validation actions

Disabled buttons are greyed out and show a lock indicator because Stellar transactions require internet to broadcast signed transactions.

### Receipts And Documents

Still works offline:

- View cached transaction history
- Read cached receipts
- Create a local HTML document from cached receipts and loan records
- Share the document through the native iOS/Android share sheet

If there are no receipts or loans yet, **Create Document** shows:

```text
No recorded transactions.
```

## Credit Ladder

| Stage | Condition | Loan Limit | Button |
| --- | --- | ---: | --- |
| Read-Only (Starter) | total synced Benta < 5000 | ₱0 | *Hidden* |
| Micro-Sari (Starter) | 5000 <= total synced Benta <= 30000 | ₱3,500 | Pondohan ang Upgrade |
| Corner Store (Growth) | total synced Benta > 30000 | ₱7,500 | Utangin ang kulang |

The MVP Tiwala Score:

- Minimum: 30
- Maximum: 95
- Increases with synced sales volume
- Clamped between 30 and 95

Implemented in:

```text
services/creditLadderService.js
```

## Offline Ledger

The offline-first ledger is implemented with AsyncStorage.

Storage keys:

```text
sarasync:pendingSyncQueue
sarasync:syncedSalesLedger
```

Behavior:

1. User enters Benta amount.
2. App creates a Benta payload.
3. If offline, payload is saved to `pendingSyncQueue`.
4. If online, payload is appended to the synced sales ledger.
5. When connectivity returns, pending records sync into the mocked synced ledger.
6. Pending queue is cleared after sync.

Implemented in:

```text
hooks/useNetworkStatus.js
services/storageService.js
app/index.js
```

## Supplier Invoice QR

The scanner expects this QR payload:

```json
{
  "supplier_pubkey": "G...",
  "amount_usdc": 50
}
```

Validation rules:

- QR payload must be valid JSON.
- `supplier_pubkey` must be a string that starts with `G`.
- `amount_usdc` must be a positive number.

The scanner:

- Parses QR JSON safely.
- Stores the parsed invoice in component state.
- Shows supplier public key.
- Shows USDC amount.
- Shows current stage.
- Shows loan limit.
- Shows eligibility state.
- Does not execute the blockchain transaction automatically.
- Executes only after the user taps the current stage action button.

Implemented in:

```text
app/scanner.js
services/invoiceService.js
```

## Stellar Testnet

The app uses Stellar Testnet only.

Environment-driven config:

```text
EXPO_PUBLIC_STORE_SECRET_KEY
EXPO_PUBLIC_STORE_PUBLIC_KEY
EXPO_PUBLIC_PHPC_ISSUER
EXPO_PUBLIC_USDC_ISSUER
EXPO_PUBLIC_STELLAR_NETWORK=testnet
EXPO_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

Never commit real secret keys.

### Wallet SDK

The app includes the official Stellar Wallet SDK pattern from Stellar docs.

Implemented in:

```text
services/walletSdkService.js
```

Pattern:

```js
import * as walletSdk from "@stellar/typescript-wallet-sdk";

const wallet = walletSdk.Wallet.TestNet();
const stellar = wallet.stellar();
```

The shared Testnet wallet SDK instance is available for wallet-style Horizon basics.

### Settlement Service

B2B invoice settlement is implemented with `@stellar/stellar-sdk`, because the MVP needs `PathPaymentStrictReceive`.

Implemented in:

```text
services/stellarService.js
```

Rules:

- Uses Stellar Testnet only
- Uses Horizon URL from env
- Uses store secret key from env
- Uses PHPC as send asset
- Uses USDC as destination asset
- Destination is `supplier_pubkey` from QR
- Destination amount is `amount_usdc` from QR
- Memo is `SariSync B2B`
- Uses `PathPaymentStrictReceive`
- No direct payment fallback is enabled

Return shape:

```js
{
  success: boolean,
  transactionHash?: string,
  error?: string
}
```

The service handles missing env config, invalid supplier public keys, invalid amounts, and Horizon submission errors gracefully.

## Environment Setup

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Fill in:

```bash
EXPO_PUBLIC_STORE_SECRET_KEY=
EXPO_PUBLIC_STORE_PUBLIC_KEY=
EXPO_PUBLIC_PHPC_ISSUER=
EXPO_PUBLIC_USDC_ISSUER=
EXPO_PUBLIC_STELLAR_NETWORK=testnet
EXPO_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

## Install

```bash
npm install
```

## Run

Start the Expo dev server:

```bash
npm start -- --port 8082 --clear
```

Run on an Android Studio emulator:

```bash
npm run demo:android
```

Run on a connected iPhone or Expo Go device:

```bash
npm run demo:ios
```

For a face-to-face iPhone demo, keep the laptop and iPhone on the same Wi-Fi, open Expo Go or scan the Expo QR code, then connect the Stellar/Freighter account on the first screen before entering Kaha.

For an Android Studio native project, generate the Android folder first:

```bash
npm run prebuild:android
```

Then open the generated `android/` folder in Android Studio, or run:

```bash
npm run run:android
```

If the live demo lenders run out of Testnet PHPC, reseed them from the configured store wallet:

```bash
npm run seed:lenders
```

## Verification Commands

Tests:

```bash
npm test
```

Expo project health:

```bash
npm run doctor
```

Android native smoke build:

```bash
npm run prebuild:android
```

Forbidden dependency/product scan:

```bash
rg -n "<blocked terms and blocked wallet package>" -S . -g '!node_modules' -g '!package-lock.json'
```

## Latest Verified Results

Last run during development:

- `npm test`: 32 tests passing
- `npm run doctor`: 17/17 Expo project health checks passing
- `npx expo export --platform ios --output-dir /tmp/sarisync-ledger-ios-export`: iOS bundle export passing
- `npx expo export --platform android --output-dir /tmp/sarisync-ledger-android-export`: Android bundle export passing
- Android emulator: verified at 1080x2400
- `npm run seed:lenders`: restores demo lender PHPC liquidity on Testnet

Known audit note:

- `npm audit --omit=dev` reports transitive advisories through Expo SDK 52 and the Wallet SDK dependency tree.
- The automatic force fix would move dependencies outside the requested hackathon stack.
- The app keeps the requested Expo SDK 52 / React Native 0.76 line intact.

## Project Structure

```text
app.json
app/_layout.js
app/index.js
app/scanner.js
babel.config.cjs
hooks/useNetworkStatus.js
services/creditLadderService.js
services/dashboardService.js
services/invoiceService.js
services/stellarService.js
services/storageService.js
services/walletSdkService.js
tests/creditLadderService.test.js
tests/dashboardService.test.js
tests/invoiceService.test.js
tests/walletSdkService.test.js
utils/formatters.js
```

## File Responsibilities

### `app/_layout.js`

Expo Router stack layout.

Routes:

- `index` titled `Kaha`
- `scanner` titled `Invoice Scanner`

### `app/index.js`

Main Kaha dashboard.

Includes:

- Loading screen
- Offline warning banner
- Sales today
- Benta
- Tiwala Score
- Loan Limit
- Sales graph
- Benta input
- Profile module
- Tracker module
- Debt module
- Receipts module
- Online/offline button states

### `app/scanner.js`

Supplier invoice scanner.

Includes:

- Expo Camera QR scanner
- Permission handling
- QR parsing
- Invoice card
- Eligibility display
- Stage-specific financing button
- Stellar settlement result
- `Bayad Na` success state

### `hooks/useNetworkStatus.js`

Network status hook using `@react-native-community/netinfo`.

Returns:

- `isConnected`
- `isInternetReachable`
- `isOffline`
- `connectionType`
- `hasCheckedInitialStatus`

### `services/storageService.js`

AsyncStorage local ledger service.

Exports:

- `createSalesPayload`
- `getPendingSyncQueue`
- `enqueuePendingSale`
- `clearPendingSyncQueue`
- `getSyncedSalesLedger`
- `appendToSyncedSalesLedger`
- `syncPendingSalesQueue`
- `getTotalSyncedSalesVolume`
- `resetLocalLedgerStorage`
- `STORAGE_KEYS`

### `services/creditLadderService.js`

Pure credit ladder logic.

Exports:

- `evaluateCreditStage(totalSales)`
- `calculateTiwalaScore(totalSales)`
- `getLoanLimitForStage(stage)`
- `CREDIT_STAGES`

### `services/dashboardService.js`

Pure dashboard aggregation logic.

Exports:

- `GRAPH_RANGES`
- `SAMPLE_BUSINESS_TRANSACTIONS`
- `getSalesToday`
- `getSalesSeries`
- `getOfflineControlState`
- `getBusinessSnapshot`

### `services/invoiceService.js`

Pure supplier invoice parsing and eligibility logic.

Exports:

- `parseSupplierInvoiceQr`
- `evaluateInvoiceEligibility`

### `services/stellarService.js`

Stellar Testnet B2B inventory financing settlement service.

Exports:

- `submitInventoryFinancingSettlement`

### `services/walletSdkService.js`

Stellar Wallet SDK wrapper.

Exports:

- `WALLET_SDK_NETWORK`
- `getSariSyncWalletSdk`
- `getSariSyncWalletStellar`
- `getWalletSdkPackage`

### `utils/formatters.js`

Formatting helpers.

Exports:

- `formatPhp`
- `formatUsdc`
- `formatPublicKey`

## Test Coverage

### Credit Ladder Tests

File:

```text
tests/creditLadderService.test.js
```

Covers:

- Stage 1 threshold
- Stage 2 threshold
- Loan limit lookup
- Tiwala Score clamp

### Dashboard Tests

File:

```text
tests/dashboardService.test.js
```

Covers:

- Sales today calculation
- Year/month/week/day graph series
- Offline control state
- Business snapshot totals

### Invoice Tests

File:

```text
tests/invoiceService.test.js
```

Covers:

- Valid QR payload parsing
- Invalid supplier public key rejection
- Invalid amount rejection
- Invoice eligibility
- Shortfall calculation

### Wallet SDK Tests

File:

```text
tests/walletSdkService.test.js
```

Covers:

- Shared Testnet Wallet SDK singleton
- Wallet SDK Stellar helper access

## Update Log

### Initial Replacement

- Replaced the previous prototype with a React Native Expo mobile app.
- Added Expo Router.
- Added Expo SDK 52-compatible React Native setup.
- Added `.env.example`.
- Added `.gitignore`.

### Offline-First Kaha Ledger

- Added `hooks/useNetworkStatus.js`.
- Added `services/storageService.js`.
- Added daily Benta entry.
- Added pending offline queue.
- Added mocked synced sales ledger.
- Added automatic queue sync when online.
- Added exact offline warning text.

### Credit Ladder

- Added `services/creditLadderService.js`.
- Added Stage 1: `Micro-Sari (Starter)`.
- Added Stage 2: `Corner Store (Growth)`.
- Added Stage 1 button: `Pondohan ang Upgrade`.
- Added Stage 2 button: `Utangin ang kulang`.
- Added deterministic Tiwala Score.

### Scanner And Invoice Parsing

- Added `app/scanner.js`.
- Added Expo Camera QR scanner.
- Added safe QR JSON parser.
- Added supplier public key validation.
- Added USDC amount validation.
- Added eligibility display.
- Added stage-specific financing button.

### Stellar Testnet Settlement

- Added `services/stellarService.js`.
- Added `PathPaymentStrictReceive` transaction preparation.
- Added PHPC send asset.
- Added USDC destination asset.
- Added supplier destination from QR.
- Added `SariSync B2B` memo.
- Added structured success/error result.
- Added graceful handling for missing env and Testnet liquidity errors.

### Stellar Wallet SDK

- Added `@stellar/typescript-wallet-sdk`.
- Added `services/walletSdkService.js`.
- Added shared `Wallet.TestNet()` instance.
- Added wallet SDK tests.
- Kept path payment settlement on the underlying Stellar SDK because that operation is advanced network behavior.

### Mobile Demo Target

- Locked Expo platforms to iOS and Android.
- Added Android Studio emulator and iPhone demo scripts.
- Kept manual QR JSON input as a phone-demo fallback when camera scanning is unavailable.

### Dashboard Upgrade

- Added loading screen.
- Added online dashboard copy.
- Added `Sales today`.
- Added sales graph with year/month/week/day views.
- Added `Profile`, `Tracker`, `Debt`, and `Receipts` buttons.
- Added `services/dashboardService.js`.
- Added dashboard tests.

### Offline Behavior Upgrade

- Preserved Kaha and Benta input offline.
- Graph remains visible using cached synced ledger data.
- Tracker and Debt display cached state.
- Stellar transaction controls are locked offline.
- Document creation uses the native file/share flow and can package cached transactions offline.
- Offline warning remains persistent at the top.

### Wallet Gate And Native Documents

- Added a first-run Stellar/Freighter wallet connection gate before Kaha.
- Added a native mobile Create Document flow using Expo FileSystem and Sharing.
- Empty history copy only appears after Create Document is pressed.
- Microloan receive transactions now send PHPC to the connected Stellar public account.

## Demo Tips

1. Start the Android Studio emulator, then run:

   ```bash
   npm run demo:android
   ```

2. For the iPhone face-to-face demo, install Expo Go or connect the iPhone, then run:

   ```bash
   npm run demo:ios
   ```

3. Enter a Benta amount and save.

4. On first launch, connect a Stellar/Freighter public account or tap **Use Demo Freighter Account**.

5. Toggle graph ranges:

   - Year
   - Month
   - Week
   - Day

6. Click through:

   - Profile
   - Tracker
   - Debt
   - Receipts

6. Open scanner from Tracker with **Scan Supplier Invoice**.

7. Test with QR JSON:

   ```json
   {
     "supplier_pubkey": "G...",
     "amount_usdc": 50
   }
   ```
