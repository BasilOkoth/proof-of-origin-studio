from pathlib import Path
import json
import shutil
import sys

ROOT = Path.cwd()
PATCH_ROOT = Path(__file__).resolve().parent

PAGE = ROOT / "src/app/page.tsx"
TYPES = ROOT / "src/lib/types.ts"
ORIGIN = ROOT / "src/remotion/OriginEpisode.tsx"
RETENTION = ROOT / "src/lib/retention.ts"
PACKAGE = ROOT / "package.json"

required = [PAGE, TYPES, ORIGIN, RETENTION, PACKAGE]
missing = [str(p) for p in required if not p.exists()]
if missing:
    print("Run this script from the root of proof-of-origin-studio.")
    print("Missing:", ", ".join(missing))
    sys.exit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Patch validation failed at {label}. Expected source text was not found: {old[:120]!r}")
    return text.replace(old, new, 1)


# ---------- PAGE: cumulative Evidence Studio + Visual Intelligence UI ----------
page = PAGE.read_text(encoding="utf-8")

replacements = [
    (
        'import { buildEpisode } from "@/lib/generator";',
        'import { buildStoryEpisode } from "@/lib/story-engine";\nimport { STORY_PACKS, getStoryPack } from "@/lib/story-packs";\nimport { analyzeCsv } from "@/lib/data-story";\nimport { applyVisualIntelligence, refreshVisualIntelligence } from "@/lib/visual-reasoning";',
        "page imports",
    ),
    (
        '  EvidenceItem,\n  EvidenceKind,\n} from "@/lib/types";',
        '  DatasetAnalysis,\n  DocumentIngestion,\n  EpisodeProject,\n  EvidenceAsset,\n  EvidenceItem,\n  EvidenceKind,\n  StoryMode,\n} from "@/lib/types";',
        "page type imports",
    ),
]

# The original type import already contains EpisodeProject/EvidenceAsset before EvidenceItem.
# Handle that exact block first if present.
original_type_block = '''import type {\n  EpisodeProject,\n  EvidenceAsset,\n  EvidenceItem,\n  EvidenceKind,\n} from "@/lib/types";'''
new_type_block = '''import type {\n  DatasetAnalysis,\n  DocumentIngestion,\n  EpisodeProject,\n  EvidenceAsset,\n  EvidenceItem,\n  EvidenceKind,\n  StoryMode,\n} from "@/lib/types";'''
if original_type_block in page:
    page = page.replace(original_type_block, new_type_block, 1)
else:
    # If the file was already partly converted by v1, accept the v1 block.
    v1_type_block = '''import type {\n  EpisodeProject,\n  EvidenceAsset,\n  EvidenceItem,\n  EvidenceKind,\n  StoryMode,\n} from "@/lib/types";'''
    if v1_type_block in page:
        page = page.replace(v1_type_block, new_type_block, 1)
    else:
        raise RuntimeError("Patch validation failed at page type imports.")

# Import conversion can be original or v1.
if 'import { buildEpisode } from "@/lib/generator";' in page:
    page = page.replace(
        'import { buildEpisode } from "@/lib/generator";',
        'import { buildStoryEpisode } from "@/lib/story-engine";\nimport { STORY_PACKS, getStoryPack } from "@/lib/story-packs";\nimport { analyzeCsv } from "@/lib/data-story";\nimport { applyVisualIntelligence, refreshVisualIntelligence } from "@/lib/visual-reasoning";',
        1,
    )
elif 'import { buildStoryEpisode } from "@/lib/story-engine";' in page:
    if 'import { analyzeCsv } from "@/lib/data-story";' not in page:
        page = page.replace(
            'import { STORY_PACKS, getStoryPack } from "@/lib/story-packs";',
            'import { STORY_PACKS, getStoryPack } from "@/lib/story-packs";\nimport { analyzeCsv } from "@/lib/data-story";\nimport { applyVisualIntelligence, refreshVisualIntelligence } from "@/lib/visual-reasoning";',
            1,
        )
else:
    raise RuntimeError("Patch validation failed at generator import.")

# Apply v1 transformations only when the original patterns still exist.
v1_pairs = [
    (
        '  const [project, setProject] = useState<EpisodeProject>(initial);\n',
        '  const [project, setProject] = useState<EpisodeProject>(initial);\n  const [storyMode, setStoryMode] = useState<StoryMode>(\n    initial.episode.storyMode || "hps"\n  );\n',
    ),
    (
        '  const durationInFrames = useMemo(\n',
        '  const currentStoryPack = useMemo(\n    () => getStoryPack(storyMode),\n    [storyMode]\n  );\n\n  const durationInFrames = useMemo(\n',
    ),
    (
        '      const next = buildEpisode({\n        channelName: project.brand.channelName,',
        '      setStoryMode("hps");\n\n      const next = buildStoryEpisode({\n        mode: "hps",\n        channelName: project.brand.channelName,',
    ),
    (
        '  function regenerate() {\n    const next = buildEpisode({\n      channelName: project.brand.channelName,',
        '  function regenerate() {\n    const next = buildStoryEpisode({\n      mode: storyMode,\n      channelName: project.brand.channelName,',
    ),
    (
        '  function updateEvidence(id: string, statement: string) {\n    setEvidence((items) =>\n      items.map((item) => (item.id === id ? { ...item, statement } : item))\n    );\n  }',
        '  function updateEvidence(id: string, statement: string) {\n    setEvidence((items) =>\n      items.map((item) => (item.id === id ? { ...item, statement } : item))\n    );\n  }\n\n  function updateEvidenceSource(id: string, source: string) {\n    setEvidence((items) =>\n      items.map((item) => (item.id === id ? { ...item, source } : item))\n    );\n  }',
    ),
    (
        '            <strong>Proof of Origin Studio</strong>\n            <span>by Human Provenance Standard</span>',
        '            <strong>Evidence Studio</strong>\n            <span>Proof of Origin + visual intelligence</span>',
    ),
    (
        '          <p className="eyebrow">PREMIUM VIDEO OPERATING SYSTEM</p>\n          <h1>Turn real experiments into videos people actually want to watch.</h1>\n          <p className="lede">\n            Evidence → story → script → cinematic scenes → Shorts → publishing\n            package. Designed for digital trust, provenance, AI authenticity and\n            HPS stress tests.\n          </p>',
        '          <p className="eyebrow">THE WORLD EXPLAINED THROUGH EVIDENCE</p>\n          <h1>Turn evidence into visual stories that can show their work.</h1>\n          <p className="lede">\n            Research → evidence → visual reasoning → maps → data stories →\n            cinematic scenes → Shorts → publishing. Built for HPS experiments,\n            research, reports, investigations and world-scale explainers.\n          </p>',
    ),
    (
        '                <p className="micro">EPISODE INTAKE</p>\n                <h2>Start with the experiment, not the script.</h2>',
        '                <p className="micro">STORY INTAKE</p>\n                <h2>Choose the evidence pattern before writing the script.</h2>',
    ),
    (
        '            <label>\n              Topic\n              <input value={topic} onChange={(e) => setTopic(e.target.value)} />\n            </label>',
        '''            <label>\n              Story mode\n              <select\n                value={storyMode}\n                onChange={(e) => setStoryMode(e.target.value as StoryMode)}\n                style={{\n                  width: "100%",\n                  marginTop: 8,\n                  padding: "12px 14px",\n                  borderRadius: 12,\n                  border: "1px solid rgba(255,255,255,.14)",\n                  background: "rgba(255,255,255,.04)",\n                  color: "inherit",\n                }}\n              >\n                {STORY_PACKS.map((pack) => (\n                  <option key={pack.id} value={pack.id}>\n                    {pack.label}\n                  </option>\n                ))}\n              </select>\n              <span className="muted" style={{ display: "block", marginTop: 8 }}>\n                {currentStoryPack.description}\n              </span>\n            </label>\n\n            <label>\n              Topic\n              <input value={topic} onChange={(e) => setTopic(e.target.value)} />\n            </label>''',
    ),
    (
        '            <label>\n              Big question\n              <textarea\n                value={question}\n                onChange={(e) => setQuestion(e.target.value)}\n                rows={2}\n              />\n            </label>',
        '            <label>\n              Big question\n              <textarea\n                value={question}\n                onChange={(e) => setQuestion(e.target.value)}\n                placeholder={currentStoryPack.questionPlaceholder}\n                rows={2}\n              />\n            </label>',
    ),
    (
        '            <label>\n              Controlled experiment\n              <textarea\n                value={experiment}\n                onChange={(e) => setExperiment(e.target.value)}\n                rows={3}\n              />\n            </label>',
        '            <label>\n              {currentStoryPack.briefLabel}\n              <textarea\n                value={experiment}\n                onChange={(e) => setExperiment(e.target.value)}\n                placeholder={currentStoryPack.briefPlaceholder}\n                rows={3}\n              />\n            </label>',
    ),
    (
        '            <button className="button primary large" onClick={regenerate}>\n              <WandSparkles size={18} /> Build premium episode\n            </button>',
        '            <button className="button primary large" onClick={regenerate}>\n              <WandSparkles size={18} /> Build evidence-led episode\n            </button>',
    ),
    (
        '                <div className="evidenceRow" key={item.id}>\n                  <Chip kind={item.kind}>{item.kind}</Chip>\n                  <textarea\n                    value={item.statement}\n                    onChange={(e) => updateEvidence(item.id, e.target.value)}\n                    rows={2}\n                  />\n                </div>',
        '''                <div className="evidenceRow" key={item.id}>\n                  <Chip kind={item.kind}>{item.kind}</Chip>\n                  <div style={{ width: "100%" }}>\n                    <textarea\n                      value={item.statement}\n                      onChange={(e) => updateEvidence(item.id, e.target.value)}\n                      rows={2}\n                    />\n                    <input\n                      value={item.source || ""}\n                      onChange={(e) => updateEvidenceSource(item.id, e.target.value)}\n                      placeholder="Source: URL, DOI, report page, dataset or interview"\n                      style={{ marginTop: 8 }}\n                    />\n                  </div>\n                </div>''',
    ),
]
for old, new in v1_pairs:
    if old in page:
        page = page.replace(old, new, 1)

# Validate that v1 state now exists.
if 'const [storyMode, setStoryMode]' not in page or 'buildStoryEpisode({' not in page:
    raise RuntimeError("Could not establish the Evidence Studio v1 base in page.tsx.")

# Add Visual Intelligence state after manual edit state.
state_anchor = '  const [manualScriptEdits, setManualScriptEdits] = useState(false);\n'
state_insert = state_anchor + '''  const [documentBusy, setDocumentBusy] = useState(false);\n  const [documentError, setDocumentError] = useState("");\n  const [datasetAnalysis, setDatasetAnalysis] = useState<DatasetAnalysis | null>(null);\n  const [visualNotice, setVisualNotice] = useState("");\n'''
if 'const [documentBusy, setDocumentBusy]' not in page:
    page = replace_once(page, state_anchor, state_insert, "visual state")

# Make regenerate preserve documents/datasets and re-run visual intelligence.
regen_old = '''    next.assets = project.assets;\n    next.hpsIngestion = project.hpsIngestion;\n    setProject(next);'''
regen_new = '''    next.assets = project.assets;\n    next.hpsIngestion = project.hpsIngestion;\n    next.documentIngestion = project.documentIngestion;\n    setProject(applyVisualIntelligence(next, project.datasets || []));'''
if regen_old in page:
    page = page.replace(regen_old, regen_new, 1)

# Add document + dataset handlers before uploadAssets.
handler_anchor = '  async function uploadAssets(files: FileList | null) {\n'
handlers = r'''  async function ingestDocument(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setDocumentBusy(true);
    setDocumentError("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append(
        "kind",
        storyMode === "report" ? "report" : storyMode === "research" ? "research" : "text"
      );
      const response = await fetch("/api/document-ingest", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to ingest source.");

      const parsed = data.result as DocumentIngestion;
      setTopic(parsed.suggestedTopic);
      setQuestion(parsed.suggestedQuestion);
      setExperiment(parsed.suggestedBrief);
      setEvidence(parsed.evidence);

      const next = buildStoryEpisode({
        mode: storyMode,
        channelName: project.brand.channelName,
        byline: project.brand.byline,
        topic: parsed.suggestedTopic,
        question: parsed.suggestedQuestion,
        experiment: parsed.suggestedBrief,
        audience,
        targetMinutes: minutes,
        evidence: parsed.evidence,
      });
      next.assets = project.assets;
      next.documentIngestion = parsed;
      const enhanced = applyVisualIntelligence(next, project.datasets || []);
      setProject(enhanced);
      setVisualNotice(`Imported ${file.name} and extracted ${parsed.evidence.length} reviewable evidence items.`);
      setManualScriptEdits(false);
      setActiveTab("visuals");
    } catch (error: any) {
      setDocumentError(error.message || "Unable to ingest document.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function uploadDataset(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const analysis = analyzeCsv(text, file.name);
      setDatasetAnalysis(analysis);
      const datasets = [...(project.datasets || []).filter((item) => item.name !== file.name), analysis];
      const next = applyVisualIntelligence(project, datasets);
      setProject(next);
      setVisualNotice(
        `Dataset ready: ${analysis.rowCount} rows. ${analysis.recommendedChart ? "Chart planned. " : ""}${analysis.recommendedMap ? "Map planned." : ""}`
      );
      setManualScriptEdits(false);
      setActiveTab("visuals");
    } catch (error: any) {
      setVisualNotice(error.message || "Unable to analyse dataset.");
    }
  }

  function rebuildVisualIntelligence() {
    setProject((current) => refreshVisualIntelligence(current));
    setVisualNotice("Visual reasoning refreshed from the current story and evidence ledger.");
  }

'''
if 'async function ingestDocument(files: FileList | null)' not in page:
    page = replace_once(page, handler_anchor, handlers + handler_anchor, "document/data handlers")

# Expand active tab union.
old_union = '    "ingest" | "build" | "story" | "narration" | "retention" | "shorts" | "publish"\n'
new_union = '    "ingest" | "build" | "story" | "visuals" | "narration" | "retention" | "shorts" | "publish"\n'
if old_union in page:
    page = page.replace(old_union, new_union, 1)

# Update tabs to include Visual Intelligence.
old_tabs = '''          ["ingest", "01", "HPS Ingest"],\n          ["build", "02", "Evidence"],\n          ["story", "03", "Story & Video"],\n          ["narration", "04", "Narration"],\n          ["retention", "05", "Retention Lab"],\n          ["shorts", "06", "Shorts & Thumbnails"],\n          ["publish", "07", "Publish"],'''
new_tabs = '''          ["ingest", "01", "HPS Ingest"],\n          ["build", "02", "Evidence"],\n          ["story", "03", "Story & Video"],\n          ["visuals", "04", "Visual Intelligence"],\n          ["narration", "05", "Narration"],\n          ["retention", "06", "Retention Lab"],\n          ["shorts", "07", "Shorts & Thumbnails"],\n          ["publish", "08", "Publish"],'''
if old_tabs in page:
    page = page.replace(old_tabs, new_tabs, 1)

# Add document ingest box after story-mode selector.
doc_anchor = '''              <span className="muted" style={{ display: "block", marginTop: 8 }}>\n                {currentStoryPack.description}\n              </span>\n            </label>\n\n            <label>\n              Topic'''
doc_insert = '''              <span className="muted" style={{ display: "block", marginTop: 8 }}>\n                {currentStoryPack.description}\n              </span>\n            </label>\n\n            <label className="uploadBox" style={{ marginBottom: 18 }}>\n              <FileText />\n              <strong>Ingest a research paper or report</strong>\n              <span>PDF, TXT or Markdown. Evidence is extracted conservatively for your review before publishing.</span>\n              <input\n                type="file"\n                accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"\n                hidden\n                disabled={documentBusy}\n                onChange={(e) => ingestDocument(e.target.files)}\n              />\n            </label>\n            {documentBusy && <p className="muted">Reading source and extracting evidence…</p>}\n            {documentError && <div className="studioError">{documentError}</div>}\n\n            <label>\n              Topic'''
if 'Ingest a research paper or report' not in page:
    page = replace_once(page, doc_anchor, doc_insert, "document upload UI")

# Add dataset uploader after image evidence uploader.
asset_anchor = '''            <label className="uploadBox">\n              <ImagePlus />\n              <strong>Upload screenshots / evidence</strong>\n              <span>Images are stored inside the exported project as data URLs.</span>\n              <input\n                type="file"\n                accept="image/*"\n                multiple\n                hidden\n                onChange={(e) => uploadAssets(e.target.files)}\n              />\n            </label>'''
asset_insert = asset_anchor + '''\n\n            <label className="uploadBox" style={{ marginTop: 16 }}>\n              <FileText />\n              <strong>Upload a CSV for Data Story / Map Story</strong>\n              <span>Trend, ranking, scatter and latitude/longitude patterns are detected automatically.</span>\n              <input\n                type="file"\n                accept=".csv,text/csv"\n                hidden\n                onChange={(e) => uploadDataset(e.target.files)}\n              />\n            </label>'''
if 'Upload a CSV for Data Story / Map Story' not in page:
    page = replace_once(page, asset_anchor, asset_insert, "dataset upload UI")

# Add the Visual Intelligence tab before Narration.
visual_anchor = '      {activeTab === "narration" && (\n'
visual_section = r'''      {activeTab === "visuals" && (
        <section className="workspace twoCol">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">VISUAL REASONING ENGINE</p>
                <h2>What is the strongest way to show each claim?</h2>
              </div>
              <Eye />
            </div>

            <div className="retentionHero">
              <div className="scoreRing">
                <strong>{project.visualIntelligence?.overall ?? 0}</strong>
                <span>/100</span>
              </div>
              <div>
                <p className="micro">VISUAL INTELLIGENCE SCORE</p>
                <h3>Evidence should determine the visual grammar.</h3>
                <p className="muted">
                  The score rewards visible proof, source visibility, data storytelling,
                  geographic context and scene-to-scene visual variation.
                </p>
              </div>
            </div>

            <div className="retentionMetrics">
              {[
                ["Evidence density", project.visualIntelligence?.evidenceDensity ?? 0],
                ["Visual variation", project.visualIntelligence?.visualVariation ?? 0],
                ["Geographic context", project.visualIntelligence?.geographicContext ?? 0],
                ["Data storytelling", project.visualIntelligence?.dataStorytelling ?? 0],
                ["Source visibility", project.visualIntelligence?.sourceVisibility ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="metricBar">
                  <div>
                    <span>{label}</span>
                    <strong>{value}/100</strong>
                  </div>
                  <div className="metricTrack">
                    <div className="metricFill" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <button className="button primary" onClick={rebuildVisualIntelligence}>
              <WandSparkles size={16} /> Re-run visual reasoning
            </button>

            {visualNotice && (
              <div className="truthNotice" style={{ marginTop: 18 }}>
                <Sparkles />
                <div>
                  <strong>Visual pipeline</strong>
                  <p>{visualNotice}</p>
                </div>
              </div>
            )}

            {!!project.visualIntelligence?.warnings.length && (
              <div className="retentionWarnings" style={{ marginTop: 18 }}>
                <p className="micro">WHAT STILL NEEDS SOURCING</p>
                {project.visualIntelligence.warnings.map((warning, index) => (
                  <div key={index}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{warning}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">VISUAL STORYBOARD</p>
                <h2>Maps, charts and sources are story evidence.</h2>
              </div>
              <Film />
            </div>

            {datasetAnalysis && (
              <div className="truthNotice" style={{ marginBottom: 18 }}>
                <FileText />
                <div>
                  <strong>{datasetAnalysis.name}</strong>
                  <p>
                    {datasetAnalysis.rowCount} rows · {datasetAnalysis.columns.length} columns
                    {datasetAnalysis.insight ? ` · ${datasetAnalysis.insight}` : ""}
                  </p>
                </div>
              </div>
            )}

            <div className="sceneList">
              {project.scenes.map((scene, index) => (
                <article className="sceneCard" key={scene.id}>
                  <div className="sceneIndex">{String(index + 1).padStart(2, "0")}</div>
                  <div style={{ width: "100%" }}>
                    <p className="micro">{scene.visualPlan?.kind || scene.kind}</p>
                    <h3>{scene.headline}</h3>
                    <p>{scene.visualPlan?.reason || "No visual reasoning has been generated for this scene yet."}</p>
                    <div className="sceneMeta">
                      <span>{scene.kind}</span>
                      <span>{scene.chart ? `${scene.chart.type} chart` : scene.map ? `${scene.map.points.length} map points` : "story visual"}</span>
                      <span>{scene.visualPlan?.confidence ?? 0}% visual confidence</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

'''
if 'VISUAL REASONING ENGINE' not in page:
    page = replace_once(page, visual_anchor, visual_section + visual_anchor, "visual intelligence tab")

# ---------- REMOTION: add new renderers + generic diagram labels ----------
origin = ORIGIN.read_text(encoding="utf-8")
if 'EvidenceVisualScenes' not in origin:
    origin = replace_once(
        origin,
        'import { AnimatedCaptions } from "./Captions";',
        'import { AnimatedCaptions } from "./Captions";\nimport { DataChartScene, MapStoryScene, SourceHighlightScene } from "./EvidenceVisualScenes";',
        "remotion visual imports",
    )

origin = origin.replace('Proof of Origin · HPS', 'Evidence Studio · Proof of Origin')
origin = origin.replace('SUBSCRIBE · NEXT STRESS TEST', 'SUBSCRIBE · NEXT EVIDENCE STORY')
origin = origin.replace(
    '  const items = ["Exact identity", "Related object", "Content change", "Interpretation"];',
    '  const items = scene.visualLabels?.length ? scene.visualLabels : ["Exact identity", "Related object", "Content change", "Interpretation"];',
)
origin = origin.replace(
    '  const steps = ["Original", "Shared", "Converted", "Edited", "Verified"];',
    '  const steps = scene.visualLabels?.length ? scene.visualLabels : ["Original", "Shared", "Converted", "Edited", "Verified"];',
)

switch_anchor = '''    case "timeline":\n      return <SceneTimeline scene={scene} />;\n    case "quote":'''
switch_insert = '''    case "timeline":\n      return <SceneTimeline scene={scene} />;\n    case "data_chart":\n      return <DataChartScene scene={scene} />;\n    case "map_story":\n      return <MapStoryScene scene={scene} />;\n    case "source_highlight":\n      return <SourceHighlightScene scene={scene} />;\n    case "quote":'''
if 'case "data_chart":' not in origin:
    origin = replace_once(origin, switch_anchor, switch_insert, "remotion switch")

# ---------- RETENTION: count new evidence visuals as proof + resets ----------
retention = RETENTION.read_text(encoding="utf-8")
proof_old = '''  const proofScenes = scenes.filter(\n    (s) => s.factIds.length > 0 || hasConcreteProof(`${s.headline} ${s.body}`)\n  ).length;'''
proof_new = '''  const proofScenes = scenes.filter(\n    (s) =>\n      s.factIds.length > 0 ||\n      Boolean(s.chart) ||\n      Boolean(s.map) ||\n      s.kind === "source_highlight" ||\n      hasConcreteProof(`${s.headline} ${s.body}`)\n  ).length;'''
if proof_old in retention:
    retention = retention.replace(proof_old, proof_new, 1)

beat_old = '''      scene.kind === "confidence" ||\n      scene.factIds.length > 0 ||\n      hasConcreteProof(scene.body)'''
beat_new = '''      scene.kind === "confidence" ||\n      scene.kind === "data_chart" ||\n      scene.kind === "map_story" ||\n      scene.kind === "source_highlight" ||\n      scene.factIds.length > 0 ||\n      hasConcreteProof(scene.body)'''
if beat_old in retention:
    retention = retention.replace(beat_old, beat_new, 1)

reset_old = '    if (scene.kind === "diagram" || scene.kind === "timeline") {'
reset_new = '''    if (\n      scene.kind === "diagram" ||\n      scene.kind === "timeline" ||\n      scene.kind === "data_chart" ||\n      scene.kind === "map_story" ||\n      scene.kind === "source_highlight"\n    ) {'''
if reset_old in retention:
    retention = retention.replace(reset_old, reset_new, 1)

# ---------- PACKAGE: PDF ingestion dependency ----------
package = json.loads(PACKAGE.read_text(encoding="utf-8"))
package.setdefault("dependencies", {})["pdf-parse"] = "^1.1.1"
package.setdefault("devDependencies", {})["@types/pdf-parse"] = "^1.1.5"
package_text = json.dumps(package, indent=2) + "\n"

# ---------- final validation before writing ----------
checks = [
    (page, 'VISUAL REASONING ENGINE', 'visual tab'),
    (page, 'Upload a CSV for Data Story / Map Story', 'dataset UI'),
    (page, 'Ingest a research paper or report', 'document UI'),
    (origin, 'case "data_chart":', 'data chart renderer'),
    (origin, 'case "map_story":', 'map renderer'),
    (origin, 'case "source_highlight":', 'source renderer'),
]
for content, marker, label in checks:
    if marker not in content:
        raise RuntimeError(f"Final validation failed: {label}")

# ---------- backup and write ----------
for path in [PAGE, TYPES, ORIGIN, RETENTION, PACKAGE]:
    backup = path.with_suffix(path.suffix + ".pre-evidence-visual-sprint")
    if not backup.exists():
        shutil.copy2(path, backup)

PAGE.write_text(page, encoding="utf-8")
TYPES.write_text((PATCH_ROOT / "src/lib/types.ts").read_text(encoding="utf-8"), encoding="utf-8")
ORIGIN.write_text(origin, encoding="utf-8")
RETENTION.write_text(retention, encoding="utf-8")
PACKAGE.write_text(package_text, encoding="utf-8")

new_files = [
    "src/lib/story-packs.ts",
    "src/lib/story-engine.ts",
    "src/lib/data-story.ts",
    "src/lib/visual-reasoning.ts",
    "src/lib/document-evidence.ts",
    "src/remotion/EvidenceVisualScenes.tsx",
    "src/app/api/document-ingest/route.ts",
]
for rel in new_files:
    src = PATCH_ROOT / rel
    dst = ROOT / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

print("Evidence Studio Visual Intelligence sprint applied successfully.")
print("Added: World Explained mode, PDF/report ingestion, CSV Data Story, coordinate Map Story, source-highlight scenes, visual reasoning score.")
print("Next: run npm install, then npm run build.")
