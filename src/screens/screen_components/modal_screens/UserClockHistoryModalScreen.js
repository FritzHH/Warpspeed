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
  SHADOW_RADIUS_PROTO,
} from "../../../components";
import { C, ICONS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  clog,
  convertMillisToHoursMins,
  decrementNumByFive,
  formatMillisForDisplay,
  getPreviousMondayDayJS,
  getWordDayOfWeek,
  incrementNumByFive,
  log,
  makeGrey,
  numberIsEven,
  trimToTwoDecimals,
} from "../../../utils";
import dayjs from "dayjs";
import {
  build_db_path,
  dbFindPunchHistoryByMillisRange,
  dbUpdateUserPunchAction,
  setDBItem,
} from "../../../db_call_wrapper";
import sr from "dayjs/locale/sr";
import { cloneDeep, range, sortBy } from "lodash";
import { loadBundle } from "firebase/firestore";
import { isEven } from "face-api.js/build/commonjs/utils";
import { useLoginStore, useSettingsStore } from "../../../stores";
import { MILLIS_IN_DAY, MILLIS_IN_MINUTE } from "../../../constants";
import { ToolContextImpl } from "twilio/lib/rest/assistants/v1/tool";
import { ItemAssignmentContextImpl } from "twilio/lib/rest/numbers/v2/regulatoryCompliance/bundle/itemAssignment";

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
  const [sEditableRowIdx, _setEditableRowIdx] = useState(1);

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
        // clog("res arr", resArr);
        resArr = sortBy(resArr, "millis");
        _setFilteredArr(resArr);
      })
      .catch((e) => log("error", e));
  }, [sRange, sUserObj, _setFilteredArr]);

  useEffect(() => {
    let resArr = [];
    let counter = 0;
    let resObj = {};
    let pairs = [];
    // clog(sFilteredArr);
    let filteredArr = sortBy(sFilteredArr, "millis");
    sFilteredArr.forEach((obj) => {
      obj = cloneDeep(obj);
      // clog(obj);
      if (counter === 0 && obj.option === "out") {
        // log("edge 1");
        // edge case, they either worked overnight or forgot to clock out the day before
        resObj.out = obj;
        resArr.push(resObj);
        resObj = {};
        counter++;
        return;
      }

      if (counter === sFilteredArr.length - 1 && obj.option === "in") {
        // edge case, they either are going to work overnight or forgot to clock out on this date
        // log("edge 2");
        resObj.in = obj;
        resArr.push(resObj);
        return;
      }

      if (obj.option === "in") {
        // log("in" + counter);
        resObj.in = obj;
      } else if (obj.option === "out") {
        // log("out" + counter);
        resObj.out = obj;
        resArr.push(resObj);
        resObj = {};
      }
      counter++;
    });
    // clog(resArr);

    let arr = [];
    let runningTotalMinutes = 0;
    let runningTotalWages = 0;
    // clog(resArr);
    resArr.forEach((obj) => {
      obj = cloneDeep(obj);
      // log(obj);
      // clog(obj);
      if (obj.in) {
        obj.in = {
          ...obj.in,
          ...formatMillisForDisplay(obj.in.millis, true, true),
        };
      }

      if (obj.out) {
        obj.out = {
          ...obj.out,
          ...formatMillisForDisplay(obj.out.millis, true, true),
        };
      }

      let total;
      if (obj.in && obj.out) {
        total = convertMillisToHoursMins(obj.out.millis - obj.in.millis);
        // log("total", total);
        obj.hoursDiff = total.hours;
        obj.minutesDiff = total.minutes;
        obj.totalMinutes = total.totalMinutes;
        runningTotalMinutes += total.totalMinutes;
        if (Number(obj.minutesDiff) < 10) {
          // log(obj.minutes);
          obj.minutesDiff = "0" + obj.minutesDiff.toString();
        }
      } else if (obj.in) {
        obj.in = {
          ...obj.in,
          ...formatMillisForDisplay(obj.in.millis, true, true),
        };
      } else {
        obj.out = {
          ...obj.out,
          ...formatMillisForDisplay(obj.out.millis, true, true),
        };
      }

      // clog(obj);
      arr.push(obj);
    });
    _setRunningTotalWages(
      trimToTwoDecimals((runningTotalMinutes / 60) * sUserObj.hourlyWage)
    );
    _setTotalMinutesWorked(runningTotalMinutes);
    _setHistoryDisplay(arr);

    clog(arr);
  }, [_setHistoryDisplay, sFilteredArr]);

  // log(sRunningTotalWages);
  let Component = useCallback(() => {
    function handleUserSelect(item, idx) {
      let user = zSettingsObj.users.find((o) => o.id === item.id);
      _setUserObj(user);
    }

    function handleTimeEdit(obj, option) {
      obj = cloneDeep(obj);
      let oldMillis;
      if (option.includes("in")) {
        oldMillis = obj.in.millis;
      } else if (option.includes("out")) {
        oldMillis = obj.out.millis;
      } else {
        oldMillis = obj.in.millis || obj.out.millis;
      }

      let userID = obj.in ? obj.in.userID : obj.out.userID;
      log(option);
      switch (option) {
        case "in-date-up":
          // if (!obj.in) {
          //   // is punch-in only
          //   obj.out.millis = obj.out.millis + MILLIS_IN_DAY;
          //   setDBItem(build_db_path.punchClock(obj.out.userID), obj.out);
          // } else if (!obj.out) {
          //   // is punch-out only
          //   obj.in.millis = obj.in.millis + MILLIS_IN_DAY;
          // } else {
          //   // has both punch-in and punch-out
          //   obj.in.millis = obj.in.millis + MILLIS_IN_DAY;
          //   obj.out.millis = obj.out.millis + MILLIS_IN_DAY;
          // }
          break;
        case "in-date-down":
          // obj.in.millis = oldMillis - MILLIS_IN_DAY;
          break;
        case "out-date-up":
          break;
        case "out-date-down":
          break;

        case "in-hour-up":
          break;
        case "in-hour-down":
          break;
        case "out-hour-up":
          break;
        case "out-hour-down":
          break;

        case "in-minutes-up":
          break;
        case "in-minutes-down":
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

      if (obj.out && obj.in) {
        dbUpdateUserPunchAction(userID, obj.out);
        dbUpdateUserPunchAction(userID, obj.in);
      } else {
      }
    }

    const iconSize = 30;
    return (
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "80%",
            height: "85%",
            backgroundColor: C.backgroundWhite,
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
                    borderColor: C.buttonLightGreenOutline,
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
              width: "65%",
              maxHeight: "97%",
              // minHeight: "20%",
              backgroundColor: C.backgroundListWhite,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              ...SHADOW_RADIUS_PROTO,
              // shadowColor: C.green,
            }}
          >
            {/* "Flat list component" ////////////////////////////////////////*/}
            {/* "Flat list component" ////////////////////////////////////////*/}
            {sHistoryDisplay.length > 0 ? (
              <FlatList
                // style={{ width: "100%" }}
                data={sHistoryDisplay}
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      height: 0,
                      backgroundColor: C.buttonLightGreen,
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
                        opacity: editable ? 1 : !sEditableRowIdx ? 1 : 0.55,
                        backgroundColor: isEven(idx)
                          ? C.listItemWhite
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
                          width: "8%",
                        }}
                      >
                        <Text style={{ color: makeGrey(0.4), marginRight: 5 }}>
                          {item.in?.year || item.out?.year}
                        </Text>
                      </View>
                      {item.in ? (
                        <View
                          style={{
                            flexDirection: "row",
                            width: "32%",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            // marginRight: 0,
                            // backgroundColor: "blue",
                            // paddin
                          }}
                        >
                          {editable ? <View></View> : null}
                          <Image_
                            icon={ICONS.forwardGreen}
                            size={17}
                            style={{ marginRight: 15 }}
                          />
                          <Text
                            style={{
                              color: C.textMain,
                              marginRight: 1,
                            }}
                          >
                            {item.in?.wordDayOfWeek
                              ? item.in?.wordDayOfWeek + ", "
                              : item.out?.wordDayOfWeek + ", "}
                          </Text>
                          <Text style={{ color: C.textMain }}>
                            {item.in?.wordDayOfMonth ||
                              item.out?.wordDayOfMonth}
                          </Text>
                          <View
                            style={{ alignItems: "center", marginRight: 20 }}
                          >
                            {editable ? (
                              <Button_
                                icon={ICONS.upChevron}
                                iconSize={iconSize}
                                onPress={() =>
                                  handleTimeEdit(item, "in-date-up")
                                }
                                buttonStyle={{
                                  paddingVertical: 0,
                                  paddingHorizontal: 0,
                                }}
                              />
                            ) : null}
                            <Text
                              style={{
                                width: 20,
                                textAlign: "center",
                              }}
                            >
                              {item.in?.dayOfMonth || item.out?.dayOfMonth}
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
                                  handleTimeEdit(item, "in-date-down")
                                }
                              />
                            ) : null}
                          </View>
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
                                width: iconSize,
                                textAlign: editable ? "center" : "right",
                                outlineColor: C.green,
                                paddingRight: 1,
                                // backgroundColor: "blue",
                                // borderWidth: 1,
                                outlineColor: C.green,
                                borderColor: C.buttonLightGreenOutline,
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
                                outlineColor: C.green,
                                outlineColor: C.green,
                                borderColor: C.buttonLightGreenOutline,
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
                      ) : (
                        <View style={{ width: "32%" }} />
                      )}
                      {item.out ? (
                        <View
                          style={{
                            flexDirection: "row",
                            width: "35%",
                            alignItems: "center",
                          }}
                        >
                          <Image_
                            icon={ICONS.backRed}
                            size={15}
                            style={{ marginRight: 15 }}
                          />

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginRight: 20,
                              // marginRight: 3,
                              // width: "45%",
                            }}
                          >
                            <Text
                              style={{
                                color: C.textMain,
                                marginRight: 1,
                              }}
                            >
                              {item.in?.wordDayOfWeek
                                ? item.in?.wordDayOfWeek + ", "
                                : item.out?.wordDayOfWeek + ", "}
                            </Text>
                            <Text style={{ color: C.textMain }}>
                              {item.in?.wordDayOfMonth ||
                                item.out?.wordDayOfMonth}
                            </Text>
                            <View
                              style={{ alignItems: "center", marginLeft: 3 }}
                            >
                              {editable ? (
                                <Button_
                                  icon={ICONS.upChevron}
                                  iconSize={iconSize}
                                  onPress={() =>
                                    handleTimeEdit(item, "out-date-up")
                                  }
                                  buttonStyle={{
                                    paddingVertical: 0,
                                    paddingHorizontal: 0,
                                  }}
                                />
                              ) : null}
                              <Text style={{ width: 20, textAlign: "center" }}>
                                {item.in?.dayOfMonth || item.out?.dayOfMonth}
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
                                    handleTimeEdit(item, "out-date-down")
                                  }
                                />
                              ) : null}
                            </View>
                          </View>

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
                                outlineColor: C.green,
                                // borderWidth: 1,
                                paddingRight: 1,
                                borderColor: C.buttonLightGreenOutline,
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
                                outlineColor: C.green,
                                // borderWidth: 1,
                                paddingHorizontal: 0,
                                borderColor: C.buttonLightGreenOutline,
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
                      ) : (
                        <View style={{ width: "35%" }} />
                      )}
                      <View
                        style={{
                          width: "25%",
                          // backgroundColor: "green",
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        {item.hoursDiff || item.minutesDiff ? (
                          <View
                            style={{
                              flexDirection: "row",
                              width: "35%",
                              justifyContent: "space-between",
                              paddingRight: 12,
                              // backgroundColor: "blue",
                            }}
                          >
                            <Text style={{ color: makeGrey(0.6) }}>Total:</Text>
                            <Text style={{ textAlign: "right", width: 50 }}>
                              {(item.hoursDiff ? item.hoursDiff : "") +
                                " : " +
                                item.minutesDiff}
                            </Text>
                          </View>
                        ) : (
                          <View style={{ width: "35%" }} />
                        )}

                        <View
                          style={{
                            flexDirection: "row",
                            width: "60%",
                            justifyContent: "space-between",
                          }}
                        >
                          <Button_
                            onPress={() => {
                              if (sEditableRowIdx === idx) {
                                _setEditableRowIdx(null);
                              } else {
                                _setEditableRowIdx(idx);
                              }
                            }}
                            iconSize={20}
                            icon={ICONS.editPencil}
                          />
                          {editable ? (
                            <Button_
                              onPress={() => {
                                log("delete punch clock item function needed");
                                if (sEditableRowIdx === idx) {
                                  _setEditableRowIdx(null);
                                } else {
                                  _setEditableRowIdx(idx);
                                }
                              }}
                              iconSize={16}
                              icon={ICONS.close1}
                            />
                          ) : null}
                        </View>
                      </View>
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
                <Text
                  style={{
                    color: makeGrey(0.4),
                    fontSize: 17,
                    paddingVertical: 10,
                  }}
                >
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
    sEditableRowIdx,
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
