/* eslint-disable */
// Singleton Web Worker manager for inventory search
// Keeps worker inventory in sync with Zustand store automatically

import { useInventoryStore } from "./stores";

let worker = null;
let latestQueryId = 0;
let latestCallback = null;

function getWorker() {
  if (!worker) {
    worker = new Worker(
      new URL("./inventorySearchWorker.js", import.meta.url)
    );
    worker.onmessage = (e) => {
      if (e.data.type === "results" && e.data.id === latestQueryId) {
        latestCallback?.(e.data.results);
        latestCallback = null;
      }
    };

    // Sync current inventory immediately
    const currentItems = useInventoryStore.getState().inventoryArr;
    if (currentItems?.length) {
      worker.postMessage({ type: "setInventory", items: currentItems });
    }

    // Auto-sync when inventory changes
    // useInventoryStore only holds inventory data, so any change = inventory change
    useInventoryStore.subscribe((state) => {
      worker?.postMessage({ type: "setInventory", items: state.inventoryArr || [] });
    });
  }
  return worker;
}

export function workerSearchInventory(query, callback) {
  if (!query || !query.trim()) {
    callback([]);
    return;
  }
  const id = ++latestQueryId;
  latestCallback = callback;
  getWorker().postMessage({ type: "search", query, id });
}
