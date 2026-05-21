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

    assert.match(source, /Log expense|I-record ang Gastos/);
    assert.match(source, /Expense source|Pinambayad/);
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

  it("defines Division 1 Choice A polished mobile shell labels and icons", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const uiSource = readFileSync(new URL("../components/SariSyncUI.js", import.meta.url), "utf8");

    assert.match(source, /label:\s*"Kaha"/);
    assert.match(source, /label:\s*"Tracker"/);
    assert.match(source, /label:\s*"Utang"/);
    assert.match(source, /label:\s*"Proof"/);
    assert.match(source, /icon:\s*"wallet"/);
    assert.match(source, /icon:\s*"trend"/);
    assert.match(source, /icon:\s*"loan"/);
    assert.match(source, /icon:\s*"proof"/);
    assert.match(uiSource, /function IconNav/);
    assert.match(uiSource, /function AppIcon/);
  });

  it("uses polished Filipino metrics and expense card treatment for Choice A", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");
    const uiSource = readFileSync(new URL("../components/SariSyncUI.js", import.meta.url), "utf8");

    assert.match(source, /Benta Ngayon/);
    assert.match(source, /Mga Gastos/);
    assert.match(source, /Tiwala Score/);
    assert.match(source, /Limit sa Utang/);
    assert.match(source, /BentoMetricCard/);
    assert.match(uiSource, /fontSize:\s*42/);
    assert.match(uiSource, /expense/);
  });

  it("keeps proof details hidden behind a friendly document flow", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /Proof hidden/);
    assert.match(source, /Tap to view transaction details/);
    assert.match(source, /Gumawa ng Dokumento/);
    assert.match(source, /Proof center/);
  });

  it("uses friendly wallet connection copy while removing technical validation prompts", () => {
    const source = readFileSync(new URL("../app/index.js", import.meta.url), "utf8");

    assert.match(source, /Konek Wallet/);
    assert.match(source, /I-konek ang wallet/);
    assert.match(source, /records (are secured in the background|sa background)/);
    assert.doesNotMatch(source, /I-Validate ang Stellar Invoice/);
    assert.doesNotMatch(source, /I-paste ang transaction hash para i-verify sa Horizon Testnet/);
  });
});
