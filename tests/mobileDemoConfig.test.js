import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(relativePath) {
  try {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`Expected ${relativePath} to exist for the Division 1 UI polish guard tests.`);
    }

    throw error;
  }
}

function assertIncludes(source, expected, message = `Expected source to include "${expected}".`) {
  assert.ok(source.includes(expected), message);
}

function assertExcludes(source, unexpected, message = `Expected source not to include "${unexpected}".`) {
  assert.ok(!source.includes(unexpected), message);
}

function assertMatches(source, pattern, message = `Expected source to match ${pattern}.`) {
  assert.ok(pattern.test(source), message);
}

describe("mobile demo configuration", () => {
  it("declares Expo as an iOS and Android app only", () => {
    const appConfig = JSON.parse(readProjectFile("app.json"));

    assert.deepEqual(appConfig.expo.platforms, ["ios", "android"]);
  });

  it("documents mobile demo commands instead of web preview deployment", () => {
    const readme = readProjectFile("README.md");

    assert.match(readme, /Android Studio emulator/);
    assert.match(readme, /iPhone/);
    assert.doesNotMatch(readme, /Expo web at `http:\/\/localhost:8081`/);
    assert.doesNotMatch(readme, /npx expo start --web/);
  });

  it("includes a repeatable Testnet lender seed command for live demos", () => {
    const packageJson = JSON.parse(readProjectFile("package.json"));
    const seedScript = readProjectFile("scripts/seedLenderLiquidity.mjs");

    assert.equal(packageJson.scripts["seed:lenders"], "node scripts/seedLenderLiquidity.mjs");
    assert.match(seedScript, /targetPhpc/);
    assert.match(seedScript, /SariSync seed/);
  });

  it("allows the native phone keyboard for Benta entry", () => {
    const source = readProjectFile("app/index.js");

    assert.match(source, /keyboardType="number-pad"/);
    assert.doesNotMatch(source, /showSoftInputOnFocus=\{false\}/);
  });

  it("requires a Stellar Freighter wallet connection before showing the ledger", () => {
    const source = readProjectFile("app/index.js");

    assert.match(source, /WalletConnectionGate/);
    assert.match(source, /Freighter/);
    assert.match(source, /getWalletConnection/);
    assert.match(source, /saveWalletConnection/);
  });

  it("uses native document sharing instead of browser blob APIs on mobile", () => {
    const source = readProjectFile("app/index.js");

    assert.match(source, /FileSystem\.writeAsStringAsync/);
    assert.match(source, /Sharing\.shareAsync/);
    assert.doesNotMatch(source, /createObjectURL|window\.open|new Blob/);
  });

  it("only shows the empty transaction message after Create Document is pressed", () => {
    const source = readProjectFile("app/index.js");

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
    const source = readProjectFile("app/index.js");
    const scanner = readProjectFile("app/scanner.js");

    assert.match(source, /Offline Work/);
    assert.match(source, /pending_online_submission/);
    assert.match(source, /Submit when online/);
    assert.match(source, /Draft supplier invoices/);
    assert.match(source, /Draft loan repayments/);
    assert.match(scanner, /appendOfflineDraft/);
  });

  it("tracks expenses with cash and digital bank payment sources", () => {
    const source = readProjectFile("app/index.js");
    const storage = readProjectFile("services/storageService.js");

    assertIncludes(source, "Record Expenses");
    assertIncludes(source, "Payment Method");
    assertExcludes(source, "Log expense", "Old default expense card label should be replaced.");
    assertExcludes(source, "Expense source", "Old default payment source label should be replaced.");
    assert.match(source, /Cash/);
    assert.match(source, /GCash/);
    assert.match(source, /Maya/);
    assert.match(source, /Bank transfer/);
    assert.match(storage, /createExpensePayload/);
    assert.match(storage, /getExpenseLedger/);
  });

  it("hides online ledger numbers while offline", () => {
    const source = readProjectFile("app/index.js");

    assert.match(source, /displayLedger/);
    assert.match(source, /network\.isOffline \? \[\] : syncedLedger/);
    assert.match(source, /Online ledger hidden until internet returns/);
  });

  it("defines Division 1 Choice A polished mobile shell labels and icons", () => {
    const source = readProjectFile("app/index.js");
    const uiSource = readProjectFile("components/SariSyncUI.js");

    assertMatches(source, /label:\s*"Cash"/, "Expected Kaha tab label.");
    assertMatches(source, /label:\s*"Tracker"/, "Expected Tracker tab label.");
    assertMatches(source, /label:\s*"Debt"/, "Expected Utang tab label.");
    assertMatches(source, /label:\s*"Proof"/, "Expected Proof tab label.");
    assertMatches(source, /icon:\s*"wallet"/, "Expected wallet nav icon.");
    assertMatches(source, /icon:\s*"trend"/, "Expected trend nav icon.");
    assertMatches(source, /icon:\s*"loan"/, "Expected loan nav icon.");
    assertMatches(source, /icon:\s*"proof"/, "Expected proof nav icon.");
    assertIncludes(uiSource, "function IconNav");
    assertIncludes(uiSource, "function AppIcon");
  });

  it("uses polished English metrics and expense card treatment for Choice A", () => {
    const source = readProjectFile("app/index.js");
    const uiSource = readProjectFile("components/SariSyncUI.js");
    const metricCardUsages = source.match(/<BentoMetricCard\b/g) ?? [];

    assertIncludes(source, "Sales Today");
    assertIncludes(source, "Expenses");
    assertIncludes(source, "Trust Score");
    assertIncludes(source, "Credit Limit");
    assert.ok(
      metricCardUsages.length >= 4,
      `Expected at least four BentoMetricCard usages, found ${metricCardUsages.length}.`,
    );
    assertMatches(uiSource, /fontSize:\s*42/, "Expected large 42px metric treatment.");
    assertIncludes(uiSource, "expense");
  });

  it("keeps proof details hidden behind a friendly document flow", () => {
    const source = readProjectFile("app/index.js");

    assertIncludes(source, "Proof hidden");
    assertIncludes(source, "Tap to view transaction details");
    assertIncludes(source, "Create Document");
    assertIncludes(source, "Proof center");
    assertIncludes(source, "Transaction details");
    assert.ok(
      /ProofHint|isProofDetailsOpen|setProofDetailsOpen|proofDetailsOpen|showProofDetails/.test(source),
      "Expected source evidence that technical proof details are collapsed behind a friendly proof hint/state.",
    );
  });

  it("uses friendly wallet connection copy while removing technical validation prompts", () => {
    const source = readProjectFile("app/index.js");

    assertIncludes(source, "Connect Wallet");
    assertIncludes(source, "Connect wallet");
    assertMatches(
      source,
      /records (are secured in the background|sa background)/,
      "Expected friendly wallet assurance copy about records being secured in the background.",
    );
    assertExcludes(source, "I-Validate ang Stellar Invoice");
    assertExcludes(source, "I-paste ang transaction hash para i-verify sa Horizon Testnet");
  });
});
