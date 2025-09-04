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
} from "../../../../components";
import { cloneDeep, set } from "lodash";
import { dbSetSettings } from "../../../../db_call_wrapper";
import { Children, useEffect, useRef, useState } from "react";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import { PERMISSION_LEVELS } from "../../../../constants";
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
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState();
  // const [sEditUserIndex, _setEditUserIndex] = useState();
  // const [sShowPinIndex, _setShowPinIndex] = useState();
  // const [sShowWageIndex, _setShowWageIndex] = useState();
  // const [sNewUserObj, _setNewUserObj] = useState();

  const [sFocus, _setFocus] = useState({ name: "", start: "", end: "" });

  const cardReaderListItemRefs = useRef([]);

  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////

  // user action handlers ///////////////////////////////////////////////////

  // user component
  function commitUserInfoChange(userObj, sNewUserObj) {
    let settingsObj = cloneDeep(zSettingsObj);
    let userArr;
    if (sNewUserObj) {
      userArr = [userObj, ...settingsObj.users];
      _setNewUserObj();
    } else {
      userArr = settingsObj.users.map((o) => {
        if (o.id === userObj.id) return userObj;
        return o;
      });
    }

    settingsObj.users = userArr;
    _zSetSettingsObj({ settingsObj });
    // dbSetSettings(settingsObj);
  }

  function handleRemoveUserPress(userObj) {
    let settingsObj = cloneDeep(zSettingsObj);
    let userArr = settingsObj.users.filter((o) => o.id != userObj.id);
    settingsObj.users = userArr;
    _zSetSettingsObj(settingsObj);
    dbSetSettings(settingsObj);
  }

  function handleDescriptorCapture(userObj, desc) {
    // let settingsObj = cloneDeep(zSettingsObj);
    let userArr = zSettingsObj.users.map((o) => {
      if (o.id === userObj.id) {
        o.faceDescriptor = desc;
        return o;
      }
      return o;
    });
    _zSetSettingsField("users", userArr);
  }

  // payment processing component ////////////////////////////////////////

  function handleSettingsFieldChange(fieldName, fieldValue) {
    _zSetSettingsField(fieldName, fieldValue);
  }

  // containers and reusable components ///////////////////////////////
  function BoxContainerOuterComponent({ style = {}, children }) {
    return (
      <View
        style={{
          ...style,
        }}
      >
        {children}
      </View>
    );
  }
  function BoxContainerLabelComponent({ text, style = {} }) {
    return (
      <Text
        style={{
          fontSize: 14,
          color: makeGrey(0.5),
          alignSelf: "flex-end",
          ...style,
        }}
      >
        {text.toUpperCase()}
      </Text>
    );
  }

  function BoxContainerInnerComponent({ style = {}, children }) {
    return (
      <View
        style={{
          // width: "100%",
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
          borderRadius: 5,
          paddingVertical: 5,
          paddingHorizontal: 4,
          alignItems: "flex-end",
          paddingLeft: 15,
          paddingRight: 7,
          paddingTop: 10,
          paddingBottom: 10,
          ...style,
        }}
      >
        {children}
      </View>
    );
  }

  // extruding each component because this page is humongous/ ////////////

  // log("focus", sFocus);

  //////////////////////////////////////////////////////////////////////////
  // Main component /////////////////////////////////////////////////////////
  return (
    <ScrollView
      style={{
        padding: 5,
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
          flex: 1,
          backgroundColor: "transparent",
          flexDirection: "row",
          justifyContent: "flex-start",
        }}
      >
        <View style={{ width: "40%", alignItems: "flex-end" }}>
          <AppUserListComponent
            zSettingsObj={zSettingsObj}
            commitUserInfoChange={commitUserInfoChange}
            _setFacialRecognitionModalUserObj={
              _setFacialRecognitionModalUserObj
            }
          />
        </View>
        {/**right-side column container */}
        <View
          style={{
            width: "60%",
            alignItems: "flex-end",
            paddingHorizontal: 10,
          }}
        >
          {/* <PaymentProcessingComponent
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          /> */}
          <StatusesComponent
            zSettingsObj={zSettingsObj}
            handleSettingsFieldChange={handleSettingsFieldChange}
          />
        </View>
      </View>
    </ScrollView>
  );
}

///////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////

function BoxContainerOuterComponent({ style = {}, children }) {
  return (
    <View
      style={{
        // width: "100%",
        ...style,
      }}
    >
      {children}
    </View>
  );
}
function BoxContainerLabelComponent({
  text,
  style = {},
  icon,
  handleExpandPress,
  expanded,
}) {
  let ICON_SIZE = 18;
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "flex-end",
        alignItems: "center",
        marginBottom: 2,
        // backgroundColor: expanded ? "transparent" : makeGrey(0.4),
        // paddingHorizontal:
        // backgroundColor: "blue",
      }}
    >
      <Text
        style={{
          fontSize: 16,
          color: makeGrey(0.5),
          alignSelf: "flex-end",
          ...style,
        }}
      >
        {text.toUpperCase()}
      </Text>
      <Button_
        visible={icon}
        buttonStyle={{
          marginLeft: 10,
          paddingHorizontal: 0,
          paddingVertical: 0,
        }}
        iconSize={ICON_SIZE}
        icon={icon}
        onPress={handleExpandPress}
      />
    </View>
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
        borderRadius: 5,
        paddingVertical: 10,
        paddingHorizontal: 10,
        alignItems: "flex-end",
        // paddingLeft: 15,
        // paddingRight: 7,
        // paddingTop: 10,
        // paddingBottom: 10,
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

////////////////////////////////////////////////////////////////////////////////////

const AppUserListComponent = ({
  zSettingsObj,
  commitUserInfoChange,
  _setFacialRecognitionModalUserObj,
}) => {
  const [sEditUserIndex, _setEditUserIndex] = useState();
  const [sShowPinIndex, _setShowPinIndex] = useState();
  const [sShowWageIndex, _setShowWageIndex] = useState();
  const [sNewUserObj, _setNewUserObj] = useState();
  const [sListExpandObj, _setListExpandObj] = useState({
    userList: false,
  });

  const userListItemRefs = useRef([]);

  function handleNewUserPress() {
    let userObj = cloneDeep(APP_USER);
    userObj.id = generateRandomID();
    let role = PERMISSION_LEVELS.find((o) => (o.name = "User"));
    userObj.permissions = role;
    _setNewUserObj(userObj);
    _setEditUserIndex(0);
  }
  return (
    <View style={{ width: "100%" }}>
      <BoxContainerLabelComponent text={"Users"} />

      {/**Flatlist showing all app users, edit functions. sPunchClockUserObj */}
      <View
        style={{
          borderRadius: 5,
          backgroundColor: "rgba(0,0,0,.1)",
          width: "100%",
          padding: 5,
          maxHeight: 550,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 5,
          }}
        >
          <Button_
            icon={ICONS.maximize}
            onPress={() =>
              _setListExpandObj({
                ...sListExpandObj,
                userList: !sListExpandObj.userList,
              })
            }
          />
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
          <Button_
            enabled={sListExpandObj.userList}
            icon={ICONS.add}
            onPress={handleNewUserPress}
            text={"User"}
            buttonStyle={{
              borderRadius: 5,
              paddingVertical: 2,
              marginRight: 6,
              // height: 20,
              backgroundColor: C.buttonLightGreen,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
            }}
            textStyle={{
              fontSize: 14,
              fontColor: C.textMain,
            }}
          />
        </View>
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
            sListExpandObj.userList
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
            return (
              <View
                ref={(element) => (userListItemRefs.current[idx] = element)}
                style={{
                  flexDirection: "row",
                  paddingVertical: 2,
                  backgroundColor: C.listItemWhite,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  borderRadius: 5,
                  padding: 3,
                  marginRight: 5,
                  opacity: !editable && sEditUserIndex ? 0.3 : 1,
                }}
              >
                <View
                  style={{
                    // paddingTop: 3,
                    paddingLeft: 0,
                    marginRight: 5,
                    justifyContent: "space-around",
                  }}
                >
                  <Button_
                    text={"Edit"}
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
                      width: 50,
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
                      width: 50,
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
                      } else if (sEditUserIndex) {
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
                      width: 50,
                    }}
                    textStyle={{ fontSize: 12 }}
                  />
                </View>
                <View style={{ justifyContent: "center" }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-start",
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
                        width: 100,
                        marginRight: 10,
                        borderWidth: 1,
                        fontSize: 14,
                      }}
                      onChangeText={(value) => {
                        userObj.first = value;
                        commitUserInfoChange(userObj, sNewUserObj);
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
                        width: 100,
                        marginRight: 10,
                        borderWidth: 1,
                        fontSize: 14,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-start",
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
                        marginTop: 5,
                        padding: 1,
                        borderColor: editable
                          ? C.buttonLightGreenOutline
                          : "transparent",
                        outlineWidth: 0,
                        width: 100,
                        marginRight: 10,
                        borderWidth: 1,
                        fontSize: 14,
                      }}
                    />
                    <DropdownMenu
                      enabled={editable}
                      ref={userListItemRefs.current[idx]}
                      dataArr={
                        editable ? PERMISSION_LEVELS.map((o) => o.name) : []
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
                        marginTop: 5,
                        padding: 1,
                        borderColor: C.buttonLightGreenOutline,
                        outlineWidth: 0,
                        borderRadius: 5,
                        width: 100,
                        marginRight: 10,
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
                        fontSize: 14,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-start",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        borderColor: editable
                          ? C.buttonLightGreenOutline
                          : "transparent",
                        width: 100,
                        marginRight: 10,
                        borderWidth: 1,
                        marginTop: 5,
                        justifyContent: "space-between",
                        alignItems: "center",
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
                          width: "70%",
                          outlineWidth: 0,
                          paddingHorizontal: 5,
                          padding: 1,
                          fontSize: 14,
                        }}
                      />
                      {editable ? (
                        <TouchableOpacity
                          onPress={() =>
                            _setShowPinIndex(sShowPinIndex != null ? null : idx)
                          }
                        >
                          <Image_ icon={ICONS.editPencil} size={15} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        borderColor: editable
                          ? C.buttonLightGreenOutline
                          : "transparent",
                        width: 100,
                        marginRight: 10,
                        borderWidth: 1,
                        marginTop: 5,
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <TextInput
                        caretHidden={sShowWageIndex != idx}
                        value={sShowWageIndex === idx ? userObj.hourlyWage : ""}
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
                          width: "70%",
                          outlineWidth: 0,
                          paddingHorizontal: 5,
                          padding: 1,
                          fontSize: 14,
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
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
};

//////////////////////////////////////////////////////////////////////////////////

const PaymentProcessingComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerLabelComponent
        text={"payment processing"}
        style={{ paddingRight: 5 }}
      />
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
          <BoxContainerLabelComponent
            text={"stripe card readers"}
            style={{ fontSize: 12 }}
          />
          <View
            style={{
              borderRadius: 5,
              backgroundColor: "rgba(0,0,0,.1)",
              padding: 5,
              maxHeight: 550,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                marginBottom: 5,
              }}
            >
              <Button_
                onPress={() => {
                  log("need new card reader function");
                }}
                icon={ICONS.add}
                text={"Reader"}
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
              />
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
    </BoxContainerOuterComponent>
  );
};

const StatusesComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sExpand, _setExpand] = useState(true);
  const [sBackgroundColorWheelItem, _setBackgroundColorWheelItem] = useState();
  const [sTextColorWheelItem, _setTextColorWheelItem] = useState();
  const [sEditableInputIdx, _setEditableInputIdx] = useState(null);
  const [sNewItem, _setNewItem] = useState();

  return (
    <BoxContainerOuterComponent
      style={{ marginTop: 20, width: "100%", backgroundColor: "transparent" }}
    >
      <BoxContainerLabelComponent
        // style={{ width: "100%" }}
        handleExpandPress={() => _setExpand(!sExpand)}
        icon={ICONS.maximize}
        text={"workorder statuses"}
        expanded={sExpand}
      />
      {sExpand ? (
        <BoxContainerInnerComponent
          style={{
            backgroundColor: "transparent",
            borderWidth: 0,
            alignItems: "flex-end",
            paddingHorizontal: 0,
            paddingVertical: 0,
            width: "100%",
          }}
        >
          <BoxButton1
            style={{ marginTop: 10 }}
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
              alignItems: "flex-end",
            }}
          >
            <FlatList
              data={zSettingsObj?.statuses || []}
              style={{
                marginTop: 7,
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
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <BoxButton1
                        style={{ paddingHorizontal: 3 }}
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
                        style={{ paddingHorizontal: 3 }}
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
                        style={{ paddingHorizontal: 3 }}
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
                        style={{ paddingHorizontal: 3, paddingRight: 5 }}
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
                        style={{ paddingHorizontal: 3 }}
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
                        style={{ paddingHorizontal: 3 }}
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
