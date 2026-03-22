/* eslint-disable */
import React, { useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native-web";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { C, ICONS } from "../../styles";
import { AlertBox_, Image_ } from "../../components";
import {
  useOpenWorkordersStore,
  useInventoryStore,
  useAlertScreenStore,
  useLayoutStore,
} from "../../stores";
import {
  dbGetOpenWorkorders,
  dbGetInventoryItems,
} from "../../db_calls_wrapper";
import { log } from "../../utils";

export function MobileBaseScreen() {
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);
  const height = useLayoutStore((state) => state.height);
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/";

  // Fetch fresh data on mount and when app returns to foreground
  // Replaces the 4 real-time listeners that were here before
  useEffect(() => {
    fetchFreshData();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchFreshData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function fetchFreshData() {
    try {
      const [workorders, inventory] = await Promise.all([
        dbGetOpenWorkorders(),
        dbGetInventoryItems(),
      ]);
      if (workorders) useOpenWorkordersStore.getState().setOpenWorkorders(workorders);
      if (inventory) useInventoryStore.getState().setItems(inventory);
    } catch (e) {
      log("Mobile data refresh failed:", e);
    }
  }

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: C.backgroundWhite,
      }}
    >
      {/* Header Bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: C.buttonLightGreen,
          borderBottomWidth: 1,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        {!isHome ? (
          <TouchableOpacity
            onPress={() => navigate(-1)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 8,
              paddingRight: 16,
            }}
          >
            <Image_ icon={ICONS.backRed} size={20} />
            <Text
              style={{
                color: C.text,
                fontSize: 16,
                marginLeft: 8,
                fontWeight: "500",
              }}
            >
              Back
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Image_ icon={ICONS.gears1} size={24} style={{ marginRight: 8 }} />
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: C.text,
              }}
            >
              WARPSPEED
            </Text>
          </View>
        )}
      </View>

      {/* Alert overlay */}
      <AlertBox_ showAlert={zShowAlert} />

      {/* Nested route content */}
      <View style={{ flex: 1 }}>
        <Outlet />
      </View>
    </View>
  );
}
