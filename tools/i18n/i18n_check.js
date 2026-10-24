// node i18n_check.js <code>  - compares out/<code>.{card,backend,labels}.json
// with the English source: same keys, same nesting, same placeholders.
const fs = require("fs");
const path = require("path");
const base = __dirname;
const code = process.argv[2];
if (!code) { console.error("usage: node i18n_check.js <code>"); process.exit(2); }
let bad = 0;
function keys(o, p = "") {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, p + k + ".") : [p + k]));
}
function get(o, k) { return k.split(".").reduce((a, x) => (a == null ? a : a[x]), o); }
function placeholders(s) { return (String(s).match(/\{[a-z_]+\}/g) || []).sort().join(","); }
for (const part of ["card", "backend", "labels"]) {
  const srcPath = path.join(base, "src", `en.${part}.json`);
  const outPath = path.join(base, "out", `${code}.${part}.json`);
  if (!fs.existsSync(outPath)) { console.log(`${part}: MISSING ${outPath}`); bad++; continue; }
  let src, out;
  try { src = JSON.parse(fs.readFileSync(srcPath, "utf8")); } catch (e) { console.log("source unreadable", e.message); process.exit(2); }
  try { out = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch (e) { console.log(`${part}: INVALID JSON - ${e.message}`); bad++; continue; }
  const a = keys(src), b = new Set(keys(out));
  const missing = a.filter((k) => !b.has(k));
  const extra = [...b].filter((k) => !a.includes(k));
  if (missing.length) { console.log(`${part}: missing keys: ${missing.join(", ")}`); bad++; }
  if (extra.length) { console.log(`${part}: extra keys: ${extra.join(", ")}`); bad++; }
  for (const k of a) {
    if (!b.has(k)) continue;
    const sv = get(src, k), ov = get(out, k);
    if (typeof ov !== "string") { console.log(`${part}: ${k} is not a string`); bad++; continue; }
    if (placeholders(sv) !== placeholders(ov)) { console.log(`${part}: ${k} placeholders differ: "${placeholders(sv)}" vs "${placeholders(ov)}"`); bad++; }
    if (sv.length > 0 && ov.trim().length === 0) { console.log(`${part}: ${k} is empty`); bad++; }
    if (ov === sv && sv.length > 3 && !/^[A-Z0-9 ,.:/()-]*$|TomTom|Home Assistant|mdi:|--tomtom|^\d/.test(sv) && part !== "labels" && !["jam","wind"].includes(k)) {
      // Identical to English is suspicious for a longer text; reported, not fatal.
      console.log(`${part}: note - ${k} is identical to English`);
    }
  }
}
console.log(bad ? `FAIL (${bad})` : "OK");
process.exit(bad ? 1 : 0);
