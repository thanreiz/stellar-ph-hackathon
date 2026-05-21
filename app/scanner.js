import '../utils/polyfills';
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, router } from "expo-router";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
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
  getOutstandingLoanBalance,
  setOutstandingLoanBalance,
  getWalletConnection,
  appendLoan,
  getLoans,
} from "../services/storageService";
import {
  OFFLINE_DRAFT_TYPES,
  createOfflineDraft,
} from "../services/offlineDraftService";
import {
  submitInventoryFinancingSettlement,
  receiveLoanFromLender,
  fetchLiveWalletBalances,
} from "../services/stellarService";
import { formatPhp, formatPublicKey, formatUsdc } from "../utils/formatters";
import { useAppContext } from "../context/AppContext";


const XLM_TO_PHP_RATE = 9.07;
const USDC_TO_PHP_RATE = 61.45;

export default function ScannerScreen() {
  const { theme, toggleTheme, colors } = useAppContext();
  const network = useNetworkStatus();
  const [permission, requestPermission] = useCameraPermissions();
  const [totalSyncedBenta, setTotalSyncedBenta] = useState(0);
  const [invoice, setInvoice] = useState(null);
  const [scanError, setScanError] = useState("");
  const [scanned, setScanned] = useState(false);
  const [isSettling, setIsSettling] = useState(false); // 4-B: rage-click guard
  const [settlementResult, setSettlementResult] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [showQrError, setShowQrError] = useState(false); // 4-C: QR error modal state
  const [mockQrPayload, setMockQrPayload] = useState("");

  // Flow steps for the presentation flow: "scan" | "detail" | "success"
  const [currentStep, setCurrentStep] = useState("scan");

  // Wallet and balance states
  const [walletConnection, setWalletConnection] = useState(null);
  const [xlmBalance, setXlmBalance] = useState("0.0000");
  const [phpcBalance, setPhpcBalance] = useState("0.00");
  const [cashOutTotal, setCashOutTotal] = useState(0);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [lastStage, setLastStageState] = useState(null);

  // Shortfall warning modal state
  const [showShortfallModal, setShowShortfallModal] = useState(false);

  const stage = useMemo(() => evaluateCreditStage(totalSyncedBenta), [totalSyncedBenta]);
  const stageMeta = getStageMetadata(stage);
  const loanLimit = getLoanLimitForStage(stage);
  const tiwalaScore = calculateTiwalaScore(totalSyncedBenta);

  // Calculate Tindahan Cash
  const tindahanCash = useMemo(() => {
    const benta = Number(totalSyncedBenta || 0);
    const xlm = Number(xlmBalance || 0);
    const phpc = Number(phpcBalance || 0);
    const cashout = Number(cashOutTotal || 0);
    return Math.max(0, benta + phpc + (xlm * XLM_TO_PHP_RATE) - cashout);
  }, [totalSyncedBenta, xlmBalance, phpcBalance, cashOutTotal]);

  // Compute Total Bill Amount in PHP
  const totalAmountPhp = useMemo(() => {
    return invoice ? invoice.amount_usdc * USDC_TO_PHP_RATE : 0;
  }, [invoice]);

  // Compute shortfall in PHP
  const shortfallPhp = useMemo(() => {
    return Math.max(0, totalAmountPhp - tindahanCash);
  }, [totalAmountPhp, tindahanCash]);

  // Evaluate remaining credit limit
  const remainingBorrowCapacity = useMemo(() => {
    return Math.max(0, loanLimit - outstandingBalance);
  }, [loanLimit, outstandingBalance]);

  // Check eligibility for borrowing shortfall
  const canBorrowShortfall = useMemo(() => {
    return stage !== CREDIT_STAGES.READ_ONLY && shortfallPhp <= remainingBorrowCapacity;
  }, [stage, shortfallPhp, remainingBorrowCapacity]);

  // BR5: check if drop-locked
  const isDropLocked = useMemo(() => {
    return (
      lastStage === CREDIT_STAGES.CORNER_STORE &&
      stage !== CREDIT_STAGES.CORNER_STORE &&
      outstandingBalance > loanLimit
    );
  }, [lastStage, stage, outstandingBalance, loanLimit]);

  // Ultimate check for checkout eligibility
  const isCheckoutEligible = useMemo(() => {
    if (!invoice) return false;
    if (shortfallPhp === 0) return true; // Standard checkout using own cash is allowed
    if (isDropLocked) return false;
    return canBorrowShortfall;
  }, [invoice, shortfallPhp, isDropLocked, canBorrowShortfall]);

  const fundingProgressPercent = totalAmountPhp > 0 ? Math.min(100, Math.round((tindahanCash / totalAmountPhp) * 100)) : 100;

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function refreshState() {
        try {
          const [salesVol, connection, outstanding, savedCashOut, savedLastStage] = await Promise.all([
            getTotalSyncedSalesVolume(),
            getWalletConnection(),
            getOutstandingLoanBalance(),
            AsyncStorage.getItem("sarisync:cashOutTotal"),
            AsyncStorage.getItem("sarisync:lastStage")
          ]);
          
          if (!isMounted) return;
          setTotalSyncedBenta(salesVol);
          setWalletConnection(connection);
          setOutstandingBalance(outstanding);
          setCashOutTotal(savedCashOut ? Number(savedCashOut) : 0);
          setLastStageState(savedLastStage);

          if (!network.isOffline && connection && connection.publicKey) {
            try {
              const balances = await fetchLiveWalletBalances(connection.publicKey);
              if (isMounted && balances) {
                setPhpcBalance(balances.phpc);
                setXlmBalance(balances.xlm);
              }
            } catch (err) {
              console.error("[ScannerScreen] Failed to fetch balances:", err);
              if (err.status === 404 || err.message?.includes("404") || err.name === "NotFoundError") {
                if (isMounted) {
                  setPhpcBalance("0.00");
                  setXlmBalance("0.0000");
                }
              }
            }
          }
        } catch (error) {
          if (isMounted) {
            setScanError(error.message);
          }
        }
      }

      refreshState();
      return () => {
        isMounted = false;
      };
    }, [network.isOffline]),
  );

  // Laser pulsing and translation animation
  const laserAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let animation;
    if (currentStep === "scan" && permission?.granted && !scanned) {
      laserAnim.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 238,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      laserAnim.setValue(0);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [currentStep, permission, scanned]);

  function handleBarcodeScanned(event) {
    if (scanned) return;

    setScanned(true);
    setSettlementResult(null);
    setDraftMessage("");

    try {
      const parsedInvoice = parseSupplierInvoiceQr(event.data);
      setInvoice(parsedInvoice);
      setScanError("");
      setCurrentStep("detail");
    } catch (error) {
      setInvoice(null);
      setScanError(error.message);
      setShowQrError(true);
    }
  }

  async function handleMagbayadNgSupply() {
    if (!invoice || !isCheckoutEligible) return;
    if (network.isOffline) return;

    if (shortfallPhp > 0) {
      setShowShortfallModal(true);
    } else {
      await proceedSettleInvoice(false, 0);
    }
  }

  async function proceedSettleInvoice(borrowShortfall, borrowAmount) {
    if (isSettling) return;
    setIsSettling(true);
    setScanError("");
    setSettlementResult(null);
    setDraftMessage("");

    try {
      let loanTxHash = "";
      if (borrowShortfall) {
        // Step 1: Execute microlender transaction
        const lenderSecret = "SDXGZJ7JQWRM5ZVQLXJDG553W4RU3RN7HSZXYF7CPCLWYHTCQ6NXYIO3"; // Kaagapay Microfinance
        const loanResult = await receiveLoanFromLender({
          lenderSecretKey: lenderSecret,
          amountPhpc: borrowAmount,
          borrowerPublicKey: walletConnection?.publicKey,
        });

        if (!loanResult.success) {
          throw new Error(`Bigo ang hiram sa Kaagapay: ${loanResult.error}`);
        }

        loanTxHash = loanResult.transactionHash;

        // Save loan record locally
        const loanRecord = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          lenderName: "Kaagapay Microfinance",
          lenderPublicKey: "GAFLJJXR63KPK6UWVCXR34GL5G2F34TUX2ETCGU3SC6ASY6LRIBD3BCB",
          amountPhpc: borrowAmount,
          amountPhpDisplay: borrowAmount,
          txHash: loanTxHash,
          timestamp: Date.now(),
          status: "active",
        };
        await appendLoan(loanRecord);

        // Update outstanding loan balance
        const currentOutstanding = await getOutstandingLoanBalance();
        await setOutstandingLoanBalance(currentOutstanding + borrowAmount);
      }

      // Step 2: Settle invoice via pathPaymentStrictReceive
      // sendMaxPhpc requires a numeric string
      const sendMaxStr = (invoice.amount_usdc * USDC_TO_PHP_RATE * 1.05).toFixed(2);
      const result = await submitInventoryFinancingSettlement({
        supplierPubkey: invoice.supplier_pubkey,
        amountUsdc: invoice.amount_usdc,
        sendMaxPhpc: sendMaxStr,
      });

      if (!result.success) {
        throw new Error(result.error || "Horizon submission failed");
      }

      // Append receipt log
      await appendReceipt({
        id: result.transactionHash,
        type: 'FINANCING',
        amountUsdc: invoice.amount_usdc,
        supplierPubkey: invoice.supplier_pubkey,
        txHash: result.transactionHash,
        timestamp: Date.now(),
      });

      setSettlementResult(result);
      setCurrentStep("success");
    } catch (e) {
      setScanError(e.message);
    } finally {
      setIsSettling(false);
    }
  }

  // STEP 1: CAMERA SCAN SCREEN
  if (currentStep === "scan") {
    return (
      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        {/* Top App Bar */}
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]} onPress={() => router.back()}>
              <Text style={{ fontSize: 20, fontWeight: "900", color: colors.primary }}>✕</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>Invoice Scanner</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={styles.iconButton} onPress={() => alert("Flashlight toggled!")}>
              <Text style={{ fontSize: 16 }}>🔦</Text>
            </Pressable>
            <Pressable style={styles.iconButton} onPress={toggleTheme}>
              <Text style={{ fontSize: 16 }}>{theme === "light" ? "🌙" : "☀️"}</Text>
            </Pressable>
          </View>
        </View>

        {/* Main Viewport (Camera simulation / active feed) */}
        <View style={styles.cameraViewport}>
          {!permission ? (
            <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}>
              <Text style={{ color: colors.textSecondary }}>Checking camera permission...</Text>
            </View>
          ) : !permission.granted ? (
            <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center", padding: 24, gap: 12 }]}>
              <Text style={{ color: colors.textSecondary, textAlign: "center" }}>Camera access is needed to scan supplier invoice QR codes.</Text>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: 99, width: 200 }, pressed && styles.pressed]}
                onPress={requestPermission}
              >
                <Text style={[styles.primaryButtonText, { color: colors.buttonTextOnPrimary }]}>Enable Camera</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />
          )}

          {/* Translucent overlay mask */}
          <View style={styles.viewportMask}>
            {/* Target Window Frame */}
            <View style={styles.focusedFrame}>
              <View style={[styles.scannerCorner, styles.cornerTL]} />
              <View style={[styles.scannerCorner, styles.cornerTR]} />
              <View style={[styles.scannerCorner, styles.cornerBL]} />
              <View style={[styles.scannerCorner, styles.cornerBR]} />

              {/* Bouncing laser line */}
              {permission?.granted && !scanned ? (
                <Animated.View style={[styles.laserLine, { transform: [{ translateY: laserAnim }] }]} />
              ) : null}
            </View>
          </View>

          {/* Floating instructions overlay */}
          <View style={styles.floatingHelper}>
            <Text style={styles.floatingText}>Itapat ang camera sa QR code o JSON ng supplier invoice.</Text>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Ready to Scan</Text>
            </View>
          </View>
        </View>

        {/* Elevated bottom sheet card controls */}
        <ScrollView style={[styles.bottomControlCard, { backgroundColor: colors.card, borderTopColor: colors.border }]} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary }}>Manual JSON Input (Demo Fallback)</Text>
              <Text style={{ fontSize: 14 }}>❓</Text>
            </View>
            <TextInput
              value={mockQrPayload}
              onChangeText={setMockQrPayload}
              placeholder='{"supplier_pubkey":"G...", "amount_usdc": 100}'
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={2}
              style={[styles.input, { height: 56, textAlignVertical: "top", paddingTop: 8, backgroundColor: colors.cardSecondary, color: colors.text, borderColor: colors.border }]}
            />
            <View style={{ gap: 8 }}>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: 99 }, pressed && styles.pressed]}
                onPress={() => {
                  if (!mockQrPayload.trim()) return;
                  try {
                    const parsedInvoice = parseSupplierInvoiceQr(mockQrPayload.trim());
                    setInvoice(parsedInvoice);
                    setScanError("");
                    setScanned(true);
                    setDraftMessage("");
                    setCurrentStep("detail");
                  } catch (error) {
                    setScanError(error.message);
                    setShowQrError(true);
                  }
                }}
              >
                <Text style={[styles.primaryButtonText, { color: colors.buttonTextOnPrimary }]}>Simulate QR Scan</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99 }, pressed && styles.pressed]}
                onPress={() => {
                  setScanned(false);
                  setScanError("");
                  setInvoice(null);
                  setShowQrError(false);
                }}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>I-validate ang Stellar Invoice</Text>
              </Pressable>
            </View>

            <Text style={{ textAlign: "center", fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
              ℹ️ Ligtas at naka-encrypt ang lahat ng data sa Stellar Ledger.
            </Text>

            {scanError && !showQrError ? (
              <View style={[styles.errorCard, { backgroundColor: colors.errorContainer, borderColor: colors.error }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{scanError}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Mali ang QR Code Modal */}
        <Modal visible={showQrError} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.errorModal, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 24 }]}>
              <Text style={[styles.errorTitle, { color: colors.error }]}>Mali ang QR Code</Text>
              <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
                I-check ang QR code ng supplier at subukan ulit.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.errorButton,
                  { backgroundColor: colors.primary, minHeight: 48, justifyContent: "center", borderRadius: 99 },
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setShowQrError(false);
                  setScanned(false);
                }}
              >
                <Text style={[styles.errorButtonText, { color: colors.buttonTextOnPrimary }]}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // STEP 2: INVOICE SETTLEMENT DETAILS SCREEN
  if (currentStep === "detail") {
    return (
      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        {/* Top App Bar */}
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]} onPress={() => setCurrentStep("scan")}>
              <Text style={{ fontSize: 22, color: colors.primary }}>←</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>SariSync Ledger</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={toggleTheme}>
            <Text style={{ fontSize: 16 }}>{theme === "light" ? "🌙" : "☀️"}</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 16 }}>
          {/* Status Header Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 24, alignItems: "center", borderRadius: 24 }]}>
            <View style={[styles.iconCircle, { backgroundColor: theme === "light" ? "#A6F8B4" : "#0d6f37", marginBottom: 12 }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <Text style={[styles.stageName, { color: colors.text, fontSize: 20 }]}>Kaagapay Distributors</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>
              Invoice #INV-2024-089
            </Text>

            <View style={{ marginTop: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginBottom: 2 }}>Kabuuang Halaga (Total Amount)</Text>
              <Text style={{ fontSize: 28, fontWeight: "900", color: colors.primary }}>{formatPhp(totalAmountPhp)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.cardSecondary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "600" }}>🪙 {formatUsdc(invoice.amount_usdc)} Equivalent</Text>
              </View>
            </View>
          </View>

          {/* Kwalipikasyon para sa Pondo Bento section */}
          <View style={[styles.card, { backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 24 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 18 }}>🛡️</Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>Kwalipikasyon para sa Pondo</Text>
            </View>

            {/* Progress bar */}
            <View style={{ gap: 6, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "600" }}>Cash Coverage Progress</Text>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "800" }}>{fundingProgressPercent}% Ready</Text>
              </View>
              <View style={{ height: 8, width: "100%", backgroundColor: colors.border, borderRadius: 99, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${fundingProgressPercent}%`, backgroundColor: colors.primary, borderRadius: 99 }} />
              </View>
            </View>

            {/* Bento tiles */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <View style={[styles.bentoTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16 }]}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: "700" }}>Tindahan Cash</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>{formatPhp(tindahanCash)}</Text>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700", marginTop: 4 }}>✓ Available</Text>
              </View>
              <View style={[styles.bentoTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16 }]}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: "700" }}>Shortfall (Kulang)</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: shortfallPhp > 0 ? colors.error : colors.textSecondary }}>{formatPhp(shortfallPhp)}</Text>
                <Text style={{ fontSize: 10, color: shortfallPhp > 0 ? colors.error : colors.primary, fontWeight: "700", marginTop: 4 }}>
                  {shortfallPhp > 0 ? "⚠ KULANG" : "✓ WALANG KULANG"}
                </Text>
              </View>
            </View>

            {/* Stellar Secure block info */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, padding: 12, borderRadius: 12, borderColor: colors.border, borderWidth: 1 }}>
              <Text style={{ fontSize: 24 }}>🚀</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>Secure Blockchain Settlement</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 1, lineHeight: 13 }}>
                  Ito ay ise-settle sa pamamagitan ng Stellar Testnet para sa mabilis at ligtas na B2B settlement.
                </Text>
              </View>
            </View>
          </View>

          {/* Details list */}
          <View style={{ gap: 2, paddingHorizontal: 4 }}>
            <Row label="Kategorya" value="Grocery Supply" />
            <Row label="Petsa" value="May 21, 2026" />
            <Row label="Blockchain ID" value={`${invoice.supplier_pubkey.slice(0, 10)}...${invoice.supplier_pubkey.slice(-8)}`} />
          </View>

          <Text style={{ fontSize: 11, fontStyle: "italic", color: colors.textSecondary, textAlign: "center", paddingHorizontal: 16 }}>
            Pansinin: Ang utang ay may 2% interest rate kada buwan kung hindi mababayaran sa takdang panahon.
          </Text>

          {/* Error messages detailing why checkout might be disabled */}
          {stage === CREDIT_STAGES.READ_ONLY && shortfallPhp > 0 ? (
            <View style={[styles.errorCard, { backgroundColor: colors.errorContainer, borderColor: colors.error, marginTop: 8, borderRadius: 16 }]}>
              <Text style={[styles.errorText, { color: colors.error, textAlign: "center", lineHeight: 18 }]}>
                🔒 Hindi ma-access ang supplier financing. Mag-record pa ng benta sa Kaha dashboard para ma-unlock ang credit line (kailangan ng hindi bababa sa ₱5,000 kabuuang benta).
              </Text>
            </View>
          ) : isDropLocked && shortfallPhp > 0 ? (
            <View style={[styles.errorCard, { backgroundColor: colors.errorContainer, borderColor: colors.error, marginTop: 8, borderRadius: 16 }]}>
              <Text style={[styles.errorText, { color: colors.error, textAlign: "center", lineHeight: 18 }]}>
                🔒 Hindi pwede mag-utang muna. Babaan muna ang natitirang utang bago makakuha ng bagong financing.
              </Text>
            </View>
          ) : shortfallPhp > remainingBorrowCapacity ? (
            <View style={[styles.errorCard, { backgroundColor: colors.errorContainer, borderColor: colors.error, marginTop: 8, borderRadius: 16 }]}>
              <Text style={[styles.errorText, { color: colors.error, textAlign: "center", lineHeight: 18 }]}>
                ⚠ Ang kulang na {formatPhp(shortfallPhp)} ay lumalagpas sa iyong natitirang limit sa utang ({formatPhp(remainingBorrowCapacity)}). Magbayad muna ng ibang utang para ma-unlock.
              </Text>
            </View>
          ) : null}

          {scanError ? (
            <View style={[styles.errorCard, { backgroundColor: colors.errorContainer, borderColor: colors.error, marginTop: 8 }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{scanError}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky bottom buttons */}
        <View style={[styles.stickyFooter, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Pressable
            disabled={network.isOffline || isSettling || !isCheckoutEligible}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, borderRadius: 99 },
              pressed && styles.pressed,
              (network.isOffline || isSettling || !isCheckoutEligible) && styles.disabled,
            ]}
            onPress={handleMagbayadNgSupply}
          >
            <Text style={[styles.primaryButtonText, { color: colors.buttonTextOnPrimary }]}>
              {network.isOffline ? "Offline" : isSettling ? "Nagbabayad..." : "Magbayad ng Supply"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99 },
              pressed && styles.pressed,
            ]}
            onPress={() => setCurrentStep("scan")}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Bumalik sa Pag-scan</Text>
          </Pressable>
        </View>

        {/* Shortfall Warning Modal */}
        <Modal visible={showShortfallModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.errorModal, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 24 }]}>
              <Text style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>💸</Text>
              <Text style={[styles.errorTitle, { color: colors.primary, textAlign: "center" }]}>Kulang ng {formatPhp(shortfallPhp)}</Text>
              <Text style={[styles.errorBody, { color: colors.textSecondary, marginTop: 8 }]}>
                Ang iyong Tindahan Cash ay hindi sapat para bayaran ang supply. Gusto mo bang utangin ang kulang na {formatPhp(shortfallPhp)} sa Kaagapay Microfinance?
              </Text>
              
              <View style={{ width: "100%", gap: 10, marginTop: 20 }}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.primary, borderRadius: 99 },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setShowShortfallModal(false);
                    proceedSettleInvoice(true, shortfallPhp);
                  }}
                >
                  <Text style={[styles.primaryButtonText, { color: colors.buttonTextOnPrimary }]}>
                    Oo, utangin at magbayad
                  </Text>
                </Pressable>
                
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99 },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setShowShortfallModal(false);
                  }}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                    Kanselahin
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // STEP 3: TRANSACTION SUCCESS SCREEN
  if (currentStep === "success") {
    return (
      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        {/* Top App Bar */}
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.primary, marginLeft: 16 }]}>SariSync Ledger</Text>
          <Pressable style={styles.iconButton} onPress={toggleTheme}>
            <Text style={{ fontSize: 16 }}>{theme === "light" ? "🌙" : "☀️"}</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 130, alignItems: "center" }}>
          {/* Success Header Status */}
          <View style={{ alignItems: "center", marginVertical: 24 }}>
            <View style={styles.successBadgeOuter}>
              <View style={styles.successBadgeInner}>
                <Text style={{ fontSize: 36, color: "#FFFFFF" }}>✓</Text>
              </View>
            </View>
            <Text style={{ fontSize: 26, fontWeight: "900", color: "#1A6B4A", marginTop: 12 }}>Bayad Na!</Text>
          </View>

          {/* Receipt card element */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, width: "100%", padding: 0, overflow: "hidden", borderRadius: 24, elevation: 4 }]}>
            {/* Top outline indicator */}
            <View style={{ height: 6, backgroundColor: colors.primary, opacity: 0.5 }} />

            <View style={{ padding: 24, gap: 16 }}>
              <View style={{ alignSelf: "center", backgroundColor: colors.cardSecondary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 99, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 12, color: colors.primary }}>✓</Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>Kumpirmadong Settled</Text>
              </View>

              <View style={{ alignItems: "center", gap: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Supplier</Text>
                <Text style={{ fontSize: 20, fontWeight: "900", color: colors.text }}>Kaagapay Distributors</Text>
              </View>

              <View style={{ height: 1, borderColor: colors.border, borderStyle: "dashed", borderWidth: 1, borderRadius: 1 }} />

              <View style={{ alignItems: "center", gap: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Total Paid</Text>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.text }}>{formatPhp(totalAmountPhp)}</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>({formatUsdc(invoice?.amount_usdc || 0)})</Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8 }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textSecondary }}>Petsa</Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 2 }}>May 21, 2026</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textSecondary }}>Paraan</Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 2 }}>Ledger Wallet</Text>
                </View>
              </View>

              {settlementResult?.transactionHash || draftMessage ? (
                <View style={{ backgroundColor: colors.cardSecondary, padding: 12, borderRadius: 8, gap: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.5 }}>TRANSACTION HASH</Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }} selectable numberOfLines={1} ellipsizeMode="middle">
                    {settlementResult?.transactionHash || "Saved Offline (pending_online_submission)"}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Jagged border bottom simulation */}
            <View style={styles.jaggedBorder} />
          </View>
        </ScrollView>

        {/* Success bottom action buttons */}
        <View style={[styles.stickyFooter, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: 99 }, pressed && styles.pressed]}
            onPress={() => {
              alert("Gumawa ng Dokumento: Resibo ay matagumpay na na-download sa storage!");
            }}
          >
            <Text style={[styles.primaryButtonText, { color: colors.buttonTextOnPrimary }]}>Gumawa ng Dokumento</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.cardSecondary, borderColor: colors.border, borderRadius: 99 }, pressed && styles.pressed]}
            onPress={() => router.replace("/")}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Bumalik sa Kaha</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

function Row({ label, value }) {
  const { colors } = useAppContext();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  headerBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    marginTop: 32,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraViewport: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    minHeight: 280,
  },
  viewportMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 84, 39, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  focusedFrame: {
    width: 240,
    height: 240,
    position: "relative",
  },
  scannerCorner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#82d995",
    borderWidth: 4,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  laserLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#9df6af",
  },
  floatingHelper: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 20,
    gap: 8,
  },
  floatingText: {
    color: "#FFFFFF",
    fontSize: 13,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9df6af",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  bottomControlCard: {
    height: 260,
    borderTopWidth: 1,
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  stageName: {
    fontWeight: "800",
  },
  bentoTile: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    gap: 10,
    zIndex: 100,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: "800",
    fontSize: 15,
  },
  successBadgeOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E2F6EA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  successBadgeInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1A6B4A",
    alignItems: "center",
    justifyContent: "center",
  },
  jaggedBorder: {
    height: 12,
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.55,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontWeight: "700",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorModal: {
    borderRadius: 12,
    padding: 24,
    gap: 12,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  errorBody: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  errorButton: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    minWidth: 100,
  },
  errorButtonText: {
    fontWeight: "800",
    fontSize: 14,
  },
});
