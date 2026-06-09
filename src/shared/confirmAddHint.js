/* eslint-disable */
/**
 * confirmAddHint — shared brand/description "add to hints list?" confirm.
 *
 * Used by BikeStandScreen and Info_ActiveWorkorder. When the user leaves a
 * brand or description field with a value that is NOT already on the saved
 * hints list, this prompts before persisting. Suggestion-tap and autocomplete
 * paths pass values that already exist in the list, so the dedupe guard
 * short-circuits and no prompt appears.
 *
 * confirmAddHint({ kind: "brand" | "description", value, settingsKey })
 *   kind        — "brand" or "description" (used in the prompt copy)
 *   value       — raw input value (will be trimmed)
 *   settingsKey — "allBrands" or "allDescriptions" (settings field name)
 *
 * Returns nothing. Silently no-ops when value is empty / <3 chars / already
 * in the list. Otherwise pushes a confirm AlertBox via useAlertScreenStore.
 */
import { useSettingsStore, useAlertScreenStore } from "../stores";

const KIND_LABEL = {
  brand:       "brand",
  description: "description",
};

const LIST_LABEL = {
  allBrands:       "brands",
  allDescriptions: "descriptions",
};

export function confirmAddHint({ kind, value, settingsKey }) {
  if (!value || typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length < 3) return;

  const settings = useSettingsStore.getState().settings || {};
  const existing = settings[settingsKey] || [];
  if (existing.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;

  const kindLabel = KIND_LABEL[kind] || kind || "value";
  const listLabel = LIST_LABEL[settingsKey] || "list";

  useAlertScreenStore.getState().setValues({
    title:   `Add ${kindLabel}?`,
    message: `Add "${trimmed}" to the saved ${listLabel}?`,
    btn1Text: "Yes",
    btn2Text: "No",
    handleBtn1Press: () => {
      const current = useSettingsStore.getState().settings?.[settingsKey] || [];
      if (!current.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
        const updated = [...current, trimmed].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        useSettingsStore.getState().setField(settingsKey, updated);
      }
      useAlertScreenStore.getState().setShowAlert(false);
    },
    handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
    canExitOnOuterClick: true,
  });
}
