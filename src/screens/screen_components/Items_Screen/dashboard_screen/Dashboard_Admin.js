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
  addDashesToPhone,
  bestForegroundHex,
  checkInputForNumbersOnly,
  clog,
  generateRandomID,
  generateTimesForListDisplay,
  log,
  makeGrey,
  moveItemInArr,
  NUMS,
  removeDashesFromPhone,
} from "../../../../utils";
import {
  // useDatabaseStore,
  useLoginStore,
  useSettingsStore,
} from "../../../../stores";
import {
  Button,
  Button_,
  CheckBox_,
  DropdownMenu,
  Image_,
  NumberSpinner_,
  ScreenModal,
  TimeSpinner,
} from "../../../../components";
import { cloneDeep, set } from "lodash";
import { dbSetSettings } from "../../../../db_call_wrapper";
import { Children, useEffect, useRef, useState } from "react";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import { DISCOUNT_TYPES, PERMISSION_LEVELS } from "../../../../constants";
import { APP_USER } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";
import { useCallback } from "react";
import { ColorWheel } from "../../../../ColorWheel";

export function Dashboard_Admin({}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  // const _zSetDatabaseItem = useDatabaseStore((state) => state.setSettings);
  const _zSetSettingsField = useSettingsStore((state) => state.setField);

  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalUserObj, _setFacialRecognitionModalUserObj] =
    useState(false);
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState(null);
  const [sExpand, _setExpand] = useState("Store Info");

  ///////////////////////////////////////////////////////////

  function commitUserInfoChange(userObj, sNewUserObj) {
    // let settingsObj = cloneDeep(zSettingsObj);
    // let users = zSettingsObj.users.map(user => {
    //   if (user.id === userObj.id) {
    //     return userObj
    //     return user
    //   }
    // })
    let userArr;
    if (sNewUserObj) {
      userArr = [userObj, ...zSettingsObj.users];
      // _setNewUserObj();
    } else {
      userArr = zSettingsObj.users.map((o) => {
        if (o.id === userObj.id) return userObj;
        return o;
      });
    }

    _zSetSettingsField("users", userArr);
    // settingsObj.users = userArr;
    // _zSetSettingsObj({ settingsObj });
    // dbSetSettings(settingsObj);
  }

  function handleRemoveUserPress(userObj) {
    let userArr = zSettingsObj.users.filter((o) => o.id != userObj.id);
    _zSetSettingsField("users", userArr);
  }

  function handleDescriptorCapture(userObj, desc) {
    // let settingsObj = cloneDeep(zSettingsObj);
    let userArr = zSettingsObj.users.map((o) => {
      if (o.id === userObj.id) {
        // o.faceDescriptor = [...desc];
        return { ...o, faceDescriptor: desc };
      }
      return o;
    });
    _zSetSettingsField("users", userArr);
  }

  function handleSettingsFieldChange(fieldName, fieldValue) {
    _zSetSettingsField(fieldName, fieldValue);
  }

  //////////////////////////////////////////////////////////////////////////
  // Main component /////////////////////////////////////////////////////////
  return (
    <ScrollView
      style={{
        padding: 0,
        paddingTop: 20,
      }}
    >
      {/**Modals that will appear when user takes an action */}
      {sFacialRecognitionModalUserObj ? (
        <FaceEnrollModalScreen
          userObj={sFacialRecognitionModalUserObj}
          handleDescriptorCapture={handleDescriptorCapture}
          handleExitPress={() => _setFacialRecognitionModalUserObj(null)}
        />
      ) : null}
      {sPunchClockUserObj ? (
        <UserClockHistoryModal
          handleExit={() => _setPunchClockUserObj()}
          userObj={sPunchClockUserObj}
        />
      ) : null}

      {/**left-side column container */}
      <View
        style={{
          // backgroundColor: "blue",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 5,
        }}
      >
        <View
          style={{
            width: "30%",
            alignItems: "flex-start",
            borderRadius: 5,
            paddingRight: 10,
            paddingLeft: 5,
            backgroundColor: C.backgroundListWhite,
            borderColor: C.buttonLightGreenOutline,
            height: 300,
            borderWidth: 1,
            paddingTop: 13,
          }}
        >
          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "User Accounts"}
            handleExpandPress={() =>
              _setExpand(sExpand === "User Accounts" ? null : "User Accounts")
            }
            text={"app user control"}
            style={{
              fontWeight: sExpand === "User Accounts" ? 500 : null,
              color: sExpand === "User Accounts" ? C.lightred : makeGrey(0.6),
            }}
          />
          <VerticalSpacer />
          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "Payment Processing"}
            handleExpandPress={() =>
              _setExpand(
                sExpand === "Payment Processing" ? null : "Payment Processing"
              )
            }
            text={"payment processing"}
            style={{
              fontWeight: sExpand === "Payment Processing" ? 500 : null,

              color:
                sExpand === "Payment Processing" ? C.lightred : makeGrey(0.6),
            }}
          />
          <VerticalSpacer />

          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "Workorder Statuses"}
            handleExpandPress={() =>
              _setExpand(
                sExpand === "Workorder Statuses" ? null : "Workorder Statuses"
              )
            }
            text={"workorder statuses"}
            style={{
              fontWeight: sExpand === "Workorder Statuses" ? 500 : null,

              color:
                sExpand === "Workorder Statuses" ? C.lightred : makeGrey(0.6),
            }}
          />
          <VerticalSpacer />

          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "Bike Options"}
            handleExpandPress={() =>
              _setExpand(sExpand === "Bike Options" ? null : "Bike Options")
            }
            style={{
              fontWeight: sExpand === "Bike Options" ? 500 : null,

              color: sExpand === "Bike Options" ? C.lightred : makeGrey(0.6),
            }}
            text={"Bike Options"}
          />
          <VerticalSpacer />

          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "Discounts"}
            handleExpandPress={() =>
              _setExpand(sExpand === "Discounts" ? null : "Discounts")
            }
            style={{
              fontWeight: sExpand === "Discounts" ? 500 : null,

              color: sExpand === "Discounts" ? C.lightred : makeGrey(0.6),
            }}
            text={"Discounts"}
          />
          <VerticalSpacer />
          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "Wait Times"}
            handleExpandPress={() =>
              _setExpand(sExpand === "Wait Times" ? null : "Wait Times")
            }
            style={{
              fontWeight: sExpand === "Wait Times" ? 500 : null,

              color: sExpand === "Wait Times" ? C.lightred : makeGrey(0.6),
            }}
            text={"Wait Times"}
          />
          <VerticalSpacer />
          <SettingsLabelListComponent
            // style={{ width: "100%" }}
            selected={sExpand === "Store Info"}
            handleExpandPress={() =>
              _setExpand(sExpand === "Store Info" ? null : "Store Info")
            }
            style={{
              fontWeight: sExpand === "Store Info" ? 500 : null,

              color: sExpand === "Store Info" ? C.lightred : makeGrey(0.6),
            }}
            text={"Store Info"}
          />
          <VerticalSpacer />
        </View>

        {/**right-side column container */}
        <View
          style={{
            width: "70%",
            alignItems: "center",
            // flex: 1,
            // paddingHorizontal: 10,
          }}
        >
          <Text
            style={{
              // backgroundColor: C.backgroundListWhite,
              // borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              color: makeGrey(0.6),
              marginBottom: 10,
              fontSize: 17,
              fontWeight: 500,
              // paddingHorizontal: 20,
              // paddingVertical: 10,
            }}
          >
            {sExpand?.toUpperCase()}
          </Text>
          <PaymentProcessingComponent
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
            sExpand={sExpand === "Payment Processing"}
          />
          <AppUserListComponent
            handleRemoveUserPress={handleRemoveUserPress}
            zSettingsObj={zSettingsObj}
            commitUserInfoChange={commitUserInfoChange}
            _setFacialRecognitionModalUserObj={
              _setFacialRecognitionModalUserObj
            }
            sExpand={sExpand === "User Accounts"}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
          <StatusesComponent
            sExpand={sExpand === "Workorder Statuses"}
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
          <BikeBrandsComponent
            sExpand={sExpand === "Bike Options"}
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
          <DiscountsComponent
            sExpand={sExpand === "Discounts"}
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
          <WaitTimesComponent
            sExpand={sExpand === "Wait Times"}
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
          <StoreInfoComponent
            sExpand={sExpand === "Store Info"}
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
        </View>
      </View>
    </ScrollView>
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
        backgroundColor: makeGrey(0.1),
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

        ...style,
      }}
    >
      {children}
    </View>
  );
}

function SettingsLabelListComponent({
  text,
  style = {},
  icon,
  handleExpandPress,
  selected,
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
        // backgroundColor: expanded ? "transparent" : makeGrey(0.4),
        // paddingHorizontal:
        // backgroundColor: "blue",
      }}
    >
      <Text
        style={{
          fontSize: 16,
          color: makeGrey(0.5),
          // alignSelf: "flex-end",
          ...style,
        }}
      >
        {text.toUpperCase()}
      </Text>
      <Image_ size={ICON_SIZE} icon={icon || ICONS.expandGreen} />
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
        backgroundColor: C.backgroundListWhite,
        borderRadius: 5,
        alignItems: "flex-end",
        padding: 10,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function BoxButton1({ label, style = {}, icon, iconSize, textStyle, onPress }) {
  return (
    <Button_
      text={label}
      icon={icon || ICONS.add}
      iconSize={iconSize || 30}
      textStyle={{ fontSize: 14, color: makeGrey(0.6), ...textStyle }}
      buttonStyle={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderRadius: 5,
        backgroundColor: makeGrey(0.2),
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
    />
  );
}

////////////////////////////////////////////////////////////////////////////////////

const AppUserListComponent = ({
  zSettingsObj,
  commitUserInfoChange,
  _setFacialRecognitionModalUserObj,
  sExpand,
  handleRemoveUserPress,
  handleSettingsFieldChange,
}) => {
  const [sEditUserIndex, _setEditUserIndex] = useState(null);
  const [sShowPinIndex, _setShowPinIndex] = useState(false);
  const [sShowWageIndex, _setShowWageIndex] = useState(false);
  const [sNewUserObj, _setNewUserObj] = useState(null);
  // const [sExpand, _setExpand] = useState(false);

  const userListItemRefs = useRef([]);

  function handleNewUserPress() {
    let userObj = cloneDeep(APP_USER);
    userObj.id = generateRandomID();
    let role = PERMISSION_LEVELS.find((o) => (o.name = "User"));
    userObj.permissions = role;
    commitUserInfoChange(userObj, true);
    // _setNewUserObj(userObj);
    _setEditUserIndex(0);
  }

  return (
    <BoxContainerOuterComponent
      style={{ width: "100%", backgroundColor: "transparent" }}
    >
      {/**Flatlist showing all app users, edit functions. sPunchClockUserObj */}
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{
            backgroundColor: makeGrey(0.045),
            width: "80%",
            // justifyContent: "flex-end",
          }}
        >
          <View style={{ width: "100%", justifyContent: "flex-end" }}>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  width: "40%",
                  color: C.textMain,
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
                  color: C.textMain,
                }}
                value={zSettingsObj?.activeLoginTimeoutSeconds}
              />
            </View>
          </View>
          <View
            style={{ width: "100%", justifyContent: "flex-end", marginTop: 10 }}
          >
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  width: "40%",
                  color: C.textMain,
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
                  color: C.textMain,
                  outlineWidth: 0,
                }}
                value={Math.round(zSettingsObj?.idleLoginTimeoutHours)}
              />
            </View>
            <View style={{ width: "100%", justifyContent: "flex-end" }}>
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <Text
                  style={{
                    width: "40%",
                    color: C.textMain,
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
                    color: C.textMain,
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
              buttonStyle={{ justifyContent: "flex-start" }}
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
          <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
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
            <BoxButton1
              icon={ICONS.add}
              onPress={handleNewUserPress}
              style={
                {
                  // borderRadius: 5,
                  // paddingTop: 3,
                  // paddingHorizontal: 0,
                  // paddingV
                }
              }
            />
          </View>
          <View style={{ width: "100%" }}>
            <FlatList
              ItemSeparatorComponent={() => (
                <View
                  style={{
                    height: 5,
                    // width: "100%",
                    // backgroundColor: APP_BASE_COLORS.buttonLightGreenOutline,
                  }}
                />
              )}
              style={{ borderRadius: 5 }}
              data={
                sExpand
                  ? zSettingsObj
                    ? sNewUserObj
                      ? [sNewUserObj, ...zSettingsObj.users]
                      : zSettingsObj.users
                    : []
                  : []
              }
              renderItem={(obj) => {
                obj = cloneDeep(obj);
                let idx = obj.index;
                let userObj = obj.item;
                let editable = sEditUserIndex === idx;
                // log("user", userObj);
                // log(userObj);
                return (
                  <View
                    ref={(element) => (userListItemRefs.current[idx] = element)}
                    style={{
                      flexDirection: "row",
                      // paddingRight: 20,
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
                        // paddingTop: 3,
                        paddingLeft: 0,
                        marginRight: 5,
                        justifyContent: "space-around",
                        width: "20%",
                      }}
                    >
                      <Button_
                        text={"Edit"}
                        onPress={() => {
                          _setEditUserIndex(
                            sEditUserIndex != null ? null : idx
                          );
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
                          width: 80,
                        }}
                        textStyle={{
                          color: editable ? C.textWhite : C.textMain,
                          fontSize: 12,
                        }}
                      />
                      <Button_
                        text={"Enroll"}
                        onPress={() => {
                          _setFacialRecognitionModalUserObj(userObj);
                        }}
                        enabled={editable}
                        buttonStyle={{
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          backgroundColor: C.buttonLightGreen,
                          width: 80,
                          paddingVertical: 2,

                          paddingHorizontal: 0,
                          marginRight: 4,
                          borderRadius: 5,
                        }}
                        textStyle={{ fontSize: 12 }}
                      />
                      <Button_
                        text={sEditUserIndex === idx ? "Remove" : "Clock"}
                        onPress={() => {
                          if (sEditUserIndex === idx) {
                            handleRemoveUserPress(userObj);
                          } else {
                            _setPunchClockUserObj(userObj);
                          }
                        }}
                        buttonStyle={{
                          borderWidth: 1,
                          paddingVertical: 2,

                          borderColor: C.buttonLightGreenOutline,
                          backgroundColor: C.buttonLightGreen,
                          borderRadius: 5,
                          paddingHorizontal: 0,
                          width: 80,
                        }}
                        textStyle={{ fontSize: 12 }}
                      />
                    </View>
                    <View
                      style={{
                        justifyContent: "center",
                        // backgroundColor: "red",
                        marginTop: 2,
                        width: "80%",
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
                          value={addDashesToPhone(userObj.phone)}
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
                            dataArr={
                              editable
                                ? PERMISSION_LEVELS.map((o) => o.name)
                                : []
                            }
                            onSelect={(item) => {
                              if (!editable) return;
                              let perm = PERMISSION_LEVELS.find(
                                (o) => o.name == item
                              );
                              userObj.permissions = perm;
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
                              color: C.textMain,
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
                            placeholder={
                              sShowPinIndex === idx ? "pin..." : "PIN"
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
      ) : null}
    </BoxContainerOuterComponent>
  );
};

const BikeBrandsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerOuterComponent style={{ marginBottom: 20 }}>
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{ width: "70%", alignItems: "center" }}
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
              <Text style={{ color: C.textMain }}>Category Name:</Text>
              <TextInput
                style={{
                  width: "50%",
                  marginLeft: 10,
                  padding: 5,
                  borderWidth: 2,
                  borderRadius: 5,
                  borderColor: C.buttonLightGreenOutline,
                  outlineWidth: 0,
                  color: C.textMain,
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
                          color: C.textMain,
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
              <Text style={{ color: C.textMain }}>Category Name:</Text>
              <TextInput
                style={{
                  width: "50%",
                  marginLeft: 10,
                  padding: 5,
                  borderWidth: 2,
                  borderRadius: 5,
                  borderColor: C.buttonLightGreenOutline,
                  outlineWidth: 0,
                  color: C.textMain,
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
                          color: C.textMain,
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
              <Text style={{ color: C.textMain, marginRight: 20 }}>
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
                          color: C.textMain,
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
      ) : null}
    </BoxContainerOuterComponent>
  );
};

const DiscountsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerOuterComponent style={{}}>
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{ width: "80%", alignItems: "center" }}
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
            <View style={{ marginTop: 10, width: "100%" }}>
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
                        placeholderTextColor={makeGrey(0.15)}
                        style={{
                          borderColor: C.buttonLightGreenOutline,
                          borderWidth: 1,
                          borderRadius: 5,
                          padding: 5,
                          width: "80%",
                          textAlign: "center",
                          color: C.textMain,
                          outlineWidth: 0,
                          fontSize: 13,
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
                            let discountsArr = zSettingsObj.discounts.map(
                              (o) => {
                                if (o.id === item.id)
                                  return { ...o, type: val };
                                return o;
                              }
                            );
                            handleSettingsFieldChange(
                              "discounts",
                              discountsArr
                            );
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
      ) : null}
    </BoxContainerOuterComponent>
  );
};

const WaitTimesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerOuterComponent style={{}}>
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{ width: "80%", alignItems: "center" }}
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
                <Text style={{ fontColor: C.textMain }}>Label</Text>
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
                    fontColor: C.textMain,
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
                        placeholderTextColor={makeGrey(0.15)}
                        style={{
                          borderColor: C.buttonLightGreenOutline,
                          borderWidth: 1,
                          borderRadius: 5,
                          padding: 5,
                          width: "70%",
                          textAlign: "center",
                          color: C.textMain,
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
                              return { ...o, maxVaitTimeDays: val };
                            return o;
                          });
                          handleSettingsFieldChange("waitTimes", arr);
                        }}
                        placeholder={"Days"}
                        placeholderTextColor={makeGrey(0.15)}
                        style={{
                          borderColor: C.buttonLightGreenOutline,
                          borderWidth: 1,
                          borderRadius: 5,
                          padding: 5,
                          width: "20%",
                          textAlign: "center",
                          color: C.textMain,
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
      ) : null}
    </BoxContainerOuterComponent>
  );
};

const StoreInfoComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();
  if (!zSettingsObj) return null;
  return (
    <BoxContainerOuterComponent style={{}}>
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{ width: "80%", alignItems: "center" }}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              Display Name:
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={zSettingsObj.storeInfo.displayName}
              onChangeText={() => {}}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              Phone Number:
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={addDashesToPhone(zSettingsObj.storeInfo.phone)}
              onChangeText={() => {}}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              Street:
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={zSettingsObj.storeInfo.address.street}
              onChangeText={(street) => {
                handleSettingsFieldChange("storeInfo", {
                  ...zSettingsObj.storeInfo,
                  address: {
                    ...zSettingsObj.storeInfo.address,
                    street,
                  },
                });
              }}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              Unit:
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={zSettingsObj.storeInfo.address.unit}
              onChangeText={(unit) => {
                handleSettingsFieldChange("storeInfo", {
                  ...zSettingsObj.storeInfo,
                  address: {
                    ...zSettingsObj.storeInfo.address,
                    unit,
                  },
                });
              }}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              City:
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={zSettingsObj.storeInfo.address.city}
              onChangeText={(city) => {
                handleSettingsFieldChange("storeInfo", {
                  ...zSettingsObj.storeInfo,
                  address: {
                    ...zSettingsObj.storeInfo.address,
                    city,
                  },
                });
              }}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              State or Abbrev.
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={zSettingsObj.storeInfo.address.state}
              onChangeText={(state) => {
                handleSettingsFieldChange("storeInfo", {
                  ...zSettingsObj.storeInfo,
                  address: {
                    ...zSettingsObj.storeInfo.address,
                    state,
                  },
                });
              }}
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
                fontColor: C.textMain,
                width: "30%",
              }}
            >
              Zip Code:
            </Text>
            <TextInput
              style={{
                width: "70%",
                marginLeft: 10,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                padding: 3,
                paddingRight: 7,
                textAlign: "right",
                outlineWidth: 0,
              }}
              value={zSettingsObj.storeInfo.address.zip}
              onChangeText={(zip) => {
                handleSettingsFieldChange("storeInfo", {
                  ...zSettingsObj.storeInfo,
                  address: {
                    ...zSettingsObj.storeInfo.address,
                    zip,
                  },
                });
              }}
            />
          </View>
          {Object.values(zSettingsObj?.storeHours.standard).map((item, idx) => (
            <View
              style={{
                width: "100%",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  // width: "50%",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  // backgroundColor: "red",
                }}
              >
                <Text style={{ width: 50 }}>Open:</Text>
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
                    outlineColor: "transparent",
                    backgroundColor: "transparent",
                    width: 30,
                  }}
                  value={item.open.split(":")[1].split(" ")[0]}
                />
              </View>
              <CheckBox_
                buttonStyle={{ marginLeft: 20 }}
                text={"Open"}
                isChecked={item.isOpen}
              />
            </View>
          ))}
        </BoxContainerInnerComponent>
      ) : null}
    </BoxContainerOuterComponent>
  );
};

const PaymentProcessingComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerOuterComponent>
      {sExpand ? (
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
              width: "100%",
              alignItems: "flex-end",
              marginTop: 10,
            }}
          >
            <View
              style={{
                borderRadius: 5,
                backgroundColor: "rgba(0,0,0,.1)",
                padding: 10,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{ width: "100%", justifyContent: "flex-end" }}
                ></View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    marginBottom: 10,
                    alignItems: "center",
                    // backgroundColor: "red",
                  }}
                >
                  <BoxButton1
                    onPress={() => {
                      log("need new card reader function");
                    }}
                    icon={ICONS.add}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={{ fontSize: 12, color: makeGrey(0.6) }}>
                    {"STRIPE CARD READERS"}
                  </Text>
                </View>
              </View>

              {/**Flatlist showing the available card readers */}
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
                      <Text style={{ color: makeGrey(0.55), marginRight: 10 }}>
                        ID:
                      </Text>
                      <TextInput
                        style={{ outlineWidth: 0 }}
                        editable={true}
                        value={item.id}
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
                        onPress={() => {}}
                      />
                    </View>
                    // </View>
                  );
                }}
              />
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
              value={zSettingsObj?.salesTax || ""}
              onChangeText={(val) => {
                const regex = new RegExp(".", "g");
                let containsDecimalAlready = val.split(".").length > 2;
                if (checkInputForNumbersOnly(val) && !containsDecimalAlready) {
                  handleSettingsFieldChange("salesTax", val);
                }
              }}
            />
            <Text>%</Text>
          </View>
        </BoxContainerInnerComponent>
      ) : null}
    </BoxContainerOuterComponent>
  );
};

const StatusesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState(true);
  const [sBackgroundColorWheelItem, _setBackgroundColorWheelItem] = useState();
  const [sTextColorWheelItem, _setTextColorWheelItem] = useState();
  const [sEditableInputIdx, _setEditableInputIdx] = useState(null);
  const [sNewItem, _setNewItem] = useState();

  return (
    <BoxContainerOuterComponent
      style={{ backgroundColor: "transparent", borderWidth: 0 }}
    >
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{
            backgroundColor: "transparent",
            borderWidth: 0,
            alignItems: "center",
            paddingHorizontal: 0,
            paddingVertical: 0,
            width: "100%",
            // borderWidth: 1,
          }}
        >
          <BoxButton1
            style={{
              marginTop: 10,
              width: 130,
              paddingVertical: 0,
              marginBottom: 20,
              backgroundColor: makeGrey(0.15),
            }}
            label={"New Status"}
            onPress={() => {
              let proto = {};
              Object.keys(zSettingsObj.statuses[0]).forEach((key) => {
                proto[key] = "";
              });
              proto.label = "New Status";
              proto.id = generateRandomID();
              proto.backgroundColor = makeGrey(0.3);
              proto.textColor = C.textMain;
              proto.removable = true;
              let statuses = [proto, ...zSettingsObj.statuses];
              handleSettingsFieldChange("statuses", statuses);
            }}
          />

          <View
            style={{
              width: "100%",
              alignItems: "center",
            }}
          >
            <FlatList
              data={zSettingsObj?.statuses || []}
              style={{
                marginTop: 7,
                borderWidth: 1,
                padding: 20,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 5,
                // width: "100%",
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
                        style={{ paddingHorizontal: 5, paddingRight: 5 }}
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
                        {!item.removable ? (
                          <View
                            style={{
                              width: "10%",
                            }}
                          />
                        ) : null}
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
                                ? makeGrey(0.4)
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
                        {!item.removable ? (
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
                        ) : null}
                      </View>
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

                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        justifyContent: "flex-end",
                        paddingRight: "10%",
                      }}
                    >
                      {sBackgroundColorWheelItem?.id === item.id ? (
                        <ColorWheel
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
                      ) : null}
                      {sTextColorWheelItem?.id === item.id ? (
                        <ColorWheel
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
                      ) : null}
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </BoxContainerInnerComponent>
      ) : null}
    </BoxContainerOuterComponent>
  );
};
