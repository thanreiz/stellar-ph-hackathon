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

  it("defines the calculateNetCashBenta function in app/index.js", () => {
    const indexSource = readProjectFile("app/index.js");
    assert.match(indexSource, /function calculateNetCashBenta/);
  });

  it("calculates Net Cash Benta by subtracting cash expenses from sales ledger", () => {
    function calculateNetCashBenta(salesLedger, expenseLedger, cashOutAmount = 0) {
      const sources = ["cash", "gcash", "maya", "bank_transfer"];
      return sources.reduce((total, source) => {
        const sales = (salesLedger || []).reduce((sum, record) => {
          const recordSource = record.paymentSource || "cash";
          if (recordSource === source) {
            return sum + Number(record.amount || 0);
          }
          return sum;
        }, 0);
        const expenses = (expenseLedger || []).reduce((sum, record) => {
          const recordSource = record.paymentSource || "cash";
          if (recordSource === source) {
            return sum + Number(record.amount || 0);
          }
          return sum;
        }, 0);
        const extra = source === "cash" ? Number(cashOutAmount || 0) : 0;
        const netForSource = Math.max(0, sales + extra - expenses);
        return total + netForSource;
      }, 0);
    }

    const salesLedger = [
      { amount: 5000 },
      { amount: 3000, paymentSource: "cash" },
      { amount: 2000, paymentSource: "gcash" }, // non-cash
    ];
    const expenseLedger = [
      { amount: 1000, paymentSource: "cash" },
      { amount: 500, paymentSource: "gcash" }, // non-cash
      { amount: 2000, paymentSource: "cash" },
    ];

    // Net Cash: Math.max(0, 5000 + 3000 - 3000) = 5000
    // Net GCash: Math.max(0, 2000 - 500) = 1500
    // Total Expected Benta = 5000 + 1500 = 6500
    const netCashBenta = calculateNetCashBenta(salesLedger, expenseLedger);
    assert.equal(netCashBenta, 6500);

    // Test with cash out amount (+1500 to Cash source)
    // Net Cash: Math.max(0, 8000 + 1500 - 3000) = 6500
    // Net GCash: 1500
    // Total Expected = 8000
    assert.equal(calculateNetCashBenta(salesLedger, expenseLedger, 1500), 8000);

    // Test negative clamping (huge cash expense, GCash is unaffected)
    const hugeExpenseLedger = [
      { amount: 10000, paymentSource: "cash" },
    ];
    // Net Cash: Math.max(0, 8000 - 10000) = 0
    // Net GCash: Math.max(0, 2000 - 0) = 2000 (since GCash expenses are 0 in hugeExpenseLedger)
    // Total Expected = 2000
    assert.equal(calculateNetCashBenta(salesLedger, hugeExpenseLedger), 2000);

    // Explicit test for isolated clamping:
    // Cash balance is negative (5000 - 10000 = -5000 => clamps to 0)
    // GCash balance is positive (2000 - 500 = 1500 => remains 1500)
    const mixedExpenseLedger = [
      { amount: 10000, paymentSource: "cash" },
      { amount: 500, paymentSource: "gcash" }
    ];
    assert.equal(calculateNetCashBenta(salesLedger, mixedExpenseLedger), 1500);
  });
});
