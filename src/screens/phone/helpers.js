import { C } from "../../styles";
import { calculateWaitEstimateLabel } from "../../utils";
import { useSettingsStore, useLoginStore } from "../../stores";

const NUM_MILLIS_IN_DAY = 86400000;

export const MONTH_LABELS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAY_LABELS_SHORT = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];

export function sortWorkorders(inputArr) {
  let finalArr = [];
  const statuses = useSettingsStore.getState().settings?.statuses || [];
  statuses.forEach((status) => {
    let arr = [];
    inputArr.forEach((wo) => {
      if (wo.status === status.id) arr.push(wo);
    });
    arr.sort((a, b) => {
      let aHasWait = !!(a.waitTime?.maxWaitTimeDays != null && a.startedOnMillis);
      let bHasWait = !!(b.waitTime?.maxWaitTimeDays != null && b.startedOnMillis);
      if (!aHasWait && bHasWait) return -1;
      if (aHasWait && !bHasWait) return 1;
      if (!aHasWait && !bHasWait) return 0;
      let aDue = a.startedOnMillis + a.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      let bDue = b.startedOnMillis + b.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      return aDue - bDue;
    });
    finalArr = [...finalArr, ...arr];
  });

  const currentUser = useLoginStore.getState().getCurrentUser();
  const userStatusIDs = currentUser?.statuses || [];
  if (userStatusIDs.length > 0) {
    finalArr.sort((a, b) => {
      let aMatch = userStatusIDs.includes(a.status);
      let bMatch = userStatusIDs.includes(b.status);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  finalArr.sort((a, b) => {
    const aIsToday = (a.status === "pickup" || a.status === "delivery") &&
      Number(a.pickupDelivery?.month) === todayMonth &&
      Number(a.pickupDelivery?.day) === todayDay;
    const bIsToday = (b.status === "pickup" || b.status === "delivery") &&
      Number(b.pickupDelivery?.month) === todayMonth &&
      Number(b.pickupDelivery?.day) === todayDay;
    if (aIsToday && !bIsToday) return -1;
    if (!aIsToday && bIsToday) return 1;
    if (aIsToday && bIsToday) {
      if (a.status === "pickup" && b.status === "delivery") return -1;
      if (a.status === "delivery" && b.status === "pickup") return 1;
      return (a.pickupDelivery?.startTime || "").localeCompare(b.pickupDelivery?.startTime || "");
    }
    return 0;
  });

  return finalArr;
}

export function formatPickupDeliveryTime(time) {
  if (!time) return "";
  let [h, m] = time.split(":");
  h = Number(h);
  let suffix = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + (m && m !== "00" ? ":" + m : "") + suffix;
}

export function computeWaitInfo(workorder) {
  let label = calculateWaitEstimateLabel(workorder, useSettingsStore.getState().getSettings());
  let result = { waitEndDay: "", textColor: C.text, isMissing: false, isItalic: false };

  if (!label) return result;

  if (label === "Missing estimate") {
    result.isMissing = true;
    return result;
  }

  if (label === "No estimate") {
    result.waitEndDay = label;
    return result;
  }

  let lowerLabel = label.toLowerCase();

  if (workorder.status === "finished") {
    result.textColor = C.textMuted;
  } else if (lowerLabel === "waiting" || lowerLabel === "today") {
    result.waitEndDay = label;
    result.textColor = "red";
    result.isItalic = true;
    return result;
  }

  if (workorder.status !== "finished") {
    if (lowerLabel.includes("today") || lowerLabel.includes("overdue")) {
      result.textColor = "red";
    } else if (lowerLabel.includes("tomorrow")) {
      result.textColor = C.green;
    }
  }

  if (lowerLabel.startsWith("overdue ")) {
    let afterOverdue = label.substring(8);
    if (afterOverdue.toLowerCase() === "yesterday") afterOverdue = "Yesterday";
    result.waitEndDay = "Overdue\n" + afterOverdue;
    return result;
  }

  if (lowerLabel.includes("today")) {
    let parts = label.split(/\s+(today)/i);
    let prefix = parts[0]?.trim();
    if (prefix) {
      result.waitEndDay = prefix + "\nToday";
    } else {
      result.waitEndDay = "Today";
    }
    return result;
  }

  if (lowerLabel.includes("tomorrow")) {
    let parts = label.split(/\s+(tomorrow)/i);
    let prefix = parts[0]?.trim();
    if (prefix) {
      result.waitEndDay = prefix + "\nTomorrow";
    } else {
      result.waitEndDay = "Tomorrow";
    }
    return result;
  }

  let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let day of dayNames) {
    if (label.endsWith(day) && label.length > day.length) {
      let prefix = label.slice(0, label.length - day.length).trim();
      result.waitEndDay = prefix + "\n" + day;
      return result;
    }
  }

  result.waitEndDay = label;
  return result;
}
