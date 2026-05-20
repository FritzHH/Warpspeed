import React, { useState } from "react";
import { Dialog, Image } from "../../../dom_components";
import { C, ICONS } from "../../../styles";

import styles from "./QuickButtonPickerModal.module.css";

function buttonHasItem(btn, itemID) {
  return (btn.items || []).some((entry) =>
    typeof entry === "string" ? entry === itemID : entry.inventoryItemID === itemID
  );
}

const SubMenuRow = ({ parentID, itemID, quickButtons, onToggle, expandedIDs, toggleExpanded, depth }) => {
  const children = quickButtons.filter((b) => b.parentID === parentID);
  if (children.length === 0) return null;
  const expandedChildren = children.filter((c) => expandedIDs.includes(c.id));

  return (
    <div className={styles.subRow} style={{ marginLeft: depth * 8 }}>
      <div className={styles.subChipsRow}>
        {children.map((child) => {
          const childIsIn = buttonHasItem(child, itemID);
          const hasGrandchildren = quickButtons.some((b) => b.parentID === child.id);
          const isExpanded = expandedIDs.includes(child.id);
          const active = isExpanded || childIsIn;
          const bg = isExpanded ? "rgb(245,166,35)" : childIsIn ? C.green : C.surfaceAlt;
          return (
            <button
              key={child.id}
              type="button"
              className={styles.subChip}
              onClick={() => {
                if (hasGrandchildren) toggleExpanded(child.id);
                else onToggle(child.id);
              }}
              style={{
                backgroundColor: bg,
                borderColor: active ? "transparent" : C.borderSubtle,
              }}
            >
              <span
                className={styles.subChipText}
                style={{
                  color: active ? C.textOnAccent : C.text,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {child.name || "(unnamed)"}
              </span>
              {hasGrandchildren && (
                <span
                  className={styles.subChipExpandIcon}
                  style={{ color: active ? C.textOnAccent : C.textMuted }}
                >
                  {isExpanded ? "\u25BC" : "\u25B6"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {expandedChildren.map((child) => (
        <SubMenuRow
          key={child.id}
          parentID={child.id}
          itemID={itemID}
          quickButtons={quickButtons}
          onToggle={onToggle}
          expandedIDs={expandedIDs}
          toggleExpanded={toggleExpanded}
          depth={depth + 1}
        />
      ))}
    </div>
  );
};

export const QuickButtonPickerModal = ({ visible, itemID, quickButtons, onToggle, onClose }) => {
  const [sExpandedIDs, _setExpandedIDs] = useState([]);

  function toggleExpanded(id) {
    _setExpandedIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const rootButtons = quickButtons.filter((b) => !b.parentID);

  return (
    <Dialog visible={visible} onClose={onClose} aria-label="Add to Quick Button Menu">
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title} style={{ color: C.text }}>
            Add to Quick Button Menu
          </span>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <Image icon={ICONS.close1} size={16} />
          </button>
        </div>

        <div className={styles.list}>
          {rootButtons.length === 0 ? (
            <span className={styles.empty} style={{ color: C.textMuted }}>
              No quick buttons configured
            </span>
          ) : (
            rootButtons.map((btn) => {
              const hasChildren = quickButtons.some((b) => b.parentID === btn.id);
              const isIn = buttonHasItem(btn, itemID);
              const isExpanded = sExpandedIDs.includes(btn.id);
              return (
                <div
                  key={btn.id}
                  className={styles.rootRow}
                  style={{
                    backgroundColor: isIn ? "rgba(88,145,65,0.08)" : C.surfaceAlt,
                    border: isIn ? `1px solid ${C.green}` : "1px solid transparent",
                  }}
                >
                  <div className={styles.rootHeader}>
                    <div className={styles.rootLeft}>
                      <span className={styles.rootName} style={{ color: C.text }}>
                        {btn.name || "(unnamed)"}
                      </span>
                      {hasChildren && (
                        <button
                          type="button"
                          className={styles.rootExpandBtn}
                          onClick={() => toggleExpanded(btn.id)}
                          style={{
                            backgroundColor: isExpanded ? "rgb(245,166,35)" : C.surfaceAlt,
                          }}
                        >
                          <span
                            className={styles.rootExpandIcon}
                            style={{ color: isExpanded ? "white" : C.textMuted }}
                          >
                            {isExpanded ? "\u25BC" : "\u25B6"}
                          </span>
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.rootActionBtn}
                      onClick={() => onToggle(btn.id)}
                      style={{ backgroundColor: isIn ? C.red : C.green }}
                    >
                      {isIn ? "Remove" : "Add"}
                    </button>
                  </div>
                  {isExpanded && (
                    <SubMenuRow
                      parentID={btn.id}
                      itemID={itemID}
                      quickButtons={quickButtons}
                      onToggle={onToggle}
                      expandedIDs={sExpandedIDs}
                      toggleExpanded={toggleExpanded}
                      depth={0}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
};
