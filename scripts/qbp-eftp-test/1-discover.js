// Step 1: discover what Bonita's QBP account supports.
//
// API1 only serves XML in practice — JSON returns 406 on every endpoint
// observed so far, despite the docs claiming both are supported. So this
// script asks for XML and prints the full body.
//
// Probes several candidate paths for the ship-via endpoint because the
// EFTP guide's suggested URL (/customer/shipvia/) returns "No static
// resource."
//
// Required env:
//   QBP_API_KEY  — Bonita's API1 key (X-QBPAPI-KEY)

const BASE_URL = "https://api1.qbp.com/api/1";
const API_KEY = process.env.QBP_API_KEY;

if (!API_KEY) {
  console.error("ERROR: QBP_API_KEY env var is required.");
  process.exit(1);
}

async function getXml(path) {
  const url = `${BASE_URL}${path}`;
  let res, text;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-QBPAPI-KEY": API_KEY,
        Accept: "application/xml",
      },
    });
    text = await res.text();
  } catch (err) {
    console.log(`  NETWORK ERROR: ${err.message}`);
    return null;
  }
  console.log(`  GET ${url}`);
  console.log(`    → ${res.status} ${res.statusText}`);
  if (text) {
    console.log(`    body:`);
    console.log(text.split("\n").map((l) => `      ${l}`).join("\n"));
  }
  return { status: res.status, ok: res.ok, body: text };
}

(async () => {
  console.log(`\n========== CUSTOMER (full XML) ==========`);
  await getXml("/customer");

  console.log(`\n========== CUSTOMER TERMS (full XML) ==========`);
  await getXml("/customer/terms");

  console.log(`\n========== SHIP-VIA CANDIDATES ==========`);
  // The EFTP guide's URL doesn't exist. Try plausible alternatives based
  // on QBP's other URL patterns. The first one that returns 200 is what
  // we want.
  const shipviaCandidates = [
    "/shipvia",
    "/shipvia/",
    "/customer/shipvias",
    "/customer/shipMethod",
    "/customer/shipMethods",
    "/customer/shipViaMethod",
    "/shipMethod",
    "/shipMethods",
    "/shipviamethod",
    "/customer/0000115882/shipvia",
    "/customer/shipvia/0000115882",
  ];
  for (const p of shipviaCandidates) {
    await getXml(p);
  }

  // Spec hint: terms response includes <paymentMethods>; the ship-via
  // info might be inlined in /customer too. The full /customer output
  // printed above will confirm.
})();
