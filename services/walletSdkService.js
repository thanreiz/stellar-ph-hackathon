import * as walletSdk from "@stellar/typescript-wallet-sdk";

export const WALLET_SDK_NETWORK = "testnet";

let sharedWallet = null;

export function getSariSyncWalletSdk() {
  if (!sharedWallet) {
    sharedWallet = walletSdk.Wallet.TestNet();
  }

  return sharedWallet;
}

export function getSariSyncWalletStellar() {
  return getSariSyncWalletSdk().stellar();
}

export function getWalletSdkPackage() {
  return walletSdk;
}
