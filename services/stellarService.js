import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getSariSyncWalletStellar } from "./walletSdkService";

const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";

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
    horizonUrl: getEnvValue("EXPO_PUBLIC_HORIZON_URL", DEFAULT_HORIZON_URL),
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
  sendMaxPhpc,
}) {
  try {
    const config = getStellarConfig();
    validateConfig(config);

    if (typeof supplierPubkey !== "string" || !supplierPubkey.startsWith("G")) {
      throw new Error("Invalid B2B supplier public key.");
    }

    const keypair = Keypair.fromSecret(config.storeSecretKey);
    getSariSyncWalletStellar();
    const server = new Horizon.Server(config.horizonUrl);
    const sourceAccount = await server.loadAccount(keypair.publicKey());

    const phpcAsset = new Asset("PHPC", config.phpcIssuer);
    const usdcAsset = new Asset("USDC", config.usdcIssuer);
    const destinationAmount = normalizeAmount(amountUsdc);
    const sendMax = normalizeAmount(sendMaxPhpc || Number(amountUsdc) * 60);

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

    const response = await server.submitTransaction(transaction);

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
