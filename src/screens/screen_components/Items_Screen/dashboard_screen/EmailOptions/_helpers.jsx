import React from "react";
import { Button } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";


export const MAX_EMAIL_ACCOUNTS = 5;

export const MAX_SIG_IMAGE_WIDTH = 300;
export const MAX_SIG_IMAGE_HEIGHT = 300;

export const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Garamond",
  "Palatino",
];

export const FONT_WEIGHTS = [
  { label: "Light", value: "300" },
  { label: "Regular", value: "400" },
  { label: "Medium", value: "500" },
  { label: "Semi-Bold", value: "600" },
  { label: "Bold", value: "700" },
];

export const GREETING_VARIABLES = [
  { label: "Store Logo", variable: "{storeLogo}" },
];

export const FOOTER_VARIABLES = [
  { label: "Store Logo", variable: "{storeLogo}" },
  { label: "Hours", variable: "{storeHours}" },
  { label: "Support Email", variable: "{supportEmail}" },
  { label: "Phone", variable: "{storePhone}" },
];

export const MESSAGE_VARIABLES = [
  { label: "First Name", variable: "{firstName}" },
  { label: "Last Name", variable: "{lastName}" },
  { label: "Brand", variable: "{brand}" },
  { label: "Brands", variable: "{brands}" },
  { label: "Total Amount", variable: "{totalAmount}" },
];

export const TEMPLATE_EMOJIS = [
  { id: "🎉", label: "🎉  Party" },
  { id: "✅", label: "✅  Checkmark" },
  { id: "🔧", label: "🔧  Wrench" },
  { id: "🛠️", label: "🛠️  Tools" },
  { id: "⚙️", label: "⚙️  Gear" },
  { id: "🔩", label: "🔩  Bolt" },
  { id: "🚲", label: "🚲  Bicycle" },
  { id: "🚴", label: "🚴  Cyclist" },
  { id: "💰", label: "💰  Money Bag" },
  { id: "💳", label: "💳  Credit Card" },
  { id: "🧾", label: "🧾  Receipt" },
  { id: "🏷️", label: "🏷️  Price Tag" },
  { id: "🛒", label: "🛒  Cart" },
  { id: "🎁", label: "🎁  Gift" },
  { id: "📋", label: "📋  Clipboard" },
  { id: "📝", label: "📝  Memo" },
  { id: "📱", label: "📱  Phone" },
  { id: "📧", label: "📧  Email" },
  { id: "🔔", label: "🔔  Bell" },
  { id: "⭐", label: "⭐  Star" },
  { id: "🌟", label: "🌟  Glowing Star" },
  { id: "❤️", label: "❤️  Heart" },
  { id: "👋", label: "👋  Wave" },
  { id: "👍", label: "👍  Thumbs Up" },
  { id: "🙏", label: "🙏  Thank You" },
  { id: "😊", label: "😊  Smile" },
  { id: "🤝", label: "🤝  Handshake" },
  { id: "💪", label: "💪  Strong" },
  { id: "🏆", label: "🏆  Trophy" },
  { id: "🔥", label: "🔥  Fire" },
];

export function BoxContainerOuter({ style = {}, children }) {
  return (
    <div
      style={{
        width: "97%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function BoxContainerInner({ style = {}, children }) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
        borderRadius: 10,
        padding: 15,
        boxSizing: "border-box",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function BoxButton1({
  label,
  style = {},
  icon,
  iconSize,
  textStyle,
  onPress,
  colorGradientArr,
}) {
  return (
    <Button
      colorGradientArr={colorGradientArr}
      text={label}
      icon={icon || ICONS.add}
      iconSize={iconSize || 30}
      textStyle={{ fontSize: 14, color: C.textSecondary, ...textStyle }}
      buttonStyle={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderRadius: 5,
        backgroundColor: C.surfaceAlt,
        marginBottom: 0,
        ...style,
      }}
      onPress={onPress}
    />
  );
}
