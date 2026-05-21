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
    network: "STELLAR_TESTNET",
    status: OFFLINE_DRAFT_STATUS.PENDING,
    submittedTxHash: null,
    createdAt: new Date().toISOString(),
  };
}

export function getOfflineCapabilities({ isOffline }) {
  if (!isOffline) {
    return {
      canLogBenta: true,
      canDraftRepayment: true,
      canDraftSupplierInvoice: true,
      canSubmitStellarTransaction: true,
      message: "Online mode: Stellar Testnet transactions can be submitted.",
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
