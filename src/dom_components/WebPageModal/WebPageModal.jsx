import React, { forwardRef, useState } from "react";
import ReactDOM from "react-dom";
import { C } from "../../styles";
import { useZ } from "../../hooks/useZ";
import { ModalFooter, ModalFooterButton } from "../ModalFooter/ModalFooter";
import styles from "./WebPageModal.module.css";

export const WebPageModal = forwardRef(function WebPageModal(
  {
    url,
    title = "Web Page",
    subtitle = "",
    buttonLabel = "Open",
    buttonStyle = {},
    buttonTextStyle = {},
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [sVisible, _setVisible] = useState(false);
  const z = useZ("modal", sVisible);

  return (
    <>
      <button
        ref={ref}
        className={`${styles.trigger} ${className}`}
        style={{ backgroundColor: C.green, ...buttonStyle }}
        onClick={() => _setVisible(true)}
        aria-label={ariaLabel || buttonLabel}
        data-testid={testId}
      >
        <span className={styles.triggerText} style={buttonTextStyle}>
          {buttonLabel}
        </span>
      </button>

      {sVisible && ReactDOM.createPortal(
        <div
          className={styles.backdrop}
          style={{ zIndex: z }}
          onClick={() => _setVisible(false)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header} style={{ backgroundColor: C.green }}>
              <span className={styles.title}>{title}</span>
              {subtitle && (
                <span className={styles.subtitle}>{subtitle}</span>
              )}
            </div>
            <div className={styles.body}>
              <iframe
                src={url}
                className={styles.iframe}
                title={title}
              />
            </div>
            <ModalFooter>
              <ModalFooterButton onClick={() => _setVisible(false)}>Close</ModalFooterButton>
            </ModalFooter>
          </div>
        </div>,
        document.body
      )}
    </>
  );
});
