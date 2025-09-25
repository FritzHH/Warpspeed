/* eslint-disable */
import { FlatList, View, Text, TextInput, ScrollView } from "react-native-web";
import {
  CONTACT_RESTRICTIONS,
  PAYMENT_OBJECT_PROTO,
  SALE_OBJECT_PROTO,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
  ALERT_SCREEN_PROTO,
  WORKORDER_PROTO,
} from "../../../data";
import {
  useAlertScreenStore,
  useCheckoutStore,
  useCurrentCustomerStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useStripePaymentStore,
  useTabNamesStore,
} from "../../../stores";
import * as XLSX from "xlsx";

import {
  BicycleSpinner,
  Button,
  CashSaleModalComponent,
  CheckBox_,
  StripeCreditCardModalComponent,
  FileInput,
  LoadingIndicator,
  PaymentComponent,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
  Button_,
  DropdownMenu,
  SliderButton_,
  GradientView,
  AlertBox_,
  Image_,
} from "../../../components";
import { cloneDeep, initial } from "lodash";
import {
  arrHasItem,
  calculateRunningTotals,
  clog,
  formatDecimal,
  formatCurrencyDisp,
  fuzzySearch,
  generateRandomID,
  generateUPCBarcode,
  getRgbFromNamedColor,
  lightenRGBByPercent,
  log,
  gray,
  removeArrItem,
  removeUnusedFields,
  replaceOrAddToArr,
  roundToTwoDecimals,
  usdTypeMask,
  dollarsToCents,
  addOrRemoveFromArr,
  findInMultipleArrs,
  formatMillisForDisplay,
  checkInputForNumbersOnly,
} from "../../../utils";
import React, { useCallback, useEffect, useState } from "react";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import {
  sendFCMMessage,
  SET_FIRESTORE_FIELD,
  setOpenWorkorder,
} from "../../../db";
import {
  dbCancelServerDrivenStripePayment,
  dbGetClosedWorkorderItem,
  dbGetOpenWorkorderItem,
  dbGetSaleItem,
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
  dbSetCustomerField,
  dbSetSalesObj,
  dbSubscribeToStripePaymentProcess,
} from "../../../db_call_wrapper";
import { TouchableOpacity } from "react-native";
import {
  STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL,
  STRIPE_INITIATE_PAYMENT_INTENT_URL,
} from "../../../private_user_constants";
import { FIRESTORE_COLLECTION_NAMES } from "../../../constants";
import { isArray } from "lodash";

export const MiddleItemComponent = ({
  handleRefundPaymentCheck,
  zCustomer,
  sIsRefund,
  sRefundScan,
  handleRefundScan,
  sRefundScanMessage,
  handleCancelPress,
  sFocusedItem,
  _setFocusedItem,
  handleRefund,
  sRefund = {
    refundedLines: [],
    requestedRefundLines: [],
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    cardRefundPayment: null,
    totalRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cashAmountRefunded: 0,
    cardAmountRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    sale: {},
    selectedCardPayment: null,
  },
  sShouldChargeCardRefundFee,
  sCardRefundFee,
  sCardRefundFeePercentage,
  sSale,
  sCashChangeNeeded,
}) => {
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );

  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);

  const _zSetCustomerField = useCurrentCustomerStore(
    (state) => state.setCustomerField
  );
  // store getters

  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zOpenWorkorders = useOpenWorkordersStore((state) =>
    state.getWorkorders()
  );
  const zInventory = useInventoryStore((state) => state.getInventoryArr());
  const zGetInventoryItem = useInventoryStore(
    (state) => state.getInventoryItem
  );
  const zSettings = useSettingsStore((state) => state.getSettings());
  const zSale = useCheckoutStore((state) => state.saleObj);

  /////////////////////////////////////////////////////////////////////////
  const [sEditingCustomerInfo, _setEditingCustomerInfo] = useState(false);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <View
        style={{
          alignItems: "center",
          width: "100%",
        }}
      >
        <Button_
          buttonStyle={{ padding: 0, backgroundColor: "blue", height: 1 }}
          textStyle={{ fontSize: 10 }}
          text={""}
          onPress={() => handleRefundScan(sRefundScan)}
        />
        {!!zCustomer?.id && (
          <View
            style={{
              width: "100%",
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
                <Text style={{ color: C.textMain }}>
                  {zCustomer?.first + " " + zCustomer?.last}
                  {!!zCustomer?.contactRestriction && (
                    <Text style={{ color: C.red }}>
                      {zCustomer.contactRestriction ===
                      CONTACT_RESTRICTIONS.call
                        ? "    (CALL ONLY)"
                        : "    (EMAIL ONLY)"}
                    </Text>
                  )}
                </Text>
                <Text style={{ color: gray(0.6), fontSize: 12 }}>
                  {zCustomer?.email}
                </Text>
              </View>
              <View>
                {!!zCustomer?.cell && (
                  <Text style={{ color: C.textMain }}>
                    <Text>{"cell: "}</Text>
                    {formatPhoneWithDashes(zCustomer?.cell)}
                  </Text>
                )}
                {!!zCustomer?.land && (
                  <Text style={{ color: C.textMain, fontSize: 13 }}>
                    <Text>{"land: "}</Text>
                    {formatPhoneWithDashes(zCustomer?.land)}
                  </Text>
                )}
              </View>
            </View>

            {!sIsRefund && (
              <View>
                {!!zCustomer?.streetAddress && (
                  <Text style={{ color: C.textMain, fontSize: 13 }}>
                    {zCustomer.streetAddress}
                    {!!zCustomer.unit && (
                      <Text style={{ color: C.textMain, fontSize: 13 }}>
                        {"  |  Unit " + zCustomer.unit}
                      </Text>
                    )}
                    {!!zCustomer.city && (
                      <Text style={{ color: C.textMain, fontSize: 13 }}>
                        {"   |   " + zCustomer.city}
                      </Text>
                    )}
                  </Text>
                )}
                <View
                  style={{
                    width: "100%",
                    justifyContent: "space-between",
                    flexDirection: "row",
                  }}
                >
                  {!!zCustomer?.addressNotes && (
                    <Text style={{ color: gray(0.6), fontSize: 12 }}>
                      {zCustomer?.addressNotes}
                    </Text>
                  )}
                  <Button_
                    buttonStyle={{
                      paddingVertical: 0,
                      backgroundColor: "green",
                    }}
                    icon={ICONS.editPencil}
                    iconSize={15}
                    onPress={() => {
                      log("edit customer info fun needed");
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        )}
        {/** Refund element ///////////////////////////////////////////// */}
        <View
          style={{
            width: "100%",
            marginTop: sIsRefund ? 5 : 15,
            // marginBottom: 30,
          }}
        >
          {!sIsRefund && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 7,
                padding: 5,
                textAlign: "left",
                borderWidth: 1,
                outlineWidth: 0,
                backgroundColor: C.backgroundListWhite,
                color: sSale?.payments.length > 0 ? gray(0.3) : C.textMain,
              }}
            >
              <TextInput
                disabled={
                  sSale?.payments.length > 0 ||
                  sRefund.cashRefundRequested ||
                  sRefund.cardRefundRequested
                }
                style={{
                  outlineWidth: 0,
                  color: C.textMain,
                  maxWidth: "50%",
                  fontSize: 13,
                }}
                onFocus={() => {
                  _setFocusedItem("refund");
                  // _sSetRefundScan("");
                }}
                placeholder="Scan/enter receipt (12 digit numbers-only)"
                placeholderTextColor={gray(0.38)}
                autoFocus={sFocusedItem === "refund"}
                value={sRefundScan}
                onChangeText={(val) => {
                  if (!checkInputForNumbersOnly(val) || val.length > 12) return;
                  handleRefundScan(val);
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: C.red,
                  fontStyle: "italic",
                }}
              >
                {sRefundScanMessage}
              </Text>
            </View>
          )}
        </View>
        {/** totals element ////////////////////////////////////////// */}
        <View
          style={{
            width: "100%",
            // minHeight: "20%",
            // maxHeight: "30%",
            // alignItems: "flex-start",
            justifyContent: "space-between",
            paddingHorizontal: 10,
            paddingVertical: 7,
            backgroundColor: C.listItemWhite,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
          }}
        >
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 13, color: gray(0.5) }}>SUBTOTAL</Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: sIsRefund
                    ? gray(0.5)
                    : lightenRGBByPercent(C.green, 20),
                }}
              >
                {formatCurrencyDisp(sSale?.subtotal)}
              </Text>
            </View>
          </View>
          {sSale?.discount && (
            <View
              style={{
                width: "100%",
                height: 1,
                marginVertical: 10,
                backgroundColor: C.buttonLightGreenOutline,
              }}
            />
          )}
          {sSale?.discount && (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Text
                style={{
                  marginLeft: 15,
                  fontSize: 13,
                  color: sIsRefund ? gray(0.5) : C.lightred,
                }}
              >
                DISCOUNT
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: sIsRefund ? gray(0.5) : C.lightred,
                    marginRight: 10,
                  }}
                >
                  $
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    color: sIsRefund ? gray(0.5) : C.lightred,
                  }}
                >
                  {"- " +
                    formatCurrencyDisp(
                      sSale?.discount || sRefund.sale?.discount
                    )}
                </Text>
              </View>
            </View>
          )}
          {!!(sSale?.discount || sRefund.sale?.discount) && (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Text
                style={{
                  marginLeft: 15,
                  fontSize: 13,
                  color: gray(0.5),
                }}
              >
                DISCOUNTED TOTAL
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: gray(0.5),
                    marginRight: 10,
                  }}
                >
                  $
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    color: sIsRefund
                      ? gray(0.5)
                      : lightenRGBByPercent(C.green, 20),
                  }}
                >
                  {formatCurrencyDisp(sSale?.subtotal - sSale?.discount)}
                </Text>
              </View>
            </View>
          )}
          {!!sSale?.discount && (
            <View
              style={{
                width: "100%",
                height: 1,
                marginVertical: 10,
                backgroundColor: C.buttonLightGreenOutline,
              }}
            />
          )}
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 13, color: gray(0.5) }}>SALES TAX</Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: sIsRefund
                    ? gray(0.5)
                    : lightenRGBByPercent(C.green, 20),
                }}
              >
                {formatCurrencyDisp(sSale?.tax)}
              </Text>
            </View>
          </View>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 13, color: gray(0.5) }}>TOTAL SALE</Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: sIsRefund
                    ? gray(0.5)
                    : lightenRGBByPercent(C.green, 20),
                }}
              >
                {formatCurrencyDisp(sSale?.total)}
              </Text>
            </View>
          </View>
          {sShouldChargeCardRefundFee &&
            sIsRefund &&
            sRefund.totalCardRefundAllowed > 0 && <VertListSpacer />}

          {/******************** REFUNDS ********************************************/}

          {/* {sShouldChargeCardRefundFee &&
        sIsRefund &&
        sRefund.totalCardRefundAllowed > 0 ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 13, color: gray(0.5) }}>{"SUBTOTAL"}</Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 18,
                  color: C.green,
                }}
              >
                {formatCurrencyDisp(
                  sSale?.subtotal + sSale?.tax - sSale?.discount
                )}
              </Text>
            </View>
          </View>
        ) : null} */}

          {sRefund.totalCardRefundAllowed > 0 && (
            <View
              style={{
                alignItems: "center",

                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: C.textMain, fontWeight: "500" }}>
                  {"TOTAL (MANDATORY) CARD REFUND"}
                </Text>
                <View style={{ flexDirection: "row" }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: gray(0.5),
                      marginRight: 10,
                    }}
                  >
                    $
                  </Text>
                  <Text style={{ color: C.textMain, fontWeight: "500" }}>
                    {formatCurrencyDisp(sRefund.totalCardRefundAllowed)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {sShouldChargeCardRefundFee && sRefund.totalCardRefundAllowed > 0 && (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Text style={{ fontSize: 13, color: gray(0.5) }}>
                {"CARD RE-PROCESSING FEE (" + sCardRefundFeePercentage + "%)"}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: gray(0.5),
                    marginRight: 10,
                  }}
                >
                  $
                </Text>
                <Text
                  style={{
                    fontWeight: 500,
                    fontSize: 15,
                    color: gray(0.5),
                  }}
                >
                  {formatCurrencyDisp(
                    sRefund.totalCardRefundAllowed *
                      (sCardRefundFeePercentage / 100)
                  )}
                </Text>
              </View>
            </View>
          )}

          {!!sRefund.totalCashRefundAllowed && <VertListSpacer />}
          {!!sRefund.totalCashRefundAllowed && (
            <View
              style={{
                width: "100%",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: C.textMain, fontWeight: "500" }}>
                {"CASH REFUND ALLOWED"}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: gray(0.5),
                    marginRight: 10,
                  }}
                >
                  $
                </Text>
                <Text style={{ color: C.textMain, fontWeight: "500" }}>
                  {formatCurrencyDisp(sRefund.totalCashRefundAllowed)}
                </Text>
              </View>
            </View>
          )}
          <VertListSpacer />
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 16, color: gray(0.5) }}>
              {sIsRefund ? "TOTAL REFUND ALLOWED" : "TOTAL SALE"}
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 21,
                  color: C.green,
                }}
              >
                {formatCurrencyDisp(
                  sIsRefund
                    ? sRefund.totalCardRefundAllowed +
                        sRefund.totalCashRefundAllowed
                    : sSale?.total
                )}
              </Text>
            </View>

            {/**************************************************** */}
          </View>
          {/************************************************ */}

          {!!sIsRefund && <VertListSpacer />}
          {!!sIsRefund && (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image_
                  size={23}
                  style={{ marginRight: 10 }}
                  icon={ICONS.greenDollar}
                />
                <Text style={{ fontSize: 16, color: C.red }}>
                  {"REFUND REQUESTED"}
                </Text>
              </View>
              <View style={{ flexDirection: "row" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: gray(0.5),
                    marginRight: 10,
                  }}
                >
                  $
                </Text>
                <Text
                  style={{
                    fontWeight: 500,
                    fontSize: 21,
                    color: C.green,
                  }}
                >
                  {formatCurrencyDisp(sRefund.cashRefundRequested)}
                </Text>
              </View>
            </View>
          )}
          {!!sIsRefund && <VertListSpacer />}
          {!!sIsRefund && (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image_
                  size={25}
                  style={{ marginRight: 10 }}
                  icon={ICONS.creditCard}
                />
                <Text style={{ fontSize: 16, color: C.red }}>
                  {"REFUND REQUESTED"}
                </Text>
              </View>
              <View style={{ flexDirection: "row" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: gray(0.5),
                    marginRight: 10,
                  }}
                >
                  $
                </Text>
                <Text
                  style={{
                    fontWeight: 500,
                    fontSize: 21,
                    color: C.green,
                  }}
                >
                  {formatCurrencyDisp(sRefund.cardRefundRequested)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {!!sSale?.payments.length > 0 && (
          <View
            style={{
              marginTop: sIsRefund ? 7 : 15,
              alignItems: "center",
              paddingRight: 10,
              width: "100%",
            }}
          >
            <Text style={{ color: C.green }}>PAYMENTS</Text>
          </View>
        )}
        <View style={{ maxHeight: "18%", width: "100%" }}>
          <ScrollView contentContainerStyle={{ alignItems: "center" }}>
            {sSale?.payments.map((payment) => {
              return (
                <View
                  key={payment.id}
                  style={{
                    padding: 5,
                    backgroundColor: C.listItemWhite,
                    width: "100%",
                    borderRadius: 8,
                    marginBottom: 5,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    {!!sIsRefund && !payment.cash && (
                      <CheckBox_
                        enabled={payment.amountRefunded}
                        buttonStyle={{
                          opacity:
                            payment.amountRefunded >= payment.amountCaptured
                              ? 0.2
                              : 1,
                        }}
                        isChecked={
                          sRefund.selectedCardPayment?.id === payment.id
                        }
                        onCheck={() => handleRefundPaymentCheck(payment)}
                      />
                    )}
                    <View
                      style={{
                        justifyContent: "space-between",
                        width: sIsRefund ? "90%" : "100%",
                      }}
                    >
                      <Text style={{ color: C.green }}>
                        {payment.last4 ? "CARD SALE" : "CASH SALE"}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ color: C.textMain }}>
                          Amount received
                        </Text>
                        <Text>
                          {formatCurrencyDisp(payment.amountCaptured, true)}
                        </Text>
                      </View>
                      {!!payment.amountRefunded && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text style={{ color: C.red, fontSize: 13 }}>
                            Previous Refund amount
                          </Text>
                          <Text style={{ color: C.red, fontSize: 13 }}>
                            {formatCurrencyDisp(payment.amountRefunded, true)}
                          </Text>
                        </View>
                      )}
                      {!!payment.last4 && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text style={{ color: gray(0.4), fontSize: 13 }}>
                            {payment.cardType.split(" ")[0]}
                          </Text>
                          <Text style={{ color: gray(0.4), fontSize: 13 }}>
                            {"***" + payment.last4}
                          </Text>
                          <Text style={{ color: gray(0.4), fontSize: 13 }}>
                            {payment.expMonth + "/" + payment.expYear}
                          </Text>
                        </View>
                      )}
                      {!!payment.cash && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text>Amount Tendered </Text>
                          <Text>
                            {formatCurrencyDisp(payment.amountTendered, true)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {/******************** END REFUNDS ********************************************/}
          {/** ************************************payments list *****************************************************/}
        </View>
        <View
          style={{
            width: "100%",
            alignItems: "flex-end",
            marginTop: sIsRefund ? 5 : 15,
            // paddingRight: 7,
          }}
        >
          {!!sRefund.cashAmountRefunded && (
            <Text
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: C.green,
              }}
            >
              {"CASH REFUNDED:   $" +
                formatCurrencyDisp(sRefund.cashAmountRefunded)}
            </Text>
          )}
          {!!sRefund.cardAmountRefunded && (
            <Text
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: C.green,
              }}
            >
              {"CARD AMOUNT REFUNDED:   $" +
                formatCurrencyDisp(sRefund.cardAmountRefunded)}
            </Text>
          )}
          {sSale?.total - sSale?.amountCaptured > 0 && (
            <Text
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: sSale?.paymentComplete ? C.green : C.red,
              }}
            >
              {"AMOUNT LEFT TO PAY:   $" +
                formatCurrencyDisp(sSale?.total - sSale?.amountCaptured)}
            </Text>
          )}
          {!sIsRefund && sSale?.paymentComplete && (
            <Text
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: sSale?.paymentComplete ? C.green : C.red,
              }}
            >
              {"PAYMENT COMPLETE!"}
            </Text>
          )}
        </View>

        {/*******************************************refund list ********************************************************/}
        {!!sSale?.refunds?.length && (
          <View
            style={{
              marginTop: sIsRefund ? 5 : 15,
              alignItems: "flex-end",
              paddingRight: 10,
            }}
          >
            <Text style={{ color: C.red }}>REFUNDS</Text>
          </View>
        )}
        <View
          style={{
            maxHeight: "25%",
            width: "100%",
          }}
        >
          <ScrollView style={{}}>
            {sSale?.refunds?.map((refund) => {
              let cardDetails = sSale.payments.find(
                (o) => o.id === refund.cardPaymentID
              );
              return (
                <View
                  key={refund.id}
                  style={{
                    padding: 5,
                    backgroundColor: C.listItemWhite,
                    width: "99%",
                    backgroundColor: C.listItemWhite,
                    borderRadius: 10,
                    marginBottom: 5,
                  }}
                >
                  <Text style={{ color: C.green }}>
                    {refund.cardPaymentID ? "CARD REFUND" : "CASH REFUND"}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text>Amount refunded: </Text>
                    <Text>{formatCurrencyDisp(refund.amountRefunded)}</Text>
                  </View>
                  {!!cardDetails && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={{ color: gray(0.4), fontSize: 13 }}>
                        {formatMillisForDisplay(cardDetails.millis)}
                      </Text>
                      <Text style={{ color: gray(0.4), fontSize: 13 }}>
                        {payment.cardType.split(" ")[0]}
                      </Text>
                      <Text style={{ color: gray(0.4), fontSize: 13 }}>
                        {"***" + cardDetails.last4}
                      </Text>
                      <Text style={{ color: gray(0.4), fontSize: 13 }}>
                        {cardDetails.expMonth + "/" + cardDetails.expYear}
                      </Text>
                    </View>
                  )}
                  {!refund.cardPaymentID && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text>Amount Tendered: </Text>
                      <Text>{formatCurrencyDisp(refund.amountTendered)}</Text>
                    </View>
                  )}
                  {/* {paymentObj.cash ? (
                <View
                  style={{
                    justifyContent: "space-between",
                    flexDirection: "row",
                  }}
                >
                  <Text>Change needed: </Text>
                  <Text>
                    {formatCurrencyDisp(
                      paymentObj.amountTendered - paymentObj.amountCaptured
                    )}
                  </Text>
                </View>
              ) : null} */}
                  {!!refund.isRefund && <Text>{"REFUND"}</Text>}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          // backgroundColor: "green",
          // marginTop: sIsRefund ? 10 : 35,
        }}
      >
        {/* {payments?.length > 0 && !sSale?.paymentComplete ? (
          <SliderButton_ onConfirm={(val) => log("val", val)} />
        ) : null} */}
        <Button_
          enabled={
            sSale?.paymentComplete ||
            (!sSale?.amountCaptured > 0 && !sSale?.paymentComplete)
          }
          colorGradientArr={
            sSale?.paymentComplete ? COLOR_GRADIENTS.red : COLOR_GRADIENTS.red
          }
          text={sSale?.paymentComplete ? "CLOSE" : "CANCEL"}
          onPress={handleCancelPress}
          textStyle={{ color: C.textWhite }}
          buttonStyle={{ width: 150 }}
        />
        {!!sCashChangeNeeded && (
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
              width: "30%",
              paddingTop: 2,
              paddingBottom: 2,
              flexDirection: "column",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: gray(0.3),
                width: "100%",
                textAlign: "left",
                paddingBottom: 3,
              }}
            >
              CHANGE
            </Text>
            <Text
              placeholder={"0.00"}
              style={{
                textAlign: "right",
                fontSize: 25,
                color: sCashChangeNeeded > 0 ? C.green : gray(0.3),
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  // color: C.green,
                  paddingRight: 7,
                  height: "100%",
                  textAlignVertical: "top",
                }}
              >
                $
              </Text>
              {sCashChangeNeeded}
            </Text>
          </View>
        )}
        {sSale?.payments?.length > 0 && sSale?.paymentComplete ? (
          <Button_
            buttonStyle={{ width: 150, color: C.textWhite }}
            colorGradientArr={COLOR_GRADIENTS.greenblue}
            text={"REPRINT"}
            textStyle={{ color: C.textWhite }}
            onPress={() => log("reprint receipt method needed")}
          />
        ) : null}
      </View>
    </View>
  );
};

const VertListSpacer = () => (
  <View
    style={{
      width: "100%",
      height: 1,
      marginVertical: 10,
      backgroundColor: C.buttonLightGreenOutline,
    }}
  />
);

const checkoutScreenStyle = {
  base: {
    alignItems: "center",
    paddingTop: 20,
    width: "100%",
    height: "48%",
    // backgroundColor: C.listItemWhite,
    borderRadius: 15,
    ...SHADOW_RADIUS_PROTO,
  },
  titleText: {
    fontSize: 25,
    color: gray(0.6),
  },
  boxDollarSign: {
    fontSize: 15,
    // marginRight: 5,
  },
  totalText: {
    fontSize: 10,
  },
  boxText: {
    outlineWidth: 0,
    fontSize: 25,
    textAlign: "right",
    // placeholderTextColor: makeGrey,
    // backgroundColor: "green",
    color: C.textMain,
    width: "90%",
  },
  buttonText: {
    fontSize: 13,
    fontWeight: Fonts.weight.textRegular,
  },
  mainButtonStyle: {},
  boxStyle: {
    // marginTop: 5,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: C.listItemWhite,
    paddingVertical: 10,
    paddingHorizontal: 10,
    // width: 120,
    alignItems: "space-between",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  totalTextStyle: {
    // marginTop: 15,
    color: gray(0.75),
  },
  titleStyle: {
    // marginTop: 20,
  },
  buttonRowStyle: {
    // marginTop: 20,
  },
  statusText: {
    width: "80%",
    textAlign: "center",
    // marginTop: 15,
    color: "green",
    fontSize: 15,
    fontWeight: 600,
  },
  loadingIndicatorStyle: {
    // marginTop: 10,
  },
};
