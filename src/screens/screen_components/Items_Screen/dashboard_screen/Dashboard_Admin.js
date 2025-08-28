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
import { log } from "../../../../utils";
import { useLoginStore, useSettingsStore } from "../../../../stores";
import { Button, Button_ } from "../../../../components";
import { cloneDeep, set } from "lodash";
import { dbSetSettings } from "../../../../db_call_wrapper";
import { useEffect, useState } from "react";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { APP_BASE_COLORS } from "../../../../styles";

export function Dashboard_Admin({}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  const _zSetRunBackgroundFacialRecognition = useLoginStore(
    (state) => state.setRunBackgroundRecognition
  );

  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalVisible, _setFacialRecognitionModalVisible] =
    useState(false);
  const [sEditUserIndex, _setEditUserIndex] = useState(0);

  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////

  function commitUserInfoChange(userObj) {
    let settingsObj = cloneDeep(zSettingsObj);
    let userArr = settingsObj.users.map((o) => {
      if (o.id === userObj.id) return userObj;
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
        // backgroundColor: "blue",
        padding: 5,
      }}
    >
      <FaceEnrollModalScreen
        visible={sFacialRecognitionModalVisible}
        handleExitPress={() => _setFacialRecognitionModalVisible(false)}
      />
      <View
        style={{
          // borderWidth: 1,
          borderRadius: 5,
          backgroundColor: "rgba(0,0,0,.1)",
          width: "40%",
          padding: 5,
          maxHeight: 550,
        }}
      >
        <Text
          style={{
            paddingLeft: 3,
            marginVertical: 2,
            color: APP_BASE_COLORS.textMain,
            fontWeight: 500,
          }}
        >
          Users
        </Text>
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
              ? [
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                  ...zSettingsObj.users,
                ]
              : []
          }
          renderItem={(obj) => {
            obj = cloneDeep(obj);
            let idx = obj.index;
            let userObj = obj.item;
            return (
              <View
                style={{
                  flexDirection: "row",
                  paddingVertical: 2,
                  backgroundColor: APP_BASE_COLORS.listItemWhite,
                  borderWidth: 1,
                  borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                  borderRadius: 5,
                  padding: 3,
                  marginRight: 5,
                }}
              >
                <View style={{ paddingLeft: 0, marginRight: 10 }}>
                  <Button_
                    text={"Edit"}
                    onPress={() =>
                      _setEditUserIndex(sEditUserIndex != null ? null : idx)
                    }
                    buttonStyle={{
                      borderWidth: 1,
                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      backgroundColor:
                        idx === sEditUserIndex
                          ? APP_BASE_COLORS.lightred
                          : APP_BASE_COLORS.buttonLightGreen,
                      borderRadius: 5,
                      marginBottom: 3,
                      paddingHorizontal: 0,
                      width: 50,
                    }}
                    textStyle={{ fontSize: 12 }}
                  />
                  <Button_
                    text={"Enroll"}
                    onPress={() => {
                      _zSetRunBackgroundFacialRecognition(false);
                      _setFacialRecognitionModalVisible(true);
                    }}
                    buttonStyle={{
                      borderWidth: 1,
                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                      width: 50,
                      paddingHorizontal: 0,
                      marginRight: 4,
                      marginBottom: 3,
                      borderRadius: 5,
                    }}
                    textStyle={{ fontSize: 12 }}
                  />
                  <Button_
                    text={"Clock"}
                    onPress={() => null}
                    buttonStyle={{
                      borderWidth: 1,
                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                      borderRadius: 5,
                      marginBottom: 3,
                      paddingHorizontal: 0,
                      width: 50,
                    }}
                    textStyle={{ fontSize: 12 }}
                  />
                </View>
                <View>
                  <View style={{ flexDirection: "row" }}>
                    <TextInput
                      editable={sEditUserIndex === idx}
                      value={userObj.first}
                      style={{
                        padding: 1,
                        borderWidth: 1,
                        borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                        outlineWidth: 0,
                        width: 80,
                        marginRight: 10,
                      }}
                      onChangeText={(value) => {
                        userObj.first = value;
                        commitUserInfoChange(userObj);
                      }}
                    />
                    <TextInput
                      value={userObj.last}
                      editable={sEditUserIndex === idx}
                      style={{ width: 100 }}
                    />
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
