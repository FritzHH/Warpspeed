// QBP API1 REST client.
//
// One auth surface: every request carries the X-QBPAPI-KEY header sourced
// from process.env.QBP_API_KEY. The key is per-customer-account on QBP's
// side — Bonita's key is what this Cloud Run Job uses.
//
// XML, not JSON. QBP's docs claim both formats are supported, but in
// practice every JSON request observed against API1 returned 406. The
// scripts/qbp-eftp-test/1-discover.js probe confirmed XML works across
// /customer, /customer/terms, etc. So all requests here go out with
// Accept: application/xml and responses are parsed via fast-xml-parser.
//
// Two cross-cutting behaviors live here so the mode files stay focused on
// data shape:
//
//   1. Retry: 429 + 5xx get exponential backoff (3 tries, 500ms → 1500ms →
//      4500ms). 4xx other than 429 fail fast — they're caller bugs.
//   2. mapWithConcurrency: bounded-parallel async iteration. Master mode
//      fetches per-SKU details for tens of thousands of SKUs; without a
//      concurrency cap we'd either DOS QBP (Promise.all on the full list)
//      or take hours (serial await loop). 8 in flight is a polite default.

const { XMLParser } = require("fast-xml-parser");

const BASE_URL = (
  process.env.QBP_API_BASE_URL || "https://api1.qbp.com/api/1/"
).replace(/\/+$/, "/");

const API_KEY = process.env.QBP_API_KEY;
const DEFAULT_CONCURRENCY = Number(process.env.QBP_CONCURRENCY || 8);
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

// parseTagValue: false keeps everything as strings — important for SKUs and
// account numbers with leading zeros (e.g. "0000115882" must not become
// 115882). isArray forces leaf tags that QBP repeats (sku, pack, item, etc.)
// to always be arrays even when only one element comes back, so consumers
// don't have to special-case the single vs. many shapes.
const REPEATED_TAGS = new Set([
  "sku",
  "product",
  "item",
  "pack",
  "upc",
  "availability",
  "warehouse",
  "brand",
  "category",
  "model",
  "term",
  "shipVia",
  "shipvia",
  "bulletPoint",
  "substitute",
  "supersede",
  "smallPart",
  "seeAlso",
  "recommendation",
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => REPEATED_TAGS.has(name),
});

function assertConfigured() {
  if (!API_KEY) {
    throw new Error(
      "QBP_API_KEY env var required (Bonita's API1 key from QBP)."
    );
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// HTTP wrapper. Retries on 429/5xx with exponential backoff so a transient
// QBP outage during a 50k-SKU master sync doesn't tank the whole run.
// Method is GET unless `body` is provided (then POST + JSON encode).
async function qbpRequest(pathOrPath, { body, method } = {}) {
  assertConfigured();
  const url = pathOrPath.startsWith("http")
    ? pathOrPath
    : `${BASE_URL}${pathOrPath.replace(/^\/+/, "")}`;

  const init = {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "X-QBPAPI-KEY": API_KEY,
      Accept: "application/xml",
    },
  };
  if (body !== undefined) {
    // POST bodies stay JSON — API1 accepts mixed: JSON body + XML response.
    // Switch to XML serialization here if QBP ever rejects that combo.
    init.headers["Content-Type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(RETRY_BASE_MS * Math.pow(3, attempt));
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      if (!text) return null;
      try {
        return xmlParser.parse(text);
      } catch (err) {
        throw new Error(
          `QBP ${init.method} ${url}: XML parse failed (${err.message}). Body head: ${text.slice(0, 200)}`
        );
      }
    }
    // 429 / 5xx — retry. Everything else fails fast.
    const isRetriable = res.status === 429 || res.status >= 500;
    if (!isRetriable || attempt === MAX_RETRIES) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `QBP ${init.method} ${url} -> ${res.status} ${res.statusText}: ${errText.slice(0, 400)}`
      );
    }
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter
      : RETRY_BASE_MS * Math.pow(3, attempt);
    await sleep(wait);
  }
  throw lastErr || new Error(`QBP request exhausted retries: ${url}`);
}

// Polite parallel iteration. Resolves with results in input order. Failures
// reject the whole call — the caller decides whether to swallow per-item
// errors before passing the list in (e.g., master mode wraps with a try/catch
// and tracks a missCount instead of aborting on a single bad SKU).
async function mapWithConcurrency(items, fn, { concurrency = DEFAULT_CONCURRENCY } = {}) {
  const results = new Array(items.length);
  let nextIdx = 0;
  const workers = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    });
  await Promise.all(workers);
  return results;
}

module.exports = {
  qbpRequest,
  mapWithConcurrency,
  BASE_URL,
  DEFAULT_CONCURRENCY,
};
