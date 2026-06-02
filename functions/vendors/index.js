/* eslint-disable */
// Vendor handler registry.
//
// Maps vendorID → handler module for locked vendors (bespoke integrations
// shipped with the platform). Custom (user-added) vendors do NOT submit
// through this pipeline — they're CSV-download-only on the frontend.
//
// Adding a new locked vendor: implement functions/vendors/<id>.js exporting
// `submit({ order, items, vendorConfig, creds, ctx })`, then register below
// under LOCKED_VENDORS.
//
// Handler return contract:
//   - Resolve: any JSON-serializable summary value (written to submission.result)
//   - Throw:   any Error; .message is stamped onto submission.error
//
// Handlers must NOT swallow auth/network errors — let them propagate so the
// retry budget kicks in.

const jbi = require("./jbi");
const qbp = require("./qbp");

// Locked, bespoke integrations. Adding/removing requires a code deploy.
const LOCKED_VENDORS = {
  jbi: jbi,
  qbp: qbp,
};

function getHandler(vendorID) {
  if (vendorID && LOCKED_VENDORS[vendorID]) {
    return LOCKED_VENDORS[vendorID];
  }
  return null;
}

// Aggregate every secret declared by any handler module. The worker
// function MUST include this whole list in its `secrets:` option so any
// handler can call its secret's `.value()` at runtime. A handler that
// doesn't need secrets just omits the `secrets` export.
const ALL_HANDLER_SECRETS = []
  .concat(jbi.secrets || [])
  .concat(qbp.secrets || []);

module.exports = {
  getHandler,
  LOCKED_VENDORS,
  ALL_HANDLER_SECRETS,
};
