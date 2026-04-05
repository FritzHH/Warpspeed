/* eslint-disable */
import { localStorageWrapper } from "./utils";
import { generateIdCallable } from "./db_calls";
import { generatePrefixedEAN13 } from "./utils";
import { log } from "./utils";

// ─── Config ──────────────────────────────────────────────────
const POOL_KEY = "warpspeed_id_pool";
const BUFFER_SIZE = 5;
const ID_PREFIXES = { workorders: "1", sales: "2", transactions: "3" };
const POOL_TYPES = ["workorders", "sales", "transactions"];

// ─── Internal Helpers ────────────────────────────────────────
const _refilling = new Map(); // Prevents concurrent refills per type

function _readPool() {
  try {
    let pool = localStorageWrapper.getItem(POOL_KEY);
    if (pool && typeof pool === "object") return pool;
  } catch (e) {}
  return { workorders: [], sales: [], transactions: [] };
}

function _writePool(pool) {
  localStorageWrapper.setItem(POOL_KEY, pool);
}

async function _refillType(node) {
  if (_refilling.get(node)) return;
  _refilling.set(node, true);

  try {
    let pool = _readPool();
    if (!pool[node]) pool[node] = [];

    while (pool[node].length < BUFFER_SIZE) {
      try {
        let result = await generateIdCallable({ node });
        let id = result.data?.id;
        if (!id) throw new Error("No ID returned");
        pool[node].push(id);
        _writePool(pool);
      } catch (e) {
        log("idPool: refill failed for " + node + ", using local fallback", e?.message);
        let fallback = generatePrefixedEAN13(ID_PREFIXES[node] || "0");
        pool[node].push(fallback);
        _writePool(pool);
      }
    }
  } finally {
    _refilling.delete(node);
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Synchronously grab an ID from the pool.
 * Returns the ID string if available, or null if pool is empty.
 * Triggers background refill after checkout.
 */
export function takeId(node) {
  let pool = _readPool();
  let ids = pool[node] || [];
  if (ids.length === 0) return null;

  let id = ids.shift();
  pool[node] = ids;
  _writePool(pool);

  // Background refill
  setTimeout(() => _refillType(node), 0);
  return id;
}

/**
 * Get an ID - tries pool first, falls back to Cloud Function,
 * falls back to local generation. Never throws.
 * @returns {Promise<string>}
 */
export async function getId(node) {
  let id = takeId(node);
  if (id) return id;

  // Pool empty - fetch directly
  try {
    let result = await generateIdCallable({ node });
    let fetchedId = result.data?.id;
    if (fetchedId) {
      // Also trigger background refill to replenish the pool
      setTimeout(() => _refillType(node), 0);
      return fetchedId;
    }
  } catch (e) {
    log("idPool: getId fetch failed for " + node + ", using local fallback", e?.message);
  }

  // Cloud Function failed - local fallback
  setTimeout(() => _refillType(node), 0);
  return generatePrefixedEAN13(ID_PREFIXES[node] || "0");
}

/**
 * Top up all pools to BUFFER_SIZE. Fire-and-forget.
 * Safe to call multiple times; concurrent calls are coalesced per type.
 */
export function topUpPool() {
  for (let type of POOL_TYPES) {
    let pool = _readPool();
    if ((pool[type] || []).length < BUFFER_SIZE) {
      _refillType(type);
    }
  }
}

/**
 * Clear the pool from localStorage (called on logout).
 */
export function clearIdPool() {
  localStorageWrapper.removeItem(POOL_KEY);
}
