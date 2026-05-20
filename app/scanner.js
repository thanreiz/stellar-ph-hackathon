import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  calculateTiwalaScore,
  evaluateCreditStage,
  getLoanLimitForStage,
} from "../services/creditLadderService";
import {
  evaluateInvoiceEligibility,
  parseSupplierInvoiceQr,
} from "../services/invoiceService";
import { getTotalSyncedSalesVolume } from "../services/storageService";
import { submitInventoryFinancingSettlement } from "../services/stellarService";
import { formatPhp, formatPublicKey, formatUsdc } from "../utils/formatters";

const SETTLED_COLOR = "#34C759";
const SHORTAGE_COLOR = "#FF3B30";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [totalSyncedBenta, setTotalSyncedBenta] = useState(0);
  const [invoice, setInvoice] = useState(null);
  const [scanError, setScanError] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState(null);

  const stage = useMemo(() => evaluateCreditStage(totalSyncedBenta), [totalSyncedBenta]);
  const loanLimit = getLoanLimitForStage(stage);
  const tiwalaScore = calculateTiwalaScore(totalSyncedBenta);
  const eligibility = useMemo(
    () => evaluateInvoiceEligibility(invoice, loanLimit),
    [invoice, loanLimit],
  );

  useFocusEffect(
    useCallback(() => {
      getTotalSyncedSalesVolume()
        .then(setTotalSyncedBenta)
        .catch((error) => setScanError(error.message));
    }, []),
  );

  function handleBarcodeScanned(event) {
    if (hasScanned) return;

    setHasScanned(true);
    setSettlementResult(null);

    try {
      const parsedInvoice = parseSupplierInvoiceQr(event.data);
      setInvoice(parsedInvoice);
      setScanError("");
    } catch (error) {
      setInvoice(null);
      setScanError(error.message);
    }
  }

  async function handleSettleInvoice() {
    if (!invoice || !eligibility.eligible) return;

    setIsSettling(true);
    setSettlementResult(null);

    const result = await submitInventoryFinancingSettlement({
      supplierPubkey: invoice.supplier_pubkey,
      amountUsdc: invoice.amount_usdc,
      sendMaxPhpc: loanLimit,
    });

    setSettlementResult(result);
    setIsSettling(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>B2B supplier invoice</Text>
        <Text style={styles.title}>Scanner</Text>
        <Text style={styles.subtitle}>
          Scan QR, review inventory financing eligibility, then settle on Stellar Testnet.
        </Text>
      </View>

      <View style={styles.cameraShell}>
        {!permission ? (
          <Text style={styles.bodyText}>Checking camera permission...</Text>
        ) : !permission.granted ? (
          <View style={styles.permissionCard}>
            <Text style={styles.bodyText}>Camera access is needed to scan supplier invoice QR codes.</Text>
            <Pressable style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Enable Camera</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
          />
        )}
      </View>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          setHasScanned(false);
          setScanError("");
          setSettlementResult(null);
        }}
      >
        <Text style={styles.secondaryButtonText}>Scan Again</Text>
      </Pressable>

      {scanError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{scanError}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current store stage</Text>
        <Text style={styles.stageName}>{stage.name}</Text>
        <Text style={styles.bodyText}>Tiwala Score: {tiwalaScore}</Text>
        <Text style={styles.bodyText}>Loan limit: {formatPhp(loanLimit)}</Text>
      </View>

      {invoice ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Parsed invoice</Text>
          <Row label="Supplier" value={formatPublicKey(invoice.supplier_pubkey)} />
          <Row label="Amount" value={formatUsdc(invoice.amount_usdc)} />
          <Row label="Loan limit" value={formatPhp(loanLimit)} />
          <Text
            style={[
              styles.eligibility,
              { color: eligibility.eligible ? SETTLED_COLOR : SHORTAGE_COLOR },
            ]}
          >
            {eligibility.eligible
              ? "Eligible for B2B inventory financing"
              : `Shortfall: ${formatPhp(eligibility.shortfall)}`}
          </Text>

          <Pressable
            disabled={!eligibility.eligible || isSettling}
            onPress={handleSettleInvoice}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              (!eligibility.eligible || isSettling) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSettling ? "Sine-settle..." : stage.actionLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {settlementResult ? (
        <View
          style={[
            styles.resultCard,
            {
              borderColor: settlementResult.success ? SETTLED_COLOR : SHORTAGE_COLOR,
              backgroundColor: settlementResult.success ? "#F0FFF4" : "#FFF0EF",
            },
          ]}
        >
          <Text
            style={[
              styles.resultTitle,
              { color: settlementResult.success ? SETTLED_COLOR : SHORTAGE_COLOR },
            ]}
          >
            {settlementResult.success ? "Bayad Na" : "Settlement failed"}
          </Text>
          <Text style={styles.bodyText}>
            {settlementResult.success
              ? settlementResult.transactionHash
              : settlementResult.error}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
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
  cameraShell: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4CEC1",
    minHeight: 300,
    backgroundColor: "#17231D",
  },
  camera: {
    minHeight: 300,
  },
  permissionCard: {
    padding: 18,
    gap: 14,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: {
    color: "#6E766F",
    fontWeight: "700",
  },
  rowValue: {
    color: "#17231D",
    fontWeight: "900",
    flexShrink: 1,
    textAlign: "right",
  },
  eligibility: {
    fontSize: 16,
    fontWeight: "900",
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
    minHeight: 48,
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
  },
  errorCard: {
    backgroundColor: "#FFF0EF",
    borderColor: "#FF3B30",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  errorText: {
    color: "#FF3B30",
    fontWeight: "800",
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.55,
  },
});
