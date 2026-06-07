const VENDOR_URL_PATTERNS = {
  jbi: (id) =>
    `https://www.jbi.bike/site/product_details.php?part_number=${encodeURIComponent(id)}`,
  qbp: (id) =>
    `https://www.qbp.com/qbponlinestorefront/n/p/${encodeURIComponent(id)}`,
};

export function buildVendorProductUrl(vendor, id) {
  if (!vendor || !id) return null;
  const fn = VENDOR_URL_PATTERNS[String(vendor).toLowerCase()];
  return fn ? fn(id) : null;
}
