/* eslint-disable */
import React from "react";
import { useNavigate } from "react-router-dom";
import { C, ICONS } from "../../styles";
import { Image } from "../../dom_components";
import { useOpenWorkordersStore, useSettingsStore } from "../../stores";
import { capitalizeFirstLetterOfString, formatMillisForDisplay, formatPhoneWithDashes, resolveStatus, deepEqual } from "../../utils";
import { dbGetOpenWorkorders } from "../../db_calls_wrapper";
import styles from "./MobileWorkorderListScreen.module.css";

export function MobileWorkorderListScreen() {
  const navigate = useNavigate();
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zStatuses = useSettingsStore((state) => state.settings?.statuses, deepEqual);

  const groups = groupWorkordersByStatus(zWorkorders, zStatuses);

  return (
    <div
      className={styles.scroll}
      style={{ backgroundColor: C.backgroundWhite }}
    >
      <button
        type="button"
        className={styles.refreshBtn}
        onClick={async () => {
          const workorders = await dbGetOpenWorkorders();
          if (workorders) useOpenWorkordersStore.getState().setOpenWorkorders(workorders);
        }}
      >
        <Image icon={ICONS.reset1} size={16} style={{ marginRight: 6 }} />
        <span className={styles.refreshText} style={{ color: C.green }}>Refresh</span>
      </button>

      {groups.map((group) => (
        <div key={group.status.id} className={styles.group}>
          <div className={styles.groupHeader}>
            <div
              className={styles.groupDot}
              style={{ backgroundColor: group.status.backgroundColor }}
            />
            <span className={styles.groupHeaderText} style={{ color: C.text }}>
              {group.status.label} ({group.items.length})
            </span>
          </div>

          {group.items.map((workorder) => {
            const rs = resolveStatus(workorder.status, zStatuses);
            return (
              <button
                type="button"
                key={workorder.id}
                onClick={() => navigate(`/workorder/${workorder.id}`)}
                className={styles.card}
                style={{ backgroundColor: rs.backgroundColor }}
              >
                <div className={styles.cardRow}>
                  {workorder.hasNewSMS && <div className={styles.smsDot} />}
                  <span className={styles.customerName} style={{ color: rs.textColor }}>
                    {capitalizeFirstLetterOfString(workorder.customerFirst) +
                      " " +
                      capitalizeFirstLetterOfString(workorder.customerLast)}
                  </span>
                </div>

                {!!workorder.customerCell && (
                  <span className={styles.phone} style={{ color: rs.textColor }}>
                    {formatPhoneWithDashes(workorder.customerCell)}
                  </span>
                )}

                <div className={styles.brandRow}>
                  <span className={styles.brand} style={{ color: rs.textColor }}>
                    {workorder.brand || "No Brand"}
                  </span>
                  {!!workorder.description && (
                    <>
                      <span className={styles.dotSep} style={{ color: rs.textColor }}>
                        {"\u2022"}
                      </span>
                      <span className={styles.description} style={{ color: rs.textColor }}>
                        {workorder.description}
                      </span>
                    </>
                  )}
                  {workorder.workorderLines?.length > 0 && (
                    <div className={styles.lineCountBadge}>
                      <span className={styles.lineCountText} style={{ color: rs.textColor }}>
                        {workorder.workorderLines.length}
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.metaRow}>
                  <span className={styles.metaText} style={{ color: rs.textColor }}>
                    {formatMillisForDisplay(workorder.startedOnMillis)}
                  </span>
                  {!!workorder.waitTime?.label && (
                    <span className={styles.metaTextItalic} style={{ color: rs.textColor }}>
                      est: {workorder.waitTime.label}
                    </span>
                  )}
                </div>

                {!!(workorder.partOrdered || workorder.partSource) && (
                  <div className={styles.partRow}>
                    {!!workorder.partOrdered && (
                      <span className={styles.partText} style={{ color: rs.textColor }}>
                        {workorder.partOrdered}
                      </span>
                    )}
                    {!!(workorder.partOrdered && workorder.partSource) && (
                      <span className={styles.partDot} style={{ color: rs.textColor }}>
                        {"\u2022"}
                      </span>
                    )}
                    {!!workorder.partSource && (
                      <span className={styles.partSource} style={{ color: rs.textColor }}>
                        {workorder.partSource}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {groups.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyText} style={{ color: C.lightText }}>
            No open workorders
          </span>
        </div>
      )}
    </div>
  );
}

function groupWorkordersByStatus(workorders, statuses) {
  if (!workorders || !statuses) return [];
  const filtered = workorders;
  const placed = new Set();
  const groups = [];
  statuses.forEach((status) => {
    const items = filtered.filter((wo) => {
      if (placed.has(wo.id)) return false;
      if (wo.status === status.id) {
        placed.add(wo.id);
        return true;
      }
      return false;
    });
    if (items.length > 0) {
      groups.push({ status, items });
    }
  });
  return groups;
}
