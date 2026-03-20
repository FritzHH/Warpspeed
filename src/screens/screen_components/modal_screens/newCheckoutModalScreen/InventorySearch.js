/* eslint-disable */
import { View, Text, TextInput, ScrollView } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { useState } from "react";
import { C, Fonts } from "../../../../styles";
import {
  searchInventory,
  formatCurrencyDisp,
  gray,
} from "../../../../utils";

function AddedItemRow({ item, onRemove }) {
  let name =
    item.inventoryItem?.formalName ||
    item.inventoryItem?.informalName ||
    "Unknown Item";
  let price = item.inventoryItem?.price || 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 5,
        paddingHorizontal: 8,
        marginBottom: 3,
        backgroundColor: "rgb(230, 240, 252)",
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: C.blue,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: C.text }}>{name}</Text>
        <Text style={{ fontSize: 11, color: C.lightText }}>
          Qty: {item.qty || 1} | {formatCurrencyDisp(price)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onRemove(item)}
        style={{
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: gray(0.08),
          borderRadius: 4,
        }}
      >
        <Text style={{ fontSize: 10, color: C.lightred }}>Remove</Text>
      </TouchableOpacity>
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

export function InventorySearch({
  addedItems = [],
  onAddItem,
  onRemoveItem,
  inventory = [],
}) {
  const [sSearchString, _setSearchString] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sFocused, _setFocused] = useState(false);

  function handleSearch(val) {
    _setSearchString(val);

    if (!val || val.length < 2) {
      _setSearchResults([]);
      return;
    }

    // Check for exact UPC match (12-digit scan)
    if (val.length === 12 && /^\d+$/.test(val)) {
      let exactMatch = inventory.find((item) => item.id === val);
      if (exactMatch) {
        onAddItem(exactMatch);
        _setSearchString("");
        _setSearchResults([]);
        return;
      }
    }

    // Fuzzy search
    let results = searchInventory(val, inventory);
    _setSearchResults(results?.slice(0, 15) || []);
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
        <TextInput
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
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
