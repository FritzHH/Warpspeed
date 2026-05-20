import dayjs from "dayjs";

export function getWeekStart(date) {
  let d = dayjs(date).startOf("day");
  let dow = d.day();
  let mondayOffset = dow === 0 ? -6 : 1 - dow;
  return d.add(mondayOffset, "day").format("YYYY-MM-DD");
}

export function getStoreHoursForDayIndex(storeHours, dayIndex) {
  if (!storeHours?.standard) return null;
  return storeHours.standard[dayIndex - 1] || null;
}

export function parseTime(timeStr) {
  if (!timeStr) return { hour: 12, minute: 0, period: "PM" };
  let parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!parts) return { hour: 12, minute: 0, period: "PM" };
  return { hour: parseInt(parts[1]), minute: parseInt(parts[2]), period: parts[3].toUpperCase() };
}

export function formatTimeShort(timeStr) {
  let { hour, minute, period } = parseTime(timeStr);
  let m = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${hour}${m}${period.toLowerCase()[0]}`;
}
