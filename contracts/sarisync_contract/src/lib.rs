#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address};

#[contract]
pub struct SariSyncContract;

#[contractimpl]
impl SariSyncContract {
    // Write/update store score, limit, and outstanding balance on-chain
    pub fn update_profile(env: Env, store: Address, score: u32, loan_limit: u64, outstanding_balance: u64) {
        // In the full system, authorization checks would go here.
        // For our hackathon MVP, we allow open profile updates.
        env.storage().persistent().set(&store, &(score, loan_limit, outstanding_balance));
    }

    // Retrieve store score, limit, and outstanding balance on-chain
    pub fn get_profile(env: Env, store: Address) -> (u32, u64, u64) {
        env.storage().persistent().get(&store).unwrap_or((30, 0, 0))
    }
}
