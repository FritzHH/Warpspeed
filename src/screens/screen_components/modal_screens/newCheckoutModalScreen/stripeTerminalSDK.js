/* eslint-disable */
import { loadStripeTerminal } from "@stripe/terminal-js";
import { httpsCallable } from "firebase/functions";
import { log } from "../../../../utils";
import { dlog, DCAT } from "./checkoutDebugLog";

// ─── Terminal SDK Singleton ──────────────────────────────────
// Lazy-initialized module-level singleton. Persists across
// component re-mounts. The SDK manages its own connection
// token refresh cycle via onFetchConnectionToken.

let _terminal = null;
let _initPromise = null;
let _functions = null;

async function getFunctionsInstance() {
  if (!_functions) {
    const { FUNCTIONS } = await import("../../../../db_calls");
    _functions = FUNCTIONS;
  }
  return _functions;
}

async function fetchConnectionToken() {
  console.log("[CARD_READER] SDK fetchConnectionToken called");
  dlog(DCAT.STRIPE_REQ, "fetchConnectionToken", "TerminalSDK", {});
  const fns = await getFunctionsInstance();
  const callable = httpsCallable(fns, "newCheckoutConnectionTokenCallable");
  const result = await callable({});
  const secret = result.data?.secret;
  console.log("[CARD_READER] SDK fetchConnectionToken result:", secret ? "token received" : "NO TOKEN", JSON.stringify(result.data));
  dlog(DCAT.STRIPE_RES, "fetchConnectionToken", "TerminalSDK", { hasSecret: !!secret });
  if (!secret) throw new Error("Connection token missing from server response");
  return secret;
}

/**
 * Returns the Terminal SDK singleton. Initializes on first call.
 */
export async function getTerminalInstance() {
  if (_terminal) return _terminal;
  if (_initPromise) return _initPromise;

  console.log("[CARD_READER] SDK initializing StripeTerminal...");
  _initPromise = (async () => {
    dlog(DCAT.INIT, "initTerminalSDK", "TerminalSDK", {});
    const StripeTerminal = await loadStripeTerminal();
    console.log("[CARD_READER] SDK loadStripeTerminal result:", StripeTerminal ? "loaded" : "FAILED");
    if (!StripeTerminal) throw new Error("Failed to load Stripe Terminal SDK");

    _terminal = StripeTerminal.create({
      onFetchConnectionToken: fetchConnectionToken,
      onUnexpectedReaderDisconnect: (event) => {
        console.log("[CARD_READER] SDK onUnexpectedReaderDisconnect:", JSON.stringify(event));
        log("Terminal SDK: reader disconnected unexpectedly", event);
        dlog(DCAT.STRIPE_ERR, "unexpectedDisconnect", "TerminalSDK", { error: event?.error?.message });
      },
      onConnectionStatusChange: (event) => {
        console.log("[CARD_READER] SDK connectionStatus:", event.status);
        dlog(DCAT.STRIPE_RES, "connectionStatusChange", "TerminalSDK", { status: event.status });
      },
      onPaymentStatusChange: (event) => {
        console.log("[CARD_READER] SDK paymentStatus:", event.status);
        dlog(DCAT.STRIPE_RES, "paymentStatusChange", "TerminalSDK", { status: event.status });
      },
    });

    console.log("[CARD_READER] SDK initialized successfully");
    dlog(DCAT.INIT, "initTerminalSDK_done", "TerminalSDK", {});
    return _terminal;
  })();

  try {
    return await _initPromise;
  } catch (err) {
    console.log("[CARD_READER] SDK init FAILED:", err?.message, err);
    _initPromise = null; // allow retry on failure
    throw err;
  }
}

/**
 * Connect to a Stripe Terminal reader. Must be called before collectAndProcessPayment.
 * Uses SDK discoverReaders() to get a properly-formatted reader object, then connects.
 * @param {Object} reader - Reader object with at least { id } to match against discovered readers
 * @returns {Object} The connected reader object
 */
export async function connectToReader(reader) {
  console.log("[CARD_READER] SDK connectToReader:", JSON.stringify({ id: reader?.id, status: reader?.status, deviceType: reader?.device_type, label: reader?.label }));
  dlog(DCAT.STRIPE_REQ, "connectToReader", "TerminalSDK", { readerId: reader?.id });
  const terminal = await getTerminalInstance();

  // Disconnect any previously connected reader first
  const current = terminal.getConnectedReader();
  if (current) {
    console.log("[CARD_READER] SDK disconnecting previous reader:", current.id);
    dlog(DCAT.ACTION, "disconnectPreviousReader", "TerminalSDK", { previousId: current.id });
    await terminal.disconnectReader();
  }

  // Discover readers via SDK to get properly-formatted objects for connectReader
  console.log("[CARD_READER] SDK discovering readers...");
  const discoverResult = await terminal.discoverReaders();
  if ("error" in discoverResult) {
    console.log("[CARD_READER] SDK discoverReaders ERROR:", discoverResult.error);
    dlog(DCAT.STRIPE_ERR, "discoverReaders", "TerminalSDK", { error: discoverResult.error.message });
    throw discoverResult.error;
  }

  console.log("[CARD_READER] SDK discovered", discoverResult.discoveredReaders?.length, "readers:", JSON.stringify(discoverResult.discoveredReaders));

  // Find the target reader by ID from the discovered list
  const sdkReader = discoverResult.discoveredReaders?.find(r => r.id === reader.id);
  if (!sdkReader) {
    const msg = "Reader " + reader.id + " not found in SDK discovery (found: " +
      (discoverResult.discoveredReaders?.map(r => r.id).join(", ") || "none") + ")";
    console.log("[CARD_READER] SDK connectToReader ERROR:", msg);
    dlog(DCAT.STRIPE_ERR, "connectToReader", "TerminalSDK", { error: msg });
    throw new Error(msg);
  }

  console.log("[CARD_READER] SDK calling terminal.connectReader with discovered reader...", JSON.stringify(sdkReader));
  const result = await terminal.connectReader(sdkReader);
  if ("error" in result) {
    console.log("[CARD_READER] SDK connectToReader ERROR:", JSON.stringify(result.error));
    dlog(DCAT.STRIPE_ERR, "connectToReader", "TerminalSDK", { error: result.error.message });
    throw result.error;
  }

  console.log("[CARD_READER] SDK connectToReader SUCCESS:", result.reader?.id);
  dlog(DCAT.STRIPE_RES, "connectToReader", "TerminalSDK", { readerId: result.reader.id });
  return result.reader;
}

/**
 * Disconnect from the currently connected reader.
 */
export async function disconnectReader() {
  if (!_terminal) return;
  try {
    const current = _terminal.getConnectedReader();
    if (current) {
      console.log("[CARD_READER] SDK disconnectReader:", current.id);
      dlog(DCAT.ACTION, "disconnectReader", "TerminalSDK", { readerId: current.id });
      await _terminal.disconnectReader();
    }
  } catch (e) {
    console.log("[CARD_READER] SDK disconnect error (non-fatal):", e?.message);
    log("Terminal SDK: disconnect error (non-fatal)", e);
  }
}

/**
 * Collect payment method from reader and process the payment.
 * Two-step flow: collectPaymentMethod (card tap/insert) → processPayment (charge card).
 * @param {string} clientSecret - PaymentIntent client_secret from the server
 * @returns {Object} The confirmed PaymentIntent with charges expanded
 */
export async function collectAndProcessPayment(clientSecret) {
  const terminal = await getTerminalInstance();

  // Step 1: Collect payment method — reader prompts for card
  console.log("[CARD_READER] SDK collectPaymentMethod called, clientSecret:", clientSecret ? clientSecret.substring(0, 20) + "..." : "MISSING");
  dlog(DCAT.STRIPE_REQ, "collectPaymentMethod", "TerminalSDK", {});
  const collectResult = await terminal.collectPaymentMethod(clientSecret);
  if ("error" in collectResult) {
    console.log("[CARD_READER] SDK collectPaymentMethod ERROR:", JSON.stringify(collectResult.error));
    dlog(DCAT.STRIPE_ERR, "collectPaymentMethod", "TerminalSDK", {
      message: collectResult.error.message,
      decline_code: collectResult.error.decline_code,
    });
    throw collectResult.error;
  }
  console.log("[CARD_READER] SDK collectPaymentMethod SUCCESS — card collected");

  // Step 2: Process payment — charges the card
  console.log("[CARD_READER] SDK processPayment called...");
  dlog(DCAT.STRIPE_REQ, "processPayment", "TerminalSDK", {});
  const processResult = await terminal.processPayment(collectResult.paymentIntent);
  if ("error" in processResult) {
    console.log("[CARD_READER] SDK processPayment ERROR:", JSON.stringify(processResult.error));
    dlog(DCAT.STRIPE_ERR, "processPayment", "TerminalSDK", {
      message: processResult.error.message,
      decline_code: processResult.error.decline_code,
    });
    throw processResult.error;
  }

  console.log("[CARD_READER] SDK processPayment SUCCESS:", JSON.stringify(processResult.paymentIntent));
  dlog(DCAT.STRIPE_RES, "processPayment", "TerminalSDK", {
    paymentIntentId: processResult.paymentIntent?.id,
    status: processResult.paymentIntent?.status,
  });

  return processResult.paymentIntent;
}

/**
 * Cancel an in-flight collectPaymentMethod call.
 */
export async function cancelCollect() {
  if (!_terminal) return;
  try {
    console.log("[CARD_READER] SDK cancelCollect called");
    dlog(DCAT.ACTION, "cancelCollect", "TerminalSDK", {});
    await _terminal.cancelCollectPaymentMethod();
  } catch (e) {
    // cancelCollect can throw if there's nothing to cancel — non-fatal
    console.log("[CARD_READER] SDK cancel error (non-fatal):", e?.message);
    log("Terminal SDK: cancel error (non-fatal)", e);
  }
}
