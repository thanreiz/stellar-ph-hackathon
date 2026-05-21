# Choice A Filipino Fintech UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the current Expo SDK 52 SariSync app into the approved Choice A Filipino fintech experience while preserving existing wallet, offline, Soroban, scanner, cash-out, loan, debt, and proof behavior.

**Architecture:** Keep business logic in existing services and update presentation in small slices. Source-level guard tests define the expected labels, copy boundaries, and responsive proof layout; UI changes then update `components/SariSyncUI.js`, `app/onboarding.js`, `app/index.js`, and `app/scanner.js` without rewriting transaction code.

**Tech Stack:** Expo SDK 52, React Native 0.76.9, Expo Router 4, React 18.3.1, AsyncStorage, Stellar SDK, Soroban service modules, Node test runner.

---

## File Structure

- Modify: `tests/mobileDemoConfig.test.js`
  - Guard approved nav labels, Filipino-friendly metric labels, onboarding copy, record modal copy, vertical proof details, and document copy.
- Modify: `tests/webCompatibility.test.js`
  - Keep technical transaction hash proof coverage without making blockchain copy default-visible.
- Modify: `components/SariSyncUI.js`
  - Add reusable fintech action/menu primitives and proof panel styling helpers if needed.
- Modify: `app/onboarding.js`
  - Replace developer-style onboarding headings with friendly fintech setup language.
- Modify: `app/index.js`
  - Apply approved labels, dashboard hierarchy, record modal copy, Tracker/Utang/Proof copy, vertical proof detail layout, and offline guidance.
- Modify: `app/scanner.js`
  - Align supplier payment copy with Choice A without changing invoice settlement logic.

---

### Task 1: Add Choice A Filipino Fintech Guard Tests

**Files:**
- Modify: `tests/mobileDemoConfig.test.js`
- Modify: `tests/webCompatibility.test.js`

- [ ] **Step 1: Update navigation, metric, and copy guard tests**

In `tests/mobileDemoConfig.test.js`, replace the current Choice A nav and metric assertions with stricter approved-label assertions:

```js
  it("uses approved Choice A Filipino fintech nav labels and icons", () => {
    const source = readProjectFile("app/index.js");
    const uiSource = readProjectFile("components/SariSyncUI.js");

    assertMatches(source, /label:\s*"Kaha"/, "Expected Kaha tab label.");
    assertMatches(source, /label:\s*"Tracker"/, "Expected Tracker tab label.");
    assertMatches(source, /label:\s*"Utang"/, "Expected Utang tab label.");
    assertMatches(source, /label:\s*"Proof"/, "Expected Proof tab label.");
    assertMatches(source, /icon:\s*"wallet"/, "Expected wallet nav icon.");
    assertMatches(source, /icon:\s*"trend"/, "Expected trend nav icon.");
    assertMatches(source, /icon:\s*"loan"/, "Expected loan nav icon.");
    assertMatches(source, /icon:\s*"proof"/, "Expected proof nav icon.");
    assertIncludes(uiSource, "function IconNav");
    assertIncludes(uiSource, "function AppIcon");
  });

  it("uses big Filipino-friendly dashboard metrics", () => {
    const source = readProjectFile("app/index.js");
    const uiSource = readProjectFile("components/SariSyncUI.js");
    const metricCardUsages = source.match(/<BentoMetricCard\b/g) ?? [];

    assertIncludes(source, "Benta");
    assertIncludes(source, "Gastos");
    assertIncludes(source, "Tiwala Score");
    assertIncludes(source, "Limit");
    assertIncludes(source, "Tindahan Cash");
    assert.ok(
      metricCardUsages.length >= 4,
      `Expected at least four BentoMetricCard usages, found ${metricCardUsages.length}.`,
    );
    assertMatches(uiSource, /fontSize:\s*42/, "Expected large 42px metric treatment.");
    assertIncludes(uiSource, "expense");
  });
```

- [ ] **Step 2: Add onboarding and record-modal copy tests**

Append these tests inside the same `describe("mobile demo configuration", () => { ... })` block:

```js
  it("uses friendly onboarding copy for store profile and wallet setup", () => {
    const onboarding = readProjectFile("app/onboarding.js");

    assertIncludes(onboarding, "Store Profile");
    assertIncludes(onboarding, "Business Snapshot");
    assertIncludes(onboarding, "Connect Wallet");
    assertIncludes(onboarding, "records are secured in the background");
    assertIncludes(onboarding, "Freighter");
    assertExcludes(onboarding, "B2B Settlement & Credit Ladder");
    assertExcludes(onboarding, "Freighter Wallet Connection Gate");
  });

  it("uses phone-friendly Benta and Gastos record modal labels", () => {
    const source = readProjectFile("app/index.js");

    assertIncludes(source, "Benta");
    assertIncludes(source, "Gastos");
    assertIncludes(source, "Halaga");
    assertIncludes(source, "Pinambayad");
    assertIncludes(source, "Save Benta");
    assertIncludes(source, "Save Gastos");
    assertExcludes(source, "Sales (Inflow)");
    assertExcludes(source, "Expenses (Outflow)");
    assertExcludes(source, "Record Expenses");
    assertExcludes(source, "Payment Method");
  });
```

- [ ] **Step 3: Strengthen proof and scanner guard tests**

Update the proof test in `tests/mobileDemoConfig.test.js` so it expects the approved document copy and vertical layout evidence:

```js
  it("keeps proof details hidden behind a friendly vertical proof panel", () => {
    const source = readProjectFile("app/index.js");

    assertIncludes(source, "Proof hidden");
    assertIncludes(source, "Tap to view transaction details");
    assertIncludes(source, "Gumawa ng Dokumento");
    assertIncludes(source, "Proof center");
    assertIncludes(source, "Transaction details");
    assertIncludes(source, "proofDetailsCard");
    assert.ok(
      /ProofHint|isProofDetailsOpen|setProofDetailsOpen|proofDetailsOpen|showProofDetails/.test(source),
      "Expected source evidence that technical proof details are collapsed behind a friendly proof hint/state.",
    );
    assertExcludes(source, "Create Document");
  });

  it("keeps supplier scanner copy aligned with Choice A finance language", () => {
    const scanner = readProjectFile("app/scanner.js");

    assertIncludes(scanner, "Pay Supplier");
    assertIncludes(scanner, "Tindahan Cash");
    assertIncludes(scanner, "financing");
    assertExcludes(scanner, "Magbayad ng Supply");
  });
```

- [ ] **Step 4: Keep transaction hash coverage proof-scoped**

In `tests/webCompatibility.test.js`, keep the existing transaction hash test and do not add broad default-copy checks. The test should still include:

```js
    assertIncludes(source, "Transaction details");
    assertIncludes(source, "Sample Testnet TX");
    assertIncludes(source, "DEMO_TRANSACTION_HASH");
    assertIncludes(source, "validateHash");
```

- [ ] **Step 5: Run focused tests and verify expected failures**

Run:

```bash
node --test tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
```

Expected: FAIL. Failures should point to app/onboarding copy, app/index labels, proof panel layout, and scanner copy.

- [ ] **Step 6: Commit guard tests**

```bash
git add tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
git commit -m "test: define choice a filipino fintech ux guards"
```

---

### Task 2: Tighten Shared UI Primitives For Fintech Screens

**Files:**
- Modify: `components/SariSyncUI.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Add compact action and proof-detail primitives**

In `components/SariSyncUI.js`, add these exports before the final export block:

```js
function QuickAction({ label, helper, onPress, disabled = false, tone = "primary" }) {
  const { colors } = useTheme();
  const isExpense = tone === "expense";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: disabled ? colors.cardSecondary : isExpense ? colors.expense : colors.primary,
          borderColor: disabled ? colors.border : isExpense ? colors.expense : colors.primary,
          opacity: pressed && !disabled ? 0.82 : 1,
        },
      ]}
    >
      <Text style={[styles.quickActionLabel, { color: disabled ? colors.textSecondary : colors.buttonTextOnPrimary }]}>
        {label}
      </Text>
      {helper ? (
        <Text style={[styles.quickActionHelper, { color: disabled ? colors.textSecondary : colors.buttonTextOnPrimary }]}>
          {helper}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ProofDetailsCard({ children }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.proofDetailsCard, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
      {children}
    </View>
  );
}
```

- [ ] **Step 2: Add styles for the new primitives**

Add these styles inside `StyleSheet.create({ ... })` in `components/SariSyncUI.js`:

```js
  proofDetailsCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginTop: 12,
    padding: 14,
    width: "100%",
  },
  quickAction: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 58,
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickActionHelper: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 2,
    opacity: 0.86,
  },
  quickActionLabel: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
  },
```

- [ ] **Step 3: Export the new primitives**

Update the final export block:

```js
export {
  AppIcon,
  WarmCard,
  SectionHeader,
  PillButton,
  BentoMetricCard,
  IconNav,
  ProofHint,
  ProofDetailsCard,
  QuickAction,
};
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: FAIL only on app wiring/copy assertions. No syntax errors.

- [ ] **Step 5: Commit primitives**

```bash
git add components/SariSyncUI.js
git commit -m "feat: add fintech ui action primitives"
```

---

### Task 3: Polish Onboarding Into A Friendly Finance Setup

**Files:**
- Modify: `app/onboarding.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Update onboarding header copy**

In `app/onboarding.js`, replace the header title/subtitle block with:

```jsx
          <Text style={[styles.title, { color: colors.text }]}>SariSync</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Kaha, utang, and proof for your sari-sari store. Your records are secured in the background.
          </Text>
```

- [ ] **Step 2: Replace store profile section title**

Replace:

```jsx
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>1. Store Information</Text>
```

with:

```jsx
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Store Profile</Text>
```

- [ ] **Step 3: Replace business snapshot section title and helper**

Replace:

```jsx
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>2. Choose your Level and Theme</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            The level determines your credit limit and app color theme. Try tapping them to see the theme change!
          </Text>
```

with:

```jsx
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Business Snapshot</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Pick a starter profile for your demo. This helps SariSync show the right trust level and credit limit.
          </Text>
```

- [ ] **Step 4: Rename level pills to plain store stages**

Inside the `lvlNames` object, replace all values with:

```js
              const lvlNames = {
                1: "Starting store",
                2: "Growing tindahan",
                3: "Steady seller",
                4: "Corner store",
                5: "High-volume store",
              };
```

- [ ] **Step 5: Replace wallet section copy**

Replace:

```jsx
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>3. Freighter Wallet Connection Gate</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Enter your Stellar Public Key for settlement and on-chain verification of your Trust Score.
          </Text>
```

with:

```jsx
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Connect Wallet</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Connect your Freighter wallet so payments and proof can be verified when you need them.
          </Text>
```

- [ ] **Step 6: Rename wallet input label and placeholder**

Replace the public key input label and placeholder:

```jsx
            <Text style={[styles.label, { color: colors.textSecondary }]}>Wallet Address</Text>
```

and:

```jsx
              placeholder="Paste your Freighter wallet address"
```

Keep `autoCapitalize="characters"` and `autoCorrect={false}`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: onboarding test passes; remaining failures are app/index or scanner copy.

- [ ] **Step 8: Commit onboarding polish**

```bash
git add app/onboarding.js
git commit -m "feat: polish fintech onboarding copy"
```

---

### Task 4: Apply Choice A Dashboard And Record Flow

**Files:**
- Modify: `app/index.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Import the new primitives**

Update the existing import:

```js
import { BentoMetricCard, IconNav, ProofHint, QuickAction } from "../components/SariSyncUI";
```

- [ ] **Step 2: Update main navigation labels**

Replace `NAV_ITEMS` with:

```js
const NAV_ITEMS = [
  { id: "Kaha", label: "Kaha", icon: "wallet" },
  { id: "Tracker", label: "Tracker", icon: "trend" },
  { id: "Utang", label: "Utang", icon: "loan" },
  { id: "Proof", label: "Proof", icon: "proof" },
];
```

- [ ] **Step 3: Update dashboard metric labels**

Replace the four current bento labels:

```jsx
          <BentoMetricCard label="Benta" value={formatPhp(salesToday)} tone="positive" />
          <BentoMetricCard label="Gastos" value={formatPhp(expenseTotal)} tone="expense" />
          <BentoMetricCard label="Tiwala Score" value={`${displayScore}`} />
          <BentoMetricCard label="Limit" value={formatPhp(displayLimit)} tone="positive" />
```

Keep the existing values and tones.

- [ ] **Step 4: Replace dashboard primary actions with compact fintech actions**

Replace the two separate action button blocks for supplier financing and record modal with one action row:

```jsx
      <View style={styles.quickActionRow}>
        <QuickAction
          label="Record"
          helper="Benta / Gastos"
          onPress={() => {
            setStatusMessage("");
            setIsRecordModalVisible(true);
          }}
        />
        <QuickAction
          label="Cash Out"
          helper={network.isOffline ? "Offline" : "To GCash/Maya"}
          disabled={network.isOffline}
          onPress={() => {
            setCashOutAmount("");
            setCashOutStep("form");
            setCashOutError("");
            setCashOutTxHash("");
            setSimPhoneNumber("");
            setSimOtp("");
            setIsCashOutModalVisible(true);
          }}
        />
        <QuickAction
          label="Pay Supplier"
          helper={stage === CREDIT_STAGES.READ_ONLY ? "Locked" : "Invoice"}
          disabled={stage === CREDIT_STAGES.READ_ONLY}
          onPress={() => router.push("/scanner")}
        />
      </View>
```

- [ ] **Step 5: Add quick action row style**

Add this style in `app/index.js`:

```js
  quickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
    marginTop: -2,
  },
```

- [ ] **Step 6: Update record modal labels**

In the record modal:

```jsx
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 16 }]}>Record</Text>
```

Replace the tab labels with:

```jsx
                  Benta
```

and:

```jsx
                  Gastos
```

Replace sales input label/button:

```jsx
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Halaga</Text>
...
                    {isSavingBenta ? "Saving..." : "Save Benta"}
```

Replace expense input label/payment label/button:

```jsx
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Halaga</Text>
...
                <Text style={[styles.cardLabel, { color: colors.textSecondary, marginTop: 4 }]}>Pinambayad</Text>
...
                    Save Gastos
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: dashboard/nav/record modal assertions pass; remaining failures are Tracker/Utang/Proof or scanner.

- [ ] **Step 8: Commit dashboard polish**

```bash
git add app/index.js
git commit -m "feat: polish choice a kaha dashboard"
```

---

### Task 5: Polish Tracker, Utang, Proof, And Proof Details

**Files:**
- Modify: `app/index.js`
- Test: `tests/mobileDemoConfig.test.js tests/webCompatibility.test.js`

- [ ] **Step 1: Import ProofDetailsCard**

Update the UI import:

```js
import { BentoMetricCard, IconNav, ProofDetailsCard, ProofHint, QuickAction } from "../components/SariSyncUI";
```

- [ ] **Step 2: Update Tracker metric and offer copy**

Inside `TrackerPanel`, replace metric labels:

```jsx
        <MiniMetric label="Gastos" value={formatPhp(snapshot.spent)} color={colors.expense} />
        <MiniMetric label="Kita" value={formatPhp(snapshot.earned)} color={colors.primary} />
        <MiniMetric label="Capital" value={formatPhp(snapshot.capital + loanCapital)} color={colors.tertiary} />
        <MiniMetric label="Active Utang" value={formatPhp(loanCapital)} color={colors.error} />
```

Replace the loan offer intro:

```jsx
          <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8, color: colors.textSecondary }]}>Loan Offers</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Partner lenders can fund store inventory when your credit limit is available.</Text>
```

Replace the request button label:

```jsx
                    {!controlState.canTransact ? "Offline" : isTooHigh ? "Too High" : "Humingi"}
```

- [ ] **Step 3: Update DebtPanel section labels**

Inside `DebtPanel`, replace:

```jsx
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Utang</Text>
      <Text style={[styles.stageName, { color: colors.text }]}>Loan repayment</Text>
```

Replace outstanding copy:

```jsx
          Total Utang Balance
```

Replace active and empty labels:

```jsx
      <Text style={[styles.cardLabel, { marginTop: 8, marginBottom: 8, color: colors.textSecondary }]}>Active loans</Text>
...
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>No active loans yet. Request a loan in Tracker when your limit is available.</Text>
```

Replace repayment button text:

```jsx
                  {!controlState.canTransact ? "Draft" : "Bayad"}
```

- [ ] **Step 4: Use vertical proof details card**

Replace:

```jsx
        <View style={[styles.lenderCard, { marginTop: 12, backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
```

for the expanded proof validator with:

```jsx
        <ProofDetailsCard>
```

and replace the matching closing `</View>` with:

```jsx
        </ProofDetailsCard>
```

For the nested validation result card, do not use `styles.lenderCard`; use:

```jsx
            <View style={[styles.proofResultCard, { marginTop: 12, backgroundColor: colors.card, borderColor: colors.border }]}>
```

- [ ] **Step 5: Add proof result style**

Add this style to `app/index.js`:

```js
  proofResultCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12,
    width: "100%",
  },
```

- [ ] **Step 6: Update Proof center document copy**

Inside `ReceiptsPanel`, replace:

```jsx
      <Text style={[styles.stageName, { color: colors.text }]}>Transaction proof</Text>
```

with:

```jsx
      <Text style={[styles.stageName, { color: colors.text }]}>Receipts and records</Text>
```

Replace the document button text:

```jsx
        <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Gumawa ng Dokumento</Text>
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
```

Expected: PASS for proof, transaction hash, and mobile copy tests unless scanner copy remains.

- [ ] **Step 8: Commit panel polish**

```bash
git add app/index.js
git commit -m "feat: polish tracker utang and proof panels"
```

---

### Task 6: Align Scanner Copy With Choice A

**Files:**
- Modify: `app/scanner.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Replace supplier payment labels**

In `app/scanner.js`, replace user-visible supplier payment labels:

```jsx
Pay Supplier
```

Use it for primary payment buttons currently labeled as supplier settlement or scan-payment actions. Do not change handler names such as `handleMagbayadNgSupply` unless necessary.

- [ ] **Step 2: Replace shortfall failure copy with financing guidance**

For the shortfall modal body, use this copy:

```jsx
Your Tindahan Cash is not enough for this supplier payment. You can request financing for the shortfall of {formatPhp(shortfallPhp)} from Kaagapay Microfinance.
```

- [ ] **Step 3: Preserve scanner behavior**

Do not change:

```js
handleBarcodeScanned
handleMagbayadNgSupply
proceedSettleInvoice
appendLoan
appendReceipt
fetchLiveWalletBalances
```

Only update visible copy and button labels.

- [ ] **Step 4: Run focused scanner/mobile tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit scanner copy**

```bash
git add app/scanner.js
git commit -m "feat: polish supplier scanner copy"
```

---

### Task 7: Dark Mode, Responsive QA, And Final Verification

**Files:**
- Modify only files with concrete QA fixes discovered during this task.
- Test: full test suite and Expo runtime.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run Expo doctor**

Run:

```bash
npm run doctor
```

Expected: PASS or warnings unrelated to the UI changes. If it fails because of a known environment issue, capture the exact failure.

- [ ] **Step 3: Start Android demo**

Run:

```bash
npm run demo:android
```

Expected: Expo starts and opens the Android emulator. If another Metro server is running, reuse it or stop the stale process before starting a fresh one.

- [ ] **Step 4: Verify phone typing**

On the Android emulator, manually check:

- Onboarding store name input opens the keyboard.
- Onboarding monthly earnings uses numeric keyboard.
- Wallet address input accepts typing/paste.
- Record modal Benta/Gastos fields use numeric keyboard.
- Cash-out amount and phone fields are typable.
- Transaction details hash field accepts normal typing with autocorrect off.

- [ ] **Step 5: Verify 1080x2400 responsive layout**

On Android emulator at 1080x2400, check:

- No clipped nav labels.
- `Tindahan Cash` amount fits.
- Three quick actions wrap cleanly if needed.
- Four metric cards do not overlap.
- Proof details panel lays out vertically.
- Scanner buttons fit without text clipping.

- [ ] **Step 6: Verify dark mode**

Toggle dark mode and check:

- Cards remain readable.
- Primary actions have enough contrast.
- Expense orange is visible.
- Disabled/offline states are understandable.
- Modals do not blend into the overlay.

- [ ] **Step 7: Apply any concrete QA fixes**

If text clips or proof details overlap, apply targeted fixes such as:

```js
numberOfLines={1}
adjustsFontSizeToFit
minimumFontScale={0.72}
```

or add wrapping styles:

```js
flexWrap: "wrap"
minWidth: 0
```

Run `npm test` after every code fix.

- [ ] **Step 8: Commit QA fixes**

If files changed:

```bash
git add app/index.js app/onboarding.js app/scanner.js components/SariSyncUI.js tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
git commit -m "fix: refine choice a mobile qa"
```

If no files changed, do not create an empty commit.

---

## Self-Review

- Spec coverage: This plan covers onboarding, dashboard/Kaha, record modal, Tracker, Utang, Proof, scanner, offline visibility, dark mode, phone input, tests, and Expo verification.
- Placeholder scan: No `TBD`, `TODO`, or undefined implementation placeholders are used.
- Type consistency: New shared primitives are defined in `components/SariSyncUI.js` before imports in `app/index.js`; `ProofDetailsCard` and `QuickAction` names match across tasks.
- Scope: The plan does not rewrite Stellar, Soroban, lender credentials, loan math, Expo SDK, or deployment target.
