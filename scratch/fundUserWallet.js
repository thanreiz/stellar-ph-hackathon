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

const USER_WALLET = "GCTSKXUGU2MG6A6B53YMSLLVO4UGATKW367EB6FV6OW7ZPOLJZO6W2AH";

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

async function run() {
  const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  const horizonUrl = requireEnv(env, "EXPO_PUBLIC_HORIZON_URL");
  const storeSecret = requireEnv(env, "EXPO_PUBLIC_STORE_SECRET_KEY");
  const phpcIssuer = requireEnv(env, "EXPO_PUBLIC_PHPC_ISSUER");
  
  const server = new Horizon.Server(horizonUrl);
  const store = Keypair.fromSecret(storeSecret);
  const phpc = new Asset("PHPC", phpcIssuer);
  
  console.log(`Checking if user wallet ${USER_WALLET} has PHPC trustline...`);
  let userAccount;
  try {
    userAccount = await server.loadAccount(USER_WALLET);
  } catch (error) {
    console.error(`Error loading user account: ${error.message}`);
    return;
  }
  
  const hasTrustline = userAccount.balances.some(
    (b) => b.asset_code === "PHPC" && b.asset_issuer === phpcIssuer
  );
  
  if (!hasTrustline) {
    console.error(`\n[ERROR] User wallet ${USER_WALLET} does not have a PHPC trustline yet.`);
    console.error(`Please establish the trustline first using the Stellar Laboratory URL.`);
    return;
  }
  
  console.log(`PHPC trustline found! Preparing transfer...`);
  const transferAmount = "1000.0000000";
  
  console.log(`Loading store account ${store.publicKey()}...`);
  const sourceAccount = await server.loadAccount(store.publicKey());
  
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
  .addOperation(
    Operation.payment({
      destination: USER_WALLET,
      asset: phpc,
      amount: transferAmount,
    })
  )
  .addMemo(Memo.text("SariSync Demo Fund"))
  .setTimeout(60)
  .build();
  
  tx.sign(store);
  
  console.log(`Submitting payment transaction to Horizon...`);
  const response = await server.submitTransaction(tx);
  console.log(`\n[SUCCESS] Successfully sent ${transferAmount} PHPC to ${USER_WALLET}!`);
  console.log(`Transaction Hash: ${response.hash}`);
}

run().catch(console.error);
