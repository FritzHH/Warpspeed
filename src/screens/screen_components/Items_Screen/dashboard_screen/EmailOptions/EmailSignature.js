import React, { useState } from "react";
import { TouchableOpacity } from "../../../../../dom_components";
import { C, Fonts } from "../../../../../styles";
import { gray, lightenRGBByPercent } from "../../../../../utils";
import { BoxContainerInner, BoxContainerOuter } from "./_helpers";
import { SignatureEditor } from "./SignatureEditor";

export const EmailSignature = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const emailAccounts = zSettingsObj?.emailAccounts || [];
  const [sSelectedAccountKey, _sSetSelectedAccountKey] = useState(emailAccounts[0]?.accountKey || "");

  if (emailAccounts.length === 0) {
    return (
      <BoxContainerOuter style={{ marginTop: 20, marginBottom: 20 }}>
        <BoxContainerInner style={{ width: "100%", alignItems: "flex-start", paddingTop: 20, paddingBottom: 20 }}>
          <span style={{ fontWeight: Fonts.weight.textHeavy, color: C.text, fontSize: 16, marginBottom: 10, alignSelf: "center" }}>
            {"Email Signature"}
          </span>
          <span style={{ fontSize: 13, color: gray(0.5), textAlign: "center", alignSelf: "center" }}>
            {"Add email accounts above to configure per-account signatures."}
          </span>
        </BoxContainerInner>
      </BoxContainerOuter>
    );
  }

  return (
    <BoxContainerOuter style={{ marginTop: 20, marginBottom: 20 }}>
      <BoxContainerInner style={{ width: "100%", alignItems: "flex-start", paddingTop: 20, paddingBottom: 20 }}>
        <span style={{ fontWeight: Fonts.weight.textHeavy, color: C.text, fontSize: 16, marginBottom: 15, alignSelf: "center" }}>
          {"Email Signature"}
        </span>
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
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
          accountKey={sSelectedAccountKey}
        />
      </BoxContainerInner>
    </BoxContainerOuter>
  );
};
