import { dim } from "./utils";

export const Colors = {
  mainBackground: "rgb(10,109,152)",
  secondBackground: "rgb(68,143,164)",
  opacityBackgoundDark: "rgb(63, 118, 141)",
  opacityBackgroundLight: "rgb(74, 133, 159)",
  listElementBackground: "rgb(236, 230, 234)",
  listElementPlaceholder: "rgb(127, 128, 138)",
  listElementText: "rgb(50, 65, 88)",
  tabMenuButton: "rgb(96, 89, 212)",
  tabMenuButtonText: "white",
  buttonDarkBackground: "rgb(40, 38, 38)",
  buttonDarkFont: "rgb(237,238,196)",
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
