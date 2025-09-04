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
  checkInputForNumbersOnly,
  clog,
  generateRandomID,
  log,
  makeGrey,
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

  return (
    <BoxContainerOuterComponent style={{ marginTop: 20 }}>
      <BoxContainerLabelComponent
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
            // backgroundColor: "green",
            paddingHorizontal: 0,
            paddingVertical: 0,
          }}
        >
          <BoxButton1 />

          <FlatList
            data={zSettingsObj?.statuses || []}
            style={{
              marginTop: 20,
            }}
            renderItem={(obj) => {
              let idx = obj.index;
              let item = obj.item;
              // log(item);
              return (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <BoxButton1
                    style={{ paddingHorizontal: 3 }}
                    iconSize={22}
                    icon={ICONS.upChevron}
                  />
                  <BoxButton1
                    style={{ paddingHorizontal: 3 }}
                    iconSize={22}
                    icon={ICONS.downChevron}
                  />

                  <BoxButton1
                    style={{ paddingHorizontal: 3 }}
                    iconSize={22}
                    icon={ICONS.editPencil}
                  />
                  <View
                    style={{
                      backgroundColor: item.backgroundColor,
                      alignItems: "center",
                      width: 250,
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderTopLeftRadius: idx === 0 ? 5 : 0,
                      borderTopRightRadius: idx === 0 ? 5 : 0,
                      borderBottomLeftRadius:
                        idx === zSettingsObj.statuses.length - 1 ? 5 : 0,
                      borderBottomRightRadius:
                        idx === zSettingsObj.statuses.length - 1 ? 5 : 0,
                    }}
                  >
                    <Text style={{ color: item.textColor }}>{item.label}</Text>
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
                  {sBackgroundColorWheelItem?.id === item.id ? (
                    <ColorWheel
                      thing={"thing"}
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
                      onColorChange={(val) => {
                        // let back = val.hex;
                        // let text = bestForegroundHex(val.hex);
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
              );
            }}
          />
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

// Parse hex (#RRGGBB or #RGB) → {r,g,b}
function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(h, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

// Relative luminance (WCAG)
function luminance(r, g, b) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Contrast ratio
function contrastRatio(l1, l2) {
  const L1 = Math.max(l1, l2);
  const L2 = Math.min(l1, l2);
  return (L1 + 0.05) / (L2 + 0.05);
}

// Main: pick black or white for best contrast
function bestForegroundHex(bgHex) {
  const { r, g, b } = hexToRgb(bgHex);
  const bgLum = luminance(r, g, b);

  const whiteLum = 1.0;
  const blackLum = 0.0;
  const contrastWithWhite = contrastRatio(bgLum, whiteLum);
  const contrastWithBlack = contrastRatio(bgLum, blackLum);

  return contrastWithWhite >= contrastWithBlack ? C.textWhite : makeGrey(0.85);
}
