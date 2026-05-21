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

  it("allows the native phone keyboard for Benta entry", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /keyboardType="number-pad"/);
    assert.doesNotMatch(source, /showSoftInputOnFocus=\{false\}/);
  });

  it("requires a Stellar Freighter wallet connection before showing the ledger", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /WalletConnectionGate/);
    assert.match(source, /Freighter/);
    assert.match(source, /getWalletConnection/);
    assert.match(source, /saveWalletConnection/);
  });

  it("uses native document sharing instead of browser blob APIs on mobile", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /FileSystem\.writeAsStringAsync/);
    assert.match(source, /Sharing\.shareAsync/);
    assert.doesNotMatch(source, /createObjectURL|window\.open|new Blob/);
  });

  it("only shows the empty transaction message after Create Document is pressed", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /No recorded transactions\./);
    assert.match(source, /documentStatusMessage/);
    assert.doesNotMatch(
      source,
      /Wala pang na-record na transaksyon\. Mag-settle ng supplier invoice o humingi ng loan para lumabas dito/,
    );
    assert.doesNotMatch(
      source,
      /Bubuksan sa bagong tab bilang HTML na maaaring i-print bilang PDF/,
    );
  });

  it("shows offline drafts separately from submitted Stellar transactions", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const scanner = readFileSync(new URL("../app/scanner.js", import.meta.url), "utf8");

    assert.match(source, /Offline Work/);
    assert.match(source, /pending_online_submission/);
    assert.match(source, /Submit when online/);
    assert.match(source, /Draft supplier invoices/);
    assert.match(source, /Draft loan repayments/);
    assert.match(scanner, /appendOfflineDraft/);
  });

  it("tracks expenses with cash and digital bank payment sources", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const storage = readFileSync(new URL("../services/storageService.js", import.meta.url), "utf8");

    assert.match(source, /Log expense/);
    assert.match(source, /Expense source/);
    assert.match(source, /Cash/);
    assert.match(source, /GCash/);
    assert.match(source, /Maya/);
    assert.match(source, /Bank transfer/);
    assert.match(storage, /createExpensePayload/);
    assert.match(storage, /getExpenseLedger/);
  });

  it("hides online ledger numbers while offline", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /displayLedger/);
    assert.match(source, /network\.isOffline \? \[\] : syncedLedger/);
    assert.match(source, /Online ledger hidden until internet returns/);
  });
});
