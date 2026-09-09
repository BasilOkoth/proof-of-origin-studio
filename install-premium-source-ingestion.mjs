#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "src/app/page.tsx");
const cssPath = path.join(root, "src/app/globals.css");

if (!fs.existsSync(pagePath) || !fs.existsSync(cssPath)) {
  throw new Error("Run this from the proof-of-origin-studio repository root.");
}

let page = fs.readFileSync(pagePath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const oldBlock = `            <label>
              Document type
              <select value={sourceKind} onChange={(e: any) => setSourceKind(e.target.value as typeof sourceKind)}>
                <option value="research">Research paper</option>
                <option value="report">Report / impact document</option>
                <option value="text">Text / notes</option>
              </select>
            </label>

            <label className="uploadBox">
              <FileText />
              <strong>{documentBusy ? "Reading source…" : "Upload PDF, TXT or Markdown"}</strong>
              <span>The source becomes evidence; missing claims stay missing.</span>
              <input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" hidden onChange={(e: any) => ingestDocument(e.target.files?.[0])} />
            </label>`;

const newBlock = `            <div className="sourceIntro">
              <p>
                Upload the material your story must answer to. The Studio will extract
                claims, numbers, locations, contradictions and sourceable evidence.
              </p>
            </div>

            <div className="sourceTypeHeader">
              <span>WHAT KIND OF SOURCE IS THIS?</span>
              <small>Choose how the Studio should read and interpret the file.</small>
            </div>

            <div className="sourceTypeGrid">
              <button
                type="button"
                className={\`sourceTypeCard \${sourceKind === "research" ? "active" : ""}\`}
                onClick={() => setSourceKind("research")}
              >
                <span className="sourceTypeIcon"><BookOpen size={20} /></span>
                <span className="sourceTypeCopy">
                  <strong>Research paper</strong>
                  <small>Journal articles, working papers and academic research.</small>
                </span>
                <span className="sourceTypeStatus">{sourceKind === "research" ? "SELECTED" : "SELECT"}</span>
              </button>

              <button
                type="button"
                className={\`sourceTypeCard \${sourceKind === "report" ? "active" : ""}\`}
                onClick={() => setSourceKind("report")}
              >
                <span className="sourceTypeIcon"><FileSearch size={20} /></span>
                <span className="sourceTypeCopy">
                  <strong>Report</strong>
                  <small>Government, NGO, UN, institutional and impact reports.</small>
                </span>
                <span className="sourceTypeStatus">{sourceKind === "report" ? "SELECTED" : "SELECT"}</span>
              </button>

              <button
                type="button"
                className={\`sourceTypeCard \${sourceKind === "text" ? "active" : ""}\`}
                onClick={() => setSourceKind("text")}
              >
                <span className="sourceTypeIcon"><FileText size={20} /></span>
                <span className="sourceTypeCopy">
                  <strong>Text / notes</strong>
                  <small>Transcripts, notes, briefs and other written source material.</small>
                </span>
                <span className="sourceTypeStatus">{sourceKind === "text" ? "SELECTED" : "SELECT"}</span>
              </button>
            </div>

            <label className={\`premiumUploadBox \${documentBusy ? "busy" : ""}\`}>
              <span className="premiumUploadIcon">
                {documentBusy ? <LoaderCircle className="spin" size={28} /> : <FileText size={28} />}
              </span>

              <span className="premiumUploadCopy">
                <strong>{documentBusy ? "Reading and structuring evidence…" : "Drop your source here"}</strong>
                <span>
                  {documentBusy
                    ? "Extracting claims, numbers, locations and limitations."
                    : "PDF, TXT or Markdown · click to browse"}
                </span>
              </span>

              <span className="premiumUploadAction">
                {documentBusy ? "INGESTING" : "CHOOSE FILE"}
              </span>

              <input
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf"
                hidden
                onChange={(e: any) => ingestDocument(e.target.files?.[0])}
              />
            </label>

            <div className="sourceTrustLine">
              <ShieldCheck size={14} />
              <span>The source becomes evidence. Unsupported claims are not invented.</span>
            </div>`;

if (!page.includes(oldBlock)) {
  throw new Error(
    "Could not find the current Source Ingestion block. Your page.tsx may have changed."
  );
}

page = page.replace(oldBlock, newBlock);

const cssMarker = "/* PREMIUM SOURCE INGESTION */";

const premiumCss = `
${cssMarker}

.sourceIntro {
  margin: -8px 0 24px;
  max-width: 680px;
}

.sourceIntro p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.sourceTypeHeader {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin: 8px 0 12px;
}

.sourceTypeHeader > span {
  color: rgba(246,248,255,.72);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .16em;
}

.sourceTypeHeader small {
  color: rgba(153,167,198,.72);
  font-size: 11px;
}

.sourceTypeGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.sourceTypeCard {
  position: relative;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 14px;
  padding: 17px;
  color: var(--text);
  border: 1px solid rgba(255,255,255,.085);
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.012)),
    rgba(5,10,22,.34);
  transition:
    transform .18s ease,
    border-color .18s ease,
    background .18s ease,
    box-shadow .18s ease;
  overflow: hidden;
}

.sourceTypeCard::after {
  content: "";
  position: absolute;
  inset: auto -30% -60% 30%;
  height: 110px;
  background: radial-gradient(circle, rgba(85,216,255,.14), transparent 66%);
  opacity: 0;
  transition: opacity .18s ease;
  pointer-events: none;
}

.sourceTypeCard:hover {
  transform: translateY(-2px);
  border-color: rgba(85,216,255,.28);
  background:
    linear-gradient(145deg, rgba(85,216,255,.055), rgba(255,255,255,.015)),
    rgba(5,10,22,.44);
}

.sourceTypeCard.active {
  border-color: rgba(85,216,255,.58);
  background:
    linear-gradient(145deg, rgba(85,216,255,.11), rgba(95,124,255,.055)),
    rgba(5,10,22,.5);
  box-shadow:
    inset 0 0 0 1px rgba(85,216,255,.08),
    0 16px 45px rgba(0,0,0,.18),
    0 0 32px rgba(85,216,255,.045);
}

.sourceTypeCard.active::after {
  opacity: 1;
}

.sourceTypeIcon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--cyan);
  background: rgba(85,216,255,.075);
  border: 1px solid rgba(85,216,255,.15);
}

.sourceTypeCopy {
  display: block;
}

.sourceTypeCopy strong,
.sourceTypeCopy small {
  display: block;
}

.sourceTypeCopy strong {
  font-size: 14px;
  letter-spacing: -.01em;
}

.sourceTypeCopy small {
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  font-weight: 500;
}

.sourceTypeStatus {
  margin-top: auto;
  color: rgba(153,167,198,.72);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .16em;
}

.sourceTypeCard.active .sourceTypeStatus {
  color: var(--cyan);
}

.premiumUploadBox {
  position: relative;
  min-height: 190px;
  margin-top: 6px;
  display: grid;
  grid-template-columns: 58px 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 28px;
  border: 1px dashed rgba(85,216,255,.32);
  border-radius: 22px;
  color: var(--text);
  background:
    radial-gradient(circle at 12% 50%, rgba(85,216,255,.075), transparent 26%),
    linear-gradient(145deg, rgba(95,124,255,.04), rgba(255,255,255,.018));
  cursor: pointer;
  transition:
    border-color .2s ease,
    background .2s ease,
    transform .2s ease,
    box-shadow .2s ease;
}

.premiumUploadBox:hover {
  transform: translateY(-2px);
  border-color: rgba(85,216,255,.62);
  background:
    radial-gradient(circle at 12% 50%, rgba(85,216,255,.115), transparent 28%),
    linear-gradient(145deg, rgba(95,124,255,.065), rgba(255,255,255,.025));
  box-shadow: 0 20px 60px rgba(0,0,0,.18);
}

.premiumUploadBox.busy {
  cursor: progress;
  border-style: solid;
}

.premiumUploadIcon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 17px;
  color: var(--cyan);
  background:
    linear-gradient(145deg, rgba(85,216,255,.12), rgba(95,124,255,.08));
  border: 1px solid rgba(85,216,255,.2);
  box-shadow: inset 0 0 30px rgba(85,216,255,.025);
}

.premiumUploadCopy strong,
.premiumUploadCopy span {
  display: block;
}

.premiumUploadCopy strong {
  font-size: 17px;
  letter-spacing: -.015em;
}

.premiumUploadCopy span {
  margin-top: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 500;
}

.premiumUploadAction {
  padding: 9px 11px;
  border: 1px solid rgba(85,216,255,.18);
  border-radius: 999px;
  color: var(--cyan);
  background: rgba(85,216,255,.055);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .14em;
}

.sourceTrustLine {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 11px 4px 0;
  color: rgba(153,167,198,.75);
  font-size: 10px;
  line-height: 1.4;
}

.sourceTrustLine svg {
  color: var(--green);
  flex-shrink: 0;
}

select {
  width: 100%;
  margin-top: 8px;
  padding: 13px 38px 13px 14px;
  color: var(--text);
  color-scheme: dark;
  background-color: rgba(255,255,255,.035);
  border: 1px solid var(--line);
  border-radius: 13px;
  outline: none;
}

select:focus {
  border-color: rgba(85,216,255,.55);
  box-shadow: 0 0 0 3px rgba(85,216,255,.07);
}

@media (max-width: 900px) {
  .sourceTypeGrid {
    grid-template-columns: 1fr;
  }

  .sourceTypeCard {
    min-height: 126px;
  }

  .sourceTypeHeader {
    display: block;
  }

  .sourceTypeHeader small {
    display: block;
    margin-top: 6px;
  }

  .premiumUploadBox {
    grid-template-columns: 50px 1fr;
    min-height: 160px;
    padding: 22px;
  }

  .premiumUploadAction {
    grid-column: 2;
    justify-self: start;
  }
}
`;

if (!css.includes(cssMarker)) {
  css += premiumCss;
}

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(cssPath, css, "utf8");

console.log("Updated src/app/page.tsx");
console.log("Updated src/app/globals.css");
console.log("");
console.log("Premium Source Ingestion UI installed.");
console.log("Next run: npm run build");
