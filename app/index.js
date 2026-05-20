import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useNetworkStatus from "../hooks/useNetworkStatus";
import {
  appendLoan,
  appendToSyncedSalesLedger,
  createSalesPayload,
  enqueuePendingSale,
  getLoans,
  getPendingSyncQueue,
  getReceipts,
  getSyncedSalesLedger,
  syncPendingSalesQueue,
  updateLoanStatus,
} from "../services/storageService";
import {
  CREDIT_STAGES,
  calculateTiwalaScore,
  evaluateCreditStage,
  getLoanLimitForStage,
  getStageMetadata,
} from "../services/creditLadderService";
import {
  GRAPH_RANGES,
  SAMPLE_BUSINESS_TRANSACTIONS,
  getBusinessSnapshot,
  getOfflineControlState,
  getSalesSeries,
  getSalesToday,
} from "../services/dashboardService";
import {
  receiveLoanFromLender,
  repayLoan,
  validateStellarTransaction,
} from "../services/stellarService";
import { generateReceiptDocument } from "../utils/documentGenerator";
import { formatPhp, formatUsdc } from "../utils/formatters";

// Lender accounts (generated via setupLiquidity + generateLenders scripts)
const LENDER_OFFERS = [
  {
    id: "lender_001",
    name: "Kaagapay Microfinance",
    publicKey: "GAFLJJXR63KPK6UWVCXR34GL5G2F34TUX2ETCGU3SC6ASY6LRIBD3BCB",
    secretKey: "SDXGZJ7JQWRM5ZVQLXJDG553W4RU3RN7HSZXYF7CPCLWYHTCQ6NXYIO3",
    amountPhpc: 5000,
    description: "₱5,000 micro-loan for inventory restocking",
    interestRate: "2% monthly",
  },
  {
    id: "lender_002",
    name: "Tindahan Capital Co.",
    publicKey: "GA4AX33VBDEVKBQZMG3ADNOBAXGATEW3ZWNLJTINNGGFF7CQRPWMTTEB",
    secretKey: "SDPYF7RIUVMN4AANXKWKEWCYTAZACZ2CJ5MM3B6DADAC6JBTDANF4SXJ",
    amountPhpc: 8000,
    description: "₱8,000 capital upgrade for corner stores",
    interestRate: "1.8% monthly",
  },
];

const OFFLINE_WARNING = "Naka-Offline Mode. I-save muna sa phone.";

const NAV_ITEMS = ["Profile", "Tracker", "Debt", "Receipts"];

const BUSINESS_DEBTS = [
  {
    id: "debt_001",
    company: "Kaagapay Microfinance",
    amount: 1800,
    due: "Due in 4 days",
    status: "On time",
  },
  {
    id: "debt_002",
    company: "Tindahan Capital Co.",
    amount: 2400,
    due: "Due in 11 days",
    status: "Scheduled",
  },
];

export default function KahaScreen() {
  const network = useNetworkStatus();
  const insets = useSafeAreaInsets(); // 4-E: safe area for offline banner
  const [bentaAmount, setBentaAmount] = useState("");
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncedLedger, setSyncedLedger] = useState([]);
  const [isSavingBenta, setIsSavingBenta] = useState(false); // 4-B: rage-click guard
  const [isLedgerReady, setIsLedgerReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [activeRange, setActiveRange] = useState("week");
  const [activeSection, setActiveSection] = useState("Profile");
  const [receipts, setReceipts] = useState([]); // 4-D: live receipts
  const [loans, setLoans] = useState([]); // microloan records

  const totalSyncedBenta = useMemo(
    () => syncedLedger.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    [syncedLedger],
  );
  const salesToday = useMemo(() => getSalesToday(syncedLedger), [syncedLedger]);

  // stage is now a CREDIT_STAGES string; metadata carries display properties
  const stage = evaluateCreditStage(totalSyncedBenta);
  const stageMeta = getStageMetadata(stage);
  const loanLimit = getLoanLimitForStage(stage);
  const tiwalaScore = calculateTiwalaScore(totalSyncedBenta);
  const graphSeries = useMemo(
    () => getSalesSeries(syncedLedger, activeRange),
    [activeRange, syncedLedger],
  );
  // 4-D: pass live receipts; falls back to SAMPLE_BUSINESS_TRANSACTIONS when empty
  const businessSnapshot = useMemo(
    () => getBusinessSnapshot(syncedLedger, receipts),
    [syncedLedger, receipts],
  );
  const controlState = getOfflineControlState(network.isOffline);
  const isLoading = !network.hasCheckedInitialStatus || !isLedgerReady;

  const refreshLedger = useCallback(async () => {
    const [queue, ledger, liveReceipts, liveLoans] = await Promise.all([
      getPendingSyncQueue(),
      getSyncedSalesLedger(),
      getReceipts(),
      getLoans(),
    ]);
    setPendingQueue(queue);
    setSyncedLedger(ledger);
    setReceipts(liveReceipts);
    setLoans(liveLoans);
    setIsLedgerReady(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLedger().catch((error) => {
        setStatusMessage(error.message);
        setIsLedgerReady(true);
      });
    }, [refreshLedger]),
  );

  useEffect(() => {
    if (!network.hasCheckedInitialStatus || network.isOffline) return;

    async function syncWhenOnline() {
      try {
        const queue = await getPendingSyncQueue();
        if (queue.length === 0) {
          await refreshLedger();
          return;
        }

        await syncPendingSalesQueue();
        await refreshLedger();
        setStatusMessage("Na-sync ang offline Benta records.");
      } catch (error) {
        setStatusMessage(error.message);
      }
    }

    syncWhenOnline();
  }, [network.hasCheckedInitialStatus, network.isOffline, refreshLedger]);

  // 4-B: rage-click guard — disable before the first await
  async function handleAddBenta() {
    if (isSavingBenta) return;
    setStatusMessage("");
    setIsSavingBenta(true);

    try {
      const payload = createSalesPayload(bentaAmount);

      if (network.isOffline) {
        const queue = await enqueuePendingSale(payload);
        setPendingQueue(queue);
        setStatusMessage(OFFLINE_WARNING);
      } else {
        const ledger = await appendToSyncedSalesLedger([payload]);
        setSyncedLedger(ledger);
        setStatusMessage("Na-save ang Benta sa synced ledger.");
      }

      setBentaAmount("");
    } catch (error) {
      Alert.alert("Benta error", error.message);
    } finally {
      setIsSavingBenta(false);
    }
  }

  function handleOnlineOnlyAction(label) {
    if (network.isOffline) {
      setStatusMessage(controlState.reason);
      return;
    }
    setStatusMessage(`${label} ready for Stellar Testnet flow.`);
  }

  function handleCreateDocument() {
    try {
      const html = generateReceiptDocument(receipts, loans);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      Alert.alert("Document Error", e.message);
    }
  }

  async function handleReceiveLoan(offer) {
    try {
      setStatusMessage("Humihingi ng loan sa " + offer.name + "...");
      const result = await receiveLoanFromLender({
        lenderSecretKey: offer.secretKey,
        amountPhpc: offer.amountPhpc,
      });
      if (!result.success) throw new Error(result.error);

      const loanRecord = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        lenderName: offer.name,
        lenderPublicKey: offer.publicKey,
        amountPhpc: offer.amountPhpc,
        amountPhpDisplay: offer.amountPhpc, // 1 PHPC = ₱1
        txHash: result.transactionHash,
        timestamp: Date.now(),
        status: "active",
      };
      await appendLoan(loanRecord);
      await refreshLedger();
      setStatusMessage("✅ Natanggap ang ₱" + offer.amountPhpc.toLocaleString() + " mula sa " + offer.name + "!");
    } catch (e) {
      setStatusMessage("❌ Loan failed: " + e.message);
    }
  }

  async function handleRepayLoan(loan) {
    try {
      setStatusMessage("Nagbabayad sa " + loan.lenderName + "...");
      const result = await repayLoan({
        lenderPublicKey: loan.lenderPublicKey,
        amountPhpc: loan.amountPhpc,
        memo: "Repay " + loan.lenderName.slice(0, 18),
      });
      if (!result.success) throw new Error(result.error);
      await updateLoanStatus(loan.id, "paid");
      await refreshLedger();
      setStatusMessage("✅ Nabayaran na ang utang sa " + loan.lenderName + "!");
    } catch (e) {
      setStatusMessage("❌ Payment failed: " + e.message);
    }
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {/* 4-E: safe-area-aware offline banner — insets.top prevents it rendering under notch/Dynamic Island */}
      {network.isOffline ? (
        <View style={[styles.offlineBanner, { marginTop: insets.top }]}>
          <Text style={styles.offlineText}>{OFFLINE_WARNING}</Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SariSync Ledger</Text>
        <Text style={styles.title}>Kaha</Text>
        <Text style={styles.subtitle}>
          {network.isOffline
            ? "Read-only synced data, local Benta saving, and locked online transactions."
            : "Online dashboard for store sales, capital, business debt, and receipts."}
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard label="Sales today" value={formatPhp(salesToday)} color="#34C759" />
        <MetricCard label="Benta" value={formatPhp(totalSyncedBenta)} color="#34C759" />
        <MetricCard label="Tiwala Score" value={String(tiwalaScore)} />
        <MetricCard label="Loan Limit" value={formatPhp(loanLimit)} />
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardLabel}>Sales graph</Text>
            <Text style={styles.stageName}>
              {network.isOffline ? "Read-Only" : "Live Dashboard"}
            </Text>
          </View>
          {network.isOffline ? <Text style={styles.lockText}>🔒 Cached</Text> : null}
        </View>

        <View style={styles.rangeRow}>
          {GRAPH_RANGES.map((range) => (
            <Pressable
              key={range}
              onPress={() => setActiveRange(range)}
              style={[styles.rangeButton, activeRange === range && styles.rangeButtonActive]}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  activeRange === range && styles.rangeButtonTextActive,
                ]}
              >
                {rangeLabel(range)}
              </Text>
            </Pressable>
          ))}
        </View>

        <SalesGraph series={graphSeries} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Log daily Benta</Text>
        <TextInput
          value={bentaAmount}
          onChangeText={setBentaAmount}
          keyboardType="number-pad"
          placeholder="Hal. 2500"
          placeholderTextColor="#918A7F"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSavingBenta}
          onPress={handleAddBenta}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            isSavingBenta && styles.disabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSavingBenta ? "Sine-save..." : "I-save ang Benta"}
          </Text>
        </Pressable>
        {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      </View>

      <View style={styles.navGrid}>
        {NAV_ITEMS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setActiveSection(item)}
            style={[styles.navButton, activeSection === item && styles.navButtonActive]}
          >
            <Text
              style={[
                styles.navButtonText,
                activeSection === item && styles.navButtonTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeSection === "Profile" ? (
        <ProfilePanel stage={stage} stageMeta={stageMeta} tiwalaScore={tiwalaScore} loanLimit={loanLimit} />
      ) : null}
      {activeSection === "Tracker" ? (
        <TrackerPanel
          snapshot={businessSnapshot}
          loans={loans}
          loanLimit={loanLimit}
          stage={stage}
          stageMeta={stageMeta}
          controlState={controlState}
          onReceiveLoan={handleReceiveLoan}
          statusMessage={statusMessage}
        />
      ) : null}
      {activeSection === "Debt" ? (
        <DebtPanel
          loans={loans}
          controlState={controlState}
          onRepayLoan={handleRepayLoan}
          statusMessage={statusMessage}
        />
      ) : null}
      {activeSection === "Receipts" ? (
        <ReceiptsPanel
          receipts={receipts}
          loans={loans}
          controlState={controlState}
          onCreateDocument={handleCreateDocument}
        />
      ) : null}
    </ScrollView>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadingMark} />
      <Text style={styles.loadingTitle}>Loading SariSync Ledger</Text>
      <Text style={styles.loadingText}>Checking connection and local Kaha records...</Text>
    </View>
  );
}

function MetricCard({ label, value, color = "#17231D" }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function SalesGraph({ series }) {
  const maxAmount = Math.max(1, ...series.map((item) => item.amount));

  return (
    <View style={styles.graph}>
      {series.map((item) => {
        const height = Math.max(8, Math.round((item.amount / maxAmount) * 120));

        return (
          <View key={item.label} style={styles.graphItem}>
            <View style={styles.graphTrack}>
              <View style={[styles.graphBar, { height }]} />
            </View>
            <Text style={styles.graphLabel}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ProfilePanel({ stage, stageMeta, tiwalaScore, loanLimit }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Profile</Text>
      <Text style={styles.stageName}>Store Settings</Text>
      <InfoRow label="Store type" value="Sari-sari inventory business" />
      <InfoRow label="Stage" value={stageMeta.name} />
      <InfoRow label="Tiwala Score" value={String(tiwalaScore)} />
      <InfoRow label="Loan limit" value={formatPhp(loanLimit)} />
    </View>
  );
}

function TrackerPanel({ snapshot, loans, loanLimit, stage, stageMeta, controlState, onReceiveLoan, statusMessage }) {
  const isReadOnly = stage === CREDIT_STAGES.READ_ONLY;
  const [isRequesting, setIsRequesting] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);

  const activeLoans = loans.filter(l => l.status === "active");
  const loanCapital = activeLoans.reduce((s, l) => s + Number(l.amountPhpDisplay || 0), 0);

  async function handleRequest(offer) {
    setIsRequesting(true);
    setSelectedOffer(null);
    await onReceiveLoan(offer);
    setIsRequesting(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Tracker</Text>
      <Text style={styles.stageName}>Capital movement</Text>
      <View style={styles.metricsGrid}>
        <MiniMetric label="Spent" value={formatPhp(snapshot.spent)} />
        <MiniMetric label="Earned" value={formatPhp(snapshot.earned)} color="#34C759" />
        <MiniMetric label="Capital" value={formatPhp(snapshot.capital + loanCapital)} color="#007AFF" />
        <MiniMetric label="Active Debt" value={formatPhp(loanCapital)} color="#FF3B30" />
      </View>

      {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}

      {isReadOnly ? (
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyText}>
            I-record ang ₱5,000 na benta para ma-unlock ang credit at financing.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8 }]}>Microloan Offers</Text>
          <Text style={styles.bodyText}>Tumatanggap ng pondo mula sa mga partner na microfinance companies sa Stellar Testnet.</Text>
          {LENDER_OFFERS.map(offer => (
            <View key={offer.id} style={styles.lenderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{offer.name}</Text>
                <Text style={styles.bodyText}>{offer.description}</Text>
                <Text style={[styles.bodyText, { color: "#6E766F", fontSize: 11, marginTop: 2 }]}>Interest: {offer.interestRate}</Text>
              </View>
              <Pressable
                disabled={isRequesting || !controlState.canTransact}
                onPress={() => setSelectedOffer(offer)}
                style={[styles.loanButton, (isRequesting || !controlState.canTransact) && styles.disabled]}
              >
                <Text style={styles.loanButtonText}>Humingi</Text>
              </Pressable>
            </View>
          ))}

          {activeLoans.length > 0 && (
            <>
              <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8 }]}>Active Loans</Text>
              {activeLoans.map(loan => (
                <InfoRow
                  key={loan.id}
                  label={loan.lenderName}
                  value={formatPhp(loan.amountPhpDisplay)}
                />
              ))}
            </>
          )}

          <Link href="/scanner" asChild>
            <Pressable style={[styles.secondaryButton, { marginTop: 12 }]}>
              <Text style={styles.secondaryButtonText}>Scan Supplier Invoice</Text>
            </Pressable>
          </Link>
        </>
      )}

      {/* Loan confirmation modal */}
      <Modal visible={!!selectedOffer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kumpirmahin ang Loan</Text>
            {selectedOffer && (
              <>
                <Text style={styles.bodyText}>Lender: <Text style={{ fontWeight: "700" }}>{selectedOffer.name}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 4 }]}>Amount: <Text style={{ fontWeight: "700", color: "#007AFF" }}>{formatPhp(selectedOffer.amountPhpc)}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 4 }]}>Interest: {selectedOffer.interestRate}</Text>
                <Text style={[styles.bodyText, { marginTop: 8, color: "#6E766F", fontSize: 12 }]}>
                  Ito ay isang Stellar Testnet transaction. Ang PHPC ay ililipat sa iyong store wallet.
                </Text>
              </>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={() => handleRequest(selectedOffer)}>
                <Text style={styles.primaryButtonText}>{isRequesting ? "Naghihintay..." : "Tanggapin"}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, { flex: 1, marginTop: 0 }]} onPress={() => setSelectedOffer(null)}>
                <Text style={styles.secondaryButtonText}>Kanselahin</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DebtPanel({ loans, controlState, onRepayLoan, statusMessage }) {
  const [confirmLoan, setConfirmLoan] = useState(null);
  const [isRepaying, setIsRepaying] = useState(false);
  const [validateHash, setValidateHash] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);

  const activeLoans = loans.filter(l => l.status === "active");
  const paidLoans = loans.filter(l => l.status === "paid");

  async function handleRepay(loan) {
    setIsRepaying(true);
    setConfirmLoan(null);
    await onRepayLoan(loan);
    setIsRepaying(false);
  }

  async function handleValidate() {
    if (!validateHash.trim()) return;
    setIsValidating(true);
    setValidationResult(null);
    const result = await validateStellarTransaction(validateHash.trim());
    setValidationResult(result);
    setIsValidating(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Debt</Text>
      <Text style={styles.stageName}>Business debt tracker</Text>

      {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}

      {/* Active debts */}
      <Text style={[styles.cardLabel, { marginTop: 8, marginBottom: 8 }]}>Mga Aktibong Utang</Text>
      {activeLoans.length === 0 ? (
        <Text style={styles.bodyText}>Wala kang aktibong utang. Humingi ng loan sa Tracker tab.</Text>
      ) : (
        activeLoans.map(loan => (
          <View key={loan.id} style={styles.debtRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{loan.lenderName}</Text>
              <Text style={styles.bodyText}>{new Date(loan.timestamp).toLocaleDateString("en-PH")}</Text>
            </View>
            <View style={styles.alignRight}>
              <Text style={styles.debtAmount}>{formatPhp(loan.amountPhpDisplay)}</Text>
              <Pressable
                disabled={isRepaying || !controlState.canTransact}
                onPress={() => setConfirmLoan(loan)}
                style={[styles.bayadButton, (isRepaying || !controlState.canTransact) && styles.disabled]}
              >
                <Text style={styles.bayadButtonText}>Bayad</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* Paid debts */}
      {paidLoans.length > 0 && (
        <>
          <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8 }]}>Nabayarang Utang</Text>
          {paidLoans.map(loan => (
            <View key={loan.id} style={styles.debtRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: "#6E766F" }]}>{loan.lenderName}</Text>
              </View>
              <View style={styles.alignRight}>
                <Text style={[styles.debtAmount, { color: "#34C759" }]}>{formatPhp(loan.amountPhpDisplay)}</Text>
                <Text style={[styles.bodyText, { color: "#34C759", fontSize: 11 }]}>✓ Paid</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Validate Stellar Invoice */}
      <Text style={[styles.cardLabel, { marginTop: 20, marginBottom: 8 }]}>I-Validate ang Stellar Invoice</Text>
      <Text style={styles.bodyText}>I-paste ang transaction hash para i-verify sa Horizon Testnet.</Text>
      <TextInput
        value={validateHash}
        onChangeText={setValidateHash}
        placeholder="Transaction hash (64 hex chars)"
        placeholderTextColor="#918A7F"
        style={[styles.input, { marginVertical: 8, fontSize: 13 }]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        disabled={isValidating || !validateHash.trim()}
        onPress={handleValidate}
        style={[styles.primaryButton, (isValidating || !validateHash.trim()) && styles.disabled]}
      >
        <Text style={styles.primaryButtonText}>{isValidating ? "Nag-va-validate..." : "I-Validate"}</Text>
      </Pressable>

      {validationResult && (
        <View style={[styles.lenderCard, { marginTop: 12, backgroundColor: validationResult.success ? "#F0FBF4" : "#FFF0F0" }]}>
          {validationResult.success ? (
            <>
              <Text style={[styles.rowLabel, { color: "#1A6B4A" }]}>✅ Valid Stellar Transaction</Text>
              <InfoRow label="Ledger" value={String(validationResult.ledger)} />
              <InfoRow label="Date" value={new Date(validationResult.createdAt).toLocaleString("en-PH")} />
              <InfoRow label="Source" value={validationResult.sourceAccount.slice(0, 8) + "..." + validationResult.sourceAccount.slice(-6)} />
              <InfoRow label="Operations" value={String(validationResult.operationCount)} />
              {validationResult.memo && <InfoRow label="Memo" value={validationResult.memo} />}
              <InfoRow label="Successful" value={validationResult.successful ? "Yes" : "No"} />
            </>
          ) : (
            <Text style={[styles.bodyText, { color: "#FF3B30" }]}>❌ {validationResult.error}</Text>
          )}
        </View>
      )}

      {/* Payment confirmation modal */}
      <Modal visible={!!confirmLoan} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kumpirmahin ang Bayad</Text>
            {confirmLoan && (
              <>
                <Text style={styles.bodyText}>Magbabayad sa: <Text style={{ fontWeight: "700" }}>{confirmLoan.lenderName}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 4 }]}>Halaga: <Text style={{ fontWeight: "700", color: "#FF3B30" }}>{formatPhp(confirmLoan.amountPhpDisplay)}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 8, fontSize: 12, color: "#6E766F" }]}>
                  Ito ay isang Stellar Testnet transaction na mag-sesend ng PHPC mula sa iyong store wallet.
                </Text>
              </>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Pressable style={[styles.primaryButton, { flex: 1, backgroundColor: "#FF3B30" }]} onPress={() => handleRepay(confirmLoan)}>
                <Text style={styles.primaryButtonText}>{isRepaying ? "Nagbabayad..." : "Bayaran"}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, { flex: 1, marginTop: 0 }]} onPress={() => setConfirmLoan(null)}>
                <Text style={styles.secondaryButtonText}>Kanselahin</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ReceiptsPanel({ receipts, loans, controlState, onCreateDocument }) {
  const totalUsdc = receipts.reduce((s, r) => s + Number(r.amountUsdc || 0), 0);
  const totalLoaned = loans.reduce((s, l) => s + Number(l.amountPhpDisplay || 0), 0);

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Receipts</Text>
      <Text style={styles.stageName}>Transaction proof</Text>

      <View style={styles.metricsGrid}>
        <MiniMetric label="Settlements" value={String(receipts.length)} />
        <MiniMetric label="Total USDC" value={totalUsdc.toFixed(2)} color="#34C759" />
        <MiniMetric label="Loans" value={String(loans.length)} />
        <MiniMetric label="Loaned" value={formatPhp(totalLoaned)} color="#007AFF" />
      </View>

      {receipts.length === 0 && loans.length === 0 ? (
        <Text style={[styles.bodyText, { marginTop: 8 }]}>
          Wala pang na-record na transaksyon. Mag-settle ng supplier invoice o humingi ng loan para lumabas dito.
        </Text>
      ) : (
        <>
          {receipts.length > 0 && (
            <>
              <Text style={[styles.cardLabel, { marginTop: 12, marginBottom: 6 }]}>B2B Supplier Settlements</Text>
              {receipts.map((receipt) => (
                <View key={receipt.id} style={styles.receiptRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{receipt.type ?? "B2B_FINANCING"}</Text>
                    <Text style={styles.bodyText}>{new Date(receipt.timestamp).toLocaleDateString("en-PH")}</Text>
                  </View>
                  <Text style={[styles.debtAmount, { color: "#34C759" }]}>{formatUsdc(receipt.amountUsdc)}</Text>
                </View>
              ))}
            </>
          )}
          {loans.length > 0 && (
            <>
              <Text style={[styles.cardLabel, { marginTop: 12, marginBottom: 6 }]}>Microloan Records</Text>
              {loans.map((loan) => (
                <View key={loan.id} style={styles.receiptRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{loan.lenderName}</Text>
                    <Text style={styles.bodyText}>{new Date(loan.timestamp).toLocaleDateString("en-PH")}</Text>
                  </View>
                  <View style={styles.alignRight}>
                    <Text style={styles.debtAmount}>{formatPhp(loan.amountPhpDisplay)}</Text>
                    <Text style={[styles.bodyText, { fontSize: 11, color: loan.status === "paid" ? "#34C759" : "#FF9500" }]}>
                      {loan.status === "paid" ? "✓ Paid" : "Active"}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      )}

      <Pressable
        onPress={onCreateDocument}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>📄 Create Document</Text>
      </Pressable>
      <Text style={[styles.bodyText, { fontSize: 11, color: "#6E766F", textAlign: "center" }]}>
        Bubuksan sa bagong tab bilang HTML na maaaring i-print bilang PDF.
      </Text>
    </View>
  );
}

function MiniMetric({ label, value, color = "#17231D" }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.miniMetricValue, { color }]}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function OnlineActionButton({ label, controlState, onPress }) {
  const disabled = !controlState.canTransact;

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={[styles.primaryButton, disabled && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>{disabled ? `🔒 ${label}` : label}</Text>
      </Pressable>
      {disabled ? <Text style={styles.lockHint}>{controlState.reason}</Text> : null}
    </>
  );
}

function rangeLabel(range) {
  const labels = {
    year: "Year",
    month: "Month",
    week: "Week",
    day: "Day",
  };

  return labels[range] || range;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    minHeight: 640,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F7F4EC",
  },
  loadingMark: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#17231D",
    marginBottom: 18,
  },
  loadingTitle: {
    color: "#17231D",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  loadingText: {
    color: "#5D675F",
    marginTop: 8,
    textAlign: "center",
  },
  screen: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  hero: {
    paddingTop: 10,
    gap: 6,
  },
  eyebrow: {
    color: "#527061",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
  },
  title: {
    color: "#17231D",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    color: "#5D675F",
    fontSize: 16,
    lineHeight: 23,
  },
  offlineBanner: {
    backgroundColor: "#FFF0EF",
    borderColor: "#FF3B30",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  offlineText: {
    color: "#FF3B30",
    fontWeight: "800",
  },
  // 4-A: READ_ONLY stage info banner — uses neutral colors from the existing system
  readOnlyBanner: {
    backgroundColor: "#F7F4EC",
    borderColor: "#E0DACF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  readOnlyText: {
    color: "#5D675F",
    fontWeight: "700",
    lineHeight: 22,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E0DACF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    width: "48%",
    minHeight: 92,
    justifyContent: "space-between",
  },
  metricLabel: {
    color: "#6E766F",
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  miniMetric: {
    backgroundColor: "#F7F4EC",
    borderColor: "#E0DACF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    width: "48%",
    gap: 6,
  },
  miniMetricValue: {
    fontSize: 17,
    fontWeight: "900",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E0DACF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  cardLabel: {
    color: "#6E766F",
    fontSize: 13,
    fontWeight: "800",
  },
  stageName: {
    color: "#17231D",
    fontSize: 22,
    fontWeight: "900",
  },
  bodyText: {
    color: "#4F5A53",
    lineHeight: 22,
  },
  input: {
    borderColor: "#D4CEC1",
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 18,
    color: "#17231D",
    backgroundColor: "#FFFEFB",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17231D",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#17231D",
    borderWidth: 1,
    backgroundColor: "#FDFBF6",
  },
  secondaryButtonText: {
    color: "#17231D",
    fontWeight: "900",
    fontSize: 16,
  },
  disabledButton: {
    backgroundColor: "#9B9F9A",
  },
  lockHint: {
    color: "#6E766F",
    fontWeight: "700",
  },
  lockText: {
    color: "#6E766F",
    fontWeight: "800",
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  navButton: {
    width: "48%",
    minHeight: 48,
    borderRadius: 8,
    borderColor: "#D4CEC1",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  navButtonActive: {
    backgroundColor: "#17231D",
    borderColor: "#17231D",
  },
  navButtonText: {
    color: "#17231D",
    fontWeight: "900",
  },
  navButtonTextActive: {
    color: "#FFFFFF",
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
  },
  rangeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4CEC1",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeButtonActive: {
    backgroundColor: "#17231D",
    borderColor: "#17231D",
  },
  rangeButtonText: {
    color: "#17231D",
    fontWeight: "800",
  },
  rangeButtonTextActive: {
    color: "#FFFFFF",
  },
  graph: {
    height: 170,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  graphItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  graphTrack: {
    height: 130,
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#F0EAE0",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  graphBar: {
    width: "100%",
    backgroundColor: "#34C759",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  graphLabel: {
    color: "#6E766F",
    fontSize: 11,
    fontWeight: "700",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomColor: "#EEE8DD",
    borderBottomWidth: 1,
    paddingBottom: 10,
  },
  debtRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderColor: "#EEE8DD",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  rowLabel: {
    color: "#17231D",
    fontWeight: "800",
    flex: 1,
  },
  rowValue: {
    color: "#17231D",
    fontWeight: "900",
    flexShrink: 1,
    textAlign: "right",
  },
  alignRight: {
    alignItems: "flex-end",
  },
  debtAmount: {
    color: "#FF3B30",
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.65,
  },
  statusText: {
    color: "#527061",
    fontWeight: "700",
  },
  lenderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderColor: "#D4CEC1",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#FAFAF7",
  },
  loanButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  loanButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  bayadButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 4,
  },
  bayadButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE8DD",
  },
  input: {
    borderColor: "#D4CEC1",
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 18,
    color: "#17231D",
    backgroundColor: "#FFFEFB",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    width: "100%",
    maxWidth: 420,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#17231D",
    marginBottom: 4,
  },
});
