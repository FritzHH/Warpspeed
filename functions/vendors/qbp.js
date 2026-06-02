/* eslint-disable */
// QBP vendor submission handler — SCAFFOLD.
//
// Not yet implemented. QBP's dealer submission surface (EDI / API / portal
// upload) needs to be confirmed before the real implementation can be
// written. When QBP integration is prioritized:
//
//   1. Confirm the submission channel (EDI X12 850? REST API? portal CSV?)
//   2. Document the credential shape (account number, certificates, etc.)
//      so the UI's credential form can match.
//   3. Implement `submit` below and remove the throw.
//
// The handler is registered in the registry so attempting to submit a QBP
// order returns a clear "not implemented" error to the UI rather than
// silently doing nothing.

exports.submit = async function qbpSubmit({ order, items, vendorConfig, creds, ctx }) {
  throw new Error(
    "QBP submission is not yet implemented. Please confirm QBP's dealer integration spec."
  );
};
