import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("mobile demo configuration", () => {
  it("declares Expo as an iOS and Android app only", () => {
    const appConfig = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));

    assert.deepEqual(appConfig.expo.platforms, ["ios", "android"]);
  });

  it("documents mobile demo commands instead of web preview deployment", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    assert.match(readme, /Android Studio emulator/);
    assert.match(readme, /iPhone/);
    assert.doesNotMatch(readme, /Expo web at `http:\/\/localhost:8081`/);
    assert.doesNotMatch(readme, /npx expo start --web/);
  });

  it("includes a repeatable Testnet lender seed command for live demos", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const seedScript = readFileSync(new URL("../scripts/seedLenderLiquidity.mjs", import.meta.url), "utf8");

    assert.equal(packageJson.scripts["seed:lenders"], "node scripts/seedLenderLiquidity.mjs");
    assert.match(seedScript, /targetPhpc/);
    assert.match(seedScript, /SariSync seed/);
  });

  it("uses an in-app number pad for phone demo Benta entry", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /BENTA_KEYPAD_KEYS/);
    assert.match(source, /showSoftInputOnFocus=\{false\}/);
    assert.match(source, /function MobileNumberPad/);
  });
});
