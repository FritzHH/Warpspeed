/* eslint-disable */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useNavigate } from "react-router-dom";
import { C, ICONS } from "../../styles";
import { Image_ } from "../../components";
import { useOpenWorkordersStore, useSettingsStore } from "../../stores";
import {
  capitalizeFirstLetterOfString,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  resolveStatus,
  gray,
  deepEqual,
} from "../../utils";
import { dbGetOpenWorkorders } from "../../db_calls_wrapper";

export function MobileWorkorderListScreen() {
  const navigate = useNavigate();
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zStatuses = useSettingsStore((state) => state.settings?.statuses, deepEqual);

  const groups = groupWorkordersByStatus(zWorkorders, zStatuses);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.backgroundWhite }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
    >
      {/* Refresh button */}
      <TouchableOpacity
        onPress={async () => {
          const workorders = await dbGetOpenWorkorders();
          if (workorders) useOpenWorkordersStore.getState().setOpenWorkorders(workorders);
        }}
        style={{
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          marginBottom: 4,
        }}
      >
        <Image_ icon={ICONS.reset1} size={16} style={{ marginRight: 6 }} />
        <Text style={{ color: C.green, fontSize: 14, fontWeight: "500" }}>Refresh</Text>
      </TouchableOpacity>

      {groups.map((group) => (
        <View key={group.status.id} style={{ marginBottom: 20 }}>
          {/* Status Section Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
              paddingHorizontal: 4,
            }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: group.status.backgroundColor,
                marginRight: 8,
              }}
            />
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: C.text,
              }}
            >
              {group.status.label} ({group.items.length})
            </Text>
          </View>

          {/* Workorder Cards */}
          {group.items.map((workorder) => {
            const rs = resolveStatus(workorder.status, zStatuses);
            return (
              <TouchableOpacity
                key={workorder.id}
                onPress={() => navigate(`/workorder/${workorder.id}`)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: rs.backgroundColor,
                  borderRadius: 10,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  marginBottom: 8,
                }}
              >
                {/* Customer Name + hasNewSMS dot */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  {workorder.hasNewSMS && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: "gold",
                        marginRight: 5,
                      }}
                    />
                  )}
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: rs.textColor,
                      flex: 1,
                    }}
                  >
                    {capitalizeFirstLetterOfString(workorder.customerFirst) +
                      " " +
                      capitalizeFirstLetterOfString(workorder.customerLast)}
                  </Text>
                </View>

                {/* Phone number */}
                {!!workorder.customerCell && (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      color: rs.textColor,
                      opacity: 0.7,
                      marginBottom: 4,
                    }}
                  >
                    {formatPhoneWithDashes(workorder.customerCell)}
                  </Text>
                )}

                {/* Brand + Description + Item count badge */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 15,
                      fontWeight: "500",
                      color: rs.textColor,
                    }}
                  >
                    {workorder.brand || "No Brand"}
                  </Text>
                  {!!workorder.description && (
                    <>
                      <Text
                        style={{
                          fontSize: 15,
                          color: rs.textColor,
                          opacity: 0.6,
                          marginHorizontal: 6,
                        }}
                      >
                        {"\u2022"}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 15,
                          color: rs.textColor,
                          flex: 1,
                        }}
                      >
                        {workorder.description}
                      </Text>
                    </>
                  )}
                  {workorder.workorderLines?.length > 0 && (
                    <View
                      style={{
                        backgroundColor: "rgba(0,0,0,0.15)",
                        borderRadius: 10,
                        paddingHorizontal: 7,
                        paddingVertical: 1,
                        marginLeft: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: rs.textColor,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        {workorder.workorderLines.length}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Intake Date + Time Estimate */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: rs.textColor,
                      opacity: 0.8,
                    }}
                  >
                    {formatMillisForDisplay(workorder.startedOnMillis)}
                  </Text>
                  {!!workorder.waitTime?.label && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: rs.textColor,
                        opacity: 0.8,
                        fontStyle: "italic",
                      }}
                    >
                      est: {workorder.waitTime.label}
                    </Text>
                  )}
                </View>

                {/* Part ordered + source */}
                {!!(workorder.partOrdered || workorder.partSource) && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    {!!workorder.partOrdered && (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          color: rs.textColor,
                          fontWeight: "500",
                        }}
                      >
                        {workorder.partOrdered}
                      </Text>
                    )}
                    {!!(workorder.partOrdered && workorder.partSource) && (
                      <Text
                        style={{
                          color: rs.textColor,
                          opacity: 0.4,
                          marginHorizontal: 4,
                        }}
                      >
                        {"\u2022"}
                      </Text>
                    )}
                    {!!workorder.partSource && (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          color: rs.textColor,
                          opacity: 0.8,
                        }}
                      >
                        {workorder.partSource}
                      </Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {groups.length === 0 && (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: 60,
          }}
        >
          <Text style={{ fontSize: 16, color: C.lightText }}>
            No open workorders
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function groupWorkordersByStatus(workorders, statuses) {
  if (!workorders || !statuses) return [];
  const filtered = workorders;
  const placed = new Set();
  const groups = [];
  statuses.forEach((status) => {
    const items = filtered.filter((wo) => {
      if (placed.has(wo.id)) return false;
      if (wo.status === status.id) {
        placed.add(wo.id);
        return true;
      }
      return false;
    });
    if (items.length > 0) {
      groups.push({ status, items });
    }
  });
  return groups;
}
