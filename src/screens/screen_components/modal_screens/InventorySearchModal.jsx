/* eslint-disable */
import { useState, useRef } from "react";
import { C } from "../../../styles";
import { useZ } from "../../../hooks/useZ";
import { formatCurrencyDisp } from "../../../utils";
import { CheckBox, Pressable, ModalFooter, ModalFooterButton } from "../../../dom_components";
import { workerSearchInventory } from "../../../inventorySearchManager";
import { StandKeypad } from "../../../shared/StandKeypad";
import styles from "./InventorySearchModal.module.css";

const InventorySearchModal = ({ onAddItems, onClose }) => {
  const [sSearchText, _setSearchText] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sSearching, _setSearching] = useState(false);
  const [sCheckedIDs, _setCheckedIDs] = useState(new Set());
  const [sKeypadMode, _setKeypadMode] = useState("alpha");
  const searchTimerRef = useRef(null);
  const headerSwipeRef = useRef(null);
  const z = useZ("modal");

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
    <div onClick={onClose} className={styles.backdrop} style={{ zIndex: z }}>
      <div onClick={(e) => e.stopPropagation()} className={styles.dialog}>
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
          className={styles.header}
          style={{ borderBottomColor: C.borderSubtle }}
        >
          <span className={styles.headerTitle} style={{ color: C.text }}>Search Inventory</span>
          <span className={styles.headerHint} style={{ color: C.textDisabled }}>Tap/swipe down to close</span>
        </div>

        {/* Search display */}
        <div className={styles.searchWrap}>
          <div
            className={styles.searchBox}
            style={{
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
          >
            <span className={styles.searchText} style={{ color: sSearchText ? C.text : C.textMuted }}>
              {sSearchText || "Search inventory..."}
              {sSearchText ? <span style={{ color: C.blue }}>|</span> : null}
            </span>
          </div>
        </div>

        {/* Keypad */}
        <div onMouseDown={(e) => e.preventDefault()} className={styles.keypadWrap}>
          <StandKeypad
            mode={sKeypadMode}
            onKeyPress={handleKeyPress}
            toggleLabel={sKeypadMode === "phone" ? "ABC" : "123"}
            onToggle={() => {
              let newMode = sKeypadMode === "phone" ? "alpha" : "phone";
              _setKeypadMode(newMode);
              _setSearchText("");
              _setSearchResults([]);
            }}
          />
        </div>

        {/* Results */}
        <div className={styles.results}>
          {sSearching && (
            <span className={styles.statusText} style={{ color: C.textMuted }}>Searching...</span>
          )}
          {sSearchResults.map((item, idx) => {
            let isChecked = sCheckedIDs.has(item.id);
            let name = item.informalName || item.formalName || "Unknown";
            let brand = item.brand || "";
            let price = item.price || 0;
            return (
              <div
                key={item.id}
                className={styles.resultRow}
                style={{
                  backgroundColor: isChecked ? C.surfaceSuccessMuted : (idx % 2 === 0 ? C.listItemWhite : C.surfaceAlt),
                }}
              >
                <div onClick={(e) => { e.stopPropagation(); toggleCheck(item.id); }}>
                  <CheckBox
                    isChecked={isChecked}
                    onCheck={() => toggleCheck(item.id)}
                    size={40}
                  />
                </div>
                <Pressable
                  onPress={() => handleTapItem(item)}
                  className={styles.rowTapArea}
                >
                  <div className={styles.rowMain}>
                    <span className={styles.rowName} style={{ color: C.text }}>{name}</span>
                    {brand ? <span className={styles.rowBrand} style={{ color: C.textMuted }}>{brand}</span> : null}
                  </div>
                  <span className={styles.rowPrice} style={{ color: C.green }}>
                    ${formatCurrencyDisp(price)}
                  </span>
                </Pressable>
              </div>
            );
          })}
          {!sSearching && sSearchText.length >= 2 && sSearchResults.length === 0 && (
            <span className={styles.statusText} style={{ color: C.textMuted }}>No results found.</span>
          )}
        </div>

        <ModalFooter>
          <ModalFooterButton
            variant="accent"
            disabled={checkedCount === 0}
            onClick={handleAddChecked}
          >
            {checkedCount > 0 ? `Add ${checkedCount} Item${checkedCount > 1 ? "s" : ""}` : "Add Items"}
          </ModalFooterButton>
          <ModalFooterButton variant="danger" onClick={onClose}>
            Close
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </div>
  );
};

export { InventorySearchModal };
