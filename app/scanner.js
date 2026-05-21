import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import useNetworkStatus from "../hooks/useNetworkStatus";
import {
  CREDIT_STAGES,
  calculateTiwalaScore,
  evaluateCreditStage,
  getLoanLimitForStage,
  getStageMetadata,
} from "../services/creditLadderService";
import {
  evaluateInvoiceEligibility,
  parseSupplierInvoiceQr,
} from "../services/invoiceService";
import {
  appendOfflineDraft,
  appendReceipt,
  getTotalSyncedSalesVolume,
} from "../services/storageService";
import {
  OFFLINE_DRAFT_TYPES,
  createOfflineDraft,
} from "../services/offlineDraftService";
import { submitInventoryFinancingSettlement } from "../services/stellarService";
import { formatPhp, formatPublicKey, formatUsdc } from "../utils/formatters";

const SETTLED_COLOR = "#34C759";
const SHORTAGE_COLOR = "#FF3B30";

export default function ScannerScreen() {
  const network = useNetworkStatus();
  const [permission, requestPermission] = useCameraPermissions();
  const [totalSyncedBenta, setTotalSyncedBenta] = useState(0);
  const [invoice, setInvoice] = useState(null);
  const [scanError, setScanError] = useState("");
  const [scanned, setScanned] = useState(false);
  const [isSettling, setIsSettling] = useState(false); // 4-B: rage-click guard (already existed)
  const [settlementResult, setSettlementResult] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [showQrError, setShowQrError] = useState(false); // 4-C: QR error modal state
  const [mockQrPayload, setMockQrPayload] = useState("");

  const stage = useMemo(() => evaluateCreditStage(totalSyncedBenta), [totalSyncedBenta]);
  const stageMeta = getStageMetadata(stage);
  const loanLimit = getLoanLimitForStage(stage);
  const tiwalaScore = calculateTiwalaScore(totalSyncedBenta);
  const eligibility = useMemo(
    () => evaluateInvoiceEligibility(invoice, stage, loanLimit),
    [invoice, stage, loanLimit],
  );

  useFocusEffect(
    useCallback(() => {
      getTotalSyncedSalesVolume()
        .then(setTotalSyncedBenta)
        .catch((error) => setScanError(error.message));
    }, []),
  );

  function handleBarcodeScanned(event) {
    if (scanned) return;

    setScanned(true);
    setSettlementResult(null);
    setDraftMessage("");

    try {
      const parsedInvoice = parseSupplierInvoiceQr(event.data);
      setInvoice(parsedInvoice);
      setScanError("");
    } catch (error) {
      setInvoice(null);
      setScanError(error.message);
      // 4-C: show "Mali ang QR Code" modal on parse failure
      setShowQrError(true);
    }
  }

  // 4-B: rage-click guard — isSettling is set synchronously before the first await
  async function handleSettleInvoice() {
    if (!invoice || !eligibility.eligible) return;
    if (isSettling) return;

    setIsSettling(true);
    setSettlementResult(null);
    setDraftMessage("");

    try {
      if (network.isOffline) {
        await appendOfflineDraft(createOfflineDraft({
          type: OFFLINE_DRAFT_TYPES.SUPPLIER_INVOICE,
          amountUsdc: invoice.amount_usdc,
          amountPhpc: loanLimit,
          destinationPublicKey: invoice.supplier_pubkey,
          supplierPubkey: invoice.supplier_pubkey,
        }));
        setDraftMessage("Saved supplier invoice draft. Submit when online.");
        return;
      }

      const result = await submitInventoryFinancingSettlement({
        supplierPubkey: invoice.supplier_pubkey,
        amountUsdc: invoice.amount_usdc.toFixed(7),
        sendMaxPhpc: loanLimit.toFixed(7),
      });

      // 4-D: append live receipt on successful settlement
      if (result.success) {
        await appendReceipt({
          id: result.transactionHash,
          type: 'FINANCING',
          amountUsdc: invoice.amount_usdc,
          supplierPubkey: invoice.supplier_pubkey,
          txHash: result.transactionHash,
          timestamp: Date.now(),
        });
      }

      setSettlementResult(result);
    } finally {
      setIsSettling(false);
    }
  }

  // 4-D: Truncated hash for "Bayad Na" display
  const shortHash = settlementResult?.success && settlementResult.transactionHash
    ? `${settlementResult.transactionHash.slice(0, 6)}...${settlementResult.transactionHash.slice(-6)}`
    : null;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {/* 4-C: "Mali ang QR Code" error modal — resets camera on dismiss */}
      <Modal visible={showQrError} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.errorModal}>
            <Text style={styles.errorTitle}>Mali ang QR Code</Text>
            <Text style={styles.errorBody}>
              I-check ang QR code ng supplier at subukan ulit.
            </Text>
            <Pressable
              style={styles.errorButton}
              onPress={() => {
                setShowQrError(false);
                setScanned(false); // 4-C: reactivates the camera
              }}
            >
              <Text style={styles.errorButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>B2B supplier invoice</Text>
        <Text style={styles.title}>Scanner</Text>
        <Text style={styles.subtitle}>
          {network.isOffline
            ? "Scan QR and save a local supplier invoice draft until Wi-Fi returns."
            : "Scan QR, review inventory financing eligibility, then settle on Stellar Testnet."}
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
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
        )}
      </View>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          setScanned(false); // 4-C: explicit camera reset
          setScanError("");
          setSettlementResult(null);
          setShowQrError(false);
        }}
      >
        <Text style={styles.secondaryButtonText}>Scan Again</Text>
      </Pressable>

      {/* Manual JSON input for phone-demo fallback */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Manual JSON Input (Demo Fallback)</Text>
        <Text style={[styles.bodyText, { marginBottom: 8 }]}>
          If QR scanning is unavailable during the phone demo, paste the QR JSON payload below:
        </Text>
        <TextInput
          value={mockQrPayload}
          onChangeText={setMockQrPayload}
          placeholder='{"supplier_pubkey":"G...", "amount_usdc": 5}'
          placeholderTextColor="#918A7F"
          multiline
          numberOfLines={2}
          style={[styles.input, { height: 60, marginVertical: 8, textAlignVertical: "top", paddingTop: 8 }]}
        />
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            if (!mockQrPayload.trim()) return;
            try {
              const parsedInvoice = parseSupplierInvoiceQr(mockQrPayload.trim());
              setInvoice(parsedInvoice);
              setScanError("");
              setScanned(true);
              setDraftMessage("");
            } catch (error) {
              setScanError(error.message);
            }
          }}
        >
          <Text style={styles.primaryButtonText}>Simulate QR Scan</Text>
        </Pressable>
      </View>

      {scanError && !showQrError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{scanError}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current store stage</Text>
        <Text style={styles.stageName}>{stageMeta.name}</Text>
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
              : eligibility.reason === "BR5_STAGE_DROP_LOCK"
                ? eligibility.message
                : `Shortfall: ${formatPhp(eligibility.shortfall)}`}
          </Text>

          {/* 4-B: disabled while settling to prevent rage-click double-submit */}
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
              {isSettling ? "Sine-save..." : network.isOffline ? "Save offline draft" : stageMeta.actionLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {draftMessage ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Offline draft saved</Text>
          <Text style={styles.bodyText}>{draftMessage}</Text>
          <Text style={styles.txQrLabel}>Status: pending_online_submission</Text>
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

          {settlementResult.success ? (
            <>
              {/* 4-D: Truncated hash display for the Bayad Na screen */}
              <Text style={styles.txHash}>{shortHash}</Text>
              {/* 4-D: Full selectable hash for the driver's logbook */}
              <View style={styles.txQrFallback}>
                <Text style={styles.txQrLabel}>Stellar TX Hash (para sa logbook):</Text>
                <Text style={styles.txQrValue} selectable>
                  {settlementResult.transactionHash}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.bodyText}>{settlementResult.error}</Text>
          )}
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
  // 4-D: Truncated tx hash on the Bayad Na screen
  txHash: {
    color: "#17231D",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 1,
  },
  // 4-D: Selectable full hash for driver logbook
  txQrFallback: {
    backgroundColor: "#F7F4EC",
    borderColor: "#E0DACF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  txQrLabel: {
    color: "#6E766F",
    fontSize: 12,
    fontWeight: "700",
  },
  txQrValue: {
    color: "#17231D",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.55,
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
  // 4-C: Mali ang QR Code modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 12,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  errorTitle: {
    color: "#FF3B30",
    fontSize: 20,
    fontWeight: "900",
  },
  errorBody: {
    color: "#4F5A53",
    textAlign: "center",
    lineHeight: 22,
  },
  errorButton: {
    backgroundColor: "#17231D",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: "center",
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
  },
});
