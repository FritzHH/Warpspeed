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
  removeDashesFromPhone,
} from "../../../../utils";
import { useLoginStore, useSettingsStore } from "../../../../stores";
import { Button, Button_, DropdownMenu, Image_ } from "../../../../components";
import { cloneDeep, set } from "lodash";
import { dbSetSettings } from "../../../../db_call_wrapper";
import { useEffect, useRef, useState } from "react";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { APP_BASE_COLORS, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import { PERMISSION_LEVELS } from "../../../../constants";
import { APP_USER } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";

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

  return (
    <ScrollView
      style={{
        flex: 1,
        padding: 5,
      }}
    >
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
      <View
        style={{
          borderRadius: 5,
          backgroundColor: "rgba(0,0,0,.1)",
          width: "40%",
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
          <Button_
            onPress={handleNewUserPress}
            text={"New User"}
            buttonStyle={{
              borderRadius: 5,
              padding: 0,
              height: 20,
              backgroundColor: APP_BASE_COLORS.buttonLightGreen,
              borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
              borderWidth: 1,
            }}
            textStyle={{
              fontSize: 14,
              fontColor: APP_BASE_COLORS.textMain,
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
                  backgroundColor: APP_BASE_COLORS.listItemWhite,
                  borderWidth: 1,
                  borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
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
                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      backgroundColor: editable
                        ? APP_BASE_COLORS.lightred
                        : APP_BASE_COLORS.buttonLightGreen,
                      borderRadius: 5,
                      paddingHorizontal: 0,
                      paddingVertical: 2,
                      width: 50,
                    }}
                    textStyle={{
                      color: editable
                        ? APP_BASE_COLORS.textWhite
                        : APP_BASE_COLORS.textMain,
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
                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      backgroundColor: APP_BASE_COLORS.buttonLightGreen,
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

                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      backgroundColor: APP_BASE_COLORS.buttonLightGreen,
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
                          ? APP_BASE_COLORS.buttonLightGreenOutline
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
                          ? APP_BASE_COLORS.buttonLightGreenOutline
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
                          ? APP_BASE_COLORS.buttonLightGreenOutline
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
                        borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                        outlineWidth: 0,
                        borderRadius: 5,
                        width: 100,
                        marginRight: 10,
                        borderWidth: 1,
                        backgroundColor: "transparent",
                        alignItems: "flex-start",
                        backgroundColor: editable
                          ? APP_BASE_COLORS.buttonLightGreen
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
                          ? APP_BASE_COLORS.buttonLightGreenOutline
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
                          ? APP_BASE_COLORS.buttonLightGreenOutline
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
    </ScrollView>
  );
}
