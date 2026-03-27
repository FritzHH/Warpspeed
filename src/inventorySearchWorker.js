/* eslint-disable */
// Web Worker for inventory search — runs off the main thread
// Mirrors searchInventory() from utils.js lines 282-471

let inventory = [];

self.onmessage = function (e) {
  const { type } = e.data;

  if (type === "setInventory") {
    inventory = e.data.items || [];
    return;
  }

  if (type === "search") {
    const results = searchInventory(e.data.query, inventory);
    self.postMessage({ type: "results", results, id: e.data.id });
  }
};

////////////////////////////////////////////////////////////////////////////////
// searchInventory — copied from src/utils.js
////////////////////////////////////////////////////////////////////////////////

function searchInventory(query, items) {
  if (!query || !items || !items.length) return [];
  const queryNorm = query.toString().toLowerCase().trim();
  if (!queryNorm) return [];

  function normalizePatterns(str) {
    return str
      .replace(/(\d+)\s*[xX×]\s*(\d)/g, "$1x$2")
      .replace(/(\d+)\s*\/\s*(\d)/g, "$1/$2")
      .replace(/\b(\w+)[\s-]+(up|in|on|out|off|over)\b/g, "$1$2")
      .replace(/\s{2,}/g, " ");
  }

  const normalizedQuery = normalizePatterns(queryNorm);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  function norm(str) {
    return str ? normalizePatterns(str.toString().toLowerCase().trim()) : "";
  }

  function levenshteinSim(a, b) {
    if (a === b) return 1;
    const al = a.length, bl = b.length;
    if (!al || !bl) return 0;
    if (Math.abs(al - bl) > Math.max(al, bl) * 0.6) return 0;
    const m = [];
    for (let i = 0; i <= bl; i++) m[i] = [i];
    for (let j = 0; j <= al; j++) m[0][j] = j;
    for (let i = 1; i <= bl; i++) {
      for (let j = 1; j <= al; j++) {
        m[i][j] = b[i - 1] === a[j - 1]
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
    return 1 - m[bl][al] / Math.max(al, bl);
  }

  function jaroWinklerSim(s1, s2) {
    if (s1 === s2) return 1;
    const l1 = s1.length, l2 = s2.length;
    if (!l1 || !l2) return 0;
    const window = Math.floor(Math.max(l1, l2) / 2) - 1;
    const f1 = Array(l1).fill(false);
    const f2 = Array(l2).fill(false);
    let matches = 0, transpositions = 0;
    for (let i = 0; i < l1; i++) {
      const lo = Math.max(0, i - window);
      const hi = Math.min(i + window + 1, l2);
      for (let j = lo; j < hi; j++) {
        if (!f2[j] && s1[i] === s2[j]) { f1[i] = true; f2[j] = true; matches++; break; }
      }
    }
    if (!matches) return 0;
    let k = 0;
    for (let i = 0; i < l1; i++) {
      if (!f1[i]) continue;
      while (!f2[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    const jaro = (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, l1, l2); i++) {
      if (s1[i] === s2[i]) prefix++; else break;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  function diceCoefficient(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bigramsA = {};
    for (let i = 0; i < a.length - 1; i++) {
      const bg = a.slice(i, i + 2);
      bigramsA[bg] = (bigramsA[bg] || 0) + 1;
    }
    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bg = b.slice(i, i + 2);
      if (bigramsA[bg] > 0) { intersection++; bigramsA[bg]--; }
    }
    return (2 * intersection) / (a.length - 1 + b.length - 1);
  }

  const FIELDS = [
    { key: "formalName", weight: 1.0 },
    { key: "brand", weight: 1.0 },
    { key: "category", weight: 1.0 },
    { key: "informalName", weight: 1.0 },
  ];

  const ID_FIELDS = ["upc", "ean", "customSku", "manufacturerSku"];

  function scoreTerm(term, fieldVal) {
    if (!fieldVal) return 0;
    if (term === fieldVal) return 1.0;
    if (fieldVal.startsWith(term)) return 0.92;

    const words = fieldVal.split(/[\s\-\/\(\)]+/);
    for (let wi = 0; wi < words.length; wi++) {
      if (words[wi].startsWith(term)) {
        let positionBonus = Math.max(0, 0.04 - wi * 0.01);
        return 0.85 + positionBonus;
      }
    }

    const subIdx = fieldVal.indexOf(term);
    if (subIdx >= 0) {
      let positionBonus = Math.max(0, 0.04 * (1 - subIdx / fieldVal.length));
      return 0.75 + positionBonus;
    }

    if (term.length >= 3) {
      let bestFuzzy = 0;
      for (const word of words) {
        if (word.length < 2) continue;
        const lev = levenshteinSim(term, word);
        const jw = jaroWinklerSim(term, word);
        const dice = diceCoefficient(term, word);
        const fuzzy = lev * 0.4 + jw * 0.35 + dice * 0.25;
        if (fuzzy > bestFuzzy) bestFuzzy = fuzzy;
      }
      const levFull = levenshteinSim(term, fieldVal);
      const jwFull = jaroWinklerSim(term, fieldVal);
      const diceFull = diceCoefficient(term, fieldVal);
      const fuzzyFull = levFull * 0.4 + jwFull * 0.35 + diceFull * 0.25;
      if (fuzzyFull > bestFuzzy) bestFuzzy = fuzzyFull;
      return Math.min(bestFuzzy, 0.55);
    }

    return 0;
  }

  function scoreItem(item) {
    const queryNoSpaces = queryNorm.replace(/\s/g, "");
    for (const key of ID_FIELDS) {
      const val = norm(item[key]);
      if (val && val === queryNoSpaces) return 0.95;
    }

    let totalScore = 0;
    for (const term of terms) {
      let bestWeightedScore = 0;
      for (const { key, weight } of FIELDS) {
        const val = norm(item[key]);
        const raw = scoreTerm(term, val);
        const weighted = raw * weight;
        if (weighted > bestWeightedScore) bestWeightedScore = weighted;
      }
      totalScore += bestWeightedScore;
    }

    return totalScore / terms.length;
  }

  const scored = [];
  for (let i = 0; i < items.length; i++) {
    const score = scoreItem(items[i]);
    if (score > 0.4) scored.push({ idx: i, score });
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 50).map(s => ({ ...items[s.idx], _score: s.score }));
}
