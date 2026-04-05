/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { useState, memo } from "react";
import { cloneDeep } from "lodash";
import { TextInput_, Button_ } from "../../../../components";
import { C, COLOR_GRADIENTS } from "../../../../styles";
import {
  formatCurrencyDisp,
  gray,
  generateEAN13Barcode,
  normalizeBarcode,
} from "../../../../utils";
import { workerSearchInventory } from "../../../../inventorySearchManager";
import { INVENTORY_ITEM_PROTO } from "../../../../data";
import { dlog, DCAT } from "./checkoutDebugLog";

function SearchResultRow({ item, onAdd }) {
  let name = item.formalName || item.informalName || "Unknown";
  let price = item.price || 0;

  return (
    <TouchableOpacity
      onPress={() => onAdd(item)}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        marginBottom: 3,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        borderRadius: 5,
        padding: 5,
        borderLeftWidth: 3,
      }}
    >
      <View>
        <Text style={{ color: C.text }}>{item.formalName}</Text>
        <Text style={{ color: C.text }}>{item.informalName}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: C.text }}>
          <Text style={{ color: C.text, fontSize: 13 }}>{"$  "}</Text>
          {formatCurrencyDisp(price)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export const InventorySearch = memo(function InventorySearch({
  onAddItem,
  inventory = [],
  onOpenNewItemModal,
}) {
  const [sSearchString, _setSearchString] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sFocused, _setFocused] = useState(false);
  const [sNotFoundBarcode, _setNotFoundBarcode] = useState("");

  function handleSearch(val) {
    dlog(DCAT.INPUT, "handleSearch", "InventorySearch", { query: val, resultCount: sSearchResults.length });
    _setSearchString(val);
    _setNotFoundBarcode("");

    if (!val || val.length < 2) {
      _setSearchResults([]);
      return;
    }

    // Check for exact barcode match (12 or 13-digit scan)
    let trimmed = val.trim();
    if (/^\d{12,13}$/.test(trimmed)) {
      let normalized = normalizeBarcode(trimmed);
      let exactMatch = normalized
        ? inventory.find((item) => item.id === normalized || item.primaryBarcode === normalized || (item.barcodes || []).includes(normalized))
        : inventory.find((item) => item.id === trimmed);
      if (exactMatch) {
        dlog(DCAT.ACTION, "barcodeScan_found", "InventorySearch", { itemId: exactMatch.id, itemName: exactMatch.formalName });
        onAddItem(exactMatch);
        _setSearchString("");
        _setSearchResults([]);
        return;
      }
      // Not found in inventory
      dlog(DCAT.ACTION, "barcodeScan_notFound", "InventorySearch", { barcode: trimmed });
      _setNotFoundBarcode(trimmed);
      _setSearchString("");
      _setSearchResults([]);
      return;
    }

    // Fuzzy search (off main thread)
    workerSearchInventory(val, (results) => {
      _setSearchResults(results?.slice(0, 15) || []);
    });
  }

  function handleCreateNewItem() {
    dlog(DCAT.BUTTON, "handleCreateNewItem", "InventorySearch", { barcode: sNotFoundBarcode });
    let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
    let barcode = normalizeBarcode(sNotFoundBarcode) || generateEAN13Barcode();
    newItem.id = barcode;
    newItem.primaryBarcode = barcode;
    if (onOpenNewItemModal) onOpenNewItemModal(newItem);
    _setNotFoundBarcode("");
  }

  function handleAddItem(invItem) {
    dlog(DCAT.BUTTON, "handleAddItem", "InventorySearch", { itemId: invItem?.id, itemName: invItem?.formalName });
    if (onAddItem) onAddItem(invItem);
    _setSearchString("");
    _setSearchResults([]);
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Search Input */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 10,
        }}
      >
        <TextInput_
          style={{
            borderBottomColor: gray(0.3),
            borderBottomWidth: 1,
            width: "100%",
            marginBottom: 10,
            fontSize: 16,
            color: C.text,
            outlineWidth: 0,
            outlineStyle: "none",
          }}
          value={sSearchString}
          onChangeText={handleSearch}
          placeholder="Scan or search inventory..."
          placeholderTextColor={gray(0.3)}
          onFocus={() => _setFocused(true)}
          onBlur={() => _setFocused(false)}
        />
      </View>

      {/* Barcode Not Found */}
      {!!sNotFoundBarcode && (
        <View
          style={{
            marginHorizontal: 6,
            marginBottom: 8,
            padding: 10,
            borderRadius: 6,
            backgroundColor: "rgb(255, 248, 240)",
            borderWidth: 1,
            borderColor: C.orange,
          }}
        >
          <Text style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
            Barcode <Text style={{ fontWeight: "600" }}>{sNotFoundBarcode}</Text> not found in inventory.
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button_
              text="Create Item"
              onPress={handleCreateNewItem}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingVertical: 5, paddingHorizontal: 10 }}
            />
            <Button_
              text="Dismiss"
              onPress={() => _setNotFoundBarcode("")}
              colorGradientArr={COLOR_GRADIENTS.grey}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingVertical: 5, paddingHorizontal: 10 }}
            />
          </View>
        </View>
      )}

      {/* Search Results */}
      {sSearchResults.length > 0 && (
        <ScrollView
          style={{
            maxHeight: 140,
            marginHorizontal: 6,
            borderWidth: 1,
            borderColor: gray(0.1),
            borderRadius: 4,
            backgroundColor: "white",
          }}
        >
          {sSearchResults.map((item, idx) => (
            <SearchResultRow
              key={item.id || idx}
              item={item}
              onAdd={handleAddItem}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
});
