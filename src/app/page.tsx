"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Database,
  Clapperboard,
  Download,
  Eye,
  ExternalLink,
  FileSearch,
  FileText,
  Film,
  Globe2,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  MapPinned,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Player } from "@remotion/player";

import { analyzeCsv, upgradeLegacyDatasetAnalysis } from "@/lib/data-story";
import { scoutSourceToEvidence, type EvidenceScoutResponse, type EvidenceScoutSource, type StoryQuestionCandidate } from "@/lib/evidence-scout";
import { downloadText, projectAsMarkdown } from "@/lib/export";
import { downloadLocalRenderPackage } from "@/lib/local-render-package";
import { syncSceneDurationsToNarration } from "@/lib/narration";
import { applyNarrationDirector } from "@/lib/narration-director";
import { postForDownload } from "@/lib/render-client";
import { makeSample } from "@/lib/sample";
import { buildStoryEpisode } from "@/lib/story-engine";
import { STORY_PACKS, getStoryPack } from "@/lib/story-packs";
import { applyVisualIntelligence } from "@/lib/visual-reasoning";
import type {
  DatasetAnalysis,
  DocumentIngestion,
  EpisodeProject,
  EvidenceAsset,
  EvidenceItem,
  EvidenceKind,
  EvidenceSourceType,
  StoryMode,
} from "@/lib/types";
import { OriginEpisode } from "@/remotion/OriginEpisode";
import { EvidenceIntelligenceLab } from "@/components/EvidenceIntelligenceLab";
import { listEvidenceLibrary, saveEvidenceLibraryRecord } from "@/lib/evidence-library";
import type { StoryHunterAngle } from "@/lib/evidence-intelligence";

const initial = makeSample();

const WORKSPACE_STORAGE_KEY = "evidence-studio:workspace:v1";

type PersistedWorkspace = {
  mode: StoryMode;
  topic: string;
  question: string;
  brief: string;
  audience: string;
  minutes: number;
  evidence: EvidenceItem[];
  datasets: DatasetAnalysis[];
  activeTab: Tab;
  sourceKind: "research" | "report" | "text";
  scoutQuery: string;
  voiceId: string;
  modelId: string;
  manualScriptEdits: boolean;
  project: EpisodeProject;
};

function projectForWorkspaceStorage(project: EpisodeProject): EpisodeProject {
  /*
   * Keep the editable project but exclude heavy data URLs from localStorage.
   * Image source Blobs are already persisted in the Evidence Library/IndexedDB
   * and are rehydrated from there.
   */
  const next: EpisodeProject = {
    ...project,
    assets: [],
  };

  if (next.narration?.audioDataUrl) {
    const { audioDataUrl: _audioDataUrl, ...restNarration } = next.narration;
    next.narration = restNarration;
  }

  return next;
}

function isValidTab(value: unknown): value is Tab {
  return [
    "build",
    "sources",
    "discover",
    "intelligence",
    "story",
    "visual",
    "narration",
    "retention",
    "publish",
  ].includes(String(value));
}

type Tab =
  | "build"
  | "sources"
  | "discover"
  | "intelligence"
  | "story"
  | "visual"
  | "narration"
  | "retention"
  | "publish";

function readImage(file: File): Promise<EvidenceAsset> {
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

function Chip({ kind }: { kind: EvidenceKind }) {
  return <span className={`chip chip-${kind}`}>{kind}</span>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 14,
        lineHeight: 1.5,
        opacity: 0.9,
      }}
    >
      {children}
    </div>
  );
}

function scoreTone(value: number) {
  if (value >= 80) return "Strong";
  if (value >= 60) return "Developing";
  return "Needs evidence";
}


type StudioScene = EpisodeProject["scenes"][number];

type DirectedDatasets = {
  temporal?: DatasetAnalysis;
  comparison?: DatasetAnalysis;
  spatial?: DatasetAnalysis;
};

function cleanText(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function hasAny(value: string | undefined, terms: string[]) {
  const input = cleanText(value).toLowerCase();
  return terms.some((term) => input.includes(term.toLowerCase()));
}

function datasetSourceLabel(dataset?: DatasetAnalysis) {
  return (
    dataset?.recommendedChart?.sourceLabel ||
    dataset?.recommendedMap?.sourceLabel ||
    dataset?.name ||
    "Structured evidence"
  );
}

function temporalDatasetScore(dataset: DatasetAnalysis) {
  const chart = dataset.recommendedChart;
  if (!chart || chart.type !== "line") return -1;

  let score = 240;
  score += Math.min(40, dataset.rowCount);
  score += Math.min(40, dataset.dateColumns.length * 12);
  if (hasAny(chart.title, ["over time", "monthly", "rainfall", "precipitation"])) score += 90;
  if (hasAny(chart.yLabel, ["rainfall", "precipitation", "mm"])) score += 70;
  if (hasAny(dataset.name, ["monthly", "rainfall", "2024"])) score += 35;
  return score;
}

function comparisonDatasetScore(dataset: DatasetAnalysis) {
  const chart = dataset.recommendedChart;
  if (!chart || !(chart.type === "bar" || chart.type === "ranking" || chart.type === "scatter")) {
    return -1;
  }

  let score = 220;
  score += Math.min(35, dataset.rowCount);
  if (hasAny(chart.title, ["by station", "by location", "flood event", "total"])) score += 90;
  if (hasAny(chart.yLabel, ["7-day", "24h", "rainfall", "precipitation", "mm", "total"])) score += 65;
  if (hasAny(dataset.name, ["flood event", "station", "event", "rainfall"])) score += 45;
  return score;
}

function spatialDatasetScore(dataset: DatasetAnalysis) {
  const map = dataset.recommendedMap;
  if (!map) return -1;

  let score = 260;
  if (dataset.latitudeColumn && dataset.longitudeColumn) score += 120;
  if (hasAny(dataset.name, ["geocoded", "nairobi", "rainfall", "station"])) score += 45;
  if (map.points.some((point) => typeof point.value === "number")) score += 30;
  return score;
}

function chooseDirectedDatasets(datasets: DatasetAnalysis[]): DirectedDatasets {
  const temporal = [...datasets]
    .sort((a, b) => temporalDatasetScore(b) - temporalDatasetScore(a))
    .find((item) => temporalDatasetScore(item) >= 0);

  const spatial = [...datasets]
    .sort((a, b) => spatialDatasetScore(b) - spatialDatasetScore(a))
    .find((item) => spatialDatasetScore(item) >= 0);

  const comparisonCandidates = [...datasets]
    .filter((item) => comparisonDatasetScore(item) >= 0)
    .sort((a, b) => {
      const aSpatialPenalty =
        spatial && itemSharesDatasetRole(a, spatial) ? 120 : 0;
      const bSpatialPenalty =
        spatial && itemSharesDatasetRole(b, spatial) ? 120 : 0;

      return (
        comparisonDatasetScore(b) - bSpatialPenalty -
        (comparisonDatasetScore(a) - aSpatialPenalty)
      );
    });

  let comparison = comparisonCandidates.find(
    (item) =>
      (!temporal || !itemSharesDatasetRole(item, temporal)) &&
      (!spatial || !itemSharesDatasetRole(item, spatial))
  );

  if (!comparison) {
    comparison = comparisonCandidates.find(
      (item) =>
        !temporal || !itemSharesDatasetRole(item, temporal)
    );
  }

  if (!comparison) {
    comparison = comparisonCandidates[0];
  }

  return { temporal, comparison, spatial };
}

function itemSharesDatasetRole(a: DatasetAnalysis, b: DatasetAnalysis) {
  return a.name === b.name;
}

function chartValue(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function lineNarrationInsight(dataset: DatasetAnalysis) {
  const chart = dataset.recommendedChart;
  if (!chart || chart.type !== "line" || !chart.data.length) {
    return cleanText(dataset.insight);
  }

  const ranked = [...chart.data].sort(
    (a, b) => b.value - a.value
  );
  const peak = ranked[0];
  const second = ranked[1];

  if (!peak) return cleanText(dataset.insight);

  const unit = chart.unit ? ` ${chart.unit}` : "";

  if (second) {
    return `Across the plotted period, the pattern is uneven rather than a simple rise or fall. The highest value is ${chartValue(peak.value)}${unit} in ${peak.label}, with another high point of ${chartValue(second.value)}${unit} in ${second.label}.`;
  }

  return `The highest plotted value is ${chartValue(peak.value)}${unit} in ${peak.label}.`;
}

function comparisonNarrationInsight(dataset: DatasetAnalysis) {
  const chart = dataset.recommendedChart;
  if (
    !chart ||
    !(chart.type === "bar" || chart.type === "ranking") ||
    !chart.data.length
  ) {
    return cleanText(dataset.insight);
  }

  const ranked = [...chart.data].sort(
    (a, b) => b.value - a.value
  );
  const top = ranked[0];
  const second = ranked[1];
  const unit = chart.unit ? ` ${chart.unit}` : "";

  if (top && second) {
    return `${top.label} records the highest plotted ${chart.yLabel || "value"} at ${chartValue(top.value)}${unit}, followed by ${second.label} at ${chartValue(second.value)}${unit}.`;
  }

  if (top) {
    return `${top.label} records the highest plotted ${chart.yLabel || "value"} at ${chartValue(top.value)}${unit}.`;
  }

  return cleanText(dataset.insight);
}

function makeDirectedChartScene(
  scene: StudioScene,
  dataset: DatasetAnalysis,
  role: "trigger" | "comparison"
): StudioScene {
  const chart = dataset.recommendedChart;
  if (!chart) return scene;

  const insight =
    role === "trigger"
      ? lineNarrationInsight(dataset)
      : comparisonNarrationInsight(dataset);

  return {
    ...scene,
    kind: "data_chart",
    eyebrow: role === "trigger" ? "TRIGGER" : "DATA STORY",
    headline: chart.title,
    body: insight,
    narration:
      role === "trigger"
        ? `Start with the rain. ${insight} That gives us the weather signal. It still does not explain why the same rain becomes damaging in some places and not others.`
        : `Now compare the event across the measured locations. ${insight} The comparison shows magnitude. It does not, by itself, explain the flooding.`,
    chart,
    map: undefined,
    sourceLabel: datasetSourceLabel(dataset),
    sourceExcerpt: insight,
    visualPlan: {
      kind: "data_chart",
      reason:
        role === "trigger"
          ? "The strongest temporal rainfall dataset should establish the trigger visually."
          : "A station or location comparison is best used as a separate quantitative comparison scene.",
      evidenceIds: scene.factIds || [],
      confidence: 99,
    },
    autoVisual: true,
  };
}

function makeDirectedMapScene(scene: StudioScene, dataset: DatasetAnalysis): StudioScene {
  const map = dataset.recommendedMap;
  if (!map) return scene;

  const labels = map.points
    .slice(0, 4)
    .map((point) => point.label)
    .filter(Boolean);

  const placeSentence =
    labels.length > 0
      ? `The dataset maps ${map.points.length} observations, including ${labels.join(", ")}.`
      : `The dataset maps ${map.points.length} observations.`;

  const insight = `${placeSentence} This shows where the measurements exist; it should not be read as a complete map of flood risk across Nairobi.`;

  return {
    ...scene,
    kind: "map_story",
    eyebrow: "GEOGRAPHIC CONTEXT",
    headline: map.title,
    body: insight,
    narration: `Now place the measurements on the city. ${insight}`,
    chart: undefined,
    map,
    sourceLabel: datasetSourceLabel(dataset),
    sourceExcerpt: insight,
    visualPlan: {
      kind: "map_story",
      reason: "Explicit coordinates make geography part of the evidence, not decoration.",
      evidenceIds: scene.factIds || [],
      confidence: 99,
    },
    autoVisual: true,
  };
}

function findSceneIndex(
  scenes: StudioScene[],
  matcher: (scene: StudioScene, index: number) => boolean
) {
  return scenes.findIndex(matcher);
}

function improveDataStoryDirector(
  project: EpisodeProject,
  datasets: DatasetAnalysis[]
) {
  if (!datasets.length || !project.scenes.length) return project;

  const directed = chooseDirectedDatasets(datasets);
  const scenes = [...project.scenes];

  const triggerIndex = findSceneIndex(
    scenes,
    (scene, index) =>
      index >= 1 &&
      (hasAny(scene.eyebrow, ["trigger"]) ||
        hasAny(scene.headline, [
          "start with the rain",
          "rain — but do not stop there",
          "rain - but do not stop there",
        ]))
  );

  let comparisonIndex = findSceneIndex(
    scenes,
    (scene, index) =>
      index !== triggerIndex &&
      (hasAny(scene.eyebrow, ["data story"]) ||
        scene.kind === "data_chart" ||
        scene.visualPlan?.kind === "data_chart")
  );

  if (comparisonIndex < 0 && triggerIndex >= 0 && triggerIndex + 1 < scenes.length) {
    comparisonIndex = triggerIndex + 1;
  }

  const mapIndex = findSceneIndex(
    scenes,
    (scene) =>
      scene.kind === "map_story" ||
      scene.visualPlan?.kind === "map_story" ||
      hasAny(scene.headline, ["geographic pattern", "geographic context"])
  );

  if (directed.temporal && triggerIndex >= 0) {
    scenes[triggerIndex] = makeDirectedChartScene(
      scenes[triggerIndex],
      directed.temporal,
      "trigger"
    );
  }

  if (directed.comparison && comparisonIndex >= 0) {
    scenes[comparisonIndex] = makeDirectedChartScene(
      scenes[comparisonIndex],
      directed.comparison,
      "comparison"
    );
  }

  if (directed.spatial && mapIndex >= 0) {
    scenes[mapIndex] = makeDirectedMapScene(
      scenes[mapIndex],
      directed.spatial
    );
  }

  return {
    ...project,
    scenes,
    datasets,
  };
}

function evidenceTokens(value?: string) {
  const stop = new Set([
    "the", "and", "for", "that", "with", "from", "this", "into", "what",
    "when", "where", "which", "while", "does", "how", "why", "are", "was",
    "were", "have", "has", "had", "not", "but", "can", "could", "would",
    "should", "their", "there", "than", "then", "they", "them", "its", "our",
  ]);

  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 4 && !stop.has(token));
}

function evidenceFitScore(scene: StudioScene, item: EvidenceItem) {
  const sceneWords = new Set(
    evidenceTokens(`${scene.eyebrow} ${scene.headline} ${scene.narration}`)
  );
  const evidenceWords = evidenceTokens(item.statement);

  let overlap = 0;
  evidenceWords.forEach((token) => {
    if (sceneWords.has(token)) overlap += 1;
  });

  let score = overlap * 18;
  if (item.kind === "observed") score += 35;
  if (item.kind === "limitation" && hasAny(scene.eyebrow, ["trust", "limit", "uncertainty"])) score += 90;
  if (item.kind === "limitation" && !hasAny(scene.eyebrow, ["trust", "limit", "uncertainty"])) score -= 25;
  if (item.sourceLabel || item.source) score += 20;

  if (hasAny(scene.headline, ["water", "drain", "infrastructure"]) && hasAny(item.statement, ["drain", "capacity", "culvert", "water", "flow"])) score += 45;
  if (hasAny(scene.headline, ["city changes", "urban form", "surface"]) && hasAny(item.statement, ["infiltration", "runoff", "built", "paving", "urban", "surface"])) score += 45;
  if (hasAny(scene.headline, ["maintained", "maintenance", "infrastructure"]) && hasAny(item.statement, ["maintenance", "solid waste", "blocked", "institution", "management"])) score += 45;

  return score;
}

function bestEvidenceForScene(
  scene: StudioScene,
  evidence: EvidenceItem[],
  used: Set<string>
) {
  return [...evidence]
    .filter((item) => !used.has(item.id) && cleanText(item.statement))
    .map((item) => ({ item, score: evidenceFitScore(scene, item) }))
    .sort((a, b) => b.score - a.score)[0];
}

function visualAssetRole(asset: EvidenceAsset) {
  const name = cleanText(`${asset.name} ${asset.sourceLabel || ""}`).toLowerCase();

  if (/(drain|culvert|gutter|channel|stormwater|sewer)/.test(name)) return "drainage";
  if (/(waste|garbage|trash|blocked|clogged|litter)/.test(name)) return "blockage";
  if (/(river|riparian|stream|waterway|bridge)/.test(name)) return "river";
  if (/(flood|flooded|waterlog|inundat|road)/.test(name)) return "flood-impact";
  if (/(map|location|ward|south c|nairobi)/.test(name)) return "place";
  if (/(building|pavement|urban|settlement|estate|roof|road)/.test(name)) return "urban-form";
  return "general-evidence";
}

function assetSceneScore(asset: EvidenceAsset, scene: StudioScene, index: number) {
  const role = visualAssetRole(asset);
  const sceneText = cleanText(`${scene.eyebrow} ${scene.headline} ${scene.body}`).toLowerCase();
  let score = 0;

  if (index === 0) score += 25;
  if (role === "drainage" && /(drain|water|flow|infrastructure|capacity)/.test(sceneText)) score += 120;
  if (role === "blockage" && /(maintain|waste|block|drain|infrastructure)/.test(sceneText)) score += 120;
  if (role === "river" && /(river|water|flow|geograph|place)/.test(sceneText)) score += 100;
  if (role === "flood-impact" && /(flood|disaster|outcome|trigger|world explained)/.test(sceneText)) score += 120;
  if (role === "urban-form" && /(city changes|urban form|surface|infiltration|runoff)/.test(sceneText)) score += 120;
  if (role === "place" && /(geograph|trust boundary|south c|location)/.test(sceneText)) score += 70;
  if (role === "general-evidence" && index === 0) score += 55;

  if (scene.chart || scene.map) score -= 100;
  return score;
}

function improveVisualAssetDirector(project: EpisodeProject) {
  if (!project.assets?.length) return project;

  const scenes = [...project.scenes];
  const usedAssets = new Set<string>();

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (scene.assetId || scene.chart || scene.map) continue;

    const candidate = project.assets
      .filter((asset) => !usedAssets.has(asset.id))
      .map((asset) => ({ asset, score: assetSceneScore(asset, scene, index) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!candidate || candidate.score < 50) continue;

    usedAssets.add(candidate.asset.id);
    scenes[index] = {
      ...scene,
      assetId: candidate.asset.id,
      ...( {
        assetUrl: candidate.asset.dataUrl,
        assetCaption: candidate.asset.sourceLabel || candidate.asset.name,
      } as any),
      visualPlan:
        scene.visualPlan?.kind === "source_highlight" ||
        scene.visualPlan?.kind === "field_evidence"
          ? scene.visualPlan
          : {
              kind: "field_evidence",
              reason: `Uploaded visual evidence classified as ${visualAssetRole(candidate.asset)} matches this scene's visual job.`,
              evidenceIds: scene.factIds || [],
              confidence: Math.min(99, Math.max(82, candidate.score)),
            },
      visualLabels: Array.from(
        new Set([
          ...(scene.visualLabels || []),
          "source-visible",
          visualAssetRole(candidate.asset),
        ])
      ),
    };
  }

  return { ...project, scenes };
}

function improveEvidenceDensity(project: EpisodeProject) {
  const scenes = [...project.scenes];
  const usedEvidence = new Set<string>();

  scenes.forEach((scene) => {
    (scene.factIds || []).forEach((id) => usedEvidence.add(id));
  });

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];

    if (scene.chart || scene.map) continue;
    if ((scene.factIds || []).length > 0 && scene.sourceLabel && scene.sourceExcerpt) continue;

    const candidate = bestEvidenceForScene(scene, project.evidence || [], usedEvidence);
    if (!candidate || candidate.score < 35) continue;

    usedEvidence.add(candidate.item.id);
    const item = candidate.item;

    scenes[index] = {
      ...scene,
      factIds: Array.from(new Set([...(scene.factIds || []), item.id])),
      sourceLabel: scene.sourceLabel || item.sourceLabel || item.source || "Source evidence",
      sourceExcerpt: scene.sourceExcerpt || cleanText(item.statement),
      body: cleanText(scene.body) || cleanText(item.statement),
      visualPlan:
        scene.visualPlan?.kind === "minimal"
          ? {
              kind: "source_highlight",
              reason: "A source-backed evidence item matches this scene, so the proof should be made visible rather than left abstract.",
              evidenceIds: Array.from(new Set([...(scene.factIds || []), item.id])),
              confidence: 91,
            }
          : scene.visualPlan,
    };
  }

  return { ...project, scenes };
}

function updateVisualIntelligenceScore(project: EpisodeProject) {
  const scenes = project.scenes || [];
  const backed = scenes.filter((scene: any) =>
    Boolean(
      scene.chart ||
      scene.map ||
      scene.assetId ||
      (scene.factIds || []).length ||
      cleanText(scene.sourceExcerpt)
    )
  );

  const evidenceDensity = Math.round(
    (backed.length / Math.max(1, scenes.length)) * 100
  );

  const kinds = new Set(
    scenes.map((scene) => scene.visualPlan?.kind || scene.kind)
  );
  const visualVariation = Math.max(
    project.visualIntelligence?.visualVariation || 0,
    Math.min(100, Math.round((kinds.size / 6) * 100))
  );
  const geographicContext = scenes.some((scene) => Boolean(scene.map)) ? 100 : (project.visualIntelligence?.geographicContext || 28);
  const dataStorytelling = scenes.some((scene) => Boolean(scene.chart)) ? 100 : (project.visualIntelligence?.dataStorytelling || 24);
  const sourceVisibility = scenes.some((scene) => Boolean(scene.sourceLabel || scene.chart?.sourceLabel || scene.map?.sourceLabel)) ? 100 : (project.visualIntelligence?.sourceVisibility || 40);

  const warnings = [...(project.visualIntelligence?.warnings || [])].filter(
    (warning) =>
      !(evidenceDensity >= 70 && /explanation-only|visible proof density/i.test(warning)) &&
      !(geographicContext === 100 && /no mapped evidence/i.test(warning)) &&
      !(dataStorytelling === 100 && /no data-story scene/i.test(warning))
  );

  const overall = Math.round(
    evidenceDensity * 0.35 +
      visualVariation * 0.15 +
      geographicContext * 0.2 +
      dataStorytelling * 0.2 +
      sourceVisibility * 0.1
  );

  return {
    ...project,
    visualIntelligence: {
      overall,
      evidenceDensity,
      visualVariation,
      geographicContext,
      dataStorytelling,
      sourceVisibility,
      warnings,
    },
  };
}

function applyEditorialDirectors(
  project: EpisodeProject,
  datasets: DatasetAnalysis[]
) {
  const directed = improveDataStoryDirector(project, datasets);
  const withEvidence = improveEvidenceDensity(directed);
  const withVisualAssets = improveVisualAssetDirector(withEvidence);
  return updateVisualIntelligenceScore(withVisualAssets);
}

export default function StudioPage() {
  const [project, setProject] = useState<EpisodeProject>(initial);
  const [mode, setMode] = useState<StoryMode>("world_explained");
  const [topic, setTopic] = useState("Why African cities flood");
  const [question, setQuestion] = useState(
    "Why do some African cities flood even when rainfall alone does not explain the damage?"
  );
  const [brief, setBrief] = useState(
    "Explain the interaction between rainfall, drainage, land cover, waste, settlement patterns and governance using visible evidence rather than generic narration."
  );
  const [audience, setAudience] = useState(
    "Curious general viewers who want evidence-led explanations of Africa and the wider world."
  );
  const [minutes, setMinutes] = useState(7);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetAnalysis[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("build");
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [manualScriptEdits, setManualScriptEdits] = useState(false);
  const [visualRerunBusy, setVisualRerunBusy] = useState(false);
  const [visualRerunMessage, setVisualRerunMessage] = useState("");
  const workspaceHydrated = useRef(false);
  const [workspaceSavedAt, setWorkspaceSavedAt] = useState("");
  const [visualAssetStatus, setVisualAssetStatus] = useState("");
  const [visualAssetsRestored, setVisualAssetsRestored] = useState(false);

  const [sourceKind, setSourceKind] = useState<"research" | "report" | "text">("research");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [hpsInput, setHpsInput] = useState("");
  const [hpsUrl, setHpsUrl] = useState("");
  const [hpsBusy, setHpsBusy] = useState(false);
  const [hpsError, setHpsError] = useState("");

  const [scout, setScout] = useState<EvidenceScoutResponse | null>(null);
  const [scoutBusy, setScoutBusy] = useState(false);
  const [scoutError, setScoutError] = useState("");
  const [scoutQuery, setScoutQuery] = useState("");
  const [lockerAdded, setLockerAdded] = useState<string[]>([]);

  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState("eleven_multilingual_v2");
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [narrationError, setNarrationError] = useState("");
  const [renderBusy, setRenderBusy] = useState<"video" | "short" | "thumbnail" | null>(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);

      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedWorkspace>;

        if (saved.mode) setMode(saved.mode);
        if (typeof saved.topic === "string") setTopic(saved.topic);
        if (typeof saved.question === "string") setQuestion(saved.question);
        if (typeof saved.brief === "string") setBrief(saved.brief);
        if (typeof saved.audience === "string") setAudience(saved.audience);

        if (
          typeof saved.minutes === "number" &&
          Number.isFinite(saved.minutes)
        ) {
          setMinutes(saved.minutes);
        }

        if (Array.isArray(saved.evidence)) {
          setEvidence(saved.evidence);
        }

        if (Array.isArray(saved.datasets)) {
          setDatasets(
            saved.datasets.map(upgradeLegacyDatasetAnalysis)
          );
        }

        if (saved.activeTab && isValidTab(saved.activeTab)) {
          setActiveTab(saved.activeTab);
        }

        if (
          saved.sourceKind === "research" ||
          saved.sourceKind === "report" ||
          saved.sourceKind === "text"
        ) {
          setSourceKind(saved.sourceKind);
        }

        if (typeof saved.scoutQuery === "string") {
          setScoutQuery(saved.scoutQuery);
        }

        if (typeof saved.voiceId === "string") {
          setVoiceId(saved.voiceId);
        }

        if (
          typeof saved.modelId === "string" &&
          saved.modelId.trim()
        ) {
          setModelId(saved.modelId);
        }

        if (typeof saved.manualScriptEdits === "boolean") {
          setManualScriptEdits(saved.manualScriptEdits);
        }

        if (
          saved.project?.episode &&
          Array.isArray(saved.project.scenes)
        ) {
          setProject(saved.project);
        }
      }
    } catch (error) {
      console.warn(
        "Unable to restore Evidence Studio workspace:",
        error
      );
    } finally {
      workspaceHydrated.current = true;
    }
  }, []);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const records = await listEvidenceLibrary();
        const restored = records
          .map((record) => record.visualAsset)
          .filter((asset): asset is EvidenceAsset => Boolean(asset?.dataUrl));

        if (!live) return;

        if (restored.length) {
          setProject((current) => {
            const byId = new Map<string, EvidenceAsset>();

            (current.assets || []).forEach((asset) =>
              byId.set(asset.id, asset)
            );
            restored.forEach((asset) =>
              byId.set(asset.id, asset)
            );

            return {
              ...current,
              assets: [...byId.values()],
            };
          });

          setVisualAssetStatus(
            `Restored ${restored.length} persistent visual evidence asset${restored.length === 1 ? "" : "s"} after reload.`
          );
        }

        setVisualAssetsRestored(true);
      } catch (error) {
        console.warn(
          "Unable to restore persistent visual evidence:",
          error
        );
        if (live) {
          setVisualAssetStatus(
            "Visual evidence could not be restored from browser storage."
          );
          setVisualAssetsRestored(true);
        }
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceHydrated.current) return;

    const timer = window.setTimeout(() => {
      try {
        const payload: PersistedWorkspace = {
          mode,
          topic,
          question,
          brief,
          audience,
          minutes,
          evidence,
          datasets,
          activeTab,
          sourceKind,
          scoutQuery,
          voiceId,
          modelId,
          manualScriptEdits,
          project: projectForWorkspaceStorage(project),
        };

        window.localStorage.setItem(
          WORKSPACE_STORAGE_KEY,
          JSON.stringify(payload)
        );

        setWorkspaceSavedAt(
          new Date().toLocaleTimeString()
        );
      } catch (error) {
        console.warn(
          "Unable to persist Evidence Studio workspace:",
          error
        );
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    mode,
    topic,
    question,
    brief,
    audience,
    minutes,
    evidence,
    datasets,
    activeTab,
    sourceKind,
    scoutQuery,
    voiceId,
    modelId,
    manualScriptEdits,
    project,
  ]);

  const pack = useMemo(() => getStoryPack(mode), [mode]);
  const durationInFrames = useMemo(
    () =>
      Math.max(
        30,
        Math.round(project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) * 30)
      ),
    [project]
  );

  function buildFrom(
    nextEvidence: EvidenceItem[] = evidence,
    nextDatasets: DatasetAnalysis[] = datasets,
    overrides?: Partial<{
      mode: StoryMode;
      topic: string;
      question: string;
      brief: string;
    }>
  ) {
    const nextMode = overrides?.mode ?? mode;
    const base = buildStoryEpisode({
      mode: nextMode,
      channelName: nextMode === "hps" ? "Proof of Origin" : "Evidence Studio",
      byline:
        nextMode === "hps"
          ? "by Human Provenance Standard"
          : "The world explained through evidence",
      topic: overrides?.topic ?? topic,
      question: overrides?.question ?? question,
      experiment: overrides?.brief ?? brief,
      audience,
      targetMinutes: minutes,
      evidence: nextEvidence,
    });

    base.assets = project.assets;
    if (nextMode === "hps") base.hpsIngestion = project.hpsIngestion;
    const enriched = applyEditorialDirectors(
      applyVisualIntelligence(base, nextDatasets),
      nextDatasets
    );
    setProject(enriched);
    setMode(nextMode);
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
        sourceType: "other",
      },
    ]);
  }

  function updateEvidence(id: string, patch: Partial<EvidenceItem>) {
    setEvidence((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeEvidence(id: string) {
    setEvidence((items) => items.filter((item) => item.id !== id));
  }

  function updateScene(
    sceneId: string,
    field: "eyebrow" | "headline" | "body" | "narration" | "retentionPurpose",
    value: string
  ) {
    setProject((current) => {
      const next = { ...current };
      delete next.narration;
      next.scenes = next.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, [field]: value } : scene
      );
      return next;
    });
    setManualScriptEdits(true);
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;

    const selected = Array.from(files);
    const uploaded = await Promise.all(
      selected.map(async (file) => {
        const asset = await readImage(file);
        const now = new Date().toISOString();

        await saveEvidenceLibraryRecord({
          id: asset.id,
          createdAt: now,
          updatedAt: now,
          title: file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[_-]+/g, " "),
          sourceType: "field",
          status: "ingested",
          origin: "upload",
          tags: ["local", "visual-evidence", "image", "story-upload"],
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          byteLength: file.size,
          extractedText: "",
          summary:
            "Visual evidence uploaded in Story & Video and stored persistently in this browser.",
          evidence: [],
          visualAsset: asset,
          fileBlob: file,
        });

        return asset;
      })
    );

    setProject((current) => {
      const byId = new Map<string, EvidenceAsset>();
      (current.assets || []).forEach((asset) =>
        byId.set(asset.id, asset)
      );
      uploaded.forEach((asset) =>
        byId.set(asset.id, asset)
      );

      const merged = {
        ...current,
        assets: [...byId.values()],
      };

      return applyEditorialDirectors(merged, datasets);
    });

    setVisualAssetStatus(
      `✓ ${uploaded.length} visual evidence asset${uploaded.length === 1 ? "" : "s"} uploaded and stored persistently.`
    );
  }

  async function runEvidenceScout(options?: {
    nextEvidence?: EvidenceItem[];
    nextDatasets?: DatasetAnalysis[];
    nextTopic?: string;
    nextQuestion?: string;
    nextSearchQuery?: string;
    autoOpen?: boolean;
  }) {
    setScoutBusy(true);
    setScoutError("");
    try {
      const explicitSearchQuery = options?.nextSearchQuery !== undefined
        ? options.nextSearchQuery
        : scoutQuery.trim();
      const payload = {
        topic: options?.nextTopic ?? topic,
        question: options?.nextQuestion ?? question,
        searchQuery: explicitSearchQuery || undefined,
        evidence: options?.nextEvidence ?? evidence,
        datasets: options?.nextDatasets ?? datasets,
        maxSources: 18,
      };
      const response = await fetch("/api/evidence-scout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evidence Scout failed.");
      const result = data as EvidenceScoutResponse;
      setScout(result);
      if (options?.nextSearchQuery !== undefined || !scoutQuery.trim()) setScoutQuery(result.query);
      if (options?.autoOpen) setActiveTab("discover");
      return result;
    } catch (error: any) {
      setScoutError(error?.message || "Evidence Scout failed.");
      if (options?.autoOpen) setActiveTab("discover");
      return null;
    } finally {
      setScoutBusy(false);
    }
  }

  function useDiscoveredQuestion(candidate: StoryQuestionCandidate, rebuild = false) {
    setQuestion(candidate.question);
    if (rebuild) {
      buildFrom(evidence, datasets, { question: candidate.question });
    } else {
      setActiveTab("build");
    }
  }

  function addScoutSource(source: EvidenceScoutSource) {
    if (lockerAdded.includes(source.id)) return;
    const item = scoutSourceToEvidence(source);
    setEvidence((items) => [...items, item]);
    setLockerAdded((items) => [...items, source.id]);
  }

  function integrateIntelligence(newEvidence: EvidenceItem[], newDatasets: DatasetAnalysis[]) {
    setEvidence((current) => {
      const seen = new Set<string>();
      return [...current, ...newEvidence].filter((item) => {
        const key = `${item.kind}|${item.statement}`.toLowerCase().replace(/\s+/g, " ").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    setDatasets((current) => {
      const byName = new Map<string, DatasetAnalysis>();
      [...current, ...newDatasets].forEach((item) => byName.set(item.name, item));
      return [...byName.values()];
    });
  }


  function integrateVisualAssets(newAssets: EvidenceAsset[]) {
    if (!newAssets.length) return;

    setVisualAssetStatus(
      `✓ ${newAssets.length} visual evidence asset${newAssets.length === 1 ? "" : "s"} added to the project and available to Story & Video.`
    );

    setProject((current) => {
      const byId = new Map<string, EvidenceAsset>();
      (current.assets || []).forEach((asset) =>
        byId.set(asset.id, asset)
      );
      newAssets.forEach((asset) =>
        byId.set(asset.id, asset)
      );

      const merged = {
        ...current,
        assets: [...byId.values()],
      };

      return applyEditorialDirectors(merged, datasets);
    });
  }

  function purgeEvidenceSources(sources: string[]) {
    if (!sources.length) return;

    const sourceSet = new Set(sources);

    setEvidence((current) =>
      current.filter(
        (item) =>
          !item.source ||
          !sourceSet.has(item.source)
      )
    );

    setProject((current) => {
      const removedIds = new Set(
        (current.evidence || [])
          .filter(
            (item) =>
              item.source &&
              sourceSet.has(item.source)
          )
          .map((item) => item.id)
      );

      return {
        ...current,
        evidence: (current.evidence || []).filter(
          (item) =>
            !item.source ||
            !sourceSet.has(item.source)
        ),
        scenes: current.scenes.map((scene) => ({
          ...scene,
          factIds: (scene.factIds || []).filter(
            (id) => !removedIds.has(id)
          ),
        })),
      };
    });
  }

  function useIntelligenceAngle(angle: StoryHunterAngle, rebuild: boolean) {
    setQuestion(angle.question);
    if (!rebuild) {
      setActiveTab("build");
      return;
    }

    const base = buildStoryEpisode({
      mode,
      channelName: mode === "hps" ? "Proof of Origin" : "Evidence Studio",
      byline: mode === "hps" ? "by Human Provenance Standard" : "The world explained through evidence",
      topic,
      question: angle.question,
      experiment: brief,
      audience,
      targetMinutes: minutes,
      evidence,
    });
    base.assets = project.assets;
    if (mode === "hps") base.hpsIngestion = project.hpsIngestion;
    base.episode.workingTitle = angle.title;
    base.titles = [angle.title, ...base.titles.filter((title) => title !== angle.title)].slice(0, 5);
    if (base.scenes[0]) {
      base.scenes[0] = {
        ...base.scenes[0],
        headline: angle.question,
        narration: `${angle.hook} ${base.scenes[0].narration}`,
        retentionPurpose: `Story Hunter opening · ${angle.angle} · score ${angle.overall}/100`,
      };
    }
    setProject(
      applyEditorialDirectors(
        applyVisualIntelligence(base, datasets),
        datasets
      )
    );
    setManualScriptEdits(false);
    setEditingSceneId(null);
    setActiveTab("story");
  }

  function rerunVisualReasoning() {
    if (visualRerunBusy) return;

    setVisualRerunBusy(true);
    setVisualRerunMessage("");

    requestAnimationFrame(() => {
      try {
        setProject((current) =>
          applyEditorialDirectors(
            applyVisualIntelligence(current, datasets),
            datasets
          )
        );
        setVisualRerunMessage(
          `Visual reasoning refreshed at ${new Date().toLocaleTimeString()}.`
        );
      } catch (error) {
        console.error("Visual reasoning rerun failed:", error);
        setVisualRerunMessage(
          "Visual reasoning could not be refreshed. Check the browser console for details."
        );
      } finally {
        setVisualRerunBusy(false);
      }
    });
  }

  async function ingestDocument(file: File | undefined) {
    if (!file) return;
    setDocumentBusy(true);
    setDocumentError("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", sourceKind);

      const response = await fetch("/api/document-ingest", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to ingest source.");
      }

      const parsed = data.result as DocumentIngestion;
      const merged = [...evidence, ...parsed.evidence];

      /*
       * STORY CONTEXT POLICY
       *
       * If the user is already building a World Explained / Investigation /
       * Explainer / Case Study story, the uploaded document is evidence for
       * that story. It must not silently replace the user's topic, big
       * question or systems brief.
       *
       * Research/report mode may still be inferred when the source itself is
       * the story and the user has not chosen a broader story mode.
       */
      const preserveStoryContext =
        mode === "world_explained" ||
        mode === "investigation" ||
        mode === "explainer" ||
        mode === "case_study";

      const nextMode: StoryMode = preserveStoryContext
        ? mode
        : sourceKind === "research"
          ? "research"
          : sourceKind === "report"
            ? "report"
            : mode;

      const nextTopic = preserveStoryContext
        ? topic
        : parsed.suggestedTopic;

      const nextQuestion = preserveStoryContext
        ? question
        : parsed.suggestedQuestion;

      const nextBrief = preserveStoryContext
        ? brief
        : parsed.suggestedBrief;

      setMode(nextMode);
      setEvidence(merged);

      if (!preserveStoryContext) {
        setTopic(nextTopic);
        setQuestion(nextQuestion);
        setBrief(nextBrief);
      }

      const base = buildStoryEpisode({
        mode: nextMode,
        channelName: "Evidence Studio",
        byline: "The world explained through evidence",
        topic: nextTopic,
        question: nextQuestion,
        experiment: nextBrief,
        audience,
        targetMinutes: minutes,
        evidence: merged,
      });

      base.assets = project.assets;
      base.documentIngestion = parsed;

      setProject(
      applyEditorialDirectors(
        applyVisualIntelligence(base, datasets),
        datasets
      )
    );

      /*
       * Reset only the scout's manual search query. Do NOT reset the user's
       * Story-tab topic/question/brief.
       */
      setScoutQuery("");

      await runEvidenceScout({
        nextEvidence: merged,
        nextDatasets: datasets,
        nextTopic,
        nextQuestion,
        nextSearchQuery: "",
        autoOpen: true,
      });
    } catch (error: any) {
      setDocumentError(
        error?.message || "Document ingestion failed."
      );
    } finally {
      setDocumentBusy(false);
    }
  }

  async function ingestCsv(file: File | undefined) {
    if (!file) return;
    const analysis = analyzeCsv(await file.text(), file.name);
    const nextDatasets = [...datasets.filter((item) => item.name !== analysis.name), analysis];
    const datasetEvidence: EvidenceItem | null = analysis.insight
      ? {
          id: crypto.randomUUID(),
          kind: "observed",
          statement: analysis.insight,
          source: file.name,
          sourceLabel: file.name,
          sourceType: "dataset",
        }
      : null;
    const nextEvidence = datasetEvidence ? [...evidence, datasetEvidence] : evidence;
    setDatasets(nextDatasets);
    setEvidence(nextEvidence);
    buildFrom(nextEvidence, nextDatasets);
    setScoutQuery("");
    await runEvidenceScout({
      nextEvidence,
      nextDatasets,
      nextSearchQuery: "",
      autoOpen: true,
    });
  }

  async function ingestHps() {
    setHpsBusy(true);
    setHpsError("");
    try {
      const input = hpsUrl.trim() || hpsInput.trim();
      if (!input) throw new Error("Paste an HPS result, record ID or public HPS URL.");
      const response = await fetch("/api/hps-ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to ingest HPS evidence.");
      const parsed = data.result;
      setMode("hps");
      setTopic(parsed.suggestedTopic);
      setQuestion(parsed.suggestedQuestion);
      setBrief(parsed.suggestedExperiment);
      setEvidence(parsed.evidence);

      const next = buildStoryEpisode({
        mode: "hps",
        channelName: "Proof of Origin",
        byline: "by Human Provenance Standard",
        topic: parsed.suggestedTopic,
        question: parsed.suggestedQuestion,
        experiment: parsed.suggestedExperiment,
        audience,
        targetMinutes: minutes,
        evidence: parsed.evidence,
      });
      next.assets = project.assets;
      next.hpsIngestion = parsed.ingestion;
      setProject(
        applyEditorialDirectors(
          applyVisualIntelligence(next, datasets),
          datasets
        )
      );
      setActiveTab("story");
    } catch (error: any) {
      setHpsError(error?.message || "Unable to ingest HPS evidence.");
    } finally {
      setHpsBusy(false);
    }
  }

  async function buildEstimatedNarration() {
    setNarrationBusy(true);
    setNarrationError("");
    try {
      const approvedProject = applyNarrationDirector(project, datasets);
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: approvedProject, provider: "estimate", wordsPerMinute: 155 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to build timing.");
      setProject(syncSceneDurationsToNarration(approvedProject, data.track));
      setManualScriptEdits(false);
    } catch (error: any) {
      setNarrationError(error?.message || "Unable to build narration timing.");
    } finally {
      setNarrationBusy(false);
    }
  }

  async function generatePremiumNarration() {
    setNarrationBusy(true);
    setNarrationError("");
    try {
      const approvedProject = applyNarrationDirector(project, datasets);
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: approvedProject,
          provider: "elevenlabs",
          voiceId: voiceId.trim() || undefined,
          modelId: modelId.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Narration generation failed.");
      setProject(syncSceneDurationsToNarration(approvedProject, data.track));
      setManualScriptEdits(false);
    } catch (error: any) {
      setNarrationError(error?.message || "Unable to generate narration.");
    } finally {
      setNarrationBusy(false);
    }
  }

  async function render(kind: "video" | "short" | "thumbnail") {
    setRenderBusy(kind);
    setRenderError("");
    try {
      if (kind === "video") {
        await postForDownload("/api/render/video", project, `evidence-studio-${project.id}.mp4`);
      } else if (kind === "short") {
        await postForDownload(
          "/api/render/short",
          { project, shortIndex: 0 },
          `evidence-studio-${project.id}-short-1.mp4`
        );
      } else {
        await postForDownload(
          "/api/render/thumbnail",
          { project, thumbnailIndex: 0 },
          `evidence-studio-${project.id}-thumbnail-1.png`
        );
      }
    } catch (error: any) {
      setRenderError(error?.message || "Render failed.");
    } finally {
      setRenderBusy(null);
    }
  }

  const tabs: [Tab, string, string][] = [
    ["build", "01", "Story"],
    ["sources", "02", "Evidence"],
    ["discover", "03", "Discover"],
    ["intelligence", "04", "Intelligence"],
    ["story", "05", "Story & Video"],
    ["visual", "06", "Visual Intelligence"],
    ["narration", "07", "Narration"],
    ["retention", "08", "Retention"],
    ["publish", "09", "Publish"],
  ];

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brandLockup">
          <div className="brandIcon"><Globe2 size={20} /></div>
          <div>
            <strong>Evidence Studio</strong>
            <span>The world explained through evidence</span>
          </div>
        </div>
        <div className="topActions">
          <span className="truthBadge"><BadgeCheck size={15} /> Show your work</span>
          {workspaceSavedAt && (
            <span
              className="truthBadge"
              title="Story settings and workspace state are saved in this browser."
            >
              <Save size={14} /> Saved {workspaceSavedAt}
            </span>
          )}
          <button
            className="button ghost"
            onClick={() => downloadText(`${project.id}.json`, JSON.stringify(project, null, 2), "application/json")}
          >
            <Download size={16} /> Export project
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">VISUAL INTELLIGENCE STUDIO</p>
          <h1>Turn evidence into stories people can see, understand and verify.</h1>
          <p className="lede">
            Research papers, reports, datasets, maps, field evidence and provenance records →
            story architecture → visual reasoning → narration → cinematic video.
          </p>
        </div>
        <div className="heroMetric">
          <span>EDITORIAL STANDARD</span>
          <strong>Evidence before aesthetics</strong>
          <p>Observed ≠ inferred. Sources stay visible. Limitations stay in the final story.</p>
        </div>
      </section>

      <nav className="tabs">
        {tabs.map(([key, number, label]) => (
          <button
            key={key}
            className={activeTab === key ? "tab active" : "tab"}
            onClick={() => setActiveTab(key)}
          >
            <span>{number}</span>{label}
          </button>
        ))}
      </nav>

      {activeTab === "build" && (
        <section className="workspace twoCol">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">STORY MODE</p>
                <h2>Choose how the evidence should become a story.</h2>
              </div>
              <Globe2 />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginBottom: 22 }}>
              {STORY_PACKS.map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? "button primary" : "button"}
                  onClick={() => {
                    setMode(item.id);
                    const next = getStoryPack(item.id);
                    if (!question.trim()) setQuestion(next.questionPlaceholder);
                    if (!brief.trim()) setBrief(next.briefPlaceholder);
                  }}
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  {item.id === "world_explained" ? <Globe2 size={16} /> : item.id === "hps" ? <ShieldCheck size={16} /> : <FileSearch size={16} />}
                  {item.label}
                </button>
              ))}
            </div>

            <Notice><strong>{pack.label}:</strong> {pack.description}</Notice>

            <label>Topic<input value={topic} onChange={(e: any) => setTopic(e.target.value)} /></label>
            <label>Big question<textarea rows={3} value={question} onChange={(e: any) => setQuestion(e.target.value)} placeholder={pack.questionPlaceholder} /></label>
            <label>{pack.briefLabel}<textarea rows={5} value={brief} onChange={(e: any) => setBrief(e.target.value)} placeholder={pack.briefPlaceholder} /></label>
            <div className="fieldGrid">
              <label>Target minutes<input type="number" min={1} max={20} step={0.5} value={minutes} onChange={(e: any) => setMinutes(Number(e.target.value))} /></label>
              <label>Audience<input value={audience} onChange={(e: any) => setAudience(e.target.value)} /></label>
            </div>
            <button className="button primary large" onClick={() => buildFrom()}>
              <WandSparkles size={18} /> Build evidence-led episode
            </button>
            <button className="button large" onClick={() => setActiveTab("discover")} style={{ marginTop: 10 }}>
              <Search size={18} /> Discover stronger questions & sources
            </button>
          </div>

          <div className="panel">
            <p className="micro">PREMIUM STORY PRINCIPLE</p>
            <h2>Every section should earn its place visually.</h2>
            <div className="automationSteps">
              {[
                ["01", "Question", "Start with a consequential question, not a generic topic."],
                ["02", "Evidence", "Attach sources, measurements, field observations and limitations."],
                ["03", "Visual reasoning", "Choose map, chart, source highlight, comparison or systems diagram."],
                ["04", "Narration", "Write around the evidence instead of asking visuals to decorate a script."],
                ["05", "Trust", "Keep inference and uncertainty visibly separate from observation."],
                ["06", "Payoff", "Answer the question clearly before the CTA."],
              ].map(([n, title, body]) => (
                <article key={n}><span>{n}</span><div><strong>{title}</strong><p>{body}</p></div></article>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "sources" && (
        <section className="workspace twoCol">
          <div
            className="panel"
            style={{
              background:
                "linear-gradient(180deg, rgba(85,216,255,.035), transparent 28%), linear-gradient(180deg, rgba(255,255,255,.018), transparent 80%), var(--panel)",
              borderColor: "rgba(85,216,255,.12)",
            }}
          >
            <div className="panelHead" style={{ marginBottom: 14 }}>
              <div>
                <p className="micro">SOURCE INGESTION</p>
                <h2 style={{ fontSize: 30, letterSpacing: "-.04em" }}>Bring the real evidence in.</h2>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--cyan)",
                  border: "1px solid rgba(85,216,255,.16)",
                  background: "rgba(85,216,255,.055)",
                }}
              >
                <FileSearch size={20} />
              </div>
            </div>

            <p
              style={{
                color: "var(--muted)",
                fontSize: 13,
                lineHeight: 1.7,
                maxWidth: 680,
                margin: "0 0 26px",
              }}
            >
              Upload the material your story must answer to. Evidence Studio will extract
              claims, numbers, locations, contradictions and sourceable evidence before
              anything becomes narration.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "end",
                gap: 18,
                marginBottom: 12,
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    color: "rgba(246,248,255,.72)",
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: ".17em",
                  }}
                >
                  WHAT KIND OF SOURCE IS THIS?
                </p>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: "rgba(153,167,198,.68)",
                    fontSize: 11,
                  }}
                >
                  Choose how the Studio should read and interpret the file.
                </p>
              </div>
              <span
                style={{
                  color: "rgba(153,167,198,.52)",
                  fontSize: 9,
                  letterSpacing: ".14em",
                  fontWeight: 800,
                }}
              >
                SOURCE MODE
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                {
                  id: "research" as const,
                  label: "Research paper",
                  description: "Journal articles, working papers and academic research.",
                  icon: <BookOpen size={20} />,
                },
                {
                  id: "report" as const,
                  label: "Report",
                  description: "Government, NGO, UN, institutional and impact reports.",
                  icon: <FileSearch size={20} />,
                },
                {
                  id: "text" as const,
                  label: "Text / notes",
                  description: "Transcripts, briefs, notes and other written source material.",
                  icon: <FileText size={20} />,
                },
              ].map((item) => {
                const active = sourceKind === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSourceKind(item.id)}
                    style={{
                      position: "relative",
                      minHeight: 158,
                      padding: 17,
                      borderRadius: 18,
                      border: active
                        ? "1px solid rgba(85,216,255,.62)"
                        : "1px solid rgba(255,255,255,.085)",
                      background: active
                        ? "linear-gradient(145deg, rgba(85,216,255,.11), rgba(95,124,255,.055)), rgba(5,10,22,.52)"
                        : "linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.012)), rgba(5,10,22,.35)",
                      color: "var(--text)",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 13,
                      boxShadow: active
                        ? "inset 0 0 0 1px rgba(85,216,255,.06), 0 15px 44px rgba(0,0,0,.18), 0 0 30px rgba(85,216,255,.04)"
                        : "none",
                    }}
                  >
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 12,
                        color: "var(--cyan)",
                        background: "rgba(85,216,255,.075)",
                        border: "1px solid rgba(85,216,255,.15)",
                      }}
                    >
                      {item.icon}
                    </span>

                    <span style={{ display: "block" }}>
                      <strong
                        style={{
                          display: "block",
                          fontSize: 14,
                          letterSpacing: "-.01em",
                        }}
                      >
                        {item.label}
                      </strong>
                      <span
                        style={{
                          display: "block",
                          marginTop: 7,
                          color: "var(--muted)",
                          fontSize: 11,
                          lineHeight: 1.48,
                          fontWeight: 500,
                        }}
                      >
                        {item.description}
                      </span>
                    </span>

                    <span
                      style={{
                        marginTop: "auto",
                        color: active ? "var(--cyan)" : "rgba(153,167,198,.56)",
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: ".16em",
                      }}
                    >
                      {active ? "SELECTED" : "SELECT"}
                    </span>
                  </button>
                );
              })}
            </div>

            <label
              style={{
                position: "relative",
                minHeight: 190,
                marginTop: 0,
                display: "grid",
                gridTemplateColumns: "58px 1fr auto",
                alignItems: "center",
                gap: 18,
                padding: 28,
                border: documentBusy
                  ? "1px solid rgba(85,216,255,.5)"
                  : "1px dashed rgba(85,216,255,.34)",
                borderRadius: 22,
                color: "var(--text)",
                background:
                  "radial-gradient(circle at 12% 50%, rgba(85,216,255,.08), transparent 27%), linear-gradient(145deg, rgba(95,124,255,.04), rgba(255,255,255,.018))",
                cursor: documentBusy ? "progress" : "pointer",
              }}
            >
              <span
                style={{
                  width: 56,
                  height: 56,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 17,
                  color: "var(--cyan)",
                  background:
                    "linear-gradient(145deg, rgba(85,216,255,.13), rgba(95,124,255,.08))",
                  border: "1px solid rgba(85,216,255,.2)",
                }}
              >
                {documentBusy ? <LoaderCircle size={28} /> : <FileText size={28} />}
              </span>

              <span style={{ display: "block" }}>
                <strong
                  style={{
                    display: "block",
                    fontSize: 17,
                    letterSpacing: "-.015em",
                    color: "var(--text)",
                  }}
                >
                  {documentBusy ? "Reading and structuring evidence…" : "Drop your source here"}
                </strong>
                <span
                  style={{
                    display: "block",
                    marginTop: 7,
                    color: "var(--muted)",
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  {documentBusy
                    ? "Extracting claims, numbers, locations and limitations."
                    : "PDF, TXT or Markdown · click to browse"}
                </span>
              </span>

              <span
                style={{
                  padding: "9px 11px",
                  borderRadius: 999,
                  color: "var(--cyan)",
                  background: "rgba(85,216,255,.055)",
                  border: "1px solid rgba(85,216,255,.18)",
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: ".14em",
                }}
              >
                {documentBusy ? "INGESTING" : "CHOOSE FILE"}
              </span>

              <input
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf"
                hidden
                onChange={(e: any) => ingestDocument(e.target.files?.[0])}
              />
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "11px 4px 0",
                color: "rgba(153,167,198,.75)",
                fontSize: 10,
                lineHeight: 1.4,
              }}
            >
              <ShieldCheck size={14} style={{ color: "var(--green)", flexShrink: 0 }} />
              <span>The source becomes evidence. Unsupported claims are not invented.</span>
            </div>

            {documentError && <div className="studioError">{documentError}</div>}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 22,
              }}
            >
              <label
                style={{
                  marginTop: 0,
                  minHeight: 138,
                  padding: 18,
                  border: "1px solid rgba(255,255,255,.085)",
                  borderRadius: 18,
                  background:
                    "linear-gradient(145deg, rgba(255,255,255,.03), rgba(255,255,255,.012))",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 12,
                    color: "var(--cyan)",
                    background: "rgba(85,216,255,.065)",
                    border: "1px solid rgba(85,216,255,.12)",
                  }}
                >
                  <BarChart3 size={19} />
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: 14,
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                >
                  Structured dataset
                </strong>
                <span
                  style={{
                    display: "block",
                    marginTop: 6,
                    color: "var(--muted)",
                    fontSize: 11,
                    lineHeight: 1.45,
                    fontWeight: 500,
                  }}
                >
                  CSV · detect trends, comparisons and coordinates.
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e: any) => ingestCsv(e.target.files?.[0])}
                />
              </label>

              <label
                style={{
                  marginTop: 0,
                  minHeight: 138,
                  padding: 18,
                  border: "1px solid rgba(255,255,255,.085)",
                  borderRadius: 18,
                  background:
                    "linear-gradient(145deg, rgba(255,255,255,.03), rgba(255,255,255,.012))",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 12,
                    color: "var(--cyan)",
                    background: "rgba(85,216,255,.065)",
                    border: "1px solid rgba(85,216,255,.12)",
                  }}
                >
                  <ImagePlus size={19} />
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: 14,
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                >
                  Field & visual evidence
                </strong>
                <span
                  style={{
                    display: "block",
                    marginTop: 6,
                    color: "var(--muted)",
                    fontSize: 11,
                    lineHeight: 1.45,
                    fontWeight: 500,
                  }}
                >
                  Screenshots, maps, photographs and figures.
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e: any) => uploadImages(e.target.files)}
                />
              </label>
            </div>

            {mode === "hps" && (
              <div
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 18,
                  border: "1px solid rgba(99,230,167,.13)",
                  background: "rgba(99,230,167,.025)",
                }}
              >
                <p className="micro">HPS INGEST</p>
                <textarea
                  rows={8}
                  value={hpsInput}
                  onChange={(e: any) => setHpsInput(e.target.value)}
                  placeholder="Paste HPS verification result…"
                />
                <label>
                  Public HPS URL
                  <input value={hpsUrl} onChange={(e: any) => setHpsUrl(e.target.value)} />
                </label>
                {hpsError && <div className="studioError">{hpsError}</div>}
                <button className="button" onClick={ingestHps} disabled={hpsBusy}>
                  <ShieldCheck size={16} /> {hpsBusy ? "Reading HPS evidence…" : "Ingest HPS result"}
                </button>
              </div>
            )}
          </div>

          <div
            className="panel"
            style={{
              background:
                "linear-gradient(180deg, rgba(95,124,255,.025), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.018), transparent 80%), var(--panel)",
            }}
          >
            <div className="panelHead" style={{ marginBottom: 16 }}>
              <div>
                <p className="micro">EVIDENCE LEDGER</p>
                <h2 style={{ fontSize: 30, letterSpacing: "-.04em" }}>What do we actually know?</h2>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--cyan)",
                  border: "1px solid rgba(85,216,255,.16)",
                  background: "rgba(85,216,255,.055)",
                }}
              >
                <FileText size={20} />
              </div>
            </div>

            <p
              style={{
                color: "var(--muted)",
                fontSize: 13,
                lineHeight: 1.65,
                margin: "0 0 20px",
              }}
            >
              Keep observation, interpretation and uncertainty visibly separate. This ledger
              is the factual backbone the story engine is allowed to use.
            </p>

            <div
              className="evidenceActions"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                gap: 9,
                marginBottom: 16,
              }}
            >
              <button
                onClick={() => addEvidence("observed")}
                style={{
                  border: "1px solid rgba(99,230,167,.18)",
                  background: "rgba(99,230,167,.055)",
                }}
              >
                <Plus size={14} /> Observed
              </button>
              <button
                onClick={() => addEvidence("inference")}
                style={{
                  border: "1px solid rgba(95,124,255,.18)",
                  background: "rgba(95,124,255,.055)",
                }}
              >
                <Plus size={14} /> Inference
              </button>
              <button
                onClick={() => addEvidence("limitation")}
                style={{
                  border: "1px solid rgba(255,200,87,.18)",
                  background: "rgba(255,200,87,.05)",
                }}
              >
                <Plus size={14} /> Limitation
              </button>
            </div>

            <div className="evidenceList">
              {evidence.length === 0 && (
                <div
                  style={{
                    padding: 22,
                    borderRadius: 18,
                    border: "1px dashed rgba(255,255,255,.1)",
                    background: "rgba(255,255,255,.018)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text)",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    No evidence recorded yet.
                  </p>
                  <p
                    style={{
                      margin: "7px 0 0",
                      color: "var(--muted)",
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    Upload a source or add an observed fact, then explicitly separate
                    interpretation and limitations.
                  </p>
                </div>
              )}

              {evidence.map((item, index) => (
                <div
                  className="evidenceRow"
                  key={item.id}
                  style={{
                    alignItems: "start",
                    padding: 16,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,.075)",
                    background: "rgba(255,255,255,.018)",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: 9,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,.035)",
                      color: "rgba(153,167,198,.7)",
                      fontSize: 9,
                      fontWeight: 900,
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 9,
                      }}
                    >
                      <Chip kind={item.kind} />
                      <span
                        style={{
                          color: "rgba(153,167,198,.45)",
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: ".12em",
                        }}
                      >
                        EVIDENCE RECORD
                      </span>
                    </div>

                    <textarea
                      rows={3}
                      value={item.statement}
                      placeholder="State exactly what the evidence supports…"
                      onChange={(e: any) =>
                        updateEvidence(item.id, { statement: e.target.value })
                      }
                    />

                    <div className="fieldGrid">
                      <input
                        placeholder="Source / DOI / URL / report page"
                        value={item.source || ""}
                        onChange={(e: any) =>
                          updateEvidence(item.id, {
                            source: e.target.value,
                            sourceLabel: e.target.value,
                          })
                        }
                      />

                      <select
                        value={item.sourceType || "other"}
                        onChange={(e: any) =>
                          updateEvidence(item.id, {
                            sourceType: e.target.value as EvidenceSourceType,
                          })
                        }
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: "13px 14px",
                          color: "var(--text)",
                          colorScheme: "dark",
                          background: "rgba(255,255,255,.035)",
                          border: "1px solid rgba(255,255,255,.09)",
                          borderRadius: 13,
                          outline: "none",
                        }}
                      >
                        <option value="paper">paper</option>
                        <option value="report">report</option>
                        <option value="dataset">dataset</option>
                        <option value="field">field</option>
                        <option value="web">web</option>
                        <option value="interview">interview</option>
                        <option value="hps">hps</option>
                        <option value="other">other</option>
                      </select>
                    </div>
                  </div>

                  <button
                    className="button ghost"
                    onClick={() => removeEvidence(item.id)}
                    aria-label="Remove evidence"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 22,
                paddingTop: 18,
                borderTop: "1px solid rgba(255,255,255,.07)",
              }}
            >
              <button className="button primary large" onClick={() => buildFrom()}>
                <WandSparkles size={18} /> Rebuild from this evidence
              </button>

              <button
                className="button large"
                onClick={() => runEvidenceScout({ autoOpen: true })}
                disabled={scoutBusy}
                style={{ marginTop: 10 }}
              >
                <Search size={18} />
                {scoutBusy ? "Scouting evidence…" : "Discover questions & find more evidence"}
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "discover" && (
        <section className="workspace twoCol">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">QUESTION DISCOVERY</p>
                <h2>Find the strongest story hiding inside the evidence.</h2>
              </div>
              <Lightbulb />
            </div>

            <p className="muted">
              Evidence Studio scores candidate questions for evidence coverage, curiosity,
              consequence, visual potential and uncertainty. The ranking is editorial guidance,
              not a claim that the highest-scoring question is already proven.
            </p>

            <label>
              Evidence Scout search
              <input
                value={scoutQuery}
                onChange={(e: any) => setScoutQuery(e.target.value)}
                placeholder="Leave blank to derive search terms from the topic, question and evidence"
              />
            </label>

            {scoutError && <div className="studioError">{scoutError}</div>}

            <button
              className="button primary large"
              onClick={() => runEvidenceScout()}
              disabled={scoutBusy}
            >
              {scoutBusy ? <LoaderCircle size={18} /> : <Search size={18} />}
              {scoutBusy ? "Searching evidence sources…" : "Discover questions & scout evidence"}
            </button>

            {scout && (
              <button className="button large" onClick={() => setActiveTab("intelligence")} style={{ marginTop: 10 }}>
                <Database size={18} /> Open Evidence Intelligence Lab
              </button>
            )}

            {scout && (
              <>
                <div className="retentionMetrics" style={{ marginTop: 24 }}>
                  {[
                    ["Scholarly coverage", scout.coverage.scholarly],
                    ["Data coverage", scout.coverage.data],
                    ["Source diversity", scout.coverage.sourceDiversity],
                    ["Open downloads", scout.coverage.openAccess],
                  ].map(([label, value]) => (
                    <div className="metricBar" key={String(label)}>
                      <div><span>{label}</span><strong>{value}/100</strong></div>
                      <div className="metricTrack"><div className="metricFill" style={{ width: `${value}%` }} /></div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 28 }}>
                  <p className="micro">RANKED STORY QUESTIONS</p>
                  {scout.questions.map((candidate, index) => (
                    <article className="sceneCard" key={candidate.id}>
                      <div className="sceneIndex">{String(index + 1).padStart(2, "0")}</div>
                      <div style={{ width: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                          <div>
                            <p className="micro">{index === 0 ? "RECOMMENDED" : candidate.angle.replace("_", " ")}</p>
                            <h3>{candidate.question}</h3>
                          </div>
                          <strong>{candidate.overall}/100</strong>
                        </div>
                        <p>{candidate.rationale}</p>
                        <div className="sceneMeta">
                          <span>evidence {candidate.evidenceCoverage}</span>
                          <span>curiosity {candidate.curiosity}</span>
                          <span>visual {candidate.visualPotential}</span>
                          <span>uncertainty {candidate.uncertainty}</span>
                        </div>
                        <div className="exportRow" style={{ marginTop: 12 }}>
                          <button className="button" onClick={() => useDiscoveredQuestion(candidate, false)}>
                            <Pencil size={14} /> Use question
                          </button>
                          <button className="button primary" onClick={() => useDiscoveredQuestion(candidate, true)}>
                            <WandSparkles size={14} /> Use & build story
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="micro">EVIDENCE LOCKER</p>
                <h2>Sources the scout found — with access kept explicit.</h2>
              </div>
              <BookOpen />
            </div>

            {!scout && (
              <Notice>
                Run Evidence Scout to search scholarly metadata and World Bank Data360.
                Open files are linked for download; restricted or metadata-only sources stay links
                rather than being bypassed.
              </Notice>
            )}

            {scout?.providerErrors.map((error) => (
              <div className="studioError" key={error}>{error}</div>
            ))}

            {scout && scout.sources.length === 0 && (
              <Notice>No external sources were returned for this search. Refine the search terms or add more evidence.</Notice>
            )}

            {scout?.sources.map((source, index) => {
              const added = lockerAdded.includes(source.id);
              return (
                <article className="sceneCard" key={source.id}>
                  <div className="sceneIndex">{String(index + 1).padStart(2, "0")}</div>
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                      <div>
                        <p className="micro">
                          {source.provider === "world_bank" ? "WORLD BANK" : source.provider === "crossref" ? "CROSSREF" : "EXISTING"}
                          {" · "}{source.sourceType}
                        </p>
                        <h3>{source.title}</h3>
                      </div>
                      {source.access === "open_download" ? <CheckCircle2 size={20} /> : source.sourceType === "dataset" ? <Database size={20} /> : <BookOpen size={20} />}
                    </div>

                    <p className="muted">
                      {[source.authors?.slice(0, 3).join(", "), source.publisher, source.year].filter(Boolean).join(" · ")}
                    </p>
                    {source.summary && <p>{source.summary}</p>}
                    <div className="retentionPurpose"><strong>Why it surfaced:</strong> {source.reason}</div>
                    <div className="sceneMeta">
                      <span>relevance {source.relevance}</span>
                      <span>strength {source.evidenceStrength}</span>
                      <span>visual {source.visualPotential}</span>
                      <span>{source.access.replace("_", " ")}</span>
                    </div>

                    <div className="exportRow" style={{ marginTop: 12, flexWrap: "wrap" }}>
                      <button className="button" onClick={() => addScoutSource(source)} disabled={added}>
                        {added ? <CheckCircle2 size={14} /> : <Plus size={14} />}
                        {added ? "Added to ledger" : "Add source record"}
                      </button>
                      <a className="button" href={source.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} /> Open source
                      </a>
                      {source.downloadUrl && (
                        <a className="button primary" href={source.downloadUrl} target="_blank" rel="noreferrer" download>
                          <Download size={14} /> Download open evidence
                        </a>
                      )}
                    </div>
                    {source.license && <p className="muted" style={{ marginTop: 10 }}>Access/license signal: {source.license}</p>}
                    {source.doi && <p className="muted" style={{ marginTop: 6 }}>DOI: {source.doi}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "intelligence" && (
        <>
          <section className="workspace" style={{ paddingBottom: 0 }}>
            <div className="panel">
              <div className="panelHead">
                <div>
                  <p className="micro">VISUAL EVIDENCE</p>
                  <h2>Uploaded images stay visible, persistent and traceable.</h2>
                </div>
                <ImagePlus />
              </div>

              <p className="muted">
                Images are stored in the browser Evidence Library and restored automatically after refresh.
                Scene assignments keep their asset IDs, so a reload should not silently remove an embedded image.
              </p>

              {visualAssetStatus && (
                <Notice>
                  <strong>{visualAssetStatus}</strong>
                </Notice>
              )}

              {!visualAssetsRestored && (
                <p className="muted" style={{ marginTop: 14 }}>
                  Restoring persistent visual evidence…
                </p>
              )}

              {project.assets.filter((asset) =>
                asset.mimeType?.startsWith("image/")
              ).length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 14,
                    marginTop: 18,
                  }}
                >
                  {project.assets
                    .filter((asset) =>
                      asset.mimeType?.startsWith("image/")
                    )
                    .slice(0, 8)
                    .map((asset) => {
                      const usedScenes = project.scenes.filter(
                        (scene) => scene.assetId === asset.id
                      );

                      return (
                        <article
                          key={asset.id}
                          style={{
                            border: "1px solid rgba(255,255,255,.1)",
                            borderRadius: 16,
                            overflow: "hidden",
                            background: "rgba(255,255,255,.025)",
                          }}
                        >
                          <div
                            style={{
                              aspectRatio: "16 / 10",
                              background: "#080d18",
                              overflow: "hidden",
                            }}
                          >
                            <img
                              src={asset.dataUrl}
                              alt={asset.name}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          </div>

                          <div style={{ padding: 12 }}>
                            <p className="micro" style={{ margin: 0 }}>
                              VISUAL EVIDENCE · PERSISTENT
                            </p>
                            <strong
                              style={{
                                display: "block",
                                marginTop: 7,
                                fontSize: 12,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {asset.name}
                            </strong>
                            <p
                              className="muted"
                              style={{
                                marginTop: 7,
                                marginBottom: 0,
                                fontSize: 11,
                              }}
                            >
                              {usedScenes.length
                                ? `Used in ${usedScenes.length} scene${usedScenes.length === 1 ? "" : "s"}`
                                : "Available for scene assignment"}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                </div>
              ) : (
                <Notice>
                  No image evidence is currently hydrated into this project. Add an image below; a thumbnail will appear here immediately.
                </Notice>
              )}
            </div>
          </section>

          <EvidenceIntelligenceLab
            topic={topic}
            question={question}
            evidence={evidence}
            datasets={datasets}
            scout={scout}
            onIntegrate={integrateIntelligence}
            onIntegrateVisualAssets={integrateVisualAssets}
            onPurgeEvidenceSources={purgeEvidenceSources}
            onUseAngle={useIntelligenceAngle}
          />
        </>
      )}

      {activeTab === "story" && (
        <section className="workspace storyGrid">
          <div className="panel stickyPreview">
            <div className="panelHead"><div><p className="micro">CINEMATIC PREVIEW</p><h2>{project.episode.workingTitle}</h2></div><Film /></div>
            <div className="playerShell">
              <Player component={OriginEpisode} inputProps={project} durationInFrames={durationInFrames} compositionWidth={1920} compositionHeight={1080} fps={30} controls style={{ width: "100%", aspectRatio: "16 / 9" }} />
            </div>
            <div className="previewMeta">
              <span><Play size={15} /> {Math.round(durationInFrames / 30)} sec</span>
              <span><Clapperboard size={15} /> {project.scenes.length} scenes</span>
              <span><Globe2 size={15} /> {getStoryPack(project.episode.storyMode || "hps").label}</span>
              <span><Sparkles size={15} /> {project.visualIntelligence?.overall ?? 0}/100 visual</span>
            </div>
            {manualScriptEdits && <Notice><strong>Script changed.</strong> Narration timing was cleared. Rebuild it after editing.</Notice>}
          </div>

          <div className="panel">
            <div className="panelHead"><div><p className="micro">STORY MAP</p><h2>Evidence, narration and visual job per scene.</h2></div><Sparkles /></div>
            <div className="sceneList">
              {project.scenes.map((scene, index) => {
                const editing = editingSceneId === scene.id;
                return (
                  <article className="sceneCard" key={scene.id}>
                    <div className="sceneIndex">{String(index + 1).padStart(2, "0")}</div>
                    <div style={{ width: "100%" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <p className="micro">{scene.eyebrow}</p>
                        <button className="button ghost" onClick={() => setEditingSceneId(editing ? null : scene.id)}>
                          {editing ? <><Save size={14} /> Done</> : <><Pencil size={14} /> Edit</>}
                        </button>
                      </div>
                      {editing ? (
                        <>
                          <label>Headline<input value={scene.headline} onChange={(e: any) => updateScene(scene.id, "headline", e.target.value)} /></label>
                          <label>Narration<textarea rows={8} value={scene.narration} onChange={(e: any) => updateScene(scene.id, "narration", e.target.value)} /></label>
                          <label>On-screen evidence<textarea rows={4} value={scene.body} onChange={(e: any) => updateScene(scene.id, "body", e.target.value)} /></label>
                        </>
                      ) : (
                        <><h3>{scene.headline}</h3><p>{scene.narration}</p></>
                      )}
                      <div className="sceneMeta">
                        <span>{scene.kind}</span><span>{scene.durationSec}s</span><span>{scene.factIds.length} evidence links</span>
                      </div>
                      {scene.visualPlan && <div className="retentionPurpose"><strong>Visual:</strong> {scene.visualPlan.kind} · {scene.visualPlan.reason}</div>}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="exportRow">
              <button className="button" onClick={() => downloadText(`${project.id}-script.md`, projectAsMarkdown(project), "text/markdown")}><Download size={16} /> Script</button>
              <button className="button" onClick={() => downloadText(`${project.id}.json`, JSON.stringify(project, null, 2), "application/json")}><Download size={16} /> JSON</button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "visual" && (
        <section className="workspace twoCol">
          <div className="panel">
            <div className="panelHead"><div><p className="micro">VISUAL INTELLIGENCE</p><h2>Does the story show enough evidence?</h2></div><Eye /></div>
            <div className="retentionHero">
              <div className="scoreRing"><strong>{project.visualIntelligence?.overall ?? 0}</strong><span>/100</span></div>
              <div><p className="micro">VISUAL INTELLIGENCE SCORE</p><h3>{scoreTone(project.visualIntelligence?.overall ?? 0)}</h3><p className="muted">This measures evidence density, visual variation, geography, data storytelling and source visibility.</p></div>
            </div>
            <div className="retentionMetrics">
              {[
                ["Evidence density", project.visualIntelligence?.evidenceDensity ?? 0],
                ["Visual variation", project.visualIntelligence?.visualVariation ?? 0],
                ["Geographic context", project.visualIntelligence?.geographicContext ?? 0],
                ["Data storytelling", project.visualIntelligence?.dataStorytelling ?? 0],
                ["Source visibility", project.visualIntelligence?.sourceVisibility ?? 0],
              ].map(([label, value]) => (
                <div className="metricBar" key={String(label)}><div><span>{label}</span><strong>{value}/100</strong></div><div className="metricTrack"><div className="metricFill" style={{ width: `${value}%` }} /></div></div>
              ))}
            </div>
            {!!project.visualIntelligence?.warnings.length && <div className="retentionWarnings"><p className="micro">VISUAL GAPS</p>{project.visualIntelligence.warnings.map((warning, index) => <div key={warning}><span>{String(index + 1).padStart(2, "0")}</span><p>{warning}</p></div>)}</div>}
            <button
              type="button"
              className="button primary"
              onClick={rerunVisualReasoning}
              disabled={visualRerunBusy}
              aria-busy={visualRerunBusy}
              title="Recompute visual plans and the Visual Intelligence score from the current story, evidence and datasets."
            >
              {visualRerunBusy ? <LoaderCircle size={16} /> : <Sparkles size={16} />}
              {visualRerunBusy ? "Re-running visual reasoning…" : "Re-run visual reasoning"}
            </button>
            {visualRerunMessage && (
              <p className="micro" role="status" aria-live="polite" style={{ marginTop: 10 }}>
                {visualRerunMessage}
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panelHead"><div><p className="micro">DATA + MAP STORIES</p><h2>Structured evidence becomes visible.</h2></div><MapPinned /></div>
            {datasets.length === 0 ? <Notice>Upload a CSV in Evidence. If it contains quantitative structure or coordinates, Evidence Studio will propose a chart and/or map scene.</Notice> : datasets.map((item) => (
              <article className="sceneCard" key={item.name}>
                <div style={{ width: "100%" }}>
                  <p className="micro">{item.name}</p><h3>{item.rowCount} rows · {item.columns.length} columns</h3>
                  {item.insight && <p>{item.insight}</p>}
                  <div className="sceneMeta"><span>{item.recommendedChart ? `chart: ${item.recommendedChart.type}` : "no chart"}</span><span>{item.recommendedMap ? `${item.recommendedMap.points.length} mapped points` : "no map"}</span></div>
                </div>
              </article>
            ))}
            <div style={{ marginTop: 22 }}>
              <p className="micro">SCENE VISUAL PLANS</p>
              {project.scenes.map((scene, index) => <div key={scene.id} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}><strong>{String(index + 1).padStart(2, "0")} · {scene.headline}</strong><p className="muted" style={{ margin: "6px 0 0" }}>{scene.visualPlan?.kind || "unplanned"} · {scene.visualPlan?.confidence ?? 0}%</p></div>)}
            </div>
          </div>
        </section>
      )}

      {activeTab === "narration" && (
        <section className="workspace narrationGrid">
          <div className="panel">
            <div className="panelHead"><div><p className="micro">NARRATION</p><h2>One approved script drives timing and captions.</h2></div><Clapperboard /></div>
            <label>ElevenLabs voice ID<input value={voiceId} onChange={(e: any) => setVoiceId(e.target.value)} placeholder="Optional if configured on server" /></label>
            <label>Model ID<input value={modelId} onChange={(e: any) => setModelId(e.target.value)} /></label>
            {narrationError && <div className="studioError">{narrationError}</div>}
            <div className="narrationActions">
              <button className="button" onClick={buildEstimatedNarration} disabled={narrationBusy}><Clapperboard size={16} /> Build timing without TTS</button>
              <button className="button primary" onClick={generatePremiumNarration} disabled={narrationBusy}><WandSparkles size={16} /> {narrationBusy ? "Generating…" : "Generate premium narration"}</button>
            </div>
            {project.narration?.audioDataUrl && <div className="audioPreview"><audio controls src={project.narration.audioDataUrl} /></div>}
          </div>
          <div className="panel">
            <p className="micro">TIMED SENTENCES</p>
            {project.narration ? <div className="sentenceTimeline">{project.narration.sentences.slice(0, 80).map((sentence, index) => <article key={sentence.id}><span className="sentenceTime">{sentence.startSec.toFixed(1)}–{sentence.endSec.toFixed(1)}</span><div><strong>{String(index + 1).padStart(2, "0")}</strong><p>{sentence.text}</p></div></article>)}</div> : <Notice>No narration timing yet.</Notice>}
          </div>
        </section>
      )}

      {activeTab === "retention" && (
        <section className="workspace retentionGrid">
          <div className="panel">
            <div className="panelHead"><div><p className="micro">RETENTION LAB</p><h2>Make every section earn the next.</h2></div><Eye /></div>
            <div className="retentionHero"><div className="scoreRing"><strong>{project.retention?.overall ?? 0}</strong><span>/100</span></div><div><h3>Editorial retention structure</h3><p className="muted">Hook, pacing, proof density, curiosity and clarity.</p></div></div>
            <div className="retentionMetrics">{[["Hook",project.retention?.hook??0],["Pacing",project.retention?.pacing??0],["Proof density",project.retention?.proofDensity??0],["Curiosity",project.retention?.curiosity??0],["Clarity",project.retention?.clarity??0]].map(([label,value]) => <div className="metricBar" key={String(label)}><div><span>{label}</span><strong>{value}/100</strong></div><div className="metricTrack"><div className="metricFill" style={{width:`${value}%`}} /></div></div>)}</div>
            {!!project.retention?.warnings.length && <div className="retentionWarnings">{project.retention.warnings.map((warning,index)=><div key={warning}><span>{index+1}</span><p>{warning}</p></div>)}</div>}
          </div>
          <div className="panel"><p className="micro">ATTENTION MAP</p><div className="retentionTimeline">{project.retention?.beats.map((beat,index)=><article key={`${beat.atSec}-${index}`}><div className={`beatDot beat-${beat.type}`} /><div><div className="beatTop"><span>{Math.floor(beat.atSec/60)}:{String(beat.atSec%60).padStart(2,"0")}</span><strong>{beat.type.replace("_"," ")}</strong></div><p>{beat.label}</p></div></article>)}</div></div>
        </section>
      )}

      {activeTab === "publish" && (
        <section className="workspace publishGrid">
          <div className="panel"><p className="micro">YOUTUBE DESCRIPTION</p><textarea rows={13} value={project.publishing.description} onChange={(e: any)=>setProject({...project,publishing:{...project.publishing,description:e.target.value}})} /></div>
          <div className="panel"><p className="micro">PINNED COMMENT</p><textarea rows={8} value={project.publishing.pinnedComment} onChange={(e: any)=>setProject({...project,publishing:{...project.publishing,pinnedComment:e.target.value}})} /></div>
          <div className="panel"><p className="micro">LINKEDIN LAUNCH</p><textarea rows={11} value={project.publishing.linkedinPost} onChange={(e: any)=>setProject({...project,publishing:{...project.publishing,linkedinPost:e.target.value}})} /></div>
          <div className="panel renderMasterPanel">
            <p className="micro">RENDER</p><h2>Generate the finished media.</h2>
            <div className="renderActionGrid">
              <button className="button primary" disabled={Boolean(renderBusy)} onClick={()=>render("video")}><Film size={16} /> {renderBusy === "video" ? "Rendering…" : "Generate Final Video"}</button>
              <button className="button" disabled={Boolean(renderBusy)} onClick={()=>render("short")}><Clapperboard size={16} /> Generate Short 1</button>
              <button className="button" disabled={Boolean(renderBusy)} onClick={()=>render("thumbnail")}><ImagePlus size={16} /> Generate Thumbnail</button>
            </div>
            {renderError && <div className="studioError">{renderError}</div>}
            <div style={{ marginTop: 18 }}><button className="button" onClick={()=>downloadLocalRenderPackage(project)}><Download size={16} /> Download Local Render Package</button></div>
            <div style={{ marginTop: 18 }}><button className="button ghost" onClick={()=>downloadText(`episode-${project.id}.json`,JSON.stringify(project,null,2),"application/json")}><Download size={16} /> Export JSON manifest</button></div>
          </div>
        </section>
      )}
    </main>
  );
}
