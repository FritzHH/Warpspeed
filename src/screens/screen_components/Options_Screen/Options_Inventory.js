/*eslint-disable*/
import React, { useEffect, useState } from "react";
import { View, FlatList, Text, TouchableOpacity } from "react-native-web";
import { WORKORDER_ITEM_PROTO, INVENTORY_ITEM_PROTO } from "../../../data";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";

import {
  formatCurrencyDisp,
  generateRandomID,
  generateUPCBarcode,
  gray,
  lightenRGBByPercent,
  log,
  resolveStatus,
  searchInventory,
} from "../../../utils";
import {
  Button,
  Button_,
  ScreenModal,
  TouchableOpacity_,
  TextInput_,
} from "../../../components";
import { InventoryItemModalScreen } from "../modal_screens/InventoryItemModalScreen";
import { CustomItemModal } from "../modal_screens/CustomItemModal";
import { cloneDeep } from "lodash";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
} from "../../../stores";

function getQuickButtonFontSize(text, baseFontSize) {
  let len = (text || "").length;
  if (len <= 15) return baseFontSize;
  return Math.max(7, Math.round(baseFontSize - (len - 15) * 0.5));
}

export function InventoryComponent({}) {
  // store setters ///////////////////////////////////////////////////////////////

  // store getters //////////////////////////////////////////////////////////////
  const zQuickItemButtons = useSettingsStore(
    (state) => state.settings?.quickItemButtons
  );
  const zOpenWorkorderID = useOpenWorkordersStore(
    (state) => state.openWorkorderID
  );
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  // Check if all required data is loaded
  const isDataLoaded = zQuickItemButtons && zInventoryArr?.length > 0;

  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sModalItem, _setModalItem] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [sCurrentParentID, _setCurrentParentID] = useState(null);
  const [sMenuPath, _setMenuPath] = useState([]);
  const [sSelectedButtonID, _setSelectedButtonID] = useState(null);
  const [sCustomItemModal, _setCustomItemModal] = useState(null); // "labor" | "part" | null

  // Timeout to batch all store updates and reduce re-renders
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let arr = [];
    if (sSearchResults.length > 20) return;
    for (let i = 0; i <= 10; i++) {
      if (zInventoryArr[i]) arr.push(zInventoryArr[i]);
    }
    _setSearchResults(arr);
  }, [zInventoryArr]);
  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

  function search(searchTerm) {
    _setSearchTerm(searchTerm);
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    _setSearchResults(searchInventory(searchTerm, zInventoryArr));
  }

  // Search function (now called by debounced TextInput_)
  const handleSearch = (searchTerm) => {
    _setSelectedButtonID(null);
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    _setSearchResults(searchInventory(searchTerm, zInventoryArr));
  };

  function handleQuickButtonPress(buttonObj) {
    // Intercept $LABOR and $PART buttons
    if (buttonObj.id === "labor" || buttonObj.id === "part") {
      const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
      if (!openWorkorder) return;
      const statuses = useSettingsStore.getState().settings?.statuses;
      if (resolveStatus(openWorkorder.status, statuses)?.label?.toLowerCase() === "done & paid") return;
      _setCustomItemModal(buttonObj.id);
      return;
    }

    let children = zQuickItemButtons.filter(
      (b) => b.parentID === buttonObj.id
    );
    let hasChildren = children.length > 0;

    // Resolve inventory items from IDs
    let items = [];
    buttonObj.items?.forEach((id) => {
      let item = zInventoryArr.find((i) => i.id === id);
      if (item) items.push(item);
    });
    let hasItems = items.length > 0;

    if (hasChildren) {
      // Button has children — show them as wrapping buttons in right panel
      if (!buttonObj.parentID) {
        // Root button: start a fresh menu path
        _setMenuPath([{ id: buttonObj.id, name: buttonObj.name }]);
      } else {
        // Sub-button with its own children: drill deeper
        _setMenuPath((prev) => [
          ...prev,
          { id: buttonObj.id, name: buttonObj.name },
        ]);
      }
      _setCurrentParentID(buttonObj.id);

      if (hasItems) {
        _setSelectedButtonID(buttonObj.id);
        _setSearchResults(items);
      } else {
        _setSelectedButtonID(null);
        _setSearchResults([]);
      }
    } else {
      // Leaf button (no children) — show its items in FlatList only
      if (hasItems) {
        _setSelectedButtonID(buttonObj.id);
        _setSearchResults(items);
      }
      // Do NOT change sCurrentParentID or sMenuPath
    }
    _setSearchTerm("");
  }

  function handleBackPress() {
    let path = [...sMenuPath];
    path.pop();

    if (path.length === 0) {
      // Return to base state — no sub-menu open
      _setCurrentParentID(null);
      _setMenuPath([]);
      _setSelectedButtonID(null);
      _setSearchResults([]);
    } else {
      let newParentID = path[path.length - 1].id;
      _setCurrentParentID(newParentID);
      _setMenuPath(path);
      // Show parent button's items if it has any
      let parentButton = zQuickItemButtons.find((b) => b.id === newParentID);
      let items = [];
      parentButton?.items?.forEach((id) => {
        let item = zInventoryArr.find((i) => i.id === id);
        if (item) items.push(item);
      });
      if (items.length > 0) {
        _setSelectedButtonID(newParentID);
        _setSearchResults(items);
      } else {
        _setSelectedButtonID(null);
        _setSearchResults([]);
      }
    }
    _setSearchTerm("");
  }

  function inventoryItemSelected(item) {
    console.log("inventoryItemSelected:", item?.formalName, item?.id);
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (openWorkorder) {
      const statuses = useSettingsStore.getState().settings?.statuses;
      if (resolveStatus(openWorkorder.status, statuses)?.label?.toLowerCase() === "done & paid") return;
    }
    if (!openWorkorder) {
      console.log("  -> no open workorder, opening modal, sModalItem was:", sModalItem?.id);
      _setModalItem({ ...item });
      return;
    }
    useLoginStore.getState().requireLogin(() => {
      console.log("  -> adding to workorder:", openWorkorder.id);
      let workorderLines = openWorkorder.workorderLines;
      if (!workorderLines) workorderLines = [];
      let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
      lineItem.inventoryItem = item;
      lineItem.id = generateUPCBarcode();
      workorderLines.push(lineItem);
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines);

      // auto customer note
      const autoNoteTexts = useSettingsStore.getState().settings?.autoCustomerNoteTexts || [];
      const autoNote = autoNoteTexts.find((n) => n.inventoryItemID === item.id);
      if (autoNote && autoNote.text) {
        let customerNotes = openWorkorder.customerNotes || [];
        const alreadyHasNote = customerNotes.some((n) => n.autoNoteItemID === item.id);
        if (!alreadyHasNote) {
          customerNotes = [
            ...customerNotes,
            {
              name: "(Auto)",
              userID: "",
              value: autoNote.text,
              id: generateRandomID(),
              autoNoteItemID: item.id,
            },
          ];
          useOpenWorkordersStore.getState().setField("customerNotes", customerNotes);
        }
      }
    });
  }

  function handleInventoryInfoPress(item) {
    console.log("handleInventoryInfoPress:", item?.formalName, item?.id);
    _setModalItem({ ...item });
  }

  function handleCustomItemSave(lineItem) {
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (!openWorkorder) return;
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = openWorkorder.workorderLines || [];
      workorderLines = [...workorderLines, lineItem];
      useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
    });
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
    _setCurrentParentID(null);
    _setMenuPath([]);
    _setSelectedButtonID(null);
  }

  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////

  // Computed: children of current sub-menu level
  let currentChildren = sCurrentParentID
    ? (zQuickItemButtons || []).filter(
        (b) => b.parentID === sCurrentParentID
      )
    : [];

  // Show loading state until all data is ready and component is ready
  if (!isDataLoaded || !isReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: C.listItemWhite,
        }}
      >
        <Text style={{ fontSize: 16, color: C.text, textAlign: "center" }}>
          {/* Loading Quick Items... */}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingRight: 3,
        flex: 1,
      }}
    >
      <View
        style={{
          width: "100%",
          height: "5%",
          flexDirection: "row",
          paddingHorizontal: 4,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button_
          icon={ICONS.reset1}
          iconSize={20}
          onPress={() => clearSearch()}
          useColorGradient={false}
        />
        <TextInput_
          autoFocus={true}
          style={{
            borderBottomWidth: 1,
            borderBottomColor: gray(0.2),
            fontSize: 18,
            color: C.text,
            outlineWidth: 0,
            width: "80%",
            marginLeft: 20,
            marginRight: 30,
          }}
          placeholder="Search inventory"
          placeholderTextColor={gray(0.2)}
          value={sSearchTerm}
          onChangeText={(val) => handleSearch(val)}
        />
        <View title="New Item">
          <Button_
            icon={ICONS.new}
            iconSize={25}
            useColorGradient={false}
            onPress={() => {
              let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
              newItem.id = generateRandomID();
              _setModalItem(newItem);
            }}
          />
        </View>
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          paddingTop: 10,
          justifyContent: "flex-start",
          height: "95%",
        }}
      >
        {/** Left column — ALWAYS shows root-level buttons */}
        <View
          style={{
            justifyContent: "flex-start",
            width: "20%",
            paddingHorizontal: 2,
          }}
        >
          {zQuickItemButtons
            ?.filter((b) => !b.parentID)
            .map((item) => {
              let isActive =
                sSelectedButtonID === item.id ||
                (sMenuPath.length > 0 && sMenuPath[0].id === item.id);
              return (
                <Button_
                  key={item.id}
                  onPress={() => handleQuickButtonPress(item)}
                  colorGradientArr={isActive ? [] : COLOR_GRADIENTS.blue}
                  buttonStyle={{
                    borderWidth: 1,
                    borderRadius: 5,
                    borderColor: C.buttonLightGreenOutline,
                    marginBottom: 10,
                    paddingHorizontal: 2,
                    paddingLeft: 2,
                    backgroundColor: isActive
                      ? "rgb(245,166,35)"
                      : undefined,
                  }}
                  numLines={item.name.length > 17 ? 2 : 1}
                  textStyle={{
                    fontSize: getQuickButtonFontSize(item.name, 14),
                    fontWeight: 400,
                    textAlign: "center",
                    color: isActive ? "white" : C.textWhite,
                  }}
                  text={item.name.toUpperCase()}
                />
              );
            })}
        </View>

        {/** Right panel — breadcrumbs + wrapping buttons + FlatList */}
        <View
          style={{
            height: "100%",
            width: "80%",
            paddingTop: 10,
            paddingLeft: 3,
            paddingRight: 3,
          }}
        >
          {/** Section 1: Breadcrumbs + Back button (only when sub-menu is open) */}
          {sCurrentParentID !== null && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <Button_
                onPress={handleBackPress}
                icon={ICONS.upChevron}
                iconSize={16}
                text={"Up"}
                buttonStyle={{
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  marginRight: 8,
                }}
                textStyle={{ fontSize: 12, color: C.text }}
              />
              <Text
                style={{
                  color: gray(0.3),
                  marginRight: 4,
                  fontSize: 13,
                }}
              >
                {"..."}
              </Text>
              {sMenuPath.map((crumb, i) => (
                <View
                  key={crumb.id}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  {i > 0 && (
                    <Text
                      style={{
                        color: gray(0.3),
                        marginHorizontal: 4,
                        fontSize: 13,
                      }}
                    >
                      {">"}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      let newPath = sMenuPath.slice(0, i + 1);
                      _setMenuPath(newPath);
                      _setCurrentParentID(crumb.id);
                      _setSelectedButtonID(null);
                      _setSearchResults([]);
                      _setSearchTerm("");
                    }}
                  >
                    <Text
                      style={{
                        color:
                          i === sMenuPath.length - 1 ? gray(0.4) : gray(0.55),
                        fontSize: 13,
                        fontWeight:
                          i === sMenuPath.length - 1 ? "bold" : "normal",
                      }}
                    >
                      {crumb.name || "(unnamed)"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/** Section 2: Wrapping child buttons (only when sub-menu has children) */}
          {currentChildren.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              {currentChildren.map((btn) => {
                let isSelected = sSelectedButtonID === btn.id;
                let hasChildrenBelow = zQuickItemButtons.some(
                  (b) => b.parentID === btn.id
                );
                return (
                  <Button_
                    key={btn.id}
                    onPress={() => handleQuickButtonPress(btn)}
                    colorGradientArr={isSelected ? [] : COLOR_GRADIENTS.blue}
                    buttonStyle={{
                      borderWidth: 1,
                      borderRadius: 5,
                      borderColor: C.buttonLightGreenOutline,
                      marginRight: 6,
                      marginBottom: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: isSelected
                        ? "rgb(245,166,35)"
                        : undefined,
                    }}
                    textStyle={{
                      fontSize: getQuickButtonFontSize(btn.name, 13),
                      fontWeight: 400,
                      color: isSelected ? "white" : C.textWhite,
                    }}
                    text={
                      btn.name.toUpperCase() +
                      (hasChildrenBelow ? " \u25B6" : "")
                    }
                  />
                );
              })}
            </View>
          )}

          {/** Section 3: FlatList — always present, fills remaining space */}
          <FlatList
            style={{
              width: "100%",
              flex: 1,
            }}
            data={[...sSearchResults]}
            renderItem={({ item, index }) => {
              return (
                <View
                  style={{
                    borderRadius: 7,
                    borderLeftColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderLeftWidth: 2,
                    borderColor: C.listItemBorder,
                    flexDirection: "row",
                    alignItems: "center",
                    height: "100%",
                    backgroundColor: index % 2 === 0 ? C.backgroundListWhite : gray(0.04),
                    paddingRight: 3,
                    paddingVertical: 1,
                    marginBottom: 2,
                  }}
                >
                  {!!zOpenWorkorderID && (
                    <View style={{ width: "5%" }}>
                      <Button_
                        icon={ICONS.info}
                        iconSize={15}
                        buttonStyle={{ width: 30 }}
                        onPress={() => {
                          handleInventoryInfoPress(item);
                        }}
                      />
                    </View>
                  )}
                  <TouchableOpacity_
                    style={{
                      height: "100%",
                      width: zOpenWorkorderID ? "95%" : "100%",
                    }}
                    onPress={() => inventoryItemSelected(item)}
                  >
                    <View
                      style={{
                        width: "100%",
                        flexDirection: "row",
                        height: "100%",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          width: "85%",
                          fontSize: 15,
                          paddingLeft: 7,
                          paddingRight: 5,
                          color: C.text,
                        }}
                      >
                        {item.informalName || item.formalName}
                        {!!item.informalName && (
                          <Text style={{ fontSize: 12, color: "gray" }}>
                            {"\n" + item.formalName}
                          </Text>
                        )}
                      </Text>

                      <View
                        style={{
                          width: "15%",
                          height: "100%",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          borderLeftWidth: 1,
                          borderColor: C.listItemBorder,
                          paddingRight: 5,
                          backgroundColor: C.backgroundListWhite,
                        }}
                      >
                        <Text
                          style={{
                            textAlign: "right",
                            fontSize: 10,
                            color: gray(0.4),
                          }}
                        >
                          {"$ "}
                          <Text
                            style={{
                              textAlignVertical: "top",
                              fontSize: 14,
                              color: C.text,
                            }}
                          >
                            {formatCurrencyDisp(item.price)}
                          </Text>
                        </Text>
                        {!!item.salePrice && (
                          <Text
                            style={{
                              textAlign: "right",
                              fontSize: 10,
                              color: lightenRGBByPercent(C.red, 60),
                            }}
                          >
                            {"$ "}
                            <Text
                              style={{
                                textAlignVertical: "top",
                                fontSize: 12,
                                color: C.red,
                              }}
                            >
                              {/* {formatCurrencyDisp(item.salePrice)} */}
                            </Text>
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity_>
                </View>
              );
            }}
          />
        </View>
        {sModalItem && (
          <InventoryItemModalScreen
            item={sModalItem}
            isNew={!!(sModalItem.id && !sModalItem.formalName)}
            handleExit={() => _setModalItem(null)}
          />
        )}
        <CustomItemModal
          visible={!!sCustomItemModal}
          onClose={() => _setCustomItemModal(null)}
          onSave={handleCustomItemSave}
          type={sCustomItemModal}
        />
      </View>
    </View>
  );
}
