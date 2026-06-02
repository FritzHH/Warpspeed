import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONCURRENCY = 10;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGES_PER_SHOP = 4;

const CONTACT_PATH_HINTS = [
  "contact",
  "contact-us",
  "contactus",
  "about",
  "about-us",
  "aboutus",
  "support",
  "help",
  "info",
];

const USER_AGENT =
  "Mozilla/5.0 (compatible; BikeShopProspector/1.0; +https://cadencepos.com)";

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const JUNK_EMAIL_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf)$/i,
  /^(example|test|sample|user|email|name|youremail|your-email)@/i,
  /@(example|domain|sentry|wixpress|godaddy|wordpress|squarespace|sentry-next)\.[a-z]+/i,
  /^.@/,
  /-\d{6,}@/,
  /@\d+\./,
];

function isJunk(email) {
  for (const pat of JUNK_EMAIL_PATTERNS) {
    if (pat.test(email)) return true;
  }
  return false;
}

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function deobfuscate(html) {
  return html
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*|\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, ".");
}

function extractEmails(html, hostDomain) {
  if (!html) return [];
  const decoded = deobfuscate(html);

  const mailtos = [];
  const mailtoRegex = /mailto:([^"'\s?>&]+)/gi;
  let m;
  while ((m = mailtoRegex.exec(decoded)) !== null) {
    mailtos.push(m[1]);
  }

  const inline = decoded.match(EMAIL_REGEX) || [];

  const all = [...mailtos, ...inline].map((e) => e.toLowerCase().trim());
  const unique = [...new Set(all)];
  const cleaned = unique.filter((e) => !isJunk(e) && /@.+\..+/.test(e));

  cleaned.sort((a, b) => {
    const aMatches = hostDomain && a.endsWith("@" + hostDomain);
    const bMatches = hostDomain && b.endsWith("@" + hostDomain);
    if (aMatches && !bMatches) return -1;
    if (!aMatches && bMatches) return 1;
    return 0;
  });

  return cleaned;
}

function extractContactLinks(html, baseUrl) {
  if (!html) return [];
  const baseHost = new URL(baseUrl).hostname;
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const links = new Set();
  let m;

  while ((m = hrefRegex.exec(html)) !== null) {
    const href = m[1];
    const lower = href.toLowerCase();

    const matches = CONTACT_PATH_HINTS.some(
      (hint) =>
        lower.includes("/" + hint) ||
        lower.endsWith("/" + hint + "/") ||
        lower.endsWith("/" + hint)
    );
    if (!matches) continue;

    try {
      const url = new URL(href, baseUrl);
      if (url.hostname !== baseHost) continue;
      url.hash = "";
      links.add(url.toString());
    } catch {
      // bad URL, skip
    }
  }

  return [...links].slice(0, MAX_PAGES_PER_SHOP - 1);
}

function getDomain(websiteUrl) {
  try {
    const url = new URL(websiteUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function scrapeShopEmails(websiteUrl) {
  if (!websiteUrl) return { emails: [], pages: 0 };

  try {
    new URL(websiteUrl);
  } catch {
    return { emails: [], pages: 0 };
  }

  const hostDomain = getDomain(websiteUrl);
  let pagesFetched = 0;

  const homeHtml = await fetchWithTimeout(websiteUrl);
  pagesFetched++;

  let emails = extractEmails(homeHtml, hostDomain);

  const hostMatch = emails.find((e) => e.endsWith("@" + hostDomain));
  if (hostMatch) return { emails, pages: pagesFetched };

  const contactLinks = extractContactLinks(homeHtml || "", websiteUrl);

  for (const link of contactLinks) {
    const html = await fetchWithTimeout(link);
    pagesFetched++;
    const more = extractEmails(html, hostDomain);
    emails = [...new Set([...emails, ...more])];
    if (emails.some((e) => e.endsWith("@" + hostDomain))) break;
  }

  return { emails, pages: pagesFetched };
}

function findLatestXlsx(outDir) {
  if (!fs.existsSync(outDir)) return null;
  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".xlsx") && !f.includes("-with-emails"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? path.join(outDir, files[0].f) : null;
}

function readWebsiteCell(cell) {
  const v = cell.value;
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    return (v.text || v.hyperlink || "").toString().trim();
  }
  return String(v).trim();
}

async function main() {
  const inputArg = process.argv[2];
  const outDir = path.join(__dirname, "output");

  const inputPath = inputArg
    ? path.resolve(inputArg)
    : findLatestXlsx(outDir);

  if (!inputPath) {
    console.error("No input XLSX found. Pass a path or run the crawler first.");
    process.exit(1);
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`[${ts()}] Reading ${inputPath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);
  const sheet = wb.worksheets[0];

  const headerRow = sheet.getRow(1);
  let websiteCol = null;
  let lastCol = 0;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    if (String(cell.value).toLowerCase() === "website") websiteCol = colNum;
    if (colNum > lastCol) lastCol = colNum;
  });

  if (!websiteCol) {
    console.error('Could not find "Website" column in the input file.');
    process.exit(1);
  }

  const emailCol = lastCol + 1;
  sheet.getColumn(emailCol).width = 32;
  const newHeaderCell = sheet.getRow(1).getCell(emailCol);
  newHeaderCell.value = "Email";
  newHeaderCell.font = { bold: true, size: 11 };
  newHeaderCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8E8" },
  };
  newHeaderCell.alignment = { vertical: "middle" };

  const rows = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const website = readWebsiteCell(row.getCell(websiteCol));
    rows.push({ rowNum: i, website });
  }

  const withWebsite = rows.filter(
    (r) => r.website && /^https?:/i.test(r.website)
  );
  console.log(
    `[${ts()}] ${rows.length} total rows; ${withWebsite.length} have websites; ${rows.length - withWebsite.length} skipped`
  );

  const startedAt = new Date();
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  let foundCount = 0;
  let hostMatchCount = 0;
  let totalPages = 0;

  await Promise.all(
    withWebsite.map(({ rowNum, website }) =>
      limit(async () => {
        const { emails, pages } = await scrapeShopEmails(website);
        completed++;
        totalPages += pages;

        if (emails.length > 0) {
          foundCount++;
          const hostDomain = getDomain(website);
          if (emails.some((e) => e.endsWith("@" + hostDomain))) {
            hostMatchCount++;
          }
          sheet.getRow(rowNum).getCell(emailCol).value = emails.join(", ");
        }

        const label =
          emails.length > 0 ? `${emails.length} email(s)` : "none";
        console.log(
          `[${ts()}] ${completed}/${withWebsite.length} ${website} -> ${label}`
        );
      })
    )
  );

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: emailCol },
  };

  const completedAt = new Date();
  const outputPath = inputPath.replace(/\.xlsx$/, "-with-emails.xlsx");
  await wb.xlsx.writeFile(outputPath);

  const elapsed = Math.round((completedAt - startedAt) / 1000);
  const hitRate = withWebsite.length
    ? Math.round((foundCount / withWebsite.length) * 100)
    : 0;

  console.log("");
  console.log(
    `[${ts()}] Scraped ${withWebsite.length} sites in ${elapsed}s (${totalPages} pages fetched)`
  );
  console.log(
    `[${ts()}] Found emails on ${foundCount}/${withWebsite.length} sites (${hitRate}%)`
  );
  console.log(
    `[${ts()}] Host-domain match (e.g. info@<shopdomain>): ${hostMatchCount}`
  );
  console.log(`[${ts()}] Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
