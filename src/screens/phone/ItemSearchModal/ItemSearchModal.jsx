import { useState, useEffect, useRef } from "react";
import { ICONS } from "../../../styles";
import { formatCurrencyDisp } from "../../../utils";
import { Image, CheckBox, SwipeBackHint, TouchableOpacity } from "../../../dom_components";
import { workerSearchInventory } from "../../../inventorySearchManager";
import { WORKORDER_ITEM_PROTO } from "../../../data";
import cloneDeep from "lodash/cloneDeep";
import { InventoryItemInfoModal } from "../InventoryItemInfoModal/InventoryItemInfoModal";
import { AddCustomItemModal } from "../AddCustomItemModal/AddCustomItemModal";
import { AddCustomLaborModal } from "../AddCustomLaborModal/AddCustomLaborModal";
import styles from "./ItemSearchModal.module.css";

function buildLineItem(item) {
  const lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
  const { _score, ...cleanItem } = item;
  lineItem.inventoryItem = cleanItem;
  lineItem.id = crypto.randomUUID();
  return lineItem;
}

export function ItemSearchModal({ onClose, onAddItems }) {
  const [sText, _setText] = useState("");
  const [sResults, _setResults] = useState([]);
  const [sSelected, _setSelected] = useState([]);
  const [sInfoItem, _setInfoItem] = useState(null);
  const [sShowAddItem, _setShowAddItem] = useState(false);
  const [sShowAddLabor, _setShowAddLabor] = useState(false);
  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const swipeStartRef = useRef(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const swipeHandlers = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (t.clientX > 30) return;
      e.stopPropagation();
      swipeStartRef.current = { x: t.clientX, time: Date.now() };
      _setSwiping(true);
    },
    onTouchMove: (e) => {
      if (!swipeStartRef.current) return;
      e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX - swipeStartRef.current.x;
      if (dx > 0) _setSwipeX(dx);
    },
    onTouchEnd: (e) => {
      if (!swipeStartRef.current) return;
      e.stopPropagation();
      const elapsed = Date.now() - swipeStartRef.current.time;
      const velocity = sSwipeX / Math.max(elapsed, 1);
      const commitThreshold = window.innerWidth * 0.3;
      const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
      swipeStartRef.current = null;
      _setSwiping(false);
      if (isCommit) {
        _setSwipeX(window.innerWidth);
        setTimeout(() => { onClose(); _setSwipeX(0); }, 200);
      } else {
        _setSwipeX(0);
      }
    },
  };

  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
  };

  function handleSearch(text) {
    _setText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) {
      _setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      workerSearchInventory(text, (results) => _setResults(results.slice(0, 20)));
    }, 200);
  }

  function toggleSelect(item) {
    const exists = sSelected.some((s) => s.id === item.id);
    if (exists) {
      _setSelected(sSelected.filter((s) => s.id !== item.id));
    } else {
      _setSelected([...sSelected, item]);
    }
  }

  function handleConfirmSelected() {
    const lineItems = sSelected.map(buildLineItem);
    onAddItems(lineItems);
    onClose();
  }

  return (
    <div className={styles.overlay} {...swipeHandlers} style={swipeStyle}>
      <SwipeBackHint label="Workorder" swipeX={sSwipeX} />
      <div className={styles.list}>
        {sResults.map((item, idx) => {
          const isSelected = sSelected.some((s) => s.id === item.id);
          return (
            <div
              key={item.id || idx}
              className={`${styles.resultRow} ${isSelected ? styles.resultRowSelected : ""}`}
              onClick={() => _setInfoItem(item)}
            >
              <div
                className={styles.checkboxWrap}
                onClick={(e) => { e.stopPropagation(); toggleSelect(item); }}
              >
                <CheckBox isChecked={isSelected} iconSize={23} />
              </div>
              <span className={styles.resultName}>
                {item.catalogName || item.formalName || "Unknown"}
              </span>
              <span className={styles.resultPrice}>${formatCurrencyDisp(item.price)}</span>
            </div>
          );
        })}
        {sText.length >= 2 && sResults.length === 0 && (
          <div className={styles.emptyWrapper}>
            <span className={styles.emptyText}>No results</span>
          </div>
        )}
      </div>

      <div className={styles.actionBar}>
        <TouchableOpacity onPress={() => _setShowAddItem(true)} className={styles.actionBtn}>
          <Image icon={ICONS.add} size={16} />
          <span className={styles.actionBtnText}>Item</span>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => _setShowAddLabor(true)} className={styles.actionBtn}>
          <Image icon={ICONS.add} size={16} />
          <span className={styles.actionBtnText}>Labor</span>
        </TouchableOpacity>
      </div>

      <div className={styles.searchRow}>
        {sSelected.length > 0 && (
          <TouchableOpacity onPress={handleConfirmSelected} className={styles.searchRowBtn}>
            <Image icon={ICONS.greenCheck} size={30} />
          </TouchableOpacity>
        )}
        <div className={styles.searchWrapper}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search inventory..."
            value={sText}
            onChange={(e) => handleSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {sInfoItem && (
        <InventoryItemInfoModal item={sInfoItem} onClose={() => _setInfoItem(null)} />
      )}

      {sShowAddItem && (
        <AddCustomItemModal
          onClose={() => _setShowAddItem(false)}
          onSave={(line) => {
            onAddItems([line]);
            onClose();
          }}
        />
      )}

      {sShowAddLabor && (
        <AddCustomLaborModal
          onClose={() => _setShowAddLabor(false)}
          onSave={(line) => {
            onAddItems([line]);
            onClose();
          }}
        />
      )}
    </div>
  );
}
