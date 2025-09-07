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
  makeGrey,
  numberIsEven,
  trimToTwoDecimals,
} from "../../../utils";
import dayjs from "dayjs";
import {
  build_db_path,
  _dbFindPunchHistoryByMillisRange,
  dbUpdateUserPunchAction,
  setDBItem,
  dbDeleteUserPunchAction,
} from "../../../db_call_wrapper";
import sr from "dayjs/locale/sr";
import { cloneDeep, range, sortBy } from "lodash";
import { loadBundle } from "firebase/firestore";
import { isEven } from "face-api.js/build/commonjs/utils";
import { useLoginStore, useSettingsStore } from "../../../stores";
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

export const SalesReportsModal = ({ handleExit }) => {
  // store getters //////////////////////////////////////////////////////
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zUserHasAdminRole = useLoginStore((state) =>
    state.getUserHasAdminRole()
  );

  // local state ////////////////////////////////////////////////////////
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
  const [sFilteredArr, _setFilteredArr] = useState([]);

  /////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////

  // filter the set for the date range selected
  useEffect(() => {
    // if (!sUserObj) return;
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

    // _dbFindPunchHistoryByMillisRange(sUserObj.id, dayBegin, dayEnd)
    //   .then((resArr) => {
    //     // log(formatMillisForDisplay(dayBegin), formatMillisForDisplay(dayEnd));
    //     // clog("res arr", resArr);
    //     resArr = sortBy(resArr, "millis");
    //     _setFilteredArr(resArr);
    //   })
    //   .catch((e) => log("error", e));
  }, [sRange, _setFilteredArr]);

  // log(sRunningTotalWages);
  let Component = useCallback(() => {
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
