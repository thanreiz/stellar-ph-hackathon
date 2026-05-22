import 'dotenv/config';
import { rpc, Contract, nativeToScVal, scValToNative, TransactionBuilder, Networks } from '@stellar/stellar-sdk';
const { Server } = rpc;

const network = process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'testnet';
const isPublic = network === 'public' || network === 'mainnet';
const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;

const RPC_URL = process.env.EXPO_PUBLIC_SOROBAN_RPC_URL || (isPublic ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
const server = new Server(RPC_URL);

const contractId = process.env.EXPO_PUBLIC_SOROBAN_CONTRACT_ID;
const storePublicKey = process.env.EXPO_PUBLIC_STORE_PUBLIC_KEY;

async function testFetch() {
  console.log('Contract ID:', contractId);
  console.log('Store Public Key:', storePublicKey);

  try {
    const contract = new Contract(contractId);
    const dummyAccount = {
      accountId: () => storePublicKey,
      sequenceNumber: () => '0',
      incrementSequenceNumber: () => {},
    };

    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(
        contract.call('get_profile', nativeToScVal(storePublicKey, { type: 'address' }))
      )
      .setTimeout(30)
      .build();

    const xdrStr = tx.toXDR();
    console.log('XDR String:', xdrStr);
    const simResult = await server.simulateTransaction(tx);
    if (simResult.error) {
      throw new Error(simResult.error);
    }
    
    const retval = simResult.result?.retval;
    if (!retval) {
      console.log('No return value');
      return;
    }

    const nativeVal = scValToNative(retval);
    console.log('Success! On-chain Profile:', nativeVal);
  } catch (error) {
    console.error('Failed to query contract:', error.message || error);
  }
}

testFetch();
