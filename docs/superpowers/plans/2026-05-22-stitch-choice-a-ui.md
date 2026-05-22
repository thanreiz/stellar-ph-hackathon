# Stitch Choice A UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recode the SariSync Expo app pages to match the approved Google Stitch Choice A screens for Kaha, Tracker, Utang, Proof, offline state, and record modal.

**Architecture:** Keep business logic in the existing services and app state, but move visual consistency into shared React Native primitives in `components/SariSyncUI.js` and theme tokens in `context/ThemeContext.js`. Use `app/index.js` for screen composition only, preserving wallet connection, offline mode, sales logging, expense logging, loans, repayments, receipts, and document creation.

**Tech Stack:** Expo SDK 52, React Native 0.76, expo-router, Node test runner, Google Stitch design system `Pera at Tiwala`.

---

## File Structure

- Modify `components/SariSyncUI.js`: shared Stitch-inspired primitives, icon treatment, metric cards, status banners, nav, rows, modal controls.
- Modify `context/ThemeContext.js`: light and dark Choice A tokens for paper surfaces, green trust color, orange expense color, dark charcoal-green mode.
- Modify `app/index.js`: compose Kaha, Tracker, Utang, Proof, offline state, and record modal using shared primitives and approved copy.
- Modify `tests/mobileDemoConfig.test.js`: source guard tests for Stitch copy, icon labels, modal labels, hidden proof, and no blockchain-heavy default copy.
- Modify `tests/dashboardService.test.js` only if a UI-derived display helper is extracted from `app/index.js`; otherwise leave it unchanged.

## Approved Stitch Screens

- Konek Wallet: existing Stitch screen `a508d9989234434699997e4cb6bc141e`
- Kaha Dashboard: existing Stitch screen `c4d02c57d27d427185140abdebb0cce8`
- Tracker: Stitch screen `00b6920af54a43ba964e453124ebac71`
- Utang: Stitch screen `069ded6741434dc3ac6388c8c9ae1f9f`
- Proof: Stitch screen `3f0308f47c904075a2549d9e817de687`
- Record Modal: Stitch screen `126310fc45d34cc481f7dbb431330e65`
- Offline Kaha: Stitch screen `d581338806a941dca519370a193c153e`
- Invoice Scanner and Detail: existing Stitch screens `dcafb6dad8ac4b269926e097dd718eb0`, `bd936750ba444dd8bdaccc2a074d36e8`

---

### Task 1: Guard The Approved Stitch Surface

**Files:**
- Modify: `tests/mobileDemoConfig.test.js`
- Run: `npm test -- tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Write failing source guard tests**

Add assertions that prove the app source contains the approved Stitch surface:

```js
it("uses Stitch Choice A section subtitles and offline banner copy", () => {
  const source = readProjectFile("app/index.js");

  assertIncludes(source, "Araw-araw na galaw ng tindahan");
  assertIncludes(source, "Manage loans and bayad");
  assertIncludes(source, "Receipts and records");
  assertIncludes(source, "Saved on this phone");
  assertIncludes(source, "Online mode");
  assertIncludes(source, "Offline mode");
});
```

Add assertions for the modal and proof center:

```js
it("uses the approved Stitch record modal controls", () => {
  const source = readProjectFile("app/index.js");

  assertIncludes(source, "Record Benta");
  assertIncludes(source, "Record Gastos");
  assertIncludes(source, "What happened?");
  assertIncludes(source, "Save Benta");
  assertIncludes(source, "Save Gastos");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/mobileDemoConfig.test.js`

Expected: FAIL on at least one new Stitch-specific string that is not implemented yet.

- [ ] **Step 3: Keep the failing test output for the implementation pass**

Do not edit production code until the new assertions fail for the expected missing-copy reason.

---

### Task 2: Implement Shared Stitch Tokens And Primitives

**Files:**
- Modify: `context/ThemeContext.js`
- Modify: `components/SariSyncUI.js`
- Run: `npm test -- tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Add Choice A theme tokens**

Add or update tokens for both modes:

```js
surfacePaper: "#fffaf0",
surfaceMuted: "#f5eedf",
primary: "#136348",
primarySoft: "#dcefe6",
expense: "#d97706",
offline: "#d94b4b",
success: "#18794e",
text: "#18231f",
textSecondary: "#617067",
```

Dark mode must use charcoal-green surfaces and mint action color:

```js
background: "#071410",
surfacePaper: "#10231d",
surfaceMuted: "#183128",
primary: "#85d8ae",
expense: "#f5a142",
text: "#f4f1e8",
textSecondary: "#b8c8bc",
```

- [ ] **Step 2: Add or refine primitives**

Ensure `components/SariSyncUI.js` exports these primitives:

```js
AppIcon
WarmCard
SectionHeader
PillButton
BentoMetricCard
IconNav
ProofHint
QuickAction
StatusBanner
InfoRow
SegmentedControl
```

Use `Pressable` for tappable controls, minimum height `48`, and `adjustsFontSizeToFit` on large metric numbers.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- tests/mobileDemoConfig.test.js`

Expected: Tests may still fail until `app/index.js` uses the new strings and primitives.

---

### Task 3: Recompose Kaha And Offline Kaha

**Files:**
- Modify: `app/index.js`
- Run: `npm test -- tests/mobileDemoConfig.test.js tests/offlineMode.test.js tests/dashboardService.test.js`

- [ ] **Step 1: Implement Kaha screen composition**

Use the approved layout:

```text
Top bar: Kaha + theme toggle
Brand header: SariSync + plain assurance copy
Metrics: Benta 2500, Gastos 777, Tiwala Score 32, Limit 0
Status: Online mode or Offline mode
Actions: Record Benta, Record Gastos, Scan Invoice
Proof hint: Proof hidden · Tap to view transaction details
Bottom nav: Kaha, Tracker, Utang, Proof
```

Preserve existing computed values; the numbers above are visual targets, not hardcoded business data.

- [ ] **Step 2: Implement offline Kaha state**

When offline, display:

```text
Offline mode
Saved on this phone
Online ledger hidden until internet returns
```

Keep local Benta and Gastos logging available, and keep online transaction actions disabled.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/mobileDemoConfig.test.js tests/offlineMode.test.js tests/dashboardService.test.js`

Expected: PASS for source guards and offline behavior.

---

### Task 4: Recompose Tracker, Utang, Proof, And Record Modal

**Files:**
- Modify: `app/index.js`
- Run: `npm test -- tests/mobileDemoConfig.test.js tests/tindahanCash.test.js tests/invoiceService.test.js`

- [ ] **Step 1: Implement Tracker**

Match the Stitch Tracker screen:

```text
Subtitle: Araw-araw na galaw ng tindahan
Metric cards: Gastos, Benta, Puhunan, Utang
Loan cards: Kaagapay Microfinance, Tindahan Capital Co.
Primary loan action: Humingi
Proof details hidden by default
```

- [ ] **Step 2: Implement Utang**

Match the Stitch Utang screen:

```text
Subtitle: Manage loans and bayad
Cards: Active Utang, Loan Limit, Draft Bayad
Empty state: No active loans
Repayment drafts show pending local work
Action label: Bayad
```

- [ ] **Step 3: Implement Proof**

Match the Stitch Proof screen:

```text
Subtitle: Receipts and records
Button: Gumawa ng Dokumento
Empty message after document action only: No recorded transactions.
Collapsed row: Proof hidden · Tap to view transaction details
Expanded card title: Transaction details
```

- [ ] **Step 4: Implement Record Modal**

Match the Stitch modal:

```text
Title: Record Benta or Record Gastos
Prompt: What happened?
Segmented control: Benta, Gastos
Input label: Halaga
Payment label for expenses: Pinambayad
Actions: Save Benta, Save Gastos, Close
```

Keep money inputs using `keyboardType="number-pad"` and do not add `showSoftInputOnFocus={false}`.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/mobileDemoConfig.test.js tests/tindahanCash.test.js tests/invoiceService.test.js`

Expected: PASS for UI copy guards and business behavior.

---

### Task 5: Verify Full App And Mobile Fidelity

**Files:**
- No planned source edits unless verification finds visual drift.
- Run: `npm test`
- Run: `npm run doctor`
- Run Android emulator or reuse existing Expo session at `http://localhost:8082`.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run Expo doctor**

Run: `npm run doctor`

Expected: no new failures. Existing Expo CNG/native-folder warning may remain if unchanged from baseline.

- [ ] **Step 3: Capture mobile screenshots**

Use Android emulator at 1080 x 2400 and capture:

```bash
adb exec-out screencap -p > /tmp/sarisync-kaha.png
```

Also capture Tracker, Utang, Proof, record modal, dark mode, and offline mode.

- [ ] **Step 4: Compare to Stitch**

Open the Stitch screenshots and emulator screenshots with `view_image`. Verify at least these points:

```text
1. Kaha/Tracker/Utang/Proof icon nav uses correct labels and active states.
2. Metric numbers are large and readable with no clipping.
3. Proof details are hidden by default.
4. Offline mode shows a red banner and keeps local records useful.
5. Light and dark modes use the same hierarchy with intentional colors.
6. Inputs remain tappable and use native keyboard settings.
```

- [ ] **Step 5: Fix visual drift found during comparison**

Only make scoped UI fixes tied to screenshot mismatches, then rerun `npm test` and recapture the changed screen.

---

## Self-Review

- Spec coverage: Wallet, Kaha, Tracker, Utang, Proof, Record Modal, Offline Kaha, mobile keyboard, hidden proof, light/dark mode, and existing functionality are covered by tasks.
- Placeholder scan: The plan avoids deferred placeholders and names concrete files, strings, commands, and expected outputs.
- Type consistency: Shared primitives are named consistently across tasks and match the existing React Native project structure.
