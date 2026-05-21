#!/bin/bash
set -e

echo "[SariSync] Checking for Rust compiler (rustc)..."

if ! command -v rustc &> /dev/null && [ ! -f "$HOME/.cargo/bin/rustc" ]; then
    echo "[SariSync] Rust is not installed. Installing via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "[SariSync] Rust is already installed."
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi

# Ensure cargo is on the PATH for the rest of this script
export PATH="$HOME/.cargo/bin:$PATH"

echo "[SariSync] Adding WebAssembly target wasm32-unknown-unknown..."
rustup target add wasm32-unknown-unknown

echo "[SariSync] Rust environment is ready!"
rustc --version
cargo --version
