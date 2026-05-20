/* eslint-disable */

import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from "react";

import { TAB_NAMES } from "../../data";
import {
  TabMenuButton,
  Image,
  Tooltip,
  Dialog,
  Button,
  TextInput,
  DropdownMenu,
  LoadingIndicator,
} from "../../dom_components";
import sectionStyles from "./Items_Section.module.css";
const Items_Dashboard = lazy(() =>
  import("../screen_components/Items_Screen/Items_Dashboard").then((m) => ({
    default: m.Items_Dashboard,
  }))
);
const preloadItemsDashboard = () =>
  import("../screen_components/Items_Screen/Items_Dashboard");
import { CustomerSearchListComponent } from "../screen_components/Items_Screen/Items_CustomerSearchList";
import { Items_WorkorderItemsTab } from "../screen_components/Items_Screen/Items_WorkorderItems";

import {
  useOpenWorkordersStore,
  useCustomerSearchStore,
  useTabNamesStore,
  useSettingsStore,
  broadcastFullWorkorderToDisplay,
} from "../../stores";
import { C, ICONS } from "../../styles";
import { ROUTES } from "../../routes";
import { EmptyItemsComponent } from "../screen_components/Items_Screen/Items_Empty";
const Items_ChangeLog = lazy(() =>
  import("../screen_components/Items_Screen/Items_ChangeLog").then((m) => ({
    default: m.Items_ChangeLog,
  }))
);
const preloadItemsChangeLog = () =>
  import("../screen_components/Items_Screen/Items_ChangeLog");
import { Items_TicketSearchResults } from "../screen_components/Items_Screen/Items_TicketSearchResults";
import { Items_WorkorderSearchList } from "../screen_components/Items_Screen/Items_WorkorderSearchList";
const Items_EmailView = lazy(() =>
  import("../screen_components/Items_Screen/Items_EmailView").then((m) => ({
    default: m.Items_EmailView,
  }))
);
export const preloadItemsEmailView = () =>
  import("../screen_components/Items_Screen/Items_EmailView");
import { RecentCustomersComponent } from "../screen_components/Items_Screen/Items_RecentCustomers";
import { log, lightenRGBByPercent } from "../../utils";
import { useTranslation } from "../../useTranslation";
import {
  broadcastToTranslateDisplay,
  broadcastTranslateClear,
  broadcastClear,
  TRANSLATE_MSG_TYPES,
} from "../../broadcastChannel";
import { DevNotesModal } from "../screen_components/modal_screens/DevNotesModal";

export const Items_Section = React.memo(({}) => {
  // setters ///////////////////////////////////////////////////////////////////
  const [sShowTranslateModal, _sSetShowTranslateModal] = useState(false);
  const [sShowDevNotes, _sSetShowDevNotes] = useState(false);

  // getters ///////////////////////////////////////////////////////////////////
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);
  const zOptionsTabName = useTabNamesStore((state) => state.optionsTabName);
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.openWorkorderID);

  ///////////////////////////////////////////////////////////////////////////
  // log("Items_Section render");
  function ScreenComponent() {

    switch (zItemsTabName) {
      case TAB_NAMES.itemsTab.changeLog:
        return (
          <Suspense fallback={<LoadingIndicator />}>
            <Items_ChangeLog />
          </Suspense>
        );
      case TAB_NAMES.itemsTab.customerList:
        return <CustomerSearchListComponent />;
      case TAB_NAMES.itemsTab.dashboard:
        return (
          <Suspense fallback={<LoadingIndicator />}>
            <Items_Dashboard />
          </Suspense>
        );
      case TAB_NAMES.itemsTab.workorderItems:
        return <Items_WorkorderItemsTab />;
      case TAB_NAMES.itemsTab.ticketSearchResults:
        return <Items_TicketSearchResults />;
      case TAB_NAMES.itemsTab.workorderSearchResults:
        return <Items_WorkorderSearchList />;
      case TAB_NAMES.itemsTab.emailView:
        if (zOptionsTabName === TAB_NAMES.optionsTab.email)
          return (
            <Suspense fallback={<LoadingIndicator />}>
              <Items_EmailView />
            </Suspense>
          );
        if (zOpenWorkorderID) return <Items_WorkorderItemsTab />;
        return <EmptyItemsComponent />;
      case TAB_NAMES.itemsTab.recentCustomers:
        return <RecentCustomersComponent />;
      case TAB_NAMES.itemsTab.empty:
        return <EmptyItemsComponent />;
      default:
        return null;
    }
  }

  // log("----------------------Items section render");
  return (
    <div className={sectionStyles.container}>
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
    </div>
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

  return (
    <Dialog
      visible={visible}
      onClose={handleClose}
      title="Translate"
      aria-label="Translate"
    >
      <div
        className={sectionStyles.translateCard}
        style={{
          "--card-bg": C.backgroundWhite,
          "--card-border": C.buttonLightGreenOutline,
        }}
      >
        <div className={sectionStyles.translateHeader}>
          <span className={sectionStyles.translateTitle} style={{ color: C.text }}>
            Translate
          </span>
          <button
            type="button"
            className={sectionStyles.closeButton}
            onClick={handleClose}
            aria-label="Close"
          >
            <Image icon={ICONS.close1} width={18} height={18} />
          </button>
        </div>

        <div className={sectionStyles.langRow}>
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
          <Image icon={ICONS.rightArrowBlue} size={16} className={sectionStyles.langArrow} />
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
        </div>

        {zTranslateStarters.length > 0 && (
          <div className={sectionStyles.startersRow}>
            {zTranslateStarters.map((starter) => (
              <Button
                key={starter.id}
                text={starter.label}
                onPress={() => handleStarterPress(starter)}
                buttonStyle={{ marginRight: 6, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.blue }}
                textStyle={{ fontSize: 12, color: C.textWhite }}
              />
            ))}
          </div>
        )}

        <div className={sectionStyles.inputRow}>
          <TextInput
            value={sInputText}
            onChangeText={handleTextChange}
            debounceMs={0}
            placeholder={`Type in ${TRANSLATION_LANGUAGES.find(l => l.code === sFromLang)?.label || "English"}...`}
            multiline={true}
            numberOfLines={10}
            autoFocus={true}
            capitalize={true}
            style={{
              flex: 1,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              borderWidth: 2,
              backgroundColor: C.listItemWhite,
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 10,
              paddingRight: 10,
              fontSize: 16,
            }}
          />
          {(sInputText.length > 0 || translatedText) && (
            <button
              type="button"
              className={sectionStyles.resetButton}
              onClick={() => {
                _sSetInputText("");
                clearTranslation();
                resetInactivityTimer();
              }}
              aria-label="Reset"
            >
              <Image icon={ICONS.reset1} size={22} />
            </button>
          )}
        </div>

        <div
          className={sectionStyles.outputBox}
          style={{
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.backgroundListWhite,
          }}
        >
          {isLoading ? (
            <span className={sectionStyles.outputLoading} style={{ color: C.textMuted }}>
              Translating...
            </span>
          ) : (
            <span className={sectionStyles.outputText} style={{ color: C.text }}>
              {translatedText}
            </span>
          )}
        </div>
      </div>
    </Dialog>
  );
};

const TabBar = ({ onTranslatePress, onDevNotesPress }) => {
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.openWorkorderID);
  const zIsPreview = useOpenWorkordersStore((s) => !!s.workorderPreviewID && s.workorderPreviewID !== s.openWorkorderID);
  const hasSecondaryDisplay = localStorage.getItem("warpspeed_has_secondary_display") === "true";

  return (
    <div
      className={sectionStyles.tabBar}
      style={{ backgroundColor: zIsPreview ? lightenRGBByPercent(C.blue, 70) : undefined }}
    >
      <div className={sectionStyles.leftGroup}>
        {!!zOpenWorkorderID && (
          <TabMenuButton
            style={{ borderTopLeftRadius: 15 }}
            onPress={() =>
              useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderItems)
            }
            text={TAB_NAMES.itemsTab.workorderItems}
            isSelected={zItemsTabName === TAB_NAMES.itemsTab.workorderItems}
          />
        )}
        {!!zOpenWorkorderID && (
          <TabMenuButton
            onPress={() => useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.changeLog)}
            onMouseEnter={preloadItemsChangeLog}
            onFocus={preloadItemsChangeLog}
            text={TAB_NAMES.itemsTab.changeLog}
            isSelected={zItemsTabName === TAB_NAMES.itemsTab.changeLog}
          />
        )}
      </div>

      <div className={sectionStyles.rightGroup}>
        <Tooltip text="Notes for the app dev" position="bottom">
          <button type="button" className={sectionStyles.iconButton} onClick={onDevNotesPress}>
            <Image icon={ICONS.thoughtBubble} size={22} />
          </button>
        </Tooltip>
        {hasSecondaryDisplay && (
          <Tooltip text="Send translated text to customer display" position="bottom">
            <button type="button" className={sectionStyles.iconButton} onClick={onTranslatePress}>
              <Image icon={ICONS.paperPlane} size={22} />
            </button>
          </Tooltip>
        )}
        {!!zOpenWorkorderID && hasSecondaryDisplay && <CastButton />}
        <button
          type="button"
          className={`${sectionStyles.iconButton} ${sectionStyles.homeButton}`}
          onClick={() => (window.location.href = ROUTES.home)}
        >
          <Image icon={ICONS.home} size={24} />
        </button>
        <TabMenuButton
          style={{ borderTopRightRadius: 15 }}
          onPress={() => {
            let current = useTabNamesStore.getState().itemsTabName;
            if (current === TAB_NAMES.itemsTab.dashboard && !useOpenWorkordersStore.getState().openWorkorderID) {
              useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.empty);
            } else {
              useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.dashboard);
            }
          }}
          onMouseEnter={preloadItemsDashboard}
          onFocus={preloadItemsDashboard}
          text={TAB_NAMES.itemsTab.dashboard}
          isSelected={zItemsTabName === TAB_NAMES.itemsTab.dashboard}
        />
      </div>
    </div>
  );
};

const CastButton = () => {
  const zCasting = useOpenWorkordersStore((s) => s.castingToDisplay);
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.openWorkorderID);
  return (
    <Tooltip text={zCasting ? "Stop casting to customer screen" : "Cast workorder to customer screen"} position="bottom">
      <button
        type="button"
        className={sectionStyles.iconButton}
        style={{ opacity: zCasting ? 1 : 0.4 }}
        onClick={() => {
          if (zCasting) {
            broadcastClear();
            useOpenWorkordersStore.setState({ castingToDisplay: false });
          } else {
            let wo = useOpenWorkordersStore.getState().workorders.find((o) => o.id === zOpenWorkorderID);
            if (wo) {
              broadcastFullWorkorderToDisplay(wo);
              useOpenWorkordersStore.setState({ castingToDisplay: true });
            }
          }
        }}
      >
        <Image icon={ICONS.display} size={22} />
      </button>
    </Tooltip>
  );
};
