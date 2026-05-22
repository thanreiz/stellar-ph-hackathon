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
  const config = getStellarConfig();
  const isPublic = config.network === "public" || config.network === "mainnet";
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`[SariSync] Horizon ${isPublic ? 'Mainnet' : 'Testnet'} did not respond within 20s. Try again.`)),
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
  if (config.network !== "testnet" && config.network !== "public" && config.network !== "mainnet") {
    throw new Error("SariSync Ledger only supports Stellar TESTNET or MAINNET/PUBLIC.");
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

      const isPublic = config.network === "public" || config.network === "mainnet";
      const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
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
      const isPublic = config.network === "public" || config.network === "mainnet";
      const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;
      const transaction = new TransactionBuilder(lenderAccount, {
        fee: BASE_FEE,
        networkPassphrase,
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
      const isPublic = config.network === "public" || config.network === "mainnet";
      const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;
      const transaction = new TransactionBuilder(storeAccount, {
        fee: BASE_FEE,
        networkPassphrase,
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
    const config = getStellarConfig();
    const isPublic = config.network === "public" || config.network === "mainnet";
    return { success: false, error: `Transaction not found on Horizon ${isPublic ? 'Mainnet' : 'Testnet'}.` };
  }
}

/**
 * Fetch the store's current on-chain balances for native XLM and custom assets (PHPC, USDC).
 */
export async function getStoreBalances(publicKey) {
  try {
    const config = getStellarConfig();
    const server = getHorizonServer();
    const account = await server.loadAccount(publicKey);
    
    let xlmBalance = "0.0000";
    let phpcBalance = "0.0000";
    let usdcBalance = "0.0000";
    
    account.balances.forEach(b => {
      if (b.asset_type === "native") {
        xlmBalance = b.balance;
      } else if (b.asset_code === "PHPC" && b.asset_issuer === config.phpcIssuer) {
        phpcBalance = b.balance;
      } else if (b.asset_code === "USDC" && b.asset_issuer === config.usdcIssuer) {
        usdcBalance = b.balance;
      }
    });
    
    return {
      xlm: xlmBalance,
      phpc: phpcBalance,
      usdc: usdcBalance,
    };
  } catch (error) {
    console.warn("[StellarService] Failed to fetch balances from Horizon:", error);
    return null;
  }
}

/**
 * Fetch live wallet balances from the Stellar Horizon Testnet.
 * Extract native (XLM) and PHPC balances. Do not mock.
 * Throws an error if loading the account fails.
 */
export async function fetchLiveWalletBalances(publicKey) {
  try {
    const config = getStellarConfig();
    const server = getHorizonServer();
    const account = await server.loadAccount(publicKey);
    
    let xlmBalance = "0.0000";
    let phpcBalance = "0.0000";
    
    account.balances.forEach(b => {
      if (b.asset_type === "native") {
        xlmBalance = b.balance;
      } else if (b.asset_code === "PHPC" && b.asset_issuer === config.phpcIssuer) {
        phpcBalance = b.balance;
      }
    });
    
    return {
      xlm: xlmBalance,
      phpc: phpcBalance,
    };
  } catch (err) {
    if (err.status === 404 || err.message?.includes("404") || err.name === "NotFoundError") {
      return {
        xlm: "0.0000",
        phpc: "0.0000",
      };
    }
    throw err;
  }
}

/**
 * Fetch the current exchange rate of XLM in Philippine Pesos (PHP).
 * Calls CryptoCompare or CoinGecko dynamically, falling back to 8.5 if rate-limited or offline.
 */
export async function fetchXlmToPhpRate() {
  try {
    const response = await fetch("https://min-api.cryptocompare.com/data/price?fsym=XLM&tsyms=PHP", {
      headers: { "Accept": "application/json" }
    });
    const data = await response.json();
    if (data && data.PHP) {
      return Number(data.PHP);
    }
  } catch (error) {
    console.warn("[StellarService] Failed to fetch XLM rate from cryptocompare, trying CoinGecko...", error);
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=php", {
        headers: { "Accept": "application/json" }
      });
      const data = await response.json();
      if (data && data.stellar && data.stellar.php) {
        return Number(data.stellar.php);
      }
    } catch (err2) {
      console.warn("[StellarService] Failed to fetch XLM rate from CoinGecko, using fallback standard.", err2);
    }
  }
  return 8.50; // Fallback rate: 1 XLM = 8.50 PHP
}

/**
 * Cash out PHPC to the anchor (PHPC issuer representing the gateway).
 * Signed by the store's secret key.
 */
export async function cashOutPHPC({ amountPhpc, memo = 'SariSync Cashout' }) {
  try {
    const config = getStellarConfig();
    validateConfig(config);

    const server = getHorizonServer();
    const storeKeypair = Keypair.fromSecret(config.storeSecretKey);
    const phpcAsset = new Asset('PHPC', config.phpcIssuer);

    const response = await submitWithFreshTransaction(server, async () => {
      const storeAccount = await server.loadAccount(config.storePublicKey);
      const isPublic = config.network === "public" || config.network === "mainnet";
      const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;
      const transaction = new TransactionBuilder(storeAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: config.phpcIssuer, // Anchor/issuer is the off-ramp gateway
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


