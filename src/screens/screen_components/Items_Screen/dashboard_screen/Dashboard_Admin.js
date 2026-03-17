/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
} from "react-native-web";
import {
  formatPhoneWithDashes,
  bestForegroundHex,
  checkInputForNumbersOnly,
  clog,
  generateRandomID,
  generateTimesForListDisplay,
  generateUPCBarcode,
  getDayOfWeekFrom0To7Input,
  log,
  gray,
  moveItemInArr,
  NUMS,
  removeDashesFromPhone,
  dollarsToCents,
} from "../../../../utils";
import {
  // useDatabaseStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../../../stores";
import {
  Button,
  Button_,
  CheckBox_,
  DropdownMenu,
  Image_,
  ModalDropdown,
  NumberSpinner_,
  ScreenModal,
  TextInput_,
  TimeSpinner,
  Tooltip,
} from "../../../../components";
import { cloneDeep, set, debounce } from "lodash";
import { Children, useEffect, useRef, useState } from "react";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import { DISCOUNT_TYPES, PERMISSION_LEVELS } from "../../../../constants";
import { APP_USER, INVENTORY_ITEM_PROTO, CUSTOMER_PROTO, WORKORDER_PROTO, WORKORDER_ITEM_PROTO, COLORS } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";
import { useCallback } from "react";
import { ColorWheel } from "../../../../ColorWheel";
import { SalesReportsModal } from "../../modal_screens/SalesReports";
import { dbSaveInventoryItem, dbSaveCustomer, dbSaveOpenWorkorder, dbClearCollection, dbSaveSettingsField } from "../../../../db_calls_wrapper";
import { lightspeedInitiateAuthCallable, lightspeedCheckConnectionCallable, lightspeedImportDataCallable } from "../../../../db_calls";

const TAB_NAMES = {
  users: "User Control",
  payments: "Payment Processing",
  statuses: "Workorder Statuses",
  lists: "Lists & Options",
  waitTimes: "Wait Times",
  storeInfo: "Store Info",
  quickItems: "Quick Item Buttons",
  sales: "Sales Reports",
  ordering: "Ordering",
  textTemplates: "Text Templates",
  import: "Import",
};

const DROPDOWN_ORDERING_SELECTION_NAMES = {
  importOrder: "Import Order",
  viewPreviousOrders: "View Previous Orders",
};

export function Dashboard_Admin({}) {
  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.settings);

  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalUserObj, _setFacialRecognitionModalUserObj] =
    useState(false);
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState(null);
  const [sShowSalesReportModal, _setShowSalesReportModal] = useState(false);
  const sExpand = useTabNamesStore((state) => state.getDashboardExpand());
  const _setExpand = useTabNamesStore((state) => state.setDashboardExpand);
  const [sOrderingMenuSelectionName, _setOrderingMenuSelectionName] = useState(
    DROPDOWN_ORDERING_SELECTION_NAMES.importOrder
  );

  //////////////////////////////////////////////////////////////////////////

  // Per-field debounced DB saves (500ms). Store updates are immediate.
  const debouncedDBSavesRef = useRef({});
  function debouncedDBSave(fieldName, fieldValue) {
    if (!debouncedDBSavesRef.current[fieldName]) {
      debouncedDBSavesRef.current[fieldName] = debounce((val) => {
        useSettingsStore.getState().setField(fieldName, val);
      }, 500);
    }
    debouncedDBSavesRef.current[fieldName](fieldValue);
  }

  function cancelDebouncedDBSave(fieldName) {
    if (debouncedDBSavesRef.current[fieldName]) {
      debouncedDBSavesRef.current[fieldName].cancel();
    }
  }

  function commitUserInfoChange(userObj, sNewUserObj) {
    let userArr;
    if (sNewUserObj) {
      userArr = [userObj, ...zSettingsObj.users];
    } else {
      userArr = zSettingsObj.users.map((o) => {
        if (o.id === userObj.id) return userObj;
        return o;
      });
    }

    useSettingsStore.getState().setField("users", userArr, false);
    debouncedDBSave("users", userArr);
  }

  function handleRemoveUserPress(userObj) {
    cancelDebouncedDBSave("users");
    let userArr = zSettingsObj.users.filter((o) => o.id != userObj.id);
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleDescriptorCapture(userObj, desc) {
    cancelDebouncedDBSave("users");
    let userArr = zSettingsObj.users.map((o) => {
      if (o.id === userObj.id) {
        return { ...o, faceDescriptor: desc };
      }
      return o;
    });
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleSettingsFieldChange(fieldName, fieldValue) {
    useSettingsStore.getState().setField(fieldName, fieldValue, false);
    debouncedDBSave(fieldName, fieldValue);
  }

  //////////////////////////////////////////////////////////////////////////
  // Main component /////////////////////////////////////////////////////////
  let OuterWrapper = sExpand === TAB_NAMES.quickItems ? View : ScrollView;
  return (
    <OuterWrapper
      style={{
        padding: 0,
        paddingTop: 20,
        flex: sExpand === TAB_NAMES.quickItems ? 1 : undefined,
      }}
    >
      {/**Modals that will appear when user takes an action */}
      {!!sFacialRecognitionModalUserObj && (
        <FaceEnrollModalScreen
          userObj={sFacialRecognitionModalUserObj}
          handleDescriptorCapture={handleDescriptorCapture}
          handleExitPress={() => _setFacialRecognitionModalUserObj(null)}
        />
      )}
      {!!sPunchClockUserObj && (
        <UserClockHistoryModal
          handleExit={() => _setPunchClockUserObj()}
          userObj={sPunchClockUserObj}
        />
      )}
      {!!sShowSalesReportModal && (
        <SalesReportsModal handleExit={() => _setShowSalesReportModal(false)} />
      )}

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 5,
          flex: sExpand === TAB_NAMES.quickItems ? 1 : undefined,
        }}
      >
        {/*********************left-side column container *****************/}
        <View style={{ width: "30%" }}>
          <View
            style={{
              width: "100%",
              alignItems: "flex-start",
              borderRadius: 5,
              paddingRight: 10,
              paddingLeft: 5,
              backgroundColor: C.backgroundListWhite,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              paddingTop: 13,
              paddingBottom: 13,
            }}
          >
            {/************************* settings list names ****************** */}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.quickItems}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.quickItems ? null : TAB_NAMES.quickItems
                )
              }
              text={TAB_NAMES.quickItems}
              icon={ICONS.quickItemButton}
              style={{
                fontWeight: sExpand === TAB_NAMES.quickItems ? 500 : null,
                color: sExpand === TAB_NAMES.quickItems ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.users}
              handleExpandPress={() =>
                _setExpand(sExpand === TAB_NAMES.users ? null : TAB_NAMES.users)
              }
              text={TAB_NAMES.users}
              icon={ICONS.userControl}
              style={{
                fontWeight: sExpand === TAB_NAMES.users ? 500 : null,
                color: sExpand === TAB_NAMES.users ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.payments}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.payments ? null : TAB_NAMES.payments
                )
              }
              text={TAB_NAMES.payments}
              icon={ICONS.paymentProcessing}
              style={{
                fontWeight: sExpand === TAB_NAMES.payments ? 500 : null,

                color: sExpand === TAB_NAMES.payments ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.statuses}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.statuses ? null : TAB_NAMES.statuses
                )
              }
              text={TAB_NAMES.statuses}
              icon={ICONS.workorderStatuses}
              style={{
                fontWeight: sExpand === TAB_NAMES.statuses ? 500 : null,

                color: sExpand === TAB_NAMES.statuses ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.lists}
              handleExpandPress={() =>
                _setExpand(sExpand === TAB_NAMES.lists ? null : TAB_NAMES.lists)
              }
              icon={ICONS.listsAndOptions}
              style={{
                fontWeight: sExpand === TAB_NAMES.lists ? 500 : null,

                color: sExpand === TAB_NAMES.lists ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.lists}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.storeInfo}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.storeInfo ? null : TAB_NAMES.storeInfo
                )
              }
              icon={ICONS.storeInfo}
              style={{
                fontWeight: sExpand === TAB_NAMES.storeInfo ? 500 : null,
                color: sExpand === TAB_NAMES.storeInfo ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.storeInfo}
            />
            <VerticalSpacer />
            {/****************** sales report modal *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.sales}
              handleExpandPress={() => _setShowSalesReportModal(true)}
              style={{
                fontWeight: sExpand === TAB_NAMES.sales ? 500 : null,
                color: sExpand === TAB_NAMES.sales ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.sales}
              icon={ICONS.dollarYellow}
              iconSize={25}
            />
            <VerticalSpacer />
            {/****************** ordering tab***********************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.ordering}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.ordering ? null : TAB_NAMES.ordering
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.ordering ? 500 : null,
                color: sExpand === TAB_NAMES.ordering ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.ordering}
              icon={ICONS.ordering}
            />
            <VerticalSpacer />
            {/****************** text templates tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.textTemplates}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.textTemplates
                    ? null
                    : TAB_NAMES.textTemplates
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.textTemplates ? 500 : null,
                color:
                  sExpand === TAB_NAMES.textTemplates ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.textTemplates}
              icon={ICONS.notes}
            />
            <VerticalSpacer />
            {/****************** import tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.import}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.import ? null : TAB_NAMES.import
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.import ? 500 : null,
                color: sExpand === TAB_NAMES.import ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.import}
              icon={ICONS.importIcon}
            />
          </View>
        </View>

        {/*********************right-side column container****************** */}

        <View
          style={{
            width: "70%",
            alignItems: "center",
            flex: sExpand === TAB_NAMES.quickItems ? 1 : undefined,
          }}
        >
          <Text
            style={{
              borderColor: C.buttonLightGreenOutline,
              color: gray(0.6),
              marginBottom: 10,
              fontSize: 17,
              fontWeight: 500,
            }}
          >
            {sExpand?.toUpperCase()}
          </Text>
          {sExpand === TAB_NAMES.payments && (
            <PaymentProcessingComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.users && (
            <AppUserListComponent
              handleRemoveUserPress={handleRemoveUserPress}
              zSettingsObj={zSettingsObj}
              commitUserInfoChange={commitUserInfoChange}
              _setFacialRecognitionModalUserObj={
                _setFacialRecognitionModalUserObj
              }
              _setPunchClockUserObj={_setPunchClockUserObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.statuses && (
            <WorkorderStatusesComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.lists && (
            <ListOptionsComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.storeInfo && (
            <StoreInfoComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.quickItems && (
            <QuickItemButtonsComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.ordering && (
            <OrderingComponent
              sOrderingMenuSelectionName={sOrderingMenuSelectionName}
              _setOrderingMenuSelectionName={_setOrderingMenuSelectionName}
            />
          )}
          {sExpand === TAB_NAMES.textTemplates && (
            <TextTemplatesComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.import && <ImportComponent />}
        </View>
      </View>
    </OuterWrapper>
  );
}

////////////////////////////////////////////////////////////////////////////////

function VerticalSpacer({ height }) {
  return (
    <View
      style={{
        height: 1,
        marginVertical: 7,
        width: "100%",
        backgroundColor: gray(0.1),
      }}
    />
  );
}

function BoxContainerOuterComponent({ style = {}, children }) {
  return (
    <View
      style={{
        width: "97%",
        alignItems: "center",

        // marginHorizontal: 0,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function MenuListLabelComponent({
  text,
  style = {},
  icon,
  iconSize,
  dropdownLabel,
  handleExpandPress,
  selected,
  dropdownDataArr,
  onDropdownSelect,
}) {
  let ICON_SIZE = 18;
  const [sOpacity, _setOpacity] = useState(1);
  selected ? (icon = ICONS.check) : null;
  return (
    <TouchableOpacity
      onMouseEnter={() => _setOpacity(0.6)}
      onMouseLeave={() => _setOpacity(1)}
      onPress={handleExpandPress}
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
        opacity: sOpacity,
      }}
    >
      {!dropdownDataArr && (
        <Text
          style={{
            fontSize: 16,
            color: gray(0.5),
            fontWeight: "500",
          }}
        >
          {text.toUpperCase()}
        </Text>
      )}
      {!!dropdownDataArr && (
        <DropdownMenu
          buttonStyle={{
            backgroundColor: "transparent",
            paddingHorizontal: 0,
            paddingVertical: 0,
          }}
          itemStyle={{
            width: null,
          }}
          buttonText={dropdownLabel}
          dataArr={dropdownDataArr}
          onSelect={onDropdownSelect}
          buttonTextStyle={{
            fontSize: 15,
            color: gray(0.5),
            textAlign: "left",
            fontWeight: "500",
          }}
        />
      )}
      <Image_ size={iconSize || ICON_SIZE} icon={icon || ICONS.expandGreen} />
    </TouchableOpacity>
  );
}

function BoxContainerInnerComponent({ style = {}, children }) {
  return (
    <View
      style={{
        // width: null,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
        borderRadius: 10,
        alignItems: "flex-end",
        padding: 15,
        borderColore: C.buttonLightGreenOutline,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function BoxButton1({
  label,
  style = {},
  icon,
  iconSize,
  textStyle,
  onPress,
  colorGradientArr,
}) {
  return (
    <Button_
      colorGradientArr={colorGradientArr}
      text={label}
      icon={icon || ICONS.add}
      iconSize={iconSize || 30}
      textStyle={{ fontSize: 14, color: gray(0.6), ...textStyle }}
      buttonStyle={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderRadius: 5,
        backgroundColor: gray(0.2),
        marginBottom: 0,
        ...style,
      }}
      onPress={onPress}
    />
  );
}

function DropdownComponent({
  ref,
  data,
  onSelect,
  textStyle = {},
  buttonStyle = {},
  itemStyle = {},
  itemTextStyle = {},
  label,
  modalCoordX,
  modalCoordY,
  menuMaxHeight,
  centerMenuVertically,
}) {
  return (
    <DropdownMenu
      buttonText={label}
      buttonTextStyle={{ fontSize: 14, ...textStyle }}
      buttonStyle={{
        borderRadius: 5,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        paddingHorizontal: 7,
        paddingVertical: 3,
        ...buttonStyle,
      }}
      itemTextStyle={{ ...itemTextStyle }}
      itemStyle={{ ...itemStyle }}
      onSelect={onSelect}
      dataArr={data}
      ref={ref}
      modalCoordX={modalCoordX}
      modalCoordY={modalCoordY}
      menuMaxHeight={menuMaxHeight}
      centerMenuVertically={centerMenuVertically}
    />
  );
}

////////////////////////////////////////////////////////////////////////////////////

const AppUserListComponent = ({
  zSettingsObj,
  commitUserInfoChange,
  _setFacialRecognitionModalUserObj,
  _setPunchClockUserObj,
  handleRemoveUserPress,
  handleSettingsFieldChange,
}) => {
  const [sEditUserIndex, _setEditUserIndex] = useState(null);
  const [sShowPinIndex, _setShowPinIndex] = useState(false);
  const [sShowWageIndex, _setShowWageIndex] = useState(false);
  const [sNewUserObj, _setNewUserObj] = useState(null);
  const [sExpand, _setExpand] = useState(false);

  const userListItemRefs = useRef([]);

  function handleNewUserPress() {
    let userObj = cloneDeep(APP_USER);
    userObj.id = generateUPCBarcode();
    let role = PERMISSION_LEVELS.user;
    userObj.permissions = role;
    commitUserInfoChange(userObj, true);
    _setEditUserIndex(0);
  }

  return (
    <BoxContainerOuterComponent>
      {/**Flatlist showing all app users, edit functions. sPunchClockUserObj */}
      <BoxContainerInnerComponent
        style={{
          backgroundColor: C.backgroundListWhite,
          // width: "100%",
        }}
      >
        <View style={{ width: "100%", justifyContent: "flex-end" }}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Text
              style={{
                color: C.text,
              }}
            >
              {"Seconds to log user out: "}
            </Text>
            <TextInput
              onChangeText={(val) => {
                handleSettingsFieldChange("activeLoginTimeoutSeconds", val);
              }}
              style={{
                width: 50,
                marginLeft: 10,
                borderColor: C.green,
                borderWidth: 1,
                borderRadius: 5,
                paddingLeft: 3,
                outlineWidth: 0,
                color: C.text,
              }}
              value={zSettingsObj?.activeLoginTimeoutSeconds}
            />
          </View>
        </View>
        <View style={{ justifyContent: "flex-end" }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 10,
            }}
          >
            <Text
              style={{
                // width: "40%",
                color: C.text,
              }}
            >
              {"Hours to lock app: "}
            </Text>
            <TextInput
              onChangeText={(val) => {
                handleSettingsFieldChange("idleLoginTimeoutHours", val);
              }}
              style={{
                width: 50,
                marginLeft: 10,
                borderColor: C.green,
                borderWidth: 1,
                borderRadius: 5,
                paddingLeft: 3,
                color: C.text,
                outlineWidth: 0,
              }}
              value={Math.round(zSettingsObj?.idleLoginTimeoutHours)}
            />
          </View>
          <View style={{ width: "100%", justifyContent: "flex-end" }}>
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <Text
                style={{
                  // width: "40%",
                  color: C.text,
                }}
              >
                {"User login PIN length: "}
              </Text>
              <TextInput
                onChangeText={(val) => {
                  handleSettingsFieldChange("userPinStrength", val);
                }}
                style={{
                  width: 50,
                  marginLeft: 10,
                  borderColor: C.green,
                  borderWidth: 1,
                  borderRadius: 5,
                  paddingLeft: 3,
                  outlineWidth: 0,
                  color: C.text,
                }}
                value={zSettingsObj?.userPinStrength}
              />
            </View>
          </View>
        </View>
        <View
          style={{ width: "100%", justifyContent: "flex-end", marginTop: 10 }}
        >
          <CheckBox_
            buttonStyle={{ justifyContent: "flex-end" }}
            isChecked={zSettingsObj?.lockScreenWhenUserLogsOut}
            text={"Lock screen when user logs out"}
            onCheck={() => {
              handleSettingsFieldChange(
                "lockScreenWhenUserLogsOut",
                !zSettingsObj.lockScreenWhenUserLogsOut
              );
            }}
          />
        </View>
        {/* <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          > */}
        {/* <Button_
            onPress={fillPunchHistory}
            text={"Fill History"}
            buttonStyle={{
              borderRadius: 5,
              padding: 0,
              height: 20,
              backgroundColor: C.buttonLightGreen,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
            }}
            textStyle={{
              fontSize: 14,
              fontColor: C.textMain,
            }}
          /> */}

        {/* </View> */}
        <View
          style={{
            width: "100%",
            alignItems: "flex-start",
          }}
        >
          <BoxButton1
            iconSize={35}
            icon={ICONS.add}
            onPress={handleNewUserPress}
            style={{}}
          />
        </View>
        <View style={{ width: "100%" }}>
          <FlatList
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 5,
                }}
              />
            )}
            style={{ borderRadius: 5 }}
            data={
              zSettingsObj
                ? sNewUserObj
                  ? [sNewUserObj, ...zSettingsObj.users]
                  : zSettingsObj.users
                : []
            }
            renderItem={(obj) => {
              obj = cloneDeep(obj);
              let idx = obj.index;
              let userObj = obj.item;
              let editable = sEditUserIndex === idx;
              return (
                <View
                  ref={(element) => (userListItemRefs.current[idx] = element)}
                  style={{
                    flexDirection: "row",
                    backgroundColor: C.listItemWhite,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 5,
                    padding: 3,
                    paddingRight: 10,
                    opacity: !editable && sEditUserIndex ? 0.3 : 1,
                  }}
                >
                  <View
                    style={{
                      paddingLeft: 0,
                      marginRight: 5,
                      justifyContent: "space-around",
                      width: "22%",
                    }}
                  >
                    <Button_
                      text={sEditUserIndex === idx ? "Close Edit" : "Edit User"}
                      onPress={() => {
                        _setEditUserIndex(sEditUserIndex != null ? null : idx);
                        _setShowPinIndex(null);
                        _setShowWageIndex(null);
                      }}
                      buttonStyle={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        backgroundColor: editable
                          ? C.lightred
                          : C.buttonLightGreen,
                        borderRadius: 5,
                        paddingHorizontal: 0,
                        paddingVertical: 2,
                        width: "100%",
                      }}
                      mouseOverOptions={{ opacity: 0.7 }}
                      textStyle={{
                        color: editable ? C.textWhite : C.text,
                        fontSize: 12,
                      }}
                    />
                    <Button_
                      text={"Face Enroll"}
                      onPress={() => {
                        _setFacialRecognitionModalUserObj(userObj);
                      }}
                      enabled={editable}
                      buttonStyle={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        backgroundColor: C.buttonLightGreen,
                        paddingVertical: 2,

                        paddingHorizontal: 0,
                        marginRight: 4,
                        width: "100%",

                        borderRadius: 5,
                      }}
                      mouseOverOptions={{ opacity: 0.7 }}
                      textStyle={{ fontSize: 12 }}
                    />
                    <Button_
                      text={
                        sEditUserIndex === idx ? "Delete User" : "Punch Clock"
                      }
                      onPress={() => {
                        if (sEditUserIndex === idx) {
                          handleRemoveUserPress(userObj);
                        } else {
                          _setPunchClockUserObj(userObj);
                        }
                      }}
                      mouseOverOptions={{ opacity: 0.7 }}
                      buttonStyle={{
                        borderWidth: 1,
                        paddingVertical: 2,

                        borderColor: C.buttonLightGreenOutline,
                        backgroundColor: C.buttonLightGreen,
                        borderRadius: 5,
                        paddingHorizontal: 0,
                        width: "100%",
                      }}
                      textStyle={{ fontSize: 12 }}
                    />
                  </View>
                  <View
                    style={{
                      justifyContent: "center",
                      // backgroundColor: "red",
                      marginTop: 2,
                      width: "78%",
                      // paddingRight: 5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        // width: "100%",
                        // backgroundColor: "red",
                      }}
                    >
                      <TextInput
                        value={userObj.first}
                        placeholder="First name"
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          padding: 1,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: "49%",
                          // marginRight: 10,
                          borderWidth: 1,
                          fontSize: 14,
                          height: 25,
                        }}
                        onChangeText={(value) => {
                          userObj.first = value;
                          commitUserInfoChange(userObj);
                        }}
                      />
                      <TextInput
                        value={userObj.last}
                        onChangeText={(value) => {
                          userObj.last = value;
                          commitUserInfoChange(userObj);
                        }}
                        placeholder="Last name"
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          // paddingHorizontal: 2,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: "49%",
                          // marginRight: 10,
                          borderWidth: 1,
                          fontSize: 14,
                          height: 25,
                        }}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        width: "100%",
                        alignItems: "center",
                        marginTop: 7,
                      }}
                    >
                      <TextInput
                        value={formatPhoneWithDashes(userObj.phone)}
                        onChangeText={(value) => {
                          let val = removeDashesFromPhone(value);
                          userObj.phone = val;
                          commitUserInfoChange(userObj);
                        }}
                        placeholder="Phone num."
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          // marginTop: 5,
                          padding: 1,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: "49%",
                          // marginRight: 10,
                          borderWidth: 1,
                          height: 25,

                          fontSize: 14,
                        }}
                      />
                      <View style={{ width: "49%", alignItems: "center" }}>
                        <DropdownMenu
                          enabled={editable}
                          ref={userListItemRefs.current[idx]}
                          dataArr={Object.values(PERMISSION_LEVELS).map(
                            (o) => o.name
                          )}
                          onSelect={(item) => {
                            if (!editable) return;
                            let perm = Object.values(PERMISSION_LEVELS).find(
                              (o) => o.name === item
                            );
                            userObj.permissions = perm;
                            // clog(userObj);
                            commitUserInfoChange(userObj);
                          }}
                          buttonStyle={{
                            paddingHorizontal: 5,
                            // marginTop: 5,
                            padding: 1,
                            borderColor: C.buttonLightGreenOutline,
                            outlineWidth: 0,
                            borderRadius: 5,
                            minWidth: 120,
                            height: 25,
                            // marginRight: 10,
                            borderWidth: 1,
                            backgroundColor: "transparent",
                            alignItems: "flex-start",
                            backgroundColor: editable
                              ? C.buttonLightGreen
                              : "transparent",
                            paddingVertical: 2,
                          }}
                          buttonText={userObj.permissions.name}
                          buttonTextStyle={{
                            color: C.text,
                            fontSize: 14,
                          }}
                        />
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        width: "100%",
                        // backgroundColor: "red",
                        marginTop: 7,
                        alignItems: "center",
                        // height: 25,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          width: "49%",
                          // marginRight: 10,
                          borderWidth: 1,
                          // marginTop: 5,
                          justifyContent: "space-between",
                          alignItems: "center",
                          height: 25,
                        }}
                      >
                        <TextInput
                          // focusable={sShowPinIndex === idx ? true : false}
                          caretHidden={sShowPinIndex != idx}
                          focused={sShowPinIndex === idx}
                          value={sShowPinIndex === idx ? userObj.pin : ""}
                          onChangeText={(value) => {
                            userObj.pin = value;
                            commitUserInfoChange(userObj);
                          }}
                          placeholder={sShowPinIndex === idx ? "pin..." : "PIN"}
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            outlineWidth: 0,
                            paddingHorizontal: 5,
                            padding: 1,
                            fontSize: 14,
                            width: "90%",
                          }}
                        />
                        {editable ? (
                          <TouchableOpacity
                            onPress={() =>
                              _setShowPinIndex(
                                sShowPinIndex != null ? null : idx
                              )
                            }
                          >
                            <Image_ icon={ICONS.editPencil} size={15} />
                          </TouchableOpacity>
                        ) : (
                          <View style={{ width: 15 }} />
                        )}
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          width: "49%",
                          borderWidth: 1,
                          justifyContent: "space-between",
                          alignItems: "center",
                          height: 25,
                        }}
                      >
                        <TextInput
                          caretHidden={sShowWageIndex != idx}
                          value={
                            sShowWageIndex === idx ? userObj.hourlyWage : ""
                          }
                          onChangeText={(value) => {
                            userObj.hourlyWage = value;
                            commitUserInfoChange(userObj);
                          }}
                          placeholder={
                            sShowWageIndex === idx ? "wage..." : "Wage"
                          }
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            outlineWidth: 0,
                            paddingHorizontal: 5,
                            padding: 1,
                            fontSize: 14,
                            width: "90%",
                          }}
                        />
                        {editable ? (
                          <TouchableOpacity
                            onPress={() =>
                              _setShowWageIndex(
                                sShowWageIndex != null ? null : idx
                              )
                            }
                          >
                            <Image_ icon={ICONS.editPencil} size={15} />
                          </TouchableOpacity>
                        ) : (
                          <View style={{ width: 15 }} />
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

// the next components are compiled into the ListOptionsComponent  //////////
const ListOptionsComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center" }}
      >
        <BikeBrandsComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <DiscountsComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <WaitTimesComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <PartSourcesComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const BikeBrandsComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      {/**Bike brands */}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingHorizontal: 5,
            paddingVertical: 5,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text }}>Category Name:</Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              padding: 5,
              borderWidth: 2,
              borderRadius: 5,
              borderColor: C.buttonLightGreenOutline,
              outlineWidth: 0,
              color: C.text,
              marginRight: 10,
            }}
            value={zSettingsObj?.bikeBrandsName}
            onChangeText={(val) => {
              handleSettingsFieldChange("bikeBrandsName", val);
            }}
          />
          <BoxButton1
            onPress={() => {
              let brandsArr = zSettingsObj?.bikeBrands;
              brandsArr.push("New Bike Brand...");
              handleSettingsFieldChange("bikeBrands", brandsArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.bikeBrands || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let brandName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput
                    onChangeText={(val) => {
                      let brandsArr = zSettingsObj.bikeBrands;
                      brandsArr[idx] = val;
                      handleSettingsFieldChange("bikeBrands", brandsArr);
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={brandName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.bikeBrands.filter(
                        (name) => name !== brandName
                      );
                      handleSettingsFieldChange("bikeBrands", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>

      {/**Optional bike brands */}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingHorizontal: 5,
            paddingVertical: 5,
            marginTop: 20,
            marginBottom: 10,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text }}>Category Name:</Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              padding: 5,
              borderWidth: 2,
              borderRadius: 5,
              borderColor: C.buttonLightGreenOutline,
              outlineWidth: 0,
              color: C.text,
              marginRight: 10,
            }}
            value={zSettingsObj?.bikeOptionalBrandsName}
            onChangeText={(val) => {
              handleSettingsFieldChange("bikeOptionalBrandsName", val);
            }}
          />
          <BoxButton1
            onPress={() => {
              let brandsArr = zSettingsObj?.bikeOptionalBrands;
              brandsArr.push("New Bike Brand...");
              handleSettingsFieldChange("bikeOptionalBrands", brandsArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.bikeOptionalBrands || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let brandName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput
                    onChangeText={(val) => {
                      let brandsArr = zSettingsObj.bikeOptionalBrands;
                      brandsArr[idx] = val;
                      handleSettingsFieldChange(
                        "bikeOptionalBrands",
                        brandsArr
                      );
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={brandName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.bikeOptionalBrands.filter(
                        (name) => name !== brandName
                      );
                      handleSettingsFieldChange("bikeOptionalBrands", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>

      {/**Bike Descriptions*/}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingHorizontal: 20,
            paddingVertical: 5,
            marginTop: 20,
            marginBottom: 10,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text, marginRight: 20 }}>
            Bike Descriptions
          </Text>
          <BoxButton1
            onPress={() => {
              let brandsArr = zSettingsObj?.bikeDescriptions;
              brandsArr.push("New Bike Description...");
              handleSettingsFieldChange("bikeDescriptions", brandsArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.bikeDescriptions || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let brandName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput
                    onChangeText={(val) => {
                      let descriptionsArr = zSettingsObj.bikeDescriptions;
                      descriptionsArr[idx] = val;
                      handleSettingsFieldChange(
                        "bikeDescriptions",
                        descriptionsArr
                      );
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={brandName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.bikeDescriptions.filter(
                        (name) => name !== brandName
                      );
                      handleSettingsFieldChange("bikeDescriptions", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const DiscountsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            borderRadius: 10,
            paddingHorizontal: 5,
            width: "100%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.buttonLightGreen,
              borderRadius: 5,
              paddingHorizontal: 20,
              paddingVertical: 5,
              marginTop: 20,
              marginBottom: 10,
              width: "100%",
            }}
          >
            <Text style={{ color: C.text, marginRight: 20 }}>Discounts</Text>
            <BoxButton1
              onPress={() => {
                let discountsArr = zSettingsObj.discounts;
                let discount = {};
                discount.name = "";
                discount.type = "Percent";
                discount.value = "20";
                discount.id = generateRandomID();
                discountsArr.push(discount);
                discountsArr.push(discount);
                handleSettingsFieldChange("discounts", discountsArr);
              }}
            />
          </View>
        </View>
        <View style={{ marginTop: 10, width: "100%", alignItems: "" }}>
          <FlatList
            data={zSettingsObj?.discounts || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let item = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                    marginBottom: 10,
                    // backgroundColor: "blue",
                  }}
                >
                  <TextInput
                    onChangeText={(val) => {
                      let discountsArr = zSettingsObj.discounts.map((o) => {
                        if (o.id === item.id) return { ...o, name: val };
                        return o;
                      });
                      handleSettingsFieldChange("discounts", discountsArr);
                    }}
                    placeholder={"Discount Name"}
                    placeholderTextColor={gray(0.15)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 14,
                      marginRight: 20,
                      backgroundColor: C.listItemWhite,
                    }}
                    value={item.name}
                  />
                  <View
                    style={{
                      width: "20%",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <DropdownComponent
                      onSelect={(val) => {
                        let discountsArr = zSettingsObj.discounts.map((o) => {
                          if (o.id === item.id) return { ...o, type: val };
                          return o;
                        });
                        handleSettingsFieldChange("discounts", discountsArr);
                      }}
                      textStyle={{ fontSize: 13 }}
                      buttonStyle={{ width: 40 }}
                      label={item.type}
                      data={[DISCOUNT_TYPES.percent, DISCOUNT_TYPES.dollar]}
                    />
                    <BoxButton1
                      onPress={() => {
                        let arr = zSettingsObj.discounts.filter(
                          (o) => o.id !== item.id
                        );
                        handleSettingsFieldChange("discounts", arr);
                      }}
                      style={{ marginLeft: 15 }}
                      iconSize={15}
                      icon={ICONS.close1}
                    />
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const WaitTimesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            borderRadius: 5,
            paddingHorizontal: 5,
            width: "100%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.buttonLightGreen,
              borderRadius: 5,
              paddingHorizontal: 20,
              paddingVertical: 5,
              marginTop: 20,
              marginBottom: 10,
              width: "100%",
            }}
          >
            <Text style={{ color: C.text, marginRight: 20 }}>
              Wait Estimates
            </Text>
            <BoxButton1
              onPress={() => {
                let waitTimesArr = zSettingsObj.waitTimes;
                let waitTime = {};
                waitTime.label = "New wait time...";
                waitTime.maxWaitTimeDays = 0;
                waitTime.id = generateRandomID();
                waitTimesArr.push(waitTime);
                handleSettingsFieldChange("waitTimes", waitTimesArr);
              }}
            />
          </View>
        </View>
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "66%",
              fontSize: 12,
              backgroundColor: "transparent",
            }}
          >
            <Text style={{ fontColor: C.text }}>Label</Text>
          </View>
          <View
            style={{
              width: "20%",
              alignItems: "center",
              // backgroundColor: "green",
            }}
          >
            <Text
              style={{
                // width: "100%",
                fontColor: C.text,
                textAlign: "center",
                fontSize: 12,
              }}
            >
              Max Wait Days
            </Text>
          </View>
          <View style={{ width: "10%" }}></View>
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.waitTimes || []}
            style={{ width: "100%" }}
            renderItem={(obj) => {
              let idx = obj.index;
              let item = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    // justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <TextInput
                    onChangeText={(val) => {
                      let arr = zSettingsObj.waitTimes.map((o) => {
                        if (o.id === item.id) return { ...o, label: val };
                        return o;
                      });
                      handleSettingsFieldChange("waitTimes", arr);
                    }}
                    placeholder={"Wait time label"}
                    placeholderTextColor={gray(0.15)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "70%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 13,
                      marginRight: 20,
                      backgroundColor: C.listItemWhite,
                    }}
                    value={item.label}
                  />
                  <TextInput
                    onChangeText={(val) => {
                      let arr = zSettingsObj.waitTimes.map((o) => {
                        if (o.id === item.id)
                          return { ...o, maxWaitTimeDays: val };
                        return o;
                      });
                      handleSettingsFieldChange("waitTimes", arr);
                    }}
                    placeholder={"Days"}
                    placeholderTextColor={gray(0.15)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "20%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 13,
                      marginRight: 20,
                      backgroundColor: C.listItemWhite,
                    }}
                    value={item.maxWaitTimeDays}
                  />
                  <View
                    style={{
                      width: "10%",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <BoxButton1
                      onPress={() => {
                        let arr = zSettingsObj.waitTimes.filter(
                          (o) => o.id !== item.id
                        );
                        handleSettingsFieldChange("waitTimes", arr);
                      }}
                      style={{ marginLeft: 15 }}
                      iconSize={15}
                      icon={ICONS.close1}
                    />
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const PartSourcesComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      {/**Bike brands */}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingVertical: 5,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text, marginRight: 20 }}>Part Sources</Text>
          <BoxButton1
            onPress={() => {
              let partSourcesArr = zSettingsObj?.partSources;
              partSourcesArr.push("New part source...");
              handleSettingsFieldChange("partSources", partSourcesArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.partSources || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let partSourceName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput
                    onChangeText={(val) => {
                      let partSourcesArr = zSettingsObj.partSources;
                      partSourcesArr[idx] = val;
                      handleSettingsFieldChange("partSources", partSourcesArr);
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={partSourceName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.partSources.filter(
                        (name) => name !== partSourceName
                      );
                      handleSettingsFieldChange("partSources", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

// end compile into ListOptionsComponent /////////////////////////////////////////

const StoreInfoComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  if (!zSettingsObj) return null;
  return (
    <BoxContainerOuterComponent style={{ marginBottom: 20 }}>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", paddingVertical: 20 }}
      >
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Display Name:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.displayName}
            onChangeText={(displayName) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                displayName,
              });
            }}
          />
          <CheckBox_
            onCheck={() => {}}
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "displayName"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Phone Number:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={formatPhoneWithDashes(zSettingsObj?.storeInfo.phone)}
            onChangeText={(phone) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                phone,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "phone"
            )}
          />
        </View>

        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Street:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.street}
            onChangeText={(street) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                street,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "street"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Unit:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.unit}
            onChangeText={(unit) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj?.storeInfo,
                unit,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "unit"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            City:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.city}
            onChangeText={(city) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj?.storeInfo,
                city,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "city"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            State or Abbrev.
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.state}
            onChangeText={(state) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj?.storeInfo,
                state,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "state"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Zip Code:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.zip}
            onChangeText={(zip) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                zip,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "zip"
            )}
          />
        </View>
        {/***************** open and closing hours **************************/}
        <View
          style={{
            marginTop: 20,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 5,
            padding: 4,
            width: "100%",
          }}
        >
          {zSettingsObj?.storeHours.standard.map((item, idx) => (
            <View
              style={{
                width: "100%",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  alignItems: "center",
                  width: "25%",
                  textAlign: "right",
                  paddingRight: 20,
                }}
              >
                {getDayOfWeekFrom0To7Input(idx)}
              </Text>
              <View
                style={{
                  width: "45%",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <TextInput
                  onChangeText={(val) => {
                    let standardStoreHours =
                      zSettingsObj.storeHours.standard.map((o) => {
                        if (o.id === item.id) {
                          let amPMSplit = o.open.split(" ");
                          let amPM = amPMSplit[1];
                          let hourMinSplit = amPMSplit[0].split(":");
                          hourMinSplit[0] = val;
                          if (val >= 12) amPM = "PM";
                          return {
                            ...o,
                            open: val + ":" + hourMinSplit[1] + " " + amPM,
                          };
                        }
                        return o;
                      });

                    handleSettingsFieldChange("storeHours", {
                      standard: standardStoreHours,
                      special: zSettingsObj.storeHours.special,
                    });
                  }}
                  style={{
                    textAlign: "right",
                    paddingRight: 2,
                    backgroundColor: "transparent",
                    width: 30,
                    fontSize: 15,
                    marginVertical: 3,
                    borderColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderRadius: 5,
                    marginRight: 2,
                    outlineColor: "transparent",
                  }}
                  value={item.open.split(":")[0]}
                />
                <Text>:</Text>
                <TextInput
                  style={{
                    textAlign: "left",
                    paddingLeft: 2,
                    backgroundColor: "transparent",
                    width: 30,
                    fontSize: 15,
                    marginVertical: 3,
                    borderColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderRadius: 5,
                    marginLeft: 2,
                    outlineColor: gray(0.5),
                    backgroundColor: "transparent",
                    width: 30,
                  }}
                  onChangeText={(val) => {
                    let standardStoreHours =
                      zSettingsObj.storeHours.standard.map((o) => {
                        // if (val > 60 || val < 0) return;

                        if (o.id === item.id) {
                          let amPMSplit = o.open.split(" ");
                          let amPM = amPMSplit[1];
                          let hourMinSplit = amPMSplit[0].split(":");
                          // if (val === "0") val = "00";
                          return {
                            ...o,
                            open: hourMinSplit[0] + ":" + val + " " + amPM,
                          };
                        }
                        return o;
                      });

                    handleSettingsFieldChange("storeHours", {
                      standard: standardStoreHours,
                      special: zSettingsObj.storeHours.special,
                    });
                  }}
                  value={item.open.split(":")[1].split(" ")[0]}
                />
                <Image_
                  style={{ width: 22, height: 12, marginHorizontal: 10 }}
                  // size={13}
                  icon={ICONS.rightArrowBlue}
                />
                <TextInput
                  style={{
                    textAlign: "right",
                    paddingRight: 2,
                    backgroundColor: "transparent",
                    width: 30,
                    fontSize: 15,
                    marginVertical: 3,
                    borderColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderRadius: 5,
                    marginRight: 2,
                    outlineColor: "transparent",
                  }}
                  onChangeText={(val) => {
                    let standardStoreHours =
                      zSettingsObj.storeHours.standard.map((o) => {
                        if (o.id === item.id) {
                          let amPMSplit = o.close.split(" ");
                          let amPM = amPMSplit[1];
                          let hourMinSplit = amPMSplit[0].split(":");
                          hourMinSplit[0] = val;
                          if (val >= 12) amPM = "PM";
                          return {
                            ...o,
                            close: val + ":" + hourMinSplit[1] + " " + amPM,
                          };
                        }
                        return o;
                      });

                    handleSettingsFieldChange("storeHours", {
                      standard: standardStoreHours,
                      special: zSettingsObj.storeHours.special,
                    });
                  }}
                  value={item.close.split(":")[0]}
                />
                <Text>:</Text>
                <TextInput
                  style={{
                    textAlign: "left",
                    paddingLeft: 2,
                    backgroundColor: "transparent",
                    width: 30,
                    fontSize: 15,
                    marginVertical: 3,
                    borderColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderRadius: 5,
                    marginLeft: 2,
                    outlineColor: "transparent",
                    backgroundColor: "transparent",
                    width: 30,
                  }}
                  onChangeText={(val) => {
                    let standardStoreHours =
                      zSettingsObj.storeHours.standard.map((o) => {
                        // if (val > 60 || val < 0) return;

                        if (o.id === item.id) {
                          let amPMSplit = o.close.split(" ");
                          let amPM = amPMSplit[1];
                          let hourMinSplit = amPMSplit[0].split(":");
                          // if (val === "0") val = "00";
                          return {
                            ...o,
                            close: hourMinSplit[0] + ":" + val + " " + amPM,
                          };
                        }
                        return o;
                      });

                    handleSettingsFieldChange("storeHours", {
                      standard: standardStoreHours,
                      special: zSettingsObj.storeHours.special,
                    });
                  }}
                  value={item.close.split(":")[1].split(" ")[0]}
                />
              </View>
              <View
                style={{
                  width: "20%",
                  // backgroundColor: "green",
                  alignItems: "flex-end",
                }}
              >
                <CheckBox_
                  buttonStyle={{ marginLeft: 20 }}
                  text={"Open"}
                  isChecked={item.isOpen}
                />
              </View>
            </View>
          ))}
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const PaymentProcessingComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent>
        <CheckBox_
          isChecked={zSettingsObj?.acceptChecks}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{
            backgroundColor: "transparent",
          }}
          text={"Accepts checks"}
          onCheck={() =>
            handleSettingsFieldChange(
              "acceptChecks",
              !zSettingsObj?.acceptChecks
            )
          }
        />
        <CheckBox_
          isChecked={zSettingsObj?.autoConnectToCardReader}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{
            marginVertical: 10,
            backgroundColor: "transparent",
          }}
          text={"Auto connect to card reader"}
          onCheck={() =>
            handleSettingsFieldChange(
              "autoConnectToCardReader",
              !zSettingsObj?.autoConnectToCardReader
            )
          }
        />
        {/**card reader flatlist */}
        <View
          style={{
            marginTop: 7,
            width: "100%",
            alignItems: "flex-end",
          }}
        >
          <View
            style={{
              borderRadius: 8,
              backgroundColor: C.backgroundListWhite,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-start",
                  marginBottom: 10,
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <BoxButton1
                  onPress={() => {
                    handleSettingsFieldChange("cardReaders", [
                      ...zSettingsObj.cardReaders,
                      { id: "", label: "" },
                    ]);
                  }}
                  icon={ICONS.add}
                  style={{ marginRight: 10, paddingLeft: 0 }}
                />
                <Text style={{ fontSize: 12, color: gray(0.6) }}>
                  {"STRIPE CARD READERS"}
                </Text>
              </View>
            </View>

            {/**Flatlist showing the available card readers */}
            <View style={{ width: "100%" }}>
              <FlatList
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      height: 5,
                    }}
                  />
                )}
                style={{}}
                data={zSettingsObj?.cardReaders || []}
                renderItem={(obj) => {
                  obj = cloneDeep(obj);
                  let idx = obj.index;
                  let item = obj.item;
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: gray(0.55), marginRight: 10 }}>
                        ID:
                      </Text>
                      <TextInput
                        style={{ outlineWidth: 0 }}
                        editable={true}
                        value={item.id}
                        placeholder="Assign reader name..."
                        placeholderTextColor={gray(0.4)}
                        onChangeText={(val) => {
                          let cardReaderArr = zSettingsObj.cardReaders?.map(
                            (o) => {
                              if (o.id === item.id) return { ...o, id: val };
                              return o;
                            }
                          );
                          handleSettingsFieldChange(
                            "cardReaders",
                            cloneDeep(cardReaderArr)
                          );
                        }}
                      />
                      <TextInput
                        value={item.label}
                        onChangeText={(val) => {
                          let cardReaderArr = zSettingsObj.cardReaders?.map(
                            (o) => {
                              if (o.id === item.id) return { ...o, label: val };
                              return o;
                            }
                          );
                          handleSettingsFieldChange(
                            "cardReaders",
                            cloneDeep(cardReaderArr)
                          );
                        }}
                        placeholder="Assign reader name..."
                        placeholderTextColor={gray(0.4)}
                        style={{
                          textAlign: "right",
                          paddingRight: 2,
                          justifyContent: "flex-end",
                          paddingVertical: 4,
                          backgroundColor: C.listItemWhite,
                          borderWidth: 1,
                          paddingRight: 2,
                          borderColor: C.buttonLightGreenOutline,
                          outlineWidth: 0,
                        }}
                      />
                      <Button_
                        buttonStyle={{ paddingHorizontal: 10 }}
                        iconSize={15}
                        icon={ICONS.close1}
                        onPress={() => {
                          handleSettingsFieldChange(
                            "cardReaders",
                            zSettingsObj.cardReaders.filter(
                              (obj) => obj.label != item.label
                            )
                          );
                        }}
                      />
                    </View>
                    // </View>
                  );
                }}
              />
            </View>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            width: "95%",
            justifyContent: "flex-end",
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <Text style={{ marginRight: 5 }}>Selected Reader: </Text>
          <DropdownComponent
            label={zSettingsObj?.selectedCardReaderObj?.label || ""}
            data={zSettingsObj?.cardReaders || []}
            onSelect={(obj) =>
              handleSettingsFieldChange("selectedCardReaderObj", obj)
            }
          />
        </View>
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <Text style={{ marginRight: 20 }}>State Sales Tax:</Text>
          <TextInput
            style={{
              outlineWidth: 0,
              borderRadius: 5,
              textAlign: "right",
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              paddingHorizontal: 5,
              paddingVertical: 3,
              marginRight: 3,
              width: 75,
            }}
            value={zSettingsObj?.salesTaxPercent || ""}
            onChangeText={(val) => {
              const regex = new RegExp(".", "g");
              let containsDecimalAlready = val.split(".").length > 2;
              if (checkInputForNumbersOnly(val) && !containsDecimalAlready) {
                handleSettingsFieldChange("salesTaxPercent", val);
              }
            }}
          />
          <Text>%</Text>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const WorkorderStatusesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  // const [sExpand, _setExpand] = useState(true);
  const [sBackgroundColorWheelItem, _setBackgroundColorWheelItem] = useState();
  const [sTextColorWheelItem, _setTextColorWheelItem] = useState();
  const [sEditableInputIdx, _setEditableInputIdx] = useState(null);
  const [sNewItem, _setNewItem] = useState();

  return (
    <BoxContainerOuterComponent style={{}}>
      <BoxContainerInnerComponent
        style={{
          backgroundColor: "transparent",
          borderWidth: 0,
          alignItems: "center",
          paddingHorizontal: 0,
          paddingVertical: 0,
          width: "100%",
        }}
      >
        <View
          style={{
            width: "100%",
            alignItems: "center",
            borderWidth: 1,
            paddingBottom: 30,
            paddingTop: 13,
            paddingHorizontal: 10,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.backgroundListWhite,
            borderRadius: 10,
          }}
        >
          <View style={{ width: "100%", alignItems: "flex-start" }}>
            <BoxButton1
              style={{
                marginBottom: 10,
                alignSelf: "flex-start",
              }}
              onPress={() => {
                let proto = {};
                Object.keys(zSettingsObj.statuses[0]).forEach((key) => {
                  proto[key] = "";
                });
                proto.label = "New Status";
                proto.id = generateRandomID();
                proto.backgroundColor = gray(0.3);
                proto.textColor = C.text;
                proto.removable = true;
                let statuses = [proto, ...zSettingsObj.statuses];
                handleSettingsFieldChange("statuses", statuses);
              }}
            />
          </View>
          <FlatList
            data={zSettingsObj?.statuses || []}
            style={{
              width: "100%",
            }}
            renderItem={(obj) => {
              let idx = obj.index;
              let item = obj.item;
              // log(item);
              return (
                <View
                  style={{
                    flexDirection: "column",
                    alignItems: "center",
                    width: "100%",
                    justifyContent: "flex-end",
                    // backgroundColor: "red",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      width: "100%",
                      alignItems: "center",
                      // justifyContent: "flex-end",
                    }}
                  >
                    <BoxButton1
                      style={{ paddingHorizontal: 5 }}
                      iconSize={22}
                      icon={ICONS.upChevron}
                      onPress={() => {
                        let arr = moveItemInArr(
                          zSettingsObj.statuses,
                          idx,
                          "up"
                        );
                        handleSettingsFieldChange("statuses", arr);
                      }}
                    />
                    <BoxButton1
                      style={{ paddingHorizontal: 5 }}
                      iconSize={22}
                      icon={ICONS.downChevron}
                      onPress={() => {
                        let arr = moveItemInArr(
                          zSettingsObj.statuses,
                          idx,
                          "down"
                        );
                        handleSettingsFieldChange("statuses", arr);
                      }}
                    />

                    <BoxButton1
                      style={{ paddingHorizontal: 5 }}
                      iconSize={22}
                      icon={ICONS.editPencil}
                      onPress={() =>
                        _setEditableInputIdx(
                          sEditableInputIdx === null ||
                            (sEditableInputIdx && sEditableInputIdx != idx)
                            ? idx
                            : null
                        )
                      }
                    />
                    <BoxButton1
                      style={{
                        paddingHorizontal: 5,
                        paddingRight: 5,
                        marginRight: 20,
                      }}
                      iconSize={15}
                      icon={ICONS.close1}
                      onPress={() => {
                        let statuses = zSettingsObj.statuses.filter(
                          (o) => o.id != item.id
                        );
                        handleSettingsFieldChange("statuses", statuses);
                      }}
                    />
                    <View
                      style={{
                        backgroundColor: item.backgroundColor,
                        alignItems: "center",
                        // justifyContent: ''
                        flexDirection: "row",
                        width: "50%",
                        height: 35,
                        // paddingHorizontal: 20,
                        // paddingVertical: 5,
                        borderTopLeftRadius: idx === 0 ? 5 : 0,
                        borderTopRightRadius: idx === 0 ? 5 : 0,
                        borderBottomLeftRadius:
                          idx === zSettingsObj.statuses.length - 1 ? 5 : 0,
                        borderBottomRightRadius:
                          idx === zSettingsObj.statuses.length - 1 ? 5 : 0,
                      }}
                    >
                      {!!!item.removable && (
                        <View
                          style={{
                            width: "10%",
                          }}
                        />
                      )}
                      <TextInput
                        style={{
                          width: "100%",
                          textAlign: "center",
                          color: item.textColor,
                          outlineWidth: 0,
                          paddingVertical: 4,
                          fontSize: 13,
                          borderWidth: 1,
                          borderColor:
                            sEditableInputIdx === idx && item.removable
                              ? gray(0.4)
                              : "transparent",
                        }}
                        onChangeText={(val) => {
                          let statuses = zSettingsObj.statuses.map((o) => {
                            if (o.id === item.id) return { ...o, label: val };
                            return o;
                          });
                          handleSettingsFieldChange("statuses", statuses);
                        }}
                        editable={sEditableInputIdx === idx && item.removable}
                        autoFocus={sEditableInputIdx === idx}
                        value={item.label}
                      />
                      {!!!item.removable && (
                        <View
                          style={{
                            width: "10%",
                            height: "100%",
                            alignItems: "flex-end",
                            justifyContent: "flex-start",
                            padding: 3,
                          }}
                        >
                          <Image_ icon={ICONS.blocked} size={15} />
                        </View>
                      )}
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        width: "15%",
                        justifyContent: "space-between",
                        // backgroundColor: "blue",
                        paddingLeft: 20,
                      }}
                    >
                      <BoxButton1
                        style={{ paddingHorizontal: 7 }}
                        iconSize={23}
                        icon={ICONS.colorWheel}
                        onPress={() => {
                          if (sBackgroundColorWheelItem) {
                            _setBackgroundColorWheelItem();
                            _setTextColorWheelItem();
                          } else {
                            _setBackgroundColorWheelItem(item);
                            _setTextColorWheelItem();
                          }
                        }}
                      />
                      <BoxButton1
                        onPress={() => {
                          if (sTextColorWheelItem) {
                            _setBackgroundColorWheelItem();
                            _setTextColorWheelItem();
                          } else {
                            _setBackgroundColorWheelItem();
                            _setTextColorWheelItem(item);
                          }
                        }}
                        style={{ paddingHorizontal: 7 }}
                        iconSize={22}
                        icon={ICONS.letterT}
                      />
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      width: "100%",
                      justifyContent: "flex-end",
                      paddingRight: "21%",
                    }}
                  >
                    {!!sBackgroundColorWheelItem?.id === item.id && (
                      <ColorWheel
                        initialColor={item.backgroundColor}
                        style={{ marginVertical: 7 }}
                        onColorChange={(val) => {
                          let back = val.hex;
                          let text = bestForegroundHex(val.hex);
                          let statuses = zSettingsObj.statuses.map((o) => {
                            if (o.id === item.id)
                              return {
                                ...o,
                                backgroundColor: back,
                                textColor: text,
                              };
                            return o;
                          });
                          handleSettingsFieldChange("statuses", statuses);
                        }}
                      />
                    )}
                    {!!sTextColorWheelItem?.id === item.id && (
                      <ColorWheel
                        initialColor={item.textColor}
                        style={{ marginVertical: 7 }}
                        onColorChange={(val) => {
                          let statuses = zSettingsObj.statuses.map((o) => {
                            if (o.id === item.id)
                              return {
                                ...o,
                                textColor: val.hex,
                              };
                            return o;
                          });
                          handleSettingsFieldChange("statuses", statuses);
                        }}
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const QuickItemButtonsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const sCurrentParentID = useTabNamesStore((state) => state.getDashboardQBParentID());
  const _setCurrentParentID = useTabNamesStore((state) => state.setDashboardQBParentID);
  const sMenuPath = useTabNamesStore((state) => state.getDashboardQBMenuPath());
  const _setMenuPath = (valOrFn) => {
    if (typeof valOrFn === "function") {
      let current = useTabNamesStore.getState().getDashboardQBMenuPath();
      useTabNamesStore.getState().setDashboardQBMenuPath(valOrFn(current));
    } else {
      useTabNamesStore.getState().setDashboardQBMenuPath(valOrFn);
    }
  };
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);
  const [sEditingID, _setEditingID] = useState(null);

  function getDescendantIDs(buttonID, allButtons) {
    let descendants = [];
    let children = allButtons.filter((b) => b.parentID === buttonID);
    children.forEach((child) => {
      descendants.push(child.id);
      descendants.push(...getDescendantIDs(child.id, allButtons));
    });
    return descendants;
  }

  function getChildCount(buttonID) {
    return (zSettingsObj?.quickItemButtons || []).filter(
      (b) => b.parentID === buttonID
    ).length;
  }

  function drillIn(btn) {
    _setMenuPath((prev) => [...prev, { id: btn.id, name: btn.name }]);
    _setCurrentParentID(btn.id);
  }

  function handleBack() {
    let path = [...sMenuPath];
    path.pop();
    _setMenuPath(path);
    _setCurrentParentID(path.length > 0 ? path[path.length - 1].id : null);
  }

  function handleDelete(btn) {
    if (btn.id === "labor" || btn.id === "part") return;
    let deletedParentID = btn.parentID || null;
    handleSettingsFieldChange(
      "quickItemButtons",
      zSettingsObj.quickItemButtons
        .filter((o) => o.id !== btn.id)
        .map((o) =>
          o.parentID === btn.id ? { ...o, parentID: deletedParentID } : o
        )
    );
  }

  function handleNameChange(btn, val) {
    handleSettingsFieldChange(
      "quickItemButtons",
      zSettingsObj.quickItemButtons.map((o) =>
        o.id === btn.id ? { ...o, name: val } : o
      )
    );
  }

  function handleAdd() {
    let newID = generateRandomID();
    let quickButtonsArr = [...(zSettingsObj?.quickItemButtons || [])];
    quickButtonsArr.push({
      id: newID,
      name: "",
      parentID: sCurrentParentID,
      items: [],
    });
    handleSettingsFieldChange("quickItemButtons", quickButtonsArr);
    _setEditingID(newID);
  }

  function reorderSubButtons(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let allButtons = [...zSettingsObj.quickItemButtons];
    let children = allButtons.filter(
      (b) => b.parentID === sCurrentParentID
    );
    let [dragged] = children.splice(fromIdx, 1);
    children.splice(toIdx, 0, dragged);
    let childIndex = 0;
    let result = allButtons.map((b) => {
      if (b.parentID === sCurrentParentID) return children[childIndex++];
      return b;
    });
    handleSettingsFieldChange("quickItemButtons", result);
  }

  let allButtons = zSettingsObj?.quickItemButtons || [];
  let topLevelButtons = allButtons.filter((b) => !b.parentID);
  let currentChildren = allButtons.filter(
    (b) => b.parentID === sCurrentParentID
  );

  function renderButtonCard(btn, idx, isDraggable) {
    let isEditing = sEditingID === btn.id;
    let childCount = getChildCount(btn.id);
    return (
      <div
        key={btn.id}
        draggable={isDraggable}
        onDragStart={isDraggable ? () => _setDragIdx(idx) : undefined}
        onDragOver={
          isDraggable
            ? (e) => {
                e.preventDefault();
                _setDragOverIdx(idx);
              }
            : undefined
        }
        onDragEnd={
          isDraggable
            ? () => {
                _setDragIdx(null);
                _setDragOverIdx(null);
              }
            : undefined
        }
        onDrop={
          isDraggable
            ? (e) => {
                e.preventDefault();
                reorderSubButtons(sDragIdx, idx);
                _setDragIdx(null);
                _setDragOverIdx(null);
              }
            : undefined
        }
        onMouseEnter={(e) => {
          if (!isEditing) e.currentTarget.style.opacity = "0.7";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        style={{
          width: 170,
          minHeight: 60,
          margin: 4,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          borderWidth: isDraggable && sDragOverIdx === idx ? 2 : 1,
          borderStyle: "solid",
          borderColor:
            isDraggable && sDragOverIdx === idx
              ? C.blue
              : C.buttonLightGreenOutline,
          borderRadius: 8,
          backgroundColor: isEditing ? "rgb(245,166,35)" : C.listItemWhite,
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          cursor: isDraggable ? "grab" : "pointer",
          opacity: isDraggable && sDragIdx === idx ? 0.5 : 1,
          boxSizing: "border-box",
        }}
      >
        {/* Name area */}
        {isEditing ? (
          <TextInput_
            autoFocus={true}
            onChangeText={(val) => handleNameChange(btn, val)}
            placeholder="Enter name..."
            placeholderTextColor={gray(0.3)}
            style={{
              width: "100%",
              paddingHorizontal: 5,
              paddingVertical: 3,
              fontSize: 13,
              textAlign: "center",
              color: C.text,
              outlineWidth: 0,
              outlineStyle: "none",
            }}
            value={btn.name}
          />
        ) : (
          <TouchableOpacity
            onPress={() => drillIn(btn)}
            style={{
              width: "100%",
              cursor: "pointer",
            }}
          >
            <Text
              style={{
                width: "100%",
                fontSize: 13,
                textAlign: "center",
                color: C.text,
                paddingHorizontal: 5,
                paddingVertical: 3,
              }}
              numberOfLines={1}
            >
              {btn.name || "(unnamed)"}
            </Text>
          </TouchableOpacity>
        )}
        {/* Bottom row: badge + edit + delete */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
          }}
        >
          {childCount > 0 && (
            <View
              style={{
                backgroundColor: C.blue,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 6,
              }}
            >
              <Text
                style={{
                  color: C.textWhite,
                  fontSize: 10,
                  fontWeight: "bold",
                  paddingHorizontal: 4,
                }}
              >
                {childCount}
              </Text>
            </View>
          )}
          <BoxButton1
            onPress={() =>
              _setEditingID(isEditing ? null : btn.id)
            }
            iconSize={isEditing ? 37 : 17}
            icon={isEditing ? ICONS.clickHere : ICONS.editPencil}
          />
          <BoxButton1
            onPress={() => handleDelete(btn)}
            style={{ marginLeft: 6 }}
            iconSize={17}
            icon={ICONS.close1}
          />
        </View>
        {isDraggable && sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && (
          <Image_
            icon={ICONS.backRed}
            size={14}
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
            }}
          />
        )}
      </div>
    );
  }

  // ── TOP-LEVEL VIEW ──
  if (sCurrentParentID === null) {
    return (
      <BoxContainerOuterComponent style={{ flex: 1 }}>
        <BoxContainerInnerComponent
          style={{ width: "100%", alignItems: "center", borderWidth: 0, flex: 1 }}
        >
          <View style={{ width: "100%" }}>
            <BoxButton1 onPress={handleAdd} />
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              {topLevelButtons.map((btn, idx) =>
                renderButtonCard(btn, idx, true)
              )}
            </div>
          </View>
        </BoxContainerInnerComponent>
      </BoxContainerOuterComponent>
    );
  }

  // ── SUB-LEVEL VIEW ──
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
      >
        <View style={{ width: "100%" }}>
          {/* Navigation header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <TouchableOpacity
              onPress={() => {
                _setCurrentParentID(null);
                _setMenuPath([]);
              }}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                marginRight: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: C.blue, fontWeight: "bold" }}>
                {"Top Level"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleBack}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                marginRight: 12,
              }}
            >
              <Text style={{ fontSize: 12, color: C.text }}>
                {"\u25C0 Back"}
              </Text>
            </TouchableOpacity>
            {/* Breadcrumb trail */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {sMenuPath.map((crumb, i) => (
                <View
                  key={crumb.id}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  {i > 0 && (
                    <Text
                      style={{
                        color: gray(0.3),
                        marginHorizontal: 4,
                        fontSize: 13,
                      }}
                    >
                      {">"}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      _setMenuPath((prev) => prev.slice(0, i + 1));
                      _setCurrentParentID(crumb.id);
                    }}
                  >
                    <Text
                      style={{
                        color:
                          i === sMenuPath.length - 1 ? C.text : C.blue,
                        fontSize: 13,
                        fontWeight:
                          i === sMenuPath.length - 1 ? "bold" : "normal",
                      }}
                    >
                      {crumb.name || "(unnamed)"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* Add button */}
          <BoxButton1 onPress={handleAdd} />

          {/* Flex-wrap grid of sub-buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            {currentChildren.map((btn, idx) =>
              renderButtonCard(btn, idx, true)
            )}
          </div>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const TEXT_TEMPLATE_VARIABLES = [
  { label: "First Name", variable: "{firstName}" },
  { label: "Last Name", variable: "{lastName}" },
  { label: "Brand", variable: "{brand}" },
  { label: "Description", variable: "{description}" },
  { label: "Total Amount", variable: "{totalAmount}" },
  { label: "Line Items", variable: "{lineItems}" },
  { label: "Part Ordered", variable: "{partOrdered}" },
  { label: "Part Source", variable: "{partSource}" },
  { label: "Store Hours", variable: "{storeHours}" },
  { label: "Store Phone", variable: "{storePhone}" },
];

const OrderingComponent = ({
  sOrderingMenuSelectionName,
  _setOrderingMenuSelectionName,
}) => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent style={{ width: "100%", alignItems: "center" }}>
        {/* Sub-tab buttons */}
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            marginBottom: 15,
            borderBottomWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingBottom: 10,
          }}
        >
          {Object.values(DROPDOWN_ORDERING_SELECTION_NAMES).map((name) => {
            let isActive = sOrderingMenuSelectionName === name;
            return (
              <TouchableOpacity
                key={name}
                onPress={() => _setOrderingMenuSelectionName(name)}
                style={{
                  marginRight: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: isActive ? C.green : C.buttonLightGreenOutline,
                  backgroundColor: isActive ? C.buttonLightGreen : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? "500" : "400",
                    color: isActive ? C.green : gray(0.5),
                  }}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content area */}
        <View style={{ width: "100%", alignItems: "center" }}>
          <Text style={{ color: gray(0.4), fontSize: 14 }}>
            {sOrderingMenuSelectionName}
          </Text>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const ImportComponent = () => {
  const zSettings = useSettingsStore((state) => state.settings);
  const [sImporting, _setImporting] = useState("");
  const [sResult, _setResult] = useState("");
  const [sClearInventory, _setClearInventory] = useState(true);
  const [sClearCustomers, _setClearCustomers] = useState(true);
  const [sClearWorkorders, _setClearWorkorders] = useState(true);
  const [sClearStatuses, _setClearStatuses] = useState(true);
  const [sLsConnected, _setLsConnected] = useState(false);
  const [sLsAccountName, _setLsAccountName] = useState("");
  const [sLsImporting, _setLsImporting] = useState("");
  const [sLsResult, _setLsResult] = useState("");
  const [sClearLsData, _setClearLsData] = useState(true);
  const [sDevWorkorders, _setDevWorkorders] = useState(false);

  // --- CSV parsing utilities ---
  function parseCSVLine(line) {
    let result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      let ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current); current = ""; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  }

  function parseCSV(text) {
    let lines = text.split("\n").filter(l => l.trim());
    let headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(line => {
      let values = parseCSVLine(line);
      let obj = {};
      headers.forEach((h, i) => obj[h.trim()] = (values[i] || "").trim());
      return obj;
    });
  }

  function cleanPhone(str) {
    if (!str) return "";
    let digits = str.replace(/\D/g, "");
    if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
    return digits.length === 10 ? digits : "";
  }

  // Extract up to 2 colors from item text, case-insensitive
  // Matches against COLORS labels. Handles "Black/Red", "black", "Blue", etc.
  function extractColors(text) {
    if (!text) return [];
    // Sort labels longest-first so "Light-blue" matches before "Blue"
    let sortedColors = [...COLORS].sort((a, b) => b.label.length - a.label.length);
    let found = [];
    let lowerText = text.toLowerCase();
    let usedIndices = [];

    for (let colorObj of sortedColors) {
      if (found.length >= 2) break;
      let label = colorObj.label.toLowerCase();
      // Word-boundary match: color must not be embedded in another word
      let regex = new RegExp("(?:^|[\\s/\\(])(" + label.replace("-", "[-\\s]?") + ")(?=[\\s/\\).,]|$)", "i");
      let match = regex.exec(lowerText);
      if (match) {
        let idx = match.index;
        // Avoid matching the same position twice
        let overlaps = usedIndices.some(u => Math.abs(u - idx) < label.length);
        if (!overlaps) {
          found.push(colorObj);
          usedIndices.push(idx);
        }
      }
    }
    return found;
  }

  // --- Import Inventory (preview mode) ---
  async function handleImportInventory() {
    try {
      _setImporting("inventory");
      _setResult("");
      let res = await fetch(process.env.PUBLIC_URL + "/import_data/inventory.csv");
      let text = await res.text();
      let rows = parseCSV(text);

      let items = rows.map(row => {
        let item = cloneDeep(INVENTORY_ITEM_PROTO);
        item.id = generateRandomID();
        item.formalName = row["Description"] || "";
        item.price = dollarsToCents(row["Price"]) || 0;
        item.cost = dollarsToCents(row["Default Cost"]) || 0;
        item.upc = row["UPC"] || "";
        item.ean = row["EAN"] || "";
        item.customSku = row["Custom SKU"] || "";
        item.manufacturerSku = row["Manufact. SKU"] || "";
        if ((item.formalName || "").toLowerCase().includes("labor")) {
          item.category = "Labor";
        }
        return item;
      });

      console.log("=== IMPORT PREVIEW: INVENTORY ===");
      console.log("Total entries:", items.length);
      console.log(JSON.stringify(items.slice(0, 50), null, 2));

      // Clear existing inventory if checked, then save new
      let clearedCount = 0;
      if (sClearInventory) {
        let cleared = await dbClearCollection("inventory");
        clearedCount = cleared.deletedCount;
        console.log("Cleared inventory:", clearedCount, "docs");
      }
      for (let i = 0; i < items.length; i++) {
        await dbSaveInventoryItem(items[i]);
        if ((i + 1) % 50 === 0) console.log("Saved", i + 1, "/", items.length);
      }
      _setResult("Imported " + items.length + " inventory items" + (sClearInventory ? " (cleared " + clearedCount + " old)" : " (merged)"));
    } catch (err) {
      console.error("Import inventory error:", err);
      _setResult("Error: " + err.message);
    } finally {
      _setImporting("");
    }
  }

  // --- Import Customers with deduplication (preview mode) ---
  function parseCustomers(rows) {
    let customers = rows.map(row => {
      let cust = cloneDeep(CUSTOMER_PROTO);
      cust.id = generateRandomID();
      cust.first = (row["First Name"] || "").toLowerCase();
      cust.last = (row["Last Name"] || "").toLowerCase();
      cust.email = row["Email"] || "";
      cust.streetAddress = row["Address1"] || "";
      cust.unit = row["Address2"] || "";
      cust.city = row["City"] || "";
      cust.state = row["State"] || "";
      cust.zip = row["ZIP"] || "";

      // Phone: try Mobile first, then Home, then Work
      let mobile = cleanPhone(row["Mobile"] || "");
      let home = cleanPhone(row["Home"] || "");
      let work = cleanPhone(row["Work"] || "");
      cust.cell = mobile || home || work || "";
      // landline: second valid phone
      let phones = [mobile, home, work].filter(p => p);
      if (phones.length > 1) cust.landline = phones[1];

      // Created At
      let createdAt = row["Created At"];
      if (createdAt && createdAt !== "0000-00-00") {
        let ms = new Date(createdAt).getTime();
        if (!isNaN(ms)) cust.millisCreated = ms;
      }

      return cust;
    });

    // Deduplicate by phone number
    let phoneMap = new Map();
    let noPhoneCustomers = [];

    customers.forEach(cust => {
      if (!cust.cell) {
        noPhoneCustomers.push(cust);
        return;
      }
      if (phoneMap.has(cust.cell)) {
        // Keep the one with more filled fields
        let existing = phoneMap.get(cust.cell);
        let existingFilled = Object.values(existing).filter(v => v && v !== "" && v !== 0).length;
        let newFilled = Object.values(cust).filter(v => v && v !== "" && v !== 0).length;
        if (newFilled > existingFilled) {
          cust.id = existing.id; // keep same ID
          phoneMap.set(cust.cell, cust);
        }
      } else {
        phoneMap.set(cust.cell, cust);
      }
    });

    let deduplicated = [...phoneMap.values(), ...noPhoneCustomers];
    return { deduplicated, phoneMap };
  }

  async function handleImportCustomers() {
    try {
      _setImporting("customers");
      _setResult("");
      let res = await fetch(process.env.PUBLIC_URL + "/import_data/customers.csv");
      let text = await res.text();
      let rows = parseCSV(text);

      let { deduplicated } = parseCustomers(rows);

      console.log("=== IMPORT PREVIEW: CUSTOMERS ===");
      console.log("Total raw rows:", rows.length);
      console.log("After deduplication:", deduplicated.length);
      console.log("Removed duplicates:", rows.length - deduplicated.length);
      console.log(JSON.stringify(deduplicated.slice(0, 50), null, 2));

      // Clear existing customers if checked, then save new
      let clearedCount = 0;
      if (sClearCustomers) {
        let cleared = await dbClearCollection("customers");
        clearedCount = cleared.deletedCount;
        console.log("Cleared customers:", clearedCount, "docs");
      }
      for (let i = 0; i < deduplicated.length; i++) {
        await dbSaveCustomer(deduplicated[i]);
        if ((i + 1) % 50 === 0) console.log("Saved", i + 1, "/", deduplicated.length);
      }
      _setResult("Imported " + deduplicated.length + " customers" + (sClearCustomers ? " (cleared " + clearedCount + " old)" : " (merged)") + ", removed " + (rows.length - deduplicated.length) + " duplicates");
    } catch (err) {
      console.error("Import customers error:", err);
      _setResult("Error: " + err.message);
    } finally {
      _setImporting("");
    }
  }

  // --- Import Workorders with customer linking (preview mode) ---
  async function handleImportWorkorders() {
    try {
      _setImporting("workorders");
      _setResult("");

      // First parse customers for linking
      let custRes = await fetch(process.env.PUBLIC_URL + "/import_data/customers.csv");
      let custText = await custRes.text();
      let custRows = parseCSV(custText);
      let { deduplicated: customers } = parseCustomers(custRows);

      // Build name lookup map: "first last" (lowercase) -> customer
      let nameLookup = new Map();
      customers.forEach(cust => {
        let fullName = ((cust.first || "") + " " + (cust.last || "")).trim().toLowerCase();
        if (fullName) nameLookup.set(fullName, cust);
      });

      // Parse workorders
      let woRes = await fetch(process.env.PUBLIC_URL + "/import_data/workorders.csv");
      let woText = await woRes.text();
      let woRows = parseCSV(woText);

      let workorders = woRows.map(row => {
        let wo = cloneDeep(WORKORDER_PROTO);
        wo.id = generateRandomID();
        wo.workorderNumber = row["ID"] || "";
        wo.description = row["Item"] || "";
        wo.status = row["Status"] || "";

        // Extract "PRODUCT -SOURCE" pattern (always uppercase)
        // e.g. "BATTERY -ALIEXPRESS", "TOUCH-UP PAINT -HEYBIKE", "FREEWHEEL -JBI"
        let partMatch = (row["Item"] || "").match(/([A-Z][A-Z0-9 /-]*?)\s+-([A-Z][A-Z0-9]+)\s*$/);
        if (partMatch) {
          wo.partOrdered = partMatch[1].trim();
          wo.partSource = partMatch[2].trim();
        } else {
          // Check for just " -SOURCE" with no uppercase product before it (e.g. "(qty 4) -JBI")
          let sourceOnly = (row["Item"] || "").match(/\s+-([A-Z][A-Z0-9]+)\s*$/);
          if (sourceOnly) {
            wo.partSource = sourceOnly[1].trim();
          }
        }

        // Date In -> startedOnMillis
        let dateIn = row["Date In"];
        if (dateIn) {
          let ms = new Date(dateIn).getTime();
          if (!isNaN(ms)) wo.startedOnMillis = ms;
        }

        // Extract colors from Item field (case-insensitive)
        let itemText = row["Item"] || "";
        let foundColors = extractColors(itemText);
        if (foundColors.length >= 1) {
          wo.color1 = { textColor: foundColors[0].textColor, backgroundColor: foundColors[0].backgroundColor, label: foundColors[0].label };
        }
        if (foundColors.length >= 2) {
          wo.color2 = { textColor: foundColors[1].textColor, backgroundColor: foundColors[1].backgroundColor, label: foundColors[1].label };
        }

        // Customer linking
        let custName = (row["Customer"] || "").trim();
        if (custName) {
          let matched = nameLookup.get(custName.toLowerCase());
          if (matched) {
            wo.customerID = matched.id;
            wo.customerFirst = matched.first;
            wo.customerLast = matched.last;
            wo.customerPhone = matched.cell;
          } else {
            // Split name: first word = first, rest = last
            let parts = custName.split(" ");
            wo.customerFirst = (parts[0] || "").toLowerCase();
            wo.customerLast = (parts.slice(1).join(" ") || "").toLowerCase();
          }
        }

        return wo;
      });

      let linkedCount = workorders.filter(wo => wo.customerID).length;

      console.log("=== IMPORT PREVIEW: WORKORDERS ===");
      console.log("Total workorders:", workorders.length);
      console.log("Linked to customers:", linkedCount);
      console.log("Unlinked:", workorders.length - linkedCount);
      console.log(JSON.stringify(workorders.slice(0, 50), null, 2));
      // Clear existing workorders if checked, then save new
      let clearedCount = 0;
      if (sClearWorkorders) {
        let cleared = await dbClearCollection("open-workorders");
        clearedCount = cleared.deletedCount;
        console.log("Cleared workorders:", clearedCount, "docs");
      }
      for (let i = 0; i < workorders.length; i++) {
        await dbSaveOpenWorkorder(workorders[i]);
        if ((i + 1) % 50 === 0) console.log("Saved", i + 1, "/", workorders.length);
      }
      _setResult("Imported " + workorders.length + " workorders" + (sClearWorkorders ? " (cleared " + clearedCount + " old)" : " (merged)") + ", " + linkedCount + " linked to customers");
    } catch (err) {
      console.error("Import workorders error:", err);
      _setResult("Error: " + err.message);
    } finally {
      _setImporting("");
    }
  }

  // --- Dev Import Workorders (fills random inventory items + statuses) ---
  async function handleImportWorkordersDev() {
    try {
      _setImporting("workorders");
      _setResult("");

      // 1. Load and parse customers for linking
      let custRes = await fetch(process.env.PUBLIC_URL + "/import_data/customers.csv");
      let custText = await custRes.text();
      let custRows = parseCSV(custText);
      let { deduplicated: customers } = parseCustomers(custRows);

      let nameLookup = new Map();
      customers.forEach(cust => {
        let fullName = ((cust.first || "") + " " + (cust.last || "")).trim().toLowerCase();
        if (fullName) nameLookup.set(fullName, cust);
      });

      // 2. Load and parse inventory (same rules as handleImportInventory)
      let invRes = await fetch(process.env.PUBLIC_URL + "/import_data/inventory.csv");
      let invText = await invRes.text();
      let invRows = parseCSV(invText);

      let inventoryItems = invRows.map(row => {
        let item = cloneDeep(INVENTORY_ITEM_PROTO);
        item.id = generateRandomID();
        item.formalName = row["Description"] || "";
        item.price = dollarsToCents(row["Price"]) || 0;
        item.cost = dollarsToCents(row["Default Cost"]) || 0;
        item.upc = row["UPC"] || "";
        item.ean = row["EAN"] || "";
        item.customSku = row["Custom SKU"] || "";
        item.manufacturerSku = row["Manufact. SKU"] || "";
        if ((item.formalName || "").toLowerCase().includes("labor")) {
          item.category = "Labor";
        }
        return item;
      });

      if (inventoryItems.length === 0) {
        _setResult("Error: inventory.csv has no items — cannot fill workorder lines");
        _setImporting("");
        return;
      }

      // 3. Load and parse statuses
      let statusRes = await fetch(process.env.PUBLIC_URL + "/import_data/statuses.csv");
      let statusText = await statusRes.text();
      let statusRows = parseCSV(statusText);

      let statusLabels = statusRows.map(row => row["Status"] || "").filter(s => s);

      // 4. Parse workorders and fill missing data
      let woRes = await fetch(process.env.PUBLIC_URL + "/import_data/workorders.csv");
      let woText = await woRes.text();
      let woRows = parseCSV(woText);

      let workorders = woRows.map(row => {
        let wo = cloneDeep(WORKORDER_PROTO);
        wo.id = generateRandomID();
        wo.workorderNumber = row["ID"] || "";
        wo.description = row["Item"] || "";
        wo.status = row["Status"] || "";

        // Extract "PRODUCT -SOURCE" pattern
        let partMatch = (row["Item"] || "").match(/([A-Z][A-Z0-9 /-]*?)\s+-([A-Z][A-Z0-9]+)\s*$/);
        if (partMatch) {
          wo.partOrdered = partMatch[1].trim();
          wo.partSource = partMatch[2].trim();
        } else {
          let sourceOnly = (row["Item"] || "").match(/\s+-([A-Z][A-Z0-9]+)\s*$/);
          if (sourceOnly) {
            wo.partSource = sourceOnly[1].trim();
          }
        }

        // Date In -> startedOnMillis
        let dateIn = row["Date In"];
        if (dateIn) {
          let ms = new Date(dateIn).getTime();
          if (!isNaN(ms)) wo.startedOnMillis = ms;
        }

        // Extract colors from Item field
        let itemText = row["Item"] || "";
        let foundColors = extractColors(itemText);
        if (foundColors.length >= 1) {
          wo.color1 = { textColor: foundColors[0].textColor, backgroundColor: foundColors[0].backgroundColor, label: foundColors[0].label };
        }
        if (foundColors.length >= 2) {
          wo.color2 = { textColor: foundColors[1].textColor, backgroundColor: foundColors[1].backgroundColor, label: foundColors[1].label };
        }

        // Customer linking
        let custName = (row["Customer"] || "").trim();
        if (custName) {
          let matched = nameLookup.get(custName.toLowerCase());
          if (matched) {
            wo.customerID = matched.id;
            wo.customerFirst = matched.first;
            wo.customerLast = matched.last;
            wo.customerPhone = matched.cell;
          } else {
            let parts = custName.split(" ");
            wo.customerFirst = (parts[0] || "").toLowerCase();
            wo.customerLast = (parts.slice(1).join(" ") || "").toLowerCase();
          }
        }

        // --- DEV: Fill missing status from statuses.csv ---
        if (!wo.status && statusLabels.length > 0) {
          wo.status = statusLabels[Math.floor(Math.random() * statusLabels.length)];
        }

        // --- DEV: Fill missing startedOnMillis ---
        if (!wo.startedOnMillis) {
          // Random date within the last 90 days
          wo.startedOnMillis = Date.now() - Math.floor(Math.random() * 90 * 24 * 60 * 60 * 1000);
        }

        // --- DEV: Add 2-7 random inventory items as workorder lines ---
        let lineCount = Math.floor(Math.random() * 6) + 2; // 2 to 7
        let usedIndices = new Set();
        let lines = [];
        for (let i = 0; i < lineCount; i++) {
          let idx;
          // Pick a unique random item if possible, otherwise allow repeats
          if (usedIndices.size < inventoryItems.length) {
            do { idx = Math.floor(Math.random() * inventoryItems.length); } while (usedIndices.has(idx));
            usedIndices.add(idx);
          } else {
            idx = Math.floor(Math.random() * inventoryItems.length);
          }
          let line = cloneDeep(WORKORDER_ITEM_PROTO);
          line.id = generateRandomID();
          line.qty = 1;
          line.inventoryItem = cloneDeep(inventoryItems[idx]);
          lines.push(line);
        }
        wo.workorderLines = lines;

        return wo;
      });

      let linkedCount = workorders.filter(wo => wo.customerID).length;

      console.log("=== DEV IMPORT PREVIEW: WORKORDERS ===");
      console.log("Total workorders:", workorders.length);
      console.log("Linked to customers:", linkedCount);
      console.log("Unlinked:", workorders.length - linkedCount);
      console.log("Inventory pool size:", inventoryItems.length);
      console.log("Statuses pool:", statusLabels);
      console.log(JSON.stringify(workorders.slice(0, 5), null, 2));

      // Clear existing workorders if checked, then save new
      let clearedCount = 0;
      if (sClearWorkorders) {
        let cleared = await dbClearCollection("open-workorders");
        clearedCount = cleared.deletedCount;
        console.log("Cleared workorders:", clearedCount, "docs");
      }
      for (let i = 0; i < workorders.length; i++) {
        await dbSaveOpenWorkorder(workorders[i]);
        if ((i + 1) % 50 === 0) console.log("Saved", i + 1, "/", workorders.length);
      }
      _setResult("DEV Imported " + workorders.length + " workorders" + (sClearWorkorders ? " (cleared " + clearedCount + " old)" : " (merged)") + ", " + linkedCount + " linked, each with 2-7 random items");
    } catch (err) {
      console.error("Dev import workorders error:", err);
      _setResult("Error: " + err.message);
    } finally {
      _setImporting("");
    }
  }

  // --- Import Statuses ---
  async function handleImportStatuses() {
    try {
      _setImporting("statuses");
      _setResult("");
      let res = await fetch(process.env.PUBLIC_URL + "/import_data/statuses.csv");
      let text = await res.text();
      let rows = parseCSV(text);

      let statuses = rows.map(row => {
        let bgColor = row["Color"] || "";
        let textColor = bgColor ? bestForegroundHex(bgColor) : "black";
        return {
          id: generateRandomID(),
          label: row["Status"] || "",
          textColor: textColor,
          backgroundColor: bgColor || "rgb(192,192,192)",
          removable: true,
        };
      });

      console.log("=== IMPORT PREVIEW: STATUSES ===");
      console.log("Total statuses:", statuses.length);
      console.log(JSON.stringify(statuses, null, 2));

      // Get current settings statuses
      let currentStatuses = useSettingsStore.getState().getSettings()?.statuses || [];
      let nonRemovable = currentStatuses.filter(s => s.removable === false);

      let newStatuses;
      if (sClearStatuses) {
        // Keep non-removable, replace removable with imported
        newStatuses = [...nonRemovable, ...statuses];
        console.log("Kept", nonRemovable.length, "non-removable, replaced removable with", statuses.length, "imported");
      } else {
        // Merge: keep existing, add imported
        newStatuses = [...currentStatuses, ...statuses];
        console.log("Merged:", currentStatuses.length, "existing +", statuses.length, "imported");
      }

      await dbSaveSettingsField("statuses", newStatuses);
      _setResult("Imported " + statuses.length + " statuses" + (sClearStatuses ? " (kept " + nonRemovable.length + " non-removable)" : " (merged)"));
    } catch (err) {
      console.error("Import statuses error:", err);
      _setResult("Error: " + err.message);
    } finally {
      _setImporting("");
    }
  }

  // --- Lightspeed handlers ---

  async function handleLsConnect() {
    try {
      _setLsImporting("connecting");
      _setLsResult("");
      const tenantID = zSettings?.tenantID;
      const storeID = zSettings?.storeID;
      if (!tenantID || !storeID) {
        _setLsResult("Error: tenantID or storeID not found in settings");
        _setLsImporting("");
        return;
      }
      const res = await lightspeedInitiateAuthCallable({ tenantID, storeID });
      if (res.data?.authUrl) {
        window.open(res.data.authUrl, "_blank");
        _setLsResult("OAuth window opened. Complete authorization, then click 'Check Connection'.");
      } else {
        _setLsResult("Error: No auth URL returned");
      }
    } catch (e) {
      _setLsResult("Error: " + (e.message || "Connection failed"));
    }
    _setLsImporting("");
  }

  async function handleLsCheckConnection() {
    try {
      _setLsImporting("checking");
      _setLsResult("");
      const tenantID = zSettings?.tenantID;
      const storeID = zSettings?.storeID;
      const res = await lightspeedCheckConnectionCallable({ tenantID, storeID });
      if (res.data?.connected) {
        _setLsConnected(true);
        _setLsAccountName(res.data.accountName || "");
        _setLsResult("Connected to Lightspeed" + (res.data.accountName ? ": " + res.data.accountName : ""));
      } else {
        _setLsConnected(false);
        _setLsResult("Not connected" + (res.data?.error ? ": " + res.data.error : ""));
      }
    } catch (e) {
      _setLsConnected(false);
      _setLsResult("Error: " + (e.message || "Check failed"));
    }
    _setLsImporting("");
  }

  async function handleLsImport() {
    try {
      _setLsImporting("importing");
      _setLsResult("");
      const tenantID = zSettings?.tenantID;
      const storeID = zSettings?.storeID;
      const res = await lightspeedImportDataCallable({
        tenantID,
        storeID,
        importType: "all",
        clearExisting: sClearLsData,
      });
      if (res.data?.success) {
        let msg = "Import complete.";
        if (res.data.customerCount != null) msg += ` Customers: ${res.data.customerCount} (${res.data.duplicatesRemoved || 0} duplicates removed).`;
        if (res.data.workorderCount != null) msg += ` Workorders: ${res.data.workorderCount} (${res.data.linked || 0} linked, ${res.data.unlinked || 0} unlinked).`;
        _setLsResult(msg);
      } else {
        _setLsResult("Import returned no success flag");
      }
    } catch (e) {
      _setLsResult("Error: " + (e.message || "Import failed"));
    }
    _setLsImporting("");
  }

  let buttonStyle = {
    width: 200,
    height: 80,
    borderWidth: 1,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 10,
    backgroundColor: C.listItemWhite,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    opacity: sImporting ? 0.5 : 1,
  };

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
      >
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={handleImportInventory}
              disabled={!!sImporting}
              style={buttonStyle}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: C.text,
                  marginTop: 8,
                  fontWeight: "500",
                }}
              >
                {sImporting === "inventory" ? "Importing..." : "Import Inventory"}
              </Text>
            </TouchableOpacity>
            <CheckBox_
              isChecked={sClearInventory}
              onCheck={() => _setClearInventory(!sClearInventory)}
              text={"Clear existing"}
              buttonStyle={{ marginTop: 7 }}
            />
          </View>
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={handleImportCustomers}
              disabled={!!sImporting}
              style={buttonStyle}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: C.text,
                  marginTop: 8,
                  fontWeight: "500",
                }}
              >
                {sImporting === "customers" ? "Importing..." : "Import Customers"}
              </Text>
            </TouchableOpacity>
            <CheckBox_
              isChecked={sClearCustomers}
              onCheck={() => _setClearCustomers(!sClearCustomers)}
              text={"Clear existing"}
              buttonStyle={{ marginTop: 7 }}
            />
          </View>
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={sDevWorkorders ? handleImportWorkordersDev : handleImportWorkorders}
              disabled={!!sImporting}
              style={{
                ...buttonStyle,
                borderColor: sDevWorkorders ? C.orange : C.buttonLightGreenOutline,
              }}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: C.text,
                  marginTop: 8,
                  fontWeight: "500",
                }}
              >
                {sImporting === "workorders" ? "Importing..." : "Import Workorders"}
              </Text>
            </TouchableOpacity>
            <CheckBox_
              isChecked={sClearWorkorders}
              onCheck={() => _setClearWorkorders(!sClearWorkorders)}
              text={"Clear existing"}
              buttonStyle={{ marginTop: 7 }}
            />
            <CheckBox_
              isChecked={sDevWorkorders}
              onCheck={() => _setDevWorkorders(!sDevWorkorders)}
              text={"Dev mode (fill random items)"}
              buttonStyle={{ marginTop: 4 }}
            />
          </View>
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={handleImportStatuses}
              disabled={!!sImporting}
              style={buttonStyle}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: C.text,
                  marginTop: 8,
                  fontWeight: "500",
                }}
              >
                {sImporting === "statuses" ? "Importing..." : "Import Statuses"}
              </Text>
            </TouchableOpacity>
            <CheckBox_
              isChecked={sClearStatuses}
              onCheck={() => _setClearStatuses(!sClearStatuses)}
              text={"Clear existing"}
              buttonStyle={{ marginTop: 7 }}
            />
          </View>
        </View>
        {sResult ? (
          <Text style={{ fontSize: 13, color: C.green, marginTop: 10, textAlign: "center" }}>
            {sResult}
          </Text>
        ) : null}

        {/* --- Lightspeed Import Section --- */}
        <View style={{ width: "100%", height: 1, backgroundColor: C.buttonLightGreenOutline, marginTop: 20, marginBottom: 10 }} />
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 10 }}>
          Lightspeed Import
        </Text>
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={sLsConnected ? handleLsCheckConnection : handleLsConnect}
              disabled={!!sLsImporting}
              style={{
                ...buttonStyle,
                opacity: sLsImporting ? 0.5 : 1,
                backgroundColor: sLsConnected ? C.green : C.listItemWhite,
              }}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: sLsConnected ? "white" : C.text,
                  marginTop: 8,
                  fontWeight: "500",
                  textAlign: "center",
                }}
              >
                {sLsImporting === "connecting"
                  ? "Connecting..."
                  : sLsImporting === "checking"
                  ? "Checking..."
                  : sLsConnected
                  ? "Connected"
                  : "Connect to Lightspeed"}
              </Text>
            </TouchableOpacity>
          </View>
          {!sLsConnected && (
            <View style={{ alignItems: "center", margin: 10 }}>
              <TouchableOpacity
                onPress={handleLsCheckConnection}
                disabled={!!sLsImporting}
                style={{
                  ...buttonStyle,
                  opacity: sLsImporting ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: C.text,
                    fontWeight: "500",
                    textAlign: "center",
                  }}
                >
                  {sLsImporting === "checking" ? "Checking..." : "Check Connection"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={handleLsImport}
              disabled={!!sLsImporting || !sLsConnected}
              style={{
                ...buttonStyle,
                opacity: sLsImporting || !sLsConnected ? 0.5 : 1,
              }}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: C.text,
                  marginTop: 8,
                  fontWeight: "500",
                  textAlign: "center",
                }}
              >
                {sLsImporting === "importing" ? "Importing..." : "Import from Lightspeed"}
              </Text>
            </TouchableOpacity>
            <CheckBox_
              isChecked={sClearLsData}
              onCheck={() => _setClearLsData(!sClearLsData)}
              text={"Clear existing data"}
              buttonStyle={{ marginTop: 7 }}
            />
          </View>
        </View>
        {sLsResult ? (
          <Text style={{ fontSize: 13, color: sLsResult.startsWith("Error") ? C.red : C.green, marginTop: 10, textAlign: "center" }}>
            {sLsResult}
          </Text>
        ) : null}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const TextTemplatesComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sSelectedTemplateId, _setSelectedTemplateId] = useState(null);
  const [sLocalEdits, _setLocalEdits] = useState({});
  const [sNewTemplateIds, _setNewTemplateIds] = useState([]);
  const [sUnsavedTemplates, _setUnsavedTemplates] = useState([]);
  const cursorPositionRefs = useRef({});
  const textInputRefs = useRef({});

  let savedTemplates = zSettingsObj?.textTemplates || [];
  let templates = [...sUnsavedTemplates, ...savedTemplates];

  function getLocalValue(templateId, field) {
    let key = templateId + "_" + field;
    return key in sLocalEdits ? sLocalEdits[key] : null;
  }

  function isNewTemplate(templateId) {
    return sNewTemplateIds.indexOf(templateId) !== -1;
  }

  function handleAddTemplate() {
    let newTemplate = {
      id: generateRandomID(),
      name: "",
      message: "",
    };
    _setUnsavedTemplates([newTemplate, ...sUnsavedTemplates]);
    _setNewTemplateIds([...sNewTemplateIds, newTemplate.id]);
    _setSelectedTemplateId(newTemplate.id);
  }

  function handleSaveNewTemplate(templateObj) {
    let finalTemplate = {
      ...templateObj,
      name: getLocalValue(templateObj.id, "name") ?? templateObj.name,
      message: getLocalValue(templateObj.id, "message") ?? templateObj.message,
    };
    let arr = [finalTemplate, ...savedTemplates];
    handleSettingsFieldChange("textTemplates", arr);
    _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
    _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_name"];
    delete newEdits[templateObj.id + "_message"];
    _setLocalEdits(newEdits);
  }

  function handleDeleteTemplate(templateObj) {
    if (isNewTemplate(templateObj.id)) {
      _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
      _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    } else {
      let arr = savedTemplates.filter((t) => t.id !== templateObj.id);
      handleSettingsFieldChange("textTemplates", arr);
    }
    if (sSelectedTemplateId === templateObj.id) _setSelectedTemplateId(null);
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_name"];
    delete newEdits[templateObj.id + "_message"];
    _setLocalEdits(newEdits);
  }

  function handleTemplateNameChange(templateObj, val) {
    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_name"]: val });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, name: val };
        return t;
      });
      handleSettingsFieldChange("textTemplates", arr);
    }
  }

  function handleTemplateMessageChange(templateObj, val) {
    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_message"]: val });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, message: val };
        return t;
      });
      handleSettingsFieldChange("textTemplates", arr);
    }
  }

  function handleInsertVariable(templateObj, variableStr) {
    let currentMessage = isNewTemplate(templateObj.id)
      ? (getLocalValue(templateObj.id, "message") ?? templateObj.message)
      : templateObj.message;
    let cursorPos =
      cursorPositionRefs.current[templateObj.id] ?? currentMessage.length;
    let before = currentMessage.slice(0, cursorPos);
    let after = currentMessage.slice(cursorPos);
    let newMessage = before + variableStr + after;

    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_message"]: newMessage });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, message: newMessage };
        return t;
      });
      handleSettingsFieldChange("textTemplates", arr);
    }
    cursorPositionRefs.current[templateObj.id] =
      cursorPos + variableStr.length;
    textInputRefs.current[templateObj.id]?.focus();
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center" }}
      >
        {/* Add button */}
        <View style={{ width: "100%", alignItems: "flex-start" }}>
          <BoxButton1 onPress={handleAddTemplate} />
        </View>

        {/* Templates list */}
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            renderItem={({ item: templateObj }) => {
              let isSelected = sSelectedTemplateId === templateObj.id;

              return (
                <View
                  style={{
                    width: "100%",
                    marginBottom: 15,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? C.green
                      : C.buttonLightGreenOutline,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: C.backgroundListWhite,
                  }}
                >
                  {/* Row: template name + delete button */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <TextInput
                      onChangeText={(val) =>
                        handleTemplateNameChange(templateObj, val)
                      }
                      onFocus={() => _setSelectedTemplateId(templateObj.id)}
                      placeholder="Template name..."
                      placeholderTextColor={gray(0.3)}
                      style={{
                        flex: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderWidth: 1,
                        borderRadius: 5,
                        padding: 5,
                        color: C.text,
                        outlineWidth: 0,
                        fontWeight: "500",
                        fontSize: 14,
                      }}
                      value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "name") ?? templateObj.name) : templateObj.name}
                    />
                    <Tooltip text="Delete template" position="top">
                      <BoxButton1
                        onPress={() => handleDeleteTemplate(templateObj)}
                        style={{ marginLeft: 10 }}
                        iconSize={15}
                        icon={ICONS.close1}
                      />
                    </Tooltip>
                  </View>

                  {/* Message body */}
                  <TextInput
                    ref={(el) => { if (el) textInputRefs.current[templateObj.id] = el; }}
                    multiline={true}
                    onChangeText={(val) =>
                      handleTemplateMessageChange(templateObj, val)
                    }
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    onSelectionChange={(event) => {
                      let { start } = event.nativeEvent.selection;
                      cursorPositionRefs.current[templateObj.id] = start;
                    }}
                    onContentSizeChange={(event) => {
                      let el = event?.target || event?.nativeEvent?.target;
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                      }
                    }}
                    placeholder="Message body..."
                    placeholderTextColor={gray(0.3)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 8,
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 14,
                      minHeight: 80,
                      textAlignVertical: "top",
                      overflow: "hidden",
                    }}
                    value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "message") ?? templateObj.message) : templateObj.message}
                  />

                  {/* Variable buttons - shown when template is selected */}
                  {isSelected && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      {TEXT_TEMPLATE_VARIABLES.map((v) => (
                        <TouchableOpacity
                          key={v.variable}
                          onPress={() =>
                            handleInsertVariable(templateObj, v.variable)
                          }
                          style={{
                            backgroundColor: C.buttonLightGreen,
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            borderRadius: 5,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            marginRight: 5,
                            marginBottom: 5,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: C.text }}>
                            {v.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Save button - only for new unsaved templates */}
                  {isNewTemplate(templateObj.id) && (
                    <Button_
                      colorGradientArr={COLOR_GRADIENTS.greenblue}
                      text="SAVE"
                      onPress={() => handleSaveNewTemplate(templateObj)}
                      textStyle={{ color: C.textWhite, fontSize: 13 }}
                      buttonStyle={{
                        alignSelf: "flex-end",
                        marginTop: 8,
                        width: 100,
                      }}
                    />
                  )}
                </View>
              );
            }}
          />
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};
