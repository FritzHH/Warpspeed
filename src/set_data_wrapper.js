// eslint-disable

export function setWorkorderObj(obj, storeSetter, setDB = true) {
  if (!setDB) {
    storeSetter(obj);
  }
  if (obj.status === "Finished" || obj.status === "Archived") {
  }
}

export function setCustomerObj(obj, setDB = true) {}

export function setInventoryObj(obj, setDB = true) {}

export function setSalesObj(obj, setDB = true) {}
