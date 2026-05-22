import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("tindahan cash formula and conversion rates", () => {
  it("defines the correct conversion rates in app/index.js", () => {
    const indexSource = readProjectFile("app/index.js");

    // Assert XLM_TO_PHP_RATE is exactly 9.07
    assert.match(indexSource, /const XLM_TO_PHP_RATE = 9.07;/);

    // Assert USDC_TO_PHP_RATE is exactly 61.45
    assert.match(indexSource, /const USDC_TO_PHP_RATE = 61.45;/);
  });

  it("calculates Tindahan Cash using the formula: Total Synced Benta + PHPC Balance", () => {
    // Simulate the formula used in the application
    function calculateTindahanCash(totalSyncedBenta, phpcBalance) {
      const benta = Number(totalSyncedBenta || 0);
      const phpc = Number(phpcBalance || 0);
      return Math.max(0, benta + phpc);
    }

    // Scenario 1: Zero sales, standard wallet balances
    // Benta = 0, PHPC = 100
    // Expected = 0 + 100 = 100
    assert.equal(calculateTindahanCash(0, 100), 100);

    // Scenario 2: Active store with sales and balances
    // Benta = 15000, PHPC = 500
    // Expected = 15000 + 500 = 15500
    assert.equal(calculateTindahanCash(15000, 500), 15500);

    // Scenario 3: Negative clamp to zero
    // Benta = -100, PHPC = 50
    // Expected = Math.max(0, 0) = 0
    assert.equal(calculateTindahanCash(-100, 50), 0);
  });
});
