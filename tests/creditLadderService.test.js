import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateTiwalaScore,
  evaluateCreditStage,
  getLoanLimitForStage,
} from "../services/creditLadderService.js";

describe("credit ladder", () => {
  it("keeps stores with up to 30000 synced Benta in Stage 1", () => {
    const stage = evaluateCreditStage(30000);

    assert.equal(stage.id, 1);
    assert.equal(stage.name, "Micro-Sari (Starter)");
    assert.equal(stage.actionLabel, "Pondohan ang Upgrade");
    assert.equal(getLoanLimitForStage(stage), 3500);
  });

  it("moves stores above 30000 synced Benta into Stage 2", () => {
    const stage = evaluateCreditStage(30001);

    assert.equal(stage.id, 2);
    assert.equal(stage.name, "Corner Store (Growth)");
    assert.equal(stage.actionLabel, "Utangin ang kulang");
    assert.equal(getLoanLimitForStage(stage), 7500);
  });

  it("clamps Tiwala Score between 30 and 95", () => {
    assert.equal(calculateTiwalaScore(0), 30);
    assert.equal(calculateTiwalaScore(1_000_000), 95);
    assert.ok(calculateTiwalaScore(20000) > 30);
  });
});
