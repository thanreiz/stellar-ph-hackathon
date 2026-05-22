import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

const USER_WALLET = "GCTSKXUGU2MG6A6B53YMSLLVO4UGATKW367EB6FV6OW7ZPOLJZO6W2AH";
const PHPC_ISSUER = "GBOHHRMPZE5GH7MJ3MHP2CYKV6NDTXZCCJ5U7LSWFUMRFAQUP3DWH6DT";

async function run() {
  const server = new Horizon.Server("https://horizon-testnet.stellar.org");
  console.log(`Fetching sequence number for ${USER_WALLET}...`);
  const account = await server.loadAccount(USER_WALLET);
  
  const phpcAsset = new Asset("PHPC", PHPC_ISSUER);
  
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: "Test SDF Network ; September 2015"
  })
  .addOperation(
    Operation.changeTrust({
      asset: phpcAsset
    })
  )
  .setTimeout(300)
  .build();
  
  const xdr = tx.toXDR();
  console.log("\n--- Transaction XDR ---");
  console.log(xdr);
  
  const encodedXdr = encodeURIComponent(xdr);
  const labUrl = `https://laboratory.stellar.org/#txsigner?xdr=${encodedXdr}&network=testnet`;
  console.log("\n--- Stellar Laboratory URL ---");
  console.log(labUrl);
}

run().catch(console.error);
