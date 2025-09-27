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
  addOrRemoveFromArr,
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
  WORKORDER_PROTO,
} from "../../../data";
import { Button_, CheckBox_ } from "../../../components";

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
    useCurrentCustomerStore.getState().loadSales();
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
              width: 550,
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                height: "100%",
                width: "100%",
                alignItems: "center",
                width: "100%",
              }}
            >
              <Button_
                icon={workordersLoading ? ICONS.wheelGIF : ICONS.add}
                // buttonStyle={{ width: null, width: null }}
                textStyle={{ color: gray(0.45) }}
                text={"LOAD WORKORDERS"}
                onPress={() =>
                  useCurrentCustomerStore.getState().loadWorkorders()
                }
              />
              {!!sWorkorderToDisplay && (
                <WorkordersList workorders={workorders} />
              )}
            </View>
          </View>
        )}
        {!isNewCustomer && (
          <View
            style={{
              width: 400,
              height: "100%",
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                height: "100%",
                width: "100%",
                alignItems: "center",
                width: "100%",
              }}
            >
              <Button_
                // colorGradientArr={COLOR_GRADIENTS.green}
                icon={salesLoading ? ICONS.wheelGIF : ICONS.add}
                // buttonStyle={{ width: null, width: null }}
                text={"LOAD SALES"}
                textStyle={{ color: gray(0.45) }}
                buttonStyle={{ paddingHorizontal: 30 }}
                iconStyle={{ marginLeft: 15 }}
                onPress={() => useCurrentCustomerStore.getState().loadSales()}
              />
              {!!sSaleToDisplay && <SalesList sales={sales} />}
            </View>
          </View>
        )}

        {!!sSaleToDisplay && <SalesList />}
      </View>
    </TouchableWithoutFeedback>
  );
};

const TOTALS_TEXT_SIZE = 11;
const WorkordersList = ({ workorders, sSelectedWorkorder }) => {
  const [sCustomerNotesIdxs, _setCustomerNotesIdxs] = useState([]);
  const [sInternalNotesIdxs, _setInternalNotesIdxs] = useState([]);
  // const flatlistRef = useRef(null);

  useEffect(() => {
    log("cust", sCustomerNotesIdxs);
    log("intern", sInternalNotesIdxs);
  }, [sCustomerNotesIdxs, sInternalNotesIdxs]);

  // Auto-scroll when currentIndex changes
  // useEffect(() => {
  //   if (flatlistRef.current) {
  //     flatlistRef.current.scrollToIndex({
  //       index: workorders.findIndex((o) => o.id === sSelectedWorkorder.id),
  //       animated: true,
  //       viewPosition: 0.5,
  //     });
  //   }
  // }, [sSelectedWorkorder]); // Triggers when currentIndex changes

  return (
    <View
      style={{
        height: "100%",
        width: "100%",
        paddingVertical: 5,
      }}
    >
      <FlatList
        // keyExtractor={(o) => o.id + generateRandomID()}
        // ref={flatlistRef}
        data={workorders}
        renderItem={(obj) => {
          let workorder = obj.item;
          let workorderIdx = obj.index;
          const totals = calculateRunningTotals(
            workorder,
            useSettingsStore.getState().settings.salesTax
          );
          // dev
          // isSelected = true;
          // dev
          return (
            <View
              style={{
                // backgroundColor: isSelected ? gray(0.04) : null,
                backgroundColor: C.listItemWhite,
                borderColor: C.buttonLightGreenOutline,
                marginBottom: 8,
                borderRadius: 8,
                borderWidth: 2,
                padding: 5,
                paddingHorizontal: 10,
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
                <Text style={{ color: gray(0.4), fontSize: 12 }}>
                  {formatMillisForDisplay(workorder.startedOnMillis)}
                  {!!workorder.endedOnMillis && (
                    <Text>
                      {" ➟ " + formatMillisForDisplay(workorder.endedOnMillis)}
                    </Text>
                  )}
                </Text>
                {workorder.paymentComplete ? (
                  <Text style={{ fontSize: 12, color: C.green }}>
                    {"$" + formatCurrencyDisp(workorder.amountPaid)}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: C.red }}>
                    {"$" +
                      (formatCurrencyDisp(workorder.amountPaid) || 0) +
                      " / $" +
                      formatCurrencyDisp(totals.finalTotal)}
                  </Text>
                )}
              </View>
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  paddingVertical: 5,
                  borderBottomWidth: 1,
                  borderBottomColor:
                    workorder.workorderLines.length > 0
                      ? gray(0.1)
                      : "transparent",
                  // marginBottom: 5,
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
                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                  <Text
                    style={{
                      fontSize: 11,
                      paddingHorizontal: 10,
                      paddingVertical: 2,
                      borderRadius: 100,
                      backgroundColor: workorder.color1?.backgroundColor,
                      color: workorder.color1?.textColor,
                    }}
                  >
                    {workorder.color1?.label || ""}
                  </Text>
                  {!!workorder.color2?.label && (
                    <Text
                      style={{
                        fontSize: 11,
                        paddingHorizontal: 10,
                        paddingVertical: 2,
                        borderRadius: 100,
                        backgroundColor: workorder.color2?.backgroundColor,
                        color: workorder.color2?.textColor,
                        marginLeft: workorder.color2?.label ? 5 : 0,
                      }}
                    >
                      {workorder.color2.label}
                    </Text>
                  )}
                </View>
              </View>
              <FlatList
                data={workorder.workorderLines}
                // keyExtractor={(o) => o.id + generateRandomID()}
                renderItem={(obj) => {
                  let index = obj.index;
                  let workorderLine = obj.item;
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
                          width: "85%",
                          justifyContent: "flex-start",
                          alignItems: "center",
                          flexDirection: "row",
                          // backgroundColor: "green",
                        }}
                      >
                        <View>
                          {/**dev                       ********************/}
                          {!workorderLine.discountObj?.label && (
                            <Text style={{ fontSize: 11, color: C.red }}>
                              {workorderLine.discountObj?.label ||
                                "20% off item"}
                            </Text>
                          )}
                          <View>
                            <Text style={{ color: C.lightred, fontSize: 11 }}>
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
                                  fontSize: 15,
                                  color: C.text,
                                  // fontWeight: "500",
                                }}
                              >
                                {inventoryItem.formalName}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 13,
                                color: lightenRGBByPercent(C.text, 20),
                              }}
                            >
                              {/**DEVVVVVVVVVVVVVVVVV */}
                              {workorderLine.notes || "some notes go here bro"}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View
                        style={{
                          width: "15%",
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
              {sCustomerNotesIdxs.find((idx) => idx === workorderIdx) && (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: gray(0.5),
                  }}
                >
                  {"CUSTOMER NOTES:\n"}
                  <Text
                    style={{
                      fontWeight: 400,
                      fontSize: 12,
                      color: gray(0.4),
                    }}
                  >
                    {
                      "ehhekrjekfjkdnfaklnddfkdasj/dnkdjfkdjfd\ndfjkdjfkd\nfdkfjkdfkadjfknd\n"
                    }
                  </Text>
                </Text>
              )}
              {sInternalNotesIdxs.find((idx) => idx === workorderIdx) && (
                <Text
                  style={{
                    marginTop: 5,
                    fontSize: 11,
                    fontWeight: 500,
                    color: gray(0.5),
                  }}
                >
                  {"INTERNAL NOTES:\n"}
                  <Text
                    style={{
                      fontWeight: 400,
                      fontSize: 12,
                      color: gray(0.4),
                    }}
                  >
                    {
                      "ehhekrjekfjkdnfaklnddfkdasj/dnkdjfkdjfd\ndfjkdjfkd\nfdkfjkdfkadjfknd\n"
                    }
                  </Text>
                </Text>
              )}
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
                <View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      // marginVertical: 3,
                    }}
                  >
                    <Button_
                      onPress={() => {
                        _setCustomerNotesIdxs(
                          cloneDeep(
                            addOrRemoveFromArr(sCustomerNotesIdxs, workorderIdx)
                          )
                        );
                      }}
                      icon={ICONS.notes}
                      iconSize={18}
                      buttonStyle={{
                        paddingLeft: 0,
                        paddingVertical: 5,
                      }}
                      textStyle={{ color: gray(0.4), fontSize: 11 }}
                    />
                    <Button_
                      onPress={() => {
                        _setInternalNotesIdxs(
                          cloneDeep(
                            addOrRemoveFromArr(sInternalNotesIdxs, workorderIdx)
                          )
                        );
                      }}
                      icon={ICONS.gears1}
                      iconSize={18}
                      buttonStyle={{
                        marginLeft: 5,
                        paddingVertical: 5,
                        paddingLeft: 0,
                      }}
                      textStyle={{ color: gray(0.4), fontSize: 11 }}
                    />
                  </View>
                </View>
                <View
                  style={{
                    width: 1,
                    height: "100%",
                    backgroundColor: C.buttonLightGreenOutline,
                  }}
                />
                <Text style={{ fontSize: TOTALS_TEXT_SIZE, color: "gray" }}>
                  {"SUBTOTAL:\n"}
                  <Text
                    style={{
                      textAlign: "left",
                      // marginHorizontal: 10,
                      color: C.text,
                      fontWeight: 500,
                      fontSize: TOTALS_TEXT_SIZE + 1,
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
                {!calculateRunningTotals(workorder).runningDiscount > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ fontSize: TOTALS_TEXT_SIZE, color: C.lightred }}
                    >
                      {"DISCOUNT:\n"}
                      <Text
                        style={{
                          // marginRight: 10,
                          fontWeight: 500,
                          color: C.lightred,
                          fontSize: TOTALS_TEXT_SIZE + 1,
                        }}
                      >
                        {"$" + formatCurrencyDisp("23435")}
                        {/* {"$" +
                          formatCurrencyDisp(
                            calculateRunningTotals(workorder).runningDiscount
                          )} */}
                      </Text>
                    </Text>
                  </View>
                )}
                {!calculateRunningTotals(workorder).runningDiscount > 0 && (
                  <View
                    style={{
                      width: 1,
                      height: "100%",
                      backgroundColor: C.buttonLightGreenOutline,
                    }}
                  />
                )}
                <Text style={{ fontSize: TOTALS_TEXT_SIZE, color: "gray" }}>
                  {"TAX:\n"}
                  <Text
                    style={{
                      // marginRight: 10,
                      fontWeight: 500,
                      color: C.text,
                      fontSize: TOTALS_TEXT_SIZE + 1,
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
                    fontSize: TOTALS_TEXT_SIZE + 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 15,
                    borderWidth: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    color: "gray",
                  }}
                >
                  {"TOTAL: "}
                  <Text
                    style={{
                      // marginRight: 10,
                      fontWeight: 600,
                      color: C.text,
                      fontSize: TOTALS_TEXT_SIZE + 3,
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

const SalesList = ({ sales }) => {
  return (
    <View style={{ width: "100%", height: "100%", paddingVertical: 5 }}>
      <FlatList
        data={sales}
        renderItem={(obj) => {
          let sale = obj.item;
          return (
            <View
              style={{
                backgroundColor: C.listItemWhite,
                borderColor: C.buttonLightGreenOutline,
                marginBottom: 10,
                borderRadius: 8,
                borderWidth: 2,
                padding: 5,
                paddingHorizontal: 10,
              }}
            ></View>
          );
        }}
      />
    </View>
  );
};

{
  /* <View
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
              </View> */
}