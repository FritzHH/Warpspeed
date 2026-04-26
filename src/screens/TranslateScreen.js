/* eslint-disable */
import { View, Text } from "react-native-web";
import { useState, useEffect } from "react";
import { onTranslateMessage, TRANSLATE_MSG_TYPES } from "../broadcastChannel";
import { C, Fonts } from "../styles";
import { gray } from "../utils";

const logo = require("../resources/default_app_logo_large.png");

function IdleScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <img
        src={logo}
        alt="logo"
        style={{ width: 120, height: 120, opacity: 0.3, marginBottom: 20 }}
      />
      <Text
        style={{
          fontSize: 22,
          color: gray(0.55),
          fontWeight: Fonts.weight.textRegular,
        }}
      >
        Translation Display
      </Text>
    </View>
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
      <View
        style={{
          flex: 1,
          backgroundColor: C.backgroundWhite,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <IdleScreen />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.backgroundWhite,
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <Text
        style={{
          fontSize: 48,
          color: C.text,
          fontWeight: Fonts.weight.textHeavy,
          textAlign: "center",
          lineHeight: 64,
        }}
      >
        {sTranslatedText}
      </Text>
    </View>
  );
}
