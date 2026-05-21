import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOfflineDraft,
  getDraftsReadyForSubmission,
  getOfflineCapabilities,
  summarizeOfflineWork,
} from "../services/offlineDraftService.js";

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

describe("offline capabilities", () => {
  it("allows local records but blocks Stellar transactions offline", () => {
    const capabilities = getOfflineCapabilities({ isOffline: true });

    assert.equal(capabilities.canLogBenta, true);
    assert.equal(capabilities.canDraftRepayment, true);
    assert.equal(capabilities.canDraftSupplierInvoice, true);
    assert.equal(capabilities.canSubmitStellarTransaction, false);
    assert.equal(
      capabilities.message,
      "Offline mode: local records are saved on this phone. Stellar transactions resume when Wi-Fi returns.",
    );
  });
});

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

describe("offline work summary", () => {
  it("counts pending benta, supplier invoice drafts, and repayment drafts", () => {
    const summary = summarizeOfflineWork({
      pendingBenta: [{ id: "sale_1" }, { id: "sale_2" }],
      drafts: [
        { id: "invoice_1", type: "supplier_invoice", status: "pending_online_submission" },
        { id: "repay_1", type: "loan_repayment", status: "pending_online_submission" },
        { id: "repay_2", type: "loan_repayment", status: "submitted" },
      ],
    });

    assert.deepEqual(summary, {
      pendingBentaCount: 2,
      supplierInvoiceDraftCount: 1,
      repaymentDraftCount: 1,
      totalPendingCount: 4,
    });
  });
});
