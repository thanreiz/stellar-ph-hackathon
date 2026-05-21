import '../utils/polyfills';
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
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
  getOutstandingLoanBalance,
  setOutstandingLoanBalance,
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
  appendReceipt,
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
  fetchLiveWalletBalances,
  receiveLoanFromLender,
  repayLoan,
  validateStellarTransaction,
} from "../services/stellarService";
import { fetchOnChainProfile, syncProfileToChain } from "../services/sorobanService";
import { generateReceiptDocument } from "../utils/documentGenerator";
import { formatPhp, formatUsdc } from "../utils/formatters";
import { useTheme } from "../context/ThemeContext";
import { useAppContext } from "../context/AppContext";
import { BentoMetricCard, IconNav, ProofHint } from "../components/SariSyncUI";

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

const XLM_TO_PHP_RATE = 9.07;
const USDC_TO_PHP_RATE = 61.45;

// Tindahan Cash = Total Synced Benta (offline ledger) + PHPC Balance (on-chain)
// XLM is strictly a gas reserve and is never shown to the user.
function calculateTindahanCash(totalSyncedBenta, phpcBalance, cashOutTotal = 0) {
  const benta = Number(totalSyncedBenta || 0);
  const phpc = Number(phpcBalance || 0);
  const cashout = Number(cashOutTotal || 0);
  return Math.max(0, benta + phpc - cashout);
}

export default function KahaScreen() {
  const router = useRouter();
  const network = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const { theme, toggleTheme, colors, hasCompletedOnboarding, onboardingDetails, isLoading: isContextLoading } = useAppContext();
  const [bentaAmount, setBentaAmount] = useState("");
  
  // Simulated Cash Out (Off-ramp) States
  const [cashOutTotal, setCashOutTotal] = useState(0);
  const [isCashOutModalVisible, setIsCashOutModalVisible] = useState(false);
  const [cashOutAmount, setCashOutAmount] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("GCash");
  const [cashOutStep, setCashOutStep] = useState("form"); // "form" | "connecting" | "interactive" | "broadcasting" | "success"
  const [cashOutError, setCashOutError] = useState("");
  const [cashOutTxHash, setCashOutTxHash] = useState("");
  const [simPhoneNumber, setSimPhoneNumber] = useState("");
  const [simOtp, setSimOtp] = useState("");

  useEffect(() => {
    if (!isContextLoading && !hasCompletedOnboarding) {
      router.replace("/onboarding");
    }
  }, [isContextLoading, hasCompletedOnboarding]);
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
  const [onChainScore, setOnChainScore] = useState(null);
  const [onChainLimit, setOnChainLimit] = useState(null);
  const [isSyncingOnChain, setIsSyncingOnChain] = useState(false);
  const [phpcBalance, setPhpcBalance] = useState("0.00");
  const [xlmBalance, setXlmBalance] = useState("0.0000");
  const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [showUnlockedModal, setShowUnlockedModal] = useState(false);
  const [unlockedStageInfo, setUnlockedStageInfo] = useState({ stageName: "", limit: 0 });

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
  const displayScore = (!network.isOffline && onChainScore !== null) ? onChainScore : tiwalaScore;
  const displayLimit = (!network.isOffline && onChainLimit !== null) ? onChainLimit : loanLimit;
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
  const isLoading = !network.hasCheckedInitialStatus || !isLedgerReady || !isWalletReady || isContextLoading || !hasCompletedOnboarding;

  const refreshLedger = useCallback(async () => {
    const [queue, ledger, liveReceipts, liveLoans, drafts, expenseRecords, liveOutstandingBalance, savedCashOut] = await Promise.all([
      getPendingSyncQueue(),
      getSyncedSalesLedger(),
      getReceipts(),
      getLoans(),
      getOfflineDrafts(),
      getExpenseLedger(),
      getOutstandingLoanBalance(),
      AsyncStorage.getItem("sarisync:cashOutTotal")
    ]);
    setPendingQueue(queue);
    setSyncedLedger(ledger);
    setReceipts(liveReceipts);
    setLoans(liveLoans);
    setOfflineDrafts(drafts);
    setExpenses(expenseRecords);
    setOutstandingBalance(liveOutstandingBalance);
    setCashOutTotal(savedCashOut ? Number(savedCashOut) : 0);

    if (!network.isOffline) {
      try {
        const wallet = await getWalletConnection();
        if (wallet && wallet.publicKey) {
          const [profile, balances] = await Promise.all([
            fetchOnChainProfile(wallet.publicKey).catch((err) => {
              console.error("[SorobanService] Profile query failed:", err);
              return null;
            }),
            fetchLiveWalletBalances(wallet.publicKey).catch((err) => {
              console.error("[StellarService] Balances query failed:", err);
              if (err.status === 404 || err.message?.includes("404") || err.name === "NotFoundError") {
                return { xlm: "0.0000", phpc: "0.0000" };
              }
              throw err;
            }),
          ]);

          if (profile) {
            setOnChainScore(profile.score);
            setOnChainLimit(profile.loanLimit);
          }
          if (balances) {
            setPhpcBalance(balances.phpc);
            setXlmBalance(balances.xlm);
          }
        }
      } catch (err) {
        console.error("[SorobanService] Failed to fetch profile/balances in refreshLedger:", err);
      }
    }
    setIsLedgerReady(true);
  }, [network.isOffline]);

  const checkStageUpgrade = useCallback((oldTotal, newTotal) => {
    const oldStage = evaluateCreditStage(oldTotal);
    const newStage = evaluateCreditStage(newTotal);
    if (oldStage !== newStage) {
      const nextLimit = getLoanLimitForStage(newStage);
      const nextMeta = getStageMetadata(newStage);
      setUnlockedStageInfo({
        stageName: nextMeta.name,
        limit: nextLimit,
      });
      setShowUnlockedModal(true);
    }
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

        const initialLedger = await getSyncedSalesLedger();
        const oldTotal = initialLedger.reduce((sum, record) => sum + Number(record.amount || 0), 0);

        await syncPendingSalesQueue();

        // Recalculate score and limit and sync to Stellar contract
        const ledger = await getSyncedSalesLedger();
        const totalSyncedBenta = ledger.reduce((sum, record) => sum + Number(record.amount || 0), 0);
        const newScore = calculateTiwalaScore(totalSyncedBenta);
        const newLimit = getLoanLimitForStage(evaluateCreditStage(totalSyncedBenta));

        const storeSecretKey = process.env.EXPO_PUBLIC_STORE_SECRET_KEY;
        if (storeSecretKey) {
          setIsSyncingOnChain(true);
          try {
            setStatusMessage("Sini-sync ang iyong Tiwala Profile sa secure network...");
            const syncResult = await syncProfileToChain(storeSecretKey, newScore, newLimit);
            // 1. Eagerly push confirmed on-chain values the moment the tx finalises
            setOnChainScore(syncResult.confirmedScore);
            setOnChainLimit(syncResult.confirmedLimit);
            setStatusMessage("Tagumpay na na-sync ang offline Benta at secure profile.");
          } catch (sorobanError) {
            console.error("Soroban sync failed during syncWhenOnline:", sorobanError);
            setStatusMessage(`Na-sync ang offline Benta, ngunit bigo ang on-chain sync: ${sorobanError.message}`);
          } finally {
            setIsSyncingOnChain(false);
          }
        } else {
          setStatusMessage("Na-sync ang offline Benta records.");
        }

        await refreshLedger();
        checkStageUpgrade(oldTotal, totalSyncedBenta);
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
        const initialLedger = await getSyncedSalesLedger();
        const oldTotal = initialLedger.reduce((sum, record) => sum + Number(record.amount || 0), 0);

        const ledger = await appendToSyncedSalesLedger([payload]);
        setSyncedLedger(ledger);
        setStatusMessage("Na-save ang Benta sa synced ledger.");

        const storeSecretKey = process.env.EXPO_PUBLIC_STORE_SECRET_KEY;
        if (storeSecretKey) {
          setIsSyncingOnChain(true);
          try {
            const totalSyncedBenta = ledger.reduce((sum, record) => sum + Number(record.amount || 0), 0);
            const newScore = calculateTiwalaScore(totalSyncedBenta);
            const newLimit = getLoanLimitForStage(evaluateCreditStage(totalSyncedBenta));

            setStatusMessage("Sini-sync ang iyong Tiwala Profile sa secure network...");
            const syncResult = await syncProfileToChain(storeSecretKey, newScore, newLimit);

            // 1. Eagerly push confirmed on-chain values as soon as tx finalises on Soroban
            setOnChainScore(syncResult.confirmedScore);
            setOnChainLimit(syncResult.confirmedLimit);
            setStatusMessage("Sini-sync ang live balances mula sa network...");

            // 2. Re-fetch verified contract state + updated XLM/PHPC balances (gas deducted)
            await refreshLedger();
            setStatusMessage("Na-save ang Benta at na-sync sa iyong secure profile!");

            checkStageUpgrade(oldTotal, totalSyncedBenta);
          } catch (sorobanError) {
            console.error("Soroban sync failed:", sorobanError);
            setStatusMessage(`Na-save ang benta, ngunit bigo ang on-chain sync: ${sorobanError.message}`);
          } finally {
            setIsSyncingOnChain(false);
          }
        } else {
          const totalSyncedBenta = ledger.reduce((sum, record) => sum + Number(record.amount || 0), 0);
          await refreshLedger();
          checkStageUpgrade(oldTotal, totalSyncedBenta);
        }
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
      const current = await getOutstandingLoanBalance();
      await setOutstandingLoanBalance(current + offer.amountPhpc);
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
      const current = await getOutstandingLoanBalance();
      await setOutstandingLoanBalance(Math.max(0, current - loan.amountPhpc));
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

      {/* Wallet info row */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 12 }}>
        <Pressable
          onPress={() => setIsWalletModalVisible(true)}
          style={({ pressed }) => [
            styles.walletPill,
            { marginTop: 0, backgroundColor: colors.cardSecondary, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 },
            pressed && styles.pressed
          ]}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.text }}>
            {network.isOffline ? "🔴 SariSync Wallet: Offline" : "🟢 Konektado: SariSync Wallet"}
          </Text>
        </Pressable>
      </View>

      {/* ─── WALLET BALANCE CARD ─── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 18, borderRadius: 24 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Tindahan Cash (Wallet Balance)
            </Text>
            <Text style={{ fontSize: 32, fontWeight: "900", color: colors.primary, marginTop: 4 }}>
              {formatPhp(calculateTindahanCash(totalSyncedBenta, phpcBalance, cashOutTotal))}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={network.isOffline}
            onPress={() => {
              setCashOutAmount("");
              setCashOutStep("form");
              setCashOutError("");
              setCashOutTxHash("");
              setSimPhoneNumber("");
              setSimOtp("");
              setIsCashOutModalVisible(true);
            }}
            style={({ pressed }) => [
              {
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 99,
                backgroundColor: network.isOffline ? colors.border : colors.primary,
                alignItems: "center",
                justifyContent: "center",
              },
              pressed && !network.isOffline && styles.pressed,
            ]}
          >
            <Text style={{ fontSize: 13, fontWeight: "800", color: network.isOffline ? colors.textSecondary : colors.buttonTextOnPrimary }}>
              {network.isOffline ? "Offline" : "I-Cash Out 💸"}
            </Text>
          </Pressable>
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />

        {/* Breakdown rows */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "700" }}>
              Total Synced Benta
            </Text>
            <Text style={{ fontSize: 13, color: colors.text, fontWeight: "800" }}>
              {formatPhp(totalSyncedBenta)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "700" }}>
              PHPC Balance
            </Text>
            <Text style={{ fontSize: 13, color: colors.text, fontWeight: "800" }}>
              {formatPhp(Number(phpcBalance))}
            </Text>
          </View>
          {cashOutTotal > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "700" }}>
                Cash Out (Na-withdraw)
              </Text>
              <Text style={{ fontSize: 13, color: colors.error, fontWeight: "800" }}>
                -{formatPhp(cashOutTotal)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ─── BENTO GRID HERO (matches Stitch design) ─── */}
      <View style={styles.bentoHero}>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Benta Ngayon" value={formatPhp(salesToday)} tone="positive" />
        </View>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Mga Gastos" value={formatPhp(expenseTotal)} tone="expense" />
        </View>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Tiwala Score" value={`${displayScore}`} />
        </View>
        <View style={styles.bentoMetricCell}>
          <BentoMetricCard label="Limit sa Utang" value={formatPhp(displayLimit)} tone="positive" />
        </View>
      </View>

      {/* ─── STAGE PROGRESS BAR ─── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 14, borderRadius: 24 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.textSecondary }}>
            {stage === CREDIT_STAGES.CORNER_STORE
              ? "Credit Ladder Stage: Max Stage"
              : `Credit Ladder Progress: ${stageMeta.name}`}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>
            {stage === CREDIT_STAGES.READ_ONLY
              ? `${formatPhp(totalSyncedBenta)} / ${formatPhp(5000)}`
              : stage === CREDIT_STAGES.MICRO_SARI
              ? `${formatPhp(totalSyncedBenta)} / ${formatPhp(30000)}`
              : "Max Stage"}
          </Text>
        </View>
        <View style={{ height: 8, width: "100%", backgroundColor: colors.cardSecondary, borderRadius: 99, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
          <View
            style={{
              height: "100%",
              width: `${Math.min(
                100,
                stage === CREDIT_STAGES.READ_ONLY
                  ? (totalSyncedBenta / 5000) * 100
                  : stage === CREDIT_STAGES.MICRO_SARI
                  ? (totalSyncedBenta / 30000) * 100
                  : 100
              )}%`,
              backgroundColor: colors.primary,
              borderRadius: 99,
            }}
          />
        </View>
        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
          {stage === CREDIT_STAGES.READ_ONLY
            ? `Mag-record pa ng ${formatPhp(Math.max(0, 5000 - totalSyncedBenta))} na benta upang ma-unlock ang Micro-Sari stage.`
            : stage === CREDIT_STAGES.MICRO_SARI
            ? `Mag-record pa ng ${formatPhp(Math.max(0, 30000 - totalSyncedBenta))} na benta upang ma-unlock ang Corner Store stage.`
            : "Nasa pinakamataas na Stage na (Max Stage)"}
        </Text>
      </View>

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

      {/* ─── QUICK ACTION FINANCING BUTTON ─── */}
      <View style={{ gap: 8, marginTop: -4, marginBottom: 4 }}>
        <Pressable
          accessibilityRole="button"
          disabled={stage === CREDIT_STAGES.READ_ONLY}
          onPress={() => router.push("/scanner")}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary },
            pressed && stage !== CREDIT_STAGES.READ_ONLY && styles.pressed,
            stage === CREDIT_STAGES.READ_ONLY && styles.disabledButton,
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>
            {stageMeta.actionLabel}
          </Text>
        </Pressable>
        {stage === CREDIT_STAGES.READ_ONLY && (
          <Text style={[styles.lockHint, { color: colors.textSecondary, textAlign: "center", fontSize: 12, lineHeight: 16 }]}>
            Mag-record pa ng benta upang ma-unlock ang credit line at supplier financing.
          </Text>
        )}
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
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>I-record ang Gastos</Text>
        <TextInput
          value={expenseAmount}
          onChangeText={setExpenseAmount}
          keyboardType="number-pad"
          placeholder="Hal. 1200"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border }]}
        />
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Pinambayad</Text>
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
        <ProfilePanel stage={stage} stageMeta={stageMeta} tiwalaScore={tiwalaScore} loanLimit={loanLimit} onChainScore={onChainScore} onChainLimit={onChainLimit} isOffline={network.isOffline} />
      ) : null}
      {activeSection === "Tracker" ? (
        <TrackerPanel
          snapshot={businessSnapshot}
          loans={loans}
          loanLimit={displayLimit}
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
          outstandingBalance={outstandingBalance}
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

      {/* Wallet Details Modal */}
      <Modal visible={isWalletModalVisible} transparent animationType="fade" onRequestClose={() => setIsWalletModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Detalye ng Wallet</Text>
            
            <View style={{ gap: 12, marginTop: 12 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textSecondary }}>Address ng iyong Tindahan Wallet</Text>
                <View style={{ backgroundColor: colors.cardSecondary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 12, color: colors.text, fontFamily: "monospace" }} selectable={true}>
                    {walletConnection?.publicKey}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 16 }}>
                Ang wallet address na ito ang nagsisilbing digital ID ng iyong tindahan upang ligtas na ma-verify ang iyong Tiwala Score at mga resibo.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary, marginTop: 20, borderRadius: 99 },
                pressed && styles.pressed,
              ]}
              onPress={() => setIsWalletModalVisible(false)}
            >
              <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Isara</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Soroban Sync Loading Overlay — blocks interaction while polling for tx finality */}
      <Modal visible={isSyncingOnChain} transparent animationType="fade">
        <View style={[styles.modalOverlay, { justifyContent: "center", alignItems: "center" }]}>
          <View style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              alignItems: "center",
              padding: 32,
              gap: 16,
              maxWidth: 320,
              width: "85%",
            },
          ]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary, textAlign: "center" }}>
              🔗 Soroban Network
            </Text>
            <Text style={{ fontSize: 14, color: colors.text, textAlign: "center", fontWeight: "700" }}>
              Sini-sync ang iyong Tiwala Score at Loan Limit sa blockchain...
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center", lineHeight: 18 }}>
              {statusMessage || "Naghihintay ng transaksyon na ma-confirm. Sandali lamang po."}
            </Text>
            <View style={{
              backgroundColor: colors.surfaceLowest,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              width: "100%",
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "monospace", textAlign: "center" }}>
                Stellar Testnet · Soroban RPC · Poll ✓2s
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Stage Unlocked Modal */}
      <Modal visible={showUnlockedModal} transparent animationType="fade" onRequestClose={() => setShowUnlockedModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, alignItems: "center", padding: 28 }]}>
            <Text style={{ fontSize: 50, marginBottom: 12 }}>🎉</Text>
            <Text style={[styles.modalTitle, { color: colors.primary, fontSize: 24, textAlign: "center", fontWeight: "900" }]}>
              Bagong Stage Na-unlock!
            </Text>
            <Text style={[styles.bodyText, { textAlign: "center", marginTop: 12, fontSize: 16, color: colors.text }]}>
              Na-unlock ang <Text style={{ fontWeight: "900", color: colors.primary }}>{unlockedStageInfo.stageName}</Text>!
            </Text>
            <Text style={[styles.bodyText, { textAlign: "center", marginTop: 8, fontSize: 16, fontWeight: "700", color: colors.tertiary }]}>
              {formatPhp(unlockedStageInfo.limit)} financing available.
            </Text>
            <Text style={[styles.bodyText, { textAlign: "center", marginTop: 12, fontSize: 13, color: colors.textSecondary }]}>
              Maaari mo nang gamitin ang iyong credit limit para pondohan ang iyong mga supplier invoices o humingi ng microloan.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary, marginTop: 24, borderRadius: 99, width: "100%" },
                pressed && styles.pressed,
              ]}
              onPress={() => setShowUnlockedModal(false)}
            >
              <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>
                Ipagpatuloy
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Simulated Cash Out Modal */}
      <Modal
        visible={isCashOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (cashOutStep !== "connecting" && cashOutStep !== "broadcasting") {
            setIsCashOutModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 24 }]}>
            
            {cashOutStep === "form" && (
              <View style={{ gap: 14 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>I-Cash Out (Off-Ramp)</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  I-convert ang iyong Tindahan Cash at ipadala sa iyong personal na account gamit ang Stellar SEP-24 Anchor.
                </Text>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" }}>Piliin ang Provider</Text>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {["GCash", "Maya", "BDO", "BPI"].map((p) => {
                      const isSelected = selectedProvider === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => setSelectedProvider(p)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 99,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primaryContainer : colors.cardSecondary,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? colors.onPrimaryContainer : colors.text }}>{p}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" }}>Halaga ng Cash Out (₱ PHP)</Text>
                  <TextInput
                    value={cashOutAmount}
                    onChangeText={setCashOutAmount}
                    keyboardType="numeric"
                    placeholder="Hal. 500"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border, borderRadius: 12, fontSize: 16 }]}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" }}>
                    {selectedProvider === "GCash" || selectedProvider === "Maya" ? "Numero ng Telepono" : "Numero ng Account"}
                  </Text>
                  <TextInput
                    value={simPhoneNumber}
                    onChangeText={setSimPhoneNumber}
                    keyboardType="numeric"
                    placeholder={selectedProvider === "GCash" || selectedProvider === "Maya" ? "Hal. 09171234567" : "Hal. 1234567890"}
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border, borderRadius: 12, fontSize: 16 }]}
                  />
                </View>

                {cashOutError ? (
                  <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>{cashOutError}</Text>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { flex: 1, backgroundColor: colors.primary, borderRadius: 99 },
                      pressed && styles.pressed,
                    ]}
                    onPress={async () => {
                      setCashOutError("");
                      const amount = Number(cashOutAmount);
                      const currentCash = calculateTindahanCash(totalSyncedBenta, phpcBalance, cashOutTotal);
                      if (isNaN(amount) || amount <= 0) {
                        setCashOutError("Paki-lagay ng wastong halaga.");
                        return;
                      }
                      if (amount > currentCash) {
                        setCashOutError("Kulang ang iyong Tindahan Cash.");
                        return;
                      }
                      if (!simPhoneNumber.trim()) {
                        setCashOutError("Kailangan ang account/telepono number.");
                        return;
                      }
                      
                      // Transition to connecting
                      setCashOutStep("connecting");
                      setTimeout(() => {
                        setCashOutStep("interactive");
                      }, 2000);
                    }}
                  >
                    <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Ipagpatuloy</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { flex: 1, backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99, marginTop: 0 },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setIsCashOutModalVisible(false)}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Kanselahin</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {cashOutStep === "connecting" && (
              <View style={{ alignItems: "center", paddingVertical: 20, gap: 14 }}>
                <Text style={[styles.modalTitle, { color: colors.text, textAlign: "center" }]}>Kumokonekta sa Anchor...</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center" }}>
                  Sinisimulan ang SEP-24 Cash Out session para sa {selectedProvider}...
                </Text>
                <View style={{ marginVertical: 10 }}>
                  <Text style={{ fontSize: 40 }}>🔌</Text>
                </View>
              </View>
            )}

            {cashOutStep === "interactive" && (
              <View style={{ gap: 14 }}>
                <View style={{ backgroundColor: colors.primaryContainer, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primary }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.onPrimaryContainer }}>GoTyme Interactive Gateway</Text>
                </View>
                
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
                  Mangyaring kumpirmahin ang transfer na nagkakahalaga ng <Text style={{ fontWeight: "800", color: colors.primary }}>₱{Number(cashOutAmount).toLocaleString()}</Text> papuntang <Text style={{ fontWeight: "700" }}>{selectedProvider}</Text> ({simPhoneNumber}).
                </Text>
                
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary }}>Ipasok ang 6-digit OTP</Text>
                  <TextInput
                    value={simOtp}
                    onChangeText={setSimOtp}
                    keyboardType="numeric"
                    maxLength={6}
                    placeholder="Hal. 123456"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border, borderRadius: 12, fontSize: 16 }]}
                  />
                </View>

                {cashOutError ? (
                  <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>{cashOutError}</Text>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { flex: 1, backgroundColor: colors.primary, borderRadius: 99 },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      setCashOutError("");
                      if (!simOtp.trim() || simOtp.length < 4) {
                        setCashOutError("Paki-lagay ang wastong OTP code.");
                        return;
                      }
                      setCashOutStep("broadcasting");
                      setTimeout(async () => {
                        try {
                          const newAmount = Number(cashOutAmount);
                          const nextCashOutTotal = cashOutTotal + newAmount;
                          await AsyncStorage.setItem("sarisync:cashOutTotal", String(nextCashOutTotal));
                          setCashOutTotal(nextCashOutTotal);
                          
                          // Log receipt with type PROVIDER_CASHOUT
                          const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
                          setCashOutTxHash(txHash);

                          const usdcEquivalent = (newAmount / USDC_TO_PHP_RATE).toFixed(2);
                          await appendReceipt({
                            id: "cashout_" + Date.now(),
                            type: "PROVIDER_CASHOUT",
                            amountUsdc: usdcEquivalent,
                            supplierPubkey: selectedProvider,
                            timestamp: Date.now(),
                            txHash: txHash
                          });

                          await refreshLedger();
                          setCashOutStep("success");
                        } catch (err) {
                          setCashOutError("Failed to save transaction: " + err.message);
                          setCashOutStep("interactive");
                        }
                      }, 2000);
                    }}
                  >
                    <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Kumpirmahin at Magbayad</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { flex: 1, backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99, marginTop: 0 },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setIsCashOutModalVisible(false)}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Kanselahin</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {cashOutStep === "broadcasting" && (
              <View style={{ alignItems: "center", paddingVertical: 20, gap: 14 }}>
                <Text style={[styles.modalTitle, { color: colors.text, textAlign: "center" }]}>Bino-broadcast ang Transaksyon...</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center" }}>
                  Sumusulat sa Stellar Testnet ledger sa pamamagitan ng GoTyme SEP-24 gateway...
                </Text>
                <View style={{ marginVertical: 10 }}>
                  <Text style={{ fontSize: 40 }}>📡</Text>
                </View>
              </View>
            )}

            {cashOutStep === "success" && (
              <View style={{ gap: 14, alignItems: "center" }}>
                <Text style={{ fontSize: 48 }}>🎉</Text>
                <Text style={[styles.modalTitle, { color: colors.success, textAlign: "center", fontWeight: "900" }]}>Tagumpay ang Cash Out!</Text>
                
                <Text style={{ fontSize: 14, color: colors.text, textAlign: "center", lineHeight: 20 }}>
                  Ang halagang <Text style={{ fontWeight: "800", color: colors.primary }}>₱{Number(cashOutAmount).toLocaleString()}</Text> ay matagumpay na nailipat sa iyong <Text style={{ fontWeight: "700" }}>{selectedProvider}</Text> account.
                </Text>

                <View style={{ width: "100%", backgroundColor: colors.cardSecondary, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>Reference TX Hash</Text>
                    <Text style={{ fontSize: 11, color: colors.text, fontFamily: "monospace" }}>
                      {cashOutTxHash.slice(0, 8) + "..." + cashOutTxHash.slice(-8)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>Account Number</Text>
                    <Text style={{ fontSize: 11, color: colors.text }}>{simPhoneNumber}</Text>
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.primary, borderRadius: 99, width: "100%", marginTop: 10 },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setIsCashOutModalVisible(false)}
                >
                  <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Isara</Text>
                </Pressable>
              </View>
            )}

          </View>
        </View>
      </Modal>
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
            I-konek ang wallet para ma-ready ang Kaha, habang records are secured in the background.
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

function ProfilePanel({ stage, stageMeta, tiwalaScore, loanLimit, onChainScore, onChainLimit, isOffline }) {
  const { colors } = useTheme();
  const displayScore = (!isOffline && onChainScore !== null) ? onChainScore : tiwalaScore;
  const displayLimit = (!isOffline && onChainLimit !== null) ? onChainLimit : loanLimit;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Profile</Text>
      <Text style={[styles.stageName, { color: colors.text }]}>Store Settings</Text>
      <InfoRow label="Store type" value="Sari-sari inventory business" />
      <InfoRow label="Stage" value={stageMeta.name} />
      <InfoRow label="Tiwala Score" value={`${displayScore}`} />
      <InfoRow label="Loan limit" value={formatPhp(displayLimit)} />
      <InfoRow label="Blockchain Security" value={isOffline ? "Offline Mode (Local)" : "Secured & Verified (Stellar)"} />
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
  const availableLimit = Math.max(0, loanLimit - loanCapital);

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
          {LENDER_OFFERS.map(offer => {
            const isTooHigh = offer.amountPhpc > availableLimit;
            const buttonDisabled = isRequesting || !controlState.canTransact || isTooHigh;

            return (
              <View key={offer.id} style={[styles.lenderCard, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lenderName, { color: colors.text }]}>{offer.name}</Text>
                  <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{offer.description}</Text>
                  <Text style={[styles.bodyText, { color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>Interest: {offer.interestRate}</Text>
                </View>
                <Pressable
                  disabled={buttonDisabled || !controlState.canTransact}
                  onPress={() => setSelectedOffer(offer)}
                  style={({ pressed }) => [
                    styles.loanButton,
                    { backgroundColor: isTooHigh || !controlState.canTransact ? colors.border : colors.primary },
                    pressed && !buttonDisabled && controlState.canTransact && styles.pressed,
                    (buttonDisabled || !controlState.canTransact) && styles.disabled,
                  ]}
                >
                  <Text style={[styles.loanButtonText, { color: isTooHigh || !controlState.canTransact ? colors.textSecondary : (theme === "light" ? "#FFFFFF" : "#111411") }]}>
                    {!controlState.canTransact ? "Offline" : isTooHigh ? "Mataas" : "Humingi"}
                  </Text>
                </Pressable>
              </View>
            );
          })}

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

function DebtPanel({ loans, controlState, onRepayLoan, statusMessage, outstandingBalance }) {
  const { theme, colors } = useTheme();
  const [confirmLoan, setConfirmLoan] = useState(null);
  const [isRepaying, setIsRepaying] = useState(false);
  const [validateHash, setValidateHash] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isProofDetailsOpen, setProofDetailsOpen] = useState(false);

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

      {/* Prominent Outstanding Balance Banner */}
      <View style={{ backgroundColor: colors.cardSecondary, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginVertical: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Kabuuang Utang (Outstanding Balance)
        </Text>
        <Text style={{ fontSize: 26, fontWeight: "900", color: colors.error, marginTop: 4 }}>
          {formatPhp(outstandingBalance)}
        </Text>
      </View>

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
                disabled={isRepaying || !controlState.canTransact}
                onPress={() => setConfirmLoan(loan)}
                style={({ pressed }) => [
                  styles.bayadButton,
                  { backgroundColor: !controlState.canTransact ? colors.border : colors.error },
                  pressed && !isRepaying && controlState.canTransact && styles.pressed,
                  (isRepaying || !controlState.canTransact) && styles.disabled,
                ]}
              >
                <Text style={styles.bayadButtonText}>
                  {!controlState.canTransact ? "Offline" : "Bayad"}
                </Text>
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

      <View style={{ marginTop: 20 }}>
        <ProofHint
          onPress={() => setProofDetailsOpen(!isProofDetailsOpen)}
          label={isProofDetailsOpen ? "Transaction details" : "Proof hidden · Tap to view transaction details"}
        />
      </View>

      {isProofDetailsOpen ? (
        <View style={[styles.lenderCard, { marginTop: 12, backgroundColor: colors.cardSecondary, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { marginBottom: 8, color: colors.textSecondary }]}>Transaction details</Text>
          <TextInput
            value={validateHash}
            onChangeText={setValidateHash}
            placeholder="Transaction hash (64 hex chars)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { marginVertical: 8, fontSize: 13, backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
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
            <View style={[styles.lenderCard, { marginTop: 12, backgroundColor: colors.card, borderColor: colors.border }]}>
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
        </View>
      ) : null}

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
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Proof center</Text>
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
                    <Text style={[styles.rowLabel, { color: colors.text }]}>
                      {receipt.type === "PROVIDER_CASHOUT" ? `Off-Ramp (${receipt.supplierPubkey || "Cash Out"})` : (receipt.type ?? "B2B_FINANCING")}
                    </Text>
                    <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{new Date(receipt.timestamp).toLocaleDateString("en-PH")}</Text>
                  </View>
                  <Text style={[styles.debtAmount, { color: receipt.type === "PROVIDER_CASHOUT" ? colors.expense : colors.primary }]}>
                    {receipt.type === "PROVIDER_CASHOUT" ? "-" + formatPhp(Number(receipt.amountUsdc) * USDC_TO_PHP_RATE) : formatUsdc(receipt.amountUsdc)}
                  </Text>
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
        <Text style={[styles.primaryButtonText, { color: theme === "light" ? "#FFFFFF" : "#111411" }]}>Gumawa ng Dokumento</Text>
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
    borderRadius: 24,
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
    borderRadius: 24,
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
    borderRadius: 24,
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
    borderRadius: 99,
    minHeight: 48,
    paddingHorizontal: 20,
    fontSize: 18,
    color: "#17231D",
    backgroundColor: "#FFFEFB",
  },
  walletInput: {
    fontSize: 13,
    fontWeight: "700",
    borderRadius: 12,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 99,
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
    borderRadius: 99,
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
    borderRadius: 99,
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
    borderRadius: 24,
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
    borderRadius: 24,
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
    borderRadius: 99,
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
    borderRadius: 99,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
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
