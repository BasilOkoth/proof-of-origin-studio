from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
PAGE = ROOT / "src/app/page.tsx"
TYPES = ROOT / "src/lib/types.ts"
STORY_PACKS = ROOT / "src/lib/story-packs.ts"
STORY_ENGINE = ROOT / "src/lib/story-engine.ts"
PATCH_ROOT = Path(__file__).resolve().parent

required = [PAGE, TYPES]
missing = [str(p) for p in required if not p.exists()]
if missing:
    print("Run this script from the root of proof-of-origin-studio.")
    print("Missing:", ", ".join(missing))
    sys.exit(1)

text = PAGE.read_text(encoding="utf-8")

replacements = [
    (
        'import { buildEpisode } from "@/lib/generator";',
        'import { buildStoryEpisode } from "@/lib/story-engine";\nimport { STORY_PACKS, getStoryPack } from "@/lib/story-packs";',
    ),
    (
        '  EvidenceItem,\n  EvidenceKind,\n} from "@/lib/types";',
        '  EvidenceItem,\n  EvidenceKind,\n  StoryMode,\n} from "@/lib/types";',
    ),
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
        '            <strong>Evidence Studio</strong>\n            <span>Proof of Origin + evidence-led story packs</span>',
    ),
    (
        '          <p className="eyebrow">PREMIUM VIDEO OPERATING SYSTEM</p>\n          <h1>Turn real experiments into videos people actually want to watch.</h1>\n          <p className="lede">\n            Evidence → story → script → cinematic scenes → Shorts → publishing\n            package. Designed for digital trust, provenance, AI authenticity and\n            HPS stress tests.\n          </p>',
        '          <p className="eyebrow">EVIDENCE-TO-VIDEO OPERATING SYSTEM</p>\n          <h1>Turn evidence into videos that can show their work.</h1>\n          <p className="lede">\n            Evidence → story → script → cinematic scenes → Shorts → publishing\n            package. Use HPS verification, experiments, research, reports,\n            investigations, explainers and case studies without blurring facts,\n            interpretation and limitations.\n          </p>',
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

patched = text
for old, new in replacements:
    if old not in patched:
        print("Patch stopped before making changes: expected source text was not found.")
        print("Missing pattern starts with:", repr(old[:140]))
        sys.exit(2)
    patched = patched.replace(old, new, 1)

# Only write after every expected pattern has been validated.
for path in [PAGE, TYPES]:
    backup = path.with_suffix(path.suffix + ".pre-evidence-studio")
    if not backup.exists():
        shutil.copy2(path, backup)

TYPES.write_text(
    (PATCH_ROOT / "src/lib/types.ts").read_text(encoding="utf-8"),
    encoding="utf-8",
)
STORY_PACKS.write_text(
    (PATCH_ROOT / "src/lib/story-packs.ts").read_text(encoding="utf-8"),
    encoding="utf-8",
)
STORY_ENGINE.write_text(
    (PATCH_ROOT / "src/lib/story-engine.ts").read_text(encoding="utf-8"),
    encoding="utf-8",
)
PAGE.write_text(patched, encoding="utf-8")

print("Evidence Studio core applied successfully.")
print("Added story modes: HPS, experiment, research, report, investigation, explainer, case study.")
print("Evidence rows now accept an optional source reference.")
print("Backups were created beside page.tsx and types.ts.")
