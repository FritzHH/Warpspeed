/* eslint-disable */
import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useZ } from "../../../hooks/useZ";
import { ModalFooter, ModalFooterButton } from "../../../dom_components";
import { ColorWheel } from "../../../ColorWheel";
import styles from "./ColorPickerModal.module.css";

export const ColorPickerModal = ({
  onClose,
  onSave,
  title,
  previewText,
  initialBgColor,
  initialTextColor,
  saveButtonText,
  exitButtonText,
  anchorPosition,
  colorSchemes,
}) => {
  const [sBgColor, _setBgColor] = useState(initialBgColor || "#ffffff");
  const [sTextColor, _setTextColor] = useState(initialTextColor || "#000000");
  const [sLayout, _setLayout] = useState(null);
  const z = useZ("modal");

  let hasSchemes = colorSchemes && colorSchemes.length > 0;
  let modalMaxWidth = hasSchemes ? 900 : 650;

  const measureRef = useCallback((node) => {
    if (!node) return;
    let rect = node.getBoundingClientRect();
    let top = anchorPosition?.y ?? 100;
    let left = (window.innerWidth - rect.width) / 2;
    if (top + rect.height > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - rect.height - 10);
    }
    if (top < 10) top = 10;
    if (left + rect.width > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - rect.width - 10);
    }
    if (left < 10) left = 10;
    _setLayout({ top, left });
  }, []);

  return createPortal(
    <div onClick={onClose} className={styles.overlay} style={{ zIndex: z }}>
      <div
        ref={measureRef}
        onClick={(e) => e.stopPropagation()}
        className={styles.anchored}
        style={{
          top: sLayout?.top ?? (anchorPosition?.y ?? 100),
          left: sLayout?.left ?? Math.max(10, (window.innerWidth - modalMaxWidth) / 2),
          opacity: sLayout ? 1 : 0,
        }}
      >
        <div
          className={styles.modal}
          style={{ maxWidth: modalMaxWidth }}
        >
          <div className={`${styles.modalBody} ${hasSchemes ? styles.modalWithSchemes : styles.modalNoSchemes}`}>
          {/* Color schemes sidebar */}
          {hasSchemes && (
            <>
              <div className={styles.schemesPanel}>
                <div className={styles.schemesTitle}>Existing Schemes</div>
                <div className={styles.schemesScroll}>
                  {colorSchemes.map((scheme, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        _setBgColor(scheme.backgroundColor);
                        _setTextColor(scheme.textColor);
                      }}
                      className={styles.schemeItem}
                      style={{ backgroundColor: scheme.backgroundColor }}
                    >
                      <span
                        className={styles.schemeText}
                        style={{ color: scheme.textColor }}
                      >
                        {scheme.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.schemesDivider} />
            </>
          )}

          {/* Main color picker area */}
          <div className={styles.pickerArea}>
            <div className={styles.pickerTitle}>{title || "Edit Colors"}</div>

            <div className={styles.previewBox} style={{ backgroundColor: sBgColor }}>
              <span className={styles.previewText} style={{ color: sTextColor }}>
                {previewText || "Preview"}
              </span>
            </div>

            <div className={styles.colorRows}>
              <div className={styles.colorColumn}>
                <div className={styles.colorLabel}>Background Color</div>
                <ColorWheel
                  key={"bg-" + sBgColor}
                  initialColor={sBgColor}
                  onColorChange={(val) => {
                    _setBgColor(val.hex);
                  }}
                />
              </div>
              <div className={styles.colorColumn}>
                <div className={styles.colorLabel}>Text Color</div>
                <ColorWheel
                  key={"text-" + sTextColor}
                  initialColor={sTextColor}
                  onColorChange={(val) => {
                    _setTextColor(val.hex);
                  }}
                />
              </div>
            </div>

          </div>
          </div>
          <ModalFooter>
            <ModalFooterButton variant="default" onClick={onClose}>
              {exitButtonText || "CLOSE"}
            </ModalFooterButton>
            <ModalFooterButton
              variant="accent"
              onClick={() => {
                onSave(sBgColor, sTextColor);
                onClose();
              }}
            >
              {saveButtonText || "Save Changes"}
            </ModalFooterButton>
          </ModalFooter>
        </div>
      </div>
    </div>,
    document.body
  );
};
