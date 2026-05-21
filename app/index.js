import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  Alert,
  Animated,
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
import { useTheme } from "../context/ThemeContext";
import { BentoMetricCard, IconNav } from "../components/SariSyncUI";

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

const NAV_ITEMS = [
  { id: "Kaha", label: "Kaha", icon: "wallet" },
  { id: "Tracker", label: "Tracker", icon: "trend" },
  { id: "Utang", label: "Utang", icon: "loan" },
  { id: "Proof", label: "Proof", icon: "proof" },
];
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
  const { theme, toggleTheme, colors } = useTheme();
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
  const [activeSection, setActiveSection] = useState("Kaha");
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
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 4-E: safe-area-aware offline banner */}
      {network.isOffline ? (
        <View style={[styles.offlineBanner, { marginTop: insets.top, backgroundColor: colors.errorContainer, borderColor: colors.error }]}>
          <Text style={[styles.offlineText, { color: colors.error }]}>{OFFLINE_WARNING}</Text>
          {/* Online ledger hidden until internet returns */}
        </View>
      ) : null}

      {/* Top App Bar */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 18, color: colors.primary }}>🏪</Text>
          <Text style={[styles.eyebrow, { color: colors.primary, fontSize: 16, fontWeight: "800", letterSpacing: 0 }]}>SariSync Ledger</Text>
        </View>
        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => [{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.cardSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }, pressed && styles.pressed]}
        >
          <Text style={{ fontSize: 18 }}>{theme === "light" ? "🌙" : "☀️"}</Text>
        </Pressable>
      </View>

      {/* Wallet pill */}
      <Text style={[styles.walletPill, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border }]}>
        Freighter connected · {walletConnection.publicKey.slice(0, 8)}...{walletConnection.publicKey.slice(-6)}
      </Text>

      {/* ─── BENTO GRID HERO (matches Stitch design) ─── */}
      <View style={styles.bentoHero}>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Benta Ngayon" value={formatPhp(salesToday)} tone="positive" />
        </View>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Mga Gastos" value={formatPhp(expenseTotal)} tone="expense" />
        </View>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Tiwala Score" value={`${tiwalaScore}`} />
        </View>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Limit sa Utang" value={formatPhp(loanLimit)} tone="positive" />
        </View>
      </View>

      {/* ─── SCAN SUPPLIER INVOICE CTA ─── */}
      <Pressable
        onPress={() => router.push("/scanner")}
        style={({ pressed }) => [
          styles.scanCta,
          pressed && styles.pressed,
        ]}
      >
        <Text style={{ fontSize: 20, color: "#FFFFFF" }}>📷</Text>
        <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFFFFF" }}>Scan Supplier Invoice</Text>
      </Pressable>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Sales graph</Text>
            <Text style={[styles.stageName, { color: colors.text }]}>
              {network.isOffline ? "Read-Only" : "Live Dashboard"}
            </Text>
          </View>
          {network.isOffline ? <Text style={[styles.lockText, { color: colors.textSecondary }]}>🔒 Cached</Text> : null}
        </View>

        <View style={styles.rangeRow}>
          {GRAPH_RANGES.map((range) => (
            <Pressable
              key={range}
              onPress={() => setActiveRange(range)}
              style={[
                styles.rangeButton,
                { borderColor: colors.border },
                activeRange === range && { backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  { color: colors.text },
                  activeRange === range && { color: theme === "light" ? "#FFFFFF" : "#111411" },
                ]}
              >
                {rangeLabel(range)}
              </Text>
            </Pressable>
          ))}
        </View>

        <SalesGraph series={graphSeries} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Log daily Benta</Text>
        <TextInput
          value={bentaAmount}
          onChangeText={setBentaAmount}
          keyboardType="number-pad"
          placeholder="Hal. 2500"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border }]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSavingBenta}
          onPress={handleAddBenta}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            isSavingBenta && styles.disabled,
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>
            {isSavingBenta ? "Sine-save..." : "I-save ang Benta"}
          </Text>
        </Pressable>
        {statusMessage ? <Text style={[styles.statusText, { color: colors.primary }]}>{statusMessage}</Text> : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Log expense</Text>
        <TextInput
          value={expenseAmount}
          onChangeText={setExpenseAmount}
          keyboardType="number-pad"
          placeholder="Hal. 1200"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border }]}
        />
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Expense source</Text>
        <View style={styles.rangeRow}>
          {EXPENSE_PAYMENT_SOURCES.map((source) => (
            <Pressable
              key={source.id}
              accessibilityRole="button"
              onPress={() => setExpenseSource(source.id)}
              style={[
                styles.rangeButton,
                { borderColor: colors.border },
                expenseSource === source.id && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  { color: colors.text },
                  expenseSource === source.id && { color: theme === "light" ? "#FFFFFF" : "#111411" },
                ]}
              >
                {source.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={handleAddExpense}
          style={[styles.secondaryButton, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>I-save ang Expense</Text>
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

      <IconNav items={NAV_ITEMS} activeId={activeSection} onSelect={setActiveSection} />

      {activeSection === "Kaha" ? (
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
      {activeSection === "Utang" ? (
        <DebtPanel
          loans={loans}
          controlState={controlState}
          onRepayLoan={handleRepayLoan}
          statusMessage={statusMessage}
        />
      ) : null}
      {activeSection === "Proof" ? (
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

const LOADING_MESSAGES = [
  "Kinokonekta ang Kaha...",
  "Inaayos ang mga Listahan...",
  "Sini-sync ang mga Utang...",
  "Binibilang ang Stocks...",
];

function LoadingScreen() {
  const { colors } = useTheme();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3500,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
      {/* App Icon placeholder */}
      <View style={[styles.loadingIconBox, { backgroundColor: colors.primary }]}>
        <Text style={{ fontSize: 40, color: "#FFFFFF" }}>🏪</Text>
      </View>

      {/* Brand */}
      <Text style={[styles.loadingTitle, { color: colors.text }]}>SariSync Ledger</Text>
      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textSecondary, letterSpacing: 2, textTransform: "uppercase", marginBottom: 32 }}>Kaagapay ng Tindahan</Text>

      {/* Rotating message */}
      <Text style={[styles.loadingText, { color: colors.text, marginBottom: 4 }]}>{LOADING_MESSAGES[msgIndex]}</Text>
      <Text style={[styles.loadingText, { color: colors.textSecondary, fontStyle: "italic", marginBottom: 20, fontSize: 13 }]}>Sandali lamang po.</Text>

      {/* Progress bar */}
      <View style={{ width: 240, height: 6, backgroundColor: colors.border, borderRadius: 99, overflow: "hidden", marginBottom: 32 }}>
        <Animated.View style={{ height: "100%", width: progressWidth, backgroundColor: colors.primary, borderRadius: 99 }} />
      </View>

      {/* Trust badge */}
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.cardSecondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, gap: 6 }}>
        <Text style={{ color: colors.primary, fontSize: 14 }}>🔒</Text>
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Ligtas at Secure</Text>
      </View>
    </View>
  );
}

function WalletConnectionGate({ onConnect }) {
  const { theme, toggleTheme, colors } = useTheme();
  const [publicKey, setPublicKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function connect(publicKeyToConnect = publicKey) {
    setErrorMessage("");

    if (!isValidStellarPublicKey(publicKeyToConnect)) {
      setErrorMessage("I-konek ang isang valid na Stellar Testnet G... public key.");
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
    <ScrollView contentContainerStyle={[styles.screen, styles.walletGateScreen, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.walletHeader, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24, width: "100%" }]}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 24, color: colors.primary }}>🔑</Text>
          <Text style={[styles.title, { color: colors.primary, fontSize: 22, fontWeight: "800", marginBottom: 0 }]}>SariSync Ledger</Text>
        </View>
        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => [
            {
              padding: 8,
              borderRadius: 99,
              backgroundColor: colors.cardSecondary,
              borderWidth: 1,
              borderColor: colors.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={{ fontSize: 18 }}>{theme === "light" ? "🌙" : "☀️"}</Text>
        </Pressable>
      </View>

      {/* Main Connection Card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 24, borderRadius: 16, width: "100%" }]}>
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View style={{ backgroundColor: theme === "light" ? "#A6F8B4" : "#0d6f37", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, marginBottom: 12 }}>
            <Text style={{ color: theme === "light" ? "#005427" : "#A6F8B4", fontSize: 12, fontWeight: "700" }}>Konek Wallet</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.textSecondary, textAlign: "center", fontSize: 15, paddingHorizontal: 8 }]}>
            I-konek ang iyong Stellar Testnet account sa pamamagitan ng Freighter bago gamitin ang Kaha.
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          {/* Input Section */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "700", marginLeft: 4 }}>Stellar Public Key</Text>
            <TextInput
              value={publicKey}
              onChangeText={setPublicKey}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="I-paste ang Stellar G... public key"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.input,
                styles.walletInput,
                { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border, borderRadius: 12 }
              ]}
            />
          </View>

          {/* Primary Action Button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => connect(publicKey)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, borderRadius: 99 },
              pressed && styles.pressed,
              isConnecting && styles.disabled,
            ]}
            disabled={isConnecting}
          >
            <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>
              {isConnecting ? "Kumokonekta..." : "Konek Freighter Wallet"}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 8 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginHorizontal: 8 }}>o kaya</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Secondary Action Button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => connect(DEMO_WALLET_PUBLIC_KEY)}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Gamitin ang Demo Freighter Account</Text>
          </Pressable>

          {errorMessage ? <Text style={[styles.statusText, { color: colors.error, textAlign: "center", marginTop: 8 }]}>{errorMessage}</Text> : null}
        </View>
      </View>

      {/* Powered by tag */}
      <View style={{ marginTop: 32, alignItems: "center" }}>
        <Text style={{ fontSize: 10, color: colors.textSecondary, letterSpacing: 1.5, fontWeight: "700" }}>POWERED BY SARISYNC CORE V1.0</Text>
      </View>
    </ScrollView>
  );
}

function MetricCard({ label, value, color }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: color || colors.text }]}>{value}</Text>
    </View>
  );
}

function SalesGraph({ series }) {
  const { colors } = useTheme();
  const maxAmount = Math.max(1, ...series.map((item) => item.amount));

  return (
    <View style={styles.graph}>
      {series.map((item) => {
        const height = Math.max(8, Math.round((item.amount / maxAmount) * 120));

        return (
          <View key={item.label} style={styles.graphItem}>
            <View style={[styles.graphTrack, { backgroundColor: colors.cardSecondary }]}>
              <View style={[styles.graphBar, { height, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.graphLabel, { color: colors.textSecondary }]}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function OfflineWorkPanel({ summary, capabilities, draftsReadyForSubmission, isOffline, onSubmit }) {
  const { colors } = useTheme();
  const submitDisabled = isOffline || summary.totalPendingCount === 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Offline Work</Text>
          <Text style={[styles.stageName, { color: colors.text }]}>Local drafts</Text>
        </View>
        <Text style={[styles.lockText, { color: colors.error }]}>{summary.totalPendingCount} pending</Text>
      </View>
      <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{capabilities.message}</Text>
      <View style={styles.metricsGrid}>
        <MiniMetric label="Pending Benta records" value={String(summary.pendingBentaCount)} color={colors.primary} />
        <MiniMetric label="Draft supplier invoices" value={String(summary.supplierInvoiceDraftCount)} color={colors.tertiary} />
        <MiniMetric label="Draft loan repayments" value={String(summary.repaymentDraftCount)} color={colors.error} />
      </View>
      <Text style={[styles.bodyText, { fontSize: 12, color: colors.textSecondary }]}>
        Draft status: pending_online_submission · Ready online: {draftsReadyForSubmission.length}
      </Text>
      <Pressable
        disabled={submitDisabled}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.secondaryButton,
          { backgroundColor: colors.cardSecondary, borderColor: colors.border },
          pressed && styles.pressed,
          submitDisabled && styles.disabled,
        ]}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Submit when online</Text>
      </Pressable>
    </View>
  );
}

function ProfilePanel({ stage, stageMeta, tiwalaScore, loanLimit }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Profile</Text>
      <Text style={[styles.stageName, { color: colors.text }]}>Store Settings</Text>
      <InfoRow label="Store type" value="Sari-sari inventory business" />
      <InfoRow label="Stage" value={stageMeta.name} />
      <InfoRow label="Tiwala Score" value={String(tiwalaScore)} />
      <InfoRow label="Loan limit" value={formatPhp(loanLimit)} />
    </View>
  );
}

function TrackerPanel({ snapshot, loans, loanLimit, stage, stageMeta, controlState, onReceiveLoan, onOpenScanner, statusMessage }) {
  const { theme, colors } = useTheme();
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
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Tracker</Text>
      <Text style={[styles.stageName, { color: colors.text }]}>Capital movement</Text>
      <View style={styles.metricsGrid}>
        <MiniMetric label="Spent" value={formatPhp(snapshot.spent)} />
        <MiniMetric label="Earned" value={formatPhp(snapshot.earned)} color={colors.primary} />
        <MiniMetric label="Capital" value={formatPhp(snapshot.capital + loanCapital)} color={colors.tertiary} />
        <MiniMetric label="Active Debt" value={formatPhp(loanCapital)} color={colors.error} />
      </View>

      {statusMessage ? <Text style={[styles.statusText, { color: colors.primary }]}>{statusMessage}</Text> : null}

      {isReadOnly ? (
        <View style={[styles.readOnlyBanner, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
          <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>
            I-record ang ₱5,000 na benta para ma-unlock ang credit at financing.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8, color: colors.textSecondary }]}>Microloan Offers</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Tumatanggap ng pondo mula sa mga partner na microfinance companies sa Stellar Testnet.</Text>
          {LENDER_OFFERS.map(offer => (
            <View key={offer.id} style={[styles.lenderCard, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lenderName, { color: colors.text }]}>{offer.name}</Text>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{offer.description}</Text>
                <Text style={[styles.bodyText, { color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>Interest: {offer.interestRate}</Text>
              </View>
              <Pressable
                disabled={isRequesting || !controlState.canTransact}
                onPress={() => setSelectedOffer(offer)}
                style={({ pressed }) => [
                  styles.loanButton,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                  (isRequesting || !controlState.canTransact) && styles.disabled,
                ]}
              >
                <Text style={[styles.loanButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Humingi</Text>
              </Pressable>
            </View>
          ))}

          {activeLoans.length > 0 && (
            <>
              <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8, color: colors.textSecondary }]}>Active Loans</Text>
              {activeLoans.map(loan => (
                <InfoRow
                  key={loan.id}
                  label={loan.lenderName}
                  value={formatPhp(loan.amountPhpDisplay)}
                />
              ))}
            </>
          )}

          <Pressable
            onPress={onOpenScanner}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: colors.cardSecondary, borderColor: colors.border, marginTop: 12 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Scan Supplier Invoice</Text>
          </Pressable>
        </>
      )}

      {/* Loan confirmation modal */}
      <Modal visible={!!selectedOffer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Kumpirmahin ang Loan</Text>
            {selectedOffer && (
              <>
                <Text style={[styles.bodyText, { color: colors.text }]}>Lender: <Text style={{ fontWeight: "700" }}>{selectedOffer.name}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 4, color: colors.text }]}>Amount: <Text style={{ fontWeight: "700", color: colors.tertiary }}>{formatPhp(selectedOffer.amountPhpc)}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 4, color: colors.text }]}>Interest: {selectedOffer.interestRate}</Text>
                <Text style={[styles.bodyText, { marginTop: 8, color: colors.textSecondary, fontSize: 12 }]}>
                  Ito ay isang Stellar Testnet transaction. Ang PHPC ay ililipat sa iyong store wallet.
                </Text>
              </>
            )}
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { flex: 1, marginRight: 8, backgroundColor: colors.primary },
                  pressed && styles.pressed,
                ]}
                onPress={() => handleRequest(selectedOffer)}
              >
                <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>{isRequesting ? "Naghihintay..." : "Tanggapin"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { flex: 1, marginTop: 0, backgroundColor: colors.cardSecondary, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
                onPress={() => setSelectedOffer(null)}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Kanselahin</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DebtPanel({ loans, controlState, onRepayLoan, statusMessage }) {
  const { theme, colors } = useTheme();
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
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Debt</Text>
      <Text style={[styles.stageName, { color: colors.text }]}>Business debt tracker</Text>

      {statusMessage ? <Text style={[styles.statusText, { color: colors.primary }]}>{statusMessage}</Text> : null}

      {/* Active debts */}
      <Text style={[styles.cardLabel, { marginTop: 8, marginBottom: 8, color: colors.textSecondary }]}>Mga Aktibong Utang</Text>
      {activeLoans.length === 0 ? (
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Wala kang aktibong utang. Humingi ng loan sa Tracker tab.</Text>
      ) : (
        activeLoans.map(loan => (
          <View key={loan.id} style={[styles.debtRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lenderName, { color: colors.text }]}>{loan.lenderName}</Text>
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{new Date(loan.timestamp).toLocaleDateString("en-PH")}</Text>
            </View>
            <View style={styles.alignRight}>
              <Text style={[styles.debtAmount, { color: colors.error }]}>{formatPhp(loan.amountPhpDisplay)}</Text>
              <Pressable
                disabled={isRepaying}
                onPress={() => setConfirmLoan(loan)}
                style={({ pressed }) => [
                  styles.bayadButton,
                  { backgroundColor: colors.error },
                  pressed && styles.pressed,
                  isRepaying && styles.disabled,
                ]}
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
          <Text style={[styles.cardLabel, { marginTop: 16, marginBottom: 8, color: colors.textSecondary }]}>Nabayarang Utang</Text>
          {paidLoans.map(loan => (
            <View key={loan.id} style={[styles.debtRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lenderName, { color: colors.textSecondary }]}>{loan.lenderName}</Text>
              </View>
              <View style={styles.alignRight}>
                <Text style={[styles.debtAmount, { color: colors.primary }]}>{formatPhp(loan.amountPhpDisplay)}</Text>
                <Text style={[styles.bodyText, { color: colors.primary, fontSize: 11 }]}>✓ Paid</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Validate Stellar Invoice */}
      <Text style={[styles.cardLabel, { marginTop: 20, marginBottom: 8, color: colors.textSecondary }]}>I-Validate ang Stellar Invoice</Text>
      <Text style={[styles.bodyText, { color: colors.textSecondary }]}>I-paste ang transaction hash para i-verify sa Horizon Testnet.</Text>
      <TextInput
        value={validateHash}
        onChangeText={setValidateHash}
        placeholder="Transaction hash (64 hex chars)"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { marginVertical: 8, fontSize: 13, backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border }]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[styles.bodyText, { fontSize: 11, color: colors.textSecondary }]}>
        Sample Testnet TX: {DEMO_TRANSACTION_HASH}
      </Text>
      <Pressable
        disabled={isValidating || !validateHash.trim()}
        onPress={handleValidate}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.primary },
          pressed && styles.pressed,
          (isValidating || !validateHash.trim()) && styles.disabled,
        ]}
      >
        <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>{isValidating ? "Nag-va-validate..." : "I-Validate"}</Text>
      </Pressable>

      {validationResult && (
        <View style={[styles.lenderCard, { marginTop: 12, backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
          {validationResult.success ? (
            <View style={{ width: "100%" }}>
              <Text style={[styles.rowLabel, { color: colors.primary }]}>✅ Valid Stellar Transaction</Text>
              <InfoRow label="Ledger" value={String(validationResult.ledger)} />
              <InfoRow label="Date" value={new Date(validationResult.createdAt).toLocaleString("en-PH")} />
              <InfoRow label="Source" value={validationResult.sourceAccount.slice(0, 8) + "..." + validationResult.sourceAccount.slice(-6)} />
              <InfoRow label="Operations" value={String(validationResult.operationCount)} />
              {validationResult.memo && <InfoRow label="Memo" value={validationResult.memo} />}
              <InfoRow label="Successful" value={validationResult.successful ? "Yes" : "No"} />
            </View>
          ) : (
            <Text style={[styles.bodyText, { color: colors.error }]}>❌ {validationResult.error}</Text>
          )}
        </View>
      )}

      {/* Payment confirmation modal */}
      <Modal visible={!!confirmLoan} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Kumpirmahin ang Bayad</Text>
            {confirmLoan && (
              <>
                <Text style={[styles.bodyText, { color: colors.text }]}>Magbabayad sa: <Text style={{ fontWeight: "700" }}>{confirmLoan.lenderName}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 4, color: colors.text }]}>Halaga: <Text style={{ fontWeight: "700", color: colors.error }}>{formatPhp(confirmLoan.amountPhpDisplay)}</Text></Text>
                <Text style={[styles.bodyText, { marginTop: 8, fontSize: 12, color: colors.textSecondary }]}>
                  {controlState.canTransact
                    ? "Ito ay isang Stellar Testnet transaction na mag-sesend ng PHPC mula sa iyong store wallet."
                    : "Offline ngayon. Ise-save muna ito bilang repayment draft at hindi pa ibo-broadcast sa Stellar."}
                </Text>
              </>
            )}
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { flex: 1, marginRight: 8, backgroundColor: colors.error },
                  pressed && styles.pressed,
                ]}
                onPress={() => handleRepay(confirmLoan)}
              >
                <Text style={[styles.primaryButtonText, { color: "#FFFFFF" }]}>
                  {isRepaying ? "Nagbabayad..." : controlState.canTransact ? "Bayaran" : "Save Draft"}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { flex: 1, marginTop: 0, backgroundColor: colors.cardSecondary, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
                onPress={() => setConfirmLoan(null)}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Kanselahin</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ReceiptsPanel({ receipts, loans, controlState, onCreateDocument, documentStatusMessage }) {
  const { theme, colors } = useTheme();
  const totalUsdc = receipts.reduce((s, r) => s + Number(r.amountUsdc || 0), 0);
  const totalLoaned = loans.reduce((s, l) => s + Number(l.amountPhpDisplay || 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Receipts</Text>
      <Text style={[styles.stageName, { color: colors.text }]}>Transaction proof</Text>

      <View style={styles.metricsGrid}>
        <MiniMetric label="Settlements" value={String(receipts.length)} />
        <MiniMetric label="Total USDC" value={totalUsdc.toFixed(2)} color={colors.primary} />
        <MiniMetric label="Loans" value={String(loans.length)} />
        <MiniMetric label="Loaned" value={formatPhp(totalLoaned)} color={colors.tertiary} />
      </View>

      {receipts.length > 0 || loans.length > 0 ? (
        <>
          {receipts.length > 0 && (
            <>
              <Text style={[styles.cardLabel, { marginTop: 12, marginBottom: 6, color: colors.textSecondary }]}>B2B Supplier Settlements</Text>
              {receipts.map((receipt) => (
                <View key={receipt.id} style={[styles.receiptRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{receipt.type ?? "B2B_FINANCING"}</Text>
                    <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{new Date(receipt.timestamp).toLocaleDateString("en-PH")}</Text>
                  </View>
                  <Text style={[styles.debtAmount, { color: colors.primary }]}>{formatUsdc(receipt.amountUsdc)}</Text>
                </View>
              ))}
            </>
          )}
          {loans.length > 0 && (
            <>
              <Text style={[styles.cardLabel, { marginTop: 12, marginBottom: 6, color: colors.textSecondary }]}>Microloan Records</Text>
              {loans.map((loan) => (
                <View key={loan.id} style={[styles.receiptRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{loan.lenderName}</Text>
                    <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{new Date(loan.timestamp).toLocaleDateString("en-PH")}</Text>
                  </View>
                  <View style={styles.alignRight}>
                    <Text style={[styles.debtAmount, { color: colors.text }]}>{formatPhp(loan.amountPhpDisplay)}</Text>
                    <Text style={[styles.bodyText, { fontSize: 11, color: loan.status === "paid" ? colors.primary : colors.secondary }]}>
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
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.primary, marginTop: 12 },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>📄 Create Document</Text>
      </Pressable>
      {documentStatusMessage ? (
        <Text style={[styles.bodyText, { fontSize: 12, color: colors.textSecondary, textAlign: "center" }]}>
          {documentStatusMessage}
        </Text>
      ) : null}
    </View>
  );
}

function MiniMetric({ label, value, color }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.miniMetric, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.miniMetricValue, { color: color || colors.text }]}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function OnlineActionButton({ label, controlState, onPress }) {
  const { theme, colors } = useTheme();
  const disabled = !controlState.canTransact;

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.primary },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>{disabled ? `🔒 ${label}` : label}</Text>
      </Pressable>
      {disabled ? <Text style={[styles.lockHint, { color: colors.textSecondary }]}>{controlState.reason}</Text> : null}
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
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingIconBox: {
    width: 100,
    height: 100,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  loadingTitle: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 6,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 15,
    textAlign: "center",
  },
  bentoHero: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginVertical: 12,
  },
  bentoMetricCell: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 150,
  },
  scanCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 99,
    backgroundColor: "#0D6F37",
    marginBottom: 8,
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
    transform: [{ scale: 0.96 }],
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
