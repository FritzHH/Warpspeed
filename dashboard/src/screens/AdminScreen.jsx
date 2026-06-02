import React from "react";
import { Link } from "react-router-dom";

// Hub for platform-level operational tools. Each entry below is one admin
// section; when a section's screen ships, give it a `path` and the row turns
// into an "Open" link. Sections without a `path` render as Coming soon.
//
// Adding a section: append to ADMIN_SECTIONS, then add the screen file and
// wire its route in App.jsx pointing at the same `path`.
const ADMIN_SECTIONS = [
  {
    id: "scheduled-jobs",
    title: "Scheduled jobs",
    description:
      "Pause, resume, and adjust cadence on Cloud Scheduler jobs — vendor catalog syncs (JBI master/inventory/specs), billing sweeps, and any other recurring server work. Firebase-owned jobs are visible but read-only.",
    path: "/admin/scheduled-jobs",
  },
];

export function AdminScreen() {
  return (
    <div className="pageScreen">
      <div className="card cardList">
        <div className="listHeader">
          <div>
            <Link to="/" className="linkButton">
              ← Back to tenants
            </Link>
            <h1 className="cardTitle">Cadence admin</h1>
            <p className="cardSubtitle">
              Platform-level operational tools. More sections will land here
              as they come online.
            </p>
          </div>
        </div>

        {ADMIN_SECTIONS.map((section) => (
          <AdminSectionRow key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}

function AdminSectionRow({ section }) {
  const comingSoon = !section.path;
  return (
    <div className="formBlock">
      <div className="sectionHeading">{section.title}</div>
      <p className="helperText">{section.description}</p>
      <div className="buttonRow">
        {comingSoon ? (
          <span className="placeholderText">Coming soon</span>
        ) : (
          <Link to={section.path} className="secondaryButton">
            Open
          </Link>
        )}
      </div>
    </div>
  );
}
