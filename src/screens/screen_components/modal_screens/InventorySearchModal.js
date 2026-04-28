/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useState, useRef } from "react";
import { C } from "../../../styles";
import { gray, formatCurrencyDisp } from "../../../utils";
import { CheckBox_ } from "../../../components";
import { workerSearchInventory } from "../../../inventorySearchManager";
import { StandKeypad } from "../../../shared/StandKeypad";

const InventorySearchModal = ({ onAddItems, onClose }) => {
  const [sSearchText, _setSearchText] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sSearching, _setSearching] = useState(false);
  const [sCheckedIDs, _setCheckedIDs] = useState(new Set());
  const searchTimerRef = useRef(null);
  const inputRef = useRef(null);
  const headerSwipeRef = useRef(null);

  function handleSearchTextChange(newText) {
    _setSearchText(newText);
    clearTimeout(searchTimerRef.current);
    if (!newText || newText.length < 2) {
      _setSearchResults([]);
      _setSearching(false);
      return;
    }
    _setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      workerSearchInventory(newText, (results) => {
        _setSearchResults(results || []);
        _setSearching(false);
      });
    }, 300);
  }

  function handleKeyPress(key) {
    if (key === "CLR") {
      handleSearchTextChange("");
    } else if (key === "\u232B") {
      handleSearchTextChange(sSearchText.slice(0, -1));
    } else if (key === " ") {
      handleSearchTextChange(sSearchText + " ");
    } else {
      handleSearchTextChange(sSearchText + key.toLowerCase());
    }
  }

  function toggleCheck(itemID) {
    let next = new Set(sCheckedIDs);
    if (next.has(itemID)) next.delete(itemID);
    else next.add(itemID);
    _setCheckedIDs(next);
  }

  function handleTapItem(item) {
    onAddItems([item]);
  }

  function handleAddChecked() {
    let items = sSearchResults.filter((it) => sCheckedIDs.has(it.id));
    if (items.length > 0) onAddItems(items);
  }

  let checkedCount = sCheckedIDs.size;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "95%",
          height: "95%",
          backgroundColor: "white",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          onClick={onClose}
          onTouchStart={(e) => { headerSwipeRef.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            if (headerSwipeRef.current !== null) {
              let diff = e.changedTouches[0].clientY - headerSwipeRef.current;
              if (diff > 20) onClose();
              headerSwipeRef.current = null;
            }
          }}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 12,
            borderBottom: "1px solid " + gray(0.1),
            cursor: "pointer",
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>Search Inventory</Text>
          <Text style={{ fontSize: 18, fontStyle: "italic", color: gray(0.35) }}>Tap/swipe down to close</Text>
        </div>

        {/* Search display */}
        <div style={{ padding: 12, paddingBottom: 8 }}>
          <input
            ref={inputRef}
            autoFocus
            value={sSearchText}
            onChange={(e) => handleSearchTextChange(e.target.value)}
            placeholder="Search inventory..."
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
              paddingLeft: 12,
              paddingRight: 12,
              fontSize: 20,
              fontWeight: "500",
              color: C.text,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Keypad */}
        <div onMouseDown={(e) => e.preventDefault()} style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
          <StandKeypad mode="alpha" onKeyPress={handleKeyPress} />
        </div>

        {/* Results */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
          {sSearching && (
            <Text style={{ fontSize: 13, color: gray(0.4), textAlign: "center", paddingVertical: 10 }}>Searching...</Text>
          )}
          {sSearchResults.map((item, idx) => {
            let isChecked = sCheckedIDs.has(item.id);
            let name = item.informalName || item.formalName || "Unknown";
            let brand = item.brand || "";
            let price = item.price || 0;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingTop: 9,
                  paddingBottom: 9,
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 0,
                  backgroundColor: isChecked ? "rgb(235,250,240)" : (idx % 2 === 0 ? C.listItemWhite : gray(0.03)),
                  cursor: "pointer",
                  gap: 10,
                }}
              >
                <div onClick={(e) => { e.stopPropagation(); toggleCheck(item.id); }}>
                  <CheckBox_
                    isChecked={isChecked}
                    onCheck={() => toggleCheck(item.id)}
                    size={20}
                  />
                </div>
                <TouchableOpacity
                  onPress={() => handleTapItem(item)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }} numberOfLines={1}>{name}</Text>
                    {brand ? <Text style={{ fontSize: 12, color: gray(0.45) }} numberOfLines={1}>{brand}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.green, marginLeft: 8 }}>
                    ${formatCurrencyDisp(price)}
                  </Text>
                </TouchableOpacity>
              </div>
            );
          })}
          {!sSearching && sSearchText.length >= 2 && sSearchResults.length === 0 && (
            <Text style={{ fontSize: 13, color: gray(0.4), textAlign: "center", paddingVertical: 10 }}>No results found.</Text>
          )}
        </ScrollView>

        {/* Add checked button */}
        {checkedCount > 0 && (
          <div style={{ padding: 12, borderTop: "1px solid " + gray(0.1) }}>
            <TouchableOpacity
              onPress={handleAddChecked}
              style={{
                paddingVertical: 14,
                borderRadius: 8,
                backgroundColor: C.green,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>
                Add {checkedCount} Item{checkedCount > 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          </div>
        )}
      </div>
    </div>
  );
};

export { InventorySearchModal };
