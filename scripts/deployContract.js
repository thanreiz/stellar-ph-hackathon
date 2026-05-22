import { rpc, Keypair, Operation, TransactionBuilder, Networks, Address, scValToNative } from '@stellar/stellar-sdk';
const { Server } = rpc;
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SECRET_KEY = process.env.EXPO_PUBLIC_STORE_SECRET_KEY;
const PUBLIC_KEY = process.env.EXPO_PUBLIC_STORE_PUBLIC_KEY;

if (!SECRET_KEY || !PUBLIC_KEY) {
  console.error('[SariSync] Error: EXPO_PUBLIC_STORE_SECRET_KEY and EXPO_PUBLIC_STORE_PUBLIC_KEY must be set in .env');
  process.exit(1);
}

const network = process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'testnet';
const isPublic = network === 'public' || network === 'mainnet';
const networkPassphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;

const deployerKeypair = Keypair.fromSecret(SECRET_KEY);
const rpcUrl = process.env.EXPO_PUBLIC_SOROBAN_RPC_URL || (isPublic ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
const server = new Server(rpcUrl);

async function pollTx(hash) {
  let attempts = 0;
  while (attempts < 30) {
    const txResponse = await server.getTransaction(hash);
    if (txResponse.status === 'SUCCESS') {
      return txResponse;
    } else if (txResponse.status === 'FAILED') {
      throw new Error(`Transaction failed: ${JSON.stringify(txResponse.resultXdr)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }
  throw new Error(`Transaction polling timed out for hash ${hash}`);
}

async function buildSignAndSubmit(op) {
  // Load account to get sequence number
  const account = await server.getAccount(PUBLIC_KEY);
  
  const tx = new TransactionBuilder(account, {
    fee: '100000', // temporary default fee, prepareTransaction will adjust it
    networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  console.log('Simulating and preparing transaction...');
  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(deployerKeypair);

  console.log('Submitting transaction...');
  const response = await server.sendTransaction(preparedTx);
  if (response.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(response.errorResult)}`);
  }

  return await pollTx(response.hash);
}

function updateEnvFile(contractId) {
  const envPath = path.resolve('.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const key = 'EXPO_PUBLIC_SOROBAN_CONTRACT_ID';
  const newRow = `${key}=${contractId}`;
  
  if (envContent.includes(key)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), newRow);
  } else {
    envContent += `\n${newRow}\n`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`[SariSync] Updated .env with ${newRow}`);
}

async function main() {
  try {
    console.log('[SariSync] 1. Compiling smart contract to WebAssembly...');
    execSync('source $HOME/.cargo/env && cargo build --target wasm32-unknown-unknown --release', {
      cwd: 'contracts/sarisync_contract',
      shell: '/bin/zsh',
      stdio: 'inherit'
    });

    const wasmPath = path.resolve('contracts/sarisync_contract/target/wasm32-unknown-unknown/release/sarisync_contract.wasm');
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Compiled WASM not found at ${wasmPath}`);
    }
    const wasmBuffer = fs.readFileSync(wasmPath);
    console.log(`[SariSync] Loaded WASM binary (${wasmBuffer.length} bytes).`);

    console.log(`[SariSync] 2. Uploading WASM bytecode to Stellar ${isPublic ? 'Mainnet' : 'Testnet'}...`);
    const uploadOp = Operation.uploadContractWasm({ wasm: wasmBuffer });
    const uploadResult = await buildSignAndSubmit(uploadOp);
    
    // Extract wasmHash from result
    const wasmHash = uploadResult.returnValue.bytes();
    console.log(`[SariSync] WASM uploaded successfully. WasmHash: ${wasmHash.toString('hex')}`);

    console.log('[SariSync] 3. Instantiating (deploying) contract...');
    const salt = crypto.randomBytes(32);
    const deployOp = Operation.createCustomContract({
      wasmHash,
      address: Address.fromString(PUBLIC_KEY),
      salt,
    });
    
    const deployResult = await buildSignAndSubmit(deployOp);
    const contractAddress = scValToNative(deployResult.returnValue);
    console.log(`[SariSync] Smart contract deployed successfully!`);
    console.log(`Contract ID: ${contractAddress}`);

    console.log('[SariSync] 4. Updating environment configuration...');
    updateEnvFile(contractAddress);

    console.log('[SariSync] Deployment complete!');
  } catch (error) {
    console.error('[SariSync] Deployment failed:', error);
    process.exit(1);
  }
}

main();
