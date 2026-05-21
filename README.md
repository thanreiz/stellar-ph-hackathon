# SariSync Ledger (Kaha)

SariSync Ledger is a premium, offline-first React Native (Expo) B2B application designed for Philippine sari-sari stores. It uses the Stellar Testnet and Freighter for instant, secure B2B settlement, wrapped in a premium Web2 fintech user interface.

The app is built specifically for store onboarding, daily sales tracking, inventory financing, supplier invoice settlement, business debt visibility, and simulated SEP-24 off-ramps.

---

## 🚀 Key Features & Refactor Updates

### 1. Zero Mock Data Policy
The application enforces a strict "Zero Mock Data" policy for all wallet balances and dashboard metrics.
* **Horizon Integration:** Queries the Stellar Horizon Testnet server in real time via `@stellar/stellar-sdk` using the `fetchLiveWalletBalances(publicKey)` service.
* **404 Account Not Found Handling:** Unfunded or newly created Testnet accounts are caught gracefully and return zero balances (`{ xlm: "0.0000", phpc: "0.0000" }`) instead of crashing the UI.
* **AsyncStorage Verification:** All business metrics (spent, capital, business debt) are computed strictly from local transaction history and logged AsyncStorage receipts.

### 2. GoTyme Bank UI Aesthetic & Theme System
* **Premium Geometry:** Designed with sleek card components (`borderRadius: 24`), subtle shadows, and pill-shaped action buttons (`borderRadius: 99`).
* **5-Level Dynamic Themes:** Read and written to `AsyncStorage`, the app cycles themes instantly based on the store's current Level or manual configuration:
  * **Level 1 (Teal):** Fresh, organic, clean green fintech theme.
  * **Level 2 (Orange):** High-contrast modern premium theme.
  * **Level 3 (GoTyme Blue):** Authentic blue-and-white bank branding theme.
  * **Level 4 (Purple):** Regal, vibrant violet theme.
  * **Level 5 (Maribank Dark Mode):** Charcoal dark mode for high-tier stores.
* **Backward Compatibility:** All components use the `useTheme()` hook which retrieves active theme configurations dynamically from [AppContext.js](file:///app/context/AppContext.js).

### 3. The 3-Pillar Workflow

#### Pillar 1: Onboarding Flow (`app/onboarding.js`)
* Entry point for new users. Captures: Store Name, Location, Monthly Earnings, and starting Level.
* **Freighter Wallet Connection Gate:** Enforces public key format validation (must start with `G` and be exactly 56 characters long).
* Saves details to storage and flags `hasCompletedOnboarding: true` before redirecting to the main dashboard.

#### Pillar 2: Offline Kaha Mode (`services/storageService.js`)
* Auto-detects network transitions.
* **Disabled Stellar Actions:** Repayments, loan requests, and cash outs are disabled when offline with a persistent warning banner.
* **Local Draft Logging:** Stores "Benta" (sales) locally. Auto-syncs drafts to the on-chain profile and updates balances instantly once network connectivity is restored.

#### Pillar 3: Smart Checkout Scanner (`app/scanner.js`)
* Renamed checkout action to **"Magbayad ng Supply"**.
* Scans a supplier invoice QR payload:
  ```json
  {
    "supplier_pubkey": "G...",
    "amount_usdc": 50
  }
  ```
* Calculates **Tindahan Cash**:
  $$\text{Total Synced Benta} + \text{PHPC Balance} + (\text{XLM Balance} \times 9.07) - \text{cashOutTotal}$$
* **Microlender Shortfall Financing:** If the bill exceeds Tindahan Cash:
  * Prompts the user with an interactive warning: `"Kulang ng ₱[Amount]. Utangin ang kulang?"`.
  * If accepted, executes `receiveLoanFromLender` to secure the shortfall in PHPC from *Kaagapay Microfinance*, updates the local loan ledger, and proceeds to settle the invoice via `submitInventoryFinancingSettlement`.

#### Pillar 4: SEP-24 Cash Out Off-Ramp
* Surfaces a persistent **"I-Cash Out"** off-ramp button on the Kaha dashboard.
* Integrates a simulated interactive SEP-24 Anchor transaction flow.
* Allows users to select GCash, Maya, BDO, or BPI, input the cash out amount, verify their phone number, input a 6-digit OTP, and deducts the amount from `Tindahan Cash`.

---

## ⛓️ Soroban Smart Contract Integration

### Contract: `update_profile` in `contracts/sarisync_contract/src/lib.rs`

The Soroban contract stores each store's on-chain credit profile as a `(u32, u64)` tuple keyed by the store's Stellar `Address`:

| Parameter | Rust Type | Frontend Value |
|---|---|---|
| `store` | `Address` | Store's Stellar public key |
| `score` | `u32` | Tiwala Score (30–95) from `calculateTiwalaScore()` |
| `loan_limit` | `u64` | PHP credit ceiling (0 / 3500 / 7500) from `getLoanLimitForStage()` |

### Transaction Finality Polling (`services/sorobanService.js`)

After submitting the transaction via `sorobanServer.sendTransaction()`, the app enters a polling loop:
* **Interval:** Every **2 seconds**
* **Max duration:** 30 attempts × 2s = **60 seconds max**
* **Terminal states:** `SUCCESS` → resolves with `{ confirmedScore, confirmedLimit, hash }`. `FAILED` → throws immediately.
* **Non-terminal states:** `PENDING` / `NOT_FOUND` → continue polling (these are normal during mempool propagation).
* **Network resilience:** Individual poll errors (network hiccups) are caught and skipped; polling continues.

### React State Refresh on Success (`app/index.js`)

Once `syncProfileToChain` resolves:
1. **Eager state push:** `setOnChainScore(syncResult.confirmedScore)` and `setOnChainLimit(syncResult.confirmedLimit)` are called immediately — no extra RPC round-trip needed for those values since they are known locally.
2. **Full ledger refresh:** `refreshLedger()` is then called to re-simulate `get_profile` on-chain AND re-fetch live XLM/PHPC balances (accounting for gas fees deducted from the XLM balance).
3. **Blocking overlay:** An `ActivityIndicator` Modal overlays the entire screen while polling is in progress, preventing duplicate submissions and showing live status messages.

---

## 🛠️ Environment Configuration

Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

Ensure the following variables are configured:
```env
EXPO_PUBLIC_STORE_SECRET_KEY=S...
EXPO_PUBLIC_STORE_PUBLIC_KEY=G...
EXPO_PUBLIC_PHPC_ISSUER=G...
EXPO_PUBLIC_USDC_ISSUER=G...
EXPO_PUBLIC_STELLAR_NETWORK=testnet
EXPO_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
EXPO_PUBLIC_SOROBAN_CONTRACT_ID=C...
```

---

## 💻 Running the Application

### Install Dependencies
```bash
npm install
```

### Start Metro Bundler
Start the development server and clear the cache:
```bash
npx expo start --clear
```

### Run on Android Studio emulator
```bash
npm run android
```

### Run on iPhone
```bash
npm run ios
```

---

## 🧪 Verification & Testing

### Run Unit Tests
Run the standard Node.js runner test suite verifying 49 passing checks:
```bash
npm test
```

### Syntax and compilation checks
Check for JSX compilation and syntax validity using `esbuild`:
```bash
npx esbuild app/index.js --loader:.js=jsx --outfile=/dev/null
npx esbuild app/scanner.js --loader:.js=jsx --outfile=/dev/null
npx esbuild app/onboarding.js --loader:.js=jsx --outfile=/dev/null
npx esbuild services/stellarService.js --loader:.js=jsx --outfile=/dev/null
```

---

## 📂 Project Structure & File Responsibilities

* **`context/AppContext.js`:** Manages onboarding state, user levels, and dynamic 5-level GoTyme styling theme colors.
* **`context/ThemeContext.js`:** Wraps `AppContext` and exposes the `useTheme()` hook for styled UI elements.
* **`app/onboarding.js`:** Renders the Freighter Wallet connection gate and captures store demographics.
* **`app/index.js`:** Renders the main dashboard, Benta logger, sales graphs, progress bars, and the Cash Out simulation. Handles Soroban post-finality state refresh with an `ActivityIndicator` overlay.
* **`app/scanner.js`:** Renders the camera scanner viewport and handles shortfall micro-financing settlement.
* **`services/sorobanService.js`:** Manages all Soroban RPC interactions — `fetchOnChainProfile` (read-only simulation) and `syncProfileToChain` (write with 2s polling loop until `SUCCESS`).
* **`services/stellarService.js`:** Executes Testnet transactions (`PathPaymentStrictReceive`, `payment`, Horizon balance inquiries).
* **`services/storageService.js`:** Enqueues offline drafts, syncing ledger history on network reconnect.
* **`services/creditLadderService.js`:** Defines credit stage boundaries, loan limits, and Tiwala Score equations.
* **`services/dashboardService.js`:** Groups ledger sales histories into day, week, month, and year graph series.
* **`contracts/sarisync_contract/src/lib.rs`:** Soroban smart contract storing `(score: u32, loan_limit: u64)` per store address on the Stellar Testnet.
* **`tests/`:** Holds unit tests checking business rules, network status, offline modes, and Tindahan Cash conversions.
