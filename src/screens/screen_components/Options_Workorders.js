/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { clog, dim, log, trimToTwoDecimals, useInterval } from "../../utils";
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
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../stores";
import { dbGetCustomerObj } from "../../db_calls";

export function WorkordersComponent({}) {
  // getters
  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  // setters
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
  const [sSortedWorkorders, _setSortedWorkorders] = useState([]);

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

  let init = false;
  function sortWorkorders(openWorkordersArr) {
    if (!openWorkordersArr) return [];
    if (!zSettingsObj.statusGroups) return [];
    init = true;
    let statusGroups = zSettingsObj.statusGroups;
    // log(statusGroups);
    let statusGroupsCopy = cloneDeep(statusGroups);
    statusGroupsCopy = statusGroups.map((statusGroup) => ({
      ...statusGroup,
      workorderArr: [],
    }));
    // clog(statusGroupsCopy);
    statusGroups.forEach((statusGroup, idx) => {
      let members = statusGroup.members;
      let workorderMemberArr = [];
      members.forEach((statusMember) => {
        openWorkordersArr.forEach((openWorkorder) => {
          if (openWorkorder.status === statusMember)
            workorderMemberArr.push(openWorkorder);
        });
      });
      let newObj = { ...statusGroup, workorderMemberArr };
      statusGroupsCopy[idx] = newObj;
    });

    let arr = [];
    statusGroupsCopy.forEach((statusGroup) => {
      statusGroup.workorderMemberArr.forEach((workorder) => {
        arr.push({ workorder, backgroundColor: statusGroup.color });
      });
    });
    return arr;
  }

  useEffect(() => {
    sortWorkorders();
  }, [zOpenWorkordersArr, zSettingsObj]);

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
        data={sortWorkorders(zOpenWorkordersArr)}
        keyExtractor={(item, index) => index}
        renderItem={(item) => {
          let workorder = item.item.workorder;
          let backgroundColor = item.item.backgroundColor;
          // item = item.item;
          // clog(item);

          return (
            <RowItemComponent
              ssAllowPreview={sAllowPreview}
              _zSetPreviewObj={_zSetPreviewObj}
              onWorkorderSelected={workorderSelected}
              workorder={workorder}
              backgroundColor={backgroundColor}
            />
          );
        }}
      />
    </View>
  );
}

function RowItemComponent({
  backgroundColor,
  workorder,
  ssAllowPreview,
  onWorkorderSelected,
  _zSetPreviewObj,
}) {
  const [sLastHoverInsideMillis, _setLastHoverInsideMilles] = useState(
    new Date().getTime() * 2
  );
  // log("item", itemObj);
  /////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////
  return (
    <View>
      <TouchableOpacity
        onMouseOver={() => {
          if (!ssAllowPreview) return;
          _zSetPreviewObj(workorder);
        }}
        onMouseLeave={() => {
          if (!ssAllowPreview) return;
          _zSetPreviewObj(null);
        }}
        onPress={() => {
          _zSetPreviewObj(null);
          onWorkorderSelected(workorder);
        }}
      >
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            backgroundColor,
            marginTop: 4,
          }}
        >
          <View style={{ marginVertical: 5 }}>
            <Text>{workorder.brand || "Brand goes here"}</Text>
            <Text>{workorder.description || "Descripion goes here"}</Text>
          </View>
          <View>
            <Text>{workorder.status}</Text>
            {/* <Text>{workorder.status.group}</Text> */}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}
