import React from "react";
import { EmailInboxes } from "./EmailInboxes";
import { EmailSignature } from "./EmailSignature";
import { EmailTemplates } from "./EmailTemplates";

export const EmailOptionsComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  return (
    <>
      <EmailInboxes
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
      />
      <EmailSignature
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
      />
      <EmailTemplates
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
      />
    </>
  );
};
