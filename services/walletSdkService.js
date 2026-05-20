import { Horizon } from '@stellar/stellar-sdk';
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

let _server = null;

export function getHorizonServer() {
  if (!_server) {
    const url = process.env.EXPO_PUBLIC_HORIZON_URL;
    if (!url) throw new Error('[SariSync] EXPO_PUBLIC_HORIZON_URL is not set.');
    _server = new Horizon.Server(url);
  }
  return _server;
}
