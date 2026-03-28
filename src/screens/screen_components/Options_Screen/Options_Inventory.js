/*eslint-disable*/
import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, Text, TouchableOpacity, ScrollView } from "react-native-web";
import { WORKORDER_ITEM_PROTO, INVENTORY_ITEM_PROTO } from "../../../data";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";

import {
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  log,
  resolveStatus,
} from "../../../utils";
import { workerSearchInventory } from "../../../inventorySearchManager";
import {
  Button,
  Button_,
  Image_,
  ScreenModal,
  StaleBanner,
  TouchableOpacity_,
  TextInput_,
  Tooltip,
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
  const zOpenWorkorder = useOpenWorkordersStore((state) => {
    const id = state.openWorkorderID;
    return id ? state.workorders.find((o) => o.id === id) : null;
  });
  const zStatuses = useSettingsStore((state) => state.settings?.statuses);
  const isInventoryLocked =
    resolveStatus(zOpenWorkorder?.status, zStatuses)?.label?.toLowerCase() === "done & paid";

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
  const barcodeModalTimerRef = useRef(null);

  // Timeout to batch all store updates and reduce re-renders
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-fire "common" button on mount once data is loaded
  const hasAutoFiredRef = useRef(false);
  useEffect(() => {
    if (!isDataLoaded || hasAutoFiredRef.current) return;
    let commonBtn = zQuickItemButtons.find((b) => b.id === "common");
    if (commonBtn) {
      hasAutoFiredRef.current = true;
      handleQuickButtonPress(commonBtn);
    }
  }, [isDataLoaded]);
  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

  function search(searchTerm) {
    _setSearchTerm(searchTerm);
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    workerSearchInventory(searchTerm, (results) => _setSearchResults(results));
  }

  // Search function (now called by debounced TextInput_)
  const handleSearch = (searchTerm) => {
    _setSelectedButtonID(null);
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    workerSearchInventory(searchTerm, (results) => {
      _setSearchResults(results);
      // Auto-open create modal when a 12 or 13-digit barcode is entered and not found
      if (barcodeModalTimerRef.current) clearTimeout(barcodeModalTimerRef.current);
      if (/^\d{12,13}$/.test(searchTerm) && results.length === 0) {
        barcodeModalTimerRef.current = setTimeout(() => {
          let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
          newItem.id = crypto.randomUUID();
          if (searchTerm.length === 12) newItem.upc = searchTerm;
          else newItem.ean = searchTerm;
          _setModalItem(newItem);
        }, 1500);
      }
    });
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
      // Toggle off if clicking the already-active root button
      if (!buttonObj.parentID && sMenuPath.length > 0 && sMenuPath[0].id === buttonObj.id) {
        _setCurrentParentID(null);
        _setMenuPath([]);
        _setSelectedButtonID(null);
        _setSearchResults([]);
        _setSearchTerm("");
        return;
      }
      // Collapse up one level if clicking the active sub-button
      if (buttonObj.parentID && sMenuPath.some((crumb) => crumb.id === buttonObj.id)) {
        let idx = sMenuPath.findIndex((crumb) => crumb.id === buttonObj.id);
        let newPath = sMenuPath.slice(0, idx);
        if (newPath.length === 0) {
          _setCurrentParentID(sMenuPath[0].id);
          _setMenuPath([sMenuPath[0]]);
        } else {
          _setCurrentParentID(newPath[newPath.length - 1].id);
          _setMenuPath(newPath);
        }
        _setSelectedButtonID(null);
        _setSearchResults([]);
        return;
      }
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
      // Leaf button (no children) — toggle selection
      if (sSelectedButtonID === buttonObj.id) {
        _setSelectedButtonID(null);
        _setSearchResults([]);
      } else {
        _setSelectedButtonID(buttonObj.id);
        _setSearchResults(items);
      }
      _setCurrentParentID(null);
      _setMenuPath([]);
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
      const existingIndex = workorderLines.findIndex((l) => l.inventoryItem?.id === item.id);
      if (existingIndex !== -1) {
        workorderLines = cloneDeep(workorderLines);
        workorderLines[existingIndex].qty = (workorderLines[existingIndex].qty || 1) + 1;
      } else {
        let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
        lineItem.inventoryItem = item;
        lineItem.id = crypto.randomUUID();
        workorderLines = [...workorderLines, lineItem];
      }
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
          let currentUser = useLoginStore.getState().currentUser;
          let userName = currentUser
            ? "(" + currentUser.first + " " + (currentUser.last?.[0] || "") + ")  "
            : "(Auto)";
          customerNotes = [
            ...customerNotes,
            {
              name: userName,
              userID: currentUser?.id || "",
              value: autoNote.text,
              id: crypto.randomUUID(),
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
  // Prepend the active sub-menu button so the user can press to go up (skip root-level buttons)
  if (sCurrentParentID) {
    let activeBtn = (zQuickItemButtons || []).find((b) => b.id === sCurrentParentID);
    if (activeBtn && activeBtn.parentID) currentChildren = [activeBtn, ...currentChildren];
  }

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
      {/* {isInventoryLocked && (
        <StaleBanner
          text="Sale in Progress — Workorder Locked"
          style={{ marginHorizontal: 4, marginTop: 3, marginBottom: 3, backgroundColor: "black" }}
          textStyle={{ color: "#FFD600" }}
        />
      )} */}
      <View
        style={{ flex: 1, opacity: isInventoryLocked ? 0.4 : 1 }}
        pointerEvents={isInventoryLocked ? "none" : "auto"}
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
            outlineStyle: "none",
            width: "80%",
            marginLeft: 20,
            marginRight: 30,
          }}
          placeholder="Search inventory"
          placeholderTextColor={gray(0.2)}
          value={sSearchTerm}
          onChangeText={(val) => handleSearch(val)}
        />
        <Tooltip text="New Item" position="bottom">
          <Button_
            icon={ICONS.new}
            iconSize={25}
            useColorGradient={false}
            onPress={() => {
              let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
              newItem.id = crypto.randomUUID();
              _setModalItem(newItem);
            }}
          />
        </Tooltip>
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
                  colorGradientArr={isActive ? ["rgb(245,166,35)", "rgb(245,166,35)"] : (item.id === "labor" || item.id === "part" || item.id === "common") ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.blue}
                  buttonStyle={{
                    borderWidth: 1,
                    borderRadius: 5,
                    borderColor: C.buttonLightGreenOutline,
                    marginBottom: 10,
                    paddingHorizontal: 2,
                    paddingLeft: 2,
                    paddingVertical: item.id === "common" ? 14 : 5,
                    backgroundColor: undefined,
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
                text={"Home"}
                icon={ICONS.home}
                iconSize={14}
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={() => {
                  let root = sMenuPath[0];
                  if (root) {
                    _setCurrentParentID(root.id);
                    _setMenuPath([root]);
                    _setSelectedButtonID(null);
                    _setSearchResults([]);
                  }
                }}
                buttonStyle={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 5,
                  marginRight: 8,
                }}
                textStyle={{ fontSize: 12 }}
              />
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
                let isDrilledInto = btn.id === sCurrentParentID;
                let hasChildrenBelow = zQuickItemButtons.some(
                  (b) => b.parentID === btn.id
                );
                return (
                  <Button_
                    key={btn.id}
                    onPress={() => handleQuickButtonPress(btn)}
                    colorGradientArr={isDrilledInto ? ["rgb(245,166,35)", "rgb(245,166,35)"] : [C.green, C.green]}
                    buttonStyle={{
                      borderWidth: 1,
                      borderRadius: 5,
                      borderColor: C.buttonLightGreenOutline,
                      marginRight: 6,
                      marginBottom: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                    textStyle={{
                      fontSize: getQuickButtonFontSize(btn.name, 13),
                      fontWeight: 400,
                      color: C.textWhite,
                    }}
                    text={btn.name.toUpperCase() + (isDrilledInto ? " \u25B2" : " \u25B6")}
                  />
                );
              })}
            </View>
          )}

          {/** Section 3: Item list — always present, fills remaining space */}
          {sSearchResults.length === 0 && (sCurrentParentID || sSelectedButtonID) ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
              <Image_ icon={ICONS.info} size={40} />
              <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 12 }}>No items in menu</Text>
            </View>
          ) : (
            <ScrollView style={{ width: "100%", flex: 1 }}>
              {sSearchResults.map((item, index) => {
                let activeBtn = sSelectedButtonID ? (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID) : null;
                let dividerObj = (activeBtn?.dividers || []).find((d) => d.itemID === item.id);
                let hasDivider = !!dividerObj && index > 0;
                return (
                  <React.Fragment key={item.id}>
                    {hasDivider && (
                      <View style={{ marginTop: 3 }}>
                        <View style={{ height: 4, backgroundColor: C.buttonLightGreenOutline, borderRadius: 2 }} />
                        {!!dividerObj?.label && (
                          <Text style={{ fontSize: 16, color: C.blue, paddingVertical: 2, paddingHorizontal: 6, textAlign: "center", fontWeight: "600" }}>
                            {dividerObj.label}
                          </Text>
                        )}
                      </View>
                    )}
                    <View
                      style={{
                        borderRadius: 7,
                        borderLeftColor: C.buttonLightGreenOutline,
                        borderWidth: 1,
                        borderLeftWidth: 2,
                        borderColor: C.listItemBorder,
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: index % 2 === 0 ? C.backgroundListWhite : gray(0.04),
                        paddingRight: 3,
                        paddingVertical: 1,
                        marginTop: index === 0 ? 0 : 5,
                        marginBottom: 5,
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
                  </React.Fragment>
                );
              })}
            </ScrollView>
          )}
        </View>
        {sModalItem && (
          <InventoryItemModalScreen
            key={sModalItem.id}
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
    </View>
  );
}
