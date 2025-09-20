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
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  clog,
  convertMillisToHoursMins,
  decrementNumByFive,
  formatMillisForDisplay,
  generateRandomID,
  getPreviousMondayDayJS,
  getWordDayOfWeek,
  incrementNumByFive,
  log,
  gray,
  numberIsEven,
  trimToTwoDecimals,
} from "../../../utils";
import dayjs from "dayjs";
import {
  build_db_path,
  _dbFindPunchHistoryByMillisRange,
  dbSetOrUpdateUserPunchObj,
  setDBItem,
  dbDeleteUserPunchAction,
} from "../../../db_call_wrapper";
import sr from "dayjs/locale/sr";
import { cloneDeep, range, sortBy } from "lodash";
import { loadBundle } from "firebase/firestore";
import { isEven } from "face-api.js/build/commonjs/utils";
import { useLoginStore, useSettingsStore } from "../../../storesOld";
import {
  MILLIS_IN_DAY,
  MILLIS_IN_HOUR,
  MILLIS_IN_MINUTE,
} from "../../../constants";
import { ToolContextImpl } from "twilio/lib/rest/assistants/v1/tool";
import { ItemAssignmentContextImpl } from "twilio/lib/rest/numbers/v2/regulatoryCompliance/bundle/itemAssignment";
import { TIME_PUNCH_PROTO } from "../../../data";

// eslint-disable-next-line no-lone-blocks
{
  /** typically the User Obj will contain the "id" field for the user. however in the punch card punches, the id field is used for the id of the punch, so in this component to access {userobj}.id for the punch object, user {userobj}.userID */
}

export const UserClockHistoryModal = ({ userObj, handleExit }) => {
  // store getters //////////////////////////////////////////////////////
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zUserHasAdminRole = useLoginStore((state) =>
    state.getUserHasAdminRole()
  );

  // local state ////////////////////////////////////////////////////////
  const [sUserObj, _setUserObj] = useState(userObj);
  const [sUserDropdownDataArr, _setUserDropdownDataArr] = useState([]);

  // testing ////////////////////////
  let date = dayjs();
  date = date.add(9, "days");
  const [sRange, _setRange] = useState({
    // startDate: getPreviousMondayDayJS(),
    // endDate: dayjs(),
    startDate: dayjs(), //test
    endDate: getPreviousMondayDayJS(date), //test
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
    let dataArr = zSettingsObj?.users.map((user_obj) => {
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

    _dbFindPunchHistoryByMillisRange(sUserObj.id, dayBegin, dayEnd)
      .then((resArr) => {
        // log(formatMillisForDisplay(dayBegin), formatMillisForDisplay(dayEnd));
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
    let lastOneWasClockIn = false;
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
        lastOneWasClockIn = false;
        return;
      }

      if (counter === sFilteredArr.length - 1 && obj.option === "in") {
        // edge case, they either are going to work overnight or forgot to clock out on this date
        // log("edge 2");
        resObj.in = obj;
        resArr.push(resObj);
        lastOneWasClockIn = true;
        counter++;
        return;
      }

      if (obj.option === "in" && lastOneWasClockIn) {
        resObj.in = obj;
        resArr.push(resObj);
        counter++;
        // lastOneWasClockIn = true
        return;
      }

      if (obj.option === "in") {
        lastOneWasClockIn = true;
        // log("in" + counter);
        resObj.in = obj;
      } else if (obj.option === "out") {
        lastOneWasClockIn = false;
        // log("out" + counter);
        resObj.out = obj;
        resArr.push(resObj);
        resObj = {};
      }
      counter++;
    });
    // log(counter);
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

    // clog(arr);
  }, [_setHistoryDisplay, sFilteredArr]);

  // log(sRunningTotalWages);
  let Component = useCallback(() => {
    function handleNewPunchPress() {
      let usePrevious = false;
      let prevPunchObj = sFilteredArr[sFilteredArr.length - 1];
      // log(prevPunchObj);
      if (prevPunchObj.option === "in") usePrevious = true;

      let punchObj = { ...TIME_PUNCH_PROTO };
      punchObj.userID = sUserObj.id;
      punchObj.id = generateRandomID();
      punchObj.millis = usePrevious
        ? prevPunchObj.millis + MILLIS_IN_HOUR
        : new Date().getTime();
      punchObj.option = usePrevious ? "out" : "in";

      // update local punch array
      let filteredArr = cloneDeep(sFilteredArr);
      filteredArr.push(punchObj);
      _setFilteredArr(filteredArr);

      // send to db
      dbSetOrUpdateUserPunchObj(punchObj);
    }

    function handleDeletePunchPress(punchObj) {
      // log(sUserObj);
      dbSetOrUpdateUserPunchObj(punchObj, true);
      let arr = cloneDeep(sFilteredArr).filter((o) => o.id != punchObj.id);
      _setFilteredArr(arr);
    }

    function handleUserSelect(item, idx) {
      let user = zSettingsObj.users.find((o) => o.id === item.id);
      _setUserObj(user);
    }

    function handleTimeEdit(obj, option) {
      obj = cloneDeep(obj);

      let userID = obj.in ? obj.in.userID : obj.out.userID;
      let millis;

      switch (option) {
        case "in-date-up":
          millis = obj.in.millis + MILLIS_IN_DAY;
          break;
        case "in-date-down":
          millis = obj.in.millis - MILLIS_IN_DAY;
          break;
        case "out-date-up":
          millis = obj.out.millis + MILLIS_IN_DAY;
          break;
        case "out-date-down":
          millis = obj.out.millis - MILLIS_IN_DAY;
          break;
        case "in-hour-up":
          millis = obj.in.millis + MILLIS_IN_HOUR;
          break;
        case "in-hour-down":
          millis = obj.in.millis - MILLIS_IN_HOUR;
          break;
        case "out-hour-up":
          millis = obj.out.millis + MILLIS_IN_HOUR;
          break;
        case "out-hour-down":
          millis = obj.out.millis - MILLIS_IN_HOUR;
          break;
        case "in-minutes-up":
          millis = obj.in.millis + MILLIS_IN_MINUTE;
          break;
        case "in-minutes-down":
          millis = obj.in.millis - MILLIS_IN_MINUTE;
          break;
        case "out-minutes-up":
          millis = obj.out.millis + MILLIS_IN_MINUTE;
          break;
        case "out-minutes-down":
          millis = obj.out.millis - MILLIS_IN_MINUTE;
          break;
        case "in-am-pm":
          let val = 12 * MILLIS_IN_HOUR;
          if (obj.in.amPM === "PM") val = val * -1;
          millis = obj.in.millis + val;
          break;
        case "out-am-pm":
          let val1 = 12 * MILLIS_IN_HOUR;
          if (obj.out.amPM === "PM") val1 = val1 * -1;
          millis = obj.out.millis + val1;
          break;
      }

      let punchObj;
      let idx;
      if (option.includes("in-")) {
        idx = sFilteredArr.findIndex((o) => o.id === obj.in.id);
        punchObj = sFilteredArr[idx];
      } else {
        idx = sFilteredArr.findIndex((o) => o.id === obj.out.id);
        punchObj = sFilteredArr[idx];
      }

      // make sure the new in time isn't more than the out time
      if (option.includes("in-") && obj.in && obj.out) {
        if (millis >= obj.out.millis) return;
      }

      if (option.includes("out-") && obj.in && obj.out) {
        if (millis <= obj.in.millis) return;
      }

      // log("idx", idx);
      let filteredArr = cloneDeep(sFilteredArr);
      punchObj.millis = millis;
      // update local state
      filteredArr[idx] = punchObj;
      _setFilteredArr(filteredArr);
      // add to database
      dbSetOrUpdateUserPunchObj(punchObj);
    }

    const iconSize = 30;
    // log(zCurrentUserObj);
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
              <View
                style={{
                  marginBottom: 30,
                  flexDirection: "row",
                  justifyContent: "space-around",
                }}
              >
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
                <Button_
                  text={"Add Punch"}
                  onPress={handleNewPunchPress}
                  colorGradientArr={COLOR_GRADIENTS.blue}
                  icon={ICONS.tools1}
                  buttonStyle={{
                    alignSelf: "center",
                    borderRadius: 5,
                  }}
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
                  width: 100,
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
              <Text style={{ width: 400, textAlign: "right" }}>
                {"Total Selected Wages: "}
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 16,
                  width: 100,
                  textAlign: "right",
                }}
              >
                <Text style={{ fontSize: 16, color: gray(0.6) }}>$</Text>
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
                        opacity: editable ? 1 : !sEditableRowIdx ? 1 : 0.15,
                        backgroundColor: isEven(idx)
                          ? C.listItemWhite
                          : gray(0.075),
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
                        <Text style={{ color: gray(0.4), marginRight: 5 }}>
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
                          <Image_
                            icon={ICONS.forwardGreen}
                            size={17}
                            style={{ marginRight: 15 }}
                          />
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginRight: 10,
                              // backgroundColor: "green",
                              width: "30%",
                              justifyContent: "space-between",
                            }}
                          >
                            <View style={{ flexDirection: "row" }}>
                              <Text
                                style={{
                                  color: C.textMain,
                                  marginRight: 1,
                                }}
                              >
                                {item.in?.wordDayOfWeek + ", "}
                              </Text>
                              <Text style={{ color: C.textMain }}>
                                {item.in.wordDayOfMonth}
                              </Text>
                            </View>
                            <View
                              style={{
                                alignItems: "center",
                              }}
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
                                {item.in.dayOfMonth}
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
                                color: gray(0.6),
                                fontSize: 14,
                                // paddingHorizontal: 0,
                              }}
                              onSelect={(val) => {
                                handleTimeEdit(item, "in-am-pm");
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
                              // marginRight: 10,
                              // backgroundColor: "green",
                              width: "28%",
                              justifyContent: "space-between",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                // alignItems: "center",
                                // marginRight: 10,
                                // backgroundColor: "green",
                                // width: "40%",
                                // justifyContent: "space-between",
                              }}
                            >
                              <Text
                                style={{
                                  color: C.textMain,
                                  marginRight: 1,
                                }}
                              >
                                {item.out?.wordDayOfWeek + ", "}
                              </Text>
                              <Text style={{ color: C.textMain }}>
                                {item.out?.wordDayOfMonth}
                              </Text>
                            </View>

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
                                {item.out.dayOfMonth}
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

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              width: "100",
                            }}
                          >
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
                                color: gray(0.6),
                                fontSize: 14,
                                // paddingHorizontal: 0,
                              }}
                              onSelect={(val) => {
                                handleTimeEdit(item, "out-am-pm");
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
                              width: "45%",
                              justifyContent: "space-between",
                              paddingRight: 12,
                              // backgroundColor: "blue",
                            }}
                          >
                            <Text style={{ color: gray(0.6) }}>Total:</Text>
                            <Text style={{ textAlign: "right", width: 50 }}>
                              {(item.hoursDiff ? item.hoursDiff : "") +
                                " : " +
                                item.minutesDiff}
                            </Text>
                          </View>
                        ) : (
                          <View style={{ width: "45%" }} />
                        )}

                        <View
                          style={{
                            flexDirection: "row",
                            width: "50%",
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
                                handleDeletePunchPress(item.in || item.out);
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
                    color: gray(0.4),
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
