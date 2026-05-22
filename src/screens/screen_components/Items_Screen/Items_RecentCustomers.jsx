/* eslint-disable */

import { useMemo, useState, lazy, Suspense } from "react";
import { Button, Image, ScreenModal } from "../../../dom_components";
import {
  useRecentCustomersStore,
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useLoginStore,
  useCustomerSearchStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { startNewWorkorder, dbGetCustomer } from "../../../db_calls_wrapper";
import defaultLogo from "../../../resources/default_app_logo_large.png";
import { capitalizeFirstLetterOfString, formatPhoneForDisplay } from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
const CustomerInfoScreenModalComponent = lazy(() =>
  import("../modal_screens/CustomerInfoModalScreen").then((m) => ({ default: m.CustomerInfoScreenModalComponent }))
);
import styles from "./Items_RecentCustomers.module.css";

const RECENT_CUSTOMER_WINDOW_MS = 2 * 60 * 60 * 1000;

export function RecentCustomersComponent() {
  const zRecentCustomersRaw = useRecentCustomersStore((s) => s.recentCustomers);
  const zRecentCustomers = useMemo(() => {
    const cutoff = Date.now() - RECENT_CUSTOMER_WINDOW_MS;
    return zRecentCustomersRaw.filter((c) => (c.addedAt || 0) > cutoff);
  }, [zRecentCustomersRaw]);
  const [sCustomerInfo, _setCustomerInfo] = useState(null);
  const [sSelectedCustomer, _setSelectedCustomer] = useState(null);
  const [sModalY, _setModalY] = useState(0);
  const [sModalX, _setModalX] = useState(0);

  function handleRecentCustomerSelected(customer) {
    useLoginStore.getState().requireLogin(async () => {
      useRecentCustomersStore.getState().addRecentCustomer(customer);
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      await startNewWorkorder(customer);
      useCurrentCustomerStore.getState().setCustomer(customer);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      _setCustomerInfo(null);
      useCustomerSearchStore.getState().reset();
    });
  }

  if (zRecentCustomers.length === 0) {
    return (
      <div className={styles.emptyRoot}>
        <img src={defaultLogo} alt="" className={styles.emptyLogo} draggable={false} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <img src={defaultLogo} alt="" className={styles.logo} draggable={false} />
      <div className={styles.listColumn}>
        {zRecentCustomers.map((item) => (
          <div key={item.id} className={styles.row}>
            <button
              type="button"
              className={styles.rowButton}
              onClick={(e) => {
                _setModalY(e.clientY ?? 0);
                _setModalX(e.clientX ?? 0);
                _setSelectedCustomer(item);
              }}
            >
              <span className={styles.name} style={{ color: C.text }}>
                {capitalizeFirstLetterOfString(item.first) +
                  " " +
                  capitalizeFirstLetterOfString(item.last)}
              </span>
              {!!item.customerCell && (
                <span className={styles.phone} style={{ color: C.textMuted }}>
                  {formatPhoneForDisplay(item.customerCell)}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
      {useMemo(
        () => (
          <ScreenModal
            showOuterModal={true}
            modalVisible={sCustomerInfo}
            buttonVisible={false}
            Component={() => (
              <Suspense fallback={null}>
                <CustomerInfoScreenModalComponent
                  isCurrentCustomer={false}
                  incomingCustomer={sCustomerInfo}
                  button1Text={"New Workorder"}
                  button2Text={"Close"}
                  handleButton1Press={(customerInfo) =>
                    handleRecentCustomerSelected(customerInfo)
                  }
                  handleButton2Press={() => _setCustomerInfo(null)}
                />
              </Suspense>
            )}
          />
        ),
        [sCustomerInfo]
      )}
      {sSelectedCustomer && (
        <div
          className={styles.actionOverlay}
          onClick={() => _setSelectedCustomer(null)}
        >
          <div
            className={styles.actionPopup}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: sModalY,
              left: sModalX,
              backgroundColor: C.backgroundWhite,
            }}
          >
            <div className={styles.actionPopupHeader}>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => _setSelectedCustomer(null)}
              >
                <Image icon={ICONS.close1} className={styles.closeIcon} />
              </button>
            </div>
            <div className={styles.actionPopupBody}>
              <Button
                text="New Workorder"
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={async () => {
                  let customer = await dbGetCustomer(sSelectedCustomer.id);
                  _setSelectedCustomer(null);
                  if (customer) handleRecentCustomerSelected(customer);
                }}
                buttonStyle={{ width: 200, height: 45 }}
                textStyle={{ fontSize: 16 }}
              />
              <Button
                text="Customer Info"
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={async () => {
                  let customer = await dbGetCustomer(sSelectedCustomer.id);
                  _setSelectedCustomer(null);
                  if (customer) {
                    useRecentCustomersStore.getState().addRecentCustomer(customer);
                    _setCustomerInfo(customer);
                  }
                }}
                buttonStyle={{ width: 200, height: 45, marginTop: 15 }}
                textStyle={{ fontSize: 16 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
