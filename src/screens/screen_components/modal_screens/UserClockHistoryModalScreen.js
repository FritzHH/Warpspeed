import { FlatList, Text, View } from "react-native-web";
import { DateTimePicker, ScreenModal } from "../../../components";
import { APP_BASE_COLORS } from "../../../styles";
import { useEffect, useState } from "react";
import { getPreviousMondayDayJS, log } from "../../../utils";
import dayjs from "dayjs";

export const UserClockHistoryModal = ({ visible, userObj }) => {
  const [sRange, _setRange] = useState({
    startDate: getPreviousMondayDayJS(),
    endDate: dayjs(),
  });
  const [sHistoryDisplay, _setHistoryDisplay] = useState([]);
  const [sTotalHours, _setTotalHours] = useState("");

  useEffect(() => {
    let startMillis = sRange.startDate.valueOf();
    let endMillis = sRange.endDate.valueOf();
    log("start", startMillis);
    log("end", endMillis);

    let path = "PUNCH-HISTORY/" + userObj.id;
  }, [sRange, sHistoryDisplay, _setHistoryDisplay]);

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
