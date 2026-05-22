/**
 * SariSync PHPC Mainnet Setup
 * ============================
 * The STORE account (GDKM43OI...) acts as both the PHPC issuer AND the store.
 * This is valid for hackathon demo — issuer can mint PHPC to any account with a trustline.
 *
 * Run AFTER user has sent 3 XLM to the store account from Freighter.
 *
 * What this does:
 * 1. Verifies store account is funded on mainnet
 * 2. Places a DEX sell offer: PHPC for XLM (rate: 56 PHPC per XLM equivalent)
 *    → Enables direct XLM → PHPC path payments (no USDC needed)
 * 3. Checks if user wallet has PHPC trustline, prints Lab URL if not
 * 4. If trustline found → mints PHPC to user wallet
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

const USER_WALLET = "GCTSKXUGU2MG6A6B53YMSLLVO4UGATKW367EB6FV6OW7ZPOLJZO6W2AH";
const MAINNET_HORIZON = "https://horizon.stellar.org";

function parseEnv(text) {
  return Object.fromEntries(
    text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
  );
}

async function run() {
  const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  const server = new Horizon.Server(MAINNET_HORIZON);
  const store = Keypair.fromSecret(env.EXPO_PUBLIC_STORE_SECRET_KEY);

  // On mainnet, store is the PHPC issuer (self-issued for demo)
  const PHPC_ISSUER_MAINNET = store.publicKey();
  const phpc = new Asset("PHPC", PHPC_ISSUER_MAINNET);
  const xlm = Asset.native();

  console.log("=== SariSync PHPC Mainnet Setup ===");
  console.log("Store/Issuer:", store.publicKey());
  console.log("User Wallet: ", USER_WALLET);

  // Step 1: Verify store is funded
  let storeAccount;
  try {
    storeAccount = await server.loadAccount(store.publicKey());
    const xlmBal = storeAccount.balances.find(b => b.asset_type === "native")?.balance;
    console.log("\n✅ Store funded! XLM balance:", xlmBal);
  } catch (err) {
    console.error("\n❌ Store account NOT funded on mainnet yet.");
    console.error("→ Send at least 3 XLM to: " + store.publicKey());
    console.error("→ Then re-run this script.");
    process.exit(1);
  }

  // Step 2: Place DEX offer — Store sells PHPC for XLM
  // Rate: 1 XLM ≈ 8 PHP → 1 XLM = 8 PHPC (conservative for demo)
  // This enables path payment: XLM → PHPC directly via DEX
  console.log("\n[1/3] Placing XLM/PHPC DEX offer on mainnet...");
  const existingOffers = await server.offers().forAccount(store.publicKey()).call();
  const hasPhpcOffer = existingOffers.records.some(o =>
    o.selling?.asset_code === "PHPC" && o.selling?.asset_issuer === PHPC_ISSUER_MAINNET
  );

  if (!hasPhpcOffer) {
    const offerTx = new TransactionBuilder(storeAccount, {
      fee: "1000",
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(
        // Store sells PHPC, buyer pays XLM
        // price = XLM per PHPC = 1/8 (1 XLM buys 8 PHPC)
        Operation.manageSellOffer({
          selling: phpc,
          buying: xlm,
          amount: "10000",              // 10,000 PHPC available
          price: { n: 1, d: 8 },       // 1/8 XLM per PHPC
          offerId: "0",
        })
      )
      .setTimeout(60)
      .build();

    offerTx.sign(store);
    const offerRes = await server.submitTransaction(offerTx);
    console.log("✅ DEX offer placed! TX:", offerRes.hash);
    console.log("   → Users can now swap XLM → PHPC directly on mainnet DEX");
  } else {
    console.log("✅ DEX offer already exists, skipping.");
  }

  // Step 3: Check user wallet for PHPC trustline
  console.log("\n[2/3] Checking user wallet for PHPC trustline...");
  const userAccount = await server.loadAccount(USER_WALLET);
  const hasTrustline = userAccount.balances.some(
    b => b.asset_code === "PHPC" && b.asset_issuer === PHPC_ISSUER_MAINNET
  );

  if (!hasTrustline) {
    // Build the trustline URL for Stellar Lab (mainnet)
    const trustXdr = encodeURIComponent(
      new TransactionBuilder(userAccount, {
        fee: "1000",
        networkPassphrase: Networks.PUBLIC,
      })
        .addOperation(Operation.changeTrust({ asset: phpc }))
        .setTimeout(300)
        .build()
        .toXDR()
    );

    console.log("\n⚠️  User wallet does NOT have PHPC trustline yet.");
    console.log("\n→ Open this URL in browser and sign with Freighter (MAINNET):");
    console.log(`\nhttps://laboratory.stellar.org/transaction/sign?xdr=${trustXdr}&network=mainnet`);
    console.log("\n→ After signing, re-run this script to mint PHPC.");
    process.exit(0);
  }

  // Step 4: Mint PHPC to user wallet
  console.log("\n[3/3] Minting 1,000 PHPC to user wallet on mainnet...");
  // Reload store account for fresh sequence number
  const freshStore = await server.loadAccount(store.publicKey());
  const mintTx = new TransactionBuilder(freshStore, {
    fee: "1000",
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.payment({
        destination: USER_WALLET,
        asset: phpc,
        amount: "1000",
      })
    )
    .addMemo(Memo.text("SariSync PHPC Mainnet"))
    .setTimeout(60)
    .build();

  mintTx.sign(store);
  const mintRes = await server.submitTransaction(mintTx);
  console.log("✅ 1,000 PHPC minted to user wallet!");
  console.log("TX Hash:", mintRes.hash);
  console.log("View: https://stellar.expert/explorer/public/tx/" + mintRes.hash);
  console.log("\n=== MAINNET SETUP COMPLETE ===");
  console.log("PHPC Issuer:", PHPC_ISSUER_MAINNET);
  console.log("User wallet has PHPC + XLM→PHPC swap is live on mainnet DEX!");
}

run().catch(err => {
  console.error("\n❌ ERROR:", err.message);
  if (err.response?.data?.extras) {
    console.error("Result codes:", JSON.stringify(err.response.data.extras.result_codes, null, 2));
  }
});
