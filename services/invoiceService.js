import { CREDIT_STAGES } from './creditLadderService.js';

export function parseSupplierInvoiceQr(rawPayload) {
  let parsed;

  try {
    parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch {
    throw new Error("Invalid supplier invoice QR JSON.");
  }

  const supplierPubkey = parsed?.supplier_pubkey;
  const amountUsdc = Number(parsed?.amount_usdc);

  if (typeof supplierPubkey !== "string" || !supplierPubkey.startsWith("G")) {
    throw new Error("Invalid supplier_pubkey. Expected a Stellar public key starting with G.");
  }

  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("Invalid amount_usdc. Expected a positive number.");
  }

  return {
    supplier_pubkey: supplierPubkey,
    amount_usdc: amountUsdc,
  };
}

/**
 * Evaluates whether a scanned invoice is eligible for financing.
 *
 * @param {object} invoice          - Parsed invoice with amount_usdc field
 * @param {string} stage            - Current CREDIT_STAGES value
 * @param {number} loanLimit        - PHP loan limit for the current stage
 * @param {number} outstandingBalance - Outstanding loan balance (default 0)
 * @param {string|null} lastStage   - Stage recorded at last sync (default null)
 *
 * Returns { eligible, shortfall } on success, or
 * { eligible: false, reason, message } when a business rule blocks the loan.
 */
export function evaluateInvoiceEligibility(
  invoice,
  stage,
  loanLimit,
  outstandingBalance = 0,
  lastStage = null,
) {
  // BR5: lock new loans if the user dropped from Corner Store to a lower stage
  // and outstanding balance still exceeds their new limit
  if (
    lastStage === CREDIT_STAGES.CORNER_STORE &&
    stage !== CREDIT_STAGES.CORNER_STORE &&
    outstandingBalance > loanLimit
  ) {
    return {
      eligible: false,
      reason: 'BR5_STAGE_DROP_LOCK',
      message:
        'Cannot request new financing. Please reduce your outstanding balance below the limit first.',
    };
  }

  const amountUsdc = Number(invoice?.amount_usdc || 0);
  const limit = Number(loanLimit || 0);
  const shortfall = Math.max(0, amountUsdc - limit);

  return {
    eligible: amountUsdc > 0 && shortfall === 0,
    shortfall,
  };
}
