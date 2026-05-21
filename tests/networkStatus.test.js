import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("network status responsiveness", () => {
  it("updates online/offline state immediately without a delayed online timer", () => {
    const source = readFileSync(new URL("../hooks/useNetworkStatus.js", import.meta.url), "utf8");

    assert.doesNotMatch(source, /STABLE_CONNECTION_MS|setTimeout|stableTimer/);
    assert.match(source, /state\.isConnected === true/);
    assert.match(source, /state\.isInternetReachable !== false/);
  });
});
