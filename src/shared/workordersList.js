/* eslint-disable */
import { calculateWaitEstimateLabel, resolveStatus } from "../utils";
import { C } from "../styles";
import { useSettingsStore } from "../stores";

export const NUM_MILLIS_IN_DAY = 86400000;

export const MONTH_LABELS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const DAY_LABELS_SHORT = ["Sun","Mon","Tues","Wed","Thurs","Fri","Sat"];

export function isFinishedStatus(workorder) {
  const settings = useSettingsStore.getState().getSettings();
  const rs = resolveStatus(workorder.status, settings?.statuses);
  return !!rs?.label?.toLowerCase().includes("finished");
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
    result.textColor = C.textMuted;
    return result;
  }

  let lowerLabel = label.toLowerCase();
  const finished = isFinishedStatus(workorder);

  if (finished) {
    result.textColor = C.textMuted;
  } else if (lowerLabel === "waiting" || lowerLabel === "today") {
    result.waitEndDay = label;
    result.textColor = "red";
    result.isItalic = true;
    return result;
  }

  if (!finished) {
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

export function formatPickupDeliveryTime(time) {
  if (!time) return "";
  let [h, m] = time.split(":");
  h = Number(h);
  let suffix = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + (m && m !== "00" ? ":" + m : "") + suffix;
}

export function scoreWorkorder(wo, query) {
  let q = query.toLowerCase().trim();
  if (!q) return 0;
  let parts = q.split(/\s+/).filter(Boolean);
  let score = 0;

  let fields = {
    workorderNumber: (wo.workorderNumber || "").toLowerCase(),
    id: (wo.id || "").toLowerCase(),
    first: (wo.customerFirst || "").toLowerCase(),
    last: (wo.customerLast || "").toLowerCase(),
    phone: (wo.customerCell || "").replace(/\D/g, ""),
    email: (wo.customerEmail || "").toLowerCase(),
    brand: (wo.brand || "").toLowerCase(),
    description: (wo.description || "").toLowerCase(),
  };

  for (let part of parts) {
    let partScore = 0;
    if (fields.first === part || fields.last === part) partScore = Math.max(partScore, 100);
    if (fields.first.startsWith(part)) partScore = Math.max(partScore, 80);
    if (fields.last.startsWith(part)) partScore = Math.max(partScore, 80);
    if (fields.workorderNumber.includes(part)) partScore = Math.max(partScore, 70);
    if (fields.id.includes(part)) partScore = Math.max(partScore, 70);
    if (fields.phone.includes(part)) partScore = Math.max(partScore, 60);
    if (fields.email.includes(part)) partScore = Math.max(partScore, 50);
    if (fields.brand.startsWith(part)) partScore = Math.max(partScore, 45);
    if (fields.brand.includes(part)) partScore = Math.max(partScore, 35);
    if (fields.description.includes(part)) partScore = Math.max(partScore, 30);
    if (!partScore && fields.first.includes(part)) partScore = 20;
    if (!partScore && fields.last.includes(part)) partScore = 20;
    score += partScore;
  }

  return score;
}

export function sortWorkorders(inputArr, statuses, currentUser) {
  const settings = useSettingsStore.getState().getSettings();
  const labelByWo = new Map();
  (inputArr || []).forEach((wo) => {
    labelByWo.set(wo, calculateWaitEstimateLabel(wo, settings));
  });

  let finalArr = [];
  (statuses || []).forEach((status) => {
    let arr = [];
    inputArr.forEach((wo) => {
      if (wo.status === status.id) arr.push(wo);
    });

    arr.sort((a, b) => {
      let aHasWait = !!(a.waitTime?.maxWaitTimeDays != null && a.startedOnMillis);
      let bHasWait = !!(b.waitTime?.maxWaitTimeDays != null && b.startedOnMillis);
      if (!aHasWait && bHasWait) return -1;
      if (aHasWait && !bHasWait) return 1;
      if (!aHasWait && !bHasWait) {
        return (a.startedOnMillis || 0) - (b.startedOnMillis || 0);
      }
      if (labelByWo.get(a) === labelByWo.get(b)) {
        return (a.startedOnMillis || 0) - (b.startedOnMillis || 0);
      }
      let aDue = a.startedOnMillis + a.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      let bDue = b.startedOnMillis + b.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      return aDue - bDue;
    });

    finalArr = [...finalArr, ...arr];
  });

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

  const finishedStatusIDs = new Set(
    (statuses || [])
      .filter((s) => (s.label || "").toLowerCase().includes("finished"))
      .map((s) => s.id)
  );
  const finishedCountByCustomer = {};
  finalArr.forEach((wo) => {
    if (wo.customerID && finishedStatusIDs.has(wo.status)) {
      finishedCountByCustomer[wo.customerID] = (finishedCountByCustomer[wo.customerID] || 0) + 1;
    }
  });
  const customersToGroup = new Set(
    Object.keys(finishedCountByCustomer).filter((id) => finishedCountByCustomer[id] >= 2)
  );
  if (customersToGroup.size > 0) {
    const grouped = [];
    const placed = new Array(finalArr.length).fill(false);
    for (let i = 0; i < finalArr.length; i++) {
      if (placed[i]) continue;
      const wo = finalArr[i];
      grouped.push(wo);
      placed[i] = true;
      if (
        wo.customerID &&
        finishedStatusIDs.has(wo.status) &&
        customersToGroup.has(wo.customerID)
      ) {
        for (let j = i + 1; j < finalArr.length; j++) {
          if (placed[j]) continue;
          const other = finalArr[j];
          if (other.customerID === wo.customerID && finishedStatusIDs.has(other.status)) {
            grouped.push(other);
            placed[j] = true;
          }
        }
      }
    }
    finalArr = grouped;
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
