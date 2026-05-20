/* eslint-disable */
import { useState, useEffect } from "react";
import { onTranslateMessage, TRANSLATE_MSG_TYPES } from "../broadcastChannel";
import { C, Fonts } from "../styles";
import logo from "../resources/default_app_logo_large.png";
import styles from "./TranslateScreen.module.css";

function IdleScreen() {
  return (
    <div className={styles.idleWrap}>
      <img src={logo} alt="logo" className={styles.idleLogo} />
      <p
        className={styles.idleText}
        style={{
          color: C.textMuted,
          fontWeight: Fonts.weight.textRegular,
        }}
      >
        Translation Display
      </p>
    </div>
  );
}

export function TranslateScreen() {
  const [sTranslatedText, _sSetTranslatedText] = useState("");
  const [sOriginalText, _sSetOriginalText] = useState("");
  const [sTargetLanguage, _sSetTargetLanguage] = useState("");

  useEffect(() => {
    const unsubscribe = onTranslateMessage((msg) => {
      if (msg.type === TRANSLATE_MSG_TYPES.CLEAR) {
        _sSetTranslatedText("");
        _sSetOriginalText("");
        _sSetTargetLanguage("");
      } else if (msg.type === TRANSLATE_MSG_TYPES.TRANSLATE) {
        _sSetTranslatedText(msg.payload.translatedText || "");
        _sSetOriginalText(msg.payload.originalText || "");
        _sSetTargetLanguage(msg.payload.targetLanguage || "");
      }
    });
    return unsubscribe;
  }, []);

  if (!sTranslatedText) {
    return (
      <div className={styles.screenRoot}>
        <IdleScreen />
      </div>
    );
  }

  return (
    <div className={styles.screenRootActive}>
      <p
        className={styles.translatedText}
        style={{ fontWeight: Fonts.weight.textHeavy }}
      >
        {sTranslatedText}
      </p>
    </div>
  );
}
