import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  PENDING_SYNC_QUEUE: 'sarasync:pendingSyncQueue',
  SYNCED_SALES_LEDGER: 'sarasync:syncedSalesLedger'
};

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createSalesPayload(amount) {
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Benta amount must be a positive number.');
  }

  return {
    id: `benta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    amount: Math.round(parsedAmount),
    currency: 'PHP',
    type: 'B2B_CASH_VELOCITY_RECORD',
    createdAt: new Date().toISOString(),
    syncedAt: null
  };
}

export async function getPendingSyncQueue() {
  const rawQueue = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SYNC_QUEUE);
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
    STORAGE_KEYS.PENDING_SYNC_QUEUE,
    JSON.stringify(updatedQueue)
  );

  return updatedQueue;
}

export async function clearPendingSyncQueue() {
  await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SYNC_QUEUE);
}

export async function getSyncedSalesLedger() {
  const rawLedger = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_SALES_LEDGER);
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
    syncedAt: new Date().toISOString()
  }));

  const updatedLedger = [...currentLedger, ...recordsWithSyncTime];

  await AsyncStorage.setItem(
    STORAGE_KEYS.SYNCED_SALES_LEDGER,
    JSON.stringify(updatedLedger)
  );

  return updatedLedger;
}

export async function syncPendingSalesQueue() {
  const pendingQueue = await getPendingSyncQueue();

  if (pendingQueue.length === 0) {
    return {
      syncedRecords: [],
      syncedTotal: 0,
      remainingQueue: []
    };
  }

  const syncedTotal = pendingQueue.reduce((sum, record) => {
    return sum + Number(record.amount || 0);
  }, 0);

  const syncedRecords = await appendToSyncedSalesLedger(pendingQueue);

  await clearPendingSyncQueue();

  return {
    syncedRecords,
    syncedTotal,
    remainingQueue: []
  };
}

export async function getTotalSyncedSalesVolume() {
  const ledger = await getSyncedSalesLedger();

  return ledger.reduce((sum, record) => {
    return sum + Number(record.amount || 0);
  }, 0);
}

export async function resetLocalLedgerStorage() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.PENDING_SYNC_QUEUE,
    STORAGE_KEYS.SYNCED_SALES_LEDGER
  ]);
}

export { STORAGE_KEYS };
