import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getExpenseTotal,
  getBusinessSnapshot,
  getOfflineControlState,
  getSalesSeries,
  getSalesToday,
} from "../services/dashboardService.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// PST midnight for 2026-05-20 = 2026-05-19T16:00:00Z (UTC+8 → midnight = UTC-8h)
const PST_MAY20_MIDNIGHT_UTC = Date.UTC(2026, 4, 19, 16, 0, 0); // 2026-05-19T16:00:00Z

// Records with numeric timestamps relative to PST midnight
const records = [
  // "today" in PST (2026-05-20 PHT) — 1h and 10h after PST midnight
  { amount: 1200, timestamp: PST_MAY20_MIDNIGHT_UTC + 1 * 60 * 60 * 1000,  createdAt: "2026-05-20T01:00:00.000Z" },
  { amount: 800,  timestamp: PST_MAY20_MIDNIGHT_UTC + 10 * 60 * 60 * 1000, createdAt: "2026-05-20T10:00:00.000Z" },
  // "yesterday" in PST (2026-05-19 PHT)
  { amount: 500,  timestamp: PST_MAY20_MIDNIGHT_UTC - 2 * 60 * 60 * 1000,  createdAt: "2026-05-18T10:00:00.000Z" },
  // Older record
  { amount: 2000, timestamp: PST_MAY20_MIDNIGHT_UTC - 30 * 24 * 60 * 60 * 1000, createdAt: "2026-04-10T10:00:00.000Z" },
];

describe("dashboard sales summaries", () => {
  it("calculates sales today using PST midnight boundary", () => {
    // Mock Date.now() so getPSTMidnightUTC() resolves to PST midnight for 2026-05-20 PHT
    const realDateNow = Date.now;
    // Set "now" to 12:00 PHT on 2026-05-20 = 04:00 UTC on 2026-05-20
    Date.now = () => PST_MAY20_MIDNIGHT_UTC + 12 * 60 * 60 * 1000;
    try {
      // Only the two "today PST" records (1200 + 800) should count
      assert.equal(getSalesToday(records), 2000);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("returns 0 for empty ledger", () => {
    assert.equal(getSalesToday([]), 0);
  });

  it("builds graph series for year, month, week, and day", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");

    assert.equal(getSalesSeries(records, "year", now).length, 12);
    assert.equal(getSalesSeries(records, "month", now).length, 5);
    assert.equal(getSalesSeries(records, "week", now).length, 7);
    assert.equal(getSalesSeries(records, "day", now).length, 4);
  });
});

describe("business controls", () => {
  it("disables blockchain actions while keeping local documents available offline", () => {
    assert.deepEqual(getOfflineControlState(true), {
      canTransact: false,
      canCreateDocument: true,
      reason: "Needs internet to transact.",
    });
  });

  it("summarizes spent, earned, capital, and business debt from transactions", () => {
    const snapshot = getBusinessSnapshot(records, [
      { kind: "expense", amount: 700 },
      { kind: "capital", amount: 5000 },
      { kind: "businessDebt", amount: 2500 },
    ]);

    assert.equal(snapshot.earned, 4500);
    assert.equal(snapshot.spent, 700);
    assert.equal(snapshot.capital, 5000);
    assert.equal(snapshot.businessDebt, 2500);
  });

  it("returns zero metrics when receipts array is empty", () => {
    const snapshot = getBusinessSnapshot([], []);
    assert.equal(snapshot.spent, 0);
    assert.equal(snapshot.capital, 0);
    assert.equal(snapshot.businessDebt, 0);
  });

  it("sums expenses across cash and digital bank payment sources", () => {
    assert.equal(getExpenseTotal([
      { amount: 120, paymentSource: "cash" },
      { amount: 340, paymentSource: "gcash" },
      { amount: 60, paymentSource: "maya" },
    ]), 520);
  });
});
