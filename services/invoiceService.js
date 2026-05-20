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

export function evaluateInvoiceEligibility(invoice, loanLimit) {
  const amountUsdc = Number(invoice?.amount_usdc || 0);
  const limit = Number(loanLimit || 0);
  const shortfall = Math.max(0, amountUsdc - limit);

  return {
    eligible: amountUsdc > 0 && shortfall === 0,
    shortfall,
  };
}
