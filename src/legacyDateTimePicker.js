/*eslint-disable*/
import React from "react";
import { View } from "react-native-web";
import CalendarPicker, { useDefaultStyles } from "react-native-ui-datepicker";
import { C } from "./styles";

const LegacyDateTimePicker = ({ range, handleDateRangeChange = () => {} }) => {
  const defaultStyles = useDefaultStyles();

  function handleDateChange_(obj) {
    if (!obj.endDate) obj.endDate = obj.startDate;
    handleDateRangeChange(obj);
  }

  return (
    <View
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 15,
      }}
    >
      <View
        style={{
          padding: 50,
          borderRadius: 15,
          alignItems: "center",
        }}
      >
        <CalendarPicker
          styles={{
            ...defaultStyles,
            today: {
              borderColor: C.lightred,
              borderWidth: 2,
              borderRadius: 100,
            },
            selected: {
              borderRadius: 100,
              backgroundColor: C.blue,
            },
            selected_label: { color: "white" },
          }}
          mode="range"
          startDate={range.startDate}
          endDate={range.endDate}
          onChange={handleDateChange_}
        />
      </View>
    </View>
  );
};

export default LegacyDateTimePicker;
