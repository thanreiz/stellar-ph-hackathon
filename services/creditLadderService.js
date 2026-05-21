// Credit stage string constants — PRD authoritative values
export const CREDIT_STAGES = {
  READ_ONLY:    'read_only',    // < ₱5,000  — no credit, no loan limit (BR0)
  MICRO_SARI:   'micro_sari',   // ₱5,000 – ₱30,000 (BR1)
  CORNER_STORE: 'corner_store', // > ₱30,000 (BR2)
};

// Stage display metadata indexed by stage string value
const STAGE_META = {
  [CREDIT_STAGES.READ_ONLY]: {
    id: 0,
    key: 'READ_ONLY',
    name: 'Read-Only (Starter)',
    actionLabel: 'Record sales to unlock',
  },
  [CREDIT_STAGES.MICRO_SARI]: {
    id: 1,
    key: 'MICRO_SARI',
    name: 'Micro-Sari (Starter)',
    actionLabel: 'Fund Upgrade',
  },
  [CREDIT_STAGES.CORNER_STORE]: {
    id: 2,
    key: 'CORNER_STORE',
    name: 'Corner Store (Growth)',
    actionLabel: 'Borrow shortfall',
  },
};

/**
 * Returns display metadata (id, key, name, actionLabel) for a stage string.
 * Safely falls back to READ_ONLY for unknown values.
 */
export function getStageMetadata(stage) {
  return STAGE_META[stage] ?? STAGE_META[CREDIT_STAGES.READ_ONLY];
}

function normalizeSales(totalSales) {
  const amount = Number(totalSales);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Returns the CREDIT_STAGES string for a given 30-day rolling sales total.
 * BR0: < ₱5,000  → READ_ONLY
 * BR1: ₱5,000–₱30,000 → MICRO_SARI
 * BR2: > ₱30,000 → CORNER_STORE
 */
export function evaluateCreditStage(totalSales) {
  const normalizedSales = normalizeSales(totalSales);
  if (normalizedSales < 5000)  return CREDIT_STAGES.READ_ONLY;
  if (normalizedSales <= 30000) return CREDIT_STAGES.MICRO_SARI;
  return CREDIT_STAGES.CORNER_STORE;
}

export function calculateTiwalaScore(totalSales) {
  const normalizedSales = normalizeSales(totalSales);
  const rawScore = 30 + Math.floor((normalizedSales / 60000) * 65);
  return clamp(rawScore, 30, 95);
}

/**
 * Returns the PHP loan limit for a stage string. Returns 0 for READ_ONLY
 * and any unrecognised value.
 */
export function getLoanLimitForStage(stage) {
  switch (stage) {
    case CREDIT_STAGES.READ_ONLY:    return 0;
    case CREDIT_STAGES.MICRO_SARI:   return 3500;
    case CREDIT_STAGES.CORNER_STORE: return 7500;
    default: return 0;
  }
}
