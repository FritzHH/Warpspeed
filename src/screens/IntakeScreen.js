/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useState, useEffect, useRef } from "react";
import { cloneDeep } from "lodash";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
} from "../stores";
import {
  createNewWorkorder,
  resolveStatus,
  formatCurrencyDisp,
  gray,
  deepEqual,
  formatWorkorderNumber,
} from "../utils";
import { WORKORDER_ITEM_PROTO, COLORS } from "../data";
import {
  Button_,
  TextInput_,
  Image_,
  DropdownMenu,
} from "../components";
import {
  dbListenToSettings,
  dbListenToInventory,
  dbListenToOpenWorkorders,
  dbSaveOpenWorkorder,
  startNewWorkorder,
} from "../db_calls_wrapper";

const ON_THE_STAND_STATUS_ID = "34kttdkfekj";
const DROPDOWN_SELECTED_OPACITY = 0.3;

////////////////////////////////////////////////////////////////////////////////
// Main Screen
////////////////////////////////////////////////////////////////////////////////

export function IntakeScreen() {
  const zSettings = useSettingsStore((state) => {
    const s = state.settings;
    return {
      intakeButtons: s?.intakeButtons,
      statuses: s?.statuses,
      bikeBrands: s?.bikeBrands,
      bikeBrandsName: s?.bikeBrandsName,
      bikeOptionalBrands: s?.bikeOptionalBrands,
      bikeOptionalBrandsName: s?.bikeOptionalBrandsName,
      bikeDescriptions: s?.bikeDescriptions,
    };
  }, deepEqual);
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);

  // Firebase listeners (same as BaseScreen) — only if stores are empty
  useEffect(() => {
    dbListenToSettings((data) => {
      useSettingsStore.getState().setSettings(data, false, false);
    });
    dbListenToInventory((data) => {
      useInventoryStore.getState().setItems(data);
    });
    dbListenToOpenWorkorders((data) => {
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
  }, []);

  let selectedWorkorder = zWorkorders.find((o) => o.id === sSelectedWorkorderID);

  //////////////////////////////////////////////////////////////////////////////
  // Workorder field helpers
  //////////////////////////////////////////////////////////////////////////////

  function updateField(fieldName, value) {
    if (!selectedWorkorder) return;
    useOpenWorkordersStore.getState().setField(
      fieldName,
      value,
      selectedWorkorder.id
    );
  }

  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }
    updateField(fieldName, newColorObj);
  }

  //////////////////////////////////////////////////////////////////////////////
  // New Workorder
  //////////////////////////////////////////////////////////////////////////////

  async function handleNewWorkorder() {
    let wo = await startNewWorkorder(null, { status: ON_THE_STAND_STATUS_ID });
    _setSelectedWorkorderID(wo.id);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Intake button press — add items to workorder
  //////////////////////////////////////////////////////////////////////////////

  async function handleIntakeButtonPress(btn) {
    if (!selectedWorkorder) return;

    // Persist workorder to Firestore before adding items
    let wo = selectedWorkorder;
    await dbSaveOpenWorkorder(wo);

    // Resolve inventory items from IDs and add as workorder lines
    let lines = [...(wo.workorderLines || [])];
    (btn.itemsToAdd || []).forEach((itemId) => {
      let invItem = zInventory.find((o) => o.id === itemId);
      if (!invItem) return;
      let line = cloneDeep(WORKORDER_ITEM_PROTO);
      line.inventoryItem = invItem;
      line.id = crypto.randomUUID();
      lines.push(line);
    });

    useOpenWorkordersStore.getState().setField(
      "workorderLines",
      lines,
      wo.id,
      true // saveToDB
    );
  }

  //////////////////////////////////////////////////////////////////////////////
  // Delete line item
  //////////////////////////////////////////////////////////////////////////////

  function handleDeleteLine(lineIndex) {
    if (!selectedWorkorder) return;
    let lines = [...(selectedWorkorder.workorderLines || [])];
    lines.splice(lineIndex, 1);
    updateField("workorderLines", lines);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Render
  //////////////////////////////////////////////////////////////////////////////

  let intakeButtons = zSettings?.intakeButtons || [];
  let statuses = zSettings?.statuses || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* Top Bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.15),
          backgroundColor: "white",
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: Fonts.weight.textHeavy,
            color: C.text,
            marginRight: 16,
          }}
        >
          Intake
        </Text>

        {/* Workorder Selector */}
        <View style={{ flex: 1, marginRight: 10 }}>
          <WorkorderSelector
            workorders={zWorkorders}
            statuses={statuses}
            selectedID={sSelectedWorkorderID}
            onSelect={_setSelectedWorkorderID}
          />
        </View>

        <Button_
          text="New Workorder"
          icon={ICONS.add}
          iconSize={18}
          colorGradientArr={COLOR_GRADIENTS.green}
          onPress={handleNewWorkorder}
          buttonStyle={{ paddingHorizontal: 14, paddingVertical: 6 }}
          textStyle={{ fontSize: 13 }}
        />
      </View>

      {/* Main Content */}
      {selectedWorkorder ? (
        <View style={{ flex: 1 }}>
          {/* Detail Fields */}
          <View
            style={{
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.1),
              backgroundColor: "white",
            }}
          >
            <WorkorderDetailFields
              workorder={selectedWorkorder}
              zSettings={zSettings}
              updateField={updateField}
              setBikeColor={setBikeColor}
            />
          </View>

          {/* Items List */}
          <View
            style={{
              flex: 1,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.1),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: Fonts.weight.textHeavy,
                  color: C.blue,
                }}
              >
                ITEMS ({selectedWorkorder.workorderLines?.length || 0})
              </Text>
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
              {(selectedWorkorder.workorderLines || []).map((line, idx) => (
                <LineItemRow
                  key={line.id || idx}
                  line={line}
                  onDelete={() => handleDeleteLine(idx)}
                />
              ))}
              {(!selectedWorkorder.workorderLines ||
                selectedWorkorder.workorderLines.length === 0) && (
                <Text
                  style={{
                    fontSize: 13,
                    color: gray(0.4),
                    textAlign: "center",
                    paddingVertical: 30,
                  }}
                >
                  No items yet. Press an intake button below to add items.
                </Text>
              )}
            </ScrollView>
          </View>

          {/* Intake Buttons */}
          <View
            style={{
              padding: 12,
              backgroundColor: "white",
              borderTopWidth: 1,
              borderTopColor: gray(0.1),
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: Fonts.weight.textHeavy,
                color: C.blue,
                marginBottom: 8,
              }}
            >
              INTAKE BUTTONS
            </Text>
            <ScrollView
              horizontal={false}
              style={{ maxHeight: 200 }}
              contentContainerStyle={{
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {intakeButtons.map((btn) => (
                <IntakeButtonCard
                  key={btn.id}
                  btn={btn}
                  onPress={() => handleIntakeButtonPress(btn)}
                  zInventory={zInventory}
                />
              ))}
              {intakeButtons.length === 0 && (
                <Text style={{ fontSize: 13, color: gray(0.4), padding: 10 }}>
                  No intake buttons configured. Set them up in Dashboard Admin.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 15, color: gray(0.4) }}>
            Select a workorder or create a new one to begin.
          </Text>
        </View>
      )}
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Selector Dropdown
////////////////////////////////////////////////////////////////////////////////

const WorkorderSelector = ({ workorders, statuses, selectedID, onSelect }) => {
  const [sOpen, _setOpen] = useState(false);

  let selected = workorders.find((o) => o.id === selectedID);
  let label = selected
    ? `#${formatWorkorderNumber(selected.workorderNumber) || "?"} — ${
        selected.customerFirst || selected.brand || "(no name)"
      } ${selected.customerLast || ""}`.trim()
    : "Select Workorder...";

  return (
    <View>
      <TouchableOpacity
        onPress={() => _setOpen(!sOpen)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: "white",
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            color: selected ? C.text : gray(0.4),
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Image_
          icon={sOpen ? ICONS.upArrow : ICONS.downArrow}
          size={12}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {sOpen && (
        <ScrollView
          style={{
            position: "absolute",
            top: 36,
            left: 0,
            right: 0,
            maxHeight: 300,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: gray(0.2),
            borderRadius: 6,
            zIndex: 100,
          }}
        >
          {workorders.map((wo) => {
            let status = resolveStatus(wo.status, statuses);
            return (
              <TouchableOpacity
                key={wo.id}
                onPress={() => {
                  onSelect(wo.id);
                  _setOpen(false);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.08),
                  backgroundColor:
                    wo.id === selectedID ? "rgb(230,240,252)" : "white",
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: status.backgroundColor || gray(0.3),
                    marginRight: 8,
                  }}
                />
                <Text
                  style={{ fontSize: 13, color: C.text, flex: 1 }}
                  numberOfLines={1}
                >
                  #{formatWorkorderNumber(wo.workorderNumber) || "?"} — {wo.customerFirst || wo.brand || "(no name)"}{" "}
                  {wo.customerLast || ""}
                </Text>
                <Text style={{ fontSize: 11, color: gray(0.5) }}>
                  {status.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {workorders.length === 0 && (
            <Text
              style={{
                fontSize: 13,
                color: gray(0.4),
                padding: 12,
                textAlign: "center",
              }}
            >
              No open workorders.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Workorder Detail Fields (Brand, Description, Color1, Color2)
////////////////////////////////////////////////////////////////////////////////

const WorkorderDetailFields = ({
  workorder,
  zSettings,
  updateField,
  setBikeColor,
}) => {
  return (
    <View>
      {/* Brand Row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <TextInput_
          placeholder="Brand"
          style={{
            width: "30%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            color: C.text,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: 5,
            fontWeight: workorder?.brand ? "500" : null,
          }}
          value={workorder?.brand || ""}
          onChangeText={(val) => updateField("brand", val)}
        />
        <View
          style={{
            flexDirection: "row",
            marginLeft: 8,
            flex: 1,
            justifyContent: "space-between",
          }}
        >
          <View style={{ width: "48%" }}>
            <DropdownMenu
              dataArr={zSettings?.bikeBrands || []}
              onSelect={(item) => updateField("brand", item)}
              buttonText={zSettings?.bikeBrandsName || "Bikes"}
              buttonStyle={{
                opacity: workorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1,
              }}
              modalCoordX={-6}
            />
          </View>
          <View style={{ width: "48%" }}>
            <DropdownMenu
              dataArr={zSettings?.bikeOptionalBrands || []}
              onSelect={(item) => updateField("brand", item)}
              buttonText={zSettings?.bikeOptionalBrandsName || "E-bikes"}
              buttonStyle={{
                opacity: workorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1,
              }}
              modalCoordX={0}
            />
          </View>
        </View>
      </View>

      {/* Description Row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <TextInput_
          placeholder="Model/Description"
          style={{
            width: "30%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            color: C.text,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: 5,
            fontWeight: workorder?.description ? "500" : null,
          }}
          value={workorder?.description || ""}
          onChangeText={(val) => updateField("description", val)}
        />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <DropdownMenu
            dataArr={zSettings?.bikeDescriptions || []}
            onSelect={(item) => updateField("description", item)}
            buttonText="Descriptions"
            buttonStyle={{
              opacity: workorder?.description ? DROPDOWN_SELECTED_OPACITY : 1,
            }}
            modalCoordX={55}
          />
        </View>
      </View>

      {/* Color Row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TextInput_
          placeholder="Color 1"
          value={workorder?.color1?.label || ""}
          style={{
            width: "15%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: 5,
            fontWeight: workorder?.color1?.label ? "500" : null,
            backgroundColor: workorder?.color1?.backgroundColor,
            color: workorder?.color1?.textColor || C.text,
          }}
          onChangeText={(val) => setBikeColor(val, "color1")}
        />
        <View style={{ width: 5 }} />
        <TextInput_
          placeholder="Color 2"
          value={workorder?.color2?.label || ""}
          style={{
            width: "15%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: 5,
            fontWeight: workorder?.color2?.label ? "500" : null,
            backgroundColor: workorder?.color2?.backgroundColor,
            color: workorder?.color2?.textColor || C.text,
          }}
          onChangeText={(val) => setBikeColor(val, "color2")}
        />
        <View
          style={{
            flexDirection: "row",
            marginLeft: 8,
            flex: 1,
            justifyContent: "space-between",
          }}
        >
          <View style={{ width: "48%" }}>
            <DropdownMenu
              itemSeparatorStyle={{ height: 0 }}
              dataArr={COLORS}
              menuBorderColor="transparent"
              onSelect={(item) => updateField("color1", item)}
              buttonText="Color 1"
              buttonStyle={{
                opacity: workorder?.color1?.label
                  ? DROPDOWN_SELECTED_OPACITY
                  : 1,
              }}
              modalCoordX={0}
            />
          </View>
          <View style={{ width: "48%" }}>
            <DropdownMenu
              itemSeparatorStyle={{ height: 0 }}
              dataArr={COLORS}
              menuBorderColor="transparent"
              onSelect={(item) => updateField("color2", item)}
              buttonText="Color 2"
              buttonStyle={{
                opacity: workorder?.color2?.label
                  ? DROPDOWN_SELECTED_OPACITY
                  : 1,
              }}
              modalCoordX={0}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Line Item Row
////////////////////////////////////////////////////////////////////////////////

const LineItemRow = ({ line, onDelete }) => {
  let inv = line.inventoryItem;
  let name = inv?.formalName || inv?.informalName || "(custom item)";
  let price = inv?.price || 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 6,
        paddingHorizontal: 8,
        marginBottom: 3,
        backgroundColor: "rgb(230, 240, 252)",
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: C.blue,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: C.text }}>{name}</Text>
        <Text style={{ fontSize: 11, color: C.lightText }}>
          Qty: {line.qty || 1} | ${formatCurrencyDisp(price)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        style={{
          paddingHorizontal: 8,
          paddingVertical: 6,
        }}
      >
        <Image_ icon={ICONS.trash} size={14} />
      </TouchableOpacity>
    </View>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Intake Button Card
////////////////////////////////////////////////////////////////////////////////

const IntakeButtonCard = ({ btn, onPress, zInventory }) => {
  let itemCount = btn.itemsToAdd?.length || 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: 140,
        minHeight: 50,
        margin: 4,
        padding: 8,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        borderRadius: 8,
        backgroundColor: C.listItemWhite,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          textAlign: "center",
          color: C.text,
          fontWeight: "500",
        }}
        numberOfLines={2}
      >
        {btn.label || "(unnamed)"}
      </Text>
      {itemCount > 0 && (
        <View
          style={{
            backgroundColor: C.blue,
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 10,
              fontWeight: "bold",
              paddingHorizontal: 4,
            }}
          >
            {itemCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
