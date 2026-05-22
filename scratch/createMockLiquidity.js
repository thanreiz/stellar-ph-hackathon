import { readFile } from "node:fs/promises";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

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
  if (!env[key]) throw new Error(`${key} is required in .env`);
  return env[key];
}

async function run() {
  const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  const horizonUrl = requireEnv(env, "EXPO_PUBLIC_HORIZON_URL");
  const storeSecret = requireEnv(env, "EXPO_PUBLIC_STORE_SECRET_KEY");
  const phpcIssuer = requireEnv(env, "EXPO_PUBLIC_PHPC_ISSUER");
  const usdcIssuer = requireEnv(env, "EXPO_PUBLIC_USDC_ISSUER");

  const server = new Horizon.Server(horizonUrl);
  const store = Keypair.fromSecret(storeSecret);

  const phpc = new Asset("PHPC", phpcIssuer);
  const usdc = new Asset("USDC", usdcIssuer);

  console.log("Store public key:", store.publicKey());
  console.log("PHPC issuer:", phpcIssuer);
  console.log("USDC issuer:", usdcIssuer);

  const storeAccount = await server.loadAccount(store.publicKey());

  console.log("\nCurrent balances:");
  storeAccount.balances.forEach((b) => {
    const code = b.asset_type === "native" ? "XLM" : b.asset_code;
    console.log(`  ${code}: ${b.balance}`);
  });

  // Check existing offers to avoid duplicates
  const existingOffers = await server.offers().forAccount(store.publicKey()).call();
  console.log(`\nExisting offers: ${existingOffers.records.length}`);
  existingOffers.records.forEach((o) => {
    console.log(`  Offer ${o.id}: selling ${o.selling.asset_code || 'XLM'} -> buying ${o.buying.asset_code || 'XLM'}, amount: ${o.amount}, price: ${o.price}`);
  });

  // Rate: 1 USDC = ~56 PHPC (1 USD ≈ 56 PHP)
  // Offer 1: Sell PHPC, buy USDC  → price in USDC per PHPC = 1/56 ≈ 0.0178571
  // Offer 2: Sell USDC, buy PHPC  → price in PHPC per USDC = 56
  
  console.log("\nBuilding liquidity offer transaction...");
  const tx = new TransactionBuilder(storeAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      // Offer: I will sell PHPC and receive USDC
      // price = USDC per PHPC = 0.0178571 (1/56)
      Operation.manageSellOffer({
        selling: phpc,
        buying: usdc,
        amount: "1000",  // sell up to 1000 PHPC
        price: { n: 1, d: 56 },  // 1 USDC per 56 PHPC
        offerId: "0",  // 0 = new offer
      })
    )
    .addOperation(
      // Offer: I will sell USDC and receive PHPC
      // price = PHPC per USDC = 56
      Operation.manageSellOffer({
        selling: usdc,
        buying: phpc,
        amount: "50",  // sell up to 50 USDC
        price: { n: 56, d: 1 },  // 56 PHPC per USDC
        offerId: "0",
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(store);

  console.log("Submitting to Testnet DEX...");
  try {
    const response = await server.submitTransaction(tx);
    console.log("\n✅ SUCCESS! Liquidity offers created.");
    console.log(`Transaction Hash: ${response.hash}`);
  } catch (err) {
    console.error("\n❌ FAILED:", err.message);
    if (err.response?.data?.extras) {
      console.error("Result codes:", JSON.stringify(err.response.data.extras.result_codes, null, 2));
    }
    if (err.response?.data?.detail) {
      console.error("Detail:", err.response.data.detail);
    }
  }
}

run().catch(console.error);
