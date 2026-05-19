import React, { useState } from "react";
import styles from "./BackupRecoveryComponent.module.css";
import { Button } from "../../../../dom_components";
import { useSettingsStore } from "../../../../stores";
import { C, COLOR_GRADIENTS } from "../../../../styles";
import { gray, formatMillisForDisplay, log } from "../../../../utils";
import { firestoreQuery } from "../../../../db_calls";
import {
  dbRehydrateFromArchive,
  dbManualArchiveAndCleanup,
} from "../../../../db_calls_wrapper";
import { DB_NODES } from "../../../../constants";
import { SettingsCSVComponent } from "./SettingsCSVComponent";

const ARCHIVE_COLLECTION_NAMES = [
  "completed-workorders",
  "completed-sales",
  "customers",
  "open-workorders",
  "inventory",
  "settings",
  "active-sales",
  "punch_clock",
  "punches",
];

const MILLIS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

export function BackupRecoveryComponent() {
  const tenantID = useSettingsStore((state) => state.settings?.tenantID);
  const storeID = useSettingsStore((state) => state.settings?.storeID);

  const [sLogs, _setLogs] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const [sRehydrating, _setRehydrating] = useState(false);
  const [sConfirmStep, _setConfirmStep] = useState(0);
  const [sRehydrateResult, _setRehydrateResult] = useState(null);
  const [sWeeksLoaded, _setWeeksLoaded] = useState(1);
  const [sArchiving, _setArchiving] = useState(false);
  const [sArchiveResult, _setArchiveResult] = useState(null);

  async function loadLogs(weeksBack) {
    if (!tenantID || !storeID) return;
    _setLoading(true);
    try {
      const endMillis = Date.now();
      const startMillis = endMillis - weeksBack * MILLIS_IN_WEEK;
      const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.ARCHIVE_LOGS}`;
      const results = await firestoreQuery(
        collectionPath,
        [
          { field: "millis", operator: ">=", value: startMillis },
          { field: "millis", operator: "<=", value: endMillis },
        ],
        { orderBy: { field: "millis", direction: "desc" } }
      );
      _setLogs(results);
    } catch (err) {
      log("BackupRecovery: Error loading logs", err);
    }
    _setLoading(false);
  }

  function handleLoadInitial() {
    _setWeeksLoaded(1);
    loadLogs(1);
  }

  function handleLoadMore() {
    const next = sWeeksLoaded + 1;
    _setWeeksLoaded(next);
    loadLogs(next);
  }

  async function handleRehydrate() {
    _setRehydrating(true);
    _setRehydrateResult(null);
    try {
      const result = await dbRehydrateFromArchive(ARCHIVE_COLLECTION_NAMES);
      _setRehydrateResult(result);
    } catch (err) {
      _setRehydrateResult({ success: false, error: err.message });
    }
    _setRehydrating(false);
    _setConfirmStep(0);
  }

  async function handleManualArchive() {
    _setArchiving(true);
    _setArchiveResult(null);
    try {
      const result = await dbManualArchiveAndCleanup();
      _setArchiveResult(result);
    } catch (err) {
      _setArchiveResult({ success: false, error: err.message });
    }
    _setArchiving(false);
  }

  return (
    <div className={styles.outerBox}>
      {/*** MANUAL BACKUP SECTION ***/}
      <div className={styles.innerBox}>
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          RUN BACKUP NOW
        </span>
        <span
          className={styles.sectionDescription}
          style={{ color: gray(0.5) }}
        >
          Manually runs the full nightly archive process: backs up all collections
          to Cloud Storage, cleans up old media, and cleans up standalone active sales.
        </span>
        <Button
          text={sArchiving ? "Archiving..." : "Run Full Backup"}
          onPress={handleManualArchive}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          disabled={sArchiving}
          loading={sArchiving}
        />
        {!!sArchiveResult && (
          <div
            className={`${styles.resultBox} ${
              sArchiveResult.success
                ? styles.resultBoxSuccess
                : styles.resultBoxFailure
            }`}
          >
            <span
              className={styles.resultTitle}
              style={{ color: sArchiveResult.success ? C.green : C.red }}
            >
              {sArchiveResult.success ? "Backup Complete" : "Backup Failed"}
            </span>
            {sArchiveResult.success &&
              sArchiveResult.archive &&
              Object.entries(sArchiveResult.archive).map(([name, r]) => (
                <span
                  key={name}
                  className={styles.resultLine}
                  style={{ color: C.text }}
                >
                  {name}:{" "}
                  {r.success
                    ? r.docCount + " docs archived"
                    : "FAILED — " + r.error}
                </span>
              ))}
            {sArchiveResult.success && sArchiveResult.mediaCleanup && (
              <span
                className={styles.resultLineExtra}
                style={{ color: C.text }}
              >
                Media cleanup: {sArchiveResult.mediaCleanup.workordersProcessed}{" "}
                workorders, {sArchiveResult.mediaCleanup.mediaFilesDeleted}{" "}
                files deleted
              </span>
            )}
            {!sArchiveResult.success && sArchiveResult.error && (
              <span className={styles.resultLine} style={{ color: C.red }}>
                {sArchiveResult.error}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.sectionGap} />

      {/*** REHYDRATE SECTION ***/}
      <div className={styles.innerBox}>
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          EMERGENCY DATA RESTORE
        </span>
        <span
          className={styles.sectionDescription}
          style={{ color: gray(0.5) }}
        >
          Restores all archived data from Cloud Storage back to Firestore. Only
          use this if the database has been corrupted or data is missing.
        </span>

        {sConfirmStep === 0 && (
          <Button
            text="Restore from Backup"
            onPress={() => _setConfirmStep(1)}
            colorGradientArr={COLOR_GRADIENTS.red}
            buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
            disabled={sRehydrating}
          />
        )}

        {sConfirmStep === 1 && (
          <div className={styles.confirmBlock}>
            <span className={styles.confirmWarning} style={{ color: C.red }}>
              This will overwrite current Firestore data with the latest nightly
              backup. Are you sure?
            </span>
            <div className={styles.confirmRow}>
              <Button
                text="Yes, Continue"
                onPress={() => _setConfirmStep(2)}
                colorGradientArr={COLOR_GRADIENTS.red}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
              />
              <Button
                text="Cancel"
                onPress={() => _setConfirmStep(0)}
                colorGradientArr={COLOR_GRADIENTS.grey}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
              />
            </div>
          </div>
        )}

        {sConfirmStep === 2 && (
          <div className={styles.confirmBlock}>
            <span className={styles.confirmWarning} style={{ color: C.red }}>
              FINAL CONFIRMATION: This action cannot be undone. Restore all data
              from the last nightly backup?
            </span>
            <div className={styles.confirmRow}>
              <Button
                text={sRehydrating ? "Restoring..." : "CONFIRM RESTORE"}
                onPress={handleRehydrate}
                colorGradientArr={COLOR_GRADIENTS.red}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                disabled={sRehydrating}
                loading={sRehydrating}
              />
              <Button
                text="Cancel"
                onPress={() => _setConfirmStep(0)}
                colorGradientArr={COLOR_GRADIENTS.grey}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                disabled={sRehydrating}
              />
            </div>
          </div>
        )}

        {!!sRehydrateResult && (
          <div
            className={`${styles.resultBox} ${
              sRehydrateResult.success
                ? styles.resultBoxSuccess
                : styles.resultBoxFailure
            }`}
          >
            <span
              className={styles.resultTitle}
              style={{ color: sRehydrateResult.success ? C.green : C.red }}
            >
              {sRehydrateResult.success ? "Restore Complete" : "Restore Failed"}
            </span>
            {sRehydrateResult.success &&
              sRehydrateResult.results &&
              Object.entries(sRehydrateResult.results).map(([name, r]) => (
                <span
                  key={name}
                  className={styles.resultLine}
                  style={{ color: C.text }}
                >
                  {name}:{" "}
                  {r.success
                    ? r.docCount + " docs restored"
                    : "FAILED — " + r.error}
                </span>
              ))}
            {!sRehydrateResult.success && sRehydrateResult.error && (
              <span className={styles.resultLine} style={{ color: C.red }}>
                {sRehydrateResult.error}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.sectionGap} />

      {/*** ARCHIVE LOGS SECTION ***/}
      <div className={styles.innerBox}>
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          NIGHTLY BACKUP LOGS
        </span>

        {sLogs.length === 0 && !sLoading && (
          <Button
            text="Load Logs"
            onPress={handleLoadInitial}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          />
        )}

        {sLoading && (
          <span className={styles.loadingText} style={{ color: gray(0.5) }}>
            Loading...
          </span>
        )}

        {sLogs.length > 0 &&
          sLogs.map((logEntry) => (
            <div key={logEntry.id} className={styles.logCard}>
              <div className={styles.logCardHeader}>
                <span
                  className={styles.logCardDate}
                  style={{ color: C.text }}
                >
                  {logEntry.date || "—"}
                </span>
                <span
                  className={styles.logCardMillis}
                  style={{ color: gray(0.5) }}
                >
                  {logEntry.millis
                    ? formatMillisForDisplay(logEntry.millis)
                    : ""}
                </span>
              </div>
              <span
                className={styles.logCardType}
                style={{
                  color:
                    logEntry.type === "rehydration" ? C.orange : C.green,
                }}
              >
                {logEntry.type === "rehydration"
                  ? "REHYDRATION"
                  : "NIGHTLY ARCHIVE"}
              </span>

              {logEntry.archive &&
                Object.entries(logEntry.archive).map(([name, r]) => (
                  <span
                    key={name}
                    className={styles.logCardLine}
                    style={{ color: C.text }}
                  >
                    {name}:{" "}
                    {r.success
                      ? r.docCount + " docs"
                      : "FAILED — " + (r.error || "unknown")}
                  </span>
                ))}

              {logEntry.mediaCleanup && (
                <span
                  className={styles.logCardMediaLine}
                  style={{
                    color: logEntry.mediaCleanup.success ? C.text : C.red,
                  }}
                >
                  Media cleanup:{" "}
                  {logEntry.mediaCleanup.success
                    ? logEntry.mediaCleanup.workordersProcessed +
                      " workorders, " +
                      logEntry.mediaCleanup.mediaFilesDeleted +
                      " files deleted"
                    : "FAILED — " + (logEntry.mediaCleanup.error || "unknown")}
                </span>
              )}

              {logEntry.collections &&
                Object.entries(logEntry.collections).map(([name, r]) => (
                  <span
                    key={name}
                    className={styles.logCardLine}
                    style={{ color: C.text }}
                  >
                    {name}:{" "}
                    {r.success
                      ? r.docCount + " docs restored"
                      : "FAILED — " + (r.error || "unknown")}
                  </span>
                ))}
            </div>
          ))}

        {sLogs.length > 0 && (
          <Button
            text={"Load Another Week (Week " + (sWeeksLoaded + 1) + ")"}
            onPress={handleLoadMore}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{
              borderRadius: 5,
              paddingHorizontal: 20,
              marginTop: 5,
            }}
            loading={sLoading}
            disabled={sLoading}
          />
        )}
      </div>

      <div className={styles.sectionGap} />

      <SettingsCSVComponent />
    </div>
  );
}
