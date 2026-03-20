/* eslint-disable */
import { useState, useRef, useCallback } from "react";
import { translateText } from "./db_calls";

/**
 * Shared translation hook — debounced Google Translate with direction toggle.
 *
 * @param {Object} opts
 * @param {"es-to-en"|"en-to-es"} opts.defaultDirection — initial direction (default "es-to-en")
 * @param {number} opts.debounceMs — debounce delay in ms (default 600)
 * @param {Function} opts.onTranslated — (translated, originalText, targetLang) called after success
 * @param {Function} opts.onCleared — called when translation is cleared
 */
export function useTranslation({
  defaultDirection = "en-to-es",
  debounceMs = 600,
  onTranslated,
  onCleared,
} = {}) {
  const [sTranslatedText, _setTranslatedText] = useState("");
  const [sIsEnToEs, _setIsEnToEs] = useState(defaultDirection === "en-to-es");
  const [sLoading, _setLoading] = useState(false);
  const debounceRef = useRef(null);

  // Stable refs for callbacks to avoid stale closures
  const onTranslatedRef = useRef(onTranslated);
  const onClearedRef = useRef(onCleared);
  onTranslatedRef.current = onTranslated;
  onClearedRef.current = onCleared;

  let targetLang = sIsEnToEs ? "es" : "en";
  let sourceLabel = sIsEnToEs ? "English" : "Spanish";
  let targetLabel = sIsEnToEs ? "Spanish" : "English";

  const doTranslate = useCallback(async (text, target) => {
    if (!text || !text.trim()) {
      _setTranslatedText("");
      if (onClearedRef.current) onClearedRef.current();
      return null;
    }
    _setLoading(true);
    let result = await translateText({ text, targetLanguage: target });
    _setLoading(false);
    if (result.success) {
      let translated =
        result.data?.data?.translatedText ||
        result.data?.translatedText ||
        "";
      _setTranslatedText(translated);
      if (onTranslatedRef.current)
        onTranslatedRef.current(translated, text, target);
      return translated;
    } else {
      _setTranslatedText("Translation error");
      return null;
    }
  }, []);

  const debouncedTranslate = useCallback(
    (text, target) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!text || !text.trim()) {
        _setTranslatedText("");
        if (onClearedRef.current) onClearedRef.current();
        return;
      }
      debounceRef.current = setTimeout(() => {
        doTranslate(text, target);
      }, debounceMs);
    },
    [doTranslate, debounceMs]
  );

  const flipDirection = useCallback(() => {
    _setIsEnToEs((prev) => !prev);
  }, []);

  const clearTranslation = useCallback(() => {
    _setTranslatedText("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (onClearedRef.current) onClearedRef.current();
  }, []);

  return {
    translatedText: sTranslatedText,
    isEnToEs: sIsEnToEs,
    isLoading: sLoading,
    sourceLabel,
    targetLabel,
    targetLang,
    doTranslate,
    debouncedTranslate,
    flipDirection,
    clearTranslation,
  };
}
