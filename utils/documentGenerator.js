/**
 * Generates a styled HTML receipt document from the given receipts and loans.
 * Mobile callers write this HTML to a local file, then pass it to the native share sheet.
 */
export function generateReceiptDocument(receipts = [], loans = []) {
  const now = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const totalSettled = receipts.reduce((s, r) => s + Number(r.amountUsdc || 0), 0);
  const totalLoaned = loans.reduce((s, l) => s + Number(l.amountPhpDisplay || 0), 0);
  const totalPaid = loans.filter(l => l.status === 'paid').reduce((s, l) => s + Number(l.amountPhpDisplay || 0), 0);

  const receiptRows = receipts.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:24px;">No B2B settlements yet.</td></tr>`
    : receipts.map(r => `
      <tr>
        <td>${new Date(r.timestamp).toLocaleDateString('en-PH')}</td>
        <td>${r.type ?? 'B2B_FINANCING'}</td>
        <td>${r.supplierPubkey ? r.supplierPubkey.slice(0, 8) + '...' + r.supplierPubkey.slice(-6) : '—'}</td>
        <td style="text-align:right;font-weight:600;">${Number(r.amountUsdc || 0).toFixed(2)} USDC</td>
        <td style="font-family:monospace;font-size:11px;">
          ${r.txHash
            ? `<a href="https://stellar.expert/explorer/testnet/tx/${r.txHash}" target="_blank" style="color:#1A6B4A;">${r.txHash.slice(0, 12)}…</a>`
            : '—'}
        </td>
      </tr>`).join('');

  const loanRows = loans.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:24px;">No loans recorded yet.</td></tr>`
    : loans.map(l => `
      <tr>
        <td>${new Date(l.timestamp).toLocaleDateString('en-PH')}</td>
        <td>${l.lenderName}</td>
        <td style="text-align:right;font-weight:600;">₱${Number(l.amountPhpDisplay || 0).toLocaleString('en-PH')}</td>
        <td style="text-align:center;">
          <span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;
            background:${l.status === 'paid' ? '#D4F5E2' : '#FFF3CD'};
            color:${l.status === 'paid' ? '#1A6B4A' : '#856404'};">
            ${l.status === 'paid' ? 'PAID' : 'ACTIVE'}
          </span>
        </td>
        <td style="font-family:monospace;font-size:11px;">
          ${l.txHash
            ? `<a href="https://stellar.expert/explorer/testnet/tx/${l.txHash}" target="_blank" style="color:#1A6B4A;">${l.txHash.slice(0, 12)}…</a>`
            : '—'}
        </td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SariSync Ledger — Financial Statement</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #F7F4EC; color: #17231D; padding: 32px; }
    .header { border-bottom: 3px solid #17231D; padding-bottom: 20px; margin-bottom: 28px; }
    .header h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
    .header .sub { color: #4F5A53; margin-top: 4px; font-size: 14px; }
    .summary { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .summary-card { background: white; border-radius: 10px; padding: 16px 24px; flex: 1; min-width: 160px; border: 1px solid #E0DACF; }
    .summary-card .label { font-size: 11px; font-weight: 700; color: #6E766F; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-card .value { font-size: 24px; font-weight: 900; margin-top: 4px; }
    .section { margin-bottom: 36px; }
    .section h2 { font-size: 16px; font-weight: 800; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #D4CEC1; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; border: 1px solid #E0DACF; }
    th { background: #17231D; color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; }
    td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #F0EDE6; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) { background: #FAFAF7; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #D4CEC1; color: #6E766F; font-size: 11px; }
    @media print { body { background: white; padding: 16px; } .summary-card { border: 1px solid #ccc; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏪 SariSync Ledger</h1>
    <p class="sub">Financial Statement · Generated ${now} (Philippine Standard Time)</p>
    <p class="sub" style="margin-top:6px;">Powered by Stellar Testnet · Network: TESTNET</p>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">B2B Settlements</div>
      <div class="value">${receipts.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total USDC Settled</div>
      <div class="value" style="color:#1A6B4A;">${totalSettled.toFixed(2)} USDC</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Loans Received</div>
      <div class="value">₱${totalLoaned.toLocaleString('en-PH')}</div>
    </div>
    <div class="summary-card">
      <div class="label">Loans Repaid</div>
      <div class="value" style="color:#1A6B4A;">₱${totalPaid.toLocaleString('en-PH')}</div>
    </div>
  </div>

  <div class="section">
    <h2>📦 B2B Supplier Payments (Stellar Settlements)</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Supplier</th>
          <th style="text-align:right;">Amount</th>
          <th>Transaction Hash</th>
        </tr>
      </thead>
      <tbody>${receiptRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>💰 Microloan Records</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Lender</th>
          <th style="text-align:right;">Amount (PHP)</th>
          <th style="text-align:center;">Status</th>
          <th>Transaction Hash</th>
        </tr>
      </thead>
      <tbody>${loanRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>This document is a financial record from SariSync Ledger, a Stellar PH Hackathon application.</p>
    <p style="margin-top:4px;">All Stellar transactions can be independently verified on <a href="https://stellar.expert/explorer/testnet" target="_blank">stellar.expert/explorer/testnet</a></p>
  </div>
</body>
</html>`;
}
