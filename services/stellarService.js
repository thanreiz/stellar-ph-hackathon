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

// Task 2-C — demo-safe Horizon submission timeout (module-scope, reusable)
const HORIZON_TIMEOUT_MS = 20000;
const HORIZON_TRANSACTION_MAX_TIME_SECONDS = 300;
const MAX_SUBMISSION_ATTEMPTS = 2;

function horizonTimeout() {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('[SariSync] Horizon Testnet did not respond within 20s. Try again.')),
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

function isTxTooLate(error) {
  const resultCodes = error?.response?.data?.extras?.result_codes;
  return (
    resultCodes?.transaction === "tx_too_late" ||
    extractHorizonError(error).includes("tx_too_late")
  );
}

async function submitWithFreshTransaction(server, buildTransaction) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_SUBMISSION_ATTEMPTS; attempt += 1) {
    const transaction = await buildTransaction();

    try {
      return await Promise.race([
        server.submitTransaction(transaction),
        horizonTimeout(),
      ]);
    } catch (error) {
      lastError = error;
      if (!isTxTooLate(error) || attempt === MAX_SUBMISSION_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError;
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
    const phpcAsset = new Asset("PHPC", config.phpcIssuer);
    const usdcAsset = new Asset("USDC", config.usdcIssuer);
    const destinationAmount = normalizeAmount(amountUsdc);
    const sendMax = normalizeAmount(sendMaxPhpc);

    const response = await submitWithFreshTransaction(server, async () => {
      const sourceAccount = await server.loadAccount(keypair.publicKey());

      // Task 2-A — PHPC trustline check before building the transaction
      const phpcIssuer = process.env.EXPO_PUBLIC_PHPC_ISSUER;
      const hasTrustline = sourceAccount.balances.some(
        b => b.asset_type !== 'native'
          && b.asset_code === 'PHPC'
          && b.asset_issuer === phpcIssuer
      );

      if (!hasTrustline) {
        throw new Error(
          'Store wallet has no PHPC trustline. ' +
          'Fund the Testnet account and add a PHPC trustline at laboratory.stellar.org before transacting.',
        );
      }

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
        .setTimeout(HORIZON_TRANSACTION_MAX_TIME_SECONDS)
        .build();

      transaction.sign(keypair);
      return transaction;
    });

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

/**
 * Receive a PHPC loan from a microlending company.
 * The lender's keypair signs a payment to the store's public key.
 */
export async function receiveLoanFromLender({ lenderSecretKey, amountPhpc, borrowerPublicKey }) {
  try {
    const config = getStellarConfig();
    validateConfig(config);

    const destinationPublicKey = borrowerPublicKey || config.storePublicKey;
    if (typeof destinationPublicKey !== "string" || !destinationPublicKey.startsWith("G")) {
      throw new Error("Connect a valid Stellar borrower account first.");
    }

    const server = getHorizonServer();

    const lenderKeypair = Keypair.fromSecret(lenderSecretKey);
    const phpcAsset = new Asset('PHPC', config.phpcIssuer);

    const response = await submitWithFreshTransaction(server, async () => {
      const lenderAccount = await server.loadAccount(lenderKeypair.publicKey());
      const transaction = new TransactionBuilder(lenderAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: destinationPublicKey,
            asset: phpcAsset,
            amount: normalizeAmount(amountPhpc),
          })
        )
        .addMemo(Memo.text('SariSync Loan'))
        .setTimeout(HORIZON_TRANSACTION_MAX_TIME_SECONDS)
        .build();

      transaction.sign(lenderKeypair);
      return transaction;
    });

    return { success: true, transactionHash: response.hash };
  } catch (error) {
    return { success: false, error: extractHorizonError(error) };
  }
}

/**
 * Repay a PHPC loan back to a lender's public key.
 * Signed by the store's secret key.
 */
export async function repayLoan({ lenderPublicKey, amountPhpc, memo = 'SariSync Repay' }) {
  try {
    const config = getStellarConfig();
    validateConfig(config);

    const server = getHorizonServer();
    const storeKeypair = Keypair.fromSecret(config.storeSecretKey);
    const phpcAsset = new Asset('PHPC', config.phpcIssuer);

    const response = await submitWithFreshTransaction(server, async () => {
      const storeAccount = await server.loadAccount(config.storePublicKey);
      const transaction = new TransactionBuilder(storeAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: lenderPublicKey,
            asset: phpcAsset,
            amount: normalizeAmount(amountPhpc),
          })
        )
        .addMemo(Memo.text(memo.slice(0, 28)))
        .setTimeout(HORIZON_TRANSACTION_MAX_TIME_SECONDS)
        .build();

      transaction.sign(storeKeypair);
      return transaction;
    });

    return { success: true, transactionHash: response.hash };
  } catch (error) {
    return { success: false, error: extractHorizonError(error) };
  }
}

/**
 * Validate a Stellar transaction hash — queries Horizon and returns parsed result.
 */
export async function validateStellarTransaction(txHash) {
  try {
    if (!txHash || typeof txHash !== 'string' || txHash.length < 10) {
      return { success: false, error: 'Invalid transaction hash.' };
    }

    const server = getHorizonServer();
    const tx = await server.transactions().transaction(txHash.trim()).call();

    return {
      success: true,
      hash: tx.hash,
      ledger: tx.ledger,
      createdAt: tx.created_at,
      sourceAccount: tx.source_account,
      operationCount: tx.operation_count,
      memo: tx.memo || null,
      successful: tx.successful,
    };
  } catch (error) {
    return { success: false, error: 'Transaction not found on Horizon Testnet.' };
  }
}
