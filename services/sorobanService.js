import { rpc, Keypair, Address, Contract, nativeToScVal, scValToNative, TransactionBuilder, Networks } from '@stellar/stellar-sdk';
const { Server } = rpc;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new Server(RPC_URL);

/**
 * Fetch the store's on-chain Tiwala Score and Loan Limit from the Soroban smart contract.
 * Uses transaction simulation so it is fast and free.
 */
export async function fetchOnChainProfile(storePublicKey) {
  const contractId = process.env.EXPO_PUBLIC_SOROBAN_CONTRACT_ID;
  if (!contractId) {
    console.warn('[SorobanService] EXPO_PUBLIC_SOROBAN_CONTRACT_ID is not configured.');
    return null;
  }

  try {
    const contract = new Contract(contractId);
    
    // We construct a mock account to simulate the read-only invocation
    const dummyAccount = {
      accountId: () => storePublicKey,
      sequenceNumber: () => '0',
      incrementSequenceNumber: () => {},
    };

    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call('get_profile', nativeToScVal(storePublicKey, { type: 'address' }))
      )
      .setTimeout(30)
      .build();

    const xdrStr = tx.toXDR();
    console.log('[SorobanService] Built transaction XDR:', xdrStr);

    const simResult = await server.simulateTransaction(tx);
    if (simResult.error) {
      console.error('[SorobanService] simulateTransaction error detail:', JSON.stringify(simResult.error));
      throw new Error(simResult.error);
    }
    
    const retval = simResult.result?.retval;
    if (!retval) {
      return null;
    }

    const nativeVal = scValToNative(retval);
    if (Array.isArray(nativeVal) && nativeVal.length >= 2) {
      return {
        score: Number(nativeVal[0]),
        loanLimit: Number(nativeVal[1]),
      };
    }
    
    return null;
  } catch (error) {
    console.error('[SorobanService] Failed to fetch on-chain profile:', error.message || error);
    return null;
  }
}

/**
 * Write/sync the store's Tiwala Score and Loan Limit to the Soroban smart contract.
 * Since this updates ledger state, it requires a signed transaction and a network fee.
 */
export async function syncProfileToChain(storeSecretKey, score, limit) {
  const contractId = process.env.EXPO_PUBLIC_SOROBAN_CONTRACT_ID;
  if (!contractId) {
    throw new Error('EXPO_PUBLIC_SOROBAN_CONTRACT_ID is not configured.');
  }

  const keypair = Keypair.fromSecret(storeSecretKey);
  const publicKey = keypair.publicKey();

  // 1. Fetch account sequence number
  const account = await server.getAccount(publicKey);
  
  // 2. Build the contract invocation operation
  const contract = new Contract(contractId);
  const op = contract.call(
    'update_profile',
    nativeToScVal(publicKey, { type: 'address' }),
    nativeToScVal(Number(score), { type: 'u32' }),
    nativeToScVal(Number(limit), { type: 'u64' })
  );

  // 3. Build base transaction
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  // 4. Simulate, prepare fees/footprint, sign, and submit
  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(keypair);

  const response = await server.sendTransaction(preparedTx);
  if (response.status === 'ERROR') {
    throw new Error(`RPC Submission failed: ${JSON.stringify(response.errorResult)}`);
  }

  // 5. Poll for transaction inclusion
  let attempts = 0;
  while (attempts < 30) {
    const txResponse = await server.getTransaction(response.hash);
    if (txResponse.status === 'SUCCESS') {
      return { success: true, hash: response.hash };
    } else if (txResponse.status === 'FAILED') {
      throw new Error(`On-chain transaction execution failed: ${JSON.stringify(txResponse.resultXdr)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new Error('Transaction polling timed out.');
}
