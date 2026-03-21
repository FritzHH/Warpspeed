/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { useState, useRef, useEffect } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, SHADOW_RADIUS_PROTO, Button_ } from "../../../../components";
import { C, Fonts, COLOR_GRADIENTS } from "../../../../styles";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useCurrentCustomerStore,
  useInventoryStore,
  useSettingsStore,
  useLoginStore,
  useAlertScreenStore,
} from "../../../../stores";
import {
  lightenRGBByPercent,
  formatCurrencyDisp,
  generateUPCBarcode,
  log,
  printBuilder,
  gray,
  replaceOrAddToArr,
  formatPhoneWithDashes,
} from "../../../../utils";
import { WORKORDER_ITEM_PROTO, CONTACT_RESTRICTIONS } from "../../../../data";
import {
  createNewSale,
  updateSaleWithTotals,
  calculateSaleTotals,
} from "./newCheckoutUtils";
import {
  newCheckoutSaveActiveSale,
  newCheckoutGetActiveSale,
  newCheckoutCompleteSale,
  newCheckoutSaveWorkorder,
  newCheckoutCompleteWorkorder,
  newCheckoutGetStripeReaders,
  newCheckoutDeleteActiveSale,
  saveSaleIndex,
} from "./newCheckoutFirebaseCalls";

import { SaleHeader } from "./SaleHeader";
import { CashPayment } from "./CashPayment";
import { CardPayment } from "./CardPayment";
import { SaleTotals } from "./SaleTotals";
import { PaymentsList } from "./PaymentsList";
import { WorkorderCombiner } from "./WorkorderCombiner";
import { InventorySearch } from "./InventorySearch";
import { broadcastToDisplay, broadcastClear, DISPLAY_MSG_TYPES } from "../../../../broadcastChannel";

function broadcastSaleToDisplay(sale, combinedWOs, addedItems, customerFirst, customerLast) {
  if (!sale) return;
  let mapLine = (line) => ({
    id: line.id,
    qty: line.qty,
    inventoryItem: {
      formalName: line.inventoryItem?.formalName || "",
      price: line.inventoryItem?.price || 0,
    },
    discountObj: line.discountObj
      ? { name: line.discountObj.name, savings: line.discountObj.savings || 0, newPrice: line.discountObj.newPrice || 0 }
      : null,
  });
  broadcastToDisplay(DISPLAY_MSG_TYPES.SALE, {
    customerFirst: customerFirst || "",
    customerLast: customerLast || "",
    combinedWorkorders: (combinedWOs || []).map((wo) => ({
      brand: wo.brand || "",
      model: wo.model || "",
      description: wo.description || "",
      workorderLines: (wo.workorderLines || []).map(mapLine),
    })),
    addedItems: (addedItems || []).map(mapLine),
    sale: {
      subtotal: sale.subtotal,
      discount: sale.discount || 0,
      tax: sale.tax,
      taxRate: sale.salesTaxPercent,
      cardFee: sale.cardFee || 0,
      cardFeePercent: sale.cardFeePercent || 0,
      total: sale.total,
      amountCaptured: sale.amountCaptured || 0,
      paymentComplete: sale.paymentComplete || false,
    },
  });
}

export function NewCheckoutModalScreen() {
  // ─── Zustand Store Access ─────────────────────────────────
  const zIsCheckingOut = useCheckoutStore((state) => state.isCheckingOut);
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === state.openWorkorderID) || null
  );
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zCustomer = useCurrentCustomerStore((state) => state.customer);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zSettings = useSettingsStore((state) => state.settings);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  // ─── Local State ──────────────────────────────────────────
  const [sSale, _setSale] = useState(null);
  const [sCombinedWorkorders, _setCombinedWorkorders] = useState([]);
  const [sAddedItems, _setAddedItems] = useState([]);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sStripeReaders, _setStripeReaders] = useState([]);
  const [sReaderError, _setReaderError] = useState("");
  const [sInitialized, _setInitialized] = useState(false);

  // ─── Derived Values ───────────────────────────────────────
  let isStandalone = !zOpenWorkorder;
  let saleComplete = sSale?.paymentComplete || false;
  let amountLeftToPay = (sSale?.total || 0) - (sSale?.amountCaptured || 0);
  if (amountLeftToPay < 0) amountLeftToPay = 0;
  let custFirst = zCustomer?.first || zOpenWorkorder?.customerFirst || "";
  let custLast = zCustomer?.last || zOpenWorkorder?.customerLast || "";

  // ─── Initialization ──────────────────────────────────────
  // Called once when the modal opens. We use a flag to avoid
  // repeated init without adding a useEffect.
  if (zIsCheckingOut && !sInitialized) {
    _setInitialized(true);
    initializeCheckout();
  }

  async function initializeCheckout() {
    let createdBy = zCurrentUser?.first
      ? zCurrentUser.first + " " + (zCurrentUser.last || "")
      : "";

    // Check if workorder has an existing partial-payment sale to resume
    if (zOpenWorkorder?.activeSaleID) {
      let existingSale = await newCheckoutGetActiveSale(zOpenWorkorder.activeSaleID);
      if (existingSale) {
        log("Resuming existing sale:", existingSale.id);

        // Rebuild combined workorders from the sale's workorderIDs
        let combined = [cloneDeep(zOpenWorkorder)];
        if (existingSale.workorderIDs?.length > 1) {
          for (let woID of existingSale.workorderIDs) {
            if (woID === zOpenWorkorder.id) continue;
            let otherWO = (zOpenWorkorders || []).find((w) => w.id === woID);
            if (otherWO) combined.push(cloneDeep(otherWO));
          }
        }
        _setCombinedWorkorders(combined);

        // Restore added items from the sale
        if (existingSale.addedItems?.length > 0) {
          _setAddedItems(existingSale.addedItems);
        }

        _setSale(existingSale);
        broadcastSaleToDisplay(existingSale, combined, existingSale.addedItems || [], custFirst, custLast);
        fetchReaders();
        return;
      }
    }

    // No existing sale — create a new one
    let sale = createNewSale(zSettings, createdBy);

    if (zOpenWorkorder) {
      // Checkout with workorder
      sale.customerID = zOpenWorkorder.customerID || "";
      let combined = [cloneDeep(zOpenWorkorder)];
      _setCombinedWorkorders(combined);

      // Calculate initial totals
      sale = updateSaleWithTotals(sale, combined, [], zSettings);
      sale.workorderIDs = [zOpenWorkorder.id];
    } else {
      // Standalone sale
      sale.status = "active";
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, zOpenWorkorder ? [cloneDeep(zOpenWorkorder)] : [], [], custFirst, custLast);

    // Persist immediately for network resilience
    newCheckoutSaveActiveSale(sale);

    // Fetch card readers
    fetchReaders();
  }

  async function fetchReaders() {
    try {
      let result = await newCheckoutGetStripeReaders();
      let readersArr = result?.data?.data || [];
      let readers = readersArr.filter((r) => r.status === "online");
      if (readers.length > 0) {
        _setStripeReaders(readers);
        _setReaderError("");
      } else {
        _setReaderError("No card readers connected to account");
      }
    } catch (e) {
      log("Failed to fetch card readers:", e);
      _setReaderError("No card readers connected to account");
    }
  }

  // Poll for card readers every 5s when none are detected
  const readerPollRef = useRef(null);
  useEffect(() => {
    if (sStripeReaders.length === 0 && sInitialized) {
      readerPollRef.current = setInterval(fetchReaders, 5000);
    }
    return () => {
      if (readerPollRef.current) {
        clearInterval(readerPollRef.current);
        readerPollRef.current = null;
      }
    };
  }, [sStripeReaders.length, sInitialized]);

  // ─── Workorder Combining ──────────────────────────────────
  function handleToggleWorkorder(wo) {
    // Cannot uncheck primary workorder
    if (wo.id === zOpenWorkorder?.id) return;

    let newArr;
    if (sCombinedWorkorders.find((o) => o.id === wo.id)) {
      newArr = sCombinedWorkorders.filter((o) => o.id !== wo.id);
    } else {
      newArr = [...sCombinedWorkorders, cloneDeep(wo)];
    }
    _setCombinedWorkorders(newArr);

    // Recalculate totals
    let updated = updateSaleWithTotals(sSale, newArr, sAddedItems, zSettings);
    updated.workorderIDs = newArr.map((o) => o.id);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newArr, sAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleWorkorderLineChange(woId, newLines) {
    let newArr = sCombinedWorkorders.map((wo) =>
      wo.id === woId ? { ...wo, workorderLines: newLines } : wo
    );
    _setCombinedWorkorders(newArr);
    useOpenWorkordersStore.getState().setField("workorderLines", newLines, woId);

    let updated = updateSaleWithTotals(sSale, newArr, sAddedItems, zSettings);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newArr, sAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  // Other open workorders for the same customer
  function getOtherCustomerWorkorders() {
    if (!zOpenWorkorder?.customerID) return [];
    return (zOpenWorkorders || []).filter(
      (wo) =>
        wo.customerID === zOpenWorkorder.customerID &&
        wo.id !== zOpenWorkorder.id
    );
  }

  // ─── Inventory Item Management ────────────────────────────
  function handleAddItem(invItem) {
    let newItem = {
      qty: 1,
      inventoryItem: cloneDeep(invItem),
      discountObj: null,
      id: generateUPCBarcode(),
      useSalePrice: false,
      warranty: false,
    };

    let newAddedItems = [...sAddedItems, newItem];
    _setAddedItems(newAddedItems);

    // Recalculate totals
    let updated = updateSaleWithTotals(
      sSale,
      sCombinedWorkorders,
      newAddedItems,
      zSettings
    );
    _setSale(updated);
    broadcastSaleToDisplay(updated, sCombinedWorkorders, newAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleRemoveItem(item) {
    let newAddedItems = sAddedItems.filter((i) => i.id !== item.id);
    _setAddedItems(newAddedItems);

    let updated = updateSaleWithTotals(
      sSale,
      sCombinedWorkorders,
      newAddedItems,
      zSettings
    );
    _setSale(updated);
    broadcastSaleToDisplay(updated, sCombinedWorkorders, newAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  // ─── Payment Handling ─────────────────────────────────────
  function handlePaymentCapture(payment) {
    let sale = cloneDeep(sSale);
    payment.saleID = sale.id;
    sale.payments = [...sale.payments, payment];
    sale.amountCaptured = sale.amountCaptured + payment.amountCaptured;
    sale.workorderIDs = sCombinedWorkorders.map((o) => o.id);

    // Store added items on the sale so they can be restored on resume
    sale.addedItems = cloneDeep(sAddedItems);

    // Check if fully paid
    if (sale.amountCaptured >= sale.total) {
      sale.paymentComplete = true;
      sale.status = "complete";
      handleSaleComplete(sale);
    } else {
      sale.status = "partial";
      // Update all combined workorders with partial payment info
      updateWorkordersWithPaymentStatus(sale);
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, sCombinedWorkorders, sAddedItems, custFirst, custLast);

    // Persist immediately — network-failure-proof
    newCheckoutSaveActiveSale(sale);
  }

  // Update workorders to track that a sale is in progress
  function updateWorkordersWithPaymentStatus(sale) {
    for (let wo of sCombinedWorkorders) {
      let updated = cloneDeep(wo);
      updated.activeSaleID = sale.id;
      updated.amountPaid = sale.amountCaptured;
      useOpenWorkordersStore.getState().setWorkorder(updated, true);
    }
  }

  async function handleSaleComplete(sale) {
    // Mark all combined workorders as complete
    for (let wo of sCombinedWorkorders) {
      let woToComplete = cloneDeep(wo);
      woToComplete.paymentComplete = true;
      woToComplete.activeSaleID = "";
      woToComplete.amountPaid = sale.total;
      woToComplete.saleID = sale.id;
      woToComplete.sales = replaceOrAddToArr(woToComplete.sales || [], sale.id);
      woToComplete.endedOnMillis = Date.now();

      // Merge added items into primary workorder only
      if (wo.id === sCombinedWorkorders[0]?.id && sAddedItems.length > 0) {
        sAddedItems.forEach((addedItem) => {
          woToComplete.workorderLines = [
            ...woToComplete.workorderLines,
            cloneDeep(addedItem),
          ];
        });
      }

      await newCheckoutCompleteWorkorder(woToComplete);
      useOpenWorkordersStore.getState().removeWorkorder(woToComplete, false); // remove from local store, don't send DB delete (already archived)
    }

    // Save completed sale to Cloud Storage
    await newCheckoutCompleteSale(sale);

    // Write sale index for reporting
    const customer = useCurrentCustomerStore.getState().customer;
    const primaryWO = sCombinedWorkorders[0];
    const customerInfo = {
      first: customer?.first || primaryWO?.customerFirst || "",
      last: customer?.last || primaryWO?.customerLast || "",
      phone: customer?.cell || primaryWO?.customerPhone || "",
      id: customer?.id || primaryWO?.customerID || "",
    };
    const allLines = sCombinedWorkorders.flatMap((wo) => wo.workorderLines || []);
    const isStandalone = primaryWO?.isStandaloneSale || false;
    saveSaleIndex(sale, customerInfo, allLines, isStandalone);
  }

  function handleCashChange(change) {
    _setCashChangeNeeded(change);
  }

  // ─── Close Modal ──────────────────────────────────────────
  function closeModal() {
    if (
      sSale?.payments?.length > 0 &&
      !sSale.paymentComplete
    ) {
      // Partial payment — confirm with user
      useAlertScreenStore.getState().setValues({
        showAlert: true,
        title: "Partial Payment In Progress",
        message:
          "This sale has partial payments recorded. They have been saved and you can resume later.",
        btn1Text: "Close Anyway",
        btn1Handler: () => {
          resetAndClose();
          useAlertScreenStore.getState().setValues({ showAlert: false });
        },
        btn2Text: "Go Back",
        btn2Handler: () => {
          useAlertScreenStore.getState().setValues({ showAlert: false });
        },
      });
      return;
    }
    resetAndClose();
  }

  function resetAndClose() {
    // Clean up orphaned active-sale if no payments were made
    if (sSale?.id && !(sSale?.amountCaptured > 0)) {
      newCheckoutDeleteActiveSale(sSale.id);
    }
    broadcastClear();
    _setSale(null);
    _setCombinedWorkorders([]);
    _setAddedItems([]);
    _setCashChangeNeeded(0);
    _setStripeReaders([]);
    _setReaderError("");
    _setInitialized(false);
    useCheckoutStore.getState().setIsCheckingOut(false);
  }

  function handleReprint() {
    if (!sSale) return;
    let toPrint = printBuilder.sale(
      sSale,
      sSale.payments,
      zCustomer,
      sCombinedWorkorders[0],
      zSettings?.salesTaxPercent
    );
    // dbSavePrintObj would be called here if printing is needed
    log("Reprint receipt:", toPrint);
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <ScreenModal
      modalVisible={zIsCheckingOut}
      showOuterModal={true}
      outerModalStyle={{
        backgroundColor: "rgba(50,50,50,.65)",
      }}
      buttonVisible={false}
      Component={() => (
        <View
          style={{
            flexDirection: "column",
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            width: "85%",
            height: "90%",
            borderRadius: 15,
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.green,
            overflow: "hidden",
          }}
        >
          {/* ── Main 3-Column Layout ────────────────────── */}
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              padding: 20,
            }}
          >
            {/* ── LEFT COLUMN: Payment Methods ──────────── */}
            <View
              style={{
                width: "29%",
                height: "100%",
                justifyContent: "space-between",
              }}
            >
              <CashPayment
                amountLeftToPay={amountLeftToPay}
                onPaymentCapture={handlePaymentCapture}
                acceptChecks={zSettings?.acceptChecks}
                saleComplete={saleComplete}
                onCashChange={handleCashChange}
              />
              <CardPayment
                amountLeftToPay={amountLeftToPay}
                onPaymentCapture={handlePaymentCapture}
                stripeReaders={sStripeReaders}
                settings={zSettings}
                saleComplete={saleComplete}
                readerError={sReaderError}
              />
            </View>

            {/* ── MIDDLE COLUMN: Totals & Payments ──────── */}
            <View
              style={{
                width: "29%",
                paddingLeft: 10,
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <ScrollView style={{ flex: 1 }}>
                  {/* Customer Info */}
                  {zCustomer && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 10,
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        backgroundColor: C.backgroundListWhite,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <View>
                          <Text style={{ color: C.text }}>
                            {zCustomer.first} {zCustomer.last}
                            {!!zCustomer.contactRestriction && (
                              <Text style={{ color: C.red }}>
                                {zCustomer.contactRestriction === CONTACT_RESTRICTIONS.call
                                  ? "    (CALL ONLY)"
                                  : "    (EMAIL ONLY)"}
                              </Text>
                            )}
                          </Text>
                          {zCustomer.email && (
                            <Text style={{ color: gray(0.6), fontSize: 12 }}>
                              {zCustomer.email}
                            </Text>
                          )}
                        </View>
                        <View>
                          {!!zCustomer.cell && (
                            <Text style={{ color: C.text }}>
                              <Text>{"cell: "}</Text>
                              {formatPhoneWithDashes(zCustomer.cell)}
                            </Text>
                          )}
                          {!!zCustomer.land && (
                            <Text style={{ color: C.text, fontSize: 13 }}>
                              <Text>{"land: "}</Text>
                              {formatPhoneWithDashes(zCustomer.land)}
                            </Text>
                          )}
                        </View>
                      </View>
                      {!!zCustomer.streetAddress && (
                        <Text style={{ color: C.text, fontSize: 13 }}>
                          {zCustomer.streetAddress}
                          {!!zCustomer.unit && (
                            <Text style={{ color: C.text, fontSize: 13 }}>
                              {"  |  Unit " + zCustomer.unit}
                            </Text>
                          )}
                          {!!zCustomer.city && (
                            <Text style={{ color: C.text, fontSize: 13 }}>
                              {"   |   " + zCustomer.city}
                            </Text>
                          )}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Sale Totals */}
                  <SaleTotals
                    sale={sSale}
                    cashChangeNeeded={sCashChangeNeeded}
                    settings={zSettings}
                  />

                  {/* Payments List */}
                  <PaymentsList payments={sSale?.payments} />
                </ScrollView>
              </View>

              {/* Bottom Buttons: Cancel/Close + Reprint */}
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-around",
                  paddingTop: 10,
                }}
              >
                <Button_
                  enabled={
                    saleComplete ||
                    (!(sSale?.amountCaptured > 0) && !saleComplete)
                  }
                  colorGradientArr={COLOR_GRADIENTS.red}
                  text={saleComplete ? "CLOSE" : "CANCEL"}
                  onPress={closeModal}
                  textStyle={{ color: C.textWhite }}
                  buttonStyle={{ width: 150 }}
                />
                {saleComplete && (
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.greenblue}
                    text="REPRINT"
                    onPress={handleReprint}
                    textStyle={{ color: C.textWhite }}
                    buttonStyle={{ width: 150 }}
                  />
                )}
              </View>
            </View>

            {/* ── RIGHT COLUMN: Workorders & Inventory ───── */}
            <View
              style={{
                width: "42%",
                paddingLeft: 10,
              }}
            >
              <ScrollView style={{ flex: 1 }}>
                {/* Inventory Search (always available) */}
                <InventorySearch
                  addedItems={sAddedItems}
                  onAddItem={handleAddItem}
                  onRemoveItem={handleRemoveItem}
                  inventory={zInventory}
                />

                {/* Workorders (combiner + line items) */}
                {!isStandalone && (
                  <View style={{ marginTop: 15 }} />
                )}
                {!isStandalone && (
                  <WorkorderCombiner
                    combinedWorkorders={sCombinedWorkorders}
                    otherCustomerWorkorders={getOtherCustomerWorkorders()}
                    onToggle={handleToggleWorkorder}
                    onLineChange={handleWorkorderLineChange}
                    primaryWorkorderID={zOpenWorkorder?.id}
                    saleHasPayments={sSale?.payments?.length > 0}
                    salesTaxPercent={zSettings?.salesTaxPercent || 0}
                  />
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      )}
    />
  );
}
