import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing mobile full editor anchor: ${search.slice(0, 100)}`);
  return text.replace(search, replacement);
}

function replaceAllRequired(text, search, replacement, expectedCount) {
  const count = text.split(search).length - 1;
  if (count === 0 && text.includes(replacement.trim())) return text;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} matches for mobile full editor anchor, found ${count}: ${search.slice(0, 100)}`);
  }
  return text.replaceAll(search, replacement);
}

const editorPath = "src/app/editor/page.tsx";
let editor = normalize(readFileSync(editorPath, "utf8"));

editor = replaceOnce(
  editor,
  `  const [advancedMobile, setAdvancedMobile] = useState(false);`,
  `  const [advancedMobile, setAdvancedMobile] = useState(true);`,
);

editor = replaceOnce(
  editor,
  `  useEffect(() => {\n    setAdvancedMobile(new URLSearchParams(window.location.search).get("advanced") === "1");\n  }, []);`,
  `  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    setAdvancedMobile(params.get("simple") !== "1");\n  }, []);`,
);

editor = replaceOnce(
  editor,
  `        {/* Mobile, dedicated filler flow */}\n        <div className={advancedMobile ? "hidden" : "sm:hidden"}>\n          <MobileFiller />\n        </div>\n        {/* Desktop and advanced mobile full editor upload */}`,
  `        {/* Optional legacy mobile filler flow (?simple=1) */}\n        {!advancedMobile && (\n          <div className="sm:hidden">\n            <MobileFiller />\n          </div>\n        )}\n        {/* Full editor upload */}`,
);

editor = replaceOnce(
  editor,
  `    {/* Mobile, filler flow (replaces canvas editor entirely) */}\n    <div className={advancedMobile ? "hidden" : "sm:hidden"}>\n      <MobileFiller />\n    </div>\n    {/* Desktop and advanced mobile full canvas editor */}`,
  `    {/* Optional legacy mobile filler flow (?simple=1) */}\n    {!advancedMobile && (\n      <div className="sm:hidden">\n        <MobileFiller />\n      </div>\n    )}\n    {/* Full canvas editor */}`,
);

editor = replaceAllRequired(
  editor,
  `      const a = document.createElement("a");\n      a.href = url;\n      a.download = fileName.replace(/\\.pdf$/i, "") + "-filled.pdf";\n      a.click();\n      URL.revokeObjectURL(url);`,
  `      const a = document.createElement("a");\n      a.href = url;\n      a.download = fileName.replace(/\\.pdf$/i, "") + "-filled.pdf";\n      a.rel = "noopener";\n      document.body.appendChild(a);\n      a.click();\n      a.remove();\n      setTimeout(() => URL.revokeObjectURL(url), 2000);`,
  1,
);

writeIfChanged(editorPath, editor);

const mobilePath = "src/components/MobileFiller.tsx";
let mobile = normalize(readFileSync(mobilePath, "utf8"));

mobile = replaceAllRequired(
  mobile,
  `      const a = document.createElement("a");\n      a.href = url;\n      a.download = fileName.replace(/\\.pdf$/i, "") + "-filled.pdf";\n      a.click();\n      URL.revokeObjectURL(url);`,
  `      const a = document.createElement("a");\n      a.href = url;\n      a.download = fileName.replace(/\\.pdf$/i, "") + "-filled.pdf";\n      a.rel = "noopener";\n      document.body.appendChild(a);\n      a.click();\n      a.remove();\n      setTimeout(() => URL.revokeObjectURL(url), 2000);`,
  1,
);

writeIfChanged(mobilePath, mobile);
