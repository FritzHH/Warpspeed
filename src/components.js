/*eslint-disable*/
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  FlatList,
  TextInput,
  TouchableWithoutFeedback,
  ActivityIndicator,
  ScrollView,
} from "react-native-web";
import React, {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useCallback,
  Suspense,
  lazy,
} from "react";
import { Image } from "react-native-web";
import { formatCurrencyDisp, formatMillisForDisplay, gray, ifNumIsOdd, lightenRGBByPercent, localStorageWrapper, log, usdTypeMask, deepEqual } from "./utils";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "./styles";
import { SETTINGS_OBJ, PRIVILEDGE_LEVELS, CUSTOMER_DEPOST_TYPES } from "./data";
import cloneDeep from "lodash/cloneDeep";
import { DEBOUNCE_DELAY, DISCOUNT_TYPES, LOCAL_DB_KEYS, PAUSE_USER_CLOCK_IN_CHECK_MILLIS } from "./constants";
import {
  useSettingsStore,
  useLoginStore,
  useAlertScreenStore,
} from "./stores";
import LinearGradient from "react-native-web-linear-gradient";
import ReactDOM from "react-dom";
// import DateTimePicker from "@react-native-community/datetimepicker";
import { PanResponder } from "react-native";

import { StyleSheet } from "react-native";
import { Animated } from "react-native";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const RADIX_OVERLAY_STYLE = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0 };


export function ReceiptSentOverlay({ visible, sentSMS, sentEmail, duration = 1300, onDone }) {
  useEffect(() => {
    if (!visible) return;
    let t = setTimeout(() => { if (onDone) onDone(); }, duration);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  let parts = [];
  if (sentSMS) parts.push("Text");
  if (sentEmail) parts.push("Email");
  let label = parts.join(" & ") + " Sent";
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.35)", justifyContent: "center", alignItems: "center", borderRadius: 6, zIndex: 100 }}>
      <View style={{ backgroundColor: C.backgroundWhite, borderRadius: 6, alignItems: "center", justifyContent: "center", paddingVertical: 30, paddingHorizontal: 40 }}>
        <Image source={ICONS.paperPlane} style={{ width: 50, height: 50, marginBottom: 12 }} />
        <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>{label}</Text>
      </View>
    </View>
  );
}

export const StaleBanner = ({ text, style, textStyle }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={{
        backgroundColor: C.orange,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 5,
        alignItems: "center",
        opacity,
        ...style,
      }}
    >
      <Text style={{ color: "white", fontSize: 11, fontWeight: "600", ...textStyle }}>{text}</Text>
    </Animated.View>
  );
};

export const PrinterAlert = ({ visible, x, y, onDone }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(1);
    opacity.setValue(1);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 400, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    pulse.start();
    const timer = setTimeout(() => {
      pulse.stop();
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        if (onDone) onDone();
      });
    }, 2000);
    return () => { pulse.stop(); clearTimeout(timer); };
  }, [visible]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <Animated.View
      style={{
        position: "fixed",
        left: (x || 0) - 25,
        top: (y || 0) - 25,
        width: 50,
        height: 50,
        justifyContent: "center",
        alignItems: "center",
        opacity,
        transform: [{ scale }],
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <Image_ source={ICONS.print} width={40} height={40} />
    </Animated.View>,
    document.body
  );
};

const styles = {
  container: {
    // margin: 20,
  },
  button: {
    // padding: 5,
    backgroundColor: Colors.blueButtonBackground,
    borderRadius: 1,
  },
  buttonText: {
    color: Colors.blueButtonText,
    textAlign: "center",
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "40%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
  },
  option: {
    padding: 18,
  },
  optionText: {
    fontSize: 16,
  },
  closeButton: {
    // width: 100,
    marginTop: 10,
    padding: 10,
    paddingHorizontal: 20,
    backgroundColor: "#e74c3c",
    borderRadius: 5,
  },
  removeButton: {
    // width: 200,
    marginTop: 10,
    padding: 10,
    paddingHorizontal: 20,
    backgroundColor: "#e74c3c",
    borderRadius: 5,
  },
  closeText: {
    color: "white",
    textAlign: "center",
  },
  removeText: {
    color: "white",
    textAlign: "center",
    width: 200,
  },
};

export const SHADOW_RADIUS_PROTO = {
  shadowColor: C.green,
  shadowOffset: { width: 2, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 15,
};

export const SHADOW_RADIUS_NOTHING = {
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 0,
  shadowColor: "transparent",
};

export const TabMenuDivider = () => {
  return (
    <View
      style={{
        // marginHorizontal: 2,
        width: 1,
        backgroundColor: "gray",
        height: "100%",
      }}
    ></View>
  );
};


export const AlertBox_ = ({ showAlert, pauseOnBaseScreen }) => {
  // store getters //////////////////////////////////////////////////////////////
  const zCanExitOnOuterClick = useAlertScreenStore((state) => state.canExitOnOuterClick);
  const zTitle = useAlertScreenStore((state) => state.title);
  const zMessage = useAlertScreenStore((state) => state.message);
  const zSubMessage = useAlertScreenStore((state) => state.subMessage);
  const zButton1Text = useAlertScreenStore((state) => state.btn1Text);
  const zButton2Text = useAlertScreenStore((state) => state.btn2Text);
  const zButton3Text = useAlertScreenStore((state) => state.btn3Text);
  const zButton1Handler = useAlertScreenStore((state) => state.handleBtn1Press);
  const zButton2Handler = useAlertScreenStore((state) => state.handleBtn2Press);
  const zButton3Handler = useAlertScreenStore((state) => state.handleBtn3Press);
  const zButton1Icon = useAlertScreenStore((state) => state.btn1Icon);
  const zButton2Icon = useAlertScreenStore((state) => state.btn2Icon);
  const zButton3Icon = useAlertScreenStore((state) => state.btn3Icon);
  const zIcon1Size = useAlertScreenStore((state) => state.icon1Size);
  const zIcon2Size = useAlertScreenStore((state) => state.icon2Size);
  const zIcon3Size = useAlertScreenStore((state) => state.icon3Size);
  const zAlertBoxStyle = useAlertScreenStore((state) => state.alertBoxStyle);
  const zFullScreen = useAlertScreenStore((state) => state.fullScreen);
  let zUseCancelButton = useAlertScreenStore((state) => state.useCancelButton);

  const [sFadedIn, _setFadedIn] = useState(false);

  useEffect(() => {
    if (showAlert) {
      requestAnimationFrame(() => _setFadedIn(true));
    } else {
      _setFadedIn(false);
    }
  }, [showAlert]);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  function dismissAlert() {
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => { useAlertScreenStore.getState().resetAll(); }, 100);
  }

  function handleButton1Press() {
    if (typeof zButton1Handler === "function") zButton1Handler();
    dismissAlert();
  }

  function handleButton2Press() {
    if (typeof zButton2Handler === "function") zButton2Handler();
    dismissAlert();
  }

  function handleButton3Press() {
    zButton3Handler();
    dismissAlert();
  }

  if ((!zButton2Handler && !zButton3Handler) || zUseCancelButton)
    zUseCancelButton = true;

  return (
    <AlertDialogPrimitive.Root open={showAlert} onOpenChange={(open) => { if (!open) dismissAlert(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay asChild>
          <View
            onClick={() => (zCanExitOnOuterClick ? useAlertScreenStore.getState().resetAll() : null)}
            style={{
              ...RADIX_OVERLAY_STYLE,
              zIndex: 9500,
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              alignItems: "center",
              justifyContent: "center",
              opacity: sFadedIn ? 1 : 0,
              transition: "opacity 150ms ease-in",
            }}
          />
        </AlertDialogPrimitive.Overlay>
        <AlertDialogPrimitive.Content asChild onEscapeKeyDown={() => { dismissAlert(); }}>
          <View
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 9501,
              backgroundColor: C.backgroundWhite,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "space-around",
              minWidth: "32%",
              minHeight: "24%",
              opacity: sFadedIn ? 1 : 0,
              transition: "opacity 150ms ease-in",
              ...zAlertBoxStyle,
            }}
          >
            <View style={{ alignItems: "center", width: "100%" }}>
              {!!zTitle && (
                <AlertDialogPrimitive.Title asChild>
                  <Text
                    numberOfLines={3}
                    style={{
                      fontWeight: "500",
                      marginTop: 25,
                      color: "red",
                      fontSize: 25,
                      textAlign: "center",
                    }}
                  >
                    {zTitle || "Alert:"}
                  </Text>
                </AlertDialogPrimitive.Title>
              )}

              {!!zMessage && (
                <AlertDialogPrimitive.Description asChild>
                  <Text
                    style={{
                      textAlign: "center",
                      width: "90%",
                      marginTop: 10,
                      color: Colors.darkText,
                      fontSize: 18,
                    }}
                  >
                    {zMessage}
                  </Text>
                </AlertDialogPrimitive.Description>
              )}
              {!!zSubMessage && (
                <Text
                  style={{
                    marginTop: 20,
                    width: "80%",
                    textAlign: "center",
                    color: Colors.darkText,
                    fontSize: 16,
                  }}
                >
                  {zSubMessage}
                </Text>
              )}
            </View>
            <View
              style={{
                marginTop: 25,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 25,
                width: "100%",
                paddingHorizontal: 20,
                gap: 20,
              }}
            >
              <AlertDialogPrimitive.Action asChild>
                <Button_
                  colorGradientArr={zButton1Text ? COLOR_GRADIENTS.green : []}
                  text={zButton1Text}
                  buttonStyle={{ paddingVertical: 4, flex: 1 }}
                  textStyle={{ color: C.textWhite, fontWeight: "600" }}
                  onPress={handleButton1Press}
                  iconSize={zIcon1Size || 60}
                  icon={zButton1Icon || (zButton1Text ? null : ICONS.check1)}
                />
              </AlertDialogPrimitive.Action>
              {!!zButton2Handler && (
                <AlertDialogPrimitive.Action asChild>
                  <Button_
                    colorGradientArr={zButton2Text ? COLOR_GRADIENTS.blue : []}
                    text={zButton2Text}
                    buttonStyle={{ paddingVertical: 4, flex: 1 }}
                    textStyle={zButton2Text ? { color: C.textWhite, fontWeight: "600" } : {}}
                    onPress={handleButton2Press}
                    iconSize={zIcon2Size || 60}
                    icon={zButton2Icon || (zButton2Text ? null : ICONS.close1)}
                  />
                </AlertDialogPrimitive.Action>
              )}
              {!!zButton3Handler && (
                <AlertDialogPrimitive.Action asChild>
                  <Button_
                    colorGradientArr={
                      zButton3Text ? COLOR_GRADIENTS.purple : []
                    }
                    text={zButton3Text}
                    buttonStyle={{ paddingVertical: 4, flex: 1 }}
                    textStyle={zButton3Text ? { color: C.textWhite, fontWeight: "600" } : {}}
                    onPress={handleButton3Press}
                    iconSize={zIcon3Size || 60}
                    icon={zButton3Icon || (zButton3Text ? null : ICONS.close1)}
                  />
                </AlertDialogPrimitive.Action>
              )}
            </View>
            <View style={{ width: "100%", justifyContent: "flex-end" }}>
              {zUseCancelButton && (
                <AlertDialogPrimitive.Cancel asChild>
                  <Button_
                    textStyle={{ color: gray(0.4) }}
                    buttonStyle={{
                      backgroundColor: gray(0.09),
                      borderRadius: 0,
                      borderBottomRightRadius: 15,
                      borderBottomLeftRadius: 15,
                    }}
                    text={"CANCEL"}
                    onPress={dismissAlert}
                  />
                </AlertDialogPrimitive.Cancel>
              )}
            </View>
          </View>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
};

export const Dialog_ = ({ visible, onClose, overlayColor = "rgba(50,50,50,.65)", children, contentStyle = {}, preventClose = false }) => {
  const [sFadedIn, _setFadedIn] = useState(false);
  useEffect(() => {
    if (visible) { requestAnimationFrame(() => _setFadedIn(true)); }
    else { _setFadedIn(false); }
  }, [visible]);

  return (
    <DialogPrimitive.Root open={visible} onOpenChange={(open) => { if (!open && onClose && !preventClose) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <View style={{
            ...RADIX_OVERLAY_STYLE,
            zIndex: 9000,
            backgroundColor: overlayColor,
            opacity: sFadedIn ? 1 : 0,
            transition: "opacity 150ms ease-in",
          }} />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          asChild
          onPointerDownOutside={(e) => { if (preventClose) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (preventClose) e.preventDefault(); }}
        >
          <View style={{
            ...RADIX_OVERLAY_STYLE,
            zIndex: 9001,
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
            opacity: sFadedIn ? 1 : 0,
            transition: "opacity 150ms ease-in",
            ...contentStyle,
          }}>
            <View style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
              {children}
            </View>
          </View>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

const _LegacyDateTimePicker = lazy(() => import("./legacyDateTimePicker"));
export const DateTimePicker = (props) => (
  <Suspense fallback={null}>
    <_LegacyDateTimePicker {...props} />
  </Suspense>
);

export const ScreenModal = ({
  enabled,
  ref,
  modalCoordinateVars = {},
  mouseOverOptions = {},
  handleButtonPress = () => {},
  handleMouseOver,
  handleMouseExit,
  buttonLabel,
  buttonVisible = true,
  showOuterModal = false,
  buttonIconSize,
  showShadow = true,
  buttonStyle = {},
  buttonTextStyle = {},
  Component,
  ButtonComponent,
  outerModalStyle = {},
  modalVisible = false,
  setModalVisibility = () => {},
  shadowStyle = { ...SHADOW_RADIUS_NOTHING },
  buttonIcon,
  buttonIconStyle = {},
  handleModalActionInternally = false,
  handleOuterClick = () => {},
  openUpward = false,
  centerMenuVertically = false,
  centerMenuHorizontally = false,
  centerOnClickX = false,
  menuHeight,
}) => {
  const [sInternalModalShow, _setInternalModalShow] = useState(false);
  const [sFadedIn, _setFadedIn] = useState(false);

  const isVisible = handleModalActionInternally ? sInternalModalShow : modalVisible;

  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => _setFadedIn(true));
    } else {
      _setFadedIn(false);
    }
  }, [isVisible]);

  if (!showShadow) shadowStyle = SHADOW_RADIUS_NOTHING;
  if (mouseOverOptions.highlightColor) mouseOverOptions.enable = true;

  const handleClose = () => {
    _setInternalModalShow(false);
    handleOuterClick();
  };

  if (showOuterModal) {
    return (
      <View>
        {buttonVisible && ButtonComponent && ButtonComponent()}
        {buttonVisible && !ButtonComponent && (
          <Button_
            enabled={enabled}
            handleMouseExit={handleMouseExit}
            handleMouseOver={handleMouseOver}
            icon={buttonIcon}
            iconSize={buttonIconSize}
            text={buttonLabel}
            onPress={() => {
              handleButtonPress();
              setModalVisibility(false);
              _setInternalModalShow(!sInternalModalShow);
            }}
            textStyle={{ ...buttonTextStyle }}
            buttonStyle={{
              alignItems: "center",
              justifyContent: "center",
              ...shadowStyle,
              ...buttonStyle,
            }}
          />
        )}
        <DialogPrimitive.Root open={isVisible} onOpenChange={(open) => { if (!open) handleClose(); }}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay asChild>
              <View style={{
                ...RADIX_OVERLAY_STYLE,
                zIndex: 9000,
                backgroundColor: outerModalStyle?.backgroundColor || "rgba(0,0,0,0.5)",
                opacity: sFadedIn ? 1 : 0,
                transition: "opacity 150ms ease-in",
              }} />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
              <View style={{
                ...RADIX_OVERLAY_STYLE,
                zIndex: 9001,
                width: "100%",
                height: "100%",
                justifyContent: "center",
                alignItems: "center",
                opacity: sFadedIn ? 1 : 0,
                transition: "opacity 150ms ease-in",
                ...outerModalStyle,
              }}>
                {Component()}
              </View>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </View>
    );
  }

  return (
    <PopoverPrimitive.Root
      open={isVisible}
      onOpenChange={(open) => { if (!open) handleClose(); }}
    >
      <PopoverPrimitive.Anchor>
        {buttonVisible && ButtonComponent && ButtonComponent()}
        {buttonVisible && !ButtonComponent && (
          <Button_
            enabled={enabled}
            handleMouseExit={handleMouseExit}
            handleMouseOver={handleMouseOver}
            icon={buttonIcon}
            iconSize={buttonIconSize}
            text={buttonLabel}
            onPress={() => {
              handleButtonPress();
              setModalVisibility(false);
              _setInternalModalShow(!sInternalModalShow);
            }}
            textStyle={{ ...buttonTextStyle }}
            buttonStyle={{
              alignItems: "center",
              justifyContent: "center",
              ...shadowStyle,
              ...buttonStyle,
            }}
          />
        )}
      </PopoverPrimitive.Anchor>
      {showOuterModal && isVisible && ReactDOM.createPortal(
        <View
          onClick={handleClose}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 8999,
            backgroundColor: outerModalStyle?.backgroundColor || "rgba(0,0,0,0.5)",
            opacity: sFadedIn ? 1 : 0,
            transition: "opacity 150ms ease-in",
          }}
        />,
        document.body
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={openUpward ? "top" : "bottom"}
          align={centerMenuHorizontally ? "center" : "start"}
          sideOffset={4}
          alignOffset={centerMenuHorizontally ? 0 : (modalCoordinateVars?.x ?? 0)}
          collisionPadding={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{
            zIndex: 9000,
            opacity: sFadedIn ? 1 : 0,
            transition: "opacity 150ms ease-in",
          }}
        >
          {Component()}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

const CustomDiscountInput = ({ label, onApply, maxLength = 3, maxVal, currencyMode = false, maxCents = 0 }) => {
  const [val, setVal] = useState("");
  const [cents, setCents] = useState(0);
  const submit = () => {
    if (currencyMode) {
      if (!cents) return;
      onApply(cents);
      setVal("");
      setCents(0);
    } else {
      const num = Number(val);
      if (!num) return;
      setVal("");
      onApply(num);
    }
  };
  return (
    <View onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", flex: 1, height: "100%", paddingLeft: 2 }}>
      <Text style={{ fontSize: 13, color: gray(0.5), marginRight: 6 }}>{label}</Text>
      <TextInput
        value={val}
        placeholder={currencyMode ? "0.00" : "0"}
        placeholderTextColor={gray(0.3)}
        maxLength={currencyMode ? undefined : maxLength}
        onChangeText={(v) => {
          if (currencyMode) {
            let result = usdTypeMask(v);
            if (maxCents && result.cents > maxCents) result = usdTypeMask(String(maxCents));
            setVal(result.display);
            setCents(result.cents);
          } else {
            let cleaned = v.replace(/[^0-9]/g, "");
            if (maxVal && Number(cleaned) > maxVal) cleaned = String(maxVal);
            setVal(cleaned);
          }
        }}
        onSubmitEditing={submit}
        style={{ width: currencyMode ? 70 : 50, height: 28, borderWidth: 1, borderColor: C.buttonLightGreenOutline, borderRadius: 4, paddingHorizontal: 6, fontSize: 13, color: C.text, textAlign: "center", outlineWidth: 0, backgroundColor: "white" }}
      />
      <Button_
        icon={ICONS.check1}
        iconSize={14}
        onPress={submit}
        buttonStyle={{ marginLeft: 6, backgroundColor: "transparent", borderWidth: 0, padding: 4 }}
      />
    </View>
  );
};

export const DropdownMenu = React.forwardRef(({
  enabled,
  dataArr = [],
  onSelect,
  open: openProp,
  onOpenChange,
  buttonIcon,
  buttonIconSize,
  itemTextStyle = {},
  itemStyle = {},
  buttonStyle,
  menuButtonStyle = { borderRadius: 5 },
  buttonTextStyle = {},
  buttonText,
  modalCoordX = -15, // deprecated
  modalCoordY = 25, // deprecated
  mouseOverOptions = {
    enable: true,
    opacity: 0.8,
  },
  showButtonShadow, // deprecated
  shadowStyle = {}, // deprecated
  itemSeparatorStyle = {},
  menuBorderColor,
  selectedIdx = 0,
  useSelectedAsButtonTitle = false,
  openUpward = false, // deprecated
  menuMaxHeight,
  centerMenuVertically = false, // deprecated
  centerMenuHorizontally = false, // deprecated
  centerOnClickX = false, // deprecated
  isDiscountMenu = false,
  discountMaxCents = 0,
  itemTextAlign = "center",
  searchable = false,
}, ref) => {
  const [sOpenInternal, _setOpenInternal] = useState(false);
  const [sActiveIdx, _setActiveIdx] = useState(-1);
  const [sSearchQuery, _setSearchQuery] = useState("");
  const isControlled = openProp !== undefined;
  const sOpen = isControlled ? openProp : sOpenInternal;

  function setOpen(val) {
    if (!isControlled) _setOpenInternal(val);
    if (val) _setActiveIdx(selectedIdx != null ? Number(selectedIdx) : -1);
    else { _setActiveIdx(-1); _setSearchQuery(""); }
    onOpenChange?.(val);
  }

  useImperativeHandle(ref, () => ({
    open: () => { _calcPosition(); setOpen(true); },
    close: () => setOpen(false),
    toggle: () => { if (!sOpen) _calcPosition(); setOpen(!sOpen); },
  }));

  const _ddId = useRef("dd-" + Math.random().toString(36).slice(2, 8)).current;
  const [sMenuPos, _setMenuPos] = useState({ left: 0, top: 10 });
  const _anchorRef = useRef(null);

  const VIEWPORT_PAD = 10;

  function _calcPosition() {
    if (!_anchorRef.current) return;
    const rect = _anchorRef.current.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;
    _setMenuPos({ anchorCenterX, anchorBottom: rect.bottom + 4, anchorWidth: rect.width });
  }

  const _discountRows = isDiscountMenu ? [
    { component: <div style={{ height: 1, backgroundColor: gray(0.15), width: "100%" }} />, _isDivider: true },
    {
      _isCustomInput: true,
      component: (
        <CustomDiscountInput label="Custom %" maxLength={3} maxVal={100} onApply={(num) => {
          setOpen(false);
          onSelect({ _customDiscount: { id: "custom_" + Date.now(), name: num + "% Off", value: String(num), type: DISCOUNT_TYPES.percent, custom: true } });
        }} />
      ),
    },
    {
      _isCustomInput: true,
      component: (
        <CustomDiscountInput label="Custom $" currencyMode maxCents={discountMaxCents || 99900} onApply={(cents) => {
          setOpen(false);
          const dollars = (cents / 100).toFixed(2);
          onSelect({ _customDiscount: { id: "custom_" + Date.now(), name: "$" + dollars + " Off", value: String(cents), type: DISCOUNT_TYPES.dollar, custom: true } });
        }} />
      ),
    },
  ] : [];

  const _fullDataArr = [...dataArr, ..._discountRows];
  const _displayArr = searchable && sSearchQuery
    ? _fullDataArr.filter((it) => {
        if (it._isDivider || it._isCustomInput) return false;
        const label = typeof it === "string" ? it : (it.label || "");
        return label.toLowerCase().includes(sSearchQuery.toLowerCase());
      })
    : _fullDataArr;
  const br = menuButtonStyle.borderRadius || 5;

  const BUTTON_DEFAULTS = {
    display: "flex",
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.buttonLightGreen,
    borderColor: C.buttonLightGreenOutline,
    borderWidth: 1,
    borderStyle: "solid",
    paddingTop: 2,
    paddingBottom: 2,
    borderRadius: 5,
    cursor: enabled === false ? "default" : "pointer",
    opacity: enabled === false ? 0.2 : 1,
  };
  const mergedButtonStyle = buttonStyle ? { ...BUTTON_DEFAULTS, ...buttonStyle } : BUTTON_DEFAULTS;
  if (mergedButtonStyle.paddingVertical != null) {
    mergedButtonStyle.paddingTop = mergedButtonStyle.paddingVertical;
    mergedButtonStyle.paddingBottom = mergedButtonStyle.paddingVertical;
    delete mergedButtonStyle.paddingVertical;
  }
  if (mergedButtonStyle.paddingHorizontal != null) {
    mergedButtonStyle.paddingLeft = mergedButtonStyle.paddingHorizontal;
    mergedButtonStyle.paddingRight = mergedButtonStyle.paddingHorizontal;
    delete mergedButtonStyle.paddingHorizontal;
  }
  if (mergedButtonStyle.borderWidth != null && !mergedButtonStyle.borderStyle) {
    mergedButtonStyle.borderStyle = "solid";
  }

  const RNW_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", sans-serif';
  const TEXT_DEFAULTS = { fontSize: 13, color: gray(0.55), fontWeight: 500, textAlign: "center", fontFamily: RNW_FONT };
  const mergedTextStyle = buttonTextStyle ? { ...TEXT_DEFAULTS, ...buttonTextStyle } : TEXT_DEFAULTS;

  const resolvedIcon = buttonIcon === undefined ? ICONS.menu2 : buttonIcon;
  const resolvedIconSize = buttonIconSize || 11;

  if (useSelectedAsButtonTitle) {
    buttonText = dataArr[Number(selectedIdx)]?.label;
  }

  function getItemBg(rgbString = "", index) {
    if (!rgbString) return null;
    if (ifNumIsOdd(index) || !rgbString.includes("rgb")) return rgbString;
    return lightenRGBByPercent(rgbString, 40);
  }

  function itemBorderRadius(idx) {
    const isFirst = idx === 0 && !searchable;
    const isLast = idx === _displayArr.length - 1;
    return {
      borderTopLeftRadius: isFirst ? br : 0,
      borderTopRightRadius: isFirst ? br : 0,
      borderBottomLeftRadius: isLast ? br : 0,
      borderBottomRightRadius: isLast ? br : 0,
    };
  }

  const hoverOpacity = mouseOverOptions?.opacity ?? 0.8;

  function _isSelectableIdx(i) {
    const it = _displayArr[i];
    return it && !it._isDivider && !it._isCustomInput && !it.disabled;
  }

  function _nextIdx(from, dir) {
    let i = from + dir;
    while (i >= 0 && i < _displayArr.length) {
      if (_isSelectableIdx(i)) return i;
      i += dir;
    }
    return from;
  }

  function _handleMenuKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); _setActiveIdx((prev) => _nextIdx(prev, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); _setActiveIdx((prev) => _nextIdx(prev, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (sActiveIdx >= 0 && _isSelectableIdx(sActiveIdx)) {
        const item = _displayArr[sActiveIdx];
        const realIdx = _fullDataArr.indexOf(item);
        setOpen(false);
        onSelect(item, realIdx);
      }
    }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !searchable) {
      const char = e.key.toLowerCase();
      const start = sActiveIdx + 1;
      for (let i = 0; i < _displayArr.length; i++) {
        const idx = (start + i) % _displayArr.length;
        if (!_isSelectableIdx(idx)) continue;
        const it = _displayArr[idx];
        const label = typeof it === "string" ? it : (it.label || "");
        if (label.toLowerCase().startsWith(char)) { _setActiveIdx(idx); break; }
      }
    }
  }

  return (
    <div style={{ display: "flex", flex: 1 }}>
      <div
        ref={_anchorRef}
        id={_ddId + "-btn"}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={sOpen}
        tabIndex={enabled === false ? -1 : 0}
        onClick={() => { if (enabled !== false) { _calcPosition(); setOpen(!sOpen); } }}
        onKeyDown={(e) => {
          if (enabled === false) return;
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            _calcPosition();
            setOpen(true);
          }
        }}
        onMouseEnter={(e) => { if (enabled !== false) e.currentTarget.style.opacity = String(hoverOpacity); }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = enabled === false ? "0.2" : "1"; }}
        style={{ ...mergedButtonStyle, outline: "none" }}
      >
        {!!resolvedIcon && (
          <img
            src={resolvedIcon}
            style={{ width: resolvedIconSize, height: resolvedIconSize, objectFit: "contain", marginRight: buttonText ? 6 : 0 }}
            draggable={false}
          />
        )}
        <span style={mergedTextStyle}>{buttonText}</span>
      </div>
      {sOpen && ReactDOM.createPortal(
        <>
          <div onClick={() => setOpen(false)} onWheel={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 8999 }} />
          <div
            role="listbox"
            aria-labelledby={_ddId + "-btn"}
            aria-activedescendant={sActiveIdx >= 0 ? (_ddId + "-opt-" + sActiveIdx) : undefined}
            tabIndex={-1}
            onKeyDown={_handleMenuKeyDown}
            ref={(el) => {
              if (!el) return;
              el.focus({ preventScroll: true });
              const h = el.scrollHeight;
              const w = el.offsetWidth;
              const vp = window.innerHeight;
              let top = sMenuPos.anchorBottom || VIEWPORT_PAD;
              if (top + h > vp - VIEWPORT_PAD) top = Math.max(VIEWPORT_PAD, vp - VIEWPORT_PAD - Math.min(h, vp - VIEWPORT_PAD * 2));
              let left = (sMenuPos.anchorCenterX || 0) - w / 2;
              if (left + w > window.innerWidth - VIEWPORT_PAD) left = window.innerWidth - VIEWPORT_PAD - w;
              if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
              el.style.top = top + "px";
              el.style.left = left + "px";
            }}
            style={{
              position: "fixed",
              zIndex: 9000,
              borderColor: gray(0.08),
              borderRadius: br,
              borderWidth: 2,
              borderStyle: "solid",
              backgroundColor: "white",
              minWidth: sMenuPos.anchorWidth || undefined,
              maxHeight: menuMaxHeight || "calc(100vh - 20px)",
              overflowY: "auto",
              overflowX: "hidden",
              outline: "none",
            }}
          >
            {searchable && (
              <input
                autoFocus
                placeholder="Search..."
                value={sSearchQuery}
                onChange={(e) => { _setSearchQuery(e.target.value); _setActiveIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
                  else if (e.key === "ArrowDown") { e.preventDefault(); _setActiveIdx((prev) => _nextIdx(prev, 1)); }
                  else if (e.key === "Enter") {
                    e.preventDefault();
                    if (sActiveIdx >= 0 && _isSelectableIdx(sActiveIdx)) {
                      const item = _displayArr[sActiveIdx];
                      setOpen(false);
                      onSelect(item, _fullDataArr.indexOf(item));
                    }
                  }
                }}
                style={{
                  display: "flex",
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  fontSize: 13,
                  fontFamily: RNW_FONT,
                  border: "none",
                  borderBottom: "1px solid " + gray(0.15),
                  borderTopLeftRadius: br,
                  borderTopRightRadius: br,
                  outline: "none",
                }}
              />
            )}
            {_displayArr.map((item, idx) => {
              const realIdx = _fullDataArr.indexOf(item);
              const sepStyle = idx > 0 && Object.keys(itemSeparatorStyle).length > 0
                ? itemSeparatorStyle
                : {};

              if (item.component) {
                return (
                  <React.Fragment key={item._isDivider ? "div_" + idx : "cmp_" + idx}>
                    {idx > 0 && <div style={{ width: "100%", ...sepStyle }} />}
                    <div
                      style={{
                        display: "flex",
                        height: item._isDivider ? 1 : 40,
                        backgroundColor: item._isDivider ? "transparent" : lightenRGBByPercent(C.blue, 60),
                        ...itemBorderRadius(idx),
                        ...(item._isCustomInput ? {} : itemStyle),
                      }}
                    >
                      {item.component}
                    </div>
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={item.id ?? item.label ?? idx}>
                  {idx > 0 && <div style={{ width: "100%", ...sepStyle }} />}
                  <div
                    onClick={(e) => {
                      if (item.disabled) return;
                      e.stopPropagation();
                      setOpen(false);
                      onSelect(item, realIdx);
                    }}
                    role="option"
                    id={_ddId + "-opt-" + idx}
                    aria-selected={realIdx === Number(selectedIdx)}
                    aria-disabled={item.disabled || false}
                    onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.filter = "brightness(0.95)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      position: "relative",
                      paddingLeft: 10,
                      paddingRight: realIdx === Number(selectedIdx) ? 28 : 10,
                      paddingTop: 6,
                      paddingBottom: 6,
                      minHeight: 32,
                      cursor: item.disabled ? "default" : "pointer",
                      opacity: item.disabled ? 0.4 : 1,
                      pointerEvents: item.disabled ? "none" : "auto",
                      backgroundColor: realIdx === Number(selectedIdx)
                        ? lightenRGBByPercent(C.blue, 85)
                        : (getItemBg(item.backgroundColor, idx) || getItemBg(gray(0.036), idx)),
                      ...(sActiveIdx === idx ? { outline: "2px solid " + C.blue, outlineOffset: -2 } : {}),
                      ...itemBorderRadius(idx),
                      ...itemStyle,
                    }}
                  >
                    <span style={{
                      fontSize: 13,
                      fontFamily: RNW_FONT,
                      textAlign: itemTextAlign,
                      ...itemTextStyle,
                      color: item.textColor || C.text,
                      ...(item.strikethrough ? { textDecorationLine: "line-through" } : {}),
                    }}>{item.label != null ? item.label : item}</span>
                    {realIdx === Number(selectedIdx) && (
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.green }}>&#10003;</span>
                    )}
                    {item.subtitle ? <span style={{ fontSize: 10, fontFamily: RNW_FONT, color: gray(0.5), marginTop: 2 }}>{item.subtitle}</span> : null}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
});

export const ModalDropdown = ({
  // ref,
  data,
  onSelect,
  buttonLabel,
  buttonBackgroundColor,
  onRemoveSelection,
  currentSelection,
  removeButtonText,
  buttonStyle = {},
  textStyle = {},
  outerModalStyle = {},
  innerModalStyle = {},
  modalCoordinateVars = {
    x: 200,
    y: -300,
  },

  // modalStyle = {},
}) => {
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null);

  const toggleModal = () => setModalVisible(!isModalVisible);

  const handleSelect = (item) => {
    setSelectedValue(item);
    onSelect(item);
    toggleModal();
  };

  return (
    <View>
      <TouchableOpacity onPress={toggleModal}>
        <View
          style={{
            backgroundColor: Colors.blueButtonBackground,
            borderRadius: 2,
            paddingHorizontal: 10,
            height: 25,
            padding: 3,
            alignItems: "center",
            justifyContent: "center",
            ...SHADOW_RADIUS_PROTO,
            ...buttonStyle,
          }}
        >
          <Text
            style={{
              color: "white",
              textAlign: "center",
              fontSize: 15,
              ...textStyle,
            }}
          >
            {buttonLabel}
          </Text>
        </View>
      </TouchableOpacity>

      <Dialog_ visible={isModalVisible} onClose={toggleModal} overlayColor="rgba(0,0,0,0.5)">
        <View style={{ width: "20%", ...innerModalStyle }}>
          <FlatList
            data={data}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => {
              let label = "";
              let backgroundColor = null;
              let textColor = null;
              let fontSize = null;
              let itemStyleProps = {};
              if (typeof item === "object") {
                if (Object.hasOwn(item, "backgroundColor")) {
                  label = item.label;
                  itemStyleProps.backgroundColor = item.backgroundColor;
                  textColor = item.textColor;
                  itemStyleProps.paddingVertical = 15;
                  fontSize = 15;
                  if (label === currentSelection?.label) {
                    itemStyleProps.borderWidth = 10;
                    itemStyleProps.borderColor = Colors.mainBackground;
                  }
                }
              } else {
                fontSize = 15;
                label = item;
                itemStyleProps.backgroundColor = Colors.opacityBackgroundLight;
                itemStyleProps.marginVertical = 2;
                textColor = "white";
              }
              return (
                <TouchableOpacity
                  style={{
                    ...styles.option,
                    backgroundColor,
                    borderColor: "dimgray",
                    ...itemStyleProps,
                  }}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={{ fontSize, color: textColor }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-around",
            }}
          >
            {currentSelection && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => {
                  onRemoveSelection();
                  toggleModal();
                }}
              >
                <Text style={styles.closeText}>{removeButtonText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Dialog_>
    </View>
  );
};

export const LoginModalScreen = ({ modalVisible }) => {
  const zAdminPrivilege = useLoginStore((state) => state.adminPrivilege);
  const zUsers = useSettingsStore((state) => state.settings?.users, deepEqual);
  const zPinStrength = useSettingsStore((state) => state.settings?.userPinStrength) || 4;
  const [sPin, _setPin] = useState("");
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState(false);

  // Poll login status every 500ms — facial recognition may log the user in while modal is open
  useEffect(() => {
    if (!modalVisible || sSuccess) return;
    const interval = setInterval(() => {
      let store = useLoginStore.getState();
      let user = store.currentUser;
      if (!user) return;
      let timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
      let diff = (Date.now() - store.lastActionMillis) / 1000;
      if (diff > timeout) return;
      // Check privilege if required
      if (store.adminPrivilege) {
        let perm = user.permissions?.name || user.permissions;
        let level = store.adminPrivilege;
        let hasAccess = false;
        if (level === PRIVILEDGE_LEVELS.user) hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.superUser &&
          (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
          hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.admin &&
          (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
          hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
          hasAccess = true;
        if (!hasAccess) return;
      }
      // User is logged in with sufficient privileges — auto-close instantly
      clearInterval(interval);
      _setPin("");
      _setError("");
      store.setShowLoginScreen(false);
    }, 500);
    return () => clearInterval(interval);
  }, [modalVisible, sSuccess]);

  function handleClose() {
    _setPin("");
    _setError("");
    _setSuccess(false);
    useLoginStore.getState().setShowLoginScreen(false);
  }

  function handlePinChange(input) {
    _setPin(input);
    _setError("");

    let userObj = zUsers?.find((u) => u.pin == input);
    if (!userObj) userObj = zUsers?.find((u) => u.alternatePin == input);
    if (!userObj) {
      if (input.length >= zPinStrength) _setPin("");
      return;
    }

    // Check privilege level if required
    if (zAdminPrivilege) {
      let level = zAdminPrivilege;
      let perm = userObj.permissions?.name || userObj.permissions;
      let hasAccess = false;
      if (level === PRIVILEDGE_LEVELS.user) hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.superUser &&
        (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.admin &&
        (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
        hasAccess = true;

      if (!hasAccess) {
        _setError("Insufficient permissions");
        return;
      }
    }

    // Success
    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
    _setPin("");
    _setError("");
    useLoginStore.getState().setShowLoginScreen(false);
    useLoginStore.getState().runPostLoginFunction();
    promptClockInIfNeeded(userObj);
  }

  function promptClockInIfNeeded(userObj) {
    let punchClock = useLoginStore.getState().punchClock;
    if (punchClock[userObj.id]) return; // already clocked in

    // check localStorage pause
    let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
    const lastCheckMillis = clockPauseObj[userObj.id];
    if (lastCheckMillis && (Date.now() - lastCheckMillis < PAUSE_USER_CLOCK_IN_CHECK_MILLIS)) {
      return; // still within pause window
    }

    useAlertScreenStore.getState().setValues({
      title: "PUNCH CLOCK",
      message: "Hi " + userObj.first + ", you are not clocked in. Would you like to punch in now?",
      btn1Text: "CLOCK IN",
      btn2Text: "NOT NOW",
      handleBtn1Press: () => {
        useLoginStore.getState().setCreateUserClock(userObj.id, new Date().getTime(), "in");
      },
      handleBtn2Press: () => {
        let freshPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
        freshPauseObj[userObj.id] = Date.now();
        localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, freshPauseObj);
      },
      showAlert: true,
    });
  }

  const pinInputRef = useRef(null);


  if (!modalVisible) return null;

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
      onClick={handleClose}
    >
      <View
        onClick={(e) => { e.stopPropagation(); pinInputRef.current?.focus(); }}
        style={{
          width: 360,
          backgroundColor: sSuccess ? C.green : C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: sSuccess ? C.green : C.buttonLightGreenOutline,
          padding: 24,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: Fonts.weight.textHeavy, color: sSuccess ? "white" : C.text }}>
            {sSuccess ? "Welcome!" : zAdminPrivilege ? "Authorization Required" : "Login"}
          </Text>
        </View>

        {/* Privilege badge */}
        {!!zAdminPrivilege && !sSuccess && (
          <View style={{ backgroundColor: gray(0.05), borderRadius: 6, padding: 8, marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: gray(0.5) }}>
              Requires: <Text style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}>{zAdminPrivilege}</Text> or higher
            </Text>
          </View>
        )}

        {/* PIN input — per-digit boxes */}
        {!sSuccess && (
          <View>
            <Text style={{ fontSize: 13, color: gray(0.5), marginBottom: 6 }}>Enter PIN</Text>
            <Pressable
              onPress={() => pinInputRef.current?.focus()}
              style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", position: "relative" }}
            >
              {Array.from({ length: zPinStrength }).map((_, i) => {
                const isFilled = i < sPin.length;
                const isCursor = i === sPin.length;
                return (
                  <View
                    key={i}
                    style={{
                      width: 44,
                      height: 52,
                      borderWidth: 2,
                      borderColor: sError ? C.red : isCursor ? C.cursorRed : isFilled ? "#007bff" : "#ddd",
                      borderRadius: 8,
                      marginHorizontal: 4,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: isCursor ? C.cursorRed : isFilled ? "#fff" : "#f8f9fa",
                      boxShadow: isCursor ? "0 0 10px rgba(255, 107, 107, 0.5)" : "none",
                    }}
                  >
                    {isFilled && (
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.text }} />
                    )}
                  </View>
                );
              })}
              <TextInput
                ref={pinInputRef}
                autoFocus={true}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                value={sPin}
                onChangeText={(val) => {
                  const clean = val.replace(/\D/g, "").slice(0, zPinStrength);
                  handlePinChange(clean);
                }}
                maxLength={zPinStrength}
                keyboardType="numeric"
                style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0, bottom: 0,
                  caretColor: "transparent",
                  backgroundColor: "transparent",
                  color: "transparent",
                  borderWidth: 0,
                  outline: "none",
                }}
              />
            </Pressable>
            {!!sError && (
              <Text style={{ fontSize: 12, color: C.red, marginTop: 6, textAlign: "center" }}>{sError}</Text>
            )}
          </View>
        )}

        {/* Success state */}
        {sSuccess && (
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <Image_ icon={ICONS.check} size={30} style={{ tintColor: "white" }} />
          </View>
        )}
      </View>
    </View>,
    document.body
  );
};

// Loading Indicator Components
export const LoadingIndicator = ({
  size = "medium",
  color = "#007bff",
  text = "",
  textStyle = {},
  containerStyle = {},
  centered = true,
  message = "Loading...",
  ...props
}) => {
  // Convert size to appropriate value
  const getSizeValue = () => {
    switch (size) {
      case "small":
        return 20;
      case "medium":
        return 40;
      case "large":
        return 60;
      default:
        return typeof size === "number" ? size : 40;
    }
  };

  const sizeValue = getSizeValue();

  const defaultContainerStyle = {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    ...(centered && {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(255, 255, 255, 0.8)",
      zIndex: 1000,
    }),
    ...containerStyle,
  };

  const defaultTextStyle = {
    marginTop: 10,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    ...textStyle,
  };

  return (
    <View style={defaultContainerStyle} {...props}>
      <ActivityIndicator size={sizeValue} color={color} />
      {!!(text || message) && (
        <Text style={defaultTextStyle}>{text || message}</Text>
      )}
    </View>
  );
};

export const InlineLoadingIndicator = (props) => (
  <LoadingIndicator centered={false} {...props} />
);

export const FullScreenLoadingIndicator = (props) => (
  <LoadingIndicator centered={true} {...props} />
);

export const SmallLoadingIndicator = (props) => (
  <LoadingIndicator size="small" centered={false} {...props} />
);

export const LargeLoadingIndicator = (props) => (
  <LoadingIndicator size="large" {...props} />
);

export const PhoneNumberInput = ({
  width,
  height,
  value = "",
  onChangeText,
  placeholder = "",
  style = {},
  boxStyle = {},
  filledBoxStyle = {},
  placeholderBoxStyle = {},
  cursorBoxStyle = {},
  placeholderTextColor = "#999",
  cursorTextColor = "#fff",
  showDashes = true,
  dashStyle = {},
  dashColor = "#666",
  dashSize = 16,
  maxLength = 10,
  autoFocus = false,
  editable = true,
  handleEnterPress = () => {},
  highlightOnClick = true,
  onFocus,
  onBlur,
  fontSize,
  textColor = gray(0.55),
  ...props
}) => {
  const [cursorPosition, setCursorPosition] = React.useState(0);
  const [isFocused, setIsFocused] = React.useState(false);
  const textInputRef = React.useRef(null);

  React.useEffect(() => {
    if (autoFocus && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, []);

  // Ensure we only have digits and limit to maxLength
  const digits = value.replace(/\D/g, "").slice(0, maxLength);

  // Helper function to render a dash
  const renderDash = (key) => (
    <Text
      key={key}
      style={[
        {
          fontSize: dashSize,
          color: dashColor,
          fontWeight: "bold",
          marginHorizontal: 8,
          alignSelf: "center",
        },
        dashStyle,
      ]}
    >
      -
    </Text>
  );

  // Create array of 10 boxes with dashes
  const renderBoxes = () => {
    const elements = [];

    for (let i = 0; i < 10; i++) {
      // Add box
      const digit = digits[i] || "";
      const isEmpty = !digit;
      const isCursorPosition = isFocused && cursorPosition === i;

      // Debug logging
      // if (i === 0) {
      //   console.log("Box rendering debug:", {
      //     isFocused,
      //     cursorPosition,
      //     digits: digits,
      //     digitsLength: digits.length,
      //   });
      // }

      // Additional debug for cursor position
      // if (isCursorPosition) {
      //   console.log(`Box ${i} is cursor position!`, {
      //     isFocused,
      //     cursorPosition,
      //     i,
      //     digit,
      //   });
      // }

      elements.push(
        <View
          key={`box-${i}`}
          style={[
            {
              // width: 30,
              width: width || 30,
              height: height || 40,
              borderWidth: 2,
              borderColor: isCursorPosition
                ? C.cursorRed
                : isEmpty
                ? "#ddd"
                : "#007bff",
              borderRadius: 8,
              marginHorizontal: 2,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: isCursorPosition
                ? C.cursorRed
                : isEmpty
                ? "#f8f9fa"
                : "#fff",
              boxShadow: isCursorPosition
                ? "0 0 10px rgba(255, 107, 107, 0.5)"
                : "none",
            },
            boxStyle,
            isCursorPosition
              ? cursorBoxStyle
              : isEmpty
              ? placeholderBoxStyle
              : filledBoxStyle,
          ]}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: isCursorPosition
                ? cursorTextColor
                : isEmpty
                ? placeholderTextColor
                : textColor,
            }}
          >
            {digit}
          </Text>
        </View>
      );

      // Add dash after 3rd box (index 2) and 6th box (index 5)
      if (showDashes && (i === 2 || i === 5)) {
        elements.push(renderDash(`dash-${i}`));
      }
    }

    return elements;
  };

  const handleTextChange = (text) => {
    // Only allow digits and limit to maxLength
    const cleanText = text.replace(/\D/g, "").slice(0, maxLength);

    // Update cursor position to the end of the text
    setCursorPosition(Math.min(cleanText.length, maxLength - 1));

    if (onChangeText) {
      onChangeText(cleanText);
    }
  };

  const handleSelectionChange = (event) => {
    const { start } = event.nativeEvent.selection;
    setCursorPosition(Math.min(start, digits.length, maxLength - 1));
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Set cursor to the end of current text or 0 if empty
    setCursorPosition(Math.min(digits.length, maxLength - 1));
    if (onFocus) {
      onFocus();
    }
  };

  const handleClick = (e) => {
    // When user clicks, highlight the last box to show cursor position
    console.log(
      "PhoneNumberInput clicked, highlightOnClick:",
      highlightOnClick
    );
    if (highlightOnClick) {
      e.preventDefault();
      setIsFocused(true);
      // Set cursor to the end of current text (last filled box or first empty box)
      const newCursorPosition = Math.min(digits.length, 9);
      setCursorPosition(newCursorPosition);
      console.log(
        "Setting cursor position to:",
        newCursorPosition,
        "digits.length:",
        digits.length
      );
      // Focus the hidden TextInput
      if (textInputRef.current) {
        textInputRef.current.focus();
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setCursorPosition(0);
    if (onBlur) {
      onBlur();
    }
  };

  const handleKeyPress = (e) => {
    // Allow backspace, delete, arrow keys, and digits
    const allowedKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      // "ArrowUp",
      // "ArrowDown",
      // "Tab",
      "Enter",
    ];

    if (e.key === "Enter") {
      handleEnterPress();
      return;
    }

    if (allowedKeys.includes(e.key) || /^\d$/.test(e.key)) {
      return; // Allow the key
    }

    if (e.ctrlKey || e.metaKey) {
      return; // Allow paste, copy, select-all, etc.
    }

    e.preventDefault(); // Block other keys
  };

  return (
    <Pressable
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          // position: "relative",
          width: "100%",
          // backgroundColor: "blue",
        },
        style,
      ]}
      onPress={handleClick}
    >
      {renderBoxes()}
      <TextInput
        ref={textInputRef}
        value={digits}
        onChangeText={handleTextChange}
        onSelectionChange={handleSelectionChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        autoFocus={autoFocus}
        editable={editable}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0,
          backgroundColor: "transparent",
          color: "transparent",
          borderWidth: 0,
          outline: "none",
        }}
        keyboardType="numeric"
        {...props}
      />
    </Pressable>
  );
};

export const TouchableOpacity_ = ({
  children,
  onPress,
  style = {},
  hoverStyle = {},
  activeOpacity = 0.6,
  hoverOpacity = 0.7,
  disabled = false,
  disabledStyle = {},
  ...props
}) => {
  const [isPressed, setIsPressed] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  const handlePressIn = () => {
    if (!disabled) {
      setIsPressed(true);
    }
  };

  const handlePressOut = () => {
    setIsPressed(false);
  };

  const handleMouseEnter = () => {
    if (!disabled) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handlePress = (e) => {
    if (!disabled && onPress) {
      onPress(e);
    }
  };

  const getOpacity = () => {
    if (disabled) return 0.3;
    if (isPressed) return Math.min(activeOpacity, 0.6); // Darker (lower opacity)
    if (isHovered) return hoverOpacity; // Lighter (higher opacity)
    return 1;
  };

  const combinedStyle = [
    {
      opacity: getOpacity(),
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "opacity 0.2s ease",
    },
    style,
    isHovered && hoverStyle,
    disabled && disabledStyle,
  ];

  return (
    <TouchableOpacity
      style={combinedStyle}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      // activeOpacity={1} // We handle opacity manually
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
};
export const TabMenuButton = ({
  onPress,
  text,
  textColor,
  buttonStyle,
  textStyle,
  isSelected,
  onLongPress,
  height,
  icon,
  iconSize,
}) => {
  return (
    <Button_
      onLongPress={onLongPress}
      onPress={onPress}
      text={text}
      icon={icon}
      iconSize={iconSize}
      textStyle={{
        // textColor: Colors.tabMenuButtonText,
        color: isSelected ? C.textWhite : "white",
        fontSize: 15,
        ...textStyle,
      }}
      colorGradientArr={
        isSelected ? COLOR_GRADIENTS.blue : COLOR_GRADIENTS.lightBlue
      }
      buttonStyle={{
        height,
        // backgroundColor: ,
        paddingHorizontal: 15,
        width: null,
        paddingVertical: 5,
        borderRadius: 0,
        ...buttonStyle,
      }}
    />
  );
};

export const CheckBox_ = ({
  text,
  onCheck,
  item,
  iconSize = 25,
  mouseOverOptions,
  makeEntireViewCheckable = true,
  // roundButton = false,
  isChecked,
  buttonStyle = {},
  textStyle = {},
  enabled = true,
  enableMouseOver = true,
}) => {
  return (
    <Button_
      enabled={enabled}
      mouseOverOptions={mouseOverOptions}
      icon={isChecked ? ICONS.checkbox : ICONS.checkoxEmpty}
      iconSize={15}
      text={text}
      buttonStyle={{
        backgroundColor: "transparent",
        paddingHorizontal: 0,
        paddingVertical: 0,
        ...buttonStyle,
      }}
      textStyle={{ color: C.text, fontSize: 15, ...textStyle }}
      onPress={onCheck}
      enableMouseOver={enableMouseOver}
    />
  );
};

export const GradientView = ({
  colorArr = COLOR_GRADIENTS.blue,
  children,
  style,
  props,
  pointerEvents,
}) => {
  return (
    <LinearGradient
      colors={[...colorArr]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ justifyContent: "center", alignItems: "center", ...style }}
      {...props}
    >
      {children}
    </LinearGradient>
  );
};

export const Image_ = ({
  size,
  style = {},
  resizeMode = "contain",
  icon = "",
}) => {
  // Create a new style object to avoid mutations
  const imageStyle = {
    ...style,
    resizeMode,
  };

  // Handle size assignment without mutating original style
  if (size) {
    imageStyle.width = size;
    imageStyle.height = size;
  } else {
    // Only set defaults if neither width nor height is provided
    if (!imageStyle.width && !imageStyle.height) {
      imageStyle.width = 30;
      imageStyle.height = 30;
    }
  }

  return <Image source={icon} style={imageStyle} />;
};

export const Button_ = ({
  handleMouseOver = () => {},
  handleMouseExit = () => {},
  visible = true,
  icon = null,
  ref,
  iconSize = 25,
  onPress = () => {},
  onLongPress,
  numLines = 1,
  text,
  enableMouseOver = true,
  opacity,
  TextComponent,
  mouseOverOptions = {
    opacity: 0.82,
    highlightColor: "",
    textColor: "",
  },
  shadow = false,
  allCaps = false,
  colorGradientArr = [],
  gradientViewProps = {},
  buttonStyle = {},
  textStyle = {},
  iconStyle = {},
  viewStyle = {},
  enabled = true,
  autoFocus,
}) => {
  const [sMouseOver, _setMouseOver] = React.useState(false);
  if (allCaps) text = text.toUpperCase();
  let shadowStyle = SHADOW_RADIUS_PROTO;
  if (!shadow) shadowStyle = SHADOW_RADIUS_NOTHING;
  /////////////////////////////////////////////////////
  //////////////////////////////////////////////////////
  const HEIGHT = buttonStyle.height;
  const WIDTH = buttonStyle.width;
  if (!visible) {
    return (
      <View
        style={{ width: WIDTH, height: HEIGHT, backgroundColor: "transparent" }}
      ></View>
    );
  }

  function handleButtonPress(e) {
    if (!enabled) return;
    if (visible) {
      _setMouseOver(false);
      onPress(e);
    }
  }

  function getBackgroundColor() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.highlightColor || buttonStyle.backgroundColor;
    } else {
      if (buttonStyle.backgroundColor) return buttonStyle.backgroundColor;
      return C.buttonLightGreen;
    }
  }

  function getOpacity() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.opacity;
    } else if (!enabled) {
      return null;
    } else {
      return 1;
    }
  }

  // log(enabled.toString());
  return (
    <View style={{ cursor: !enabled ? "default" : undefined }}>
      <TouchableOpacity
        disabled={!enabled}
        style={{
          opacity: getOpacity(),
          cursor: !enabled ? "default" : "pointer",
          ...viewStyle,
        }}
        activeOpacity={enabled ? null : 1}
        ref={ref}
        onMouseOver={() => {
          if (!enabled) return;
          handleMouseOver();
          enableMouseOver ? _setMouseOver(true) : null;
        }}
        onMouseLeave={() => {
          handleMouseExit();
          _setMouseOver(false);
        }}
        // on={() => log("here")}
        onPress={(e) => (enabled ? handleButtonPress(e) : null)}
        onLongPress={visible ? onLongPress : () => {}}
      >
        <GradientView
          // colorArr={enabled ? colorGradientArr : []}
          colorArr={colorGradientArr || []}
          style={{
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            borderRadius: 5,
            // paddingVertical: 5,
            paddingHorizontal: 15,
            paddingLeft: icon ? 10 : null,
            paddingVertical: 5,
            ...shadowStyle,
            ...buttonStyle,
            backgroundColor: icon && !text ? null : getBackgroundColor(),
            opacity: enabled ? (buttonStyle.opacity ?? 1) : 0.2,
          }}
          {...gradientViewProps}
        >
          {!!icon && (
            <Image_
              icon={icon}
              size={iconSize}
              style={{
                marginRight: text ? 10 : 0,
                ...iconStyle,
                opacity: sMouseOver
                  ? mouseOverOptions.opacity
                  : buttonStyle.opacity,
              }}
            />
          )}
          {/* {text ? <Text style={{ ...textStyle }}>{text}</Text> : null} */}
          {TextComponent ? (
            <TextComponent />
          ) : (
            <Text
              numberOfLines={numLines}
              style={{
                textAlign: "center",
                fontSize: 15,
                color: C.textWhite,
                ...textStyle,
              }}
            >
              {text}
            </Text>
          )}
        </GradientView>
      </TouchableOpacity>
    </View>
  );
};

const pad = (n, len = 2) => n.toString().padStart(len, "0");
export const NumberSpinner_ = ({
  min = 0,
  max = 100,
  value = 46,
  onChange = () => {},
  width = 80,
  style = {},
  itemStyle = {},
  visibleItems = 5,
  padZero = false,
}) => {
  const scrollRef = useRef(null);
  const [selected, setSelected] = useState(value);
  const styles1 = {
    item: {
      justifyContent: "center",
      alignItems: "center",
    },
    text: {},
  };
  const ITEM_HEIGHT = 48;
  // Generate number array
  const numbers = [];
  for (let i = min; i <= max; i++) {
    numbers.push(padZero ? pad(i) : i);
  }

  // When component mounts or value prop changes, scroll to correct offset
  React.useEffect(() => {
    if (scrollRef.current) {
      const idx = Math.max(0, numbers.indexOf(padZero ? pad(value) : value));
      scrollRef.current.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      setSelected(numbers[idx]);
    }
  }, [value, min, max, padZero]);

  // On scroll end, snap to nearest item
  const onScrollEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(numbers.length - 1, idx));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        y: clampedIdx * ITEM_HEIGHT,
        animated: true,
      });
    }
    setSelected(numbers[clampedIdx]);
    onChange(padZero ? parseInt(numbers[clampedIdx], 10) : numbers[clampedIdx]);
  };

  // Calculate padding items to center selected
  const padCount = Math.floor(visibleItems / 2);

  return (
    <View
      style={[
        {
          width,
          height: ITEM_HEIGHT * visibleItems,
          overflow: "hidden",
          alignItems: "center",
        },
        style,
      ]}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollEnd}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * padCount,
        }}
      >
        {numbers.map((num, idx) => (
          <View
            key={num + idx}
            style={[
              styles1.item,
              {
                height: ITEM_HEIGHT,
                width: width,
                opacity:
                  num === selected
                    ? 1
                    : Math.abs(
                        numbers.indexOf(num) - numbers.indexOf(selected)
                      ) === 1
                    ? 0.6
                    : 0.3,
              },
              itemStyle,
            ]}
          >
            <Text
              style={[
                styles1.text,
                {
                  fontWeight: num === selected ? "bold" : "normal",
                  fontSize: num === selected ? 26 : 20,
                  color: num === selected ? "#333" : "#999",
                },
              ]}
            >
              {num}
            </Text>
          </View>
        ))}
      </ScrollView>
      {/* Overlay center highlight */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <View
          style={{
            height: ITEM_HEIGHT,
            width: width,
            borderTopWidth: 2,
            borderBottomWidth: 2,
            borderColor: "#007AFF",
            position: "absolute",
          }}
        />
      </View>
    </View>
  );
};

// Generate time slots from 12:00 AM → 12:00 PM in 30 min increments
function generateTimes() {
  const times = [];
  for (let m = 0; m <= 12 * 60; m += 30) {
    let hours24 = Math.floor(m / 60);
    let minutes = m % 60;

    let period = hours24 < 12 ? "AM" : "PM";
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;

    const label = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
    times.push({ label, minutes: m });
  }
  return times;
}

export function TimeSpinner({
  onChange = () => {},
  initialMinutes = 0,
  itemHeight = 20,
  style,
}) {
  const times = useMemo(() => generateTimes(), []);
  const [selected, setSelected] = useState(initialMinutes);

  const listRef = useRef(null);

  // Find index of initial selection
  const initialIndex = times.findIndex((t) => t.minutes === initialMinutes);

  const handleSelect = (item) => {
    setSelected(item.minutes);
    onChange(item);
  };
  const styles = {
    container: {
      width: 120,
      overflow: "hidden",
      alignSelf: "center",
    },
    item: {
      justifyContent: "center",
      alignItems: "center",
    },
    text: {
      fontSize: 18,
      color: "#555",
    },
    selectedText: {
      fontSize: 20,
      fontWeight: "600",
      color: "#000",
    },
    selector: {
      position: "absolute",
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: "#aaa",
    },
  };

  return (
    <View style={[styles.container, { height: itemHeight * 5 }, style]}>
      <FlatList
        ref={listRef}
        data={times}
        keyExtractor={(item) => item.minutes.toString()}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        initialScrollIndex={initialIndex > -1 ? initialIndex : 0}
        renderItem={({ item }) => {
          const isSelected = item.minutes === selected;
          return (
            <TouchableOpacity
              style={[styles.item, { height: itemHeight }]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.text, isSelected && styles.selectedText]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        onMomentumScrollEnd={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          const index = Math.round(offsetY / itemHeight);
          if (times[index]) handleSelect(times[index]);
        }}
      />
      {/* Selection indicator (overlay) */}
      <View
        style={[
          styles.selector,
          { top: (itemHeight * 5) / 2 - itemHeight / 2, height: itemHeight },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

export const TimePicker_ = ({
  initialHour = 12,
  initialMinute = 0,
  initialPeriod = "PM",
  onConfirm = () => {},
  onCancel = () => {},
  style = {},
}) => {
  const [sHour, _sSetHour] = useState(initialHour);
  const [sMinute, _sSetMinute] = useState(initialMinute);
  const [sPeriod, _sSetPeriod] = useState(initialPeriod);

  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const hourReady = useRef(false);
  const minuteReady = useRef(false);
  const hourTimer = useRef(null);
  const minuteTimer = useRef(null);

  const ITEM_H = 36;
  const VISIBLE = 7;
  const PAD = Math.floor(VISIBLE / 2);
  const COL_W = 64;
  const BLUE = "#2979FF";

  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mins = [];
  for (let i = 0; i < 60; i++) mins.push(i);

  const snapScroll = (e, items, ref, setter) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
    setter(items[idx]);
  };

  const nudge = (ref, items, current, setter, dir) => {
    const idx = items.indexOf(current) + dir;
    if (idx >= 0 && idx < items.length) {
      ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
      setter(items[idx]);
    }
  };

  const renderScrollColumn = (items, selected, ref, setter, formatFn, readyRef, initVal, timerRef) => {
    const selIdx = items.indexOf(selected);
    return (
      <View style={{ width: COL_W, alignItems: "center" }}>
        <TouchableOpacity
          onPress={() => nudge(ref, items, selected, setter, -1)}
          style={{ height: 22, justifyContent: "center", alignItems: "center", width: COL_W }}
        >
          <Text style={{ fontSize: 9, color: gray(0.5) }}>▲</Text>
        </TouchableOpacity>

        <View style={{ height: ITEM_H * VISIBLE, overflow: "hidden" }}>
          <ScrollView
            ref={ref}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_H}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={(e) => {
              clearTimeout(timerRef.current);
              const y = e.nativeEvent.contentOffset.y;
              timerRef.current = setTimeout(() => {
                const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
                ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
                setter(items[idx]);
              }, 75);
            }}
            onLayout={() => {
              if (!readyRef.current) {
                readyRef.current = true;
                const idx = items.indexOf(initVal);
                ref.current?.scrollTo({ y: Math.max(0, idx) * ITEM_H, animated: false });
              }
            }}
            contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
          >
            {items.map((item, i) => {
              const dist = Math.abs(i - selIdx);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
                    setter(item);
                  }}
                  style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      fontSize: i === selIdx ? 19 : 17,
                      fontWeight: i === selIdx ? "600" : "400",
                      color: i === selIdx ? "#fff" : gray(0.55),
                    }}
                  >
                    {formatFn(item)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity
          onPress={() => nudge(ref, items, selected, setter, 1)}
          style={{ height: 22, justifyContent: "center", alignItems: "center", width: COL_W }}
        >
          <Text style={{ fontSize: 9, color: gray(0.5) }}>▼</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const confirmResult = () => {
    const h24 = sPeriod === "PM" ? (sHour === 12 ? 12 : sHour + 12) : (sHour === 12 ? 0 : sHour);
    onConfirm({
      hour: sHour,
      minute: sMinute,
      period: sPeriod,
      totalMinutes: h24 * 60 + sMinute,
    });
  };

  return (
    <View style={[{ backgroundColor: "#fff", borderRadius: 10, paddingVertical: 4, width: COL_W * 3 + 16 }, style]}>
      <View style={{ position: "relative", paddingHorizontal: 8 }}>
        {/* Blue highlight bar */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: 22 + PAD * ITEM_H,
            height: ITEM_H,
            backgroundColor: BLUE,
            borderRadius: 8,
            zIndex: 0,
          }}
        />

        <View style={{ flexDirection: "row", zIndex: 1 }}>
          {renderScrollColumn(hours, sHour, hourRef, _sSetHour, (h) => String(h), hourReady, initialHour, hourTimer)}
          {renderScrollColumn(mins, sMinute, minuteRef, _sSetMinute, (m) => String(m).padStart(2, "0"), minuteReady, initialMinute, minuteTimer)}

          {/* AM/PM column */}
          <View style={{ width: COL_W, alignItems: "center" }}>
            <View style={{ height: 22 }} />
            <View style={{ height: ITEM_H * VISIBLE, overflow: "hidden" }}>
              <View style={{ marginTop: sPeriod === "AM" ? PAD * ITEM_H : (PAD - 1) * ITEM_H }}>
                <TouchableOpacity
                  onPress={() => _sSetPeriod("AM")}
                  style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                >
                  <Text
                    style={{
                      fontSize: sPeriod === "AM" ? 19 : 17,
                      fontWeight: sPeriod === "AM" ? "600" : "400",
                      color: sPeriod === "AM" ? "#fff" : gray(0.55),
                    }}
                  >
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => _sSetPeriod("PM")}
                  style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                >
                  <Text
                    style={{
                      fontSize: sPeriod === "PM" ? 19 : 17,
                      fontWeight: sPeriod === "PM" ? "600" : "400",
                      color: sPeriod === "PM" ? "#fff" : gray(0.55),
                    }}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ height: 22 }} />
          </View>
        </View>
      </View>

      {/* Bottom buttons */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-evenly",
          paddingTop: 10,
          paddingBottom: 6,
          borderTopWidth: 1,
          borderColor: "#eee",
          marginTop: 4,
        }}
      >
        <TouchableOpacity onPress={confirmResult} style={{ padding: 8 }}>
          <Image_ style={{ width: 27, height: 27 }} icon={ICONS.check} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
          <Image_ style={{ width: 23, height: 23 }} icon={ICONS.close1} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31];

export const DatePicker_ = ({
  initialMonth = new Date().getMonth() + 1,
  initialDay = new Date().getDate(),
  onConfirm = () => {},
  onCancel = () => {},
  style = {},
}) => {
  const [sMonth, _sSetMonth] = useState(initialMonth);
  const [sDay, _sSetDay] = useState(initialDay);

  const monthRef = useRef(null);
  const dayRef = useRef(null);
  const monthReady = useRef(false);
  const dayReady = useRef(false);
  const monthTimer = useRef(null);
  const dayTimer = useRef(null);

  const ITEM_H = 36;
  const VISIBLE = 7;
  const PAD = Math.floor(VISIBLE / 2);
  const COL_W = 64;
  const BLUE = "#2979FF";

  const months = [];
  for (let i = 1; i <= 12; i++) months.push(i);

  const maxDay = DAYS_IN_MONTH[sMonth - 1] || 31;
  const days = [];
  for (let i = 1; i <= maxDay; i++) days.push(i);

  // clamp day if month changed to a shorter month
  useEffect(() => {
    if (sDay > maxDay) _sSetDay(maxDay);
  }, [sMonth]);

  const nudge = (ref, items, current, setter, dir) => {
    const idx = items.indexOf(current) + dir;
    if (idx >= 0 && idx < items.length) {
      ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
      setter(items[idx]);
    }
  };

  const renderScrollColumn = (items, selected, ref, setter, formatFn, readyRef, initVal, timerRef) => {
    const selIdx = items.indexOf(selected);
    return (
      <View style={{ width: COL_W, alignItems: "center" }}>
        <TouchableOpacity
          onPress={() => nudge(ref, items, selected, setter, -1)}
          style={{ height: 22, justifyContent: "center", alignItems: "center", width: COL_W }}
        >
          <Text style={{ fontSize: 9, color: gray(0.5) }}>▲</Text>
        </TouchableOpacity>

        <View style={{ height: ITEM_H * VISIBLE, overflow: "hidden" }}>
          <ScrollView
            ref={ref}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_H}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={(e) => {
              clearTimeout(timerRef.current);
              const y = e.nativeEvent.contentOffset.y;
              timerRef.current = setTimeout(() => {
                const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
                ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
                setter(items[idx]);
              }, 75);
            }}
            onLayout={() => {
              if (!readyRef.current) {
                readyRef.current = true;
                const idx = items.indexOf(initVal);
                ref.current?.scrollTo({ y: Math.max(0, idx) * ITEM_H, animated: false });
              }
            }}
            contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
          >
            {items.map((item, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
                  setter(item);
                }}
                style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    fontSize: i === selIdx ? 19 : 17,
                    fontWeight: i === selIdx ? "600" : "400",
                    color: i === selIdx ? "#fff" : gray(0.55),
                  }}
                >
                  {formatFn(item)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <TouchableOpacity
          onPress={() => nudge(ref, items, selected, setter, 1)}
          style={{ height: 22, justifyContent: "center", alignItems: "center", width: COL_W }}
        >
          <Text style={{ fontSize: 9, color: gray(0.5) }}>▼</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[{ backgroundColor: "#fff", borderRadius: 10, paddingVertical: 4, width: COL_W * 2 + 16 }, style]}>
      <View style={{ position: "relative", paddingHorizontal: 8 }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: 22 + PAD * ITEM_H,
            height: ITEM_H,
            backgroundColor: BLUE,
            borderRadius: 8,
            zIndex: 0,
          }}
        />
        <View style={{ flexDirection: "row", zIndex: 1 }}>
          {renderScrollColumn(months, sMonth, monthRef, _sSetMonth, (m) => MONTH_NAMES[m - 1], monthReady, initialMonth, monthTimer)}
          {renderScrollColumn(days, sDay, dayRef, _sSetDay, (d) => String(d), dayReady, initialDay, dayTimer)}
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-evenly",
          paddingTop: 10,
          paddingBottom: 6,
          borderTopWidth: 1,
          borderColor: "#eee",
          marginTop: 4,
        }}
      >
        <TouchableOpacity onPress={() => onConfirm({ month: sMonth, day: sDay })} style={{ padding: 8 }}>
          <Image_ style={{ width: 27, height: 27 }} icon={ICONS.check} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
          <Image_ style={{ width: 23, height: 23 }} icon={ICONS.close1} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export function SliderButton_({
  onConfirm,
  toConfirmLabel = "Slide to confirm",
  confirmLabel = "Confirmed!",
  showLabel = false,
  style = {},
  // Text styling parameters
  textStyle = {},
  labelStyle = {},
  // Slider size parameters
  sliderWidth = 280,
  knobSize = 50,
  // Slider color parameters
  sliderBackgroundColor = "#eee",
  sliderBackgroundOpacity = 1,
  knobBackgroundColor = "#4CAF50",
  knobTextColor = "white",
  knobText = "➔",
  // Knob image parameters
  knobImage = "",
  knobImageSize = 20,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  const SLIDER_WIDTH = sliderWidth;
  const KNOB_SIZE = knobSize;

  const styles2 = StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      ...style,
    },
    label: {
      marginBottom: 10,
      fontSize: 16,
      fontWeight: "600",
      ...labelStyle,
    },
    slider: {
      width: SLIDER_WIDTH,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      backgroundColor: sliderBackgroundColor,
      opacity: sliderBackgroundOpacity,
      justifyContent: "center",
      overflow: "hidden",
    },
    knob: {
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      backgroundColor: knobBackgroundColor,
      justifyContent: "center",
      alignItems: "center",
      position: "absolute",

      // 👇 Works only in react-native-web
      cursor: "pointer",
    },
    knobText: {
      color: knobTextColor,
      fontSize: 20,
      fontWeight: "bold",
      ...textStyle,
    },
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !confirmed,
      onMoveShouldSetPanResponder: () => !confirmed,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          const maxDistance = SLIDER_WIDTH - KNOB_SIZE;
          translateX.setValue(Math.min(gestureState.dx, maxDistance));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const maxDistance = SLIDER_WIDTH - KNOB_SIZE;
        const threshold = maxDistance - 10; // 10px tolerance

        if (gestureState.dx > threshold) {
          // Trigger action if slid to end
          setConfirmed(true);
          onConfirm?.();
          // Reset immediately after confirmation
          setConfirmed(false);
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        } else {
          // Reset back if not completed
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles2.container}>
      {!!showLabel && (
        <Text style={styles2.label}>
          {confirmed ? confirmLabel : toConfirmLabel}
        </Text>
      )}
      <View style={styles2.slider}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles2.knob, { transform: [{ translateX }] }]}
        >
          {knobImage ? (
            <Image_
              icon={knobImage}
              size={knobImageSize}
              style={{ resizeMode: "contain" }}
            />
          ) : (
            <Text style={styles2.knobText}>{knobText}</Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

export const TextInput_ = ({
  value = "",
  onChangeText,
  debounceMs = DEBOUNCE_DELAY,
  style = {},
  placeholder = "",
  placeholderTextColor = "gray",
  multiline = false,
  numberOfLines = 1,
  autoFocus = false,
  editable = true,
  onFocus,
  onBlur,
  onContentSizeChange,
  capitalize = false,
  inputRef: externalInputRef,
  ...props
}) => {
  const [localValue, setLocalValue] = useState(value || "");
  const debounceRef = useRef(null);
  const internalRef = useRef(null);
  const inputRef = externalInputRef || internalRef;
  const [inputHeight, setInputHeight] = useState(undefined);

  // Sync local state when value prop changes from external sources
  useEffect(() => {
    setLocalValue(value || "");
    // Cancel any pending debounce so it doesn't overwrite the external value
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [value]);

  // Debounced function to call onChangeText
  const debouncedOnChangeText = useCallback(
    (val) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChangeText?.(val);
      }, debounceMs);
    },
    [onChangeText, debounceMs]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Compute dynamic height: be as thin as possible (1 line) and grow up to optional numberOfLines
  const baseLineHeight = (style && style.lineHeight) || 20;
  const minHeight = multiline ? baseLineHeight : undefined; // 1 line minimum
  const maxHeight =
    multiline && numberOfLines ? baseLineHeight * numberOfLines : undefined;

  const handleContentSizeChange = (e) => {
    // Let consumer receive the raw event first
    onContentSizeChange?.(e);

    if (!multiline) return;
    const nextHeight = e?.nativeEvent?.contentSize?.height;
    if (typeof nextHeight === "number" && nextHeight > 0) {
      // Clamp between min (1 line) and optional max (numberOfLines lines)
      const h = Math.max(minHeight || 0, Math.ceil(nextHeight));
      setInputHeight(maxHeight ? Math.min(h, maxHeight) : h);
    }
  };

  return (
    <TextInput
      ref={inputRef}
      value={localValue}
      onChangeText={(val) => {
        if (capitalize) {
          val = val.replace(/(^|[.!?]\s+|\n[-*]+\s*)([a-z])/g, (_, sep, char) => sep + char.toUpperCase());
        }
        setLocalValue(val);
        if (multiline && inputRef.current) {
          const node = inputRef.current;
          node.value = val;
          node.style.height = "0px";
          const scrollH = node.scrollHeight;
          const h = Math.max(minHeight || 0, Math.ceil(scrollH));
          const newH = maxHeight ? Math.min(h, maxHeight) : h;
          node.style.height = newH + "px";
          setInputHeight(newH);
        }
        debouncedOnChangeText(val);
      }}
      autoCapitalize={capitalize ? "sentences" : "none"}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      style={[
        style,
        multiline
          ? {
              height: inputHeight ?? minHeight,
              textAlignVertical: "top",
              outlineWidth: 0,
              outlineStyle: "none",
              borderWidth: 0,
            }
          : null,
      ]}
      multiline={multiline}
      // Do not pass numberOfLines down to avoid enforcing a fixed min-height;
      // we manage height via content size instead.
      autoFocus={autoFocus}
      editable={editable}
      onFocus={onFocus}
      onBlur={onBlur}
      onContentSizeChange={handleContentSizeChange}
      {...props}
    />
  );
};

export const Tooltip = ({
  text,
  children,
  position = "top",
  style = {},
  backgroundColor,
  color,
  alert,
  offsetX = 0,
  offsetY = 0,
  hideOnPress = false,
}) => {
  if (!text) return <View style={style}>{children}</View>;

  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>
        <View style={style} onMouseDown={hideOnPress ? () => {} : undefined}>
          {children}
        </View>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={position}
          sideOffset={6 + (position === "top" || position === "left" ? offsetY : -offsetY)}
          alignOffset={offsetX}
          collisionPadding={10}
          style={{ zIndex: 99999, pointerEvents: "none" }}
        >
          <View
            style={{
              backgroundColor: backgroundColor || (alert ? C.orange : "rgba(105,105,105,0.88)"),
              borderRadius: 6,
              paddingHorizontal: 9,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: color || "white", fontSize: 12, whiteSpace: "pre" }}>
              {text}
            </Text>
          </View>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};

export const Pressable_ = ({
  children,
  onPress,
  onDoublePress,
  onRightPress,
  tooltip = "",
  activeOpacity = 0.7,
  style = {},
}) => {
  const clickTimer = useRef(null);

  function handlePress(e) {
    if (onDoublePress) {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
        onDoublePress(e);
      } else {
        clickTimer.current = setTimeout(() => {
          clickTimer.current = null;
          if (onPress) onPress(e);
        }, 350);
      }
    } else {
      if (onPress) onPress(e);
    }
  }

  function handleContextMenu(e) {
    if (onRightPress) {
      e.preventDefault();
      onRightPress();
    }
  }

  return (
    <View onContextMenu={handleContextMenu} title={tooltip || undefined}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={activeOpacity}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
};

const StatusPickerRow = ({ status, idx, total, onPress, itemHeight = 40, itemTextStyle }) => {
  const [sHovered, _setHovered] = useState(false);
  return (
    <TouchableOpacity
      onPress={onPress}
      onMouseEnter={() => _setHovered(true)}
      onMouseLeave={() => _setHovered(false)}
      style={{
        height: itemHeight,
        justifyContent: "center",
        paddingHorizontal: 10,
        backgroundColor: status.backgroundColor || C.listItemWhite,
        borderBottomWidth: idx < total - 1 ? 1 : 0,
        borderBottomColor: "rgba(0,0,0,0.08)",
        opacity: sHovered ? 0.8 : 1,
      }}
    >
      <Text
        style={{
          color: status.textColor || C.text,
          fontSize: 13,
          fontWeight: "500",
          ...itemTextStyle,
        }}
        numberOfLines={1}
      >
        {status.label}
      </Text>
    </TouchableOpacity>
  );
};

/**
 * StatusPickerModal — reusable status selector with colored rows.
 * Opens a modal list of statuses, grows to fill viewport, scrolls overflow.
 * Uses fade-in / slide-out animation matching ScreenModal.
 *
 * Props:
 *   statuses       — array of status objects ({ id, label, backgroundColor, textColor })
 *   onSelect       — (statusObj) => void
 *   enabled        — boolean, default true
 *   buttonText     — string shown on the trigger button
 *   buttonStyle    — override trigger button style
 *   buttonTextStyle — override trigger button text style
 *   modalCoordX    — horizontal offset from button (default 0)
 *   modalCoordY    — vertical offset from button (default 30)
 */
export const StatusPickerModal = ({
  statuses = [],
  onSelect = () => {},
  enabled = true,
  buttonText = "+ Status",
  buttonStyle: buttonStyleProp = {},
  buttonTextStyle: buttonTextStyleProp = {},
  modalCoordX = 0,
  modalCoordY = 30,
  menuWidth,
  centered = false,
  itemHeight = 40,
  itemTextStyle,
}) => {
  const [sVisible, _setVisible] = useState(false);
  const [sLeft, _setLeft] = useState(0);
  const anchorRef = useRef(null);

  const MENU_WIDTH = menuWidth || 320;
  const VIEWPORT_PADDING = 10;

  const defaultButtonStyle = {
    backgroundColor: C.buttonLightGreen,
    borderColor: C.buttonLightGreenOutline,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  };

  const defaultTextStyle = {
    fontSize: 12,
    color: C.text,
    fontWeight: "500",
  };

  return (
    <>
      <TouchableOpacity
        ref={anchorRef}
        onPress={() => {
          if (!enabled) return;
          if (anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            let l = centered ? (window.innerWidth - MENU_WIDTH) / 2 : rect.left + modalCoordX;
            if (l + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING) l = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
            if (l < VIEWPORT_PADDING) l = VIEWPORT_PADDING;
            _setLeft(l);
          }
          _setVisible(v => !v);
        }}
        style={{ ...defaultButtonStyle, ...buttonStyleProp }}
      >
        <Text style={{ ...defaultTextStyle, ...buttonTextStyleProp }}>
          {buttonText}
        </Text>
      </TouchableOpacity>
      <Dialog_ visible={sVisible} onClose={() => _setVisible(false)} overlayColor="transparent">
        <View style={{
          position: "fixed",
          top: VIEWPORT_PADDING,
          bottom: VIEWPORT_PADDING,
          left: sLeft,
          width: MENU_WIDTH,
          borderRadius: 5,
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
        }}>
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
          >
            {statuses.map((status, idx) => (
              <StatusPickerRow
                key={status.id || idx}
                status={status}
                idx={idx}
                total={statuses.length}
                itemHeight={itemHeight}
                itemTextStyle={itemTextStyle}
                onPress={() => {
                  ReactDOM.flushSync(() => _setVisible(false));
                  onSelect(status);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </Dialog_>
    </>
  );
};

export const DepositModal = ({ visible, onClose, onPay, onCredit, inline, inlineStyle, customer }) => {
  const [sDepositType, _sSetDepositType] = useState(CUSTOMER_DEPOST_TYPES.deposit);
  const [sDepositAmount, _sSetDepositAmount] = useState("");
  const [sDepositAmountCents, _sSetDepositAmountCents] = useState(0);
  const [sDepositNote, _sSetDepositNote] = useState("");
  const [sSendSMS, _sSetSendSMS] = useState(false);
  const [sSendEmail, _sSetSendEmail] = useState(false);

  let isCredit = sDepositType === CUSTOMER_DEPOST_TYPES.credit;
  // let isGiftCard = sDepositType === CUSTOMER_DEPOST_TYPES.giftcard;
  let isGiftCard = false;
  let creditReady = isCredit && sDepositAmountCents >= 100 && sDepositNote.trim().length > 3;
  let depositReady = (!isCredit && !isGiftCard) && sDepositAmountCents > 0;
  // let giftCardReady = isGiftCard && sDepositAmountCents > 0;
  let giftCardReady = false;
  let hasPhone = !!(customer?.customerCell || customer?.cell);
  let hasEmail = !!customer?.email;
  let showSendReceipt = (isCredit /* || isGiftCard */) && (hasPhone || hasEmail);

  function resetAndClose() {
    _sSetDepositAmount("");
    _sSetDepositAmountCents(0);
    _sSetDepositNote("");
    _sSetDepositType(CUSTOMER_DEPOST_TYPES.deposit);
    _sSetSendSMS(false);
    _sSetSendEmail(false);
    onClose();
  }

  function handleCreditConfirm() {
    if (onCredit) {
      onCredit({
        amountCents: sDepositAmountCents,
        text: sDepositNote.trim(),
        sendSMS: sSendSMS,
        sendEmail: sSendEmail,
      });
    }
    resetAndClose();
  }

  if (!visible) return null;

  let innerCard = (
      <View
        style={{
          width: 350,
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          padding: 20,
          ...(inline ? { position: "absolute", zIndex: 200, ...inlineStyle } : {}),
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 14 }}>
          Add Deposit / Credit / Gift Card
        </Text>
        <View style={{ flexDirection: "row", marginBottom: 14 }}>
          <CheckBox_
            text="Deposit"
            isChecked={sDepositType === CUSTOMER_DEPOST_TYPES.deposit}
            onCheck={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.deposit)}
            textStyle={{ fontSize: 14 }}
            buttonStyle={{ marginRight: 20 }}
          />
          <CheckBox_
            text="Credit"
            isChecked={sDepositType === CUSTOMER_DEPOST_TYPES.credit}
            onCheck={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.credit)}
            textStyle={{ fontSize: 14 }}
            buttonStyle={{ marginRight: 20 }}
          />
          {/* <CheckBox_
            text="Gift Card"
            isChecked={sDepositType === CUSTOMER_DEPOST_TYPES.giftcard}
            onCheck={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.giftcard)}
            textStyle={{ fontSize: 14 }}
          /> */}
        </View>

      {isCredit && (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "rgb(255,248,230)",
          borderWidth: 1,
          borderColor: "rgb(230,190,80)",
          borderRadius: 7,
          padding: 10,
          marginBottom: 12,
        }}>
          <Text style={{ fontSize: 18, marginRight: 8 }}>!</Text>
          <Text style={{ fontSize: 12, color: "rgb(140,100,20)", flex: 1, lineHeight: 17 }}>
            Applying a credit will give a customer future free money
          </Text>
        </View>
      )}

        <View style={{ flexDirection: "row", alignItems: "center", borderColor: C.buttonLightGreenOutline, borderWidth: 1, borderRadius: 7, backgroundColor: C.listItemWhite, marginBottom: 10, paddingHorizontal: 10, height: 40 }}>
          <Text style={{ fontSize: 16, color: gray(0.4), marginRight: 4 }}>$</Text>
          <TextInput_
            placeholder="0.00"
            placeholderTextColor={gray(0.35)}
            value={sDepositAmount}
            onChangeText={(val) => {
              let result = usdTypeMask(val);
              _sSetDepositAmount(result.display);
              _sSetDepositAmountCents(result.cents);
            }}
            debounceMs={0}
            autoFocus={true}
            style={{
              flex: 1,
              fontSize: 16,
              outlineWidth: 0,
              outlineStyle: "none",
              borderWidth: 0,
              height: 38,
              color: C.text,
            }}
          />
        </View>
        <TextInput_
        placeholder={isCredit ? "Reason (required)" : "Note (optional)"}
          placeholderTextColor={gray(0.35)}
          value={sDepositNote}
          onChangeText={(val) => _sSetDepositNote(val.length === 1 ? val.toUpperCase() : val.charAt(0).toUpperCase() + val.slice(1))}
          debounceMs={0}
          multiline={true}
          numberOfLines={5}
          blurOnSubmit={false}
          style={{
            borderColor: isCredit && sDepositNote.trim().length === 0 ? C.orange : gray(0.08),
            borderWidth: 1,
            borderRadius: 7,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 14,
            lineHeight: 20,
            backgroundColor: C.listItemWhite,
            marginBottom: 18,
            color: C.text,
          }}
        />
        {showSendReceipt && (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: gray(0.45), fontWeight: "600", marginBottom: 6 }}>
              Send Receipt
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {hasPhone && (
                <CheckBox_
                  text="SMS"
                  isChecked={sSendSMS}
                  onCheck={() => _sSetSendSMS(!sSendSMS)}
                  textStyle={{ fontSize: 13 }}
                  buttonStyle={{ marginRight: 18 }}
                />
              )}
              {hasEmail && (
                <CheckBox_
                  text="Email"
                  isChecked={sSendEmail}
                  onCheck={() => _sSetSendEmail(!sSendEmail)}
                  textStyle={{ fontSize: 13 }}
                />
              )}
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Button_
            text="Cancel"
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
            buttonStyle={{ width: 90, height: 34, borderRadius: 5, marginRight: 10 }}
            onPress={resetAndClose}
          />
          <Button_
          text={isCredit ? "Apply Credit" : "Pay Amount"}
          colorGradientArr={isCredit ? COLOR_GRADIENTS.blue : isGiftCard ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
          enabled={isCredit ? creditReady : isGiftCard ? giftCardReady : depositReady}
          buttonStyle={{ width: 110, height: 34, borderRadius: 5, opacity: (isCredit ? creditReady : isGiftCard ? giftCardReady : depositReady) ? 1 : 0.4 }}
            onPress={() => {
              if (isCredit) {
                if (!creditReady) return;
                handleCreditConfirm();
              // } else if (isGiftCard) {
              //   if (!giftCardReady) return;
              //   onPay({
              //     type: sDepositType,
              //     amountCents: sDepositAmountCents,
              //     note: sDepositNote,
              //     sendSMS: sSendSMS,
              //     sendEmail: sSendEmail,
              //   });
              //   resetAndClose();
              } else {
                if (!depositReady) return;
                onPay({
                  type: sDepositType,
                  amountCents: sDepositAmountCents,
                  note: sDepositNote,
                });
                resetAndClose();
              }
            }}
          />
        </View>
      </View>
  );

  if (inline) return innerCard;

  return (
    <Dialog_ visible={true} onClose={resetAndClose} overlayColor="rgba(0,0,0,0.4)">
      {innerCard}
    </Dialog_>
  );
};

export const DepositsList = ({ deposits, credits, onDepositPress, onCreditPress }) => {
  let activeDeposits = (deposits || []).filter((d) => d.amountCents > 0);
  let activeCredits = (credits || []).filter((d) => d.amountCents > 0);
  let allItems = [
    ...activeDeposits.map((d) => ({ ...d, _type: "deposit" })),
    ...activeCredits.map((d) => ({ ...d, _type: "credit" })),
  ];
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.buttonLightGreenOutline, borderRadius: 10, padding: 10, backgroundColor: C.listItemWhite }}>
      <Text style={{ fontSize: 15, fontWeight: "600", marginBottom: 6, color: C.green }}>
        Deposits / Credits / Gift Cards
      </Text>
      {allItems.length === 0 && (
        <Text style={{ color: gray(0.4), fontSize: 12, textAlign: "center", marginTop: 4 }}>
          No deposits, credits, or gift cards on file
        </Text>
      )}
      {allItems.map((item) => {
        let isCredit = item._type === "credit";
        let isGiftCard = item.type === "giftcard";
        let badgeColor = isGiftCard ? C.orange : isCredit ? C.blue : C.green;
        let noteText = item.note || item.text || "";
        return (
          <TouchableOpacity_
            key={item.id}
            onPress={() => {
              let inUse = (item.reservedCents || 0) > 0;
              if (inUse) {
                let label = isGiftCard ? "gift card" : isCredit ? "credit" : "deposit";
                let actionWord = isCredit ? "make changes" : "issue refunds";
                useAlertScreenStore.getState().setValues({
                  title: "In Use",
                  message: "This " + label + " must be fully released from the sale to " + actionWord + ".",
                  btn1Text: "OK",
                  canExitOnOuterClick: true,
                });
                return;
              }
              isCredit ? onCreditPress?.(item) : onDepositPress?.(item);
            }}
            hoverOpacity={0.7}
            style={{
              marginBottom: 4,
              borderRadius: 7,
              borderLeftWidth: 4,
              borderLeftColor: badgeColor,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              backgroundColor: C.listItemWhite,
              paddingVertical: 6,
              paddingHorizontal: 10,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    backgroundColor: lightenRGBByPercent(badgeColor, 70),
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 8,
                    marginRight: 6,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "600", color: badgeColor }}>
                    {isGiftCard ? "Gift Card" : isCredit ? "Credit" : "Deposit"}
                  </Text>
                </View>
                {!!noteText && (
                  <Text numberOfLines={1} style={{ fontSize: 11, color: gray(0.5), flex: 1 }}>
                    {noteText}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 12, color: gray(0.4), marginTop: 2 }}>
                {formatMillisForDisplay(item.millis)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                {"$" + formatCurrencyDisp(item.amountCents)}
              </Text>
              {(item.reservedCents || 0) > 0 && (
                <Text style={{ fontSize: 10, color: C.orange, fontWeight: "600", marginTop: 1 }}>
                  In use: {"$" + formatCurrencyDisp(item.reservedCents)}
                </Text>
              )}
              {(item.reservedCents || 0) > 0 && item.amountCents > item.reservedCents && (
                <Text style={{ fontSize: 10, color: C.green, fontWeight: "600", marginTop: 1 }}>
                  Available: {"$" + formatCurrencyDisp(item.amountCents - item.reservedCents)}
                </Text>
              )}
            </View>
          </TouchableOpacity_>
        );
      })}
    </View>
  );
};

// ─── WebPageModal ──────────────────────────────────────────────
export const WebPageModal = ({
  url,
  title = "Web Page",
  subtitle = "",
  buttonLabel = "Open",
  buttonStyle = {},
  buttonTextStyle = {},
}) => {
  const [sVisible, _setVisible] = useState(false);
  return (
    <ScreenModal
      showOuterModal={true}
      modalVisible={sVisible}
      handleOuterClick={() => _setVisible(false)}
      buttonLabel={buttonLabel}
      buttonStyle={{ backgroundColor: C.green, borderRadius: 6, paddingHorizontal: 8, ...buttonStyle }}
      buttonTextStyle={{ fontSize: 12, color: "white", fontWeight: "600", ...buttonTextStyle }}
      handleButtonPress={() => _setVisible(true)}
      Component={() => (
        <View style={{ width: "80vw", height: "85vh", backgroundColor: C.backgroundWhite, borderRadius: 12, overflow: "hidden", flexDirection: "column" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 15, paddingVertical: 10, backgroundColor: C.green }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", flex: 1, marginLeft: 10 }} numberOfLines={1}>{subtitle}</Text> : null}
            <TouchableOpacity onPress={() => _setVisible(false)} style={{ width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "white" }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: 10 }}>
            <iframe
              src={url}
              style={{ width: "100%", height: "100%", border: "none", borderRadius: 6 }}
              title={title}
            />
          </View>
        </View>
      )}
    />
  );
};

// Note Helper Dropdown ////////////////////////////////////////////////////

export const NoteHelperDropdown = ({
  visible,
  onClose,
  workorderLine,
  onUpdateLine,
  anchorPosition = { x: 0, y: 0 },
  anchorX,
  anchorY,
  noteHelpers = [],
  noteHelpersTarget = "intakeNotes",
  centered = false,
  fontSizeAdj = 0,
  chipPaddingVertAdj = 0,
}) => {
  const [sTarget, _sSetTarget] = useState(noteHelpersTarget);
  const [sClickedMap, _sSetClickedMap] = useState({});
  const openTimeRef = useRef(0);
  const wasVisibleRef = useRef(false);
  const prevVisibleRef = useRef(visible);

  if (visible && !prevVisibleRef.current) {
    wasVisibleRef.current = true;
    openTimeRef.current = Date.now();
  }
  if (!visible && prevVisibleRef.current) {
    wasVisibleRef.current = false;
  }
  prevVisibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      _sSetTarget(noteHelpersTarget);
      _sSetClickedMap({});
    }
  }, [visible]);

  if (!visible) return null;

  function getInsertText(item) {
    if (typeof item === "string") return item;
    return (item.text || item.buttonLabel || "").trim();
  }

  function getDisplayLabel(item) {
    if (typeof item === "string") return item;
    return item.buttonLabel || "";
  }

  function isChipActive(catId, item) {
    const insertText = getInsertText(item);
    const notes = workorderLine[sTarget] || "";
    const parts = notes.split(", ").map((s) => s.trim()).filter(Boolean);
    if (!parts.includes(insertText)) return false;
    const trackedCat = sClickedMap[sTarget + "|" + insertText];
    if (trackedCat !== undefined) return trackedCat === catId;
    return true;
  }

  function toggleChip(item, targetOverride, catId) {
    const target = targetOverride || sTarget;
    const insertText = getInsertText(item);
    const notes = workorderLine[target] || "";
    const parts = notes.split(", ").map((s) => s.trim()).filter(Boolean);
    const key = target + "|" + insertText;
    const idx = parts.indexOf(insertText);
    if (idx !== -1) {
      parts.splice(idx, 1);
      _sSetClickedMap((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      parts.push(insertText);
      _sSetClickedMap((prev) => ({ ...prev, [key]: catId }));
    }
    onUpdateLine({ ...workorderLine, [target]: parts.join(", ") });
  }

  const filteredHelpers = noteHelpers.filter(cat => cat[sTarget] === true);

  const dropdownWidth = 580;
  const margin = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const clickX = anchorX ?? anchorPosition?.x ?? 0;
  const clickY = anchorY ?? anchorPosition?.y ?? 0;
  let left = centered ? (vw - dropdownWidth) / 2 : clickX + 8;
  if (left + dropdownWidth > vw - margin) left = vw - dropdownWidth - margin;
  if (left < margin) left = margin;
  let top = clickY + 5;
  if (top + 400 > vh - margin) top = vh - 400 - margin;
  if (top < margin) top = margin;

  return ReactDOM.createPortal(
    <div
      onClick={() => { if (Date.now() - openTimeRef.current > 150) onClose(); }}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 9000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top, left }}>
      <View
        style={{
          width: dropdownWidth,
          maxHeight: vh - top - margin,
          backgroundColor: "white",
              borderRadius: 10,
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 5,
              padding: 10,
            }}
          >
              {/* Item header */}
              <View style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: C.buttonLightGreenOutline,
              }}>
                <Text style={{ fontSize: 13 + fontSizeAdj, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 6 }} numberOfLines={1}>
                  {workorderLine.inventoryItem?.informalName || workorderLine.inventoryItem?.formalName || "Item"}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: gray(0.5), fontStyle: "italic", marginRight: 7 }}>Adding to:</Text>
                  <TouchableOpacity_
                    onPress={() => _sSetTarget("intakeNotes")}
                    hoverOpacity={0.7}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: sTarget === "intakeNotes" ? "orange" : gray(0.08),
                    }}
                  >
                    <Text style={{ fontSize: 12 + fontSizeAdj, fontWeight: "600", color: sTarget === "intakeNotes" ? C.textWhite : gray(0.5) }}>Intake</Text>
                  </TouchableOpacity_>
                  <TouchableOpacity_
                    onPress={() => _sSetTarget("receiptNotes")}
                    hoverOpacity={0.7}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: sTarget === "receiptNotes" ? "green" : gray(0.08),
                    }}
                  >
                    <Text style={{ fontSize: 12 + fontSizeAdj, fontWeight: "600", color: sTarget === "receiptNotes" ? C.textWhite : gray(0.5) }}>Receipt</Text>
                  </TouchableOpacity_>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  {filteredHelpers.filter((_, i) => i % 2 === 0).map((category) => (
                    <View key={category.id} style={{ marginBottom: 19 }}>
                      <Text
                        style={{
                          fontSize: 14 + fontSizeAdj,
                          fontWeight: Fonts.weight.textHeavy,
                          color: gray(0.4),
                          marginBottom: 4,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {category.label}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                        {(category.items || []).map((item, chipIdx) => {
                          const active = isChipActive(category.id, item);
                          const label = getDisplayLabel(item);
                          return (
                            <TouchableOpacity_
                              key={(item.id || label) + chipIdx}
                              onPress={() => toggleChip(item, null, category.id)}
                              hoverOpacity={0.6}
                              style={{
                                backgroundColor: active
                                  ? lightenRGBByPercent(C.red, 70)
                                  : C.buttonLightGreenOutline,
                                borderRadius: 6,
                                paddingHorizontal: 10,
                                paddingVertical: 5 + chipPaddingVertAdj,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 15 + fontSizeAdj,
                                  color: active ? C.red : gray(0.5),
                                  fontWeight: Fonts.weight.textRegular,
                                }}
                              >
                                {label}
                              </Text>
                            </TouchableOpacity_>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
                <View style={{ width: 1, backgroundColor: C.buttonLightGreenOutline, alignSelf: "stretch" }} />
                <View style={{ flex: 1, paddingLeft: 14 }}>
                  {filteredHelpers.filter((_, i) => i % 2 === 1).map((category) => (
                    <View key={category.id} style={{ marginBottom: 19 }}>
                        <Text
                          style={{
                            fontSize: 14 + fontSizeAdj,
                            fontWeight: Fonts.weight.textHeavy,
                            color: gray(0.4),
                            marginBottom: 4,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {category.label}
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                          {(category.items || []).map((item, chipIdx) => {
                            const active = isChipActive(category.id, item);
                            const label = getDisplayLabel(item);
                            return (
                              <TouchableOpacity_
                                key={(item.id || label) + chipIdx}
                                onPress={() => toggleChip(item, null, category.id)}
                                hoverOpacity={0.6}
                                style={{
                                  backgroundColor: active
                                    ? lightenRGBByPercent(C.red, 70)
                                    : C.buttonLightGreenOutline,
                                  borderRadius: 6,
                                  paddingHorizontal: 10,
                                  paddingVertical: 5 + chipPaddingVertAdj,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 15 + fontSizeAdj,
                                    color: active ? C.red : gray(0.5),
                                    fontWeight: Fonts.weight.textRegular,
                                  }}
                                >
                                  {label}
                                </Text>
                              </TouchableOpacity_>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                </View>
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: C.buttonLightGreenOutline,
                  marginTop: 4,
                  paddingTop: 8,
                }}
              >
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 11 + fontSizeAdj, color: gray(0.4), fontWeight: Fonts.weight.textHeavy, textTransform: "uppercase", marginBottom: 2 }}>Intake notes</Text>
                  <TextInput_
                    multiline
                    numberOfLines={0}
                    debounceMs={500}
                    capitalize={true}
                    value={workorderLine.intakeNotes || ""}
                    onChangeText={(text) => onUpdateLine({ ...workorderLine, intakeNotes: text })}
                    placeholder="Intake notes"
                    placeholderTextColor={gray(0.35)}
                    style={{
                      width: "100%",
                      minHeight: 32 + fontSizeAdj,
                      borderWidth: 1,
                      borderColor: gray(0.25),
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      fontSize: 15 + fontSizeAdj,
                      color: "orange",
                      outlineWidth: 0,
                      outline: "none",
                      overflow: "hidden",
                      backgroundColor: "white",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ fontSize: 11 + fontSizeAdj, color: gray(0.4), fontWeight: Fonts.weight.textHeavy, textTransform: "uppercase", marginBottom: 2 }}>Receipt notes</Text>
                  <TextInput_
                    multiline
                    numberOfLines={0}
                    debounceMs={500}
                    capitalize={true}
                    value={workorderLine.receiptNotes || ""}
                    onChangeText={(text) => onUpdateLine({ ...workorderLine, receiptNotes: text })}
                    placeholder="Receipt notes"
                    placeholderTextColor={gray(0.35)}
                    style={{
                      width: "100%",
                      minHeight: 32 + fontSizeAdj,
                      borderWidth: 1,
                      borderColor: gray(0.25),
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      fontSize: 15 + fontSizeAdj,
                      color: "green",
                      outlineWidth: 0,
                      outline: "none",
                      overflow: "hidden",
                      backgroundColor: "white",
                    }}
                  />
                </View>
              </View>
          </View>
      </div>
    </div>,
    document.body
  );
};

// Customer Quick Notes Dropdown ////////////////////////////////////////////

export const CustomerQuickNotesDropdown = ({
  visible,
  onClose,
  quickNotes = [],
  onToggleChip,
  activeChips = [],
  anchorPosition,
}) => {
  const dropdownWidth = 340;
  const maxHeight = 400;
  let left, top;
  if (typeof window !== "undefined" && anchorPosition) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    left = anchorPosition.x;
    top = anchorPosition.y;
    if (left + dropdownWidth > vw - 10) left = vw - dropdownWidth - 10;
    if (top + maxHeight > vh - 10) top = vh - maxHeight - 10;
    if (left < 10) left = 10;
    if (top < 10) top = 10;
  }

  return (
    <Dialog_ visible={visible} onClose={onClose} overlayColor="transparent"
      contentStyle={anchorPosition ? { justifyContent: "flex-start", alignItems: "flex-start" } : {}}
    >
      <View
        style={{
          width: dropdownWidth,
          maxHeight: maxHeight,
          backgroundColor: "white",
          borderRadius: 10,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 5,
          padding: 10,
          overflow: "auto",
          ...(anchorPosition ? { marginLeft: left, marginTop: top } : {}),
        }}
      >
        <View style={{
          marginBottom: 8,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: C.buttonLightGreenOutline,
        }}>
          <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
            Customer Quick Notes
          </Text>
        </View>

        {quickNotes.map((category) => (
          <View key={category.id} style={{ marginBottom: 9 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: Fonts.weight.textHeavy,
                color: gray(0.4),
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {category.label}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
              {(category.items || []).map((item, chipIdx) => {
                const active = activeChips.includes(item.id);
                return (
                  <TouchableOpacity_
                    key={item.id || chipIdx}
                    onPress={() => onToggleChip(item)}
                    hoverOpacity={0.6}
                    style={{
                      backgroundColor: active
                        ? lightenRGBByPercent(C.red, 70)
                        : C.buttonLightGreenOutline,
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: active ? C.red : gray(0.5),
                        fontWeight: Fonts.weight.textRegular,
                      }}
                    >
                      {item.buttonLabel}
                    </Text>
                  </TouchableOpacity_>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Dialog_>
  );
};

// Export ProtectedRoute for routing
export { ProtectedRoute } from "./components/ProtectedRoute";
