export const OFFLINE_DRAFT_STATUS = {
  PENDING: "pending_online_submission",
  SUBMITTED: "submitted",
};

export const OFFLINE_DRAFT_TYPES = {
  SUPPLIER_INVOICE: "supplier_invoice",
  LOAN_REPAYMENT: "loan_repayment",
};

export function createOfflineDraft(input) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    type: input.type,
    amountPhpc: Number(input.amountPhpc || 0),
    amountUsdc: input.amountUsdc !== undefined ? Number(input.amountUsdc) : null,
    destinationPublicKey: input.destinationPublicKey,
    supplierPubkey: input.supplierPubkey || null,
    lenderName: input.lenderName || null,
    loanId: input.loanId || null,
    network: process.env.EXPO_PUBLIC_STELLAR_NETWORK === "public" || process.env.EXPO_PUBLIC_STELLAR_NETWORK === "mainnet" ? "STELLAR_MAINNET" : "STELLAR_TESTNET",
    status: OFFLINE_DRAFT_STATUS.PENDING,
    submittedTxHash: null,
    createdAt: new Date().toISOString(),
  };
}

export function getOfflineCapabilities({ isOffline }) {
  if (!isOffline) {
    const isPublic = process.env.EXPO_PUBLIC_STELLAR_NETWORK === "public" || process.env.EXPO_PUBLIC_STELLAR_NETWORK === "mainnet";
    return {
      canLogBenta: true,
      canDraftRepayment: true,
      canDraftSupplierInvoice: true,
      canSubmitStellarTransaction: true,
      message: `Online mode: Stellar ${isPublic ? 'Mainnet' : 'Testnet'} transactions can be submitted.`,
    };
  }

  return {
    canLogBenta: true,
    canDraftRepayment: true,
    canDraftSupplierInvoice: true,
    canSubmitStellarTransaction: false,
    message: "Offline mode: local records are saved on this phone. Stellar transactions resume when Wi-Fi returns.",
  };
}

export function getDraftsReadyForSubmission(drafts = [], { isOffline }) {
  if (isOffline) return [];
  return drafts.filter((draft) => draft.status === OFFLINE_DRAFT_STATUS.PENDING);
}

export function summarizeOfflineWork({ pendingBenta = [], drafts = [] }) {
  const pendingDrafts = drafts.filter((draft) => draft.status === OFFLINE_DRAFT_STATUS.PENDING);
  const supplierInvoiceDraftCount = pendingDrafts.filter(
    (draft) => draft.type === OFFLINE_DRAFT_TYPES.SUPPLIER_INVOICE,
  ).length;
  const repaymentDraftCount = pendingDrafts.filter(
    (draft) => draft.type === OFFLINE_DRAFT_TYPES.LOAN_REPAYMENT,
  ).length;
  const pendingBentaCount = pendingBenta.length;

  return {
    pendingBentaCount,
    supplierInvoiceDraftCount,
    repaymentDraftCount,
    totalPendingCount: pendingBentaCount + supplierInvoiceDraftCount + repaymentDraftCount,
  };
}

export async function syncOfflineDrafts({
  drafts = [],
  repayLoanFn,
  submitInvoiceFn,
  updateLoanStatusFn,
  getOutstandingLoanBalanceFn,
  setOutstandingLoanBalanceFn,
  appendReceiptFn,
}) {
  const results = {
    successCount: 0,
    failedCount: 0,
    errors: [],
    updatedDrafts: drafts.map(d => ({ ...d })),
  };

  for (let i = 0; i < results.updatedDrafts.length; i++) {
    const draft = results.updatedDrafts[i];
    if (draft.status !== OFFLINE_DRAFT_STATUS.PENDING) {
      continue;
    }

    try {
      if (draft.type === OFFLINE_DRAFT_TYPES.LOAN_REPAYMENT) {
        if (typeof repayLoanFn !== "function") {
          throw new Error("repayLoanFn is not a function");
        }
        const res = await repayLoanFn({
          lenderPublicKey: draft.destinationPublicKey,
          amountPhpc: draft.amountPhpc,
          memo: "Repay " + (draft.lenderName || "").slice(0, 18),
        });

        if (res && res.success) {
          draft.status = OFFLINE_DRAFT_STATUS.SUBMITTED;
          draft.submittedTxHash = res.transactionHash;
          results.successCount++;

          if (draft.loanId && typeof updateLoanStatusFn === "function") {
            await updateLoanStatusFn(draft.loanId, "paid");
          }
          if (typeof getOutstandingLoanBalanceFn === "function" && typeof setOutstandingLoanBalanceFn === "function") {
            const current = await getOutstandingLoanBalanceFn();
            const newOutstanding = Math.max(0, current - draft.amountPhpc);
            await setOutstandingLoanBalanceFn(newOutstanding);
          }
        } else {
          throw new Error(res?.error || "Repayment failed");
        }
      } else if (draft.type === OFFLINE_DRAFT_TYPES.SUPPLIER_INVOICE) {
        if (typeof submitInvoiceFn !== "function") {
          throw new Error("submitInvoiceFn is not a function");
        }
        const res = await submitInvoiceFn({
          supplierPubkey: draft.supplierPubkey,
          amountUsdc: draft.amountUsdc,
          sendMaxPhpc: String(draft.amountPhpc),
        });

        if (res && res.success) {
          draft.status = OFFLINE_DRAFT_STATUS.SUBMITTED;
          draft.submittedTxHash = res.transactionHash;
          results.successCount++;

          if (typeof appendReceiptFn === "function") {
            await appendReceiptFn({
              id: "invoice_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
              type: "SUPPLIER_INVOICE",
              amountUsdc: draft.amountUsdc,
              supplierPubkey: draft.supplierPubkey,
              timestamp: Date.now(),
              txHash: res.transactionHash,
            });
          }
        } else {
          throw new Error(res?.error || "Invoice settlement failed");
        }
      } else {
        throw new Error(`Unsupported draft type: ${draft.type}`);
      }
    } catch (err) {
      results.failedCount++;
      results.errors.push({ id: draft.id, error: err.message });
    }
  }

  return results;
}
