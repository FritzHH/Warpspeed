/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native-web";
import {
  addDashesToPhone,
  generateRandomID,
  log,
  makeGrey,
  removeDashesFromPhone,
} from "../../../../utils";
import { useLoginStore, useSettingsStore } from "../../../../stores";
import {
  Button,
  Button_,
  CheckBox_,
  DropdownMenu,
  Image_,
  NumberSpinner_,
} from "../../../../components";
import { cloneDeep, set } from "lodash";
import { dbSetSettings } from "../../../../db_call_wrapper";
import { Children, useEffect, useRef, useState } from "react";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import { PERMISSION_LEVELS } from "../../../../constants";
import { APP_USER } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";
import { fillPunchHistory } from "../../../../testing";

export function Dashboard_Admin({}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);

  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalUserObj, _setFacialRecognitionModalUserObj] =
    useState(false);
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState();
  const [sEditUserIndex, _setEditUserIndex] = useState();
  const [sShowPinIndex, _setShowPinIndex] = useState();
  const [sShowWageIndex, _setShowWageIndex] = useState();
  const [sNewUserObj, _setNewUserObj] = useState();
  const userListItemRefs = useRef([]);
  const cardReaderListItemRefs = useRef([]);
  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////

  function commitUserInfoChange(userObj) {
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
    _zSetSettingsObj(settingsObj);
    // return;
    dbSetSettings(settingsObj);
  }

  function handleNewUserPress() {
    let userObj = cloneDeep(APP_USER);
    userObj.id = generateRandomID();
    let role = PERMISSION_LEVELS.find((o) => (o.name = "User"));
    userObj.permissions = role;
    _setNewUserObj(userObj);
    _setEditUserIndex(0);
  }

  function handleRemoveUserPress(userObj) {
    let settingsObj = cloneDeep(zSettingsObj);
    let userArr = settingsObj.users.filter((o) => o.id != userObj.id);
    settingsObj.users = userArr;
    _zSetSettingsObj(settingsObj);
    dbSetSettings(settingsObj);
  }

  function handleDescriptorCapture(userObj, desc) {
    let settingsObj = cloneDeep(zSettingsObj);
    let userArr = settingsObj.users.map((o) => {
      if (o.id === userObj.id) {
        o.faceDescriptor = desc;
        return o;
      }
      return o;
    });
    settingsObj.users = userArr;
    _zSetSettingsObj(settingsObj);
    dbSetSettings(settingsObj);
  }

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

  function TextInputComponent({ label, value, onChangeText, style = {} }) {
    return (
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Text style={{ minWidth: 10 }}>{label}</Text>
        <TextInput
          style={{
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            // borderRadius: 5,
            paddingHorizontal: 5,
            ...style,
          }}
          value={value}
          onChangeText={onChangeText}
        />
      </View>
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

  const STYLES = {
    dropdownButton: {},
    dropdownText: {},
    dropdownItem: {},
  };

  return (
    <ScrollView
      style={{
        // flex: 1,
        padding: 5,
        paddingTop: 20,
        // flexDirection: "row",
        // backgroundColor: "blue",
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
        <View style={{ width: "35%", backgroundColor: "transparent" }}>
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
                justifyContent: "flex-end",
                alignItems: "center",
                marginBottom: 5,
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
              <Button_
                onPress={handleNewUserPress}
                text={"New User"}
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
                            placeholder={
                              sShowPinIndex === idx ? "pin..." : "PIN"
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
                                _setShowPinIndex(
                                  sShowPinIndex != null ? null : idx
                                )
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
        {/**right-side column container */}
        <View
          style={{
            width: "65%",
            alignItems: "flex-end",
            paddingHorizontal: 10,
            // backgroundColor: "blue",
          }}
        >
          {/**PAYMENT PROCESSING BOX   */}
          <BoxContainerOuterComponent>
            <BoxContainerLabelComponent
              text={"payment processing"}
              style={{ paddingRight: 5 }}
            />
            <BoxContainerInnerComponent>
              <CheckBox_
                isChecked={true}
                textStyle={{ fontSize: 15 }}
                buttonStyle={{
                  backgroundColor: "transparent",
                }}
                text={"Accepts checks"}
                onCheck={() => {}}
              />
              <CheckBox_
                isChecked={true}
                textStyle={{ fontSize: 15 }}
                buttonStyle={{
                  backgroundColor: "transparent",
                }}
                text={"Auto connect to card reader"}
                onCheck={() => {}}
              />
              {/**card reader flatlist */}
              <View
                style={{
                  width: "100%",
                  alignItems: "flex-end",
                  marginTop: 10,
                  // backgroundColor: "green",
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
                      text={"New Reader"}
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
                            // width: 500,
                            // backgroundColor: "green",
                          }}
                        >
                          <Text
                            style={{ color: makeGrey(0.55), marginRight: 10 }}
                          >
                            ID:
                          </Text>
                          <TextInput
                            style={{ outlineWidth: 0 }}
                            editable={false}
                            value={item.id}
                          />
                          <TextInput
                            value={item.label}
                            onChangeText={() => {}}
                            style={{
                              textAlign: "right",
                              paddingRight: 2,
                              // minWidth: 200,
                              // width: "75%",
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
                  label={zSettingsObj?.selectedCardReaderObj.label}
                  data={zSettingsObj?.cardReaders || []}
                  onSelect={(obj) => log("selected", obj)}
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
                  }}
                  value={zSettingsObj?.salesTax * 100}
                  onChangeText={() => log("change sales tax fun")}
                />
                <Text>%</Text>
              </View>
            </BoxContainerInnerComponent>
            <NumberSpinner_ />
          </BoxContainerOuterComponent>
        </View>
      </View>
    </ScrollView>
  );
}
