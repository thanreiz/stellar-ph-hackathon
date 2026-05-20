import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSariSyncWalletSdk,
  getSariSyncWalletStellar,
  WALLET_SDK_NETWORK,
} from "../services/walletSdkService.js";

describe("wallet sdk singleton", () => {
  it("creates one shared Stellar Testnet wallet SDK instance", () => {
    const walletA = getSariSyncWalletSdk();
    const walletB = getSariSyncWalletSdk();

    assert.equal(WALLET_SDK_NETWORK, "testnet");
    assert.equal(walletA, walletB);
  });

  it("exposes the wallet SDK Stellar helper for basic Horizon flows", () => {
    const stellar = getSariSyncWalletStellar();

    assert.equal(typeof stellar, "object");
  });
});
