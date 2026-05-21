# Division 1 UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Choice A “Warm Companion” UI direction across SariSync while preserving all existing wallet, offline, benta, expense, loan, repayment, receipt, and document functionality.

**Architecture:** Keep business logic in the existing service modules and refactor presentation into a small shared React Native UI component file. `app/index.js` remains the app orchestration layer, but repeated UI patterns such as bento metrics, icon tabs, pill buttons, proof hints, and cards move into reusable primitives so every screen shares the same visual language.

**Tech Stack:** Expo SDK 52, React Native 0.76.9, Expo Router 4, React 18.3.1, AsyncStorage, existing Node test suite with source-level UI assertions.

---

## File Structure

- Create: `components/SariSyncUI.js`
  - Shared UI primitives for Choice A: `AppIcon`, `WarmCard`, `PillButton`, `BentoMetricCard`, `IconNav`, `ProofHint`, `SectionHeader`.
- Modify: `context/ThemeContext.js`
  - Add explicit Choice A tokens: `expense`, `surfaceLow`, `surfaceLowest`, `success`, `proofBackground`, `buttonTextOnPrimary`.
- Modify: `app/index.js`
  - Use icon navigation, big metric cards, friendlier copy, hidden proof details, and shared primitives across Wallet Gate, Kaha, Tracker, Utang, and Proof.
- Modify: `app/_layout.js`
  - Rename visible stack title for scanner to a friendly label.
- Modify: `tests/mobileDemoConfig.test.js`
  - Add source-level assertions for icon tabs, big metrics, hidden proof copy, friendly labels, native inputs, and reduced blockchain terminology.
- Modify: `tests/webCompatibility.test.js`
  - Keep transaction hash coverage but allow it only in proof/details paths.

---

### Task 1: Add UI Polish Guard Tests

**Files:**
- Modify: `tests/mobileDemoConfig.test.js`
- Modify: `tests/webCompatibility.test.js`

- [ ] **Step 1: Add failing source-level tests for Choice A navigation, metrics, and copy**

Append these tests inside `describe("mobile demo configuration", () => { ... })` in `tests/mobileDemoConfig.test.js`:

```js
  it("uses Choice A icon navigation labels for the main app sections", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/SariSyncUI.js", import.meta.url), "utf8");

    assert.match(source, /label:\s*"Kaha"/);
    assert.match(source, /label:\s*"Tracker"/);
    assert.match(source, /label:\s*"Utang"/);
    assert.match(source, /label:\s*"Proof"/);
    assert.match(source, /icon:\s*"wallet"/);
    assert.match(source, /icon:\s*"trend"/);
    assert.match(source, /icon:\s*"loan"/);
    assert.match(source, /icon:\s*"proof"/);
    assert.match(ui, /function IconNav/);
    assert.match(ui, /function AppIcon/);
  });

  it("uses big Choice A bento metric cards for the core dashboard numbers", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/SariSyncUI.js", import.meta.url), "utf8");

    assert.match(source, /Benta Ngayon/);
    assert.match(source, /Mga Gastos/);
    assert.match(source, /Tiwala Score/);
    assert.match(source, /Limit sa Utang/);
    assert.match(source, /BentoMetricCard/);
    assert.match(ui, /fontSize:\s*42/);
    assert.match(ui, /expense/);
  });

  it("keeps blockchain proof hidden behind friendly proof details", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /Proof hidden/);
    assert.match(source, /Tap to view transaction details/);
    assert.match(source, /Gumawa ng Dokumento/);
    assert.match(source, /Proof center/);
  });

  it("uses friendly finance copy instead of technical blockchain copy by default", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /Konek Wallet/);
    assert.match(source, /I-konek ang wallet/);
    assert.match(source, /records are secured in the background|records sa background/);
    assert.doesNotMatch(source, /I-Validate ang Stellar Invoice/);
    assert.doesNotMatch(source, /I-paste ang transaction hash para i-verify sa Horizon Testnet/);
  });
```

Update the existing expense-source test labels in `tests/mobileDemoConfig.test.js` so it accepts the new friendly label:

```js
    assert.match(source, /Log expense|I-record ang Gastos/);
    assert.match(source, /Expense source|Pinambayad/);
```

- [ ] **Step 2: Move transaction-hash strictness to proof-only expectation**

In `tests/webCompatibility.test.js`, keep the existing transaction hash tests and add this test:

```js
  it("keeps technical transaction hash language inside proof or validation details", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /Transaction details/);
    assert.match(source, /Sample Testnet TX/);
    assert.match(source, /validateHash/);
  });
```

- [ ] **Step 3: Run tests to verify they fail for the missing UI primitives and copy**

Run:

```bash
npm test
```

Expected: FAIL. The failure should mention missing `components/SariSyncUI.js`, missing `IconNav`, missing object-based `NAV_ITEMS`, missing `BentoMetricCard`, or old technical copy.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
git commit -m "test: define division 1 ui polish expectations"
```

---

### Task 2: Add Choice A UI Primitives

**Files:**
- Create: `components/SariSyncUI.js`
- Modify: `context/ThemeContext.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Create shared UI component file**

Create `components/SariSyncUI.js` with this implementation:

```js
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const ICONS = {
  wallet: "₱",
  trend: "↗",
  loan: "¤",
  proof: "✓",
  moon: "☾",
  sun: "☀",
  key: "🔑",
};

export function AppIcon({ name, active = false, size = 24 }) {
  const { colors, theme } = useTheme();
  const foreground = active
    ? theme === "light" ? "#FFFFFF" : "#111411"
    : colors.primary;

  return (
    <View
      style={[
        styles.iconBox,
        {
          width: size + 12,
          height: size + 12,
          borderRadius: Math.round((size + 12) / 3),
          backgroundColor: active ? "rgba(255,255,255,0.2)" : colors.primaryContainer,
        },
      ]}
    >
      <Text style={[styles.iconText, { color: foreground, fontSize: Math.max(15, size - 7) }]}>
        {ICONS[name] || "•"}
      </Text>
    </View>
  );
}

export function WarmCard({ children, style }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.warmCard, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ eyebrow, title, right }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text> : null}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function PillButton({ label, onPress, variant = "primary", disabled = false, style }) {
  const { colors, theme } = useTheme();
  const isPrimary = variant === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillButton,
        {
          backgroundColor: isPrimary ? colors.primary : colors.cardSecondary,
          borderColor: isPrimary ? colors.primary : colors.border,
          opacity: disabled ? 0.58 : pressed ? 0.86 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.pillButtonText,
          { color: isPrimary ? theme === "light" ? "#FFFFFF" : "#111411" : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BentoMetricCard({ label, value, tone = "default" }) {
  const { colors } = useTheme();
  const metricColor =
    tone === "positive" ? colors.primary :
    tone === "expense" ? colors.expense :
    colors.text;

  return (
    <View style={[styles.bentoMetric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.bentoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.bentoValue, { color: metricColor }]}>{value}</Text>
    </View>
  );
}

export function IconNav({ items, activeId, onSelect }) {
  const { colors, theme } = useTheme();

  return (
    <View style={[styles.iconNav, { backgroundColor: colors.cardSecondary }]}>
      {items.map((item) => {
        const active = activeId === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => onSelect(item.id)}
            style={[
              styles.iconNavItem,
              active && { backgroundColor: colors.primary },
            ]}
          >
            <AppIcon name={item.icon} active={active} size={24} />
            <Text
              style={[
                styles.iconNavLabel,
                { color: active ? theme === "light" ? "#FFFFFF" : "#111411" : colors.textSecondary },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProofHint({ onPress, label = "Proof hidden · Tap to view transaction details" }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.proofHint, { backgroundColor: colors.proofBackground }]}
    >
      <Text style={[styles.proofHintText, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontWeight: "900",
  },
  warmCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
  },
  pillButton: {
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  pillButtonText: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  bentoMetric: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    minHeight: 128,
    justifyContent: "space-between",
  },
  bentoLabel: {
    fontSize: 13,
    fontWeight: "900",
  },
  bentoValue: {
    fontSize: 42,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: 0,
  },
  iconNav: {
    flexDirection: "row",
    borderRadius: 24,
    padding: 8,
    gap: 8,
  },
  iconNavItem: {
    flex: 1,
    minHeight: 62,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  iconNavLabel: {
    fontSize: 11,
    fontWeight: "900",
  },
  proofHint: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  proofHintText: {
    fontSize: 12,
    fontWeight: "900",
  },
});
```

- [ ] **Step 2: Add missing theme tokens**

In `context/ThemeContext.js`, add these keys to `LightColors`:

```js
  surfaceLow: "#F5F4ED",
  surfaceLowest: "#FFFFFF",
  expense: "#FF9500",
  success: "#0D6F37",
  proofBackground: "#F0F7EF",
  buttonTextOnPrimary: "#FFFFFF",
```

Add these keys to `DarkColors`:

```js
  surfaceLow: "#1A1C18",
  surfaceLowest: "#0C0F0C",
  expense: "#FFB454",
  success: "#8BE59A",
  proofBackground: "#1A261B",
  buttonTextOnPrimary: "#111411",
```

- [ ] **Step 3: Run the focused test and verify UI primitive assertions pass**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: FAIL only for app screen wiring that has not been updated yet. The `components/SariSyncUI.js`, `IconNav`, `AppIcon`, and `fontSize: 42` expectations should pass.

- [ ] **Step 4: Commit UI primitives**

```bash
git add components/SariSyncUI.js context/ThemeContext.js
git commit -m "feat: add warm companion ui primitives"
```

---

### Task 3: Convert Navigation To Icon Tabs

**Files:**
- Modify: `app/index.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Import shared navigation primitives**

In `app/index.js`, add this import after existing local imports:

```js
import {
  AppIcon,
  BentoMetricCard,
  IconNav,
  PillButton,
  ProofHint,
  SectionHeader,
  WarmCard,
} from "../components/SariSyncUI";
```

- [ ] **Step 2: Replace string-only nav constants**

Replace:

```js
const NAV_ITEMS = ["Profile", "Tracker", "Debt", "Receipts"];
```

with:

```js
const NAV_ITEMS = [
  { id: "Kaha", label: "Kaha", icon: "wallet" },
  { id: "Tracker", label: "Tracker", icon: "trend" },
  { id: "Utang", label: "Utang", icon: "loan" },
  { id: "Proof", label: "Proof", icon: "proof" },
];
```

Change the active section state from:

```js
const [activeSection, setActiveSection] = useState("Profile");
```

to:

```js
const [activeSection, setActiveSection] = useState("Kaha");
```

- [ ] **Step 3: Replace text nav grid with `IconNav`**

Replace the `<View style={styles.navGrid}>...</View>` block with:

```jsx
      <IconNav
        items={NAV_ITEMS}
        activeId={activeSection}
        onSelect={setActiveSection}
      />
```

- [ ] **Step 4: Update panel conditional rendering**

Replace the section checks with:

```jsx
      {activeSection === "Kaha" ? (
        <ProfilePanel stage={stage} stageMeta={stageMeta} tiwalaScore={tiwalaScore} loanLimit={loanLimit} />
      ) : null}
      {activeSection === "Tracker" ? (
        <TrackerPanel
          snapshot={businessSnapshot}
          loans={loans}
          loanLimit={loanLimit}
          stage={stage}
          stageMeta={stageMeta}
          controlState={controlState}
          onReceiveLoan={handleReceiveLoan}
          onOpenScanner={() => router.push("/scanner")}
          statusMessage={statusMessage}
        />
      ) : null}
      {activeSection === "Utang" ? (
        <DebtPanel
          loans={loans}
          controlState={controlState}
          onRepayLoan={handleRepayLoan}
          statusMessage={statusMessage}
        />
      ) : null}
      {activeSection === "Proof" ? (
        <ReceiptsPanel
          receipts={receipts}
          loans={loans}
          controlState={controlState}
          onCreateDocument={handleCreateDocument}
          documentStatusMessage={documentStatusMessage}
        />
      ) : null}
```

- [ ] **Step 5: Run focused test**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: icon nav label and icon assertions pass.

- [ ] **Step 6: Commit icon navigation**

```bash
git add app/index.js tests/mobileDemoConfig.test.js
git commit -m "feat: add icon navigation for main app sections"
```

---

### Task 4: Apply Big Bento Metrics To Kaha Dashboard

**Files:**
- Modify: `app/index.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Replace the top metric grid with Choice A bento metrics**

In `app/index.js`, replace the current top metrics block:

```jsx
      <View style={styles.metricsGrid}>
        <MetricCard label="Sales today" value={formatPhp(salesToday)} color="#34C759" />
        <MetricCard label="Benta" value={formatPhp(totalSyncedBenta)} color="#34C759" />
        <MetricCard label="Expenses" value={formatPhp(expenseTotal)} color="#FF9500" />
        <MetricCard label="Tiwala Score" value={String(tiwalaScore)} />
        <MetricCard label="Loan Limit" value={formatPhp(loanLimit)} />
      </View>
```

with:

```jsx
      <View style={styles.metricsGrid}>
        <BentoMetricCard label="Benta Ngayon" value={String(salesToday)} tone="positive" />
        <BentoMetricCard label="Kabuuang Benta" value={String(totalSyncedBenta)} tone="positive" />
        <BentoMetricCard label="Mga Gastos" value={String(expenseTotal)} tone="expense" />
        <BentoMetricCard label="Tiwala Score" value={String(tiwalaScore)} />
        <BentoMetricCard label="Limit sa Utang" value={String(loanLimit)} />
      </View>
```

Use raw large numbers in these hero cards. Keep `formatPhp(...)` in rows, receipts, debt, and proof details where currency precision matters.

- [ ] **Step 2: Add recent activity and proof hint below metric cards**

Add this block after the metric grid:

```jsx
      <WarmCard>
        <SectionHeader eyebrow="Recent activity" title="Galaw ng tindahan" />
        <InfoRow label="Benta" value={formatPhp(salesToday)} />
        <InfoRow label="Gastos" value={formatPhp(expenseTotal)} />
        <ProofHint onPress={() => setStatusMessage("Transaction details are available in Proof.")} />
      </WarmCard>
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: big metric and proof hint assertions pass. If a test still fails, the failing regex should point to a copy mismatch.

- [ ] **Step 4: Commit dashboard metrics**

```bash
git add app/index.js
git commit -m "feat: polish kaha dashboard metrics"
```

---

### Task 5: Polish Wallet Gate And Input Copy

**Files:**
- Modify: `app/index.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Update wallet gate copy to friendly default language**

In `WalletConnectionGate`, change visible copy to:

```jsx
        <Text style={[styles.bodyText, { color: colors.textSecondary, textAlign: "center", fontSize: 15, paddingHorizontal: 8 }]}>
          I-konek ang wallet para ma-secure ang records sa background bago gamitin ang Kaha.
        </Text>
```

Change the input label from:

```jsx
<Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "700", marginLeft: 4 }}>Stellar Public Key</Text>
```

to:

```jsx
<Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "700", marginLeft: 4 }}>Wallet account</Text>
```

Change the input placeholder from:

```jsx
placeholder="I-paste ang Stellar G... public key"
```

to:

```jsx
placeholder="I-paste ang wallet public key"
```

- [ ] **Step 2: Keep input native-keyboard safe**

Confirm wallet input keeps:

```jsx
autoCapitalize="characters"
autoCorrect={false}
```

Confirm there is no `showSoftInputOnFocus={false}` anywhere in `app/index.js`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: friendly finance copy test passes for wallet copy and native input test remains green.

- [ ] **Step 4: Commit wallet gate polish**

```bash
git add app/index.js
git commit -m "feat: polish wallet gate copy"
```

---

### Task 6: Polish Tracker And Utang Screens

**Files:**
- Modify: `app/index.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Update Tracker technical copy**

In `TrackerPanel`, replace:

```jsx
<Text style={[styles.bodyText, { color: colors.textSecondary }]}>Tumatanggap ng pondo mula sa mga partner na microfinance companies sa Stellar Testnet.</Text>
```

with:

```jsx
<Text style={[styles.bodyText, { color: colors.textSecondary }]}>
  Tumatanggap ng pondo mula sa partner na microfinance companies. Proof details are available after approval.
</Text>
```

Change loan offer action text from:

```jsx
<Text style={[styles.loanButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Humingi</Text>
```

to:

```jsx
<Text style={[styles.loanButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Request Loan</Text>
```

- [ ] **Step 2: Update loan modal proof wording**

In the loan confirmation modal, replace:

```jsx
Ito ay isang Stellar Testnet transaction. Ang PHPC ay ililipat sa iyong store wallet.
```

with:

```jsx
Kapag tinanggap, mase-secure ang loan record sa background. Makikita ang proof pagkatapos.
```

- [ ] **Step 3: Update Debt panel labels to Utang**

In `DebtPanel`, change:

```jsx
<Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Debt</Text>
<Text style={[styles.stageName, { color: colors.text }]}>Business debt tracker</Text>
```

to:

```jsx
<Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Utang</Text>
<Text style={[styles.stageName, { color: colors.text }]}>Loan at bayad</Text>
```

Change empty copy from:

```jsx
Wala kang aktibong utang. Humingi ng loan sa Tracker tab.
```

to:

```jsx
Wala kang aktibong utang.
```

- [ ] **Step 4: Move invoice/hash validation under transaction details language**

Change:

```jsx
<Text style={[styles.cardLabel, { marginTop: 20, marginBottom: 8, color: colors.textSecondary }]}>I-Validate ang Stellar Invoice</Text>
<Text style={[styles.bodyText, { color: colors.textSecondary }]}>I-paste ang transaction hash para i-verify sa Horizon Testnet.</Text>
```

to:

```jsx
<Text style={[styles.cardLabel, { marginTop: 20, marginBottom: 8, color: colors.textSecondary }]}>Transaction details</Text>
<Text style={[styles.bodyText, { color: colors.textSecondary }]}>Optional proof checker for advanced users.</Text>
```

Keep the actual `validateHash` input and `Sample Testnet TX` text so demo verification remains available.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
```

Expected: friendly copy test passes; web compatibility proof/hash test remains green.

- [ ] **Step 6: Commit Tracker and Utang polish**

```bash
git add app/index.js tests/mobileDemoConfig.test.js tests/webCompatibility.test.js
git commit -m "feat: polish tracker and utang copy"
```

---

### Task 7: Polish Proof Center And Document Copy

**Files:**
- Modify: `app/index.js`
- Modify: `app/_layout.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Rename Receipts panel default labels**

In `ReceiptsPanel`, change:

```jsx
<Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Receipts</Text>
<Text style={[styles.stageName, { color: colors.text }]}>Transaction proof</Text>
```

to:

```jsx
<Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Proof center</Text>
<Text style={[styles.stageName, { color: colors.text }]}>Receipts at documents</Text>
```

- [ ] **Step 2: Rename document action**

Change:

```jsx
<Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>📄 Create Document</Text>
```

to:

```jsx
<Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Gumawa ng Dokumento</Text>
```

- [ ] **Step 3: Add proof hint to Proof center**

Inside `ReceiptsPanel`, before the document button, add:

```jsx
      <ProofHint onPress={() => {}} />
```

If an inert pressable causes lint or accessibility friction later, replace it with a `View` using the same `ProofHint` styling in a future task. For this Expo app, keeping it tappable and harmless is acceptable.

- [ ] **Step 4: Rename scanner title**

In `app/_layout.js`, change:

```jsx
<Stack.Screen name="scanner" options={{ title: "Invoice Scanner" }} />
```

to:

```jsx
<Stack.Screen name="scanner" options={{ title: "Scan Invoice" }} />
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/mobileDemoConfig.test.js
```

Expected: proof center, document copy, hidden proof details, and existing document sharing tests pass.

- [ ] **Step 6: Commit Proof center polish**

```bash
git add app/index.js app/_layout.js
git commit -m "feat: polish proof center"
```

---

### Task 8: Dark Mode And Responsive QA

**Files:**
- Modify: `app/index.js`
- Modify: `components/SariSyncUI.js`
- Test: `tests/mobileDemoConfig.test.js`

- [ ] **Step 1: Check dark mode touch targets and text sizing in code**

Confirm these values exist:

```js
minHeight: 54
fontSize: 42
letterSpacing: 0
borderRadius: 999
```

in `components/SariSyncUI.js`.

Confirm all `TextInput` instances in `app/index.js` have:

```jsx
style={[styles.input, ...]}
```

and no input uses a height below 48.

- [ ] **Step 2: Add final source-level acceptance test**

Append this test to `tests/mobileDemoConfig.test.js`:

```js
  it("keeps Division 1 UI touch targets and text sizing demo-safe", () => {
    const ui = readFileSync(new URL("../components/SariSyncUI.js", import.meta.url), "utf8");
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(ui, /minHeight:\s*54/);
    assert.match(ui, /fontSize:\s*42/);
    assert.match(ui, /borderRadius:\s*999/);
    assert.match(ui, /letterSpacing:\s*0/);
    assert.doesNotMatch(source, /showSoftInputOnFocus=\{false\}/);
  });
```

- [ ] **Step 3: Run full tests and doctor**

Run:

```bash
npm test
npm run doctor
```

Expected:

```text
tests pass
17/17 checks passed. No issues detected!
```

- [ ] **Step 4: Run Android emulator visual QA**

Start the SDK 52 app:

```bash
npm run android
```

If Expo CLI fails to launch the app through the emulator `monkey` command, keep Metro running and open manually:

```bash
"$HOME/Library/Android/sdk/platform-tools/adb" -s emulator-5554 shell am start -a android.intent.action.VIEW -d "exp://192.168.254.101:8081"
```

Capture a screenshot:

```bash
"$HOME/Library/Android/sdk/platform-tools/adb" -s emulator-5554 exec-out screencap -p > /tmp/sarisync-division-1.png
file /tmp/sarisync-division-1.png
```

Expected:

```text
PNG image data, 1080 x 2400
```

Manually verify:

- Wallet gate matches Choice A warmth.
- Kaha, Tracker, Utang, Proof use icons.
- Numbers are large and readable.
- Text does not overlap.
- Native keyboard appears for wallet, Benta, expenses, and proof/hash inputs.
- Dark mode keeps contrast and layout.

- [ ] **Step 5: Commit QA finishing pass**

```bash
git add app/index.js components/SariSyncUI.js context/ThemeContext.js tests/mobileDemoConfig.test.js
git commit -m "test: verify division 1 mobile polish"
```

---

## Self-Review Checklist

- Spec coverage: This plan covers approved Choice A, icon navigation, big metrics, friendly language, hidden proof details, Wallet Gate, Kaha, Tracker, Utang, Proof, Offline Mode, Dark Mode, inputs, tests, and Android SDK 52 verification.
- Placeholder scan: No task uses unspecified implementation steps; each code-changing step includes exact code or exact replacement text.
- Type consistency: `NAV_ITEMS` uses `id`, `label`, and `icon`; `IconNav` consumes those exact keys; `BentoMetricCard` uses `label`, `value`, and `tone`; theme tokens are named consistently across tasks.
- Scope check: PHP/XLM conversion, Soroban contracts, and transaction-layer rewrites are excluded as Division 1 non-goals.
