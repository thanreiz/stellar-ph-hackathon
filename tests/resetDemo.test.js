import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(relativePath) {
  try {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`Expected ${relativePath} to exist.`);
    }
    throw error;
  }
}

describe("reset demo functionality", () => {
  it("defines and exports resetDemoData in storageService.js", () => {
    const storageSource = readProjectFile("services/storageService.js");

    assert.ok(storageSource.includes("export async function resetDemoData()"), "Expected resetDemoData to be exported");
    assert.ok(storageSource.includes("AsyncStorage.multiRemove(keys)"), "Expected multiRemove to be called on keys");

    // Verify all 14 keys are listed in resetDemoData
    const expectedKeys = [
      "sarisync:pendingSyncQueue",
      "sarisync:syncedSalesLedger",
      "sarisync:outstandingLoanBalance",
      "sarisync:lastStage",
      "sarisync:receipts",
      "sarisync:loans",
      "sarisync:walletConnection",
      "sarisync:offlineDrafts",
      "sarisync:expenseLedger",
      "sarisync:cashOutTotal",
      "sarisync:hasCompletedOnboarding",
      "sarisync:onboardingDetails",
      "sarisync:userLevel",
      "sarisync:themeMode"
    ];

    for (const key of expectedKeys) {
      assert.ok(storageSource.includes(key), `Expected storage key '${key}' to be present in resetDemoData`);
    }
  });

  it("integrates reset functionality in app/index.js", () => {
    const appSource = readProjectFile("app/index.js");

    // 1. Verify resetDemoData is imported
    assert.ok(appSource.includes("resetDemoData") || appSource.includes("../services/storageService"), "Expected resetDemoData to be imported in app/index.js");

    // 2. Verify handleResetDemo is defined and calls resetDemoData & clearOnboarding
    assert.ok(appSource.includes("const handleResetDemo = useCallback(() => {"), "Expected handleResetDemo callback definition");
    assert.ok(appSource.includes("await resetDemoData()"), "Expected handleResetDemo to call resetDemoData");
    assert.ok(appSource.includes("await clearOnboarding()"), "Expected handleResetDemo to call clearOnboarding");

    // 3. Verify local states are reset inside handleResetDemo
    assert.ok(appSource.includes("setWalletConnection(null)"), "Expected walletConnection state to reset");
    assert.ok(appSource.includes("setPendingQueue([])"), "Expected pendingQueue state to reset");
    assert.ok(appSource.includes("setSyncedLedger([])"), "Expected syncedLedger state to reset");
    assert.ok(appSource.includes("setReceipts([])"), "Expected receipts state to reset");
    assert.ok(appSource.includes("setLoans([])"), "Expected loans state to reset");
    assert.ok(appSource.includes("setOfflineDrafts([])"), "Expected offlineDrafts state to reset");
    assert.ok(appSource.includes("setExpenses([])"), "Expected expenses state to reset");
    assert.ok(appSource.includes("setOutstandingBalance(0)"), "Expected outstandingBalance state to reset");
    assert.ok(appSource.includes("setCashOutTotal(0)"), "Expected cashOutTotal state to reset");
    assert.ok(appSource.includes("setPhpcBalance(\"0.00\")"), "Expected phpcBalance state to reset");
    assert.ok(appSource.includes("setXlmBalance(\"0.0000\")"), "Expected xlmBalance state to reset");
    assert.ok(appSource.includes("setOnChainScore(null)"), "Expected onChainScore state to reset");
    assert.ok(appSource.includes("setOnChainLimit(null)"), "Expected onChainLimit state to reset");
    assert.ok(appSource.includes("setOnChainOutstandingBalance(null)"), "Expected onChainOutstandingBalance state to reset");

    // 4. Verify dev reset button (🔄) is rendered next to theme toggle in KahaScreen header
    assert.ok(appSource.includes("onPress={handleResetDemo}"), "Expected KahaScreen header to call handleResetDemo on press");

    // 5. Verify dev reset button (🔄) is rendered in WalletConnectionGate
    assert.ok(appSource.includes("WalletConnectionGate onConnect={handleConnectWallet} onReset={handleResetDemo}"), "Expected WalletConnectionGate to receive onReset prop");
    assert.ok(appSource.includes("function WalletConnectionGate({ onConnect, onReset })"), "Expected WalletConnectionGate definition to accept onReset");
  });
});
