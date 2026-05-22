import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOfflineDraft,
  getDraftsReadyForSubmission,
  getOfflineCapabilities,
  summarizeOfflineWork,
  syncOfflineDrafts,
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

describe("syncOfflineDrafts service function", () => {
  it("processes a pending loan_repayment draft successfully", async () => {
    const drafts = [
      {
        id: "draft_repay_1",
        type: "loan_repayment",
        amountPhpc: 1500,
        destinationPublicKey: "GAFLJJXR...",
        lenderName: "MicroSari Lender",
        loanId: "loan_xyz",
        status: "pending_online_submission",
      },
    ];

    let repayCalled = false;
    let updateStatusCalled = false;
    let getBalanceCalled = false;
    let setBalanceCalled = false;

    const repayLoanFn = async (params) => {
      repayCalled = true;
      assert.equal(params.lenderPublicKey, "GAFLJJXR...");
      assert.equal(params.amountPhpc, 1500);
      assert.ok(params.memo.includes("Repay MicroSari Lend"));
      return { success: true, transactionHash: "hash_repay_123" };
    };

    const updateLoanStatusFn = async (loanId, status) => {
      updateStatusCalled = true;
      assert.equal(loanId, "loan_xyz");
      assert.equal(status, "paid");
    };

    const getOutstandingLoanBalanceFn = async () => {
      getBalanceCalled = true;
      return 5000;
    };

    const setOutstandingLoanBalanceFn = async (newBalance) => {
      setBalanceCalled = true;
      assert.equal(newBalance, 3500); // 5000 - 1500
    };

    const result = await syncOfflineDrafts({
      drafts,
      repayLoanFn,
      updateLoanStatusFn,
      getOutstandingLoanBalanceFn,
      setOutstandingLoanBalanceFn,
    });

    assert.equal(result.successCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.updatedDrafts[0].status, "submitted");
    assert.equal(result.updatedDrafts[0].submittedTxHash, "hash_repay_123");

    assert.ok(repayCalled);
    assert.ok(updateStatusCalled);
    assert.ok(getBalanceCalled);
    assert.ok(setBalanceCalled);
  });

  it("processes a pending supplier_invoice draft successfully", async () => {
    const drafts = [
      {
        id: "draft_invoice_1",
        type: "supplier_invoice",
        amountPhpc: 2000,
        amountUsdc: 40,
        supplierPubkey: "GASUPPLIER...",
        status: "pending_online_submission",
      },
    ];

    let submitInvoiceCalled = false;
    let appendReceiptCalled = false;

    const submitInvoiceFn = async (params) => {
      submitInvoiceCalled = true;
      assert.equal(params.supplierPubkey, "GASUPPLIER...");
      assert.equal(params.amountUsdc, 40);
      assert.equal(params.sendMaxPhpc, "2000");
      return { success: true, transactionHash: "hash_invoice_abc" };
    };

    const appendReceiptFn = async (receipt) => {
      appendReceiptCalled = true;
      assert.equal(receipt.type, "SUPPLIER_INVOICE");
      assert.equal(receipt.amountUsdc, 40);
      assert.equal(receipt.supplierPubkey, "GASUPPLIER...");
      assert.equal(receipt.txHash, "hash_invoice_abc");
    };

    const result = await syncOfflineDrafts({
      drafts,
      submitInvoiceFn,
      appendReceiptFn,
    });

    assert.equal(result.successCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.updatedDrafts[0].status, "submitted");
    assert.equal(result.updatedDrafts[0].submittedTxHash, "hash_invoice_abc");

    assert.ok(submitInvoiceCalled);
    assert.ok(appendReceiptCalled);
  });

  it("gracefully handles failure in submission without crashing the loop", async () => {
    const drafts = [
      {
        id: "draft_fail",
        type: "loan_repayment",
        amountPhpc: 1000,
        destinationPublicKey: "GA...",
        status: "pending_online_submission",
      },
      {
        id: "draft_success",
        type: "loan_repayment",
        amountPhpc: 2000,
        destinationPublicKey: "GA...",
        status: "pending_online_submission",
      },
    ];

    const repayLoanFn = async (params) => {
      if (params.amountPhpc === 1000) {
        return { success: false, error: "Stellar Horizon timeout" };
      }
      return { success: true, transactionHash: "hash_ok" };
    };

    const result = await syncOfflineDrafts({
      drafts,
      repayLoanFn,
      updateLoanStatusFn: async () => {},
      getOutstandingLoanBalanceFn: async () => 0,
      setOutstandingLoanBalanceFn: async () => {},
    });

    assert.equal(result.successCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, "draft_fail");
    assert.equal(result.errors[0].error, "Stellar Horizon timeout");

    assert.equal(result.updatedDrafts[0].status, "pending_online_submission");
    assert.equal(result.updatedDrafts[1].status, "submitted");
    assert.equal(result.updatedDrafts[1].submittedTxHash, "hash_ok");
  });
});

