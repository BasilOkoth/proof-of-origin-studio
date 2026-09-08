"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Clapperboard,
  Download,
  Eye,
  FileText,
  Film,
  FlaskConical,
  ImagePlus,
  Pencil,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Player } from "@remotion/player";

import { buildEpisode } from "@/lib/generator";
import { syncSceneDurationsToNarration } from "@/lib/narration";
import { makeSample } from "@/lib/sample";
import { downloadText, projectAsMarkdown } from "@/lib/export";
import type {
  EpisodeProject,
  EvidenceAsset,
  EvidenceItem,
  EvidenceKind,
} from "@/lib/types";
import { OriginEpisode } from "@/remotion/OriginEpisode";
import { postForDownload } from "@/lib/render-client";

const initial = makeSample();

function readFile(file: File): Promise<EvidenceAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        dataUrl: String(reader.result),
      });
    reader.readAsDataURL(file);
  });
}

function Chip({
  kind,
  children,
}: {
  kind: EvidenceKind;
  children: React.ReactNode;
}) {
  return <span className={`chip chip-${kind}`}>{children}</span>;
}

function EditorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 12,
        fontSize: 13,
        lineHeight: 1.5,
        opacity: 0.86,
      }}
    >
      {children}
    </div>
  );
}

export default function StudioPage() {
  const [project, setProject] = useState<EpisodeProject>(initial);
  const [topic, setTopic] = useState("Changed payment amount");
  const [question, setQuestion] = useState(
    "I changed one number in a registered document. Could HPS detect it?"
  );
  const [experiment, setExperiment] = useState(
    "Change the Amount paid field from $74.34 to $70.00 and verify only the candidate document."
  );
  const [audience, setAudience] = useState(
    "People curious about digital trust, AI, misinformation and verification."
  );
  const [minutes, setMinutes] = useState(6.5);
  const [evidence, setEvidence] = useState<EvidenceItem[]>(initial.evidence);
  const [activeTab, setActiveTab] = useState<
    "ingest" | "build" | "story" | "narration" | "retention" | "shorts" | "publish"
  >("ingest");
  const [hpsInput, setHpsInput] = useState("");
  const [hpsUrl, setHpsUrl] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestError, setIngestError] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState("eleven_multilingual_v2");
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [narrationError, setNarrationError] = useState("");
  const [renderBusy, setRenderBusy] = useState<
    "video" | "short" | "thumbnail" | null
  >(null);
  const [renderError, setRenderError] = useState("");

  // Manual editing state
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingShortIndex, setEditingShortIndex] = useState<number | null>(null);
  const [editingThumbIndex, setEditingThumbIndex] = useState<number | null>(null);
  const [editingTitleIndex, setEditingTitleIndex] = useState<number | null>(null);
  const [manualScriptEdits, setManualScriptEdits] = useState(false);

  const durationInFrames = useMemo(
    () =>
      Math.max(
        30,
        Math.round(
          project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) * 30
        )
      ),
    [project]
  );

  function invalidateNarration(current: EpisodeProject): EpisodeProject {
    if (!current.narration) return current;
    const next = { ...current };
    delete next.narration;
    return next;
  }

  function updateScene(
    sceneId: string,
    field: "eyebrow" | "headline" | "body" | "narration" | "retentionPurpose",
    value: string
  ) {
    setProject((current) => {
      const base = invalidateNarration(current);
      return {
        ...base,
        scenes: base.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, [field]: value } : scene
        ),
      };
    });
    setManualScriptEdits(true);
    setNarrationError("");
  }

  function updateShort(
    index: number,
    field: "title" | "hook" | "script",
    value: string
  ) {
    setProject((current) => ({
      ...current,
      shorts: current.shorts.map((short, i) =>
        i === index ? { ...short, [field]: value } : short
      ),
    }));
  }

  function updateThumbnail(
    index: number,
    field: "title" | "kicker" | "visual",
    value: string
  ) {
    setProject((current) => ({
      ...current,
      thumbnails: current.thumbnails.map((thumb, i) =>
        i === index ? { ...thumb, [field]: value } : thumb
      ),
    }));
  }

  function updateTitle(index: number, value: string) {
    setProject((current) => ({
      ...current,
      titles: current.titles.map((title, i) => (i === index ? value : title)),
    }));
  }

  function updatePublishing(
    field: "description" | "pinnedComment" | "linkedinPost",
    value: string
  ) {
    setProject((current) => ({
      ...current,
      publishing: {
        ...current.publishing,
        [field]: value,
      },
    }));
  }

  async function ingestHps() {
    setIngestBusy(true);
    setIngestError("");

    try {
      const input = hpsUrl.trim() || hpsInput.trim();

      if (!input) {
        throw new Error(
          "Paste an HPS verification result, record ID or public HPS URL."
        );
      }

      const response = await fetch("/api/hps-ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to ingest HPS evidence.");
      }

      const parsed = data.result;

      setTopic(parsed.suggestedTopic);
      setQuestion(parsed.suggestedQuestion);
      setExperiment(parsed.suggestedExperiment);
      setEvidence(parsed.evidence);

      const next = buildEpisode({
        channelName: project.brand.channelName,
        byline: project.brand.byline,
        topic: parsed.suggestedTopic,
        question: parsed.suggestedQuestion,
        experiment: parsed.suggestedExperiment,
        audience,
        targetMinutes: minutes,
        evidence: parsed.evidence,
      });

      next.assets = project.assets;
      next.hpsIngestion = parsed.ingestion;

      setProject(next);
      setManualScriptEdits(false);
      setEditingSceneId(null);
      setActiveTab("story");
    } catch (error: any) {
      setIngestError(error.message || "Unable to ingest HPS result.");
    } finally {
      setIngestBusy(false);
    }
  }

  async function applyEstimatedNarration() {
    setNarrationBusy(true);
    setNarrationError("");

    try {
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          provider: "estimate",
          wordsPerMinute: 155,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to create narration timing.");
      }

      setProject(syncSceneDurationsToNarration(project, data.track));
      setManualScriptEdits(false);
    } catch (error: any) {
      setNarrationError(
        error.message || "Unable to create narration timing."
      );
    } finally {
      setNarrationBusy(false);
    }
  }

  async function generatePremiumNarration() {
    setNarrationBusy(true);
    setNarrationError("");

    try {
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          provider: "elevenlabs",
          voiceId: voiceId.trim() || undefined,
          modelId: modelId.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Narration generation failed.");
      }

      setProject(syncSceneDurationsToNarration(project, data.track));
      setManualScriptEdits(false);
    } catch (error: any) {
      setNarrationError(error.message || "Unable to generate narration.");
    } finally {
      setNarrationBusy(false);
    }
  }

  async function renderFinalVideo() {
    setRenderBusy("video");
    setRenderError("");

    try {
      await postForDownload(
        "/api/render/video",
        project,
        `proof-of-origin-${project.id}.mp4`
      );
    } catch (error: any) {
      setRenderError(error.message || "Unable to render final video.");
    } finally {
      setRenderBusy(null);
    }
  }

  async function renderShort(index = 0) {
    setRenderBusy("short");
    setRenderError("");

    try {
      await postForDownload(
        "/api/render/short",
        {
          project,
          shortIndex: index,
        },
        `proof-of-origin-${project.id}-short-${index + 1}.mp4`
      );
    } catch (error: any) {
      setRenderError(error.message || "Unable to render Short.");
    } finally {
      setRenderBusy(null);
    }
  }

  async function renderThumbnail(index = 0) {
    setRenderBusy("thumbnail");
    setRenderError("");

    try {
      await postForDownload(
        "/api/render/thumbnail",
        {
          project,
          thumbnailIndex: index,
        },
        `proof-of-origin-${project.id}-thumbnail-${index + 1}.png`
      );
    } catch (error: any) {
      setRenderError(error.message || "Unable to render thumbnail.");
    } finally {
      setRenderBusy(null);
    }
  }

  function regenerate() {
    const next = buildEpisode({
      channelName: project.brand.channelName,
      byline: project.brand.byline,
      topic,
      question,
      experiment,
      audience,
      targetMinutes: minutes,
      evidence,
    });
    next.assets = project.assets;
    next.hpsIngestion = project.hpsIngestion;
    setProject(next);
    setManualScriptEdits(false);
    setEditingSceneId(null);
    setActiveTab("story");
  }

  function addEvidence(kind: EvidenceKind) {
    setEvidence((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        kind,
        statement: "",
      },
    ]);
  }

  function updateEvidence(id: string, statement: string) {
    setEvidence((items) =>
      items.map((item) => (item.id === id ? { ...item, statement } : item))
    );
  }

  async function uploadAssets(files: FileList | null) {
    if (!files?.length) return;
    const uploaded = await Promise.all(Array.from(files).map(readFile));
    setProject((current) => ({
      ...current,
      assets: [...current.assets, ...uploaded],
      scenes: current.scenes.map((scene, index) =>
        index < uploaded.length
          ? { ...scene, assetId: uploaded[index]?.id }
          : scene
      ),
    }));
  }

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brandLockup">
          <div className="brandIcon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <strong>Proof of Origin Studio</strong>
            <span>by Human Provenance Standard</span>
          </div>
        </div>
        <div className="topActions">
          <span className="truthBadge">
            <BadgeCheck size={15} /> Truth-first workflow
          </span>
          <button
            className="button ghost"
            onClick={() =>
              downloadText(
                `${project.id}.json`,
                JSON.stringify(project, null, 2),
                "application/json"
              )
            }
          >
            <Download size={16} /> Export project
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">PREMIUM VIDEO OPERATING SYSTEM</p>
          <h1>Turn real experiments into videos people actually want to watch.</h1>
          <p className="lede">
            Evidence → story → script → cinematic scenes → Shorts → publishing
            package. Designed for digital trust, provenance, AI authenticity and
            HPS stress tests.
          </p>
        </div>
        <div className="heroMetric">
          <span>EDITORIAL STANDARD</span>
          <strong>Observed ≠ Inferred</strong>
          <p>Every episode keeps facts, interpretation and limitations separate.</p>
        </div>
      </section>

      <nav className="tabs">
        {[
          ["ingest", "01", "HPS Ingest"],
          ["build", "02", "Evidence"],
          ["story", "03", "Story & Video"],
          ["narration", "04", "Narration"],
          ["retention", "05", "Retention Lab"],
          ["shorts", "06", "Shorts & Thumbnails"],
          ["publish", "07", "Publish"],
        ].map(([key, number, label]) => (
          <button
            key={key}
            className={activeTab === key ? "tab active" : "tab"}
            onClick={() => setActiveTab(key as typeof activeTab)}
          >
            <span>{number}</span>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "ingest" && (
        <section className="workspace ingestGrid">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">AUTOMATIC HPS INGESTION</p>
                <h2>Paste the verification receipt. Build the episode.</h2>
              </div>
              <ShieldCheck />
            </div>

            <p className="muted">
              Paste the visible HPS verification result exactly as you saw it.
              You can also use a public HPS record ID or URL. The Studio extracts
              the record ID, relationship, confidence, integrity result,
              signatures, witness status and explicit before → after changes
              when present.
            </p>

            <label>
              HPS verification result
              <textarea
                rows={15}
                value={hpsInput}
                onChange={(e) => setHpsInput(e.target.value)}
                placeholder={"HPS✓RELATED / MODIFIED\nHPS-2026-...\nAsset identity Different bytes\nRelationship confidence 79/100\n..."}
              />
            </label>

            <div className="orDivider">
              <span>OR</span>
            </div>

            <label>
              Public HPS record/result URL
              <input
                value={hpsUrl}
                onChange={(e) => setHpsUrl(e.target.value)}
                placeholder="https://www.humanprovenancestandard.org/records/HPS-..."
              />
            </label>

            {ingestError && <div className="studioError">{ingestError}</div>}

            <button
              className="button primary large"
              onClick={ingestHps}
              disabled={ingestBusy}
            >
              <WandSparkles size={18} />
              {ingestBusy
                ? "Reading HPS evidence…"
                : "Ingest HPS result & build episode"}
            </button>
          </div>

          <div className="panel">
            <p className="micro">WHAT GETS AUTOMATED</p>
            <h2>From verification receipt to story architecture.</h2>

            <div className="automationSteps">
              {[
                [
                  "01",
                  "Parse",
                  "Record ID, relationship, confidence, integrity and witness results.",
                ],
                [
                  "02",
                  "Evidence",
                  "Convert observed HPS output into truth-labelled evidence.",
                ],
                [
                  "03",
                  "Question",
                  "Turn the experiment into a viewer-first central question.",
                ],
                [
                  "04",
                  "Story",
                  "Generate hook, setup, proof, interpretation, limitation and payoff.",
                ],
                [
                  "05",
                  "Narration",
                  "Create a timing-ready narration track.",
                ],
                [
                  "06",
                  "Captions",
                  "Use sentence timings to animate captions in the final render.",
                ],
              ].map(([n, title, body]) => (
                <article key={n}>
                  <span>{n}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="truthNotice">
              <BadgeCheck />
              <div>
                <strong>Claims stay conservative.</strong>
                <p>
                  The parser never turns RELATED / MODIFIED into “authentic”,
                  never treats inconclusive as fraud, and keeps provenance
                  separate from factual truth.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "build" && (
        <section className="workspace twoCol">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">EPISODE INTAKE</p>
                <h2>Start with the experiment, not the script.</h2>
              </div>
              <FlaskConical />
            </div>

            <label>
              Topic
              <input value={topic} onChange={(e) => setTopic(e.target.value)} />
            </label>

            <label>
              Big question
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
              />
            </label>

            <label>
              Controlled experiment
              <textarea
                value={experiment}
                onChange={(e) => setExperiment(e.target.value)}
                rows={3}
              />
            </label>

            <div className="fieldGrid">
              <label>
                Target minutes
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={0.5}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </label>
              <label>
                Audience
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </label>
            </div>

            <button className="button primary large" onClick={regenerate}>
              <WandSparkles size={18} /> Build premium episode
            </button>
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">EVIDENCE LEDGER</p>
                <h2>What do we actually know?</h2>
              </div>
              <FileText />
            </div>

            <div className="evidenceActions">
              <button onClick={() => addEvidence("observed")}>
                <Plus size={14} /> Observed
              </button>
              <button onClick={() => addEvidence("inference")}>
                <Plus size={14} /> Inference
              </button>
              <button onClick={() => addEvidence("limitation")}>
                <Plus size={14} /> Limitation
              </button>
            </div>

            <div className="evidenceList">
              {evidence.map((item) => (
                <div className="evidenceRow" key={item.id}>
                  <Chip kind={item.kind}>{item.kind}</Chip>
                  <textarea
                    value={item.statement}
                    onChange={(e) => updateEvidence(item.id, e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
            </div>

            <label className="uploadBox">
              <ImagePlus />
              <strong>Upload screenshots / evidence</strong>
              <span>Images are stored inside the exported project as data URLs.</span>
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => uploadAssets(e.target.files)}
              />
            </label>
          </div>
        </section>
      )}

      {activeTab === "story" && (
        <section className="workspace storyGrid">
          <div className="panel stickyPreview">
            <div className="panelHead">
              <div>
                <p className="micro">CINEMATIC PREVIEW</p>
                <h2>{project.episode.workingTitle}</h2>
              </div>
              <Film />
            </div>

            <div className="playerShell">
              <Player
                component={OriginEpisode}
                inputProps={project}
                durationInFrames={durationInFrames}
                compositionWidth={1920}
                compositionHeight={1080}
                fps={30}
                controls
                style={{ width: "100%", aspectRatio: "16 / 9" }}
              />
            </div>

            <div className="previewMeta">
              <span>
                <Play size={15} /> {Math.round(durationInFrames / 30)} sec
              </span>
              <span>
                <Clapperboard size={15} /> {project.scenes.length} scenes
              </span>
              <span>
                <Eye size={15} /> 16:9 master
              </span>
              <span>
                <Sparkles size={15} />{" "}
                {project.narration
                  ? `${project.narration.sentences.length} timed captions`
                  : manualScriptEdits
                    ? "timing needs rebuild"
                    : "captions pending"}
              </span>
            </div>

            {manualScriptEdits && (
              <EditorNotice>
                <strong>Script changed.</strong> The old narration timing was
                cleared so captions and voice cannot drift from the edited
                script. When you finish editing, open <strong>Narration</strong>{" "}
                and build timing again.
              </EditorNotice>
            )}
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">STORY MAP</p>
                <h2>Every scene has a job — and is now editable.</h2>
              </div>
              <Sparkles />
            </div>

            <div className="sceneList">
              {project.scenes.map((scene, index) => {
                const isEditing = editingSceneId === scene.id;
                return (
                  <article className="sceneCard" key={scene.id}>
                    <div className="sceneIndex">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div style={{ width: "100%" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <p className="micro">{scene.eyebrow}</p>
                        <button
                          className="button ghost"
                          onClick={() =>
                            setEditingSceneId(isEditing ? null : scene.id)
                          }
                        >
                          {isEditing ? (
                            <>
                              <Save size={14} /> Done
                            </>
                          ) : (
                            <>
                              <Pencil size={14} /> Edit scene
                            </>
                          )}
                        </button>
                      </div>

                      {isEditing ? (
                        <>
                          <label>
                            Scene label
                            <input
                              value={scene.eyebrow}
                              onChange={(e) =>
                                updateScene(scene.id, "eyebrow", e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Headline
                            <input
                              value={scene.headline}
                              onChange={(e) =>
                                updateScene(scene.id, "headline", e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Narration
                            <textarea
                              rows={8}
                              value={scene.narration}
                              onChange={(e) =>
                                updateScene(
                                  scene.id,
                                  "narration",
                                  e.target.value
                                )
                              }
                            />
                          </label>
                          <label>
                            On-screen body / supporting copy
                            <textarea
                              rows={4}
                              value={scene.body}
                              onChange={(e) =>
                                updateScene(scene.id, "body", e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Retention job
                            <input
                              value={scene.retentionPurpose || ""}
                              onChange={(e) =>
                                updateScene(
                                  scene.id,
                                  "retentionPurpose",
                                  e.target.value
                                )
                              }
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <h3>{scene.headline}</h3>
                          <p>{scene.narration}</p>
                          {scene.retentionPurpose && (
                            <div className="retentionPurpose">
                              <strong>Retention job:</strong>{" "}
                              {scene.retentionPurpose}
                            </div>
                          )}
                        </>
                      )}

                      <div className="sceneMeta">
                        <span>{scene.kind}</span>
                        <span>{scene.durationSec}s</span>
                        <span>{scene.factIds.length} evidence links</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="exportRow">
              <button
                className="button"
                onClick={() =>
                  downloadText(
                    `${project.id}-script.md`,
                    projectAsMarkdown(project),
                    "text/markdown"
                  )
                }
              >
                <Download size={16} /> Script package
              </button>
              <button
                className="button"
                onClick={() =>
                  downloadText(
                    `${project.id}.json`,
                    JSON.stringify(project, null, 2),
                    "application/json"
                  )
                }
              >
                <Download size={16} /> Render JSON
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "narration" && (
        <section className="workspace narrationGrid">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">PREMIUM NARRATION</p>
                <h2>Voice, timing and captions from one approved script.</h2>
              </div>
              <Sparkles />
            </div>

            <div className="narrationStatus">
              <span
                className={
                  project.narration?.audioDataUrl ? "statusDot live" : "statusDot"
                }
              />
              <div>
                <strong>
                  {project.narration?.provider === "elevenlabs"
                    ? "Premium narration ready"
                    : project.narration
                      ? "Estimated timing ready"
                      : manualScriptEdits
                        ? "Script edited — rebuild timing"
                        : "No narration track yet"}
                </strong>
                <p>
                  {project.narration
                    ? `${project.narration.sentences.length} timed sentences · ${project.narration.durationSec.toFixed(1)} sec`
                    : manualScriptEdits
                      ? "Your edited Story Map is now the source narration. Build timing again before generating audio."
                      : "Generate estimated timing free, or connect ElevenLabs for real audio + character timing."}
                </p>
              </div>
            </div>

            <button
              className="button"
              onClick={() => {
                setEditingSceneId(project.scenes[0]?.id || null);
                setActiveTab("story");
              }}
              style={{ marginBottom: 14 }}
            >
              <Pencil size={16} /> Edit source script
            </button>

            <label>
              ElevenLabs voice ID
              <input
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder="Optional — leave blank to use ELEVENLABS_VOICE_ID from .env.local"
              />
            </label>

            <label>
              Model ID
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="eleven_multilingual_v2"
              />
            </label>

            {narrationError && (
              <div className="studioError">{narrationError}</div>
            )}

            <div className="narrationActions">
              <button
                className="button"
                onClick={applyEstimatedNarration}
                disabled={narrationBusy}
              >
                <Clapperboard size={16} />{" "}
                {manualScriptEdits
                  ? "Rebuild timing from edited script"
                  : "Build timing without TTS"}
              </button>
              <button
                className="button primary"
                onClick={generatePremiumNarration}
                disabled={narrationBusy}
              >
                <WandSparkles size={16} />
                {narrationBusy
                  ? "Generating voice…"
                  : "Generate premium narration"}
              </button>
            </div>

            {project.narration?.audioDataUrl && (
              <div className="audioPreview">
                <p className="micro">GENERATED MASTER VOICE TRACK</p>
                <audio controls src={project.narration.audioDataUrl} />
              </div>
            )}

            <p className="muted narrationPrivacy">
              API keys stay server-side in <code>.env.local</code>. The narration
              route sends only the approved narration text and selected
              voice/model identifiers to the configured voice provider.
            </p>
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">SENTENCE-LEVEL TIMELINE</p>
                <h2>Captions follow the narration automatically.</h2>
              </div>
              <Film />
            </div>

            {project.narration ? (
              <div className="sentenceTimeline">
                {project.narration.sentences
                  .slice(0, 80)
                  .map((sentence, index) => (
                    <article key={sentence.id}>
                      <span className="sentenceTime">
                        {sentence.startSec.toFixed(1)}–
                        {sentence.endSec.toFixed(1)}
                      </span>
                      <div>
                        <strong>
                          {String(index + 1).padStart(2, "0")}
                        </strong>
                        <p>{sentence.text}</p>
                        <span className="timedWordCount">
                          {sentence.words.length} word-level timestamps
                        </span>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <div className="emptyNarration">
                <Clapperboard />
                <strong>
                  {manualScriptEdits
                    ? "Edited script is waiting for new timing."
                    : "No timed narration yet."}
                </strong>
                <p>
                  {manualScriptEdits
                    ? "Click Rebuild timing from edited script when your Story Map edits are finished."
                    : "Generate timing to see every caption sentence on the timeline."}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "retention" && (
        <section className="workspace retentionGrid">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">WATCH-TIME SYSTEM</p>
                <h2>Retention Lab</h2>
              </div>
              <Eye />
            </div>

            <div className="retentionHero">
              <div className="scoreRing">
                <strong>{project.retention?.overall ?? 0}</strong>
                <span>/100</span>
              </div>
              <div>
                <p className="micro">EDITORIAL RETENTION SCORE</p>
                <h3>
                  {project.retention && project.retention.overall >= 85
                    ? "Strong watch-time structure"
                    : project.retention && project.retention.overall >= 70
                      ? "Promising, but tighten the weak points"
                      : "Needs stronger retention engineering"}
                </h3>
                <p className="muted">
                  This is an editorial quality score, not a YouTube guarantee.
                  It measures hook strength, pacing, proof density, curiosity and
                  clarity before publishing.
                </p>
              </div>
            </div>

            {manualScriptEdits && (
              <EditorNotice>
                <strong>Note:</strong> you edited the generated script after this
                retention score was created. Treat the score as guidance for the
                generated draft. Your manual edits are preserved.
              </EditorNotice>
            )}

            <div className="retentionMetrics">
              {[
                ["Hook", project.retention?.hook ?? 0],
                ["Pacing", project.retention?.pacing ?? 0],
                ["Proof density", project.retention?.proofDensity ?? 0],
                ["Curiosity", project.retention?.curiosity ?? 0],
                ["Clarity", project.retention?.clarity ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="metricBar">
                  <div>
                    <span>{label}</span>
                    <strong>{value}/100</strong>
                  </div>
                  <div className="metricTrack">
                    <div
                      className="metricFill"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {!!project.retention?.warnings.length && (
              <div className="retentionWarnings">
                <p className="micro">WHAT MAY LOSE VIEWERS</p>
                {project.retention.warnings.map((warning, index) => (
                  <div key={index}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div style={{ flex: 1 }}>
                      <p>{warning}</p>
                      {index === 0 && project.scenes[0] && (
                        <button
                          className="button ghost"
                          onClick={() => {
                            setEditingSceneId(project.scenes[0]!.id);
                            setActiveTab("story");
                          }}
                          style={{ marginTop: 8 }}
                        >
                          <Pencil size={14} /> Edit opening hook
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">ATTENTION MAP</p>
                <h2>Plan a reason to keep watching.</h2>
              </div>
              <Sparkles />
            </div>

            <div className="retentionTimeline">
              {project.retention?.beats.map((beat, index) => (
                <article key={`${beat.atSec}-${index}`}>
                  <div className={`beatDot beat-${beat.type}`} />
                  <div>
                    <div className="beatTop">
                      <span>
                        {Math.floor(beat.atSec / 60)}:
                        {String(beat.atSec % 60).padStart(2, "0")}
                      </span>
                      <strong>{beat.type.replace("_", " ")}</strong>
                    </div>
                    <p>{beat.label}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="watchRules">
              <p className="micro">WATCH-TIME RULES</p>
              <div>
                <strong>First seconds</strong>
                <span>
                  Show the object, the controlled change and the question. No
                  long intro.
                </span>
              </div>
              <div>
                <strong>Open loop</strong>
                <span>Promise a specific result viewers will see later.</span>
              </div>
              <div>
                <strong>Proof cadence</strong>
                <span>Keep introducing visible evidence, not just narration.</span>
              </div>
              <div>
                <strong>Pattern resets</strong>
                <span>
                  Switch visual grammar before a section starts feeling static.
                </span>
              </div>
              <div>
                <strong>Payoff</strong>
                <span>Deliver the answer before asking for a subscription.</span>
              </div>
              <div>
                <strong>Next-video bridge</strong>
                <span>
                  End with the next unresolved experiment, not a generic CTA.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "shorts" && (
        <section className="workspace twoCol">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">SHORTS ENGINE</p>
                <h2>One experiment. Three editable vertical hooks.</h2>
              </div>
              <Clapperboard />
            </div>

            {project.shorts.map((short, index) => {
              const isEditing = editingShortIndex === index;
              return (
                <article className="shortCard" key={`short-${index}`}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span className="shortNumber">SHORT {index + 1}</span>
                    <button
                      className="button ghost"
                      onClick={() =>
                        setEditingShortIndex(isEditing ? null : index)
                      }
                    >
                      {isEditing ? (
                        <>
                          <Save size={14} /> Done
                        </>
                      ) : (
                        <>
                          <Pencil size={14} /> Edit
                        </>
                      )}
                    </button>
                  </div>

                  {isEditing ? (
                    <>
                      <label>
                        Short title
                        <input
                          value={short.title}
                          onChange={(e) =>
                            updateShort(index, "title", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Hook
                        <textarea
                          rows={3}
                          value={short.hook}
                          onChange={(e) =>
                            updateShort(index, "hook", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Script
                        <textarea
                          rows={7}
                          value={short.script}
                          onChange={(e) =>
                            updateShort(index, "script", e.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <h3>{short.title}</h3>
                      <strong>{short.hook}</strong>
                      <p>{short.script}</p>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">THUMBNAIL LAB</p>
                <h2>Curiosity without clickbait — now editable.</h2>
              </div>
              <ImagePlus />
            </div>

            <div className="thumbGrid">
              {project.thumbnails.map((thumb, index) => {
                const isEditing = editingThumbIndex === index;
                return (
                  <article className="thumbCard" key={`thumb-${index}`}>
                    <div className="thumbMock">
                      <span>{thumb.title}</span>
                      <strong>{thumb.kicker}</strong>
                    </div>

                    {isEditing ? (
                      <>
                        <label>
                          Main thumbnail text
                          <input
                            value={thumb.title}
                            onChange={(e) =>
                              updateThumbnail(index, "title", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Kicker
                          <input
                            value={thumb.kicker}
                            onChange={(e) =>
                              updateThumbnail(index, "kicker", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Visual direction
                          <textarea
                            rows={3}
                            value={thumb.visual}
                            onChange={(e) =>
                              updateThumbnail(index, "visual", e.target.value)
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <p>{thumb.visual}</p>
                    )}

                    <button
                      className="button ghost"
                      onClick={() =>
                        setEditingThumbIndex(isEditing ? null : index)
                      }
                      style={{ marginTop: 8 }}
                    >
                      {isEditing ? (
                        <>
                          <Save size={14} /> Done
                        </>
                      ) : (
                        <>
                          <Pencil size={14} /> Edit thumbnail
                        </>
                      )}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="titleStack">
              <p className="micro">TITLE OPTIONS</p>
              {project.titles.map((title, index) => {
                const isEditing = editingTitleIndex === index;
                return (
                  <div key={`title-${index}`}>
                    <span>{index + 1}</span>
                    {isEditing ? (
                      <input
                        value={title}
                        onChange={(e) => updateTitle(index, e.target.value)}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <strong style={{ flex: 1 }}>{title}</strong>
                    )}
                    <button
                      className="button ghost"
                      onClick={() =>
                        setEditingTitleIndex(isEditing ? null : index)
                      }
                    >
                      {isEditing ? (
                        <>
                          <Save size={14} /> Done
                        </>
                      ) : (
                        <>
                          <Pencil size={14} /> Edit
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {activeTab === "publish" && (
        <section className="workspace publishGrid">
          <div className="panel">
            <p className="micro">YOUTUBE DESCRIPTION</p>
            <textarea
              rows={14}
              value={project.publishing.description}
              onChange={(e) =>
                updatePublishing("description", e.target.value)
              }
            />
          </div>

          <div className="panel">
            <p className="micro">PINNED COMMENT</p>
            <textarea
              rows={9}
              value={project.publishing.pinnedComment}
              onChange={(e) =>
                updatePublishing("pinnedComment", e.target.value)
              }
            />
          </div>

          <div className="panel">
            <p className="micro">LINKEDIN LAUNCH</p>
            <textarea
              rows={12}
              value={project.publishing.linkedinPost}
              onChange={(e) =>
                updatePublishing("linkedinPost", e.target.value)
              }
            />
          </div>

          <div className="panel renderMasterPanel">
            <p className="micro">ONE-CLICK CLOUD RENDER</p>
            <h2>Generate the actual video here.</h2>
            <p className="muted">
              Proof of Origin Studio sends the current edited project to the
              server, renders it with Remotion, and downloads the finished media.
              The JSON remains available as your editable production blueprint.
            </p>

            {!project.narration && manualScriptEdits && (
              <EditorNotice>
                Your source script changed after timing was generated. Rebuild
                narration timing before the final render so captions match the
                edited narration.
              </EditorNotice>
            )}

            <div className="renderActionGrid">
              <button
                className="button primary"
                onClick={renderFinalVideo}
                disabled={Boolean(renderBusy)}
              >
                <Film size={16} />
                {renderBusy === "video"
                  ? "Rendering final video…"
                  : "Generate Final Video"}
              </button>

              <button
                className="button"
                onClick={() => renderShort(0)}
                disabled={Boolean(renderBusy)}
              >
                <Clapperboard size={16} />
                {renderBusy === "short"
                  ? "Rendering Short…"
                  : "Generate Short 1"}
              </button>

              <button
                className="button"
                onClick={() => renderThumbnail(0)}
                disabled={Boolean(renderBusy)}
              >
                <ImagePlus size={16} />
                {renderBusy === "thumbnail"
                  ? "Rendering thumbnail…"
                  : "Generate Thumbnail"}
              </button>
            </div>

            {renderBusy && (
              <div className="renderProgress">
                <div className="renderPulse" />
                <div>
                  <strong>Cloud rendering in progress</strong>
                  <span>
                    Keep this tab open. Video rendering can take several minutes
                    depending on your Render instance.
                  </span>
                </div>
              </div>
            )}

            {renderError && (
              <div className="narrationError">{renderError}</div>
            )}

            <div className="manifestBackup">
              <span>Need the editable production blueprint?</span>
              <button
                className="button ghost"
                onClick={() =>
                  downloadText(
                    `episode-${project.id}.json`,
                    JSON.stringify(project, null, 2),
                    "application/json"
                  )
                }
              >
                <Download size={16} /> Export JSON manifest
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
