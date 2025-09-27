/*eslint-disable*/
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableWithoutFeedback,
} from "react-native-web";
import React, { useEffect, useRef } from "react";
import {
  arrHasItem,
  calculateRunningTotals,
  formatCurrencyDisp,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  generateRandomID,
  gray,
  lightenRGBByPercent,
  log,
  removeDashesFromPhone,
} from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useInventoryStore,
  useSettingsStore,
} from "../../../stores";
import {
  CONTACT_RESTRICTIONS,
  CUSTOMER_PROTO,
  WORKORDER_ITEM_PROTO,
} from "../../../data";
import { Button_, CheckBox_, PhoneNumberInput } from "../../../components";
import { TouchableOpacity } from "react-native";

export const CustomerInfoScreenModalComponent = ({
  incomingCustomer = CUSTOMER_PROTO,
  isNewCustomer = false,
  button1Text,
  button2Text,
  handleButton1Press,
  handleButton2Press,
}) => {
  const [sCustomerInfo, _setCustomerInfo] = useState(incomingCustomer);
  const [sWorkorderToDisplay, _setWorkorderToDisplay] = useState();
  const [sSaleToDisplay, _setSaleToDisplay] = useState();
  const { salesLoading, workordersLoading, workorders, sales } =
    useCurrentCustomerStore();

  // testings //////////////////////////////////////////////////////////////
  useEffect(() => {
    useCurrentCustomerStore.getState().loadWorkorders();
  }, []);

  useEffect(() => {
    if (!sWorkorderToDisplay) _setWorkorderToDisplay(workorders[0]);
  }, [workorders]);

  // testings //////////////////////////////////////////////////////////////

  function setCustomerInfo(customerInfo) {
    if (isNewCustomer) {
      // this is a new customer, it is only held locally until the create customer button is pressed
      _setCustomerInfo(customerInfo);
    } else {
      // old customer, saving updates as we go
      useCurrentCustomerStore.getState().setCustomer(customerInfo);
    }
  }

  const TEXT_INPUT_STYLE = {
    width: "100%",
    height: 40,
    borderColor: gray(0.08),
    borderWidth: 1,
    marginTop: 20,
    paddingHorizontal: 8,
    outlineWidth: 0,
    borderRadius: 7,
    color: C.text,
    backgroundColor: C.listItemWhite,
  };

  // dev /////////////////////////////////////////////////////////////////
  isNewCustomer = false;
  // dev ///////////////////////////////////////////////////////////////////
  return (
    <TouchableWithoutFeedback>
      <View
        style={{
          // width: "60%",
          padding: 20,
          backgroundColor: C.backgroundWhite,
          height: "90%",
          // width: "60%",
          flexDirection: "row",
          borderRadius: 15,
          shadowProps: {
            shadowColor: "black",
            shadowOffset: { width: 2, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
          },
        }}
      >
        <View style={{ width: 250, padding: 10 }}>
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <CheckBox_
              text={"Call Only"}
              isChecked={
                sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.call
              }
              onCheck={() => {
                let obj = cloneDeep(sCustomerInfo);
                // __setInfoTextFocus(null);
                if (obj.contactRestriction === CONTACT_RESTRICTIONS.call) {
                  obj.contactRestriction = "";
                } else {
                  obj.contactRestriction = CONTACT_RESTRICTIONS.call;
                }
                setCustomerInfo(obj);
              }}
            />
            <CheckBox_
              text={"Email Only"}
              isChecked={
                sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.email
              }
              onCheck={() => {
                let obj = cloneDeep(sCustomerInfo);
                // __setInfoTextFocus(null);
                // sCustomerInfo.emailOnlyOption = !sCustomerInfo.emailOnlyOption;
                // if (sCustomerInfo.callOnlyOption && sCustomerInfo.emailOnlyOption)
                //   sCustomerInfo.callOnlyOption = false;
                if (obj.contactRestriction === CONTACT_RESTRICTIONS.email) {
                  obj.contactRestriction = "";
                } else {
                  obj.contactRestriction = CONTACT_RESTRICTIONS.email;
                }
                setCustomerInfo(obj);
              }}
            />
          </View>
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.cell = removeDashesFromPhone(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Cell phone"
            style={{ ...TEXT_INPUT_STYLE }}
            value={formatPhoneWithDashes(sCustomerInfo.cell)}
            autoComplete="none"
          />

          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.landline = removeDashesFromPhone(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Landline"
            style={{ ...TEXT_INPUT_STYLE }}
            value={formatPhoneWithDashes(sCustomerInfo.landline)}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.first = capitalizeFirstLetterOfString(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="First name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.first}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.last = capitalizeFirstLetterOfString(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Last name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.last}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.email = val.toLowerCase();
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Email address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.email}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.streetAddress = capitalizeAllWordsInSentence(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Street address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.streetAddress}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.unit = val;
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Unit"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.unit}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.city = capitalizeAllWordsInSentence(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="City"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.city}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.state = val.toUpperCase();
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="State"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.state}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.zip = val;
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Zip code"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.zip}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              let obj = cloneDeep(sCustomerInfo);
              obj.notes = capitalizeFirstLetterOfString(val);
              setCustomerInfo(obj);
            }}
            placeholderTextColor="darkgray"
            placeholder="Address notes"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.notes}
            autoComplete="none"
            numberOfLines={3}
          />

          <View style={{ flexDirection: "column" }}>
            {!!button1Text && (
              <Button_
                onPress={() => handleButton1Press(sCustomerInfo)}
                colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{
                  marginTop: 30,
                  marginLeft: 20,
                  height: 40,
                  width: 200,
                  borderWidth: 1,
                  borderColor: gray(0.1),
                }}
                icon={ICONS.check}
                iconSize={19}
                textStyle={{ color: C.textWhite }}
                text={button1Text}
              />
            )}
            {!!button2Text && (
              <Button_
                icon={ICONS.close1}
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={handleButton2Press}
                buttonStyle={{
                  marginTop: 30,
                  marginLeft: 20,
                  height: 40,
                  width: 200,
                }}
                iconSize={17}
                textStyle={{ marginLeft: 15, color: C.textWhite }}
                text={button2Text}
              />
            )}
          </View>
        </View>
        {!isNewCustomer && (
          <View
            style={{
              width: 450,
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                maxHeight: "45%",
                width: "100%",
                alignItems: "center",
                width: "100%",
              }}
            >
              <Button_
                icon={salesLoading ? ICONS.wheelGIF : ICONS.add}
                // buttonStyle={{ width: null, width: null }}
                textStyle={{ color: gray(0.45) }}
                text={"LOAD WORKORDERS"}
                onPress={() =>
                  useCurrentCustomerStore.getState().loadWorkorders()
                }
              />

              <View
                style={{
                  marginTop: 10,
                  height: "100%",
                  backgroundColor: "transparent",
                  width: "100%",
                }}
              >
                <FlatList
                  data={[
                    ...workorders,
                    // ...workorders,
                    // ...workorders,
                    // ...workorders,
                  ]}
                  // keyExtractor={(o) => o.id + generateRandomID()}
                  renderItem={(obj) => {
                    let wo = obj.item;
                    let idx = obj.index;
                    const totals = calculateRunningTotals(
                      wo,
                      useSettingsStore.getState().settings.salesTax
                    );
                    // log("totals", totals);
                    // log(wo);
                    return (
                      <TouchableOpacity
                        onPress={() => _setWorkorderToDisplay(wo)}
                        style={{
                          borderRadius: 10,
                          borderWidth: wo === sWorkorderToDisplay ? 2 : 2,
                          borderColor:
                            wo === sWorkorderToDisplay
                              ? C.lightred
                              : C.listItemBorder,
                          borderLeftWidth: 2,
                          borderLeftColor:
                            wo === sWorkorderToDisplay ? C.lightred : C.green,
                          padding: 5,
                          paddingHorizontal: 8,
                          marginBottom: 3,
                          width: "100%",
                          // backgroundColor:
                          //   wo === sWorkorderToDisplay
                          //     ? gray(0.04)
                          //     : C.listItemWhite,
                          backgroundColor: C.listItemWhite,
                        }}
                      >
                        <View
                          style={{
                            width: "100%",
                            alignItems: "center",
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text style={{ color: C.text }}>
                            {wo.brand +
                              "     " +
                              (wo.model ? wo.model + "     " : "") +
                              (wo.description ? wo.description + "     " : "")}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            {!!wo.color1.label && (
                              <Text
                                style={{
                                  padding: 5,
                                  color: wo.color1.textColor,
                                  backgroundColor: wo.color1.backgroundColor,
                                  borderRadius: 10,
                                  fontSize: 11,
                                  paddingVertical: 1,
                                }}
                              >
                                {wo.color1.label}
                              </Text>
                            )}
                            {!!wo.color2.label && (
                              <Text
                                style={{
                                  marginLeft: 5,
                                  paddingHorizontal: 5,
                                  paddingVertical: 1,
                                  color: wo.color2.textColor,
                                  backgroundColor: wo.color2.backgroundColor,
                                  borderRadius: 10,
                                  fontSize: 11,
                                }}
                              >
                                {wo.color2.label}
                              </Text>
                            )}
                          </View>
                        </View>
                        <View
                          style={{
                            width: "100%",
                            alignItems: "center",
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text style={{ color: gray(0.4), fontSize: 12 }}>
                            {formatMillisForDisplay(wo.startedOnMillis)}
                            {!!wo.endedOnMillis && (
                              <Text>
                                {" ➟ " +
                                  formatMillisForDisplay(wo.endedOnMillis)}
                              </Text>
                            )}
                          </Text>
                          {wo.paymentComplete ? (
                            <Text style={{ fontSize: 12, color: C.green }}>
                              {"$" + formatCurrencyDisp(wo.amountPaid)}
                            </Text>
                          ) : (
                            <Text style={{ fontSize: 12, color: C.red }}>
                              {"$" +
                                (formatCurrencyDisp(wo.amountPaid) || 0) +
                                " / $" +
                                formatCurrencyDisp(totals.finalTotal)}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
              <View
                style={{
                  maxHeight: "45%",
                  width: "100%",
                  alignItems: "center",
                  marginTop: 10,
                  // backgroundColor: "green",
                }}
              >
                <Button_
                  // colorGradientArr={COLOR_GRADIENTS.green}
                  icon={salesLoading ? ICONS.wheelGIF : ICONS.add}
                  // buttonStyle={{ width: null, width: null }}
                  text={"Load Sales"}
                  textStyle={{ color: gray(0.45) }}
                  buttonStyle={{ paddingHorizontal: 30 }}
                  iconStyle={{ marginLeft: 15 }}
                  onPress={() => useCurrentCustomerStore.getState().loadSales()}
                />
              </View>
            </View>
            <View></View>
          </View>
        )}
        {!!sWorkorderToDisplay && (
          <WorkordersList
            sSelectedWorkorder={sWorkorderToDisplay}
            workorders={workorders}
          />
        )}
        {!!sSaleToDisplay && <SalesList />}
      </View>
    </TouchableWithoutFeedback>
  );
};

const WorkordersList = ({ workorders, sSelectedWorkorder }) => {
  const flatlistRef = useRef(null);

  if (!sSelectedWorkorder) return;

  // Auto-scroll when currentIndex changes
  useEffect(() => {
    if (flatlistRef.current) {
      flatlistRef.current.scrollToIndex({
        index: workorders.findIndex((o) => o.id === sSelectedWorkorder.id),
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [sSelectedWorkorder]); // Triggers when currentIndex changes

  return (
    <View
      style={{
        width: 450,
        height: "100%",
        paddingHorizontal: 15,
        paddingVertical: 5,
      }}
    >
      <FlatList
        // keyExtractor={(o) => o.id + generateRandomID()}
        ref={flatlistRef}
        data={[...workorders]}
        renderItem={(obj) => {
          let workorder = obj.item;
          let idx = obj.index;
          let isSelected =
            workorders.findIndex((o) => o.id === sSelectedWorkorder.id) === idx;

          // dev
          // isSelected = true;
          // dev
          return (
            <View
              style={{
                // backgroundColor: isSelected ? gray(0.04) : null,
                backgroundColor: C.listItemWhite,
                borderColor: isSelected
                  ? C.lightred
                  : C.buttonLightGreenOutline,
                marginBottom: 10,
                borderRadius: 8,
                borderWidth: isSelected ? 2 : 2,
                padding: 5,
              }}
            >
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor:
                    workorder.workorderLines.length > 0
                      ? gray(0.1)
                      : "transparent",
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: "row" }}>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    {workorder.brand || ""}
                  </Text>
                  <Text
                    style={{
                      color: gray(0.6),
                      fontSize: 16,
                      fontWeight: "500",
                      fontStyle: "italic",
                      marginRight: 10,
                    }}
                  >
                    {workorder.model ? "     " + workorder.model : ""}
                  </Text>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    {workorder.description ? "   " + workorder.description : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 100,
                      backgroundColor: workorder.color1?.backgroundColor,
                      color: workorder.color1?.textColor,
                    }}
                  >
                    {workorder.color1?.label || ""}
                  </Text>
                  <Text
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 100,
                      backgroundColor: workorder.color2?.backgroundColor,
                      color: workorder.color2?.textColor,
                      marginLeft: workorder.color2?.label ? 5 : 0,
                    }}
                  >
                    {workorder.color2?.label || ""}
                  </Text>
                </View>
              </View>
              <FlatList
                data={workorder.workorderLines}
                // keyExtractor={(o) => o.id + generateRandomID()}
                renderItem={(obj) => {
                  let index = obj.index;
                  let workorderLine = WORKORDER_ITEM_PROTO;
                  workorderLine = obj.item;
                  let inventoryItem = workorderLine.inventoryItem;
                  // log("item", workorderLine.qty);
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        alignItems: "center",
                        backgroundColor: C.listItemWhite,
                        paddingVertical: 2,
                        marginBottom: 5,
                        borderColor: C.listItemBorder,
                        borderLeftColor: lightenRGBByPercent(C.green, 60),
                        borderWidth: 1,
                        borderLeftWidth: 2,
                        paddingLeft: 10,
                        borderRadius: 5,
                        paddingRight: 10,
                      }}
                    >
                      <View
                        style={{
                          width: "65%",
                          justifyContent: "flex-start",
                          alignItems: "center",
                          flexDirection: "row",
                          // backgroundColor: "green",
                        }}
                      >
                        <View>
                          <Text style={{ color: C.lightred, fontSize: 12 }}>
                            {workorderLine.discountObj?.name}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                color: C.text,
                                fontWeight: "400",
                              }}
                            >
                              {inventoryItem.formalName}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 14,
                              color: gray(0.65),
                              fontWeight: "500",
                            }}
                          >
                            {workorderLine.notes}
                            {/* {inventoryItem?.formalName || "Item Not Found"} */}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          width: "35%",
                          flexDirection: "row",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          height: "100%",
                          paddingRight: 0,
                          // backgroundColor: C.red,
                        }}
                      >
                        <View
                          style={{
                            alignItems: "flex-end",
                            minWidth: 80,
                            // backgroundColor: "green",
                            // marginRight: 1,
                          }}
                        >
                          <Text
                            style={{
                              paddingHorizontal: 0,
                            }}
                          >
                            {"$ " +
                              formatCurrencyDisp(
                                workorderLine.inventoryItem.price
                              )}
                          </Text>
                          {workorderLine.discountObj?.savings ? (
                            <View style={{ alignItems: "flex-end" }}>
                              <Text
                                style={{
                                  paddingHorizontal: 0,
                                  minWidth: 30,
                                  color: C.lightred,
                                }}
                              >
                                {"$ -" +
                                  formatCurrencyDisp(
                                    workorderLine.discountObj?.savings
                                  )}
                              </Text>
                              <Text
                                style={{
                                  fontWeight: "600",
                                  minWidth: 30,
                                  marginTop: 0,
                                  paddingHorizontal: 0,
                                  color: Colors.darkText,
                                }}
                              >
                                {formatCurrencyDisp(
                                  workorderLine.discountObj?.newPrice
                                )}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    // </View>
                  );
                }}
              />
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  justifyContent: "space-around",
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  marginTop: 5,
                  paddingTop: 5,
                }}
              >
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"SUBTOTAL: "}
                  <Text
                    style={{
                      marginRight: 10,
                      color: C.text,
                      fontWeight: "500",
                      fontSize: 14,
                    }}
                  >
                    {"$" +
                      formatCurrencyDisp(
                        calculateRunningTotals(workorder).runningSubtotal
                      )}
                  </Text>
                </Text>
                <View
                  style={{
                    width: 1,
                    height: "100%",
                    backgroundColor: C.buttonLightGreenOutline,
                  }}
                />
                {calculateRunningTotals(workorder).runningDiscount > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, color: C.lightred }}>
                      {"DISCOUNT: "}
                      <Text
                        style={{
                          marginRight: 10,
                          fontWeight: "500",
                          color: C.lightred,
                          fontSize: 14,
                        }}
                      >
                        {"$" +
                          formatCurrencyDisp(
                            calculateRunningTotals(workorder).runningDiscount
                          )}
                      </Text>
                    </Text>
                    <View
                      style={{
                        width: 1,
                        height: "100%",
                        backgroundColor: C.buttonLightGreenOutline,
                      }}
                    />
                  </View>
                ) : null}
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"TAX: "}
                  <Text
                    style={{
                      marginRight: 10,
                      fontWeight: "500",
                      color: C.text,
                      fontSize: 14,
                    }}
                  >
                    {"$" +
                      formatCurrencyDisp(
                        (calculateRunningTotals(workorder).runningTotal *
                          useSettingsStore.getState().settings.salesTax) /
                          100
                      )}
                  </Text>
                </Text>
                <View
                  style={{
                    width: 1,
                    height: "100%",
                    backgroundColor: C.buttonLightGreenOutline,
                  }}
                />

                <Text
                  style={{
                    fontSize: 13,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 15,
                    borderWidth: 1,
                    paddingHorizontal: 14,
                    paddingVertical: 3,
                    color: "gray",
                  }}
                >
                  {"TOTAL: "}
                  <Text
                    style={{
                      marginRight: 10,
                      fontWeight: "700",
                      color: C.text,
                      fontSize: 15,
                    }}
                  >
                    {"$" +
                      formatCurrencyDisp(
                        calculateRunningTotals(workorder).runningTotal *
                          (useSettingsStore.getState().settings.salesTax /
                            100) +
                          calculateRunningTotals(workorder).runningTotal
                      )}
                  </Text>
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
};

const SalesList = ({}) => {};