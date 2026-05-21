import { ICONS, C } from "../../../styles";
import {
  resolveStatus,
  capitalizeFirstLetterOfString,
  formatMillisForDisplay,
} from "../../../utils";
import { Image } from "../../../dom_components";
import {
  computeWaitInfo,
  formatPickupDeliveryTime,
  MONTH_LABELS_SHORT,
  DAY_LABELS_SHORT,
} from "../helpers";
import styles from "./WorkorderCard.module.css";

const TEXT_COLOR = C.textDefault;
const RED_COLOR = C.danger;
const GREEN_COLOR = C.accent;
const DEFAULT_BORDER_COLOR = C.borderDefault;

export function WorkorderCard({ workorder, zStatuses, onPress }) {
  const rs = resolveStatus(workorder.status, zStatuses);
  const isPickupDelivery = workorder.status === "pickup" || workorder.status === "delivery";

  let waitInfo;
  if (isPickupDelivery) {
    const pd = workorder.pickupDelivery;
    const hasDate = pd?.month && pd?.day;
    waitInfo = { waitEndDay: "", textColor: TEXT_COLOR, isMissing: !hasDate, isItalic: false, pickupTimeStr: "" };
    if (hasDate) {
      const now = new Date();
      const d = new Date(now.getFullYear(), Number(pd.month) - 1, Number(pd.day));
      const isToday = Number(pd.month) === now.getMonth() + 1 && Number(pd.day) === now.getDate();
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      const isTomorrow = Number(pd.month) === tom.getMonth() + 1 && Number(pd.day) === tom.getDate();
      waitInfo.textColor = isToday ? RED_COLOR : isTomorrow ? GREEN_COLOR : TEXT_COLOR;
      waitInfo.waitEndDay = isToday ? "Today" : isTomorrow ? "Tomorrow"
        : DAY_LABELS_SHORT[d.getDay()] + ", " + MONTH_LABELS_SHORT[Number(pd.month) - 1] + " " + pd.day;
      waitInfo.pickupTimeStr = pd.startTime
        ? formatPickupDeliveryTime(pd.startTime) + (pd.endTime ? "-" + formatPickupDeliveryTime(pd.endTime) : "")
        : "";
    }
  } else {
    waitInfo = computeWaitInfo(workorder);
  }

  let wipUser = "";
  if (workorder.status === "work_in_progress" && workorder.changeLog?.length) {
    for (let i = workorder.changeLog.length - 1; i >= 0; i--) {
      const entry = workorder.changeLog[i];
      if (entry.field === "status" && entry.to === rs.label) {
        wipUser = entry.user || "";
        break;
      }
    }
  }

  const startDate = new Date(workorder.startedOnMillis);
  const h = startDate.getHours() % 12 || 12;
  const m = startDate.getMinutes();
  const timeStr = h + ":" + (m < 10 ? "0" : "") + m + "  ";
  const dateStr = formatMillisForDisplay(
    workorder.startedOnMillis,
    startDate.getFullYear() !== new Date().getFullYear()
  );

  const showBadgeRow = workorder.itemNotHere || waitInfo.isMissing || !!waitInfo.waitEndDay;
  const showPartRow = !!(workorder.partOrdered || workorder.partSource);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPress?.();
        }
      }}
      className={styles.card}
      style={{ borderLeftColor: rs.backgroundColor || DEFAULT_BORDER_COLOR }}
    >
      <div className={styles.topRow}>
        <div className={styles.leftCol}>
          <div className={styles.nameRow}>
            {workorder.hasNewSMS && <div className={styles.newSmsDot} />}
            <span className={styles.customerName}>
              {capitalizeFirstLetterOfString(workorder.customerFirst) +
                " " +
                capitalizeFirstLetterOfString(workorder.customerLast)}
            </span>
          </div>

          <div className={styles.brandRow}>
            <span className={styles.brandText}>
              {capitalizeFirstLetterOfString(workorder.brand) || ""}
            </span>
            {!!(workorder.brand && workorder.description) && (
              <div className={styles.dotSep} />
            )}
            {!!workorder.description && (
              <span className={styles.descriptionText}>
                {capitalizeFirstLetterOfString(workorder.description)}
              </span>
            )}
            {workorder.workorderLines?.length > 0 && (
              <div className={styles.lineCountBadge}>
                <span className={styles.lineCountText}>
                  {workorder.workorderLines.length}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.rightCol}>
          <span className={styles.dateText}>
            {timeStr}
            {dateStr}
          </span>
          <div className={styles.statusPill} style={{ backgroundColor: rs.backgroundColor }}>
            {!!wipUser && <span className={styles.wipUser}>{wipUser}</span>}
            <span className={styles.statusLabel} style={{ color: rs.textColor }}>
              {rs.label}
            </span>
          </div>
        </div>
      </div>

      {showBadgeRow && (
        <div className={styles.badgeRow}>
          {workorder.itemNotHere ? (
            <div className={styles.notHereBadge}>
              <span className={styles.notHereText}>Item not here</span>
            </div>
          ) : (
            <div />
          )}
          {waitInfo.isMissing ? (
            <div className={styles.waitBadge}>
              <Image icon={ICONS.questionMark} size={16} />
            </div>
          ) : !!waitInfo.waitEndDay && waitInfo.waitEndDay.includes("\n") ? (
            <div className={styles.waitBadgeStacked}>
              <span className={styles.waitDayItalic} style={{ color: waitInfo.textColor }}>
                {capitalizeFirstLetterOfString(waitInfo.waitEndDay.split("\n")[0])}
              </span>
              <span className={styles.waitDayLine} style={{ color: waitInfo.textColor }}>
                {waitInfo.waitEndDay.split("\n")[1]}
              </span>
            </div>
          ) : !!waitInfo.waitEndDay ? (
            <div className={styles.waitBadge}>
              <span
                className={waitInfo.isItalic ? styles.waitDayLineItalic : styles.waitDayLine}
                style={{ color: waitInfo.textColor }}
              >
                {capitalizeFirstLetterOfString(waitInfo.waitEndDay)}
              </span>
              {!!waitInfo.pickupTimeStr && (
                <span className={styles.pickupTimeText}>{waitInfo.pickupTimeStr}</span>
              )}
            </div>
          ) : null}
        </div>
      )}

      {showPartRow && (
        <div className={styles.partRow}>
          {!!workorder.partOrdered && (
            <span className={styles.partOrderedText}>
              {capitalizeFirstLetterOfString(workorder.partOrdered)}
            </span>
          )}
          {!!(workorder.partOrdered && workorder.partSource) && (
            <div className={styles.dotSep} />
          )}
          {!!workorder.partSource && (
            <span className={styles.partSourceText}>
              {capitalizeFirstLetterOfString(workorder.partSource)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
