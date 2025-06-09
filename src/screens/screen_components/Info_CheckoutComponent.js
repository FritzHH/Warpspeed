import { View } from "react-native-web";
import { TAB_NAMES, WORKORDER_PROTO } from "../../data";
import {
  useCheckoutStore,
  useCurrentWorkorderStore,
  useOpenWorkordersStore,
  useTabNamesStore,
} from "../../stores";
import { Button } from "../../components";
import { cloneDeep } from "lodash";
import { clog, generateRandomID, log } from "../../utils";

export const Info_CheckoutComponent = ({}) => {
  // setters
  const _zSetOpenWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  //   const _zSetCurrentSaleObj = useCheckoutStore(
  //     (state) => state.setWorkorderObj
  //   );
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);

  // getters
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());

  //////////////////////////////////////////////////////////////////////

  function newSalePressed() {
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandalaloneSale = true;
    wo.id = generateRandomID();
    _zSetOpenWorkorderObj(wo);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  if (!zWorkorderObj || !zWorkorderObj.isStandalaloneSale) {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: null,
          justifyContent: "flex-end",
          alignItems: "flex-end",
        }}
      >
        <Button
          textStyle={{ color: "lightgray" }}
          buttonStyle={{
            marginRight: 10,
            height: 35,
            backgroundColor: "green",
          }}
          text={"New Sale"}
          onPress={newSalePressed}
        />
      </View>
    );
  }

  return (
    <View
      style={{ width: "100%", height: "100%", backgroundColor: null }}
    ></View>
  );
};
