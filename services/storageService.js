import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  PENDING_QUEUE:       'sarisync:pendingSyncQueue',
  SYNCED_LEDGER:       'sarisync:syncedSalesLedger',
  OUTSTANDING_BALANCE: 'sarisync:outstandingLoanBalance', // BR5 — stage-drop debt lock
  LAST_STAGE:          'sarisync:lastStage',              // BR5 — track last credit stage
  RECEIPTS:            'sarisync:receipts',               // live receipt log
  LOANS:               'sarisync:loans',                  // microloan records
};

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ── Sales payloads ────────────────────────────────────────────────────────────

/**
 * Creates a Benta sales payload with a collision-resistant id for idempotent sync.
 * Uses Date.now().toString(36) + random suffix — no uuid library needed.
 */
export function createSalesPayload(amount) {
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Benta amount must be a positive number.');
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    amount: Math.round(parsedAmount),
    currency: 'PHP',
    type: 'B2B_CASH_VELOCITY_RECORD',
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    syncedAt: null,
  };
}

// ── Pending sync queue ────────────────────────────────────────────────────────

export async function getPendingSyncQueue() {
  const rawQueue = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_QUEUE);
  const queue = safeJsonParse(rawQueue, []);
  return Array.isArray(queue) ? queue : [];
}

export async function enqueuePendingSale(salesPayload) {
  if (!salesPayload || typeof salesPayload.amount !== 'number') {
    throw new Error('Invalid Benta payload.');
  }

  const currentQueue = await getPendingSyncQueue();
  const updatedQueue = [...currentQueue, salesPayload];

  await AsyncStorage.setItem(
    STORAGE_KEYS.PENDING_QUEUE,
    JSON.stringify(updatedQueue)
  );

  return updatedQueue;
}

export async function clearPendingSyncQueue() {
  await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_QUEUE);
}

// ── Synced sales ledger ───────────────────────────────────────────────────────

export async function getSyncedSalesLedger() {
  const rawLedger = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_LEDGER);
  const ledger = safeJsonParse(rawLedger, []);
  return Array.isArray(ledger) ? ledger : [];
}

export async function appendToSyncedSalesLedger(salesRecords) {
  if (!Array.isArray(salesRecords)) {
    throw new Error('salesRecords must be an array.');
  }

  const currentLedger = await getSyncedSalesLedger();

  const recordsWithSyncTime = salesRecords.map((record) => ({
    ...record,
    syncedAt: new Date().toISOString(),
  }));

  const updatedLedger = [...currentLedger, ...recordsWithSyncTime];

  await AsyncStorage.setItem(
    STORAGE_KEYS.SYNCED_LEDGER,
    JSON.stringify(updatedLedger)
  );

  return updatedLedger;
}

/**
 * Syncs pending queue to the synced ledger with idempotency deduplication (AC4).
 * If a record's id already exists in the ledger it is skipped, preventing
 * double-counting after a crash-between-append-and-clear scenario.
 */
export async function syncPendingSalesQueue() {
  const pending = await getPendingSyncQueue();
  if (pending.length === 0) return;

  const existing = await getSyncedSalesLedger();
  const existingIds = new Set(existing.map(e => e.id).filter(Boolean));

  const newEntries = pending.filter(p => p.id && !existingIds.has(p.id));
  const merged = [
    ...existing,
    ...newEntries.map(r => ({ ...r, syncedAt: new Date().toISOString() })),
  ];

  await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_LEDGER, JSON.stringify(merged));
  await clearPendingSyncQueue();
}

export async function getTotalSyncedSalesVolume() {
  const ledger = await getSyncedSalesLedger();

  return ledger.reduce((sum, record) => {
    return sum + Number(record.amount || 0);
  }, 0);
}

export async function resetLocalLedgerStorage() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.PENDING_QUEUE,
    STORAGE_KEYS.SYNCED_LEDGER,
    STORAGE_KEYS.OUTSTANDING_BALANCE,
    STORAGE_KEYS.LAST_STAGE,
    STORAGE_KEYS.RECEIPTS,
  ]);
}

// ── BR5 outstanding loan balance ──────────────────────────────────────────────

/** Returns the current outstanding loan balance, defaulting to 0 if not set. */
export async function getOutstandingLoanBalance() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.OUTSTANDING_BALANCE);
    return raw !== null ? parseFloat(raw) : 0;
  } catch {
    return 0;
  }
}

/** Persists the outstanding loan balance after settlement or repayment. */
export async function setOutstandingLoanBalance(amount) {
  await AsyncStorage.setItem(
    STORAGE_KEYS.OUTSTANDING_BALANCE,
    String(parseFloat(amount))
  );
}

// ── BR5 last known stage ──────────────────────────────────────────────────────

/** Returns the credit stage recorded at the last sync, or null if never recorded. */
export async function getLastStage() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.LAST_STAGE);
  } catch {
    return null;
  }
}

/** Persists the current stage after every credit evaluation. */
export async function setLastStage(stage) {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_STAGE, stage);
}

// ── Live receipts ─────────────────────────────────────────────────────────────

/**
 * Returns all stored receipts, newest first.
 * Each receipt has shape: { id, type, amountUsdc, supplierPubkey, timestamp }
 */
export async function getReceipts() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.RECEIPTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Prepends a new receipt to the receipts log (newest first). */
export async function appendReceipt(receipt) {
  const existing = await getReceipts();
  const updated = [receipt, ...existing];
  await AsyncStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(updated));
}

// ── Microloan records ─────────────────────────────────────────────────────────

/**
 * Returns all stored loan records, newest first.
 * Each loan: { id, lenderName, lenderPublicKey, amountPhpc, amountPhpDisplay, txHash, timestamp, status }
 * status: 'active' | 'paid'
 */
export async function getLoans() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOANS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Prepends a new loan record (newest first). */
export async function appendLoan(loan) {
  const existing = await getLoans();
  const updated = [loan, ...existing];
  await AsyncStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(updated));
}

/** Updates a specific loan's status field by id. */
export async function updateLoanStatus(loanId, status) {
  const existing = await getLoans();
  const updated = existing.map(l => l.id === loanId ? { ...l, status } : l);
  await AsyncStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(updated));
}

/** Returns total active (unpaid) loan capital in PHP display units. */
export async function getTotalCapitalFromLoans() {
  const loans = await getLoans();
  return loans
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + Number(l.amountPhpDisplay || 0), 0);
}

