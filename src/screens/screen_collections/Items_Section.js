/* eslint-disable */

import { View, Text, TouchableOpacity } from "react-native-web";
import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

import { TAB_NAMES } from "../../data";
import { TabMenuButton, Image_, TextInput_, Button_, Tooltip, DropdownMenu } from "../../components";
import { Items_Dashboard } from "../screen_components/Items_Screen/Items_Dashboard";
import { CustomerSearchListComponent } from "../screen_components/Items_Screen/Items_CustomerSearchList";
import { WorkorderPreview } from "../screen_components/Items_Screen/Items_WorkorderPreview";
import { Items_WorkorderItemsTab } from "../screen_components/Items_Screen/Items_WorkorderItems";

import {
  useOpenWorkordersStore,
  useCustomerSearchStore,
  useTabNamesStore,
  useSettingsStore,
  broadcastFullWorkorderToDisplay,
} from "../../stores";
import { C, ICONS, Fonts, COLOR_GRADIENTS } from "../../styles";
import { ROUTES } from "../../routes";
import { EmptyItemsComponent } from "../screen_components/Items_Screen/Items_Empty";
import { Items_ChangeLog } from "../screen_components/Items_Screen/Items_ChangeLog";
import { Items_TicketSearchResults } from "../screen_components/Items_Screen/Items_TicketSearchResults";
import { Items_WorkorderSearchList } from "../screen_components/Items_Screen/Items_WorkorderSearchList";
import { log, gray, lightenRGBByPercent } from "../../utils";
import { useTranslation } from "../../useTranslation";
import {
  broadcastToTranslateDisplay,
  broadcastTranslateClear,
  TRANSLATE_MSG_TYPES,
} from "../../broadcastChannel";
import { DevNotesModal } from "../screen_components/modal_screens/DevNotesModal";
import { enableCheckoutDebug, isCheckoutDebugEnabled } from "../screen_components/modal_screens/newCheckoutModalScreen/checkoutDebugLog";

export const Items_Section = React.memo(({}) => {
  // setters ///////////////////////////////////////////////////////////////////
  const [sShowTranslateModal, _sSetShowTranslateModal] = useState(false);
  const [sShowDevNotes, _sSetShowDevNotes] = useState(false);

  // getters ///////////////////////////////////////////////////////////////////
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);

  ///////////////////////////////////////////////////////////////////////////
  // log("Items_Section render");
  function ScreenComponent() {

    switch (zItemsTabName) {
      case TAB_NAMES.itemsTab.changeLog:
        return <Items_ChangeLog />;
      case TAB_NAMES.itemsTab.customerList:
        return <CustomerSearchListComponent />;
      case TAB_NAMES.itemsTab.dashboard:
        return <Items_Dashboard />;
      case TAB_NAMES.itemsTab.preview:
        return <WorkorderPreview />;
      case TAB_NAMES.itemsTab.workorderItems:
        return <Items_WorkorderItemsTab />;
      case TAB_NAMES.itemsTab.ticketSearchResults:
        return <Items_TicketSearchResults />;
      case TAB_NAMES.itemsTab.workorderSearchResults:
        return <Items_WorkorderSearchList />;
      case TAB_NAMES.itemsTab.empty:
        return <EmptyItemsComponent />;
      default:
        return null;
    }
  }

  // log("----------------------Items section render");
  return (
    <View style={{ flex: 1 }}>
      <TabBar
        onTranslatePress={() => _sSetShowTranslateModal(true)}
        onDevNotesPress={() => _sSetShowDevNotes(true)}
      />
      {ScreenComponent()}
      <TranslateModal
        visible={sShowTranslateModal}
        onClose={() => _sSetShowTranslateModal(false)}
      />
      <DevNotesModal
        visible={sShowDevNotes}
        onClose={() => _sSetShowDevNotes(false)}
      />
    </View>
  );
});

const EMPTY_STARTERS = [];
const TRANSLATION_LANGUAGES = [
  { label: "English", code: "en" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Creole", code: "ht" },
  { label: "Arabic", code: "ar" },
];
const TranslateModal = ({ visible, onClose }) => {
  const [sInputText, _sSetInputText] = useState("");
  const [sFromLang, _sSetFromLang] = useState("en");
  const [sToLang, _sSetToLang] = useState("es");
  const zTranslateStarters = useSettingsStore((state) => state.settings?.translateStarters) || EMPTY_STARTERS;

  const {
    translatedText, isLoading,
    doTranslate, debouncedTranslate, clearTranslation,
  } = useTranslation({
    defaultDirection: "en-to-es",
    onTranslated: (translated, text, target) => {
      broadcastToTranslateDisplay(TRANSLATE_MSG_TYPES.TRANSLATE, {
        translatedText: translated,
        originalText: text,
        targetLanguage: target,
      });
    },
    onCleared: () => broadcastTranslateClear(),
  });

  const handleTextChange = useCallback(
    (text) => {
      _sSetInputText(text);
      debouncedTranslate(text, sToLang);
      resetInactivityTimer();
    },
    [sToLang, debouncedTranslate]
  );

  const handleClose = useCallback(() => {
    _sSetInputText("");
    clearTranslation();
    onClose();
  }, [onClose, clearTranslation]);

  function handleStarterPress(starter) {
    _sSetInputText(starter.text);
    let from = starter.language || "en";
    _sSetFromLang(from);
    let to = sToLang === from ? sFromLang : sToLang;
    _sSetToLang(to);
    doTranslate(starter.text, to);
    resetInactivityTimer();
  }

  const handleCloseRef = useRef(null);
  handleCloseRef.current = handleClose;
  const inactivityTimerRef = useRef(null);

  function resetInactivityTimer() {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      if (handleCloseRef.current) handleCloseRef.current();
    }, 120000);
  }

  useEffect(() => {
    if (!visible) return;
    resetInactivityTimer();
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, [visible]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: "default",
        }}
      />
        <View
          style={{
            width: 500,
            backgroundColor: C.backgroundWhite,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            padding: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: Fonts.weight.textHeavy,
                color: C.text,
              }}
            >
              Translate
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Image_ source={ICONS.close1} width={18} height={18} />
            </TouchableOpacity>
          </View>

          {/* Language dropdowns */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <DropdownMenu
              dataArr={TRANSLATION_LANGUAGES}
              onSelect={(item) => {
                _sSetFromLang(item.code);
                if (item.code && sToLang && item.code !== sToLang && sInputText.trim()) debouncedTranslate(sInputText, sToLang);
                if (!item.code || item.code === sToLang) clearTranslation();
                resetInactivityTimer();
              }}
              buttonText={TRANSLATION_LANGUAGES.find(l => l.code === sFromLang)?.label || "English"}
              buttonStyle={{ paddingVertical: 5 }}
            />
            <Image_ icon={ICONS.rightArrowBlue} size={16} style={{ marginHorizontal: 10 }} />
            <DropdownMenu
              dataArr={TRANSLATION_LANGUAGES}
              onSelect={(item) => {
                _sSetToLang(item.code);
                if (sFromLang && item.code && sFromLang !== item.code && sInputText.trim()) debouncedTranslate(sInputText, item.code);
                if (!item.code || sFromLang === item.code) clearTranslation();
                resetInactivityTimer();
              }}
              buttonText={TRANSLATION_LANGUAGES.find(l => l.code === sToLang)?.label || "Spanish"}
              buttonStyle={{ paddingVertical: 5 }}
            />
          </View>

          {/* Starter buttons */}
          {zTranslateStarters.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              {zTranslateStarters.map((starter) => (
                <Button_
                  key={starter.id}
                  text={starter.label}
                  onPress={() => handleStarterPress(starter)}
                  colorGradientArr={COLOR_GRADIENTS.lightBlue}
                  buttonStyle={{ marginRight: 6, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 4 }}
                  textStyle={{ fontSize: 12 }}
                />
              ))}
            </View>
          )}

          {/* Input */}
          <TextInput_
            value={sInputText}
            onChangeText={handleTextChange}
            debounceMs={0}
            placeholder={`Type in ${TRANSLATION_LANGUAGES.find(l => l.code === sFromLang)?.label || "English"}...`}
            multiline={true}
            numberOfLines={10}
            autoFocus={true}
            autoCapitalize="sentences"
            style={{
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              borderWidth: 2,
              backgroundColor: C.listItemWhite,
              paddingVertical: 10,
              paddingHorizontal: 10,
              fontSize: 16,
              marginBottom: 14,
            }}
          />

          {/* Output */}
          <View
            style={{
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              borderWidth: 2,
              backgroundColor: C.backgroundListWhite,
              paddingVertical: 10,
              paddingHorizontal: 10,
              minHeight: 80,
            }}
          >
            {isLoading ? (
              <Text style={{ fontSize: 14, color: gray(0.5), fontStyle: "italic" }}>
                Translating...
              </Text>
            ) : (
              <Text style={{ fontSize: 16, color: C.text }}>
                {translatedText}
              </Text>
            )}
          </View>
        </View>
    </View>,
    document.body
  );
};

const TabBar = ({ onTranslatePress, onDevNotesPress }) => {
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.openWorkorderID);
  const zIsPreview = useOpenWorkordersStore((s) => !!s.workorderPreviewID && s.workorderPreviewID !== s.openWorkorderID);
  const [sDevLog, _sSetDevLog] = useState(isCheckoutDebugEnabled);
  // log("Items_Section TabBar render");
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        backgroundColor: zIsPreview ? lightenRGBByPercent(C.blue, 70) : undefined,
        transition: "background-color 0.2s ease",
        // height: 50,
      }}
    >
      <View
        style={{
          flexDirection: "row",
        }}
      >
        {!!zOpenWorkorderID && (
          <View>
            <TabMenuButton
              buttonStyle={{
                borderTopLeftRadius: 15,
              }}
              onPress={() =>
                useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderItems)
              }
              text={TAB_NAMES.itemsTab.workorderItems}
              isSelected={
                zItemsTabName === TAB_NAMES.itemsTab.workorderItems
                  ? true
                  : false
              }
            />
            {/* <View style={{ width: 20 }} /> */}
          </View>
        )}
        {!!zOpenWorkorderID && (
          <TabMenuButton
            onPress={() => useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.changeLog)}
            text={TAB_NAMES.itemsTab.changeLog}
            isSelected={
              zItemsTabName === TAB_NAMES.itemsTab.changeLog ? true : false
            }
          />
        )}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Tooltip text={sDevLog ? "Dev logging ON" : "Dev logging OFF"} position="bottom">
          <TouchableOpacity
            onPress={() => {
              let next = !sDevLog;
              enableCheckoutDebug(next);
              _sSetDevLog(next);
            }}
            style={{ paddingHorizontal: 10, justifyContent: "center", opacity: sDevLog ? 1 : 0.35 }}
          >
            <Image_ icon={ICONS.infoGear} size={22} />
          </TouchableOpacity>
        </Tooltip>
        <Tooltip text="Notes for the app dev" position="bottom">
          <TouchableOpacity
            onPress={onDevNotesPress}
            style={{ paddingHorizontal: 10, justifyContent: "center" }}
          >
            <Image_ icon={ICONS.thoughtBubble} size={22} />
          </TouchableOpacity>
        </Tooltip>
        {localStorage.getItem("warpspeed_has_secondary_display") === "true" && (
          <Tooltip text="Send translated text to customer display" position="bottom">
            <TouchableOpacity
              onPress={onTranslatePress}
              style={{ paddingHorizontal: 10, justifyContent: "center" }}
            >
              <Image_ icon={ICONS.paperPlane} size={22} />
            </TouchableOpacity>
          </Tooltip>
        )}
        {!!zOpenWorkorderID && localStorage.getItem("warpspeed_has_secondary_display") === "true" && (
          <Tooltip text="Show workorder on customer display" position="bottom">
            <TouchableOpacity
              onPress={() => {
                let wo = useOpenWorkordersStore.getState().workorders.find((o) => o.id === zOpenWorkorderID);
                if (wo) broadcastFullWorkorderToDisplay(wo);
              }}
              style={{ paddingHorizontal: 10, justifyContent: "center" }}
            >
              <Image_ icon={ICONS.display} size={22} />
            </TouchableOpacity>
          </Tooltip>
        )}
        <TouchableOpacity
          onPress={() => (window.location.href = ROUTES.home)}
          style={{ paddingHorizontal: 10, justifyContent: "center", marginTop: 4 }}
        >
          <Image_ icon={ICONS.home} size={24} />
        </TouchableOpacity>
        <TabMenuButton
          buttonStyle={{
            borderTopRightRadius: 15,
          }}
          onPress={() => {
            let current = useTabNamesStore.getState().itemsTabName;
            if (current === TAB_NAMES.itemsTab.dashboard && !useOpenWorkordersStore.getState().openWorkorderID) {
              useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.empty);
            } else {
              useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.dashboard);
            }
          }}
          text={TAB_NAMES.itemsTab.dashboard}
          isSelected={
            zItemsTabName === TAB_NAMES.itemsTab.dashboard ? true : false
          }
        />
      </View>
    </View>
  );
};
