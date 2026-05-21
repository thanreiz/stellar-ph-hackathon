# Offline Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SariSync Ledger useful to a sari-sari store owner when Wi-Fi is off, while clearly separating local drafts from Stellar Testnet transactions.

**Architecture:** Keep offline data local in AsyncStorage as append-only drafts, then sync those drafts into the online ledger once connectivity returns. Blockchain actions stay locked while offline because Stellar/Freighter signing and Horizon submission require network access.

**Tech Stack:** Expo React Native, AsyncStorage, NetInfo, Stellar SDK, Freighter wallet account metadata, Expo FileSystem/Sharing.

**Implementation Status:** Completed on 2026-05-21. Verified with `npm test`, `npm run doctor`, and Expo iOS/Android exports.

---

## Current Offline Behavior

When Wi-Fi is off, the app can still load saved local data, show cached sales and loan records, and save new Benta entries into the pending sync queue. It cannot submit loans, repayments, invoice settlements, or transaction verification because those require Stellar Horizon and a connected wallet signing flow. When Wi-Fi returns, pending Benta records are merged into the synced ledger with idempotency by record id.

## Files

- Modify: `services/storageService.js`
  - Add typed offline draft queues for Benta, supplier invoices, and repayment intents.
- Modify: `services/dashboardService.js`
  - Add offline capability labels and counts for pending local work.
- Modify: `app/index.js`
  - Show an Offline Work panel with pending Benta, invoice drafts, and repayment drafts.
- Modify: `app/scanner.js`
  - Save scanned supplier invoices as local drafts when offline.
- Test: `tests/offlineMode.test.js`
  - Cover draft creation, sync eligibility, and offline action locks.

---

### Task 1: Offline Draft Model

- [x] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOfflineDraft } from "../services/offlineDraftService.js";

describe("offline draft model", () => {
  it("creates a local repayment draft that is not marked as submitted", () => {
    const draft = createOfflineDraft({
      type: "loan_repayment",
      amountPhpc: 5000,
      destinationPublicKey: "GAFLJJXR63KPK6UWVCXR34GL5G2F34TUX2ETCGU3SC6ASY6LRIBD3BCB",
    });

    assert.equal(draft.status, "pending_online_submission");
    assert.equal(draft.network, "STELLAR_TESTNET");
    assert.equal(draft.submittedTxHash, null);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/offlineMode.test.js`

Expected: FAIL because `services/offlineDraftService.js` does not exist.

- [x] **Step 3: Implement minimal draft creator**

Create `services/offlineDraftService.js`:

```js
export function createOfflineDraft(input) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    type: input.type,
    amountPhpc: Number(input.amountPhpc || 0),
    destinationPublicKey: input.destinationPublicKey,
    network: "STELLAR_TESTNET",
    status: "pending_online_submission",
    submittedTxHash: null,
    createdAt: new Date().toISOString(),
  };
}
```

- [x] **Step 4: Verify**

Run: `node --test tests/offlineMode.test.js`

Expected: PASS.

---

### Task 2: Offline Action Rules

- [x] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOfflineCapabilities } from "../services/offlineDraftService.js";

describe("offline capabilities", () => {
  it("allows local records but blocks Stellar transactions offline", () => {
    const capabilities = getOfflineCapabilities({ isOffline: true });

    assert.equal(capabilities.canLogBenta, true);
    assert.equal(capabilities.canDraftRepayment, true);
    assert.equal(capabilities.canSubmitStellarTransaction, false);
    assert.equal(capabilities.message, "Offline mode: local records are saved on this phone. Stellar transactions resume when Wi-Fi returns.");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/offlineMode.test.js`

Expected: FAIL because `getOfflineCapabilities` is missing.

- [x] **Step 3: Implement capability helper**

Add to `services/offlineDraftService.js`:

```js
export function getOfflineCapabilities({ isOffline }) {
  if (!isOffline) {
    return {
      canLogBenta: true,
      canDraftRepayment: true,
      canSubmitStellarTransaction: true,
      message: "Online mode: Stellar Testnet transactions can be submitted.",
    };
  }

  return {
    canLogBenta: true,
    canDraftRepayment: true,
    canSubmitStellarTransaction: false,
    message: "Offline mode: local records are saved on this phone. Stellar transactions resume when Wi-Fi returns.",
  };
}
```

- [x] **Step 4: Verify**

Run: `node --test tests/offlineMode.test.js`

Expected: PASS.

---

### Task 3: Offline Draft UI

- [x] **Step 1: Write the failing source guard**

Add to `tests/mobileDemoConfig.test.js`:

```js
it("shows offline drafts separately from submitted Stellar transactions", () => {
  const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

  assert.match(source, /Offline Work/);
  assert.match(source, /pending_online_submission/);
  assert.match(source, /Submit when online/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because the Offline Work panel does not exist.

- [x] **Step 3: Add UI panel**

In `app/index.js`, add an `OfflineWorkPanel` under the Benta card that lists:

```js
[
  "Pending Benta records",
  "Draft supplier invoices",
  "Draft loan repayments",
]
```

Use a disabled `Submit when online` button while `network.isOffline === true`.

- [x] **Step 4: Verify**

Run: `npm test`

Expected: PASS.

---

### Task 4: Sync Back Online

- [x] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDraftsReadyForSubmission } from "../services/offlineDraftService.js";

describe("offline draft sync", () => {
  it("returns only pending drafts when online", () => {
    const drafts = [
      { id: "1", status: "pending_online_submission" },
      { id: "2", status: "submitted", submittedTxHash: "abc" },
    ];

    assert.deepEqual(getDraftsReadyForSubmission(drafts, { isOffline: false }), [drafts[0]]);
    assert.deepEqual(getDraftsReadyForSubmission(drafts, { isOffline: true }), []);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/offlineMode.test.js`

Expected: FAIL because `getDraftsReadyForSubmission` is missing.

- [x] **Step 3: Implement selector**

Add to `services/offlineDraftService.js`:

```js
export function getDraftsReadyForSubmission(drafts, { isOffline }) {
  if (isOffline) return [];
  return drafts.filter((draft) => draft.status === "pending_online_submission");
}
```

- [x] **Step 4: Verify**

Run: `npm test`

Expected: all tests pass.
