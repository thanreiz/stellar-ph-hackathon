import { readFile } from "node:fs/promises";
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

const targetPhpc = 20000;

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function requireEnv(env, key) {
  if (!env[key]) {
    throw new Error(`${key} is required in .env`);
  }

  return env[key];
}

function findAssetBalance(account, assetCode, issuer) {
  const balance = account.balances.find(
    (item) => item.asset_code === assetCode && item.asset_issuer === issuer,
  );

  return Number(balance?.balance || 0);
}

const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const lenders = JSON.parse(await readFile(new URL("../lenders.json", import.meta.url), "utf8"));
const horizonUrl = requireEnv(env, "EXPO_PUBLIC_HORIZON_URL");
const storeSecret = requireEnv(env, "EXPO_PUBLIC_STORE_SECRET_KEY");
const phpcIssuer = requireEnv(env, "EXPO_PUBLIC_PHPC_ISSUER");

const server = new Horizon.Server(horizonUrl);
const store = Keypair.fromSecret(storeSecret);
const phpc = new Asset("PHPC", phpcIssuer);

for (const lender of lenders) {
  const lenderAccount = await server.loadAccount(lender.publicKey);
  const currentPhpc = findAssetBalance(lenderAccount, "PHPC", phpcIssuer);
  const topUpAmount = Math.max(0, targetPhpc - currentPhpc);

  if (topUpAmount <= 0) {
    console.log(`${lender.name}: already funded with ${currentPhpc.toFixed(7)} PHPC`);
    continue;
  }

  const sourceAccount = await server.loadAccount(store.publicKey());
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: lender.publicKey,
        asset: phpc,
        amount: topUpAmount.toFixed(7),
      }),
    )
    .addMemo(Memo.text("SariSync seed"))
    .setTimeout(60)
    .build();

  transaction.sign(store);
  const response = await server.submitTransaction(transaction);

  console.log(`${lender.name}: funded ${topUpAmount.toFixed(7)} PHPC`);
  console.log(`TX: ${response.hash}`);
}
