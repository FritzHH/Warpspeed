import { ICONS, C, Radius } from "../../../styles";
import { Image, DropdownMenu, TouchableOpacity, AlertBox } from "../../../dom_components";
import { useAlertScreenStore } from "../../../stores";
import { WorkorderCard } from "../WorkorderCard/WorkorderCard";
import { sortWorkorders } from "../helpers";
import styles from "./ListShell.module.css";

const USER_DROPDOWN_BUTTON_STYLE = {
  paddingHorizontal: 7,
  paddingVertical: 2,
  borderWidth: 1,
  borderColor: C.borderDefault,
  backgroundColor: C.surfaceAccentMuted,
  borderRadius: Radius.control,
};

const USER_DROPDOWN_TEXT_STYLE = {
  fontSize: 13,
  color: C.textDefault,
};

export function ListShell({
  workorders,
  zStatuses,
  zSettings,
  currentUser,
  isClockedIn,
  search,
  onSearchChange,
  onToggleClock,
  onSwitchUser,
  onLogoutApp,
  onOpenWorkorder,
  onActivity,
}) {
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);

  const filtered = sortWorkorders(
    workorders.filter((wo) => {
      if (!wo.customerID) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const fields = [wo.customerFirst, wo.customerLast, wo.brand, wo.description];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    })
  );

  const userLabel =
    (currentUser?.first || "") +
    " " +
    (currentUser?.last?.length > 0 ? currentUser.last[0] + "." : "");

  return (
    <div
      onMouseMove={onActivity}
      onTouchStart={onActivity}
      className={styles.root}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Image icon={ICONS.gears1} size={24} className={styles.headerIcon} />
          <span className={styles.headerTitle}>WARPSPEED</span>
        </div>
        <DropdownMenu
          buttonIcon={isClockedIn ? ICONS.check : ICONS.redx}
          buttonIconSize={13}
          buttonText={userLabel}
          buttonStyle={USER_DROPDOWN_BUTTON_STYLE}
          buttonTextStyle={USER_DROPDOWN_TEXT_STYLE}
          dataArr={[
            { label: isClockedIn ? "Clock Out" : "Clock In" },
            { label: "Switch User" },
            { label: "Log Out App" },
          ]}
          onSelect={(item) => {
            if (item.label === "Clock In" || item.label === "Clock Out") onToggleClock();
            else if (item.label === "Switch User") onSwitchUser();
            else if (item.label === "Log Out App") onLogoutApp();
          }}
        />
      </div>

      <AlertBox showAlert={zShowAlert} />

      <div className={styles.searchBar}>
        <div className={styles.searchInner}>
          <Image icon={ICONS.search} size={16} className={styles.searchIcon} />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, brand, description..."
            className={styles.searchInput}
          />
          {!!search && (
            <TouchableOpacity
              onPress={() => onSearchChange("")}
              className={styles.clearBtn}
              aria-label="Clear search"
            >
              <Image icon={ICONS.close1} size={20} />
            </TouchableOpacity>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {filtered.map((workorder) => (
          <WorkorderCard
            key={workorder.id}
            workorder={workorder}
            zStatuses={zStatuses}
            zSettings={zSettings}
            onPress={() => onOpenWorkorder(workorder)}
          />
        ))}

        {workorders.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyText}>No open workorders</span>
          </div>
        )}
      </div>
    </div>
  );
}
