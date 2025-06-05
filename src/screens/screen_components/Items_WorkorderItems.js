/*eslint-disable*/
import { View, Text, TextInput, FlatList } from "react-native-web";
import {
  applyDiscountToWorkorderItem,
  clog,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../utils";
import {
  TabMenuDivider as Divider,
  Button,
  ScreenModal,
} from "../../components";
import { Colors } from "../../styles";
import {
  discounts_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  SETTINGS_PROTO,
  DISCOUNT_OBJ_PROTO,
} from "../../data";
import { useRef, useState } from "react";
import { clone, cloneDeep } from "lodash";
import {
  useCurrentWorkorderStore,
  useInventoryStore,
  useLoginStore,
  useSettingsStore,
} from "../../stores";
import {
  dbSetClosedWorkorderItem,
  dbSetOpenWorkorderItem,
} from "../../db_calls";
import { WorkerPage } from "twilio/lib/rest/taskrouter/v1/workspace/worker";

export const Items_WorkorderItemsTab = ({}) => {
  // setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zExecute = useLoginStore((state) => state.execute);

  // getters ///////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  let zSettingsObj = SETTINGS_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

  ///////////////////////////////////////////////////////////////////////////
  const [sButtonsRowID, _setButtonsRowID] = useState(null);

  function deleteWorkorderLineItem(index) {
    let woCopy = cloneDeep(zWorkorderObj);
    woCopy.workorderLines.splice(index, 1);
    // log("res", WO);
    _zSetWorkorderObj(woCopy);
    dbSetOpenWorkorderItem(woCopy);
  }

  function modQtyPressed(inventoryItem, workorderLine, option, idx) {
    let newWOLine = cloneDeep(workorderLine);
    let wo = cloneDeep(zWorkorderObj);
    if (option === "up") {
      newWOLine.qty = newWOLine.qty + 1;
    } else {
      let qty = newWOLine.qty - 1;
      if (qty <= 0) return;
      newWOLine.qty = qty;
    }
    if (newWOLine.discountObj.name) {
      let discountObj = applyDiscountToWorkorderItem(
        newWOLine.discountObj,
        newWOLine,
        inventoryItem
      );
      if (discountObj.newPrice > 0) newWOLine.discountObj = discountObj;
    }
    wo.workorderLines[idx] = newWOLine;

    _zSetWorkorderObj(wo);
    dbSetOpenWorkorderItem(wo);
  }

  function setWorkorderLineItem(workorderLine) {
    let idx = zWorkorderObj.workorderLines.findIndex(
      (o) => o.id == workorderLine.id
    );
    let wo = cloneDeep(zWorkorderObj);
    wo[idx] = workorderLine;
    _zSetWorkorderObj(wo);
  }

  function applyDiscount(inventoryItem, workorderLine, discountObj, index) {
    let newDiscountObj = DISCOUNT_OBJ_PROTO;
    if (discountObj.value) {
      newDiscountObj = applyDiscountToWorkorderItem(
        discountObj,
        workorderLine,
        inventoryItem
      );
      if (newDiscountObj.newPrice <= 0) return;
    }

    // log(discountObj);
    let woCopy = cloneDeep(zWorkorderObj);
    woCopy.workorderLines[index].discountObj = newDiscountObj;
    _zSetWorkorderObj(woCopy);
    dbSetOpenWorkorderItem(woCopy);
  }

  function splitItems(inventoryItem, workorderLine, index) {
    let wo = cloneDeep(zWorkorderObj);
    let num = workorderLine.qty;
    for (let i = 0; i <= num - 1; i++) {
      let newLine = cloneDeep(workorderLine);
      newLine.qty = 1;
      newLine.id = generateRandomID();
      if (newLine.discountObj.name) {
        let discountObj = applyDiscountToWorkorderItem(
          newLine.discountObj,
          newLine,
          inventoryItem
        );
        if (discountObj.newPrice > 0) newLine.discountObj = discountObj;
      }
      if (i === 0) {
        wo.workorderLines[index] = newLine;
        continue;
      }
      wo.workorderLines.splice(index + 1, 0, newLine);
      // wo.workorderLines.push(newLine);
    }
    _zSetWorkorderObj(wo);
    dbSetOpenWorkorderItem(wo);
  }

  if (
    !zWorkorderObj?.workorderLines ||
    zWorkorderObj?.workorderLines.length == 0
  ) {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            textAlign: "center",
            opacity: 0.05,
            color: "black",
            fontSize: 120,
          }}
        >
          {zWorkorderObj ? "Empty Workorder" : "New \nCustomer"}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "flex-start",
      }}
    >
      <FlatList
        style={{ marginVertical: 3, marginRight: 5 }}
        data={zWorkorderObj.workorderLines}
        keyExtractor={(item, idx) => idx}
        renderItem={(item) => {
          // log("index", idx.);
          let idx = item.index;
          item = item.item;
          let invItem = zInventoryArr.find((obj) => obj.id === item.invItemID);
          return (
            <LineItemComponent
              __deleteWorkorderLine={() =>
                _zExecute(() => deleteWorkorderLineItem())
              }
              // __setWorkorderObj={_zSetWorkorderObj}
              __setWorkorderLineItem={() =>
                _zExecute(() => setWorkorderLineItem())
              }
              inventoryItem={invItem}
              workorderLine={item}
              zWorkorderObj={zWorkorderObj}
              __splitItems={splitItems}
              __modQtyPressed={() => _zExecute(() => modQtyPressed())}
              index={idx}
              applyDiscount={() => _zExecute(() => applyDiscount())}
              zSettingsObj={zSettingsObj}
              ssButtonsRowID={sButtonsRowID}
              __setButtonsRowID={_setButtonsRowID}
            />
          );
        }}
      />
    </View>
  );
};

export const LineItemComponent = ({
  inventoryItem = INVENTORY_ITEM_PROTO,
  workorderLine = WORKORDER_ITEM_PROTO,
  zSettingsObj = SETTINGS_PROTO,
  __deleteWorkorderLine,
  __modQtyPressed,
  __setWorkorderObj,
  __setWorkorderLineItem,
  // __
  __splitItems,
  index,
  applyDiscount,
  ssButtonsRowID,
  __setButtonsRowID,
}) => {
  // setters ///////////////////////////////////////////////////////////

  // getters //////////////////////////////////////////////////////////

  //////////////////////////////////////////////////////////////////////
  const [sTempQtyVal, _setTempQtyVal] = useState(null);
  const [sShowDiscountModal, _setShowDiscountModal] = useState(null);
  const ref = useRef();

  function formatDiscountsArr(discountArr) {
    if (discountArr[discountArr.length - 1].name === "No Discount")
      return discountArr;
    discountArr.push({
      name: "No Discount",
    });
    return discountArr;
  }

  // clog("item", workorderLine);
  // return null;
  return (
    <View
      style={{
        width: "100%",
        backgroundColor: "whitesmoke",
        marginVertical: 1,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          alignItems: "center",
          backgroundColor: "whitesmoke",
          paddingVertical: 0,
          paddingHorizontal: 2,
          marginVertical: 1,
          marginHorizontal: 5,
        }}
      >
        <View
          style={{
            width: "73%",
            justifyContent: "flex-start",
            flexDirection: "row",
            // backgroundColor: "green",
          }}
        >
          <Button
            onPress={() => __deleteWorkorderLine(index)}
            text={"X"}
            buttonStyle={{
              width: null,
              height: null,
              backgroundColor: "transparent",
              // shadowOffset: { width: 1, height: 1 },
              marginHorizontal: 1,
              marginRight: 10,
              padding: 0,
              borderRadius: 5,
            }}
            shadow={false}
            textStyle={{ color: "red", fontSize: 17, fontWeight: 600 }}
          />
          <View>
            {workorderLine.discountObj.name ? (
              <Text style={{ color: "magenta" }}>
                {workorderLine.discountObj.name || "discount goes here"}
              </Text>
            ) : null}
            <Text
              style={{
                fontSize: 15,
                color: Colors.darkText,
                fontWeight: "500",
              }}
            >
              {inventoryItem.formalName}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <TextInput
                numberOfLines={4}
                style={{ outlineWidth: 0, color: "dimgray" }}
                onChangeText={(val) => {
                  let line = structuredClone(workorderLine);
                  line.intakeNotes = val;
                  __setWorkorderLineItem(line);
                }}
                placeholder="Intake and service notes..."
                placeholderTextColor={"gray"}
                value={workorderLine.intakeNotes}
              />
            </View>
          </View>
        </View>
        <View
          style={{
            width: "27%",
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            height: "100%",
            // backgroundColor: "green",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              // marginRight: 5,
            }}
          >
            <Button
              onPress={() =>
                __modQtyPressed(inventoryItem, workorderLine, "up", index)
              }
              buttonStyle={{ borderRadius: 3, width: null, height: null }}
              textStyle={{ color: Colors.tabMenuButton, fontSize: 20 }}
              text={"\u2B06"}
              shadow={false}
            />
            <Button
              onPress={() =>
                __modQtyPressed(inventoryItem, workorderLine, "down", index)
              }
              buttonStyle={{ borderRadius: 3, width: null, height: null }}
              textStyle={{ color: Colors.tabMenuButton, fontSize: 20 }}
              text={"\u2B07"}
              shadow={false}
            />
            <TextInput
              style={{
                marginLeft: 4,
                fontSize: 18,
                fontWeight: 700,
                width: 35,
                textAlign: "center",
                color: "dimgray",
                paddingVertical: 3,
                borderWidth: workorderLine.qty === 0 ? 3 : 1,
                borderColor: workorderLine.qty === 0 ? "red" : "lightgray",
                outlineWidth: 0,
              }}
              value={sTempQtyVal === "" ? sTempQtyVal : workorderLine.qty}
              onChangeText={(val) => {
                if (isNaN(val) || val < 0) return;
                if (val === "") {
                  _setTempQtyVal("");
                  val = 0;
                } else {
                  _setTempQtyVal(null);
                }
                let line = structuredClone(workorderLine);
                line.qty = val;
                __setWorkorderLineItem(line);
              }}
            />
          </View>
          <View
            style={{
              alignItems: "flex-end",
              minWidth: 80,
              // backgroundColor: "green",
              marginRight: 1,
            }}
          >
            <Text
              style={{
                paddingHorizontal: 0,
              }}
            >
              {"$ " + trimToTwoDecimals(inventoryItem.price)}
            </Text>
            {workorderLine.discountObj.savings ? (
              <Text
                style={{
                  paddingHorizontal: 5,
                  minWidth: 30,
                  color: "magenta",
                }}
              >
                {"$ -" + workorderLine.discountObj.savings}
              </Text>
            ) : null}
            {workorderLine.discountObj.newPrice ? (
              <Text
                style={{
                  fontWeight: "bold",
                  minWidth: 30,
                  marginTop: 7,
                  paddingHorizontal: 5,
                  color: Colors.darkText,
                }}
              >
                {"$ " + workorderLine.discountObj.newPrice}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginLeft: 3,
            }}
          >
            <Button
              onPress={() =>
                __setButtonsRowID(
                  workorderLine.id === ssButtonsRowID ? null : workorderLine.id
                )
              }
              mouseOverOptions={{
                enable: true,
                highlightColor: Colors.tabMenuButton,
              }}
              shadow={false}
              text={ssButtonsRowID === workorderLine.id ? "-" : "+"}
              textStyle={{
                color:
                  ssButtonsRowID === workorderLine.id
                    ? "red"
                    : Colors.mainBackground,
                fontSize: 28,
              }}
              buttonStyle={{
                width: 25,
                marginRight: 10,
                alignItems: "center",
                borderRadius: 3,
                marginLeft: 2,
              }}
            />
          </View>
        </View>
      </View>
      {ssButtonsRowID === workorderLine.id ? (
        <View
          style={{
            flexDirection: "row",
            // backgroundColor: "lightgray",
            justifyContent: "flex-end",
            marginBottom: 2,
            width: "100%",
          }}
        >
          {workorderLine.qty > 1 ? (
            <Button
              textStyle={{ fontSize: 13 }}
              onPress={() => {
                __splitItems(inventoryItem, workorderLine, index);
                _setShowButtonsRow(null);
              }}
              text={"Split Items"}
              buttonStyle={{
                backgroundColor: Colors.mainBackground,
                shadowOffset: { width: 1, height: 1 },
                marginHorizontal: 2,
                width: null,
                height: null,
              }}
            />
          ) : null}
          <ScreenModal
            buttonStyle={{
              backgroundColor: Colors.mainBackground,
              shadowOffset: { width: 1, height: 1 },
              marginHorizontal: 2,
            }}
            buttonTextStyle={{
              fontSize: 11,
            }}
            // modalVisible={}
            buttonLabel="Discount"
            showButtonIcon={false}
            modalVisible={sShowDiscountModal === workorderLine.id}
            handleOuterClick={() => _setShowDiscountModal(null)}
            handleButtonPress={() => _setShowDiscountModal(workorderLine.id)}
            modalCoordinateVars={{ x: -0, y: 30 }}
            ref={ref}
            Component={() => {
              return (
                <View>
                  <FlatList
                    data={formatDiscountsArr(zSettingsObj.discounts)}
                    keyExtractor={(i, x) => x}
                    renderItem={(item) => {
                      let idx = item.index;
                      item = item.item;
                      return (
                        <Button
                          buttonStyle={{
                            borderTopWidth: idx === 0 ? 0 : 1,
                            borderColor: "whitesmoke",
                            width: null,
                            height: null,
                            paddingVertical: 10,
                            backgroundColor: "lightgray",
                          }}
                          onPress={() => {
                            applyDiscount(
                              inventoryItem,
                              workorderLine,
                              item,
                              index
                            );
                            _setShowDiscountModal(null);
                          }}
                          shadow={false}
                          text={item.name}
                        />
                      );
                    }}
                  />
                </View>
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
};
