/* eslint-disable */

import { useMemo, useState, lazy, Suspense } from "react";
import { capitalizeFirstLetterOfString, formatPhoneForDisplay } from "../../../utils";
import { Button, Image, ScreenModal } from "../../../dom_components";
import { TAB_NAMES } from "../../../data";
import {
  useCurrentCustomerStore,
  useCustomerSearchStore,
  useLoginStore,
  useOpenWorkordersStore,
  useRecentCustomersStore,
  useTabNamesStore,
} from "../../../stores";
const CustomerInfoScreenModalComponent = lazy(() =>
  import("../modal_screens/CustomerInfoModalScreen").then((m) => ({ default: m.CustomerInfoScreenModalComponent }))
);
import { startNewWorkorder } from "../../../db_calls_wrapper";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import defaultLogo from "../../../resources/default_app_logo_large.png";
import styles from "./Items_CustomerSearchList.module.css";
import { useZ } from "../../../hooks/useZ";

export function CustomerSearchListComponent({}) {
  // store getters //////////////////////////////////////////////////////////////////////
  const zSearchResults = useCustomerSearchStore((state) => state.searchResults);
  const zSearchResultTimestamps = useCustomerSearchStore((state) => state.searchResultTimestamps);
  const zSearchQuery = useCustomerSearchStore((state) => state.searchQuery);
  const zSearchType = useCustomerSearchStore((state) => state.searchType);
  const zIsSearching = useCustomerSearchStore((state) => state.isSearching);

  const filteredResults = useMemo(() => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const cutoff = Date.now() - twoHoursMs;
    const freshResults = zSearchResults.filter((c) => {
      const ts = zSearchResultTimestamps?.[c.id];
      return typeof ts === "number" && ts >= cutoff;
    });

    let results;
    if (!zSearchQuery) {
      results = freshResults;
    } else if (zSearchType === "phone") {
      const digits = zSearchQuery.replace(/\D/g, "");
      if (!digits) {
        results = freshResults;
      } else {
        results = freshResults.filter((c) => {
          const cellDigits = (c.customerCell || "").replace(/\D/g, "");
          const landDigits = (c.customerLandline || c.land || "").replace(/\D/g, "");
          return cellDigits.includes(digits) || landDigits.includes(digits);
        });
      }
    } else if (zSearchType === "email") {
      const emailQ = zSearchQuery.toLowerCase();
      results = freshResults.filter((c) =>
        (c.email || "").toLowerCase().includes(emailQ)
      );
    } else {
      const words = zSearchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      results = freshResults.filter((c) => {
        const first = (c.first || "").toLowerCase();
        const last = (c.last || "").toLowerCase();
        return words.every((w) => first.includes(w) || last.includes(w));
      });
    }

    return [...results].sort((a, b) => {
      const firstCmp = (a.first || "").toLowerCase().localeCompare((b.first || "").toLowerCase());
      if (firstCmp !== 0) return firstCmp;
      return (a.last || "").toLowerCase().localeCompare((b.last || "").toLowerCase());
    });
  }, [zSearchResults, zSearchResultTimestamps, zSearchQuery, zSearchType]);
  ////////////////////////////////////////////////////////////////////////////////////////
  const [sCustomerInfo, _setCustomerInfo] = useState();
  const [sSelectedCustomer, _setSelectedCustomer] = useState(null);
  const [sModalY, _setModalY] = useState(0);
  const [sModalX, _setModalX] = useState(0);
  const z = useZ("dropdown", !!sSelectedCustomer);

  function handleCustomerSelected(customer) {
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
      _setCustomerInfo();
      useCustomerSearchStore.getState().reset();
    });
  }

  return (
    <div className={styles.root}>
      <img
        src={defaultLogo}
        alt=""
        className={`${styles.logo} ${zIsSearching ? styles.logoSpinning : ""}`}
        draggable={false}
      />
      <div className={styles.list}>
        {filteredResults.length === 0 ? (
          <div className={styles.emptyState}>
            {!zIsSearching && (
              <span className={styles.emptyText} style={{ color: C.textMuted }}>
                No customers found
              </span>
            )}
          </div>
        ) : (
          filteredResults.map((customer) => (
            <div key={customer.id} className={styles.row}>
              <button
                type="button"
                className={styles.rowButton}
                onClick={(e) => {
                  _setModalY(e.clientY ?? 0);
                  _setModalX(e.clientX ?? 0);
                  _setSelectedCustomer(customer);
                }}
              >
                <div className={styles.rowContent}>
                  <span className={styles.name} style={{ color: C.text }}>
                    {capitalizeFirstLetterOfString(customer?.first) +
                      " " +
                      capitalizeFirstLetterOfString(customer?.last)}
                  </span>
                  <div className={styles.contactRow}>
                    <span className={styles.contactField} style={{ color: C.text }}>
                      <span className={styles.contactLabel} style={{ color: C.textDisabled }}>
                        {"cell:  "}
                      </span>
                      {formatPhoneForDisplay(customer?.customerCell)}
                    </span>
                    {!!(customer?.customerLandline || customer?.land) && (
                      <span
                        className={`${styles.contactField} ${styles.contactFieldGap}`}
                        style={{ color: C.text }}
                      >
                        <span className={styles.contactLabel} style={{ color: C.textDisabled }}>
                          {"landline:  "}
                        </span>
                        {formatPhoneForDisplay(customer?.customerLandline || customer?.land)}
                      </span>
                    )}
                    {!!customer?.email && (
                      <span
                        className={`${styles.contactField} ${styles.contactFieldGap}`}
                        style={{ color: C.text }}
                      >
                        <span className={styles.contactLabel} style={{ color: C.textDisabled }}>
                          {"email:  "}
                        </span>
                        {customer?.email}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          ))
        )}
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
                  onNewWorkorder={(customerInfo) =>
                    handleCustomerSelected(customerInfo)
                  }
                  onClose={() => _setCustomerInfo()}
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
          style={{ zIndex: z }}
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
            <div className={styles.actionPopupBody}>
              <Button
                text="New Workorder"
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={() => {
                  let customer = sSelectedCustomer;
                  _setSelectedCustomer(null);
                  handleCustomerSelected(customer);
                }}
                buttonStyle={{ width: 200, height: 45 }}
                textStyle={{ fontSize: 16 }}
              />
              <Button
                text="Customer Info"
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={() => {
                  useRecentCustomersStore.getState().addRecentCustomer(sSelectedCustomer);
                  _setCustomerInfo(sSelectedCustomer);
                  _setSelectedCustomer(null);
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
