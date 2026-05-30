/*eslint-disable*/
import {
  Button,
  DateTimePicker,
  DropdownMenu,
  Image,
  ScreenModal,
  LargeModalHeader,
  LargeModalHeaderButton,
} from "../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, SHADOW_RADIUS_PROTO, Radius } from "../../../styles";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertMillisToHoursMins, formatMillisForDisplay, getPreviousMondayDayJS, log, trimToTwoDecimals } from "../../../utils";
import dayjs from "dayjs";
import cloneDeep from "lodash/cloneDeep";
import sortBy from "lodash/sortBy";
import { useLoginStore, useSettingsStore } from "../../../stores";
import { deepEqual } from "../../../utils";
import {
  MILLIS_IN_DAY,
  MILLIS_IN_HOUR,
  MILLIS_IN_MINUTE,
} from "../../../constants";
import { TIME_PUNCH_PROTO } from "../../../data";
import {
  dbGetPunchesByTimeFrame,
  dbSavePunchObject,
} from "../../../db_calls_wrapper";
import styles from "./UserClockHistoryModalScreen.module.css";

const isEven = (n) => n % 2 === 0;

/** typically the User Obj will contain the "id" field for the user. however in the punch card punches, the id field is used for the id of the punch, so in this component to access {userobj}.id for the punch object, user {userobj}.userID */

export const UserClockHistoryModal = ({ userObj, handleExit }) => {
  const zCurrentUserObj = useLoginStore((state) => state.currentUser);
  const zUsers = useSettingsStore((state) => state.settings?.users, deepEqual);

  const [sUserObj, _setUserObj] = useState(userObj);
  const [sUserDropdownDataArr, _setUserDropdownDataArr] = useState([]);

  let date = dayjs();
  date = date.add(9, "days");
  const [sRange, _setRange] = useState({
    startDate: dayjs(),
    endDate: getPreviousMondayDayJS(date),
  });
  const [sHistoryDisplay, _setHistoryDisplay] = useState([]);
  const [sTotalHours, _setTotalHours] = useState("");
  const [sFilteredArr, _setFilteredArr] = useState([]);
  const [sSelectedUserIdx, _setSelectedUserIdx] = useState();
  const [sTotalMinutesWorked, _setTotalMinutesWorked] = useState();
  const [sRunningTotalWages, _setRunningTotalWages] = useState();
  const [sEditableRowIdx, _setEditableRowIdx] = useState(1);

  const userDropdownRef = useRef();

  useEffect(() => {
    let selectedUserIdx;
    let idx = 0;
    let dataArr = zUsers.map((user_obj) => {
      if (user_obj.id === sUserObj.id) selectedUserIdx = idx;
      idx++;
      return {
        label: user_obj.first + " " + user_obj.last,
        id: user_obj.id,
      };
    });
    _setSelectedUserIdx(selectedUserIdx);
    _setUserDropdownDataArr(dataArr);
  }, [zUsers, sUserObj, _setSelectedUserIdx, _setUserDropdownDataArr]);

  useEffect(() => {
    if (!sUserObj) return;
    if (!sRange.startDate || !sRange.endDate) return;
    let startMillis = sRange.startDate.valueOf();
    let endMillis = sRange.endDate.valueOf();

    let dayBegin = new Date(startMillis);
    let dayEnd = new Date(endMillis);
    dayBegin.setHours(0, 0, 1, 0);
    dayEnd.setHours(23, 59, 59, 0);
    dayBegin = dayBegin.getTime();
    dayEnd = dayEnd.getTime();

    dbGetPunchesByTimeFrame(dayBegin, dayEnd, sUserObj.id)
      .then((resArr) => {
        resArr = sortBy(resArr, "millis");
        _setFilteredArr(resArr);
      })
      .catch((e) => log("error", e));
  }, [sRange, sUserObj, _setFilteredArr]);

  useEffect(() => {
    let resArr = [];
    let counter = 0;
    let resObj = {};
    let lastOneWasClockIn = false;
    sFilteredArr.forEach((obj) => {
      obj = cloneDeep(obj);
      if (counter === 0 && obj.option === "out") {
        resObj.out = obj;
        resArr.push(resObj);
        resObj = {};
        counter++;
        lastOneWasClockIn = false;
        return;
      }

      if (counter === sFilteredArr.length - 1 && obj.option === "in") {
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
        return;
      }

      if (obj.option === "in") {
        lastOneWasClockIn = true;
        resObj.in = obj;
      } else if (obj.option === "out") {
        lastOneWasClockIn = false;
        resObj.out = obj;
        resArr.push(resObj);
        resObj = {};
      }
      counter++;
    });

    let arr = [];
    let runningTotalMinutes = 0;
    resArr.forEach((obj) => {
      obj = cloneDeep(obj);
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
        obj.hoursDiff = total.hours;
        obj.minutesDiff = total.minutes;
        obj.totalMinutes = total.totalMinutes;
        runningTotalMinutes += total.totalMinutes;
        if (Number(obj.minutesDiff) < 10) {
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
      arr.push(obj);
    });
    _setRunningTotalWages(
      trimToTwoDecimals((runningTotalMinutes / 60) * sUserObj.hourlyWage)
    );
    _setTotalMinutesWorked(runningTotalMinutes);
    _setHistoryDisplay(arr);
  }, [_setHistoryDisplay, sFilteredArr]);

  let Component = useCallback(() => {
    function handleNewPunchPress() {
      let usePrevious = false;
      let prevPunchObj = sFilteredArr[sFilteredArr.length - 1];
      if (prevPunchObj.option === "in") usePrevious = true;

      let punchObj = { ...TIME_PUNCH_PROTO };
      punchObj.userID = sUserObj.id;
      punchObj.id = crypto.randomUUID();
      punchObj.millis = usePrevious
        ? prevPunchObj.millis + MILLIS_IN_HOUR
        : new Date().getTime();
      punchObj.option = usePrevious ? "out" : "in";

      let filteredArr = cloneDeep(sFilteredArr);
      filteredArr.push(punchObj);
      _setFilteredArr(filteredArr);

      dbSavePunchObject(punchObj);
    }

    function handleDeletePunchPress(punchObj) {
      dbSavePunchObject(punchObj);
      let arr = cloneDeep(sFilteredArr).filter((o) => o.id != punchObj.id);
      _setFilteredArr(arr);
    }

    function handleUserSelect(item) {
      let user = zUsers?.find((o) => o.id === item.id);
      _setUserObj(user);
    }

    function handleTimeEdit(obj, option) {
      obj = cloneDeep(obj);
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
        case "in-am-pm": {
          let val = 12 * MILLIS_IN_HOUR;
          if (obj.in.amPM === "PM") val = val * -1;
          millis = obj.in.millis + val;
          break;
        }
        case "out-am-pm": {
          let val1 = 12 * MILLIS_IN_HOUR;
          if (obj.out.amPM === "PM") val1 = val1 * -1;
          millis = obj.out.millis + val1;
          break;
        }
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

      if (option.includes("in-") && obj.in && obj.out) {
        if (millis >= obj.out.millis) return;
      }
      if (option.includes("out-") && obj.in && obj.out) {
        if (millis <= obj.in.millis) return;
      }

      let filteredArr = cloneDeep(sFilteredArr);
      punchObj.millis = millis;
      filteredArr[idx] = punchObj;
      _setFilteredArr(filteredArr);
      dbSavePunchObject(punchObj);
    }

    const iconSize = 30;

    const renderChevron = (icon, onClick) => (
      <Button
        icon={icon}
        iconSize={iconSize}
        onPress={onClick}
        buttonStyle={{
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 4,
          paddingBottom: 4,
          backgroundColor: "transparent",
        }}
        iconStyle={{ marginRight: 0 }}
      />
    );

    return (
      <div
        className={styles.modalCard}
        style={{ "--card-bg": C.backgroundWhite }}
        onClick={(e) => e.stopPropagation()}
      >
        <LargeModalHeader
          title={((sUserObj?.first || "") + " " + (sUserObj?.last || "")).trim() || "Punch History"}
          iconSize={22}
          actions={
            <LargeModalHeaderButton
              variant="default"
              icon={ICONS.close1}
              iconPosition="only"
              tooltip="Close"
              onClick={handleExit}
            />
          }
        />
        <div className={styles.modalCardBody}>
        <div className={styles.leftCol}>
          {!!zCurrentUserObj?.permissions?.level >= 3 && (
            <div className={styles.topRow}>
              <DropdownMenu
                buttonStyle={{
                  width: 150,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: C.buttonLightGreenOutline,
                  alignSelf: "center",
                  borderRadius: Radius.control,
                }}
                ref={userDropdownRef}
                matchValue={sUserObj?.id}
                useSelectedAsButtonTitle={true}
                dataArr={sUserDropdownDataArr}
                onSelect={handleUserSelect}
              />
              <Button
                text={"Add Punch"}
                onPress={handleNewPunchPress}
                colorGradientArr={COLOR_GRADIENTS.blue}
                icon={ICONS.tools1}
                buttonStyle={{
                  alignSelf: "center",
                  borderRadius: Radius.control,
                }}
              />
            </div>
          )}
          <DateTimePicker range={sRange} handleDateRangeChange={_setRange} />
          <div className={styles.totalsRow}>
            <span className={styles.totalLabel}>{"Total Selected Time: "}</span>
            <span className={styles.totalValue}>
              {
                convertMillisToHoursMins(
                  sTotalMinutesWorked * MILLIS_IN_MINUTE
                ).formattedHoursMin
              }
            </span>
            <span>{sTotalHours}</span>
          </div>
          <div className={styles.totalsRow}>
            <span className={styles.totalLabelWide}>{"Total Selected Wages: "}</span>
            <span className={styles.totalValue}>
              <span
                className={styles.dollarPrefix}
                style={{ "--label-color": C.textSecondary }}
              >
                $
              </span>
              {Number(sRunningTotalWages)?.toLocaleString()}
            </span>
          </div>
        </div>
        <div
          className={styles.rightCol}
          style={{
            "--list-bg": C.backgroundListWhite,
            "--list-border": C.buttonLightGreenOutline,
            ...SHADOW_RADIUS_PROTO,
          }}
        >
          {!!sHistoryDisplay.length > 0 && (
            <div className={styles.historyList}>
              {sHistoryDisplay.map((item, idx) => {
                let editable = idx === sEditableRowIdx;
                const rowStyle = {
                  opacity: editable ? 1 : !sEditableRowIdx ? 1 : 0.15,
                  backgroundColor: isEven(idx)
                    ? C.listItemWhite
                    : C.surfaceAlt,
                };
                return (
                  <div
                    key={item.in?.id || item.out?.id || idx}
                    className={styles.punchRow}
                    style={rowStyle}
                  >
                    <div className={styles.yearCell}>
                      <span
                        className={styles.yearText}
                        style={{ "--year-color": C.textMuted }}
                      >
                        {item.in?.year || item.out?.year}
                      </span>
                    </div>
                    {!!item.in && (
                      <div className={styles.inCell}>
                        <Image
                          icon={ICONS.forwardGreen}
                          size={17}
                          className={styles.iconChip}
                        />
                        <div className={styles.dateBlock}>
                          <div className={styles.dateLabel}>
                            <span
                              className={styles.dayText}
                              style={{ "--text-color": C.text }}
                            >
                              {item.in?.wordDayOfWeek + ", "}
                            </span>
                            <span style={{ color: C.text }}>
                              {item.in.wordDayOfMonth}
                            </span>
                          </div>
                          <div className={styles.dateColumn}>
                            {!!editable &&
                              renderChevron(ICONS.upChevron, () =>
                                handleTimeEdit(item, "in-date-up")
                              )}
                            <span className={styles.dateValue}>
                              {item.in.dayOfMonth}
                            </span>
                            {!!editable &&
                              renderChevron(ICONS.downChevron, () =>
                                handleTimeEdit(item, "in-date-down")
                              )}
                          </div>
                        </div>
                        <div className={styles.timeColumn}>
                          {!!editable &&
                            renderChevron(ICONS.upChevron, () =>
                              handleTimeEdit(item, "in-hour-up")
                            )}
                          <span
                            className={
                              editable ? styles.timeValueEditable : styles.timeValue
                            }
                            style={{ width: iconSize }}
                          >
                            {item.in.hour}
                          </span>
                          {!!editable &&
                            renderChevron(ICONS.downChevron, () =>
                              handleTimeEdit(item, "in-hour-down")
                            )}
                        </div>
                        <span className={styles.colon}>:</span>
                        <div className={styles.timeColumn}>
                          {!!editable &&
                            renderChevron(ICONS.upChevron, () =>
                              handleTimeEdit(item, "in-minutes-up")
                            )}
                          <span
                            className={
                              editable
                                ? styles.timeValueEditable
                                : styles.timeValueLeft
                            }
                            style={{ width: iconSize }}
                          >
                            {item.in.minutes}
                          </span>
                          {!!editable &&
                            renderChevron(ICONS.downChevron, () =>
                              handleTimeEdit(item, "in-minutes-down")
                            )}
                        </div>
                        <div className={styles.amPmWrap}>
                          <DropdownMenu
                            dataArr={[{ label: "AM" }, { label: "PM" }]}
                            useSelectedAsButtonTitle={true}
                            matchValue={item.in.amPM}
                            buttonStyle={{
                              backgroundColor: "transparent",
                              paddingLeft: 4,
                              paddingRight: 4,
                              borderRadius: Radius.control,
                            }}
                            buttonTextStyle={{
                              color: C.textSecondary,
                              fontSize: 14,
                            }}
                            onSelect={() => {
                              handleTimeEdit(item, "in-am-pm");
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {!!item.out && (
                      <div className={styles.outCell}>
                        <Image
                          icon={ICONS.backRed}
                          size={15}
                          className={styles.iconChip}
                        />
                        <div className={styles.dateBlockOut}>
                          <div className={styles.dateLabel}>
                            <span
                              className={styles.dayText}
                              style={{ "--text-color": C.text }}
                            >
                              {item.out?.wordDayOfWeek + ", "}
                            </span>
                            <span style={{ color: C.text }}>
                              {item.out?.wordDayOfMonth}
                            </span>
                          </div>
                          <div className={styles.dateColumnOut}>
                            {!!editable &&
                              renderChevron(ICONS.upChevron, () =>
                                handleTimeEdit(item, "out-date-up")
                              )}
                            <span className={styles.dateValue}>
                              {item.out.dayOfMonth}
                            </span>
                            {!!editable &&
                              renderChevron(ICONS.downChevron, () =>
                                handleTimeEdit(item, "out-date-down")
                              )}
                          </div>
                        </div>
                        <div className={styles.outTimeGroup}>
                          <div>
                            {!!editable &&
                              renderChevron(ICONS.upChevron, () =>
                                handleTimeEdit(item, "out-hour-up")
                              )}
                            <span
                              className={
                                editable
                                  ? styles.timeValueEditable
                                  : styles.timeValue
                              }
                              style={{ width: iconSize, display: "block" }}
                            >
                              {item.out.hour}
                            </span>
                            {!!editable &&
                              renderChevron(ICONS.downChevron, () =>
                                handleTimeEdit(item, "out-hour-down")
                              )}
                          </div>
                          <span className={styles.colon}>:</span>
                          <div>
                            {!!editable &&
                              renderChevron(ICONS.upChevron, () =>
                                handleTimeEdit(item, "out-minutes-up")
                              )}
                            <span
                              className={
                                editable
                                  ? styles.timeValueEditable
                                  : styles.timeValueLeft
                              }
                              style={{ width: iconSize, display: "block" }}
                            >
                              {item.out.minutes}
                            </span>
                            {!!editable &&
                              renderChevron(ICONS.downChevron, () =>
                                handleTimeEdit(item, "out-minutes-down")
                              )}
                          </div>
                        </div>
                        <div className={styles.amPmWrap}>
                          <DropdownMenu
                            dataArr={[{ label: "AM" }, { label: "PM" }]}
                            useSelectedAsButtonTitle={true}
                            matchValue={item.out.amPM}
                            buttonStyle={{
                              backgroundColor: "transparent",
                              paddingLeft: 4,
                              paddingRight: 4,
                              borderRadius: Radius.control,
                            }}
                            buttonTextStyle={{
                              color: C.textSecondary,
                              fontSize: 14,
                            }}
                            onSelect={() => {
                              handleTimeEdit(item, "out-am-pm");
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className={styles.totalsCell}>
                      {!!(item.hoursDiff || item.minutesDiff) && (
                        <div className={styles.totalsBlock}>
                          <span
                            className={styles.totalsLabel}
                            style={{ "--label-color": C.textSecondary }}
                          >
                            Total:
                          </span>
                          <span className={styles.totalsValue}>
                            {(item.hoursDiff ? item.hoursDiff : "") +
                              " : " +
                              item.minutesDiff}
                          </span>
                        </div>
                      )}
                      <div className={styles.actionsBlock}>
                        <Button
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
                        {!!editable && (
                          <Button
                            onPress={() => {
                              handleDeletePunchPress(item.in || item.out);
                              if (sEditableRowIdx === idx) {
                                _setEditableRowIdx(null);
                              } else {
                                _setEditableRowIdx(idx);
                              }
                            }}
                            iconSize={16}
                            icon={ICONS.trash}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    );
  }, [
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
