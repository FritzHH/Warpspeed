/* eslint-disable */

import { View, Text, TouchableOpacity } from "react-native-web";
import React, { useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";

import { TAB_NAMES } from "../../data";
import { TabMenuButton, Image_, TextInput_, Button_ } from "../../components";
import { Items_Dashboard } from "../screen_components/Items_Screen/Items_Dashboard";
import { CustomerSearchListComponent } from "../screen_components/Items_Screen/Items_CustomerSearchList";
import { WorkorderPreview } from "../screen_components/Items_Screen/Items_WorkorderPreview";
import { Items_WorkorderItemsTab } from "../screen_components/Items_Screen/Items_WorkorderItems";

import {
  useOpenWorkordersStore,
  useCustomerSearchStore,
  useTabNamesStore,
} from "../../stores";
import { C, ICONS, Fonts } from "../../styles";
import { ROUTES } from "../../routes";
import { EmptyItemsComponent } from "../screen_components/Items_Screen/Items_Empty";
import { log, gray } from "../../utils";
import { translateText } from "../../db_calls";
import {
  broadcastToTranslateDisplay,
  broadcastTranslateClear,
  TRANSLATE_MSG_TYPES,
} from "../../broadcastChannel";

export const Items_Section = React.memo(({}) => {
  // setters ///////////////////////////////////////////////////////////////////
  const [sShowTranslateModal, _sSetShowTranslateModal] = useState(false);

  // getters ///////////////////////////////////////////////////////////////////
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);

  ///////////////////////////////////////////////////////////////////////////
  // log("Items_Section render");
  function ScreenComponent() {

    switch (zItemsTabName) {
      case TAB_NAMES.itemsTab.changeLog:
        return <Text>Change Log Tab</Text>;
      case TAB_NAMES.itemsTab.customerList:
        return <CustomerSearchListComponent />;
      case TAB_NAMES.itemsTab.dashboard:
        return <Items_Dashboard />;
      case TAB_NAMES.itemsTab.preview:
        return <WorkorderPreview />;
      case TAB_NAMES.itemsTab.workorderItems:
        return <Items_WorkorderItemsTab />;
      case TAB_NAMES.itemsTab.empty:
        return <EmptyItemsComponent />;
      default:
        return null;
    }
  }

  // log("----------------------Items section render");
  return (
    <View style={{ flex: 1 }}>
      <TabBar onTranslatePress={() => _sSetShowTranslateModal(true)} />
      {ScreenComponent()}
      <TranslateModal
        visible={sShowTranslateModal}
        onClose={() => _sSetShowTranslateModal(false)}
      />
    </View>
  );
});

const TranslateModal = ({ visible, onClose }) => {
  const [sInputText, _sSetInputText] = useState("");
  const [sTranslatedText, _sSetTranslatedText] = useState("");
  const [sIsEnToEs, _sSetIsEnToEs] = useState(true); // true = EN→ES, false = ES→EN
  const [sLoading, _sSetLoading] = useState(false);
  const debounceRef = useRef(null);

  const sourceLabel = sIsEnToEs ? "English" : "Spanish";
  const targetLabel = sIsEnToEs ? "Spanish" : "English";
  const sourceLang = sIsEnToEs ? "en" : "es";
  const targetLang = sIsEnToEs ? "es" : "en";

  const doTranslate = useCallback(
    async (text, target) => {
      if (!text.trim()) {
        _sSetTranslatedText("");
        broadcastTranslateClear();
        return;
      }
      _sSetLoading(true);
      const result = await translateText({
        text,
        targetLanguage: target,
      });
      _sSetLoading(false);
      if (result.success) {
        const translated = result.data?.data?.translatedText || result.data?.translatedText || "";
        _sSetTranslatedText(translated);
        broadcastToTranslateDisplay(TRANSLATE_MSG_TYPES.TRANSLATE, {
          translatedText: translated,
          originalText: text,
          targetLanguage: target,
        });
      } else {
        _sSetTranslatedText("Translation error");
      }
    },
    []
  );

  const handleTextChange = useCallback(
    (text) => {
      _sSetInputText(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        doTranslate(text, targetLang);
      }, 600);
    },
    [targetLang, doTranslate]
  );

  const handleFlip = useCallback(() => {
    const newIsEnToEs = !sIsEnToEs;
    _sSetIsEnToEs(newIsEnToEs);
    const newTarget = newIsEnToEs ? "es" : "en";
    if (sInputText.trim()) {
      doTranslate(sInputText, newTarget);
    }
  }, [sIsEnToEs, sInputText, doTranslate]);

  const handleClose = useCallback(() => {
    _sSetInputText("");
    _sSetTranslatedText("");
    broadcastTranslateClear();
    onClose();
  }, [onClose]);

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

          {/* Language toggle row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: Fonts.weight.textHeavy,
                color: C.blue,
              }}
            >
              {sourceLabel}
            </Text>
            <TouchableOpacity
              onPress={handleFlip}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  color: C.green,
                  fontWeight: Fonts.weight.textHeavy,
                }}
              >
                ⇄
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 14,
                fontWeight: Fonts.weight.textHeavy,
                color: C.blue,
              }}
            >
              {targetLabel}
            </Text>
          </View>

          {/* Input */}
          <TextInput_
            value={sInputText}
            onChangeText={handleTextChange}
            debounceMs={0}
            placeholder={`Type in ${sourceLabel}...`}
            multiline={true}
            numberOfLines={4}
            autoFocus={true}
            style={{
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              borderWidth: 2,
              backgroundColor: C.listItemWhite,
              paddingVertical: 10,
              paddingHorizontal: 10,
              fontSize: 16,
              minHeight: 80,
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
            {sLoading ? (
              <Text style={{ fontSize: 14, color: gray(0.5), fontStyle: "italic" }}>
                Translating...
              </Text>
            ) : (
              <Text style={{ fontSize: 16, color: C.text }}>
                {sTranslatedText}
              </Text>
            )}
          </View>
        </View>
    </View>,
    document.body
  );
};

const TabBar = ({ onTranslatePress }) => {
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.openWorkorderID);
  const zIsStandaloneSale = useOpenWorkordersStore(
    (s) => s.workorders.find((o) => o.id === s.openWorkorderID)?.isStandaloneSale
  );
  // log("Items_Section TabBar render");
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        // backgroundColor: "green",
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
              text={
                zIsStandaloneSale
                  ? "Sale Items"
                  : TAB_NAMES.itemsTab.workorderItems
              }
              isSelected={
                zItemsTabName === TAB_NAMES.itemsTab.workorderItems
                  ? true
                  : false
              }
            />
            {/* <View style={{ width: 20 }} /> */}
          </View>
        )}
        {zOpenWorkorderID && !zIsStandaloneSale && (
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
        <TouchableOpacity
          onPress={onTranslatePress}
          style={{ paddingHorizontal: 10, justifyContent: "center" }}
        >
          <Image_ icon={ICONS.paperPlane} size={22} />
        </TouchableOpacity>
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
          onPress={() => useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.dashboard)}
          text={TAB_NAMES.itemsTab.dashboard}
          isSelected={
            zItemsTabName === TAB_NAMES.itemsTab.dashboard ? true : false
          }
        />
      </View>
    </View>
  );
};
