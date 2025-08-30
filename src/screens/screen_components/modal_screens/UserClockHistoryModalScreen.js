import {
  FlatList,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native-web";
import { DateTimePicker, ScreenModal } from "../../../components";
import { APP_BASE_COLORS } from "../../../styles";
import React, { useEffect, useState } from "react";
import {
  clog,
  convertMillisToHoursMins,
  getDisplayFormattedDate,
  getPreviousMondayDayJS,
  getWordDayOfWeek,
  log,
  makeGrey,
  numberIsEven,
} from "../../../utils";
import dayjs from "dayjs";
import { dbFindPunchHistoryByMillisRange } from "../../../db_call_wrapper";
import sr from "dayjs/locale/sr";
import { range, sortBy } from "lodash";
import { loadBundle } from "firebase/firestore";

export const UserClockHistoryModal = React.memo(({ userObj, handleExit }) => {
  const [sRange, _setRange] = useState({
    startDate: getPreviousMondayDayJS(),
    endDate: dayjs(),
  });
  const [sHistoryDisplay, _setHistoryDisplay] = useState([]);
  const [sTotalHours, _setTotalHours] = useState("");
  const [sFilteredArr, _setFilteredArr] = useState([]);

  useEffect(() => {
    if (!userObj) return;
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

    dbFindPunchHistoryByMillisRange(userObj.id, dayBegin, dayEnd)
      .then((resArr) => {
        resArr = sortBy(resArr, "millis");
        let arr = [];
        resArr.forEach((o) => {
          arr.push(o);
          // let dateObj = getDisplayFormattedDateWithTime(o.millis);
          // arr.push({ ...o, dateObj });
        });
        _setFilteredArr(arr);
      })
      .catch((e) => log("error", e));
  }, [sRange, userObj, _setFilteredArr]);

  useEffect(() => {
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
        // clog(obj.in);
        let diff = obj.out.millis - obj.in.millis;
        let total = convertMillisToHoursMins(diff);
        obj.hoursDiff = total.hours;
        obj.minutesDiff = total.minutes;
        obj.totalMinutes = total.totalMinutes;
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
      // log(obj);
      arr.push(obj);
      _setHistoryDisplay(arr);
    });

    // clog(arr);
  }, [_setHistoryDisplay, sFilteredArr]);
  // log("rendering");

  let Component = React.useCallback(
    () => (
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "60%",
            height: "85%",
            backgroundColor: APP_BASE_COLORS.backgroundWhite,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-evenly",
            padding: 30,
            borderRadius: 15,
          }}
        >
          <View style={{ width: "45%" }}>
            <DateTimePicker range={sRange} handleDateRangeChange={_setRange} />
            <View
              style={{
                marginTop: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
              }}
            >
              <Text>Total Selected Hours: </Text>
              <Text>{sTotalHours}</Text>
            </View>
          </View>
          <View
            style={{
              width: "45%",
              height: "95%",
              backgroundColor: APP_BASE_COLORS.backgroundListWhite,
              borderRadius: 15,
            }}
          >
            <FlatList
              // style={{ width: "100%" }}
              data={sHistoryDisplay}
              ItemSeparatorComponent={() => (
                <View
                  style={{
                    height: 1,
                    backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                  }}
                />
              )}
              renderItem={(obj) => {
                let idx = obj.index;
                let item = obj.item;
                // log("item", item);
                return (
                  <View
                    style={{
                      width: "95%",
                      // alignItems: "space-around",
                      marginVertical: 5,
                      borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                      // borderWidth: 1,
                      borderRadius: 1,
                      padding: 5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        // backgroundColor: APP_BASE_COLORS.listItemWhite,
                        // backgroundColor: "green",
                        // marginRight: 40,
                      }}
                    >
                      {item.in ? (
                        <View
                          style={{
                            flexDirection: "row",
                            width: "40%",
                            alignItems: "flex-end",

                            // justifyContent: "space-between",
                            // backgroundColor: "green",
                          }}
                        >
                          <Text style={{ fontSize: 12, color: makeGrey(0.5) }}>
                            IN:{" "}
                          </Text>
                          <Text
                            style={{
                              color:
                                Number(item.in?.dayOfMonth) !==
                                  Number(item.out?.dayOfMonth) &&
                                (!item.out || !item.in)
                                  ? "red"
                                  : APP_BASE_COLORS.textMain,
                              fontSize: 13,
                              marginRight: 10,
                            }}
                          >
                            {item.in.wordDayOfWeek +
                              ", " +
                              item.in.wordDayOfMonth +
                              " " +
                              item.in.dayOfMonth}
                          </Text>

                          <TextInput
                            style={{ width: 10, textAlign: "right" }}
                            value={item.in.hour}
                          />
                          <Text>:</Text>
                          <TextInput
                            style={{ width: 20 }}
                            value={item.in.minutes}
                          />
                          <TextInput
                            style={{ width: 20 }}
                            value={item.in.amPM}
                          />
                        </View>
                      ) : null}
                      {item.out ? (
                        <View
                          style={{
                            flexDirection: "row",
                            width: "50%",
                            alignItems: "flex-end",
                            borderLeftWidth: 1,
                            borderColor:
                              APP_BASE_COLORS.buttonLightGreenOutline,
                            paddingLeft: 5,
                            height: "100%",
                            // justifyContent: "space-between",
                            // backgroundColor: "green",
                          }}
                        >
                          <Text style={{ fontSize: 12, color: makeGrey(0.5) }}>
                            OUT:{" "}
                          </Text>
                          <Text
                            style={{
                              color:
                                item.in?.dayOfMonth === item.out?.dayOfMonth &&
                                (item.in || item.out)
                                  ? APP_BASE_COLORS.textMain
                                  : "red",
                              fontSize: 13,
                              marginRight: 10,
                            }}
                          >
                            {item.in.wordDayOfWeek +
                              ", " +
                              item.in.wordDayOfMonth +
                              " " +
                              item.in.dayOfMonth}
                          </Text>

                          <TextInput
                            style={{ width: 10, textAlign: "right" }}
                            value={item.out.hour}
                          />
                          <Text>:</Text>
                          <TextInput
                            style={{ width: 20 }}
                            value={item.out.minutes}
                          />
                          <TextInput
                            style={{ width: 20 }}
                            value={item.out.amPM}
                          />
                        </View>
                      ) : null}
                      {/* {item.hoursDiff || item.minutesDiff ? (
                    <Text style={{ textAlign: "right", width: "20%" }}>
                      {(item.hoursDiff ? item.hoursDiff : "") +
                        ":" +
                        item.minutesDiff}
                    </Text>
                  ) : null} */}
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    ),
    [sTotalHours, sHistoryDisplay, sRange]
  );

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
});
