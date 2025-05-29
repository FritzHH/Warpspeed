/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { dim, log, trimToTwoDecimals, useInterval } from "../../utils";
import { TabMenuDivider as Divider, CheckBox } from "../../components";
import { Colors } from "../../styles";
import { INFO_COMPONENT_NAMES, TAB_NAMES } from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../stores";
import { dbGetCustomerObj } from "../../db_calls";

export function WorkordersComponent({}) {
  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  ///
  const _zSetOpenWorkorder = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetPreviewObj = useWorkorderPreviewStore(
    (state) => state.setPreviewObj
  );
  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  ///////////////////////////////////////////////////////////////////////////////////
  const [sAllowPreview, _setAllowPreview] = useState(true);

  function workorderSelected(obj) {
    obj = { ...obj };
    dbGetCustomerObj(obj.customerID).then((custObj) => {
      _zSetCurrentCustomer(custObj);
      // log("cust obj", custObj);
    });
    _zSetOpenWorkorder(obj);
    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  useEffect(() => {
    // log("use effect workorders component");

    return () => {
      // log("closing it");
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
      }}
    >
      <CheckBox
        isChecked={sAllowPreview}
        onCheck={() => _setAllowPreview(!sAllowPreview)}
        viewStyle={{ alignSelf: "flex-end" }}
        text={"Preview On"}
        buttonStyle={{
          width: 15,
          height: 15,
          marginRight: 20,
          borderWidth: 1,
          borderColor: "dimgray",
        }}
        outerButtonStyle={{}}
        textStyle={{ color: "lightgray", marginRight: 10 }}
      />
      <FlatList
        data={zOpenWorkordersArr}
        keyExtractor={(item, index) => index}
        renderItem={(item) => {
          item = item.item;
          return (
            <RowItemComponent
              ssAllowPreview={sAllowPreview}
              _zSetPreviewObj={_zSetPreviewObj}
              onWorkorderSelected={workorderSelected}
              itemObj={item}
            />
          );
        }}
      />
    </View>
  );
}

function RowItemComponent({
  itemObj,
  ssAllowPreview,
  onWorkorderSelected,
  _zSetPreviewObj,
}) {
  const [sLastHoverInsideMillis, _setLastHoverInsideMilles] = useState(
    new Date().getTime() * 2
  );

  /////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////
  return (
    <View>
      <TouchableOpacity
        onMouseOver={() => {
          if (!ssAllowPreview) return;
          _zSetPreviewObj(itemObj);
        }}
        onMouseLeave={() => {
          if (!ssAllowPreview) return;
          _zSetPreviewObj(null);
        }}
        onPress={() => {
          _zSetPreviewObj(null);
          onWorkorderSelected(itemObj);
        }}
      >
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            marginTop: 4,
          }}
        >
          <View style={{ marginVertical: 5 }}>
            <Text>{itemObj.brand || "Brand goes here"}</Text>
            <Text>{itemObj.description || "Descripion goes here"}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}
