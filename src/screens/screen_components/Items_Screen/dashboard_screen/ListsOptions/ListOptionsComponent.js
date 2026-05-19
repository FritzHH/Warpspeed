import React from "react";
import { BoxContainerOuter, BoxContainerInner } from "./_helpers";
import { BikeBrands } from "./BikeBrands";
import { Discounts } from "./Discounts";
import { WaitTimes } from "./WaitTimes";
import { PartSources } from "./PartSources";
import { NoteHelpersAdmin } from "./NoteHelpersAdmin";
import { CustomerQuickNotesAdmin } from "./CustomerQuickNotesAdmin";

export const ListOptionsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  return (
    <BoxContainerOuter>
      <BoxContainerInner style={{ alignItems: "center" }}>
        <BikeBrands
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <Discounts
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <WaitTimes
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <PartSources
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <NoteHelpersAdmin
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <CustomerQuickNotesAdmin
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
      </BoxContainerInner>
    </BoxContainerOuter>
  );
};
