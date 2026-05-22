/**
 * Test end-to-end: XLM → USDC → PHPC path payment (what the Cash In modal does)
 * Uses the store account on testnet.
 */
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

async function run() {
  const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  const server = new Horizon.Server(env.EXPO_PUBLIC_HORIZON_URL);
  const store = Keypair.fromSecret(env.EXPO_PUBLIC_STORE_SECRET_KEY);

  const xlm = Asset.native();
  const usdc = new Asset("USDC", env.EXPO_PUBLIC_USDC_ISSUER);
  const phpc = new Asset("PHPC", env.EXPO_PUBLIC_PHPC_ISSUER);

  // How much PHPC we want to receive
  const destAmount = "100.0000000"; // 100 PHPC
  // Max XLM willing to spend (with some slippage buffer)
  // At ~56 PHPC/USDC and ~0.12 USD/XLM, 100 PHPC ≈ 1.79 USDC ≈ ~15 XLM, give 50% buffer
  const sendMax = "30.0000000";

  console.log("Store:", store.publicKey());
  console.log(`Swapping up to ${sendMax} XLM → USDC → ${destAmount} PHPC`);
  console.log("PHPC issuer:", env.EXPO_PUBLIC_PHPC_ISSUER);
  console.log("USDC issuer:", env.EXPO_PUBLIC_USDC_ISSUER);

  // Check current offers first
  const xlmUsdcOffers = await server.orderbook(xlm, usdc).call();
  console.log(`\nXLM→USDC orderbook: ${xlmUsdcOffers.asks.length} asks`);

  const usdcPhpcOffers = await server.orderbook(usdc, phpc).call();
  console.log(`USDC→PHPC orderbook: ${usdcPhpcOffers.asks.length} asks`);
  if (usdcPhpcOffers.asks.length > 0) {
    console.log("  Best ask:", usdcPhpcOffers.asks[0]);
  }

  const storeAccount = await server.loadAccount(store.publicKey());

  const tx = new TransactionBuilder(storeAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: xlm,
        sendMax,
        destination: store.publicKey(), // self-swap
        destAsset: phpc,
        destAmount,
        path: [usdc], // XLM → USDC → PHPC
      })
    )
    .addMemo(Memo.text("SariSync CashIn"))
    .setTimeout(60)
    .build();

  tx.sign(store);

  console.log("\nSubmitting path payment...");
  try {
    const res = await server.submitTransaction(tx);
    console.log("✅ SUCCESS! TX Hash:", res.hash);
    console.log("View: https://stellar.expert/explorer/testnet/tx/" + res.hash);
  } catch (err) {
    console.error("❌ FAILED:", err.message);
    if (err.response?.data?.extras) {
      console.error("Result codes:", JSON.stringify(err.response.data.extras.result_codes, null, 2));
    }
  }
}

run().catch(console.error);
