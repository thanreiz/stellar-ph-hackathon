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

export function getSalesToday(records, now = new Date()) {
  return sumRecords(
    records.filter((record) => {
      const date = parseDate(record.createdAt);
      return date && sameDay(date, now);
    }),
  );
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

export function getBusinessSnapshot(salesRecords, transactions = SAMPLE_BUSINESS_TRANSACTIONS) {
  const earned = sumRecords(salesRecords);

  return transactions.reduce(
    (snapshot, transaction) => {
      const amount = Number(transaction.amount || 0);

      if (transaction.kind === "expense") snapshot.spent += amount;
      if (transaction.kind === "capital") snapshot.capital += amount;
      if (transaction.kind === "businessDebt") snapshot.businessDebt += amount;

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
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));

    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      amount: getSalesToday(records, day),
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
