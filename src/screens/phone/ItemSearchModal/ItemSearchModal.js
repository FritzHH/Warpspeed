import { useState, useEffect, useRef } from "react";
import { ICONS } from "../../../styles";
import { formatCurrencyDisp } from "../../../utils";
import { Image, CheckBox, TouchableOpacity } from "../../../dom_components";
import { workerSearchInventory } from "../../../inventorySearchManager";
import { WORKORDER_ITEM_PROTO } from "../../../data";
import cloneDeep from "lodash/cloneDeep";
import styles from "./ItemSearchModal.module.css";

export function ItemSearchModal({ onClose, onAddItems }) {
  const [sText, _setText] = useState("");
  const [sResults, _setResults] = useState([]);
  const [sSelected, _setSelected] = useState([]);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

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

  function handleConfirm() {
    const lineItems = sSelected.map((item) => {
      const lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
      const { _score, ...cleanItem } = item;
      lineItem.inventoryItem = cleanItem;
      lineItem.id = crypto.randomUUID();
      return lineItem;
    });
    onAddItems(lineItems);
    onClose();
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <TouchableOpacity onPress={onClose} className={styles.headerBtn}>
          <Image icon={ICONS.close1} size={20} />
        </TouchableOpacity>
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
        {sSelected.length > 0 && (
          <TouchableOpacity onPress={handleConfirm} className={styles.headerBtnConfirm}>
            <Image icon={ICONS.check1} size={24} />
          </TouchableOpacity>
        )}
      </div>

      <div className={styles.list}>
        {sResults.map((item, idx) => {
          const isSelected = sSelected.some((s) => s.id === item.id);
          return (
            <div
              key={item.id || idx}
              className={`${styles.resultRow} ${idx > 0 ? styles.resultRowDivider : ""} ${isSelected ? styles.resultRowSelected : ""}`}
              onClick={() => toggleSelect(item)}
            >
              <CheckBox isChecked={isSelected} onCheck={() => toggleSelect(item)} />
              <span className={styles.resultName}>
                {item.formalName || item.informalName || "Unknown"}
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
    </div>
  );
}
