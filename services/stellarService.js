import {
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getHorizonServer, getSariSyncWalletStellar } from "./walletSdkService";

const _SECRET_KEY = process.env.EXPO_PUBLIC_STORE_SECRET_KEY;
const _PUBLIC_KEY = process.env.EXPO_PUBLIC_STORE_PUBLIC_KEY;

if (!_SECRET_KEY || !_PUBLIC_KEY) {
  throw new Error(
    '[SariSync] Stellar keypair is not configured.\n' +
    'Copy .env.example to .env and fill in your Testnet keypair before starting the app.\n' +
    'See .env.example for instructions.'
  );
}

// Task 2-C — 5-second Horizon submission timeout (module-scope, reusable)
const HORIZON_TIMEOUT_MS = 5000;

function horizonTimeout() {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('[SariSync] Horizon Testnet did not respond within 5s. Try again.')),
      HORIZON_TIMEOUT_MS
    )
  );
}

function getEnvValue(key, fallback = "") {
  return process.env[key] || fallback;
}

function getStellarConfig() {
  return {
    storeSecretKey: getEnvValue("EXPO_PUBLIC_STORE_SECRET_KEY"),
    storePublicKey: getEnvValue("EXPO_PUBLIC_STORE_PUBLIC_KEY"),
    phpcIssuer: getEnvValue("EXPO_PUBLIC_PHPC_ISSUER"),
    usdcIssuer: getEnvValue("EXPO_PUBLIC_USDC_ISSUER"),
    network: getEnvValue("EXPO_PUBLIC_STELLAR_NETWORK", "testnet"),
  };
}

function validateConfig(config) {
  if (config.network !== "testnet") {
    throw new Error("SariSync Ledger only supports Stellar TESTNET.");
  }

  if (!config.storeSecretKey) {
    throw new Error("Missing EXPO_PUBLIC_STORE_SECRET_KEY.");
  }

  if (!config.phpcIssuer || !config.usdcIssuer) {
    throw new Error("Missing PHPC or USDC issuer in Expo public environment.");
  }
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid inventory invoice amount.");
  }

  return amount.toFixed(7);
}

function extractHorizonError(error) {
  const extras = error?.response?.data?.extras;
  const resultCodes = extras?.result_codes;
  const detail = error?.response?.data?.detail;

  if (resultCodes) {
    return JSON.stringify(resultCodes);
  }

  return detail || error.message || "Stellar settlement failed.";
}

export async function submitInventoryFinancingSettlement({
  supplierPubkey,
  amountUsdc,
  sendMaxPhpc,   // required numeric string — loan limit for this store's credit stage
}) {
  // Task 2-B guard — sendMaxPhpc is required and must be numeric
  if (!sendMaxPhpc || isNaN(parseFloat(sendMaxPhpc))) {
    return {
      success: false,
      error: 'sendMaxPhpc is required and must be a numeric string.',
    };
  }

  try {
    const config = getStellarConfig();
    validateConfig(config);

    if (typeof supplierPubkey !== "string" || !supplierPubkey.startsWith("G")) {
      throw new Error("Invalid B2B supplier public key.");
    }

    const keypair = Keypair.fromSecret(config.storeSecretKey);
    getSariSyncWalletStellar();

    // Task 2-D — single Horizon client via walletSdkService singleton
    const server = getHorizonServer();
    const sourceAccount = await server.loadAccount(keypair.publicKey());

    // Task 2-A — PHPC trustline check before building the transaction
    const phpcIssuer = process.env.EXPO_PUBLIC_PHPC_ISSUER;
    const hasTrustline = sourceAccount.balances.some(
      b => b.asset_type !== 'native'
        && b.asset_code === 'PHPC'
        && b.asset_issuer === phpcIssuer
    );

    if (!hasTrustline) {
      return {
        success: false,
        error:
          'Store wallet has no PHPC trustline. ' +
          'Fund the Testnet account and add a PHPC trustline at laboratory.stellar.org before transacting.',
      };
    }

    const phpcAsset = new Asset("PHPC", config.phpcIssuer);
    const usdcAsset = new Asset("USDC", config.usdcIssuer);
    const destinationAmount = normalizeAmount(amountUsdc);
    const sendMax = normalizeAmount(sendMaxPhpc);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: phpcAsset,
          sendMax,
          destination: supplierPubkey,
          destAsset: usdcAsset,
          destAmount: destinationAmount,
          path: [],
        }),
      )
      .addMemo(Memo.text("SariSync B2B"))
      .setTimeout(60)
      .build();

    transaction.sign(keypair);

    // Task 2-C — enforce 5-second Horizon submission timeout
    const response = await Promise.race([
      server.submitTransaction(transaction),
      horizonTimeout(),
    ]);

    return {
      success: true,
      transactionHash: response.hash,
    };
  } catch (error) {
    return {
      success: false,
      error: extractHorizonError(error),
    };
  }
}
