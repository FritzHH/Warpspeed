/* eslint-disable */

import { View, Text, TextInput } from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  TabMenuDivider as Divider,
  ModalDropdown,
  // TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  ScreenModal,
  CustomerInfoScreenModalComponent,
  Button,
  SHADOW_RADIUS_NOTHING,
  SHADOW_RADIUS_PROTO,
  LoginScreenModalComponent,
} from "../../components";
import { Colors } from "../../styles";
import {
  SETTINGS_PROTO,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
  TAB_NAMES,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useRef } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../stores";
import { dbSetCustomerObj, dbSetOpenWorkorderItem } from "../../db_calls";

export const Info_WorkorderComponent = ({}) => {
  // setters /////////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetCustomerObj = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zExecute = useLoginStore((state) => state.execute);

  // getters ///////////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  let zCustomerObj = CUSTOMER_PROTO;
  zCustomerObj = useCurrentCustomerStore((state) => state.getCustomerObj());
  var zSettingsObj = SETTINGS_PROTO;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());

  ////////////////////////////////////////////////////////////////////
  const [sShowCustomerInfoModal, _setShowCustomerInfoModal] =
    React.useState(false);
  const [sInfoTextFocus, _setInfoTextFocus] = React.useState(null);
  //
  function setWorkorderObj(obj) {
    _zSetWorkorderObj(obj);
    dbSetOpenWorkorderItem(obj);
  }

  function setCustomerObj(obj) {
    _zSetCustomerObj(obj);
    dbSetCustomerObj(obj);
    // });
  }

  function setBikeColor(incomingColorVal) {
    let foundColor = false;
    let newColorObj = {};
    zSettingsObj.bikeColors.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = { ...bikeColorObj };
      }
    });
    if (!foundColor) {
      // log("not found", incomingColorVal);
      // newColorObj.label = newColorObj.label;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }

    // log("setting", newColorObj);
    let wo = { ...zWorkorderObj };
    wo.color = newColorObj;
    setWorkorderObj(wo);
  }

  function closeModal() {
    _setShowCustomerInfoModal(false);
    setTimeout(() => {
      _setShowCustomerInfoModal(true);
    }, 300);
    // _setS;
  }

  function getBackgroundColor(workorderObj) {
    let backgroundColor;
    let textColor;
    let color = zSettingsObj.statusGroups.find((o) => {
      let members = o.members;

      members.forEach((member) => {
        if (member === zWorkorderObj.status) {
          textColor = o.textColor;
          backgroundColor = o.color;
        }
      });
      return backgroundColor;
    });
    // log(backgroundColor, textColor);
    return { backgroundColor, textColor };
  }

  return (
    <View style={{ height: "100%", width: "100%", paddingRight: 7 }}>
      <LoginScreenModalComponent modalVisible={zShowLoginScreen} />

      <View
        style={{
          flexDirection: "row",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ScreenModal
          showShadow={false}
          // showButtonIcon={false}
          modalVisible={sShowCustomerInfoModal}
          showOuterModal={true}
          buttonLabel={
            zWorkorderObj.customerFirst + " " + zWorkorderObj.customerLast
          }
          buttonStyle={{
            alignItems: "flex-start",
            justifyContent: "center",
            paddingLeft: 0,
            paddingVertical: 5,
            paddingRight: 10,
          }}
          mouseOverOptions={{ highlightColor: "transparent" }}
          handleButtonPress={() =>
            _zExecute(() => _setShowCustomerInfoModal(true))
          }
          buttonTextStyle={{
            fontSize: 25,
            color: Colors.lightText,
          }}
          shadowProps={{ shadowColor: "transparent" }}
          handleOuterClick={() => _setShowCustomerInfoModal(false)}
          Component={() => (
            <CustomerInfoScreenModalComponent
              sCustomerInfo={zCustomerObj}
              __setCustomerInfo={setCustomerObj}
              handleButton1Press={() => _setShowCustomerInfoModal(false)}
              button1Text={"Close"}
              ssInfoTextFocus={sInfoTextFocus}
              __setInfoTextFocus={_setInfoTextFocus}
            />
          )}
        />

        <Button
          onPress={() => {
            _zSetCustomerObj(null);
            _zSetWorkorderObj(null);
            _zSetInfoTabName(TAB_NAMES.infoTab.customer);
            _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders);
          }}
          text={"+"}
          shadow={false}
          buttonStyle={{ width: null }}
          textStyle={{
            padding: 5,
            fontSize: 50,
            color: "red",
          }}
        />
      </View>
      <View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          {zCustomerObj.cell.length > 0 ? (
            <Text style={{ color: Colors.darkText }}>
              {"Cell:  " + zCustomerObj.cell}
            </Text>
          ) : null}
          {zCustomerObj.landline.length > 0 ? (
            <Text style={{ color: Colors.darkText }}>
              {"Land:  " + zCustomerObj.landline}
            </Text>
          ) : null}
          {zCustomerObj.contactRestriction === "CALL" ? (
            <Text style={{ color: Colors.darkText }}>CALL ONLY</Text>
          ) : null}
          {zCustomerObj.contactRestriction === "EMAIL" ? (
            <Text style={{ color: Colors.darkText }}>EMAIL ONLY</Text>
          ) : null}
        </View>

        {/* <View
          style={{
            marginTop: 15,
            width: "100%",
            // backgroundColor: "blue",
            flexDirection: "row",
            justifyItems: "space-between",
            alignItems: "center",
          }}
        >
          <Text>Number of items: </Text>
          <TextInputOnMainBackground
            value={zWorkorderObj.numItems || 1}
            style={{ width: 25, margin: 0 }}
          />
        </View> */}
        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
          }}
        >
          <View style={{}}>
            <TextInputOnMainBackground
              placeholderText={"Brand"}
              style={{ marginRight: 5 }}
              value={zWorkorderObj.brand}
              onTextChange={(val) => {
                // log(val);
                let wo = cloneDeep(zWorkorderObj);
                wo.brand = val;
                setWorkorderObj(wo);
              }}
            />
          </View>
          <View
            style={{
              // marginTop: 10,
              width: "50%",
              flexDirection: "row",
              paddingLeft: 5,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: "48%",
                height: "100%",
                justifyContent: "center",
                // marginTop: 10,
              }}
            >
              <ModalDropdown
                itemListStyle={{ width: 80 }}
                modalStyle={{
                  alignSelf: "flex-start",
                  marginVertical: "2%",
                  width: "30%",
                }}
                buttonStyle={{
                  width: "100%",
                  height: "100%",
                  // width: "25%",
                }}
                buttonLabel={zSettingsObj.bikeBrandsName}
                data={zSettingsObj.bikeBrands}
                currentSelectionName={zWorkorderObj.brand}
                onSelect={(val) => {
                  let wo = cloneDeep(zWorkorderObj);
                  wo.brand = val;
                  _zExecute(() => setWorkorderObj(wo));
                }}
                onRemoveSelection={() => {
                  let wo = cloneDeep(zWorkorderObj);
                  wo.brand = "";
                  _zExecute(() => setWorkorderObj(wo));
                }}
              />
            </View>
            <View style={{ width: 5 }} />
            <View style={{ width: "48%" }}>
              <ModalDropdown
                itemListStyle={{ width: 100 }}
                modalStyle={{
                  alignSelf: "flex-start",
                  marginVertical: "2%",
                  width: "30%",
                }}
                buttonStyle={{
                  width: "100%",
                }}
                data={zSettingsObj.bikeOptionalBrands}
                buttonLabel={zSettingsObj.bikeOptionalBrandsName}
                closeButtonText={"Close"}
                currentSelectionName={zWorkorderObj.brand}
                onSelect={(val) => {
                  let wo = cloneDeep(zWorkorderObj);
                  wo.brand = val;
                  _zExecute(() => setWorkorderObj(wo));
                }}
                onRemoveSelection={() => {
                  let wo = cloneDeep(zWorkorderObj);

                  wo.brand = "";
                  _zExecute(() => setWorkorderObj(wo));
                }}
              />
            </View>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-start",
            width: "100%",
            alignItems: "center",
            marginTop: 5,
          }}
        >
          <TextInputOnMainBackground
            placeholderText={"Model/Description"}
            style={{ marginRight: 2 }}
            value={zWorkorderObj.description}
            onTextChange={(val) => {
              let wo = cloneDeep(zWorkorderObj);

              wo.description = val;
              _zExecute(() => setWorkorderObj(wo));
            }}
          />
          <ModalDropdown
            itemListStyle={{ width: 100 }}
            modalStyle={{
              alignSelf: "flex-start",
              marginVertical: "2%",
              width: "30%",
            }}
            data={zSettingsObj.bikeDescriptions}
            buttonLabel={"Descriptions"}
            closeButtonText={"Close"}
            buttonStyle={{ width: 90 }}
            removeButtonText={"Remove"}
            currentSelectionName={zWorkorderObj.description}
            onSelect={(val) => {
              let wo = cloneDeep(zWorkorderObj);
              wo.description = val;
              _zExecute(() => setWorkorderObj(wo));
            }}
            onRemoveSelection={() => {
              let wo = cloneDeep(zWorkorderObj);
              wo.description = "";
              _zExecute(() => setWorkorderObj(wo));
            }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
            marginTop: 5,
          }}
        >
          <TextInputOnMainBackground
            placeholderText={"Color"}
            value={zWorkorderObj.color.label}
            style={{
              marginRight: 2,
              backgroundColor: zWorkorderObj.color.backgroundColor,
              color: zWorkorderObj.color.textColor,
            }}
            onTextChange={(val) => {
              _zExecute(() => setBikeColor(val));
            }}
          />
          <ModalDropdown
            itemListStyle={{
              width: 120,
            }}
            modalStyle={{
              alignSelf: "flex-start",
              marginVertical: "2%",
              width: "30%",
            }}
            data={zSettingsObj.bikeColors}
            closeButtonText={"Close"}
            buttonStyle={{ width: 90 }}
            removeButtonText={"Remove Color"}
            buttonLabel={"Colors"}
            currentSelection={zWorkorderObj.color}
            onSelect={(val) => {
              let wo = cloneDeep(zWorkorderObj);

              wo.color = val;
              _zExecute(() => setWorkorderObj(wo));
            }}
            onRemoveSelection={() => {
              let newObj = cloneDeep(zWorkorderObj);
              newObj.color = {
                label: "",
                backgroundColor: "",
                textColor: "",
              };
              _zExecute(() => setWorkorderObj(newObj));
            }}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
            marginTop: 5,
          }}
        >
          <TextInputOnMainBackground
            placeholderText={"Part Ordered"}
            style={{ marginRight: 2 }}
            value={zWorkorderObj.partOrdered}
            onTextChange={(val) => {
              let wo = cloneDeep(zWorkorderObj);

              wo.partOrdered = val;
              _zExecute(() => setWorkorderObj(wo));
            }}
          />
        </View>

        <View
          style={{
            // marginTop: 8,
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
            marginTop: 5,
          }}
        >
          <TextInputOnMainBackground
            value={zWorkorderObj.partSource}
            placeholderText={"Part Source"}
            style={{ marginRight: 2 }}
            onTextChange={(val) => {
              let wo = cloneDeep(zWorkorderObj);
              wo.partSource = val;
              _zExecute(() => setWorkorderObj(wo));
            }}
          />
          <ModalDropdown
            itemListStyle={{ width: 90 }}
            modalStyle={{
              alignSelf: "flex-start",
              marginVertical: "2%",
              width: "30%",
            }}
            data={zSettingsObj.partSources}
            closeButtonText={"Close"}
            removeButtonText={"Remove"}
            buttonStyle={{ width: 90 }}
            buttonLabel={"Sources"}
            currentSelectionName={zWorkorderObj.partSource}
            onSelect={(val) => {
              let wo = cloneDeep(zWorkorderObj);
              wo.partSource = val;
              _zExecute(() => setWorkorderObj(wo));
            }}
            onRemoveSelection={() => {
              let wo = cloneDeep(zWorkorderObj);
              wo.partSource = "";
              _zExecute(() => setWorkorderObj(wo));
            }}
          />
        </View>

        <ModalDropdown
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          data={zSettingsObj.statuses}
          closeButtonText={"Close"}
          buttonStyle={{
            width: "100%",
            backgroundColor: getBackgroundColor().backgroundColor,
            paddingVertical: 10,
            marginTop: 10,
          }}
          textStyle={{ color: getBackgroundColor().textColor }}
          buttonLabel={zWorkorderObj.status}
          onSelect={(val) => {
            let wo = cloneDeep(zWorkorderObj);
            wo.status = val;
            _zExecute(() => setWorkorderObj(wo));
          }}
        />
      </View>
    </View>
  );
};

const TextInputOnMainBackground = ({
  value,
  onTextChange,
  style = {},
  placeholderText,
}) => {
  return (
    <TextInput
      value={value}
      placeholder={placeholderText}
      placeholderTextColor={"lightgray"}
      style={{
        borderWidth: 2,
        borderColor: "gray",
        color: Colors.darkText,
        paddingVertical: 3,
        paddingHorizontal: 4,
        fontSize: 16,
        outlineWidth: 0,
        // width: "100%",
        // marginVertical: 5,
        ...style,
      }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};
