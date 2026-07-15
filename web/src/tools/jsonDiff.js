/**
 * Structural JSON comparison + pretty line alignment (Beyond Compare–style).
 */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Deep-clone with object keys sorted (arrays keep order). */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeysDeep(value[k]);
  }
  return out;
}

export function prettyJson(value, { sortKeys = true } = {}) {
  const v = sortKeys ? sortKeysDeep(value) : value;
  return JSON.stringify(v, null, 2);
}

function formatValue(v) {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * @returns {{ path: string, kind: 'added'|'removed'|'changed', left: string, right: string }[]}
 */
export function structuralDiff(left, right, { ignoreArrayOrder = false } = {}) {
  const diffs = [];

  function walk(a, b, path) {
    if (Object.is(a, b)) return;

    if (a === undefined) {
      diffs.push({ path: path || "(root)", kind: "added", left: "", right: formatValue(b) });
      return;
    }
    if (b === undefined) {
      diffs.push({ path: path || "(root)", kind: "removed", left: formatValue(a), right: "" });
      return;
    }

    const typeA = a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
    const typeB = b === null ? "null" : Array.isArray(b) ? "array" : typeof b;

    if (typeA !== typeB) {
      diffs.push({
        path: path || "(root)",
        kind: "changed",
        left: formatValue(a),
        right: formatValue(b),
      });
      return;
    }

    if (typeA !== "object" && typeA !== "array") {
      if (a !== b) {
        diffs.push({
          path: path || "(root)",
          kind: "changed",
          left: formatValue(a),
          right: formatValue(b),
        });
      }
      return;
    }

    if (Array.isArray(a)) {
      if (ignoreArrayOrder) {
        const sa = [...a].map((x) => JSON.stringify(sortKeysDeep(x))).sort();
        const sb = [...b].map((x) => JSON.stringify(sortKeysDeep(x))).sort();
        const max = Math.max(sa.length, sb.length);
        for (let i = 0; i < max; i++) {
          const ia = sa[i] !== undefined ? JSON.parse(sa[i]) : undefined;
          const ib = sb[i] !== undefined ? JSON.parse(sb[i]) : undefined;
          walk(ia, ib, `${path}[${i}]`);
        }
        return;
      }
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        walk(a[i], b[i], `${path}[${i}]`);
      }
      return;
    }

    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      const next = path ? `${path}.${k}` : k;
      if (!(k in a)) {
        diffs.push({ path: next, kind: "added", left: "", right: formatValue(b[k]) });
      } else if (!(k in b)) {
        diffs.push({ path: next, kind: "removed", left: formatValue(a[k]), right: "" });
      } else {
        walk(a[k], b[k], next);
      }
    }
  }

  walk(left, right, "");
  return diffs;
}

/** LCS-based line alignment for side-by-side view. */
export function alignLines(leftText, rightText) {
  const A = leftText.length ? leftText.split("\n") : [];
  const B = rightText.length ? rightText.split("\n") : [];
  const n = A.length;
  const m = B.length;

  // Cap LCS matrix for very large files — fall back to naive pairwise
  if (n * m > 2_000_000) {
    return naiveAlign(A, B);
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      rows.push({ left: A[i], right: B[j], kind: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: A[i], right: null, kind: "removed" });
      i++;
    } else {
      rows.push({ left: null, right: B[j], kind: "added" });
      j++;
    }
  }
  while (i < n) {
    rows.push({ left: A[i++], right: null, kind: "removed" });
  }
  while (j < m) {
    rows.push({ left: null, right: B[j++], kind: "added" });
  }

  // Collapse adjacent removed+added into changed when both present as run pairs
  return collapseChanged(rows);
}

function naiveAlign(A, B) {
  const max = Math.max(A.length, B.length);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const L = A[i];
    const R = B[i];
    if (L === undefined) rows.push({ left: null, right: R, kind: "added" });
    else if (R === undefined) rows.push({ left: L, right: null, kind: "removed" });
    else if (L === R) rows.push({ left: L, right: R, kind: "same" });
    else rows.push({ left: L, right: R, kind: "changed" });
  }
  return rows;
}

function collapseChanged(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind === "removed") {
      let j = i;
      while (j < rows.length && rows[j].kind === "removed") j++;
      let k = j;
      while (k < rows.length && rows[k].kind === "added") k++;
      const rem = rows.slice(i, j);
      const add = rows.slice(j, k);
      const pair = Math.min(rem.length, add.length);
      for (let p = 0; p < pair; p++) {
        out.push({ left: rem[p].left, right: add[p].right, kind: "changed" });
      }
      for (let p = pair; p < rem.length; p++) out.push(rem[p]);
      for (let p = pair; p < add.length; p++) out.push(add[p]);
      i = k;
      continue;
    }
    out.push(rows[i]);
    i++;
  }
  return out;
}

export function parseJsonLoose(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("JSON vacío");
  return JSON.parse(raw);
}

export function summarizeDiffs(diffs) {
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const d of diffs) counts[d.kind] = (counts[d.kind] || 0) + 1;
  return {
    ...counts,
    total: diffs.length,
  };
}

/**
 * Full compare pipeline.
 * @returns {{ ok: true, leftPretty, rightPretty, rows, diffs, summary } | { ok: false, error }}
 */
export function compareJsonTexts(leftText, rightText, opts = {}) {
  const sortKeys = opts.sortKeys !== false;
  try {
    const leftObj = parseJsonLoose(leftText);
    const rightObj = parseJsonLoose(rightText);
    const leftPretty = prettyJson(leftObj, { sortKeys });
    const rightPretty = prettyJson(rightObj, { sortKeys });
    const diffs = structuralDiff(leftObj, rightObj, {
      ignoreArrayOrder: !!opts.ignoreArrayOrder,
    });
    const rows = alignLines(leftPretty, rightPretty);
    return {
      ok: true,
      leftPretty,
      rightPretty,
      rows,
      diffs,
      summary: summarizeDiffs(diffs),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
