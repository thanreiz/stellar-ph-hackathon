import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("web compatibility", () => {
  it("does not pass React Native style arrays through Expo Router Link anchors", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const linkWithStyledPressablePattern =
      /<Link\b[\s\S]*?\basChild\b[\s\S]*?>\s*<Pressable\b[\s\S]*?style=\{\[/;

    assert.equal(
      linkWithStyledPressablePattern.test(source),
      false,
      "Use imperative navigation or a non-array anchor style instead of Link asChild with Pressable style arrays.",
    );
  });

  it("uses a demo-safe Horizon submission timeout", () => {
    const source = readFileSync(new URL("../services/stellarService.js", import.meta.url), "utf8");

    assert.match(source, /HORIZON_TIMEOUT_MS\s*=\s*20000/);
    assert.match(source, /20s/);
  });

  it("rebuilds Stellar transactions when Horizon returns tx_too_late", () => {
    const source = readFileSync(new URL("../services/stellarService.js", import.meta.url), "utf8");

    assert.match(source, /HORIZON_TRANSACTION_MAX_TIME_SECONDS\s*=\s*300/);
    assert.match(source, /MAX_SUBMISSION_ATTEMPTS\s*=\s*2/);
    assert.match(source, /function isTxTooLate/);
    assert.match(source, /submitWithFreshTransaction/);
    assert.match(source, /tx_too_late/);
  });

  it("shows transaction hashes after successful Stellar loan and repayment flows", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /result\.transactionHash/);
    assert.match(source, /TX: /);
  });

  it("shows a known-good Testnet transaction hash near the validator field", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /DEMO_TRANSACTION_HASH/);
    assert.match(source, /0819554161045c5e2ef2a629dbd10396d504f76862739ceebf8452addf6c9489/);
  });
});
