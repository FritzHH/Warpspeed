import { create } from "zustand";
import { INVENTORY_ITEM_PROTO } from "./data";
import { log } from "./utils";

export const useInvModalStore = create((set, get) => ({
  currentFocusName: null,
  item: { ...INVENTORY_ITEM_PROTO },
  setFocus: (focusName) => {
    // log("setting focus", focusName);
    set((state) => ({
      currentFocusName: focusName,
    }));
  },
  setItem: (item) => {
    log("setting item in zStore", item);
    set((state) => ({ item: { ...item } }));
  },
  getItem: () => {
    let val = get().item;
    // log("getting item", val);
    return val;
  },
  getFocus: () => {
    let focusName = get().currentFocusName;
    // log("getting focus", focusName);
    return focusName;
  },
  reset: () => {
    set(() => ({
      currentFocusName: null,
      item: INVENTORY_ITEM_PROTO,
    }));
  },
}));
