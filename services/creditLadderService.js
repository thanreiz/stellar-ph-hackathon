export const CREDIT_STAGES = {
  MICRO_SARI: {
    id: 1,
    key: "MICRO_SARI",
    name: "Micro-Sari (Starter)",
    maxSalesInclusive: 30000,
    loanLimit: 3500,
    actionLabel: "Pondohan ang Upgrade",
  },
  CORNER_STORE: {
    id: 2,
    key: "CORNER_STORE",
    name: "Corner Store (Growth)",
    minSalesExclusive: 30000,
    loanLimit: 7500,
    actionLabel: "Utangin ang kulang",
  },
};

function normalizeSales(totalSales) {
  const amount = Number(totalSales);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function evaluateCreditStage(totalSales) {
  const normalizedSales = normalizeSales(totalSales);

  if (normalizedSales <= CREDIT_STAGES.MICRO_SARI.maxSalesInclusive) {
    return CREDIT_STAGES.MICRO_SARI;
  }

  return CREDIT_STAGES.CORNER_STORE;
}

export function calculateTiwalaScore(totalSales) {
  const normalizedSales = normalizeSales(totalSales);
  const rawScore = 30 + Math.floor((normalizedSales / 60000) * 65);
  return clamp(rawScore, 30, 95);
}

export function getLoanLimitForStage(stage) {
  if (!stage) return CREDIT_STAGES.MICRO_SARI.loanLimit;
  return Number(stage.loanLimit || 0);
}
