/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { useState, memo } from "react";
import { cloneDeep } from "lodash";
import { TextInput_, Button_, DropdownMenu, Tooltip } from "../../../../components";
import { C, Fonts, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import {
  formatCurrencyDisp,
  generateRandomID,
  gray,
} from "../../../../utils";
import { workerSearchInventory } from "../../../../inventorySearchManager";
import { INVENTORY_ITEM_PROTO } from "../../../../data";

function AddedItemRow({ item, onRemove, onQtyChange, onDiscountChange, discounts }) {
  let name =
    item.inventoryItem?.formalName ||
    item.inventoryItem?.informalName ||
    "Unknown Item";
  let price = item.inventoryItem?.price || 0;
  let qty = item.qty || 1;
  let hasDiscount = !!(item.discountObj?.name || item.discountObj?.discountName);

  return (
    <View
      style={{
        paddingVertical: 5,
        paddingHorizontal: 8,
        marginBottom: 3,
        backgroundColor: "rgb(230, 240, 252)",
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: C.blue,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: C.text }}>{name}</Text>
          <Text style={{ fontSize: 11, color: C.lightText }}>
            Qty: {qty} | {formatCurrencyDisp(price)}
            {qty > 1 ? " | Total: " + formatCurrencyDisp(price * qty) : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Button_
            onPress={() => onQtyChange(item, qty + 1)}
            buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3 }}
            icon={ICONS.upArrowOrange}
            iconSize={18}
          />
          <Button_
            onPress={() => { if (qty > 1) onQtyChange(item, qty - 1); }}
            buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3, opacity: qty <= 1 ? 0.25 : 1 }}
            icon={ICONS.downArrowOrange}
            iconSize={18}
            enabled={qty > 1}
          />
          <Tooltip text="Discounts" position="top">
            <DropdownMenu
              buttonIcon={ICONS.dollarYellow}
              buttonIconSize={18}
              modalCoordY={25}
              modalCoordX={-100}
              buttonStyle={{ borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 3 }}
              dataArr={[
                { label: "No Discount" },
                ...(discounts || []).map((o) => ({ label: o.name })),
              ]}
              onSelect={(selected) => {
                if (selected.label === "No Discount") {
                  onDiscountChange(item, null);
                } else {
                  let disc = (discounts || []).find((o) => o.name === selected.label);
                  onDiscountChange(item, disc || null);
                }
              }}
            />
          </Tooltip>
          <Button_
            onPress={() => onRemove(item)}
            buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3 }}
            icon={ICONS.close1}
            iconSize={14}
          />
        </View>
      </View>
      {hasDiscount && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text style={{ color: C.green, fontSize: 11 }}>
            {item.discountObj.name || item.discountObj.discountName}
          </Text>
          {!!item.discountObj?.savings && (
            <Text style={{ color: C.green, fontSize: 11 }}>
              {"-$" + formatCurrencyDisp(item.discountObj.savings)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

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
  addedItems = [],
  onAddItem,
  onRemoveItem,
  onQtyChange,
  onDiscountChange,
  inventory = [],
  discounts = [],
  onOpenNewItemModal,
}) {
  const [sSearchString, _setSearchString] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sFocused, _setFocused] = useState(false);
  const [sNotFoundBarcode, _setNotFoundBarcode] = useState("");

  function handleSearch(val) {
    _setSearchString(val);
    _setNotFoundBarcode("");

    if (!val || val.length < 2) {
      _setSearchResults([]);
      return;
    }

    // Check for exact barcode match (12-digit scan)
    let trimmed = val.trim();
    if (/^\d{12}$/.test(trimmed)) {
      let exactMatch = inventory.find(
        (item) => item.upc === trimmed || item.id === trimmed
      );
      if (exactMatch) {
        onAddItem(exactMatch);
        _setSearchString("");
        _setSearchResults([]);
        return;
      }
      // Not found in inventory
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
    let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
    newItem.id = generateRandomID();
    newItem.upc = sNotFoundBarcode;
    if (onOpenNewItemModal) onOpenNewItemModal(newItem);
    _setNotFoundBarcode("");
  }

  function handleAddItem(invItem) {
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

      {/* Added Items List */}
      {addedItems.length > 0 && (
        <View style={{ marginTop: 8, paddingHorizontal: 6 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: Fonts.weight.textHeavy,
              color: C.blue,
              marginBottom: 4,
            }}
          >
            ADDED ITEMS ({addedItems.length})
          </Text>
          <ScrollView style={{ maxHeight: 120 }}>
            {addedItems.map((item, idx) => (
              <AddedItemRow
                key={item.id || idx}
                item={item}
                onRemove={onRemoveItem}
                onQtyChange={onQtyChange}
                onDiscountChange={onDiscountChange}
                discounts={discounts}
              />
            ))}
          </ScrollView>
        </View>
      )}

    </View>
  );
});
