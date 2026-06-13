import { useMemo, useState, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import cloneDeep from "lodash/cloneDeep";
import { STRIPE_PUBLISHABLE_KEY } from "../../../private_user_constants";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useLoginStore,
  useCurrentCustomerStore,
} from "../../../stores";
import { resolveToken } from "../../../styles";
import {
  formatCurrencyDisp,
  formatPhoneWithDashes,
  resolveStatus,
  generateEAN13Barcode,
  capitalizeFirstLetterOfString,
  printBuilder,
  findTemplateByType,
} from "../../../utils";
import { build_db_path } from "../../../constants";
import { dbSaveCustomer, dbSendReceipt } from "../../../db_calls_wrapper";
import { firestoreRead } from "../../../db_calls";
import { TouchableOpacity } from "../../../dom_components";
import {
  createNewSale,
  updateSaleWithTotals,
  recomputeSaleAmounts,
  buildManualCardTransaction,
} from "../../screen_components/modal_screens/newCheckoutModalScreen/newCheckoutUtils";
import {
  newCheckoutProcessManualCardPayment,
  writeTransaction,
  writeCompletedSale,
  newCheckoutCompleteWorkorder,
  saveItemSales,
} from "../../screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import styles from "./QuickChargePanel.module.css";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

function buildElementOptions() {
  return {
    disableLink: true,
    style: {
      base: {
        fontSize: "16px",
        color: resolveToken("text-default") || "#222",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        "::placeholder": {
          color: resolveToken("text-muted") || "#999",
        },
      },
      invalid: {
        color: resolveToken("danger") || "#e53e3e",
      },
    },
  };
}

async function loadCustomer(customerID) {
  if (!customerID) return null;
  const inMem = useCurrentCustomerStore.getState().getCustomer?.();
  if (inMem?.id && inMem.id === customerID) return cloneDeep(inMem);
  const settings = useSettingsStore.getState().settings;
  const tenantID = settings?.tenantID;
  const storeID = settings?.storeID;
  if (!tenantID || !storeID) return null;
  try {
    const path = `tenants/${tenantID}/stores/${storeID}/customers/${customerID}`;
    const cust = await firestoreRead(path);
    return cust || null;
  } catch {
    return null;
  }
}

function QuickChargeForm({ workorder, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();

  const settings = useSettingsStore((s) => s.getSettings?.() || s.settings);

  const sale = useMemo(() => {
    const user = useLoginStore.getState().currentUser?.first || "";
    let base = createNewSale(settings, user);
    base = updateSaleWithTotals(base, [workorder], settings);
    base.customerID = workorder?.customerID || "";
    base.workorderIDs = workorder?.id ? [workorder.id] : [];
    return base;
  }, [workorder, settings]);

  const [sZip, _setZip] = useState("");
  const [sProcessing, _setProcessing] = useState(false);
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState(false);
  const [sReceiptInfo, _setReceiptInfo] = useState({ cell: "", email: "" });
  const [sCardComplete, _setCardComplete] = useState(false);
  const [sExpComplete, _setExpComplete] = useState(false);
  const [sCvcComplete, _setCvcComplete] = useState(false);

  const elementOptionsRef = useRef(buildElementOptions());

  function fireReceiptSend(finalSale, txns) {
    const cell = workorder.customerCell || "";
    const email = workorder.customerEmail || workorder.email || "";
    if (!cell && !email) return { cell: "", email: "" };

    const tenantID = settings?.tenantID;
    const storeID = settings?.storeID;
    if (!tenantID || !storeID) return { cell: "", email: "" };

    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");

    const cust = {
      first: workorder.customerFirst || "",
      last: workorder.customerLast || "",
      customerCell: cell,
      email: email,
      id: workorder.customerID || "",
    };

    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser?.() || useLoginStore.getState().currentUser, settings };
    const receiptData = printBuilder.sale(finalSale, txns, cust, [workorder], settings?.salesTaxPercent, _ctx, []);
    const storagePath = build_db_path.cloudStorage.saleReceiptPDF(finalSale.id, tenantID, storeID);

    const willSendSMS = !!(cell && smsTemplate);
    const willSendEmail = !!(email && emailTemplate);

    if (willSendSMS || willSendEmail) {
      dbSendReceipt({
        receiptType: "sale",
        receiptData,
        storagePath,
        sendSMS: willSendSMS,
        sendEmail: willSendEmail,
        customerEmail: email,
        customerCell: cell,
        customerID: workorder.customerID || "",
        saleID: finalSale.id,
        workorderID: workorder.id,
        templateVars: {
          firstName: capitalizeFirstLetterOfString((cust.first || "Customer").trim()),
          storeName: settings?.storeInfo?.displayName || "our store",
          total: formatCurrencyDisp(finalSale.total, true),
        },
        smsMessageID: crypto.randomUUID(),
      });
    }

    return {
      cell: willSendSMS ? cell : "",
      email: willSendEmail ? email : "",
    };
  }

  async function archiveSaleAndWorkorder(finalSale, txn) {
    await writeTransaction(txn);

    const statuses = settings?.statuses || [];
    const user = useLoginStore.getState().currentUser?.first || "System";
    const timestamp = Date.now();
    let woUpdated = cloneDeep(workorder);
    const oldStatusLabel = resolveStatus(workorder.status, statuses)?.label || workorder.status || "";
    const newStatusLabel = resolveStatus("finished_and_paid", statuses)?.label || "Finished & Paid";
    woUpdated.paymentComplete = true;
    woUpdated.paidOnMillis = timestamp;
    woUpdated.activeSaleID = "";
    woUpdated.saleID = finalSale.id;
    woUpdated.status = "finished_and_paid";
    const entries = [];
    if (workorder.status !== "finished_and_paid") {
      entries.push({ timestamp, user, field: "status", action: "changed", from: oldStatusLabel, to: newStatusLabel });
    }
    entries.push({
      timestamp, user, field: "payment", action: "completed",
      from: "", to: "Quick charge — " + formatCurrencyDisp(finalSale.total, true),
    });
    woUpdated.changeLog = [...(woUpdated.changeLog || []), ...entries];

    await newCheckoutCompleteWorkorder(woUpdated);
    useOpenWorkordersStore.getState().removeWorkorder(woUpdated, false);

    // Stamp completion time over the sale's original creation millis, so
    // SalesReports' date-range query catches the sale on the day it actually closed.
    finalSale.millis = Date.now();
    await writeCompletedSale(finalSale);

    if (workorder.customerID) {
      let cust = await loadCustomer(workorder.customerID);
      if (cust) {
        const list = cust.sales || [];
        if (!list.includes(finalSale.id)) {
          cust.sales = [...list, finalSale.id];
          await dbSaveCustomer(cust);
          const inMem = useCurrentCustomerStore.getState().getCustomer?.();
          if (inMem?.id === cust.id) {
            useCurrentCustomerStore.getState().setCustomer(cust, false);
          }
        }
      }
    }

    const allLines = (workorder.workorderLines || []).map((line) => ({ ...line, _workorderID: workorder.id }));
    saveItemSales(finalSale, allLines);

    return { sale: finalSale, transaction: txn, workorder: woUpdated };
  }

  async function charge() {
    if (sProcessing) return;
    _setError("");

    if (!stripe || !elements) {
      _setError("Card form not ready");
      return;
    }
    if ((sale.total || 0) < 50) {
      _setError("Amount must be at least $0.50");
      return;
    }
    if (!workorder?.id) {
      _setError("No workorder context");
      return;
    }
    const tenantID = settings?.tenantID;
    const storeID = settings?.storeID;
    if (!tenantID || !storeID) {
      _setError("Tenant/store not configured");
      return;
    }

    _setProcessing(true);

    try {
      const cardNumberEl = elements.getElement(CardNumberElement);
      const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({
        type: "card",
        card: cardNumberEl,
        billing_details: {
          address: sZip ? { postal_code: sZip } : undefined,
        },
      });

      if (pmErr) {
        _setError(pmErr.message || "Card validation failed");
        _setProcessing(false);
        return;
      }

      const transactionID = generateEAN13Barcode();
      const result = await newCheckoutProcessManualCardPayment(
        sale.total,
        paymentMethod.id,
        sale.id,
        workorder.customerID || "",
        workorder.email || workorder.customerEmail || "",
        transactionID
      );

      if (!result?.success) {
        _setError(result?.message || "Payment failed");
        _setProcessing(false);
        return;
      }

      const chargeData = result?.data?.charge || result?.charge;
      if (!chargeData) {
        _setError("Charge data missing from response");
        _setProcessing(false);
        return;
      }

      const txn = buildManualCardTransaction(chargeData, transactionID);
      let finalSale = cloneDeep(sale);
      finalSale.transactionIDs = [txn.id];
      finalSale.workorderIDs = [workorder.id];
      if (finalSale.total > 0 && finalSale.salesTax > 0) {
        txn.salesTax = Math.round(finalSale.salesTax * (txn.amountCaptured / finalSale.total));
      } else {
        txn.salesTax = 0;
      }
      finalSale.lastTransactionStamp = Date.now();
      recomputeSaleAmounts(finalSale, [txn], []);

      const recipients = fireReceiptSend(finalSale, [txn]);
      _setReceiptInfo(recipients);
      _setSuccess(true);
      _setProcessing(false);

      archiveSaleAndWorkorder(finalSale, txn)
        .then((archived) => {
          if (onSuccess) {
            onSuccess({
              sale: archived.sale,
              transaction: archived.transaction,
              workorder: archived.workorder,
            });
          }
        })
        .catch((archErr) => {
          console.error("QuickChargePanel: background archival failed", archErr);
        });
    } catch (err) {
      _setError(err?.message || "Charge failed");
      _setProcessing(false);
    }
  }

  if (sSuccess) {
    const recipParts = [];
    if (sReceiptInfo.cell) recipParts.push(formatPhoneWithDashes(sReceiptInfo.cell));
    if (sReceiptInfo.email) recipParts.push(sReceiptInfo.email);
    const recipText = recipParts.length > 0
      ? `Receipt sent to ${recipParts.join(" and ")}`
      : "No receipt — no contact info on file";
    return (
      <div className={styles.container}>
        <div className={styles.successPanel}>
          <span className={styles.successHeader}>Payment approved</span>
          <span className={styles.successAmount}>
            {formatCurrencyDisp(sale.total, true)}
          </span>
          <span
            className={
              recipParts.length > 0
                ? styles.receiptSentText
                : styles.receiptNoneText
            }
          >
            {recipText}
          </span>
        </div>
      </div>
    );
  }

  const chargeDisabled =
    sProcessing ||
    !stripe ||
    (sale.total || 0) < 50 ||
    !sCardComplete ||
    !sExpComplete ||
    !sCvcComplete ||
    sZip.length < 5;
  const showCardFee = (sale.cardFee || 0) > 0;
  const showTax = (sale.salesTax || 0) > 0;
  const showDiscount = (sale.discount || 0) > 0;

  return (
    <div className={styles.container}>
      <div className={styles.totalsBlock}>
        <div className={styles.totalsRow}>
          <span className={styles.totalsLabel}>Subtotal</span>
          <span className={styles.totalsValue}>{formatCurrencyDisp(sale.subtotal || 0, true)}</span>
        </div>
        {showDiscount && (
          <div className={styles.totalsRow}>
            <span className={styles.totalsLabel}>Discount</span>
            <span className={styles.totalsValue}>- {formatCurrencyDisp(sale.discount, true)}</span>
          </div>
        )}
        {showTax && (
          <div className={styles.totalsRow}>
            <span className={styles.totalsLabel}>Tax</span>
            <span className={styles.totalsValue}>{formatCurrencyDisp(sale.salesTax, true)}</span>
          </div>
        )}
        {showCardFee && (
          <div className={styles.totalsRow}>
            <span className={styles.totalsLabel}>Card fee</span>
            <span className={styles.totalsValue}>{formatCurrencyDisp(sale.cardFee, true)}</span>
          </div>
        )}
        <div className={styles.totalsDivider} />
        <div className={styles.totalsRow}>
          <span className={styles.totalsLabelBold}>Total</span>
          <span className={styles.totalsValueBold}>{formatCurrencyDisp(sale.total || 0, true)}</span>
        </div>
      </div>

      <span className={styles.fieldLabel}>Card number</span>
      <div className={styles.stripeField}>
        <CardNumberElement
          options={{ ...elementOptionsRef.current, showIcon: true }}
          onChange={(e) => _setCardComplete(!!e.complete)}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.colHalf}>
          <span className={styles.fieldLabel}>Expiry</span>
          <div className={styles.stripeField}>
            <CardExpiryElement
              options={elementOptionsRef.current}
              onChange={(e) => _setExpComplete(!!e.complete)}
            />
          </div>
        </div>
        <div className={styles.colGap} />
        <div className={styles.colHalf}>
          <span className={styles.fieldLabel}>CVC</span>
          <div className={styles.stripeField}>
            <CardCvcElement
              options={elementOptionsRef.current}
              onChange={(e) => _setCvcComplete(!!e.complete)}
            />
          </div>
        </div>
      </div>

      <span className={styles.fieldLabel}>ZIP</span>
      <input
        className={styles.textInput}
        value={sZip}
        onChange={(e) => _setZip(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
        placeholder="ZIP"
        inputMode="numeric"
        autoComplete="off"
        name="qc-zip"
        disabled={sProcessing}
      />

      {sError ? <span className={styles.errorText}>{sError}</span> : null}

      <div className={styles.btnRow}>
        {onCancel ? (
          <TouchableOpacity
            className={styles.cancelBtn}
            onPress={onCancel}
            disabled={sProcessing}
          >
            <span className={styles.cancelBtnText}>Cancel</span>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          className={`${styles.chargeBtn} ${chargeDisabled ? styles.chargeBtnDisabled : ""}`}
          onPress={charge}
          disabled={chargeDisabled}
        >
          <span className={styles.chargeBtnText}>
            {sProcessing
              ? "Processing..."
              : `Charge ${formatCurrencyDisp(sale.total || 0, true)}`}
          </span>
        </TouchableOpacity>
      </div>
    </div>
  );
}

export function QuickChargePanel(props) {
  return (
    <Elements stripe={stripePromise}>
      <QuickChargeForm {...props} />
    </Elements>
  );
}
