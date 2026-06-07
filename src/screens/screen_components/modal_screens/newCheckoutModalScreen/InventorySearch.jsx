/* eslint-disable */
import { useState, memo } from "react";
import cloneDeep from "lodash/cloneDeep";
import { Button, TextInput, TouchableOpacity } from "../../../../dom_components";
import { C, COLOR_GRADIENTS } from "../../../../styles";
import { formatCurrencyDisp, generateEAN13Barcode, normalizeBarcode } from "../../../../utils";
import { workerSearchInventory } from "../../../../inventorySearchManager";
import { INVENTORY_ITEM_PROTO } from "../../../../data";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./InventorySearch.module.css";

function SearchResultRow({ item, onAdd }) {
  let price = item.price || 0;

  return (
    <TouchableOpacity
      onPress={() => onAdd(item)}
      className={styles.resultRow}
      style={{ borderColor: C.buttonLightGreenOutline }}
    >
      <div className={styles.resultNameCol}>
        <span style={{ color: C.text }}>{item.catalogName || item.formalName}</span>
      </div>
      <div className={styles.resultPriceCol}>
        <span style={{ color: C.text }}>
          <span className={styles.resultDollar} style={{ color: C.text }}>{"$  "}</span>
          {formatCurrencyDisp(price)}
        </span>
      </div>
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

    let trimmed = val.trim();
    if (/^\d{12,13}$/.test(trimmed)) {
      let normalized = normalizeBarcode(trimmed);
      let exactMatch = normalized
        ? inventory.find((item) => item.id === normalized || item.primaryBarcode === normalized || (item.barcodes || []).includes(normalized))
        : inventory.find((item) => item.id === trimmed);
      if (exactMatch) {
        dlog(DCAT.ACTION, "barcodeScan_found", "InventorySearch", { itemId: exactMatch.id, itemName: exactMatch.catalogName || exactMatch.formalName });
        onAddItem(exactMatch);
        _setSearchString("");
        _setSearchResults([]);
        return;
      }
      dlog(DCAT.ACTION, "barcodeScan_notFound", "InventorySearch", { barcode: trimmed });
      _setNotFoundBarcode(trimmed);
      _setSearchString("");
      _setSearchResults([]);
      return;
    }

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
    dlog(DCAT.BUTTON, "handleAddItem", "InventorySearch", { itemId: invItem?.id, itemName: invItem?.catalogName || invItem?.formalName });
    if (onAddItem) onAddItem(invItem);
    _setSearchString("");
    _setSearchResults([]);
  }

  return (
    <div className={styles.container}>
      <div className={styles.searchRow}>
        <TextInput
          debounceMs={0}
          className={styles.searchInput}
          style={{
            borderBottomColor: C.borderStrong,
            color: C.text,
          }}
          value={sSearchString}
          onChangeText={handleSearch}
          placeholder="Scan or search inventory..."
          placeholderTextColor={C.textDisabled}
          onFocus={() => _setFocused(true)}
          onBlur={() => _setFocused(false)}
        />
      </div>

      {!!sNotFoundBarcode && (
        <div
          className={styles.notFoundBox}
          style={{ borderColor: C.orange }}
        >
          <div className={styles.notFoundText} style={{ color: C.text }}>
            Barcode <span className={styles.notFoundBarcode}>{sNotFoundBarcode}</span> not found in inventory.
          </div>
          <div className={styles.notFoundActions}>
            <Button
              text="Create Item"
              onPress={handleCreateNewItem}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 10 }}
            />
            <Button
              text="Dismiss"
              onPress={() => _setNotFoundBarcode("")}
              colorGradientArr={COLOR_GRADIENTS.grey}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 10 }}
            />
          </div>
        </div>
      )}

      {sSearchResults.length > 0 && (
        <div
          className={styles.resultsScroll}
          style={{ borderColor: C.borderSubtle }}
        >
          {sSearchResults.map((item, idx) => (
            <SearchResultRow
              key={item.id || idx}
              item={item}
              onAdd={handleAddItem}
            />
          ))}
        </div>
      )}
    </div>
  );
});
