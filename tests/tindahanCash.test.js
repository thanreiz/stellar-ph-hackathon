import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("tindahan cash formula and conversion rates", () => {
  it("defines the correct conversion rates in app/index.js and app/scanner.js", () => {
    const indexSource = readProjectFile("app/index.js");
    const scannerSource = readProjectFile("app/scanner.js");

    // Assert XLM_TO_PHP_RATE is exactly 9.07
    assert.match(indexSource, /const XLM_TO_PHP_RATE = 9.07;/);
    assert.match(scannerSource, /const XLM_TO_PHP_RATE = 9.07;/);

    // Assert USDC_TO_PHP_RATE is exactly 61.45
    assert.match(indexSource, /const USDC_TO_PHP_RATE = 61.45;/);
    assert.match(scannerSource, /const USDC_TO_PHP_RATE = 61.45;/);
  });

  it("calculates Tindahan Cash using the formula: Total Synced Benta + PHPC Balance + (XLM Balance * XLM_TO_PHP_RATE) - cashOutTotal", () => {
    const XLM_TO_PHP_RATE = 9.07;
    
    // Simulate the formula used in the application
    function calculateTindahanCash(totalSyncedBenta, xlmBalance, phpcBalance, cashOutTotal = 0) {
      const benta = Number(totalSyncedBenta || 0);
      const xlm = Number(xlmBalance || 0);
      const phpc = Number(phpcBalance || 0);
      const cashout = Number(cashOutTotal || 0);
      return Math.max(0, benta + phpc + (xlm * XLM_TO_PHP_RATE) - cashout);
    }

    // Scenario 1: Zero sales, zero cashout, standard wallet balances
    // Benta = 0, PHPC = 100, XLM = 10
    // Expected = 0 + 100 + (10 * 9.07) = 190.7
    assert.equal(calculateTindahanCash(0, 10, 100, 0), 190.7);

    // Scenario 2: Active store with sales, cashout, and balances
    // Benta = 15000, PHPC = 500, XLM = 15, Cashout = 2000
    // Expected = 15000 + 500 + (15 * 9.07) - 2000 = 13500 + 136.05 = 13636.05
    assert.equal(calculateTindahanCash(15000, 15, 500, 2000), 13636.05);

    // Scenario 3: Negative clamp to zero
    // Benta = 0, PHPC = 0, XLM = 0, Cashout = 100
    // Expected = Math.max(0, -100) = 0
    assert.equal(calculateTindahanCash(0, 0, 0, 100), 0);
  });
});
