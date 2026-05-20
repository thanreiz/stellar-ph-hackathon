import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import useNetworkStatus from "../hooks/useNetworkStatus";
import {
  appendToSyncedSalesLedger,
  createSalesPayload,
  enqueuePendingSale,
  getPendingSyncQueue,
  getSyncedSalesLedger,
  syncPendingSalesQueue,
} from "../services/storageService";
import {
  calculateTiwalaScore,
  evaluateCreditStage,
  getLoanLimitForStage,
} from "../services/creditLadderService";
import {
  GRAPH_RANGES,
  SAMPLE_BUSINESS_TRANSACTIONS,
  getBusinessSnapshot,
  getOfflineControlState,
  getSalesSeries,
  getSalesToday,
} from "../services/dashboardService";
import { formatPhp } from "../utils/formatters";

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

const RECEIPTS = [
  { id: "receipt_001", label: "Paid business debt", amount: 900, status: "Bayad Na" },
  { id: "receipt_002", label: "Received inventory financing", amount: 3500, status: "Validated" },
  { id: "receipt_003", label: "Supplier stock purchase", amount: 1250, status: "Recorded" },
];

export default function KahaScreen() {
  const network = useNetworkStatus();
  const [bentaAmount, setBentaAmount] = useState("");
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncedLedger, setSyncedLedger] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLedgerReady, setIsLedgerReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [activeRange, setActiveRange] = useState("week");
  const [activeSection, setActiveSection] = useState("Profile");

  const totalSyncedBenta = useMemo(
    () => syncedLedger.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    [syncedLedger],
  );
  const salesToday = useMemo(() => getSalesToday(syncedLedger), [syncedLedger]);
  const stage = evaluateCreditStage(totalSyncedBenta);
  const loanLimit = getLoanLimitForStage(stage);
  const tiwalaScore = calculateTiwalaScore(totalSyncedBenta);
  const graphSeries = useMemo(
    () => getSalesSeries(syncedLedger, activeRange),
    [activeRange, syncedLedger],
  );
  const businessSnapshot = useMemo(
    () => getBusinessSnapshot(syncedLedger, SAMPLE_BUSINESS_TRANSACTIONS),
    [syncedLedger],
  );
  const controlState = getOfflineControlState(network.isOffline);
  const isLoading = !network.hasCheckedInitialStatus || !isLedgerReady;

  const refreshLedger = useCallback(async () => {
    const [queue, ledger] = await Promise.all([
      getPendingSyncQueue(),
      getSyncedSalesLedger(),
    ]);
    setPendingQueue(queue);
    setSyncedLedger(ledger);
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

  async function handleAddBenta() {
    setStatusMessage("");
    setIsSaving(true);

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
      setIsSaving(false);
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
    if (network.isOffline) {
      setStatusMessage("Needs internet to create document.");
      return;
    }

    setStatusMessage("Credit proof document is ready to generate from cached records.");
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {network.isOffline ? (
        <View style={styles.offlineBanner}>
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
          disabled={isSaving}
          onPress={handleAddBenta}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            isSaving && styles.disabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? "Sine-save..." : "I-save ang Benta"}
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
        <ProfilePanel stage={stage} tiwalaScore={tiwalaScore} loanLimit={loanLimit} />
      ) : null}
      {activeSection === "Tracker" ? (
        <TrackerPanel
          snapshot={businessSnapshot}
          transactions={SAMPLE_BUSINESS_TRANSACTIONS}
          loanLimit={loanLimit}
          stage={stage}
          controlState={controlState}
          onAction={handleOnlineOnlyAction}
        />
      ) : null}
      {activeSection === "Debt" ? (
        <DebtPanel
          debts={BUSINESS_DEBTS}
          controlState={controlState}
          onAction={handleOnlineOnlyAction}
        />
      ) : null}
      {activeSection === "Receipts" ? (
        <ReceiptsPanel
          receipts={RECEIPTS}
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

function ProfilePanel({ stage, tiwalaScore, loanLimit }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Profile</Text>
      <Text style={styles.stageName}>Store Settings</Text>
      <InfoRow label="Store type" value="Sari-sari inventory business" />
      <InfoRow label="Stage" value={stage.name} />
      <InfoRow label="Tiwala Score" value={String(tiwalaScore)} />
      <InfoRow label="Loan limit" value={formatPhp(loanLimit)} />
    </View>
  );
}

function TrackerPanel({ snapshot, transactions, loanLimit, stage, controlState, onAction }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Tracker</Text>
      <Text style={styles.stageName}>Capital movement</Text>
      <View style={styles.metricsGrid}>
        <MiniMetric label="Spent" value={formatPhp(snapshot.spent)} />
        <MiniMetric label="Earned" value={formatPhp(snapshot.earned)} color="#34C759" />
        <MiniMetric label="Capital" value={formatPhp(snapshot.capital)} />
        <MiniMetric label="Debt" value={formatPhp(snapshot.businessDebt)} color="#FF3B30" />
      </View>
      <InfoRow label="Available capital upgrade" value={formatPhp(loanLimit)} />
      <Text style={styles.bodyText}>Current action: {stage.actionLabel}</Text>
      {transactions.map((transaction) => (
        <InfoRow
          key={transaction.id}
          label={transaction.label}
          value={formatPhp(transaction.amount)}
        />
      ))}
      <OnlineActionButton
        label={stage.actionLabel}
        controlState={controlState}
        onPress={() => onAction(stage.actionLabel)}
      />
      <Link href="/scanner" asChild>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Scan Supplier Invoice</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function DebtPanel({ debts, controlState, onAction }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Debt</Text>
      <Text style={styles.stageName}>Business debt tracker</Text>
      <Text style={styles.bodyText}>
        Track store debt with microlending companies. Stellar payments and invoice validation need internet.
      </Text>
      {debts.map((debt) => (
        <View key={debt.id} style={styles.debtRow}>
          <View>
            <Text style={styles.rowLabel}>{debt.company}</Text>
            <Text style={styles.bodyText}>{debt.due}</Text>
          </View>
          <View style={styles.alignRight}>
            <Text style={styles.debtAmount}>{formatPhp(debt.amount)}</Text>
            <Text style={styles.bodyText}>{debt.status}</Text>
          </View>
        </View>
      ))}
      <OnlineActionButton
        label="Pay via Stellar"
        controlState={controlState}
        onPress={() => onAction("Pay via Stellar")}
      />
      <OnlineActionButton
        label="Validate Stellar Invoice"
        controlState={controlState}
        onPress={() => onAction("Validate Stellar Invoice")}
      />
      <Text style={styles.bodyText}>
        Validated payments can increase Tiwala Score. Delayed business payments can lower it.
      </Text>
    </View>
  );
}

function ReceiptsPanel({ receipts, controlState, onCreateDocument }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Receipts</Text>
      <Text style={styles.stageName}>Transaction proof</Text>
      {receipts.map((receipt) => (
        <InfoRow
          key={receipt.id}
          label={`${receipt.label} • ${receipt.status}`}
          value={formatPhp(receipt.amount)}
        />
      ))}
      <Pressable
        disabled={!controlState.canCreateDocument}
        onPress={onCreateDocument}
        style={[
          styles.primaryButton,
          !controlState.canCreateDocument && styles.disabledButton,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {!controlState.canCreateDocument ? "🔒 Create document" : "Create document"}
        </Text>
      </Pressable>
      {!controlState.canCreateDocument ? (
        <Text style={styles.lockHint}>Needs internet to create document.</Text>
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
});
