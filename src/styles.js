import { dim, lightenRGBByPercent } from "./utils";
// const { getDefaultConfig } = require("metro"); // Or require('metro-config') for bare React Native

export const Colors = {
  // mainBackground: "white",
  mainBackground: "rgb(61, 180, 231)",

  // secondBackground: "rgb(68,143,164)",
  secondBackground: "white",

  opacityBackgoundDark: "rgb(63, 118, 141)",
  // opacityBackgoundDark: "white",

  // opacityBackgroundLight: "rgb(74, 133, 159)",
  opacityBackgroundLight: "rgb(140, 206, 235)",

  listElementBackground: "rgb(236, 230, 234)",
  listElementPlaceholder: "rgb(127, 128, 138)",
  listElementText: "rgb(50, 65, 88)",
  // tabMenuButton: "rgb(96, 89, 212)",
  tabMenuButton: "rgb(111, 105, 216)",
  tabMenuButtonText: "white",
  buttonDarkBackground: "rgb(40, 38, 38)",
  buttonDarkFont: "rgb(237,238,196)",
  blueButtonBackground: "#3498db",
  blueButtonText: "white",
  darkText: "rgb(20, 20, 20)",
  lightText: "rgb(60, 60, 60)",
  lightTextOnMainBackground: "rgb(170, 210, 200)",
  darkTextOnMainBackground: "rgb(30, 30, 30)",
};

export const APP_BASE_COLORS = {
  green: "rgb(33, 148, 86)",
  purple: "",
  orange: "",
  blue: "rgb(53, 135, 210)",
  lightred: "rgb(227, 116, 112)",

  backgroundWhite: "rgb(240, 241, 251)",
  backgroundGreen: "rgb(232, 243, 239)",
  backgroundListWhite: "rgb(251, 251, 254)",

  listItemWhite: "rgb(254, 254, 255)",

  buttonLightGreen: "rgb(232, 239, 245)",
  buttonLightGreenOutline: "rgb(200, 228, 220)",

  textMain: "rgb(45, 55, 72)",
  textWhite: "rgb(255, 255, 255)",
};

export const COLOR_GRADIENTS = {
  green: ["rgb(71,185,119)", APP_BASE_COLORS.green],
  purple: ["rgb(103, 124, 231)", "rgb(115, 83, 173)"],
  blue: [lightenRGBByPercent(APP_BASE_COLORS.blue, 20), APP_BASE_COLORS.blue],
};

export const COLOR_GRADIENT_PROFILES = {
  standard: {
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
};

export const BUTTON_VARS = {
  radius: {
    rounded: 15,
    squared: 8,
  },
};

const ASSETS_PATH = "./assets/";
export const ICONS = {
  tools1: require(ASSETS_PATH + "tools1.png"),
  upArrowOrange: require(ASSETS_PATH + "up_arrow_orange.png"),
  editPencil: require(ASSETS_PATH + "edit_pencil.png"),
  close1: require(ASSETS_PATH + "close1.png"),
  check1: require(ASSETS_PATH + "check1.png"),
  check: require(ASSETS_PATH + "check.png"),
  shoppingCart: require(ASSETS_PATH + "shopping_cart.png"),
  new: require(ASSETS_PATH + "new.png"),
  add: require(ASSETS_PATH + "add.png"),
  cashBag: require(ASSETS_PATH + "cash.png"),
  cashHand: require(ASSETS_PATH + "cashHand.png"),
  cashRed: require(ASSETS_PATH + "cashRed.png"),
  cellPhone: require(ASSETS_PATH + "cell.png"),
  home: require(ASSETS_PATH + "home.png"),
  reset1: require(ASSETS_PATH + "reset.png"),
  gears1: require(ASSETS_PATH + "gears1.png"),
  notes: require(ASSETS_PATH + "notes.png"),
  ridingBike: require(ASSETS_PATH + "riding_bike.png"),
  menu1: require(ASSETS_PATH + "menu1.png"),
  menu2: require(ASSETS_PATH + "menu-button.png"),
  checkbox: require(ASSETS_PATH + "checkbox.png"),
  checkoxEmpty: require(ASSETS_PATH + "checkbox-empty.png"),
  search: require(ASSETS_PATH + "search.png"),
  logo: require(ASSETS_PATH + "logo_highres.png"),
  info: require(ASSETS_PATH + "info.png"),
  infoSquare: require(ASSETS_PATH + "info-square.png"),
  settings: require(ASSETS_PATH + "settings.png"),
  infoGear: require(ASSETS_PATH + "info-gear.png"),
  internetOnlineGIF: require(ASSETS_PATH + "internetOnlineGIF.gif"),
  internetOfflineGIF: require(ASSETS_PATH + "internedDisconnectedGIF.gif"),
  approvedButton: require(ASSETS_PATH + "approvedButton.png"),
  acceptButton: require(ASSETS_PATH + "acceptButton.png"),
  cancelButton: require(ASSETS_PATH + "cancelButton.png"),
  moneySack: require(ASSETS_PATH + "moneySack.png"),
  cashRegister: require(ASSETS_PATH + "cashRegister.png"),
  camera: require(ASSETS_PATH + "camera.png"),
  wifi: require(ASSETS_PATH + "wifi.gif"),
  restricted: require(ASSETS_PATH + "restricted.png"),
  redx: require(ASSETS_PATH + "redx.png"),
  listGif: require(ASSETS_PATH + "list.gif"),
  clockGif: require(ASSETS_PATH + "clock.gif"),
  cancelGif: require(ASSETS_PATH + "cancel.gif"),
  paperPlane: require(ASSETS_PATH + "paperPlane.png"),
  eyeballs: require(ASSETS_PATH + "eyeballs.png"),
};

// rgb(64, 174, 113)
export const Fonts = {
  colors: {},
  weight: {
    textRegular: "400",
    textHeavy: "600",
    textSuperheavy: "800",
  },
  style: {},
};

export const ViewStyles = {
  fullScreen: {
    width: dim.windowWidth,
    height: dim.windowHeight * 1,
    backgroundColor: Colors.mainBackground,
    padding: 5,
  },
};

export const ButtonStyles = {
  darkSquare: {
    backgroundColor: Colors.buttonDarkBackground,
    fontColor: Colors.buttonDarkFont,
  },
};
