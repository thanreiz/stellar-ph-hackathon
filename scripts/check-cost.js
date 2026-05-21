import { TransactionBuilder, Networks, Account, Operation } from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';

async function run() {
  try {
    const wasmPath = path.resolve('contracts/sarisync_contract/target/wasm32-unknown-unknown/release/sarisync_contract.wasm');
    if (!fs.existsSync(wasmPath)) {
      console.error(`Compiled WASM not found at: ${wasmPath}`);
      console.log('Please compile the contract first by running:');
      console.log('cargo build --target wasm32-unknown-unknown --release --manifest-path contracts/sarisync_contract/Cargo.toml');
      process.exit(1);
    }

    const wasmBuffer = fs.readFileSync(wasmPath);

    // Create a dummy account for simulation
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
      .setTimeout(0)
      .build();

    const transactionXdr = tx.toXDR();

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params: {
        transaction: transactionXdr
      }
    };

    const response = await fetch('https://mainnet.sorobanrpc.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.error) {
      console.error('RPC Error:', data.error);
      process.exit(1);
    }

    const result = data.result;
    if (result.error) {
      console.error('Simulation Error:', result.error);
      process.exit(1);
    }

    const minResourceFee = parseInt(result.minResourceFee, 10);
    const feeInXlm = minResourceFee / 10000000;
    console.log(`\nsarisync_contract : ${minResourceFee} stroops = ${feeInXlm.toFixed(7)} XLM\n`);
  } catch (error) {
    console.error('Error during simulation:', error);
  }
}

run();
