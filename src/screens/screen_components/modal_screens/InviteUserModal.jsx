/* eslint-disable */
// Tenant-owner UI for inviting a new SaaS user. Calls
// tenantAdminInviteUserCallable, then renders the returned sign-in link
// with a copy button — the owner shares it via email/SMS/Slack manually.
// The callable also writes an invite doc; redemption happens at
// /invite-accept once the recipient clicks the link.
import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { FUNCTIONS } from "../../../db_calls";
import { Dialog, ModalFooter, ModalFooterButton } from "../../../dom_components";
import { C } from "../../../styles";
import styles from "./InviteUserModal.module.css";

const PRIVILEGES = ["user", "editor", "manager", "admin"];

function parseStoreIDs(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const InviteUserModal = ({ visible, onClose }) => {
  const [sEmail, _sSetEmail] = useState("");
  const [sPrivilege, _sSetPrivilege] = useState("user");
  const [sStoresRaw, _sSetStoresRaw] = useState("");
  const [sSubmitting, _sSetSubmitting] = useState(false);
  const [sError, _sSetError] = useState("");
  const [sResult, _sSetResult] = useState(null);
  const [sCopied, _sSetCopied] = useState(false);

  function resetForm() {
    _sSetEmail("");
    _sSetPrivilege("user");
    _sSetStoresRaw("");
    _sSetError("");
    _sSetResult(null);
    _sSetCopied(false);
  }

  function handleClose() {
    resetForm();
    onClose && onClose();
  }

  async function handleSubmit() {
    _sSetError("");
    const email = sEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      _sSetError("Please enter a valid email address.");
      return;
    }
    const stores = parseStoreIDs(sStoresRaw);
    if (sPrivilege !== "owner" && stores.length === 0) {
      _sSetError("Specify at least one store ID for non-owner invites.");
      return;
    }
    _sSetSubmitting(true);
    try {
      const fn = httpsCallable(FUNCTIONS, "tenantAdminInviteUserCallable");
      const res = await fn({ email, privilege: sPrivilege, stores });
      _sSetResult(res.data);
    } catch (err) {
      const msg = (err && err.message) || "Invite failed. Please try again.";
      _sSetError(msg);
    } finally {
      _sSetSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!sResult || !sResult.signInLink) return;
    try {
      await navigator.clipboard.writeText(sResult.signInLink);
      _sSetCopied(true);
      setTimeout(() => _sSetCopied(false), 1500);
    } catch (err) {
      _sSetError("Could not copy to clipboard.");
    }
  }

  return (
    <Dialog visible={visible} onClose={handleClose} title="Invite user" aria-label="Invite user">
      <div className={styles.card}>
        <div className={styles.cardInner}>
          <div className={styles.header}>
            <span className={styles.title} style={{ color: C.text }}>
              Invite user
            </span>
          </div>

          {!sResult && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email</label>
                <input
                  type="email"
                  className={styles.textInput}
                  value={sEmail}
                  onChange={(e) => _sSetEmail(e.target.value)}
                  placeholder="invitee@example.com"
                  disabled={sSubmitting}
                  autoFocus
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Privilege</label>
                <select
                  className={styles.select}
                  value={sPrivilege}
                  onChange={(e) => _sSetPrivilege(e.target.value)}
                  disabled={sSubmitting}
                >
                  {PRIVILEGES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <div className={styles.helperText}>
                  Owners can only be created when provisioning a new tenant.
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Store IDs</label>
                <input
                  type="text"
                  className={styles.textInput}
                  value={sStoresRaw}
                  onChange={(e) => _sSetStoresRaw(e.target.value)}
                  placeholder="store-1, store-2"
                  disabled={sSubmitting}
                />
                <div className={styles.helperText}>
                  Comma-separated store IDs the user can access.
                </div>
              </div>

              {sError && <div className={styles.errorText}>{sError}</div>}
            </>
          )}

          {sResult && (
            <div className={styles.successBlock}>
              <div className={styles.successText}>
                Invite created. Share this sign-in link with the user — it expires in 7 days.
              </div>
              <div className={styles.linkBox}>{sResult.signInLink}</div>
              <button
                type="button"
                className={styles.copyButton}
                onClick={handleCopyLink}
              >
                {sCopied ? "Copied!" : "Copy link"}
              </button>
            </div>
          )}
        </div>

        <ModalFooter>
          {!sResult && (
            <>
              <ModalFooterButton variant="default" onClick={handleClose}>
                Cancel
              </ModalFooterButton>
              <ModalFooterButton
                variant="accent"
                onClick={handleSubmit}
                disabled={sSubmitting}
              >
                {sSubmitting ? "Sending..." : "Send invite"}
              </ModalFooterButton>
            </>
          )}
          {sResult && (
            <>
              <ModalFooterButton variant="default" onClick={resetForm}>
                Invite another
              </ModalFooterButton>
              <ModalFooterButton variant="accent" onClick={handleClose}>
                Done
              </ModalFooterButton>
            </>
          )}
        </ModalFooter>
      </div>
    </Dialog>
  );
};
