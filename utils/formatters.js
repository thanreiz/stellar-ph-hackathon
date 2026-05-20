export function formatPhp(amount) {
  const value = Number(amount || 0);
  return `₱${value.toLocaleString("en-PH", {
    maximumFractionDigits: 0,
  })}`;
}

export function formatUsdc(amount) {
  const value = Number(amount || 0);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

export function formatPublicKey(publicKey) {
  if (!publicKey || publicKey.length <= 14) return publicKey || "";
  return `${publicKey.slice(0, 7)}...${publicKey.slice(-6)}`;
}
