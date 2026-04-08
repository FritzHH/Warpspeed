/**
 * hubMessageDB.js - IndexedDB wrapper for hub messaging cache
 *
 * Two object stores:
 *   threadCards   - keyed by phone, stores thread metadata (never purged)
 *   messages      - keyed by [phone, id], indexed by [phone, millis], capped at 20 per phone
 *
 * All methods are async. This module is imported by stores.js and BaseScreen.js.
 */

const DB_NAME = "hubMessages";
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("threadCards")) {
        db.createObjectStore("threadCards", { keyPath: "phone" });
      }
      if (!db.objectStoreNames.contains("messages")) {
        const msgStore = db.createObjectStore("messages", { keyPath: ["phone", "id"] });
        msgStore.createIndex("byPhoneMillis", ["phone", "millis"]);
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

// ── Thread Cards ──

export async function putThreadCard(phone, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threadCards", "readwrite");
    tx.objectStore("threadCards").put({ ...data, phone });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putThreadCards(cards) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threadCards", "readwrite");
    const store = tx.objectStore("threadCards");
    for (const card of cards) {
      store.put({ ...card, phone: card.phone });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getThreadCard(phone) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threadCards", "readonly");
    const req = tx.objectStore("threadCards").get(phone);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllThreadCards() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threadCards", "readonly");
    const req = tx.objectStore("threadCards").getAll();
    req.onsuccess = () => {
      const cards = req.result || [];
      cards.sort((a, b) => (b.lastMillis || 0) - (a.lastMillis || 0));
      resolve(cards);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getThreadCardsPaginated(offset, limit) {
  const all = await getAllThreadCards();
  return all.slice(offset, offset + limit);
}

// ── Messages ──

export async function putMessages(phone, messages) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const msg of messages) {
      store.put({ ...msg, phone });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMessages(phone) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readonly");
    const idx = tx.objectStore("messages").index("byPhoneMillis");
    const range = IDBKeyRange.bound([phone, -Infinity], [phone, Infinity]);
    const req = idx.getAll(range);
    req.onsuccess = () => {
      const msgs = req.result || [];
      msgs.sort((a, b) => (a.millis || 0) - (b.millis || 0));
      resolve(msgs);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Cap messages for a phone at maxCount (default 20). Deletes oldest beyond cap. */
export async function capMessages(phone, maxCount = 20) {
  const msgs = await getMessages(phone);
  if (msgs.length <= maxCount) return;
  const toDelete = msgs.slice(0, msgs.length - maxCount);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const msg of toDelete) {
      store.delete([phone, msg.id]);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete all messages for a given phone. */
export async function deleteMessagesForPhone(phone) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    const idx = store.index("byPhoneMillis");
    const range = IDBKeyRange.bound([phone, -Infinity], [phone, Infinity]);
    const req = idx.openCursor(range);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete conversation messages for threads with no activity in the last maxAgeDays. */
export async function purgeOldConversations(maxAgeDays = 60) {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const cards = await getAllThreadCards();
  const stalePhones = cards.filter((c) => (c.lastMillis || 0) < cutoff).map((c) => c.phone);
  for (const phone of stalePhones) {
    await deleteMessagesForPhone(phone);
  }
  return stalePhones.length;
}

// ── Meta (initialization flag) ──

export async function isInitialized() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get("initialized");
    req.onsuccess = () => resolve(!!req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function setInitialized() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ key: "initialized", value: true, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Clear all data and reset initialization flag. */
export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["threadCards", "messages", "meta"], "readwrite");
    tx.objectStore("threadCards").clear();
    tx.objectStore("messages").clear();
    tx.objectStore("meta").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
