import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, log, trimToTwoDecimals, useInterval } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  ScreenModal,
  CustomerInfoComponent,
  Button,
  CheckBox,
} from "../../components";
import { Colors } from "../../styles";
import {
  bike_colors_db,
  bike_brands_db,
  CUSTOMER_PROTO,
  bike_descriptions_db,
  discounts_db,
  part_sources_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  bike_colors_arr_db,
  FOCUS_NAMES,
  TAB_NAMES,
  INFO_COMPONENT_NAMES,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";

export function WorkordersComponent({
  ssWorkordersArr,
  __setWorkorderPreviewObject,
  __setWorkorderObj,
  __setOptionsTabName,
  __setInfoComponentName,
}) {
  const [sAllowPreview, _setAllowPreview] = useState(true);

  //////////////////////////////////
  //// functions
  /////////////////////////////////

  //////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////
  // log("arr", ssWorkordersArr);
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
        data={ssWorkordersArr}
        keyExtractor={(item, index) => index}
        renderItem={(item) => {
          item = item.item;
          return (
            <RowItemComponent
              ssAllowPreview={sAllowPreview}
              item={item}
              __setWorkorderObj={__setWorkorderObj}
              __setWorkorderPreviewObject={__setWorkorderPreviewObject}
              __setOptionsTabName={__setOptionsTabName}
              __setInfoComponentName={__setInfoComponentName}
            />
          );
        }}
      />
    </View>
  );
}

function RowItemComponent({
  item,
  ssAllowPreview,
  __setWorkorderPreviewObject,
  __setWorkorderObj,
  __setOptionsTabName,
  __setInfoComponentName,
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
          __setWorkorderPreviewObject(item);
        }}
        onMouseLeave={() => {
          __setWorkorderPreviewObject(null);
          if (!ssAllowPreview) return;
        }}
        onPress={() => {
          __setWorkorderPreviewObject(null);
          __setWorkorderObj(item);
          __setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
          __setInfoComponentName(INFO_COMPONENT_NAMES.workorder);
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
            <Text>{item.brand || "Brand goes here"}</Text>
            <Text>{item.description || "Descripion goes here"}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}
