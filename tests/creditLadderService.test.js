import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CREDIT_STAGES,
  calculateTiwalaScore,
  evaluateCreditStage,
  getLoanLimitForStage,
  getStageMetadata,
} from "../services/creditLadderService.js";

describe("credit ladder", () => {
  // ── Stage evaluation ───────────────────────────────────────────────────────

  it("assigns READ_ONLY stage for zero sales (BR0)", () => {
    assert.equal(evaluateCreditStage(0), CREDIT_STAGES.READ_ONLY);
  });

  it("assigns READ_ONLY stage for sales below ₱5,000 (BR0)", () => {
    assert.equal(evaluateCreditStage(4999), CREDIT_STAGES.READ_ONLY);
  });

  it("assigns MICRO_SARI at exactly ₱5,000 (BR1 lower boundary)", () => {
    assert.equal(evaluateCreditStage(5000), CREDIT_STAGES.MICRO_SARI);
  });

  it("keeps stores with up to 30000 synced Benta in Stage 1", () => {
    const stage = evaluateCreditStage(30000);
    assert.equal(stage, CREDIT_STAGES.MICRO_SARI);
    const meta = getStageMetadata(stage);
    assert.equal(meta.id, 1);
    assert.equal(meta.name, "Micro-Sari (Starter)");
    assert.equal(meta.actionLabel, "Fund Upgrade");
    assert.equal(getLoanLimitForStage(stage), 3500);
  });

  it("moves stores above 30000 synced Benta into Stage 2", () => {
    const stage = evaluateCreditStage(30001);
    assert.equal(stage, CREDIT_STAGES.CORNER_STORE);
    const meta = getStageMetadata(stage);
    assert.equal(meta.id, 2);
    assert.equal(meta.name, "Corner Store (Growth)");
    assert.equal(meta.actionLabel, "Borrow shortfall");
    assert.equal(getLoanLimitForStage(stage), 7500);
  });

  // ── Loan limits ────────────────────────────────────────────────────────────

  it("returns 0 loan limit for READ_ONLY stage", () => {
    assert.equal(getLoanLimitForStage(CREDIT_STAGES.READ_ONLY), 0);
  });

  it("returns 0 loan limit for unknown/null stage", () => {
    assert.equal(getLoanLimitForStage(null), 0);
    assert.equal(getLoanLimitForStage(undefined), 0);
    assert.equal(getLoanLimitForStage("unknown"), 0);
  });

  // ── Tiwala Score ───────────────────────────────────────────────────────────

  it("clamps Tiwala Score between 30 and 95", () => {
    assert.equal(calculateTiwalaScore(0), 30);
    assert.equal(calculateTiwalaScore(1_000_000), 95);
    assert.ok(calculateTiwalaScore(20000) > 30);
  });
});
