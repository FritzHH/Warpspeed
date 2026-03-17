/* eslint-disable */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useNavigate } from "react-router-dom";
import { C } from "../../styles";
import { useOpenWorkordersStore, useSettingsStore } from "../../stores";
import { formatMillisForDisplay } from "../../utils";

export function MobileWorkorderListScreen() {
  const navigate = useNavigate();
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zSettings = useSettingsStore((state) => state.settings);

  const groups = groupWorkordersByStatus(zWorkorders, zSettings?.statuses);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.backgroundWhite }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
    >
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
          {group.items.map((workorder) => (
            <TouchableOpacity
              key={workorder.id}
              onPress={() => navigate(`/workorder/${workorder.id}`)}
              activeOpacity={0.7}
              style={{
                backgroundColor: workorder.status?.backgroundColor || group.status.backgroundColor,
                borderRadius: 10,
                paddingVertical: 14,
                paddingHorizontal: 16,
                marginBottom: 8,
              }}
            >
              {/* Customer Name */}
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 17,
                  fontWeight: "600",
                  color: workorder.status?.textColor || group.status.textColor,
                  marginBottom: 4,
                }}
              >
                {(workorder.customerFirst || "") + " " + (workorder.customerLast || "")}
              </Text>

              {/* Brand + Description */}
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
                    color: workorder.status?.textColor || group.status.textColor,
                  }}
                >
                  {workorder.brand || "No Brand"}
                </Text>
                {!!workorder.description && (
                  <>
                    <Text
                      style={{
                        fontSize: 15,
                        color: workorder.status?.textColor || group.status.textColor,
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
                        color: workorder.status?.textColor || group.status.textColor,
                        flex: 1,
                      }}
                    >
                      {workorder.description}
                    </Text>
                  </>
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
                    color: workorder.status?.textColor || group.status.textColor,
                    opacity: 0.8,
                  }}
                >
                  {formatMillisForDisplay(workorder.startedOnMillis)}
                </Text>
                {!!workorder.waitTime?.label && (
                  <Text
                    style={{
                      fontSize: 13,
                      color: workorder.status?.textColor || group.status.textColor,
                      opacity: 0.8,
                      fontStyle: "italic",
                    }}
                  >
                    est: {workorder.waitTime.label}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
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
  const filtered = workorders.filter((o) => !o.isStandaloneSale);
  const placed = new Set();
  const groups = [];
  statuses.forEach((status) => {
    const items = filtered.filter((wo) => {
      if (placed.has(wo.id)) return false;
      if (wo.status?.id === status.id) {
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
