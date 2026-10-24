// Builds everything language-dependent in the TomTom repo from the tables
// in src/ and out/ beside this file - run `node tools/i18n/i18n_build.js`:
// translations/<code>.json for the integration, frontend/lang/<code>.json
// for the card, and the label dicts in const.py. English, the source, comes
// from src/; every other language from out/ (German by the author, the rest
// machine-translated, see README) - and only when it passes i18n_check.js.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const here = __dirname;
const repo = path.join(here, "..", "..", "custom_components", "tomtom") + "/";
const i18n = here;
const { build } = require("./tomtom_translations.js");

const tables = {}; // code -> { backend, card, labels }
for (const code of ["en"]) {
  tables[code] = {
    backend: JSON.parse(fs.readFileSync(path.join(i18n, "src", `${code}.backend.json`), "utf8")),
    card: JSON.parse(fs.readFileSync(path.join(i18n, "src", `${code}.card.json`), "utf8")),
    labels: JSON.parse(fs.readFileSync(path.join(i18n, "src", `${code}.labels.json`), "utf8")),
  };
}
const skipped = [];
for (const file of fs.readdirSync(path.join(i18n, "out")).sort()) {
  const m = file.match(/^([A-Za-z-]+)\.backend\.json$/);
  if (!m || m[1] === "en") continue;
  const code = m[1];
  try {
    execFileSync("node", [path.join(here, "i18n_check.js"), code], { stdio: "pipe" });
  } catch (err) {
    skipped.push(code);
    continue;
  }
  tables[code] = {
    backend: JSON.parse(fs.readFileSync(path.join(i18n, "out", `${code}.backend.json`), "utf8")),
    card: JSON.parse(fs.readFileSync(path.join(i18n, "out", `${code}.card.json`), "utf8")),
    labels: JSON.parse(fs.readFileSync(path.join(i18n, "out", `${code}.labels.json`), "utf8")),
  };
}
const codes = Object.keys(tables);

// --- translations/<code>.json ------------------------------------------------
for (const code of codes) {
  fs.writeFileSync(path.join(repo, "translations", `${code}.json`), JSON.stringify(build(tables[code].backend), null, 4) + "\n");
}

// --- frontend/lang/<code>.json (every language but English, which the card carries)
const langDir = path.join(repo, "frontend", "lang");
fs.mkdirSync(langDir, { recursive: true });
for (const old of fs.readdirSync(langDir)) fs.unlinkSync(path.join(langDir, old));
for (const code of codes) {
  if (code === "en") continue;
  fs.writeFileSync(path.join(langDir, `${code}.json`), JSON.stringify(tables[code].card) + "\n");
}

// --- const.py labels ----------------------------------------------------------
let py = fs.readFileSync(path.join(repo, "const.py"), "utf8");
function dictBlock(name, part) {
  const keys = Object.keys(tables.en.labels[part]);
  const lines = [`${name} = {`];
  for (const key of keys) {
    const entries = codes
      .map((code) => `"${code}": ${JSON.stringify(tables[code].labels[part][key] ?? tables.en.labels[part][key])}`)
      .join(", ");
    lines.push(`    "${key}": {${entries}},`);
  }
  lines.push("}");
  return lines.join("\n");
}
for (const [name, part] of [["CATEGORY_LABELS", "categories"], ["MAGNITUDE_LABELS", "magnitudes"]]) {
  const start = py.indexOf(`${name} = {`);
  const end = py.indexOf("\n}", start) + 2;
  if (start < 0) throw new Error(name + " not found");
  py = py.slice(0, start) + dictBlock(name, part) + py.slice(end);
}
fs.writeFileSync(path.join(repo, "const.py"), py);

console.log(`built ${codes.length} languages: ${codes.join(", ")}`);
if (skipped.length) console.log(`SKIPPED (check failed): ${skipped.join(", ")}`);
