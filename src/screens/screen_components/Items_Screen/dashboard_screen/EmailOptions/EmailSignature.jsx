import React, { useState } from "react";
import { TouchableOpacity } from "../../../../../dom_components";
import { C, Fonts, Radius } from "../../../../../styles";
import { lightenRGBByPercent } from "../../../../../utils";
import { useEmailStore, useSettingsStore } from "../../../../../stores";
import { BoxContainerInner, BoxContainerOuter } from "./_helpers";
import { SignatureEditor } from "./SignatureEditor";

export const EmailSignature = () => {
  const zEmailAccounts = useEmailStore((state) => state.emailAccounts) || [];
  const zCurrentStoreID = useSettingsStore((state) => state.getSettings()?.storeID);
  const emailAccounts = zEmailAccounts.filter(
    (a) => !a.assignedStoreID || a.assignedStoreID === zCurrentStoreID
  );
  const [sSelectedAccountKey, _sSetSelectedAccountKey] = useState(emailAccounts[0]?.accountKey || "");

  if (emailAccounts.length === 0) {
    return (
      <BoxContainerOuter style={{ marginTop: 20, marginBottom: 20 }}>
        <BoxContainerInner style={{ width: "100%", alignItems: "flex-start", paddingTop: 20, paddingBottom: 20 }}>
          <div style={{ width: "100%", marginBottom: 10, padding: "10px 16px", background: `linear-gradient(135deg, ${C.darkBlue} 0%, ${C.blue} 100%)`, borderRadius: Radius.control, boxSizing: "border-box", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: 18, fontWeight: "700", color: "white", textAlign: "center", display: "block", letterSpacing: 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
              {"Email Signature"}
            </span>
          </div>
          <span style={{ fontSize: 13, color: C.textMuted, textAlign: "center", alignSelf: "center" }}>
            {"Add email accounts above to configure per-account signatures."}
          </span>
        </BoxContainerInner>
      </BoxContainerOuter>
    );
  }

  return (
    <BoxContainerOuter style={{ marginTop: 20, marginBottom: 20 }}>
      <BoxContainerInner style={{ width: "100%", alignItems: "flex-start", paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ width: "100%", marginBottom: 15, padding: "10px 16px", background: `linear-gradient(135deg, ${C.darkBlue} 0%, ${C.blue} 100%)`, borderRadius: Radius.control, boxSizing: "border-box", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }}>
          <span style={{ fontSize: 18, fontWeight: "700", color: "white", textAlign: "center", display: "block", letterSpacing: 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
            {"Email Signature"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "row", width: "100%", marginBottom: 15, flexShrink: 0 }}>
          {emailAccounts.map((acct) => (
            <TouchableOpacity
              key={acct.accountKey}
              onPress={() => _sSetSelectedAccountKey(acct.accountKey)}
              activeOpacity={0.8}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 8,
                paddingBottom: 8,
                backgroundColor:
                  sSelectedAccountKey === acct.accountKey
                    ? C.orange
                    : lightenRGBByPercent(C.orange, 60),
              }}
            >
              <span style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.textWhite }}>
                {acct.displayName}
              </span>
            </TouchableOpacity>
          ))}
        </div>
        <SignatureEditor
          key={sSelectedAccountKey}
          accountKey={sSelectedAccountKey}
        />
      </BoxContainerInner>
    </BoxContainerOuter>
  );
};
