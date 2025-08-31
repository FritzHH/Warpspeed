/*eslint-disable*/
import {
  FlatList,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native-web";
import {
  Button_,
  DateTimePicker,
  DropdownMenu,
  Image_,
  ScreenModal,
} from "../../../components";
import { APP_BASE_COLORS, ICONS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  clog,
  convertMillisToHoursMins,
  getDisplayFormattedDate,
  getPreviousMondayDayJS,
  getWordDayOfWeek,
  log,
  makeGrey,
  numberIsEven,
  trimToTwoDecimals,
} from "../../../utils";
import dayjs from "dayjs";
import { dbFindPunchHistoryByMillisRange } from "../../../db_call_wrapper";
import sr from "dayjs/locale/sr";
import { range, sortBy } from "lodash";
import { loadBundle } from "firebase/firestore";
import { isEven } from "face-api.js/build/commonjs/utils";
import { useLoginStore, useSettingsStore } from "../../../stores";
import { MILLIS_IN_MINUTE } from "../../../constants";

// eslint-disable-next-line no-lone-blocks
{
  /** typically the User Obj will contain the "id" field for the user. however in the punch card punches, the id field is used for the id of the punch, so in this component to access {userobj}.id for the punch object, user {userobj}.userID */
}

export const UserClockHistoryModal = ({ userObj, handleExit }) => {
  // store getters //////////////////////////////////////////////////////
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  // local state ////////////////////////////////////////////////////////
  const [sUserObj, _setUserObj] = useState(userObj);
  const [sUserDropdownDataArr, _setUserDropdownDataArr] = useState([]);

  const [sRange, _setRange] = useState({
    startDate: getPreviousMondayDayJS(),
    endDate: dayjs(),
  });
  const [sHistoryDisplay, _setHistoryDisplay] = useState([]);
  const [sTotalHours, _setTotalHours] = useState("");
  const [sFilteredArr, _setFilteredArr] = useState([]);
  const [sSelectedUserIdx, _setSelectedUserIdx] = useState();
  const [sTotalMinutesWorked, _setTotalMinutesWorked] = useState();
  const [sRunningTotalWages, _setRunningTotalWages] = useState();
  const [sEditableRowIdx, _setEditableRowIdx] = useState(5);

  const userDropdownRef = useRef();
  const amPMOUtDropdownRef = useRef([]);
  const amPMINDropdownRef = useRef([]);
  /////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////

  // app users dropdown menu init
  useEffect(() => {
    let selectedUserIdx;
    let idx = 0;
    let dataArr = zSettingsObj.users.map((user_obj) => {
      if (user_obj.id === sUserObj.id) selectedUserIdx = idx;
      // log(user_obj);
      idx++;
      return {
        label: user_obj.first + " " + user_obj.last,
        id: user_obj.id,
      };
    });

    _setSelectedUserIdx(selectedUserIdx);
    _setUserDropdownDataArr(dataArr);

    // let selectedUserIdx = zS
  }, [zSettingsObj, sUserObj, _setSelectedUserIdx, _setUserDropdownDataArr]);

  // filter the set for the date range selected
  useEffect(() => {
    if (!sUserObj) return;
    if (!sRange.startDate || !sRange.endDate) return;
    let startMillis = sRange.startDate.valueOf();
    let endMillis = sRange.endDate.valueOf();

    // set millis to begin and end of selected days
    let dayBegin = new Date(startMillis);
    let dayEnd = new Date(endMillis);
    dayBegin.setHours(0, 0, 1, 0);
    dayEnd.setHours(23, 59, 59, 0);
    dayBegin = dayBegin.getTime();
    dayEnd = dayEnd.getTime();

    dbFindPunchHistoryByMillisRange(sUserObj.id, dayBegin, dayEnd)
      .then((resArr) => {
        // log(resArr);
        resArr = sortBy(resArr, "millis");
        let arr = [];
        resArr.forEach((o) => {
          arr.push(o);
        });
        _setFilteredArr(arr);
      })
      .catch((e) => log("error", e));
  }, [sRange, sUserObj, _setFilteredArr]);

  useEffect(() => {
    // log("filtered", sFilteredArr);

    let resArr = [];
    let counter = 0;
    let resObj = {};
    sFilteredArr.forEach((obj) => {
      if (obj.option === "in") {
        resObj = { in: obj };
      } else {
        resObj.out = obj;
      }

      if (obj.option == "out" || counter === sFilteredArr.length - 1) {
        resArr.push(resObj);
      }
      counter++;
    });

    let arr = [];
    let runningTotalMinutes = 0;
    let runningTotalWages = 0;
    resArr.forEach((obj) => {
      if (obj.in && obj.out) {
        obj.in = {
          ...obj.in,
          ...getDisplayFormattedDate(obj.in.millis, true, true),
        };
        obj.out = {
          ...obj.out,
          ...getDisplayFormattedDate(obj.out.millis, true, true),
        };

        if (obj.in.dayOfMonth !== obj.out.dayOfMonth) {
          obj.sameDayPunchout = false;
        }
        // clog(obj.in);
        let diff = obj.out.millis - obj.in.millis;
        let total = convertMillisToHoursMins(diff);
        obj.hoursDiff = total.hours;
        obj.minutesDiff = total.minutes;
        obj.totalMinutes = total.totalMinutes;
        runningTotalMinutes += total.totalMinutes;
        // clog(obj);
        if (Number(obj.minutesDiff) < 10) {
          // log(obj.minutes);
          obj.minutesDiff = "0" + obj.minutesDiff.toString();
        }
      } else if (obj.in) {
        obj.in = {
          ...obj.in,
          ...getDisplayFormattedDate(obj.in.millis, true, true),
        };

        // log("clock in only");
      } else if (obj.out) {
        obj.out = {
          ...obj.out,
          ...getDisplayFormattedDate(obj.out.millies, true, true),
        };
        // log("clock out only");
      } else {
        return;
      }
      let dateObj = {};
      if (obj.in) {
        dateObj.wordDayOfMonth = obj.in.wordDayOfMonth;
        dateObj.dayOfMonth = obj.in.dayOfMonth;
        dateObj.year = obj.in.year;
        dateObj.wordDayOfWeek = obj.in.wordDayOfWeek;
      } else if (obj.out) {
        dateObj.wordDayOfMonth = obj.out.wordDayOfMonth;
        dateObj.dayOfMonth = obj.out.dayOfMonth;
        dateObj.year = obj.out.year;
        dateObj.wordDayOfWeek = obj.out.wordDayOfWeek;
      }
      obj = { ...obj, ...dateObj };
      // log(obj);
      arr.push(obj);
    });
    _setRunningTotalWages(
      trimToTwoDecimals((runningTotalMinutes / 60) * sUserObj.hourlyWage)
    );
    _setTotalMinutesWorked(runningTotalMinutes);
    _setHistoryDisplay(arr);

    // clog(arr);
  }, [_setHistoryDisplay, sFilteredArr]);

  // log(sRunningTotalWages);
  let Component = useCallback(() => {
    function handleUserSelect(item, idx) {
      // log("item", item);
      let user = zSettingsObj.users.find((o) => o.id === item.id);
      // log(user);
      _setUserObj(user);
    }

    function handleTimeEdit(obj, option) {
      log("option", option);
      switch (option) {
        case "date-up":
          break;
        case "date-down":
          break;
        case "in-hour-up":
          break;
        case "in-hour-down":
          break;
        case "in-minutes-up":
          break;
        case "in-minutes-down":
          break;
        case "out-hour-up":
          break;
        case "out-hour-down":
          break;
        case "out-minutes-up":
          break;
        case "out-minutes-down":
          break;
        case "in-am-pm":
          break;
        case "out-am-pm":
          break;
      }
    }

    const iconSize = 30;
    return (
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "75%",
            height: "85%",
            backgroundColor: APP_BASE_COLORS.backgroundWhite,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-evenly",
            padding: 30,
            borderRadius: 15,
          }}
        >
          <View style={{ width: "35%" }}>
            {zCurrentUserObj?.permissions?.level >= 3 ? (
              <View style={{ marginBottom: 30 }}>
                <DropdownMenu
                  buttonStyle={{
                    width: 150,
                    borderWidth: 1,
                    borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                    alignSelf: "center",
                    borderRadius: 5,
                  }}
                  ref={userDropdownRef}
                  modalCoordinateVars={{ x: 150, y: 50 }}
                  selectedIdx={sSelectedUserIdx}
                  useSelectedAsButtonTitle={true}
                  dataArr={sUserDropdownDataArr}
                  onSelect={handleUserSelect}
                />
              </View>
            ) : null}
            <DateTimePicker range={sRange} handleDateRangeChange={_setRange} />
            <View
              style={{
                marginTop: 20,
                flexDirection: "row",
                justifyContent: "flex-end",
                width: "100%",
                alignItems: "center",
                // backgroundColor: "green",
              }}
            >
              <Text style={{ width: 300, textAlign: "right" }}>
                {"Total Selected Time: "}
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 16,
                  width: 70,
                  textAlign: "right",
                }}
              >
                {
                  convertMillisToHoursMins(
                    sTotalMinutesWorked * MILLIS_IN_MINUTE
                  ).formattedHoursMin
                }
              </Text>
              <Text>{sTotalHours}</Text>
            </View>
            <View
              style={{
                marginTop: 20,
                flexDirection: "row",
                justifyContent: "flex-end",
                width: "100%",
                alignItems: "center",
              }}
            >
              <Text style={{ width: 300, textAlign: "right" }}>
                {"Total Selected Wages: "}
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 16,
                  width: 70,
                  textAlign: "right",
                }}
              >
                <Text style={{ fontSize: 16, color: makeGrey(0.6) }}>$</Text>
                {Number(sRunningTotalWages)?.toLocaleString()}
              </Text>
            </View>
          </View>
          <View
            style={{
              marginLeft: 20,
              width: "55%",
              height: "97%",
              // alignItems: "center",
              backgroundColor: APP_BASE_COLORS.backgroundListWhite,
              borderRadius: 15,
            }}
          >
            {sHistoryDisplay.length > 0 ? (
              <FlatList
                // style={{ width: "100%" }}
                data={sHistoryDisplay}
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      height: 0,
                      backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                    }}
                  />
                )}
                renderItem={(obj) => {
                  let idx = obj.index;
                  let item = obj.item;
                  let editable = idx === sEditableRowIdx;
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        width: "100%",
                        opacity: sEditableRowIdx && editable ? null : 0.65,
                        backgroundColor: isEven(idx)
                          ? APP_BASE_COLORS.listItemWhite
                          : makeGrey(0.075),
                        paddingVertical: 8,
                        paddingHorizontal: 5,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          // marginRight: 3,
                          width: "25%",
                        }}
                      >
                        <Text style={{ color: makeGrey(0.4), marginRight: 5 }}>
                          {item.year}
                        </Text>
                        <Text
                          style={{
                            color: APP_BASE_COLORS.textMain,
                            marginRight: 1,
                          }}
                        >
                          {item.wordDayOfWeek + ", "}
                        </Text>
                        <Text style={{ color: APP_BASE_COLORS.textMain }}>
                          {item.wordDayOfMonth}
                        </Text>
                        <View style={{ alignItems: "center", marginLeft: 3 }}>
                          {editable ? (
                            <Button_
                              icon={ICONS.upChevron}
                              iconSize={iconSize}
                              onPress={() => handleTimeEdit(item, "date-up")}
                              buttonStyle={{
                                paddingVertical: 0,
                                paddingHorizontal: 0,
                              }}
                            />
                          ) : null}
                          <Text style={{ width: 20, textAlign: "center" }}>
                            {item.dayOfMonth}
                          </Text>
                          {editable ? (
                            <Button_
                              buttonStyle={{
                                paddingVertical: 0,
                                paddingHorizontal: 0,
                              }}
                              icon={ICONS.downChevron}
                              iconSize={iconSize}
                              onPress={() => handleTimeEdit(item, "date-down")}
                            />
                          ) : null}
                        </View>
                      </View>
                      {item.in ? (
                        <View
                          style={{
                            flexDirection: "row",
                            width: "20%",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            // marginRight: 0,
                            // backgroundColor: "blue",
                            // paddin
                          }}
                        >
                          {editable ? <View></View> : null}
                          {editable ? null : (
                            <Image_ icon={ICONS.forwardGreen} size={14} />
                          )}
                          <View style={{ alignItems: "center" }}>
                            {editable ? (
                              <Button_
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                                icon={ICONS.upChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "in-hour-up")
                                }
                              />
                            ) : null}
                            <Text
                              style={{
                                width: 20,
                                textAlign: editable ? "center" : "right",
                                // width: 20,
                                // textAlign: "right",
                                outlineColor: APP_BASE_COLORS.green,
                                paddingRight: 1,
                                // backgroundColor: "blue",
                                // borderWidth: 1,
                                outlineColor: APP_BASE_COLORS.green,
                                borderColor:
                                  APP_BASE_COLORS.buttonLightGreenOutline,
                              }}
                            >
                              {item.in.hour}
                            </Text>
                            {editable ? (
                              <Button_
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                                icon={ICONS.downChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "in-hour-down")
                                }
                              />
                            ) : null}
                          </View>
                          <Text style={{ paddingHorizontal: 1 }}>:</Text>
                          <View style={{ alignItems: "center" }}>
                            {editable ? (
                              <Button_
                                icon={ICONS.upChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "in-minutes-up")
                                }
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                              />
                            ) : null}
                            <Text
                              style={{
                                width: iconSize,
                                textAlign: editable ? "center" : "left",
                                // textAlign: editable ? center : ,
                                outlineColor: APP_BASE_COLORS.green,
                                outlineColor: APP_BASE_COLORS.green,
                                borderColor:
                                  APP_BASE_COLORS.buttonLightGreenOutline,
                              }}
                            >
                              {item.in.minutes}
                            </Text>
                            {editable ? (
                              <Button_
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                                icon={ICONS.downChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "in-minutes-down")
                                }
                              />
                            ) : null}
                          </View>
                          <View
                            ref={(el) => (amPMINDropdownRef.current[idx] = el)}
                          >
                            <DropdownMenu
                              ref={amPMINDropdownRef.current[idx]}
                              dataArr={[{ label: "AM" }, { label: "PM" }]}
                              useSelectedAsButtonTitle={true}
                              selectedIdx={item.in.amPM === "AM" ? 0 : 1}
                              buttonStyle={{
                                // width: 20,
                                backgroundColor: "transparent",
                                paddingHorizontal: 4,
                                borderRadius: 5,
                              }}
                              buttonTextStyle={{
                                color: makeGrey(0.6),
                                fontSize: 14,
                                // paddingHorizontal: 0,
                              }}
                              onSelect={(val) => {
                                handleTimeEdit(item, val, "in-am-pm");
                              }}
                            />
                          </View>
                        </View>
                      ) : null}
                      {item.out ? (
                        <View
                          style={{
                            flexDirection: "row",
                            width: "25%",
                            alignItems: "center",
                          }}
                        >
                          {editable ? null : (
                            <Image_ icon={ICONS.backRed} size={13} />
                          )}

                          <View>
                            {editable ? (
                              <Button_
                                icon={ICONS.upChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "out-hour-up")
                                }
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                              />
                            ) : null}
                            <Text
                              style={{
                                // marginLeft: 10,
                                width: iconSize,
                                textAlign: editable ? "center" : "right",
                                outlineColor: APP_BASE_COLORS.green,
                                // borderWidth: 1,
                                paddingRight: 1,
                                borderColor:
                                  APP_BASE_COLORS.buttonLightGreenOutline,
                              }}
                            >
                              {item.out.hour}
                            </Text>

                            {editable ? (
                              <Button_
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                                icon={ICONS.downChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "out-hour-down")
                                }
                              />
                            ) : null}
                          </View>
                          <Text style={{ paddingHorizontal: 1 }}>:</Text>
                          <View>
                            {editable ? (
                              <Button_
                                icon={ICONS.upChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "out-minutes-up")
                                }
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                              />
                            ) : null}
                            <Text
                              style={{
                                width: iconSize,
                                textAlign: editable ? "center" : "left",
                                outlineColor: APP_BASE_COLORS.green,
                                // borderWidth: 1,
                                paddingHorizontal: 1,
                                borderColor:
                                  APP_BASE_COLORS.buttonLightGreenOutline,
                              }}
                            >
                              {item.out.minutes}
                            </Text>
                            {editable ? (
                              <Button_
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                                icon={ICONS.downChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "out-minutes-down")
                                }
                              />
                            ) : null}
                          </View>
                          <View
                            ref={(el) => (amPMOUtDropdownRef.current[idx] = el)}
                          >
                            <DropdownMenu
                              ref={amPMOUtDropdownRef.current[idx]}
                              dataArr={[{ label: "AM" }, { label: "PM" }]}
                              useSelectedAsButtonTitle={true}
                              selectedIdx={item.out.amPM === "AM" ? 0 : 1}
                              buttonStyle={{
                                // width: 20,
                                backgroundColor: "transparent",
                                paddingHorizontal: 4,
                                borderRadius: 5,
                              }}
                              buttonTextStyle={{
                                color: makeGrey(0.6),
                                fontSize: 14,
                                // paddingHorizontal: 0,
                              }}
                              onSelect={(val) => {
                                handleTimeEdit(item, val, "out-am-pm");
                              }}
                            />
                          </View>
                        </View>
                      ) : null}
                      {item.hoursDiff || item.minutesDiff ? (
                        <View style={{ flexDirection: "row", marginRight: 30 }}>
                          <Text
                            style={{ color: makeGrey(0.6), marginRight: 5 }}
                          >
                            Total:
                          </Text>
                          <Text style={{ textAlign: "right", width: 50 }}>
                            {(item.hoursDiff ? item.hoursDiff : "") +
                              " : " +
                              item.minutesDiff}
                          </Text>
                        </View>
                      ) : null}
                      <Button_
                        onPress={() =>
                          _setEditableRowIdx(sEditableRowIdx ? null : idx)
                        }
                        iconSize={20}
                        icon={ICONS.editPencil}
                      />
                    </View>
                  );
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: makeGrey(0.4), fontSize: 17 }}>
                  No punches for this date range
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [
    // zCurrentUserObj?.permissions?.level,
    sRunningTotalWages,
    sTotalMinutesWorked,
    sSelectedUserIdx,
    sUserDropdownDataArr,
    sRange,
    sTotalHours,
    sHistoryDisplay,
  ]);

  return (
    <ScreenModal
      buttonVisible={false}
      Component={Component}
      modalVisible={true}
      showOuterModal={true}
      handleOuterClick={handleExit}
      outerModalStyle={{}}
    />
  );
};
