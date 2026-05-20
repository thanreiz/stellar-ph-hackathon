import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBusinessSnapshot,
  getOfflineControlState,
  getSalesSeries,
  getSalesToday,
} from "../services/dashboardService.js";

const records = [
  { amount: 1200, createdAt: "2026-05-20T01:00:00.000Z" },
  { amount: 800, createdAt: "2026-05-20T10:00:00.000Z" },
  { amount: 500, createdAt: "2026-05-18T10:00:00.000Z" },
  { amount: 2000, createdAt: "2026-04-10T10:00:00.000Z" },
];

describe("dashboard sales summaries", () => {
  it("calculates sales today from synced Benta records", () => {
    assert.equal(getSalesToday(records, new Date("2026-05-20T12:00:00.000Z")), 2000);
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
  it("disables blockchain and document actions while offline", () => {
    assert.deepEqual(getOfflineControlState(true), {
      canTransact: false,
      canCreateDocument: false,
      reason: "Needs internet to transact.",
    });
  });

  it("summarizes spent, earned, capital, and business debt", () => {
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
});
