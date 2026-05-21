import { create } from "zustand";
import { log } from "./utils";

export const useListenerStatusStore = create((set, get) => ({
  statuses: {},
  everConnected: {},
  setStatus: (name, status) => {
    const state = get();
    if (state.statuses[name] === status) return;
    const updates = { statuses: { ...state.statuses, [name]: status } };
    if (status === "connected" && !state.everConnected[name]) {
      updates.everConnected = { ...state.everConnected, [name]: true };
    }
    set(updates);
  },
}));

const listeners = {};

const MAX_RETRY_DELAY = 30000;
const BASE_DELAY = 1000;

function register(name, setupFn) {
  if (listeners[name]) listeners[name].teardown();

  let unsubscribe = null;
  let retryCount = 0;
  let retryTimer = null;
  let torn = false;

  function connect() {
    if (torn) return;
    const status = retryCount > 0 ? "reconnecting" : "connecting";
    useListenerStatusStore.getState().setStatus(name, status);

    try {
      unsubscribe = setupFn(
        () => {
          if (torn) return;
          if (retryCount > 0) {
            log(`Listener "${name}" reconnected after ${retryCount} retries`);
          }
          retryCount = 0;
          useListenerStatusStore.getState().setStatus(name, "connected");
        },
        (error) => {
          if (torn) return;
          log(`Listener "${name}" error, scheduling retry #${retryCount + 1}`, error);
          useListenerStatusStore.getState().setStatus(name, "reconnecting");
          scheduleRetry();
        }
      );
      if (!unsubscribe) {
        log(`Listener "${name}" setup returned null, scheduling retry`);
        useListenerStatusStore.getState().setStatus(name, "reconnecting");
        scheduleRetry();
      }
    } catch (e) {
      log(`Listener "${name}" setup threw, scheduling retry`, e);
      useListenerStatusStore.getState().setStatus(name, "reconnecting");
      scheduleRetry();
    }
  }

  function scheduleRetry() {
    if (torn) return;
    const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);
    retryCount++;
    retryTimer = setTimeout(connect, delay);
  }

  function teardown() {
    torn = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (unsubscribe) {
      try { unsubscribe(); } catch (_) {}
    }
    useListenerStatusStore.getState().setStatus(name, "disconnected");
    delete listeners[name];
  }

  function reconnect() {
    if (unsubscribe) {
      try { unsubscribe(); } catch (_) {}
    }
    retryCount = 0;
    torn = false;
    connect();
  }

  listeners[name] = { teardown, reconnect };
  connect();

  return teardown;
}

function reconnectAll() {
  Object.values(listeners).forEach((l) => l.reconnect());
}

function teardownAll() {
  Object.keys(listeners).forEach((name) => listeners[name].teardown());
}

function disableListener(name) {
  if (listeners[name]) listeners[name].teardown();
}

export { register, reconnectAll, teardownAll, disableListener };
