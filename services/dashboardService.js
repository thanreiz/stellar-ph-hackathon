export const GRAPH_RANGES = ["year", "month", "week", "day"];

export const SAMPLE_BUSINESS_TRANSACTIONS = [
  {
    id: "txn_delivery_001",
    label: "Delivery supplies",
    kind: "expense",
    amount: 1250,
    status: "Recorded",
  },
  {
    id: "txn_stock_001",
    label: "Self bought food stocks",
    kind: "expense",
    amount: 2100,
    status: "Recorded",
  },
  {
    id: "txn_capital_001",
    label: "Inventory capital upgrade",
    kind: "capital",
    amount: 3500,
    status: "Active",
  },
  {
    id: "txn_debt_001",
    label: "Business debt - microfinance partner",
    kind: "businessDebt",
    amount: 1800,
    status: "Due soon",
  },
];

// ── Philippine Standard Time helpers ─────────────────────────────────────────

const PST_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * Returns the UTC millisecond timestamp of midnight PST for the current day.
 * Used to define "today" in Philippine Standard Time regardless of device locale.
 */
function getPSTMidnightUTC() {
  const nowUTC = Date.now();
  const nowPST = nowUTC + PST_OFFSET_MS;
  const midnightPST = nowPST - (nowPST % (24 * 60 * 60 * 1000));
  return midnightPST - PST_OFFSET_MS; // back to UTC millis
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function sumRecords(records) {
  return records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Returns the total sales amount for "today" in Philippine Standard Time.
 * Records are matched by their numeric `timestamp` field (ms since epoch).
 * Falls back to `createdAt` ISO string if `timestamp` is absent (legacy records).
 */
export function getSalesToday(syncedLedger = []) {
  const midnightUTC = getPSTMidnightUTC();
  return syncedLedger
    .filter(entry => {
      // Prefer numeric timestamp; fall back to parsing createdAt for legacy records
      const ts = entry.timestamp ?? (entry.createdAt ? new Date(entry.createdAt).getTime() : null);
      return ts !== null && !Number.isNaN(ts) && ts >= midnightUTC;
    })
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
}

export function getSalesSeries(records, range, now = new Date()) {
  if (range === "year") return buildYearSeries(records, now);
  if (range === "month") return buildMonthSeries(records, now);
  if (range === "week") return buildWeekSeries(records, now);
  return buildDaySeries(records, now);
}

export function getOfflineControlState(isOffline) {
  return {
    canTransact: !isOffline,
    canCreateDocument: !isOffline,
    reason: isOffline ? "Needs internet to transact." : "",
  };
}

/**
 * Returns a snapshot of business finances.
 *
 * If `receipts` (live AsyncStorage receipts) is non-empty, uses those as the
 * transaction source so the Receipts module reflects real settlements.
 * Falls back to SAMPLE_BUSINESS_TRANSACTIONS for the demo when no real
 * receipts have been recorded yet.
 *
 * @param {object[]} salesRecords - Synced sales ledger entries (for earned total)
 * @param {object[]} receipts     - Live receipts from storageService.getReceipts()
 */
export function getBusinessSnapshot(salesRecords, receipts = []) {
  const earned = sumRecords(salesRecords);
  const source = receipts.length > 0 ? receipts : SAMPLE_BUSINESS_TRANSACTIONS;

  return source.reduce(
    (snapshot, transaction) => {
      const amount = Number(transaction.amount || transaction.amountUsdc || 0);

      if (transaction.kind === "expense") snapshot.spent += amount;
      if (transaction.kind === "capital") snapshot.capital += amount;
      if (transaction.kind === "businessDebt") snapshot.businessDebt += amount;
      // FINANCING receipts contribute to earned, not debt (settlement already logged)

      return snapshot;
    },
    {
      earned,
      spent: 0,
      capital: 0,
      businessDebt: 0,
    },
  );
}

// ── Internal series builders ──────────────────────────────────────────────────

function buildYearSeries(records, now) {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels.map((label, month) => ({
    label,
    amount: sumRecords(
      records.filter((record) => {
        const date = parseDate(record.createdAt);
        return date && date.getFullYear() === now.getFullYear() && date.getMonth() === month;
      }),
    ),
  }));
}

function buildMonthSeries(records, now) {
  const month = now.getMonth();
  const year = now.getFullYear();
  const buckets = [
    { label: "W1", start: 1, end: 7 },
    { label: "W2", start: 8, end: 14 },
    { label: "W3", start: 15, end: 21 },
    { label: "W4", start: 22, end: 28 },
    { label: "W5", start: 29, end: 31 },
  ];

  return buckets.map((bucket) => ({
    label: bucket.label,
    amount: sumRecords(
      records.filter((record) => {
        const date = parseDate(record.createdAt);
        return (
          date &&
          date.getFullYear() === year &&
          date.getMonth() === month &&
          date.getDate() >= bucket.start &&
          date.getDate() <= bucket.end
        );
      }),
    ),
  }));
}

function buildWeekSeries(records, now) {
  // Build 7-day series without calling getSalesToday to avoid PST-midnight
  // vs. local-clock mismatch inside the graph builder.
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));

    const dayAmount = sumRecords(
      records.filter((record) => {
        const date = parseDate(record.createdAt);
        return date && sameDay(date, day);
      }),
    );

    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      amount: dayAmount,
    };
  });
}

function buildDaySeries(records, now) {
  const buckets = [
    { label: "AM", start: 0, end: 5 },
    { label: "Mid", start: 6, end: 11 },
    { label: "PM", start: 12, end: 17 },
    { label: "Eve", start: 18, end: 23 },
  ];

  return buckets.map((bucket) => ({
    label: bucket.label,
    amount: sumRecords(
      records.filter((record) => {
        const date = parseDate(record.createdAt);
        return date && sameDay(date, now) && date.getHours() >= bucket.start && date.getHours() <= bucket.end;
      }),
    ),
  }));
}
