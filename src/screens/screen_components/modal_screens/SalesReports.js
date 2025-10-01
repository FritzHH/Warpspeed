/*eslint-disable*/
import { TouchableWithoutFeedback, View } from "react-native-web";
import { DateTimePicker, ScreenModal } from "../../../components";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getPreviousMondayDayJS, log } from "../../../utils";
import dayjs from "dayjs";
import { useLoginStore, useSettingsStore } from "../../../stores";

export const SalesReportsModal = ({ handleExit }) => {
  // store getters //////////////////////////////////////////////////////
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUser());
  const zSettingsObj = useSettingsStore((state) => state.getSettings());
  const zUserHasAdminRole = useLoginStore((state) =>
    state.getUserHasAdminRole()
  );

  // local state ////////////////////////////////////////////////////////

  const [sRange, _setRange] = useState({
    startDate: dayjs(), //test
    endDate: dayjs(), //test
  });
  const [sHistoryDisplay, _setHistoryDisplay] = useState([]);
  const [sFilteredArr, _setFilteredArr] = useState([]);

  /////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////
  // log("here");
  // filter the set for the date range selected
  useEffect(() => {
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
  }, [sRange, _setFilteredArr]);

  // log(sRunningTotalWages);
  let Component = useCallback(() => {
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
          <View style={{ width: "40%" }}>
            <DateTimePicker range={sRange} handleDateRangeChange={_setRange} />
          </View>
          <View style={{ width: "60%" }}></View>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [sRange, sHistoryDisplay]);

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
