import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateInvoiceEligibility,
  parseSupplierInvoiceQr,
} from "../services/invoiceService.js";

describe("supplier invoice QR parsing", () => {
  it("accepts a valid B2B supplier invoice payload", () => {
    const invoice = parseSupplierInvoiceQr(
      JSON.stringify({
        supplier_pubkey: "GB2JTESTSUPPLIERPUBLICKEY",
        amount_usdc: 50,
      }),
    );

    assert.equal(invoice.supplier_pubkey, "GB2JTESTSUPPLIERPUBLICKEY");
    assert.equal(invoice.amount_usdc, 50);
  });

  it("rejects invalid supplier pubkeys and non-positive USDC amounts", () => {
    assert.throws(
      () => parseSupplierInvoiceQr('{"supplier_pubkey":"SBAD","amount_usdc":50}'),
      /supplier_pubkey/,
    );
    assert.throws(
      () => parseSupplierInvoiceQr('{"supplier_pubkey":"GB2JTEST","amount_usdc":0}'),
      /amount_usdc/,
    );
  });

  it("marks invoice as eligible only when USDC amount is within loan limit", () => {
    assert.deepEqual(evaluateInvoiceEligibility({ amount_usdc: 50 }, 3500), {
      eligible: true,
      shortfall: 0,
    });
    assert.deepEqual(evaluateInvoiceEligibility({ amount_usdc: 5000 }, 3500), {
      eligible: false,
      shortfall: 1500,
    });
  });
});
