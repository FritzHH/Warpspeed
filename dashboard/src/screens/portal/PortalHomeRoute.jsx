import React from "react";
import { Link, useOutletContext } from "react-router-dom";

// Portal landing route. Shown when a tenant hits /portal directly
// (e.g., bookmarked the link or arrived without a ?next= deep-link).
//
// For v1 the only portal action is "start a number port-in," so this is a
// thin index page listing what's available. As more post-onboarding flows
// land (DLR diagnostics, A2P resubmission, billing history, etc.), they
// get added to this list.

export function PortalHomeRoute() {
  const { email } = useOutletContext();

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <h1 className="cardTitle">Cadence POS owner portal</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. Pick a task to continue.
        </p>

        <div className="portalActionList">
          <Link to="/portal/port-number" className="portalActionRow">
            <div className="portalActionBody">
              <div className="portalActionTitle">Port in your phone number</div>
              <div className="portalActionDetail">
                Move your existing business number onto Cadence. If you signed
                up with a temporary pool number, finish your port-in here
                before it expires.
              </div>
            </div>
            <div className="portalActionChevron">→</div>
          </Link>
        </div>

        <p className="helperText">
          Need something else? Sign in to the POS app — most settings live
          inside Subscription, Billing, and Store settings.
        </p>
      </div>
    </div>
  );
}
