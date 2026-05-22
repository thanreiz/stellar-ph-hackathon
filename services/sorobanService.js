import { rpc, Keypair, Address, Contract, nativeToScVal, scValToNative, TransactionBuilder, Networks } from '@stellar/stellar-sdk';
const { Server } = rpc;

const isPublic = process.env.EXPO_PUBLIC_STELLAR_NETWORK === 'public' || process.env.EXPO_PUBLIC_STELLAR_NETWORK === 'mainnet';
const RPC_URL = process.env.EXPO_PUBLIC_SOROBAN_RPC_URL || (isPublic ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
const server = new Server(RPC_URL);
const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;


/**
 * Fetch the store's on-chain Tiwala Score and Loan Limit from the Soroban smart contract.
 * Uses transaction simulation so it is fast and free.
 */
export async function fetchOnChainProfile(storePublicKey) {
  // Soroban contract is testnet-only — skip silently on mainnet
  if (isPublic) return null;

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
      networkPassphrase,
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
      console.warn('[SorobanService] simulateTransaction error detail:', JSON.stringify(simResult.error));
      throw new Error(simResult.error);
    }
    
    const retval = simResult.result?.retval;
    if (!retval) {
      return null;
    }

    const nativeVal = scValToNative(retval);
    if (Array.isArray(nativeVal) && nativeVal.length >= 3) {
      return {
        score: Number(nativeVal[0]),
        loanLimit: Number(nativeVal[1]),
        outstandingBalance: Number(nativeVal[2]),
      };
    } else if (Array.isArray(nativeVal) && nativeVal.length >= 2) {
      return {
        score: Number(nativeVal[0]),
        loanLimit: Number(nativeVal[1]),
        outstandingBalance: 0,
      };
    }
    
    return null;
  } catch (error) {
    console.warn('[SorobanService] Failed to fetch on-chain profile:', error.message || error);
    return null;
  }
}

/**
 * Write/sync the store's Tiwala Score and Loan Limit to the Soroban smart contract.
 * Since this updates ledger state, it requires a signed transaction and a network fee.
 *
 * Returns: { success: true, hash: string, confirmedScore: number, confirmedLimit: number }
 * Throws on submission error, terminal FAILED status, or polling timeout.
 */
export async function syncProfileToChain(storeSecretKey, score, limit, outstandingBalance = 0) {
  // Soroban contract is testnet-only — return passthrough on mainnet so
  // callers can update local state without showing an error to the user.
  if (isPublic) {
    return {
      success: true,
      hash: null,
      confirmedScore: Number(score),
      confirmedLimit: Number(limit),
      confirmedOutstandingBalance: Number(outstandingBalance),
    };
  }

  const contractId = process.env.EXPO_PUBLIC_SOROBAN_CONTRACT_ID;
  if (!contractId) {
    throw new Error('EXPO_PUBLIC_SOROBAN_CONTRACT_ID is not configured.');
  }

  const keypair = Keypair.fromSecret(storeSecretKey);
  const publicKey = keypair.publicKey();

  // 1. Fetch account sequence number from Soroban RPC
  const account = await server.getAccount(publicKey);

  // 2. Build the contract invocation operation
  const contract = new Contract(contractId);
  const op = contract.call(
    'update_profile',
    nativeToScVal(publicKey, { type: 'address' }),
    nativeToScVal(Number(score), { type: 'u32' }),
    nativeToScVal(Number(limit), { type: 'u64' }),
    nativeToScVal(Number(outstandingBalance), { type: 'u64' })
  );

  // 3. Build base transaction
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  // 4. Simulate to prepare the footprint/fees, sign, and submit
  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(keypair);

  const response = await server.sendTransaction(preparedTx);
  if (response.status === 'ERROR') {
    throw new Error(`RPC Submission failed: ${JSON.stringify(response.errorResult)}`);
  }

  const txHash = response.hash;
  console.log(`[SorobanService] Submitted update_profile tx: ${txHash}. Polling for finality...`);

  // 5. Poll every 2 seconds for transaction finality.
  //    Soroban RPC returns one of: SUCCESS | FAILED | NOT_FOUND | PENDING
  //    Only SUCCESS and FAILED are terminal states. NOT_FOUND / PENDING mean
  //    the tx is still in the mempool or being processed — we keep waiting.
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLL_ATTEMPTS = 30; // 30 × 2s = up to 60s total

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let txResponse;
    try {
      txResponse = await server.getTransaction(txHash);
    } catch (pollError) {
      // Network hiccup during polling — log and continue
      console.warn(`[SorobanService] Poll attempt ${attempt} error:`, pollError.message);
      continue;
    }

    const { status } = txResponse;
    console.log(`[SorobanService] Poll attempt ${attempt}/${MAX_POLL_ATTEMPTS} — status: ${status}`);

    if (status === 'SUCCESS') {
      console.log(`[SorobanService] update_profile confirmed on-chain. Hash: ${txHash}`);
      // Return the confirmed values so callers can eagerly update React state
      // without needing a separate Horizon/RPC round-trip.
      return {
        success: true,
        hash: txHash,
        confirmedScore: Number(score),
        confirmedLimit: Number(limit),
        confirmedOutstandingBalance: Number(outstandingBalance),
      };
    }

    if (status === 'FAILED') {
      throw new Error(
        `[SorobanService] On-chain tx FAILED. Hash: ${txHash}. ` +
        `Result XDR: ${JSON.stringify(txResponse.resultXdr ?? txResponse.envelopeXdr ?? 'unavailable')}`
      );
    }

    // status is NOT_FOUND or PENDING — keep polling
  }

  throw new Error(
    `[SorobanService] Transaction polling timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s. ` +
    `Hash: ${txHash}`
  );
}
