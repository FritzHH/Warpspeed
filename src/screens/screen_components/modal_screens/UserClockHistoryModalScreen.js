import { FlatList, Text, View } from "react-native-web";
import { DateTimePicker, ScreenModal } from "../../../components";
import { APP_BASE_COLORS } from "../../../styles";
import { useEffect, useState } from "react";
import {
  clog,
  convertMillisToHoursMins,
  getDisplayFormattedDate,
  getDisplayFormattedDateWithTime,
  getPreviousMondayDayJS,
  getWordDayOfWeek,
  log,
  numberIsEven,
} from "../../../utils";
import dayjs from "dayjs";
import { dbFindPunchHistoryByMillisRange } from "../../../db_call_wrapper";
import sr from "dayjs/locale/sr";
import { sortBy } from "lodash";

export const UserClockHistoryModal = ({ userObj }) => {
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
          let dateObj = getDisplayFormattedDateWithTime(o.millis);
          arr.push({ ...o, dateObj });
        });
        _setFilteredArr(arr);
      })
      .catch((e) => log("error", e));
  }, [sRange, sHistoryDisplay, _setHistoryDisplay, userObj, _setFilteredArr]);

  useEffect(() => {
    let resArr = [];

    let prevPunch;
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
        let diff = obj.out.millis - obj.in.millis;
        let total = convertMillisToHoursMins(diff);
        obj.hours = total.hours;
        obj.minutes = total.minutes;
      }
      arr.push(obj);
    });

    clog(arr);
  }, [sFilteredArr, _setHistoryDisplay]);

  let Component = () => (
    <View
      style={{
        width: "80%",
        height: "80%",
        backgroundColor: APP_BASE_COLORS.backgroundWhite,
        flexDirection: "row",
        alignItems: "flex-start",
        padding: 30,
        borderRadius: 15,
      }}
    >
      <View style={{ width: "40%" }}>
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
      <View style={{}}>
        <FlatList
          data={sHistoryDisplay}
          renderItem={(obj) => {
            let idx = obj.index;
            let item = obj.item;

            return <View style={{}}></View>;
          }}
        />
      </View>
    </View>
  );

  return (
    <ScreenModal
      buttonVisible={false}
      Component={Component}
      modalVisible={true}
      showOuterModal={true}
    />
  );
};
