import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateInvoiceEligibility,
  parseSupplierInvoiceQr,
} from "../services/invoiceService.js";
import { CREDIT_STAGES } from "../services/creditLadderService.js";

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
    assert.deepEqual(
      evaluateInvoiceEligibility({ amount_usdc: 50 }, CREDIT_STAGES.MICRO_SARI, 5000),
      { eligible: true, shortfall: 0 },
    );
    assert.deepEqual(
      evaluateInvoiceEligibility({ amount_usdc: 6000 }, CREDIT_STAGES.MICRO_SARI, 5000),
      { eligible: false, shortfall: 1000 },
    );
  });
});

describe("BR5 stage-drop debt lock", () => {
  it("blocks new loans when user dropped from Corner Store and outstanding balance > new limit", () => {
    const result = evaluateInvoiceEligibility(
      { amount_usdc: 50 },
      CREDIT_STAGES.MICRO_SARI,  // current stage (demoted)
      5000,                       // new loan limit
      6000,                       // outstandingBalance > loanLimit → locked
      CREDIT_STAGES.CORNER_STORE, // lastStage — was Corner Store
    );

    assert.equal(result.eligible, false);
    assert.equal(result.reason, "BR5_STAGE_DROP_LOCK");
    assert.ok(typeof result.message === "string" && result.message.length > 0);
  });

  it("allows loans when outstanding balance is below new stage limit", () => {
    const result = evaluateInvoiceEligibility(
      { amount_usdc: 50 },
      CREDIT_STAGES.MICRO_SARI,  // current stage
      5000,                       // new loan limit
      4000,                       // outstandingBalance < loanLimit → NOT locked
      CREDIT_STAGES.CORNER_STORE, // lastStage
    );

    // Not locked by BR5 — falls through to amount eligibility check
    assert.equal(result.eligible, true);
    assert.equal(result.shortfall, 0);
  });
});
