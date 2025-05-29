/*eslint-disable*/
import { View, Text, TextInput, FlatList } from "react-native-web";
import {
  applyDiscountToWorkorderItem,
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
} from "../../data";
import { useRef, useState } from "react";
import { clone, cloneDeep } from "lodash";

export const Items_WorkorderItemsTab = ({
  ssWorkorderObj = WORKORDER_PROTO,
  ssInventoryArr = [],
  __setWorkorderObj,
}) => {
  function deleteWorkorderItem(workorderItem) {
    // log("incoming", ssWorkorderObj);
    let newLinesArr = ssWorkorderObj.workorderLines.filter(
      (line) => line.id != workorderItem.id
    );
    let WO = cloneDeep(ssWorkorderObj);
    WO.workorderLines = newLinesArr;
    // WO.itemIdArr = newIDArr;
    // log("res", WO);
    __setWorkorderObj(WO);
  }
  //
  if (ssWorkorderObj.workorderLines.length == 0) {
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
          Empty Workorder
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
        data={ssWorkorderObj.workorderLines}
        keyExtractor={(item, idx) => idx}
        renderItem={(item) => {
          item = item.item;
          // log("item", item);
          let invItem = ssInventoryArr.find((obj) => obj.id === item.itemID);
          // log("inv item", invItem);
          return (
            <WorkorderItemComponent
              __deleteWorkorderLine={deleteWorkorderItem}
              __setWorkorderObj={__setWorkorderObj}
              inventoryItem={invItem}
              workorderLine={item}
              ssWorkorderObj={ssWorkorderObj}
            />
          );
        }}
      />
    </View>
  );
};

export const WorkorderItemComponent = ({
  inventoryItem = INVENTORY_ITEM_PROTO,
  workorderLine = WORKORDER_ITEM_PROTO,
  ssWorkorderObj = WORKORDER_PROTO,
  __setWorkorderObj,
  __deleteWorkorderLine,
}) => {
  const [sShowServiceNotes, _setShowServiceNotes] = useState(
    workorderLine.serviceNotes.length > 0
  );
  const [sTempQtyVal, _setTempQtyVal] = useState(null);
  const [sDiscountedPrice, _setDiscountedPrice] = useState(null);
  const [sDiscountSavings, _setDiscountSavings] = useState(null);
  const [sShowButtonsRow, _setShowButtonsRow] = useState(false);

  const ref = useRef();

  function setWorkorderLine(newWorkorderLine) {
    let newArr = ssWorkorderObj.workorderLines.map((oldLine) => {
      if (oldLine.id === newWorkorderLine.id) return newWorkorderLine;
      return oldLine;
    });
    // log("new arr", newArr);

    let newObj = structuredClone(ssWorkorderObj);
    newObj.workorderLines = newArr;
    __setWorkorderObj(newObj);
  }

  function splitItems() {
    let WO = cloneDeep(ssWorkorderObj);
    let numItems = workorderLine.qty;
    let arr = WO.workorderLines.filter(
      (item) => item.itemID != workorderLine.itemID
    );
    for (let i = 0; i <= numItems - 1; i++) {
      if (i > 0) WO.itemIdArr.push(workorderLine.itemID);
      arr.push({ ...workorderLine, qty: 1, id: generateRandomID() });
    }
    // log("arr", arr);
    WO.workorderLines = arr;
    let newWO = cloneDeep(WO);
    __setWorkorderObj(newWO);
  }

  function applyDiscount(discountObj) {
    let resObj = applyDiscountToWorkorderItem(
      discountObj,
      workorderLine,
      inventoryItem
    );
    _setDiscountSavings(resObj.savings);
    _setDiscountedPrice(resObj.newPrice);
  }
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
            onPress={() => __deleteWorkorderLine(workorderLine)}
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
              {inventoryItem.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <TextInput
                numberOfLines={4}
                style={{ outlineWidth: 0, color: "dimgray" }}
                onChangeText={(val) => {
                  let line = structuredClone(workorderLine);
                  line.intakeNotes = val;
                  setWorkorderLine(line);
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
              onPress={() => {
                let line = structuredClone(workorderLine);
                line.qty = line.qty + 1;
                setWorkorderLine(line);
              }}
              buttonStyle={{ borderRadius: 3, width: null, height: null }}
              textStyle={{ color: Colors.tabMenuButton, fontSize: 20 }}
              text={"\u2B06"}
              shadow={false}
            />
            <Button
              onPress={() => {
                let line = structuredClone(workorderLine);
                line.qty = line.qty - 1;
                if (Number(line.qty) < 1) return;
                setWorkorderLine(line);
              }}
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
                setWorkorderLine(line);
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
            {sDiscountSavings ? (
              <Text
                style={{
                  paddingHorizontal: 5,
                  minWidth: 30,
                  color: "magenta",
                }}
              >
                {"$ -" + sDiscountSavings}
              </Text>
            ) : null}
            {sDiscountedPrice ? (
              <Text
                style={{
                  fontWeight: "bold",
                  minWidth: 30,
                  marginTop: 7,
                  paddingHorizontal: 5,
                  color: Colors.darkText,
                }}
              >
                {"$ " + sDiscountedPrice}
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
              onPress={() => _setShowButtonsRow(!sShowButtonsRow)}
              mouseOverOptions={{
                enable: true,
                highlightColor: Colors.tabMenuButton,
              }}
              shadow={false}
              text={!sShowButtonsRow ? "+" : "-"}
              textStyle={{
                color: !sShowButtonsRow ? Colors.mainBackground : "red",
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
      {sShowButtonsRow ? (
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
              onPress={() => splitItems()}
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
              // width: null,
              // height: null,
              backgroundColor: Colors.mainBackground,
              shadowOffset: { width: 1, height: 1 },
              marginHorizontal: 2,
              // borderRadius: 4,
            }}
            buttonTextStyle={{
              // color: "whitesmoke",
              // fontWeight: 600,
              fontSize: 13,
              // textAlignVertical: "center",
              // height: 27,
              // width: 27,
            }}
            buttonLabel="Discount"
            showButtonIcon={false}
            // handleButtonPress={() => {}}
            // showOuterModal={true}
            handleModalActionInternally={true}
            outerModalStyle={{
              width: null,
              height: null,
              backgroundColor: "transparent",
            }}
            modalCoordinateVars={{ x: -100, y: 30 }}
            ref={ref}
            Component={() => {
              return (
                <View>
                  <FlatList
                    data={discounts_db}
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
                          onPress={() => applyDiscount(item)}
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
