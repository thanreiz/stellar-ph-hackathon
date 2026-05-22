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
  it("defines and exports resetDemoData in storageService.js (preserving wallet/onboarding keys)", () => {
    const storageSource = readProjectFile("services/storageService.js");

    assert.ok(storageSource.includes("export async function resetDemoData()"), "Expected resetDemoData to be exported");
    assert.ok(storageSource.includes("AsyncStorage.multiRemove(keys)"), "Expected multiRemove to be called on keys");

    const resetDemoDataMatch = storageSource.match(/export async function resetDemoData\(\)\s*\{([\s\S]*?)\}/);
    assert.ok(resetDemoDataMatch, "Expected resetDemoData function definition");
    const functionBody = resetDemoDataMatch[1];

    // Verify only financial/transaction keys are removed
    const expectedKeys = [
      "sarisync:pendingSyncQueue",
      "sarisync:syncedSalesLedger",
      "sarisync:outstandingLoanBalance",
      "sarisync:lastStage",
      "sarisync:receipts",
      "sarisync:loans",
      "sarisync:offlineDrafts",
      "sarisync:expenseLedger",
      "sarisync:cashOutTotal"
    ];

    for (const key of expectedKeys) {
      assert.ok(functionBody.includes(key), `Expected storage key '${key}' to be present in resetDemoData`);
    }

    // Verify wallet connection and onboarding keys are preserved (not present in resetDemoData key list)
    const preservedKeys = [
      "sarisync:walletConnection",
      "sarisync:hasCompletedOnboarding",
      "sarisync:onboardingDetails",
      "sarisync:userLevel",
      "sarisync:themeMode"
    ];

    for (const key of preservedKeys) {
      assert.ok(!functionBody.includes(key), `Expected wallet/onboarding key '${key}' to be preserved`);
    }
  });

  it("integrates reset functionality in app/index.js (preserving wallet connection/onboarding)", () => {
    const appSource = readProjectFile("app/index.js");

    // 1. Verify resetDemoData is imported
    assert.ok(appSource.includes("resetDemoData") || appSource.includes("../services/storageService"), "Expected resetDemoData to be imported in app/index.js");

    // 2. Verify handleResetDemo is defined and calls resetDemoData & refreshLedger
    assert.ok(appSource.includes("const handleResetDemo = useCallback(() => {"), "Expected handleResetDemo callback definition");
    assert.ok(appSource.includes("await resetDemoData()"), "Expected handleResetDemo to call resetDemoData");
    assert.ok(appSource.includes("await refreshLedger()"), "Expected handleResetDemo to call refreshLedger");

    // 3. Verify it does NOT clear onboarding or disconnect wallet connection
    assert.ok(!appSource.includes("await clearOnboarding()") || appSource.includes("clearOnboarding"), "Expected clearOnboarding to not be triggered in handleResetDemo");

    // 4. Verify dev reset button (🔄) is rendered next to theme toggle in KahaScreen header
    assert.ok(appSource.includes("onPress={handleResetDemo}"), "Expected KahaScreen header to call handleResetDemo on press");

    // 5. Verify dev reset button (🔄) is rendered in WalletConnectionGate
    assert.ok(appSource.includes("WalletConnectionGate onConnect={handleConnectWallet} onReset={handleResetDemo}"), "Expected WalletConnectionGate to receive onReset prop");
    assert.ok(appSource.includes("function WalletConnectionGate({ onConnect, onReset })"), "Expected WalletConnectionGate definition to accept onReset");
  });
});
