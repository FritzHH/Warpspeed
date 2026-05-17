import { dim, getRgbFromNamedColor, lightenRGBByPercent, gray } from "./utils";
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

export const C = {
  green: "rgb(33, 148, 86)",
  purple: "",
  orange: "rgb(230, 126, 34)",
  blue: "rgb(53, 135, 210)",
  lightred: "rgb(227, 116, 112)",
  cursorRed: "#ff6b6b",
  red: lightenRGBByPercent(getRgbFromNamedColor("red"), 10),

  backgroundWhite: lightenRGBByPercent("rgb(240, 241, 251)", 45),
  backgroundGreen: "rgb(232, 243, 239)",
  backgroundListWhite: "rgb(251, 251, 254)",

  listItemWhite: "rgb(254, 254, 255)",
  listItemBorder: gray(0.05),

  buttonLightGreen: "rgb(232, 239, 245)",
  buttonLightGreenOutline: "rgb(200, 228, 220)",

  darkBlue: "rgb(30, 80, 140)",
  text: lightenRGBByPercent("rgb(0,0,0)", 28),
  lightText: gray(0.42),
  textWhite: "rgb(255, 255, 255)",
};

export const COLOR_GRADIENTS = {
  red: [lightenRGBByPercent(C.red, 41), lightenRGBByPercent(C.red, 20)],
  green: [lightenRGBByPercent(C.green, 28), lightenRGBByPercent(C.green, 10)],
  bluegreen: [
    lightenRGBByPercent(C.blue, 28),
    lightenRGBByPercent(C.green, 10),
  ],
  greenblue: [
    lightenRGBByPercent(C.green, 28),
    lightenRGBByPercent(C.blue, 10),
  ],
  purple: ["rgb(103, 124, 231)", "rgb(115, 83, 173)"],
  blue: [lightenRGBByPercent(C.blue, 15), lightenRGBByPercent(C.blue, 0)],
  lightBlue: [lightenRGBByPercent(C.blue, 60), lightenRGBByPercent(C.blue, 45)],
  grey: [gray(0.35), gray(0.45)],
  yellow: [lightenRGBByPercent(C.orange, 35), lightenRGBByPercent(C.orange, 15)],
};

const assetModules = import.meta.glob('./assets/*.{png,jpg,jpeg,gif,svg}', { eager: true, import: 'default' });
const gifModules = import.meta.glob('./assets/gifs/*.{gif,png}', { eager: true, import: 'default' });
const asset = (name) => assetModules[`./assets/${name}`];
const gif = (name) => gifModules[`./assets/gifs/${name}`];

export const ICONS = {
  workorder: asset("workorder.png"),
  receipt: asset("receipt.png"),
  bicycle: asset("bicycle.png"),
  wheelGIF: gif("wheelGIF.gif"),
  greenDollar: asset("bank.png"),
  creditCard: asset("credit-card.png"),
  dollarYellow: asset("dollar.png"),
  rightArrowBlue: asset("right-arrow.png"),
  expandGreen: asset("expandGreen.png"),
  expandYellow: asset("expandYellow.png"),
  greenLeftArrow: asset("greenLeftArrow.png"),
  greenRightArrow: asset("greenRightArrow.png"),
  blocked: asset("blocked.png"),
  unblock: asset("unblock.png"),
  forward: asset("forward.png"),
  blockNotif: asset("block-notif.png"),
  allowNotif: asset("allow-notif.png"),
  microphone: asset("microphone.png"),
  stopRecord: asset("stop.png"),
  colorWheel: asset("colorWheel.png"),
  tools1: asset("tools1.png"),
  upArrowOrange: asset("up_arrow_orange.png"),
  downArrowOrange: asset("down_arrow_orange.png"),
  downArrow: asset("down-arrow.png"),
  upRightArrow: asset("up-right-arrow.png"),
  clickHere: asset("clickHere.png"),
  importIcon: asset("in.png"),
  exportIcon: asset("out.png"),
  editPencil: asset("edit_pencil.png"),
  close1: asset("close1.png"),
  check1: asset("check1.png"),
  check: asset("check.png"),
  shoppingCart: asset("shopping_cart.png"),
  minus: asset("minus.png"),
  asterisk: asset("asterisk.png"),
  new: asset("new.png"),
  add: asset("plus.png"),
  addRound: asset("add_round.png"),
  cellPhone: asset("cell.png"),
  maximize: asset("maximize.png"),
  home: asset("home.png"),
  reset1: asset("reset.png"),
  gears1: asset("gears1.png"),
  notes: asset("notes.png"),
  ridingBike: asset("riding_bike.png"),
  menu1: asset("menu1.png"),
  menu2: asset("menu-button.png"),
  checkbox: asset("checkbox.png"),
  checkoxEmpty: asset("checkbox-empty.png"),
  search: asset("search.png"),
  info: asset("info.png"),
  info2: asset("info2.png"),
  settings: asset("settings.png"),
  infoGear: asset("info-gear.png"),
  internetOnlineGIF: gif("internetOnlineGIF.gif"),
  internetOfflineGIF: gif("internedDisconnectedGIF.gif"),
  cashRegister: asset("cashRegister.png"),
  openCashRegister: asset("openCashRegister.png"),
  camera: asset("camera.png"),
  uploadCamera: asset("uploadCamera.png"),
  viewPhoto: asset("viewPhoto.png"),
  wifi: gif("wifi.gif"),
  restricted: asset("restricted.png"),
  redx: asset("redx.png"),
  listGif: gif("list.gif"),
  clockGif: gif("clock.gif"),
  clock: asset("clock.png"),
  questionMark: asset("questionMark.png"),
  cancelGif: gif("cancel.gif"),
  paperPlane: asset("paperPlane.png"),
  eyeballs: asset("eyeballs.png"),
  upChevron: asset("up-chevron.png"),
  downChevron: asset("down-chevron.png"),
  caretLeft: asset("caret-left.png"),
  caretRight: asset("caret-right.png"),
  trash: asset("trash.png"),
  archive: asset("archive.png"),
  axe: asset("axe.png"),
  backRed: asset("backRed.png"),
  quickItemButton: asset("quickItemButton.png"),
  userControl: asset("userControl.png"),
  paymentProcessing: asset("paymentProcessing.png"),
  workorderStatuses: asset("workorderStatuses.png"),
  listsAndOptions: asset("listsAndOptions.png"),
  storeInfo: asset("storeInfo.png"),
  ordering: asset("ordering.png"),
  letterW: asset("w-letter.png"),
  letterI: asset("letter-i.png"),
  letterR: asset("letter-r.png"),
  airplane: asset("airplane.png"),
  popperCelebration: gif("popperCelebration.gif"),
  guyCelebrating: gif("guyCelebrating.gif"),
  display: asset("display.png"),
  thoughtBubble: asset("thoughtBubble.png"),
  print: asset("print.png"),
  variable: asset("variable.png"),
  person: asset("person.png"),
  map: asset("map.png"),
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
