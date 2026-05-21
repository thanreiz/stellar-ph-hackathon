import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
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
  appendOfflineDraft,
  appendExpenseToLedger,
  appendLoan,
  appendToSyncedSalesLedger,
  createExpensePayload,
  createSalesPayload,
  enqueuePendingSale,
  getExpenseLedger,
  getWalletConnection,
  getLoans,
  getOfflineDrafts,
  getPendingSyncQueue,
  getReceipts,
  getSyncedSalesLedger,
  isValidStellarPublicKey,
  saveWalletConnection,
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
  getExpenseTotal,
  getOfflineControlState,
  getSalesSeries,
  getSalesToday,
} from "../services/dashboardService";
import {
  OFFLINE_DRAFT_TYPES,
  createOfflineDraft,
  getDraftsReadyForSubmission,
  getOfflineCapabilities,
  summarizeOfflineWork,
} from "../services/offlineDraftService";
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
const DEMO_TRANSACTION_HASH = "0819554161045c5e2ef2a629dbd10396d504f76862739ceebf8452addf6c9489";
const DEMO_WALLET_PUBLIC_KEY = process.env.EXPO_PUBLIC_STORE_PUBLIC_KEY || "";

const NAV_ITEMS = ["Profile", "Tracker", "Debt", "Receipts"];
const EXPENSE_PAYMENT_SOURCES = [
  { id: "cash", label: "Cash" },
  { id: "gcash", label: "GCash" },
  { id: "maya", label: "Maya" },
  { id: "bank_transfer", label: "Bank transfer" },
];

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
  const router = useRouter();
  const network = useNetworkStatus();
  const insets = useSafeAreaInsets(); // 4-E: safe area for offline banner
  const [bentaAmount, setBentaAmount] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseSource, setExpenseSource] = useState("cash");
  const [expenses, setExpenses] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncedLedger, setSyncedLedger] = useState([]);
  const [isSavingBenta, setIsSavingBenta] = useState(false); // 4-B: rage-click guard
  const [isLedgerReady, setIsLedgerReady] = useState(false);
  const [isWalletReady, setIsWalletReady] = useState(false);
  const [walletConnection, setWalletConnection] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [documentStatusMessage, setDocumentStatusMessage] = useState("");
  const [activeRange, setActiveRange] = useState("week");
  const [activeSection, setActiveSection] = useState("Profile");
  const [receipts, setReceipts] = useState([]); // 4-D: live receipts
  const [loans, setLoans] = useState([]); // microloan records
  const [offlineDrafts, setOfflineDrafts] = useState([]);

  const displayLedger = network.isOffline ? [] : syncedLedger;
  const totalSyncedBenta = useMemo(
    () => displayLedger.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    [displayLedger],
  );
  const salesToday = useMemo(() => getSalesToday(displayLedger), [displayLedger]);
  const expenseTotal = useMemo(() => getExpenseTotal(expenses), [expenses]);

  // stage is now a CREDIT_STAGES string; metadata carries display properties
  const stage = evaluateCreditStage(totalSyncedBenta);
  const stageMeta = getStageMetadata(stage);
  const loanLimit = getLoanLimitForStage(stage);
  const tiwalaScore = calculateTiwalaScore(totalSyncedBenta);
  const graphSeries = useMemo(
    () => getSalesSeries(displayLedger, activeRange),
    [activeRange, displayLedger],
  );
  // 4-D: pass live receipts; falls back to SAMPLE_BUSINESS_TRANSACTIONS when empty
  const businessSnapshot = useMemo(
    () => getBusinessSnapshot(displayLedger, [...receipts, ...expenses]),
    [displayLedger, receipts, expenses],
  );
  const controlState = getOfflineControlState(network.isOffline);
  const offlineCapabilities = useMemo(
    () => getOfflineCapabilities({ isOffline: network.isOffline }),
    [network.isOffline],
  );
  const offlineWorkSummary = useMemo(
    () => summarizeOfflineWork({ pendingBenta: pendingQueue, drafts: offlineDrafts }),
    [pendingQueue, offlineDrafts],
  );
  const draftsReadyForSubmission = useMemo(
    () => getDraftsReadyForSubmission(offlineDrafts, { isOffline: network.isOffline }),
    [offlineDrafts, network.isOffline],
  );
  const isLoading = !network.hasCheckedInitialStatus || !isLedgerReady || !isWalletReady;

  const refreshLedger = useCallback(async () => {
    const [queue, ledger, liveReceipts, liveLoans, drafts, expenseRecords] = await Promise.all([
      getPendingSyncQueue(),
      getSyncedSalesLedger(),
      getReceipts(),
      getLoans(),
      getOfflineDrafts(),
      getExpenseLedger(),
    ]);
    setPendingQueue(queue);
    setSyncedLedger(ledger);
    setReceipts(liveReceipts);
    setLoans(liveLoans);
    setOfflineDrafts(drafts);
    setExpenses(expenseRecords);
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
    getWalletConnection()
      .then(setWalletConnection)
      .catch(() => setWalletConnection(null))
      .finally(() => setIsWalletReady(true));
  }, []);

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

  async function handleAddExpense() {
    setStatusMessage("");

    try {
      const payload = createExpensePayload({
        amount: expenseAmount,
        paymentSource: expenseSource,
      });
      const updatedExpenses = await appendExpenseToLedger(payload);
      setExpenses(updatedExpenses);
      setExpenseAmount("");
      setStatusMessage("Na-save ang expense record.");
    } catch (error) {
      Alert.alert("Expense error", error.message);
    }
  }

  function handleOnlineOnlyAction(label) {
    if (network.isOffline) {
      setStatusMessage(controlState.reason);
      return;
    }
    setStatusMessage(`${label} ready for Stellar Testnet flow.`);
  }

  async function handleConnectWallet(publicKey) {
    const connection = await saveWalletConnection({
      walletName: "Freighter",
      publicKey,
    });
    setWalletConnection(connection);
  }

  async function handleCreateDocument() {
    setDocumentStatusMessage("");

    if (receipts.length === 0 && loans.length === 0) {
      setDocumentStatusMessage("No recorded transactions.");
      return;
    }

    try {
      const html = generateReceiptDocument(receipts, loans);
      const fileUri = `${FileSystem.cacheDirectory}sarisync-ledger-${Date.now()}.html`;

      await FileSystem.writeAsStringAsync(fileUri, html, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/html",
          dialogTitle: "SariSync Ledger Document",
          UTI: "public.html",
        });
        setDocumentStatusMessage("Document ready.");
      } else {
        Alert.alert("Document ready", fileUri);
      }
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
        borrowerPublicKey: walletConnection?.publicKey,
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
      setStatusMessage(
        "✅ Natanggap ang ₱" +
          offer.amountPhpc.toLocaleString() +
          " mula sa " +
          offer.name +
          ". TX: " +
          result.transactionHash,
      );
    } catch (e) {
      setStatusMessage("❌ Loan failed: " + e.message);
    }
  }

  async function handleRepayLoan(loan) {
    try {
      if (network.isOffline) {
        const drafts = await appendOfflineDraft(createOfflineDraft({
          type: OFFLINE_DRAFT_TYPES.LOAN_REPAYMENT,
          amountPhpc: loan.amountPhpc,
          destinationPublicKey: loan.lenderPublicKey,
          lenderName: loan.lenderName,
          loanId: loan.id,
        }));
        setOfflineDrafts(drafts);
        setStatusMessage("Saved repayment draft. Submit when online.");
        return;
      }

      setStatusMessage("Nagbabayad sa " + loan.lenderName + "...");
      const result = await repayLoan({
        lenderPublicKey: loan.lenderPublicKey,
        amountPhpc: loan.amountPhpc,
        memo: "Repay " + loan.lenderName.slice(0, 18),
      });
      if (!result.success) throw new Error(result.error);
      await updateLoanStatus(loan.id, "paid");
      await refreshLedger();
      setStatusMessage(
        "✅ Nabayaran na ang utang sa " +
          loan.lenderName +
          ". TX: " +
          result.transactionHash,
      );
    } catch (e) {
      setStatusMessage("❌ Payment failed: " + e.message);
    }
  }

  function handleSubmitOfflineWork() {
    if (network.isOffline) {
      setStatusMessage(offlineCapabilities.message);
      return;
    }

    if (draftsReadyForSubmission.length === 0 && pendingQueue.length === 0) {
      setStatusMessage("No offline work waiting for submission.");
      return;
    }

    setStatusMessage(
      `Ready to submit ${draftsReadyForSubmission.length} offline Stellar draft(s). Review each draft before broadcasting.`,
    );
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!walletConnection) {
    return <WalletConnectionGate onConnect={handleConnectWallet} />;
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
            ? "Offline Mode. Online ledger hidden until internet returns. Local entries still save on this phone."
            : "Online dashboard for store sales, capital, business debt, and receipts."}
        </Text>
        <Text style={styles.walletPill}>
          Freighter connected · {walletConnection.publicKey.slice(0, 8)}...{walletConnection.publicKey.slice(-6)}
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard label="Sales today" value={formatPhp(salesToday)} color="#34C759" />
        <MetricCard label="Benta" value={formatPhp(totalSyncedBenta)} color="#34C759" />
        <MetricCard label="Expenses" value={formatPhp(expenseTotal)} color="#FF9500" />
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

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Log expense</Text>
        <TextInput
          value={expenseAmount}
          onChangeText={setExpenseAmount}
          keyboardType="number-pad"
          placeholder="Hal. 1200"
          placeholderTextColor="#918A7F"
          style={styles.input}
        />
        <Text style={styles.cardLabel}>Expense source</Text>
        <View style={styles.rangeRow}>
          {EXPENSE_PAYMENT_SOURCES.map((source) => (
            <Pressable
              key={source.id}
              accessibilityRole="button"
              onPress={() => setExpenseSource(source.id)}
              style={[
                styles.rangeButton,
                expenseSource === source.id && styles.rangeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  expenseSource === source.id && styles.rangeButtonTextActive,
                ]}
              >
                {source.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={handleAddExpense} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>I-save ang Expense</Text>
        </Pressable>
        {expenses.length > 0 ? (
          <View style={styles.expenseList}>
            {expenses.slice(0, 3).map((expense) => (
              <InfoRow
                key={expense.id}
                label={expenseSourceLabel(expense.paymentSource)}
                value={formatPhp(expense.amount)}
              />
            ))}
          </View>
        ) : null}
      </View>

      <OfflineWorkPanel
        summary={offlineWorkSummary}
        capabilities={offlineCapabilities}
        draftsReadyForSubmission={draftsReadyForSubmission}
        isOffline={network.isOffline}
        onSubmit={handleSubmitOfflineWork}
      />

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
          onOpenScanner={() => router.push("/scanner")}
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
          documentStatusMessage={documentStatusMessage}
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

function WalletConnectionGate({ onConnect }) {
  const [publicKey, setPublicKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function connect(publicKeyToConnect = publicKey) {
    setErrorMessage("");

    if (!isValidStellarPublicKey(publicKeyToConnect)) {
      setErrorMessage("Connect a valid Stellar Testnet public account.");
      return;
    }

    setIsConnecting(true);
    try {
      await onConnect(publicKeyToConnect);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.screen, styles.walletGateScreen]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SariSync Ledger</Text>
        <Text style={styles.title}>Connect Wallet</Text>
        <Text style={styles.subtitle}>
          Connect your Stellar Testnet account through Freighter before using Kaha.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Stellar + Freighter</Text>
        <Text style={styles.stageName}>Store owner account</Text>
        <TextInput
          value={publicKey}
          onChangeText={setPublicKey}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Paste Stellar G... public key"
          placeholderTextColor="#918A7F"
          style={[styles.input, styles.walletInput]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => connect(publicKey)}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            isConnecting && styles.disabled,
          ]}
          disabled={isConnecting}
        >
          <Text style={styles.primaryButtonText}>
            {isConnecting ? "Connecting..." : "Connect Freighter Wallet"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => connect(DEMO_WALLET_PUBLIC_KEY)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Use Demo Freighter Account</Text>
        </Pressable>
        {errorMessage ? <Text style={styles.statusText}>{errorMessage}</Text> : null}
      </View>
    </ScrollView>
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

function OfflineWorkPanel({ summary, capabilities, draftsReadyForSubmission, isOffline, onSubmit }) {
  const submitDisabled = isOffline || summary.totalPendingCount === 0;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.cardLabel}>Offline Work</Text>
          <Text style={styles.stageName}>Local drafts</Text>
        </View>
        <Text style={styles.lockText}>{summary.totalPendingCount} pending</Text>
      </View>
      <Text style={styles.bodyText}>{capabilities.message}</Text>
      <View style={styles.metricsGrid}>
        <MiniMetric label="Pending Benta records" value={String(summary.pendingBentaCount)} color="#34C759" />
        <MiniMetric label="Draft supplier invoices" value={String(summary.supplierInvoiceDraftCount)} color="#007AFF" />
        <MiniMetric label="Draft loan repayments" value={String(summary.repaymentDraftCount)} color="#FF9500" />
      </View>
      <Text style={[styles.bodyText, { fontSize: 12 }]}>
        Draft status: pending_online_submission · Ready online: {draftsReadyForSubmission.length}
      </Text>
      <Pressable
        disabled={submitDisabled}
        onPress={onSubmit}
        style={[styles.secondaryButton, submitDisabled && styles.disabledButton]}
      >
        <Text style={styles.secondaryButtonText}>Submit when online</Text>
      </Pressable>
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

function TrackerPanel({ snapshot, loans, loanLimit, stage, stageMeta, controlState, onReceiveLoan, onOpenScanner, statusMessage }) {
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
                <Text style={styles.lenderName}>{offer.name}</Text>
                <Text style={styles.bodyText}>{offer.description}</Text>
                <Text style={[styles.bodyText, { color: "#6E766F", fontSize: 11, marginTop: 2 }]}>Interest: {offer.interestRate}</Text>
              </View>
              <Pressable
                disabled={isRequesting || !controlState.canTransact}
                onPress={() => setSelectedOffer(offer)}
                style={[styles.loanButton, (isRequesting || !controlState.canTransact) ? styles.disabled : null]}
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

          <Pressable onPress={onOpenScanner} style={[styles.secondaryButton, { marginTop: 12 }]}>
            <Text style={styles.secondaryButtonText}>Scan Supplier Invoice</Text>
          </Pressable>
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
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <Pressable style={[styles.primaryButton, { flex: 1, marginRight: 8 }]} onPress={() => handleRequest(selectedOffer)}>
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
              <Text style={styles.lenderName}>{loan.lenderName}</Text>
              <Text style={styles.bodyText}>{new Date(loan.timestamp).toLocaleDateString("en-PH")}</Text>
            </View>
            <View style={styles.alignRight}>
              <Text style={styles.debtAmount}>{formatPhp(loan.amountPhpDisplay)}</Text>
              <Pressable
                disabled={isRepaying}
                onPress={() => setConfirmLoan(loan)}
                style={[styles.bayadButton, isRepaying ? styles.disabled : null]}
              >
                <Text style={styles.bayadButtonText}>{controlState.canTransact ? "Bayad" : "Draft"}</Text>
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
                <Text style={[styles.lenderName, { color: "#6E766F" }]}>{loan.lenderName}</Text>
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
      <Text style={[styles.bodyText, { fontSize: 11 }]}>
        Sample Testnet TX: {DEMO_TRANSACTION_HASH}
      </Text>
      <Pressable
        disabled={isValidating || !validateHash.trim()}
        onPress={handleValidate}
        style={[styles.primaryButton, (isValidating || !validateHash.trim()) ? styles.disabled : null]}
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
                  {controlState.canTransact
                    ? "Ito ay isang Stellar Testnet transaction na mag-sesend ng PHPC mula sa iyong store wallet."
                    : "Offline ngayon. Ise-save muna ito bilang repayment draft at hindi pa ibo-broadcast sa Stellar."}
                </Text>
              </>
            )}
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <Pressable style={[styles.primaryButton, { flex: 1, marginRight: 8, backgroundColor: "#FF3B30" }]} onPress={() => handleRepay(confirmLoan)}>
                <Text style={styles.primaryButtonText}>
                  {isRepaying ? "Nagbabayad..." : controlState.canTransact ? "Bayaran" : "Save Draft"}
                </Text>
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

function ReceiptsPanel({ receipts, loans, controlState, onCreateDocument, documentStatusMessage }) {
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

      {receipts.length > 0 || loans.length > 0 ? (
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
      ) : null}

      <Pressable
        onPress={onCreateDocument}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>📄 Create Document</Text>
      </Pressable>
      {documentStatusMessage ? (
        <Text style={[styles.bodyText, { fontSize: 12, color: "#6E766F", textAlign: "center" }]}>
          {documentStatusMessage}
        </Text>
      ) : null}
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

function expenseSourceLabel(sourceId) {
  const source = EXPENSE_PAYMENT_SOURCES.find((item) => item.id === sourceId);
  return source?.label || sourceId;
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
  walletGateScreen: {
    flexGrow: 1,
    justifyContent: "center",
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
  walletPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: 8,
    borderColor: "#D4CEC1",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#17231D",
    fontSize: 12,
    fontWeight: "800",
    backgroundColor: "#FFFFFF",
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
  expenseList: {
    gap: 10,
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
  walletInput: {
    fontSize: 13,
    fontWeight: "700",
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
    borderColor: "#D4CEC1",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#FAFAF7",
    marginTop: 8,
  },
  lenderName: {
    color: "#17231D",
    fontWeight: "800",
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#17231D",
    marginBottom: 4,
  },
});
