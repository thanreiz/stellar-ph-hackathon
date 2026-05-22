/**
 * Creates a USDC/PHPC AMM constant-product liquidity pool on Stellar Testnet.
 * This enables path payments: XLM → USDC → PHPC (via DEX + pool).
 *
 * Steps:
 * 1. Establish liquidity pool trustline (pool_share)
 * 2. Deposit USDC + PHPC into the pool
 */
import { readFile } from "node:fs/promises";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  LiquidityPoolAsset,
  getLiquidityPoolId,
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

  const phpc = new Asset("PHPC", env.EXPO_PUBLIC_PHPC_ISSUER);
  const usdc = new Asset("USDC", env.EXPO_PUBLIC_USDC_ISSUER);

  // Stellar requires assets in canonical order for LP (lexicographic by code:issuer)
  // PHPC vs USDC — P < U, so PHPC comes first
  const lpAsset = new LiquidityPoolAsset(phpc, usdc, 30); // 30 = 0.30% fee

  const poolId = getLiquidityPoolId("constant_product", lpAsset.getLiquidityPoolParameters());
  console.log("Pool ID:", poolId.toString("hex"));
  console.log("PHPC issuer:", env.EXPO_PUBLIC_PHPC_ISSUER);
  console.log("USDC issuer:", env.EXPO_PUBLIC_USDC_ISSUER);

  const storeAccount = await server.loadAccount(store.publicKey());
  console.log("\nStep 1: Establish LP trustline and deposit liquidity...");
  console.log("Depositing: 1000 PHPC + 17.857 USDC (rate: 56 PHPC per USDC)");

  const tx = new TransactionBuilder(storeAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    // Step 1: Trust the LP share asset
    .addOperation(
      Operation.changeTrust({
        asset: lpAsset,
        limit: "1000000",
      })
    )
    // Step 2: Deposit funds into the pool
    .addOperation(
      Operation.liquidityPoolDeposit({
        liquidityPoolId: poolId.toString("hex"),
        maxAmountA: "1000",    // PHPC (asset A, alphabetically first)
        maxAmountB: "17.857",  // USDC (asset B)
        minPrice: { n: 50, d: 1 },  // min 50 PHPC per USDC
        maxPrice: { n: 62, d: 1 },  // max 62 PHPC per USDC
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(store);

  console.log("Submitting...");
  try {
    const res = await server.submitTransaction(tx);
    console.log("✅ Liquidity pool created and funded!");
    console.log("TX Hash:", res.hash);
    console.log("Pool ID:", poolId.toString("hex"));

    // Verify path payment now works
    console.log("\nChecking if path payment is now discoverable...");
    await new Promise(r => setTimeout(r, 3000)); // wait for ledger

    const pathUrl = `${env.EXPO_PUBLIC_HORIZON_URL}/paths/strict-receive?source_assets=native&destination_asset_type=credit_alphanum4&destination_asset_code=PHPC&destination_asset_issuer=${env.EXPO_PUBLIC_PHPC_ISSUER}&destination_amount=100`;
    const pathRes = await fetch(pathUrl);
    const pathData = await pathRes.json();
    if (pathData._embedded?.records?.length > 0) {
      console.log("✅ Path payment route FOUND!");
      pathData._embedded.records.forEach((p, i) => {
        console.log(`  Path ${i+1}: via ${JSON.stringify(p.path)} — needs ${p.source_amount} XLM`);
      });
    } else {
      console.log("⚠️  Path not discoverable yet (may take a few seconds).");
      console.log("Pool is live. Try path payment manually.");
    }
  } catch (err) {
    console.error("❌ FAILED:", err.message);
    if (err.response?.data?.extras) {
      console.error("Result codes:", JSON.stringify(err.response.data.extras.result_codes, null, 2));
    }
  }
}

run().catch(console.error);
