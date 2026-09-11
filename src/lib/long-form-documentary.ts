import type {
  DatasetAnalysis,
  EpisodeProject,
  Scene,
} from "./types";

import {
  buildMechanismCoveragePlan,
  coverageBeatForLayer,
  sceneCoverageLayers,
  type CoverageLayer,
  type MechanismCoveragePlan,
} from "./mechanism-coverage";

export type DocumentarySceneRole =
  | "hook"
  | "frame"
  | "data"
  | "geography"
  | "mechanism"
  | "consequence"
  | "governance"
  | "trust_boundary"
  | "synthesis"
  | "closure";

export type LongFormPlan = {
  targetWords: number;
  wordsPerMinute: number;
  sceneTargets: Array<{
    sceneId: string;
    role: DocumentarySceneRole;
    targetWords: number;
  }>;
};

const LONG_FORM_MODES = new Set([
  "world_explained",
  "investigation",
  "explainer",
  "case_study",
  "research",
  "report",
]);

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function wordCount(value: string) {
  return clean(value)
    .split(/\s+/)
    .filter(Boolean).length;
}

function splitSentences(value: string) {
  return clean(value)
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);
}

function normalise(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.%/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  const stop = new Set([
    "the","a","an","and","or","of","to","in","on","for","with","from",
    "that","this","these","those","is","are","was","were","be","been",
    "being","it","its","as","at","by","into","than","then","now",
    "evidence","data","scene","story","shows","show","question","answer",
    "system",
  ]);

  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function similarity(a: string, b: string) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });

  return overlap / new Set([...aa, ...bb]).size;
}

function extractCanonicalFloodQuestion(value: string) {
  const text = clean(value);
  const match = text.match(/\bwhy\s+(.+?)\s+floods?\b/i);
  if (!match) return "";

  const subject = clean(match[1])
    .replace(/^(?:the hidden system behind|the system behind)\s+/i, "")
    .replace(/^(?:does|do)\s+/i, "")
    .trim();

  return subject
    ? `Why does ${subject} flood so often?`
    : "";
}

export function resolvedNarrationQuestion(project: EpisodeProject) {
  const original = clean(project.episode.question);
  const title = clean(project.episode.workingTitle);

  return (
    extractCanonicalFloodQuestion(original) ||
    extractCanonicalFloodQuestion(title) ||
    (original
      ? original.replace(/[?.!]+$/, "") + "?"
      : title
        ? `What is really driving ${title.replace(/[?.!]+$/, "")}?`
        : "")
  );
}

export function roleForScene(
  project: EpisodeProject,
  scene: Scene,
  index: number
): DocumentarySceneRole {
  const text =
    `${scene.eyebrow} ${scene.headline} ${scene.body}`.toLowerCase();

  if (index === 0) return "hook";
  if (scene.kind === "cta") return "closure";
  if (scene.chart || scene.kind === "data_chart") return "data";
  if (scene.map || scene.kind === "map_story") return "geography";

  if (
    /trust boundary|limitation|uncertain|does not prove|still not prove|not establish|scope/.test(
      text
    ) ||
    scene.kind === "quote"
  ) {
    return "trust_boundary";
  }

  if (
    /governance|policy|maintenance|institution|response|management|planning|enforcement|regulation/.test(
      text
    )
  ) {
    return "governance";
  }

  if (
    /impact|consequence|people|community|household|worker|health|livelihood|loss|damage|exposure/.test(
      text
    )
  ) {
    return "consequence";
  }

  if (
    /mechanism|flow|path|process|driver|cause|chain|interaction|network|cycle|water can go|built surface|infiltration|runoff|capacity|blockage/.test(
      text
    ) ||
    scene.kind === "diagram" ||
    scene.kind === "timeline"
  ) {
    return "mechanism";
  }

  if (index >= Math.floor(project.scenes.length * 0.78)) {
    return "synthesis";
  }

  return "frame";
}

function roleWeight(role: DocumentarySceneRole) {
  const weights: Record<DocumentarySceneRole, number> = {
    hook: 1.0,
    frame: 1.0,
    data: 1.05,
    geography: 0.95,
    mechanism: 1.55,
    consequence: 1.1,
    governance: 1.35,
    trust_boundary: 0.85,
    synthesis: 1.1,
    closure: 0.45,
  };

  return weights[role];
}

export function documentaryWordsPerMinute(project: EpisodeProject) {
  if (
    project.episode.targetMinutes < 7 ||
    !LONG_FORM_MODES.has(project.episode.storyMode || "")
  ) {
    return 155;
  }

  return project.episode.targetMinutes >= 10 ? 142 : 145;
}

function targetWordCount(project: EpisodeProject) {
  const target = Math.round(
    project.episode.targetMinutes *
      documentaryWordsPerMinute(project)
  );

  return Math.max(850, Math.min(1800, target));
}

export function buildLongFormPlan(project: EpisodeProject): LongFormPlan {
  const targetWords = targetWordCount(project);
  const wordsPerMinute = documentaryWordsPerMinute(project);

  const rows = project.scenes.map((scene, index) => ({
    sceneId: scene.id,
    role: roleForScene(project, scene, index),
  }));

  const totalWeight =
    rows.reduce((sum, row) => sum + roleWeight(row.role), 0) || 1;

  const sceneTargets = rows.map((row) => {
    const raw = Math.round(
      targetWords * (roleWeight(row.role) / totalWeight)
    );

    const min =
      row.role === "closure" ? 35 :
      row.role === "trust_boundary" ? 85 :
      row.role === "mechanism" ? 145 :
      row.role === "governance" ? 125 :
      95;

    const max =
      row.role === "hook" ? 145 :
      row.role === "mechanism" ? 260 :
      row.role === "governance" ? 220 :
      row.role === "closure" ? 75 :
      185;

    return {
      ...row,
      targetWords: Math.max(min, Math.min(max, raw)),
    };
  });

  return {
    targetWords,
    wordsPerMinute,
    sceneTargets,
  };
}

function chartFacts(scene: Scene) {
  const chart = scene.chart;
  if (!chart?.data?.length) return [];

  const ranked = [...chart.data]
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);

  const first = ranked[0];
  const second = ranked[1];
  if (!first) return [];

  const unit = clean(chart.unit || chart.yLabel || "");
  const suffix = unit ? ` ${unit}` : "";

  return [
    second
      ? `${first.label} records the highest plotted value at ${first.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}, followed by ${second.label} at ${second.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}.`
      : `${first.label} records the highest plotted value at ${first.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}.`,
  ];
}

function mapFacts(scene: Scene) {
  if (!scene.map) return [];

  const labels = scene.map.points
    .slice(0, 4)
    .map((point) => clean(point.label))
    .filter(Boolean);

  return [
    labels.length
      ? `The dataset places ${scene.map.points.length} observations on the map, including ${labels.join(", ")}.`
      : `The dataset places ${scene.map.points.length} observations on the map.`,
  ];
}

function roleAnalysis(role: DocumentarySceneRole) {
  switch (role) {
    case "hook":
      return [
        "A flood is the visible outcome of a chain of processes that begins before water reaches the places where damage is finally seen.",
        "The useful question is therefore not only how much rain fell, but how the city transformed rainfall into runoff, accumulation and exposure.",
      ];
    case "data":
      return [
        "Those measurements establish the intensity and timing of the trigger at the places that were observed.",
        "They do not, by themselves, tell us how much runoff reached every street or how drainage performed at every location.",
        "Rainfall is therefore necessary context, not a complete explanation.",
      ];
    case "geography":
      return [
        "Geography matters because observations describe specific locations.",
        "A small number of mapped points can show where measurements exist, but they do not create a continuous flood-risk surface for the entire city.",
      ];
    case "trust_boundary":
      return [
        "The strongest detailed mechanism evidence in this story comes from a local case study.",
        "A local case can reveal how a mechanism works without proving that exactly the same combination of drivers operates everywhere else.",
        "That boundary defines how far the conclusion can responsibly travel.",
      ];
    case "synthesis":
      return [
        "The strongest explanation connects the trigger, the surface response, the available flow paths, drainage capacity, maintenance, exposure and the choices made about how the city develops.",
        "The visible flood is therefore the end of a chain, not the whole explanation.",
      ];
    default:
      return [];
  }
}

function cleanBody(scene: Scene) {
  const text = clean(scene.body);

  if (
    !text ||
    /current story-grounded evidence|the story is built only from evidence|this draft/i.test(
      text
    ) ||
    /^source\s*:/i.test(text) ||
    /managing flooding in residential areas of nairobi/i.test(text) ||
    /\bsteven\s*\(\d{4}\)/i.test(text) ||
    /\bworld meteorological organization\b/i.test(text) ||
    /urban flooding is significantly differs/i.test(text) ||
    /this has built up by the fact that/i.test(text) ||
    /rainfall .*decreased from .*jan .* to .*dec/i.test(text) ||
    /clogged drainage systems?\.?$/i.test(text)
  ) {
    return "";
  }

  return text;
}

function selectUnique(
  candidates: string[],
  scene: Scene,
  globalSentences: string[]
) {
  const accepted: string[] = [];

  for (const candidate of candidates.flatMap(splitSentences)) {
    const text = clean(candidate);
    if (!text) continue;

    const labelKey = normalise(scene.headline);
    if (normalise(text) === labelKey) continue;

    const duplicate = [...globalSentences, ...accepted].some(
      (existing) =>
        similarity(existing, text) >=
        (Math.min(wordCount(existing), wordCount(text)) <= 12 ? 0.5 : 0.58)
    );

    if (duplicate) continue;
    accepted.push(text);
  }

  globalSentences.push(...accepted);
  return accepted;
}

function trimToWords(value: string, maxWords: number) {
  const parts = splitSentences(value);
  const kept: string[] = [];
  let count = 0;

  for (const sentence of parts) {
    const length = wordCount(sentence);
    if (kept.length && count + length > maxWords) break;
    kept.push(sentence);
    count += length;
  }

  return clean(kept.join(" "));
}

function coverageNarration(
  plan: MechanismCoveragePlan,
  layers: CoverageLayer[],
  usedLayers: Set<CoverageLayer>
) {
  const lines: string[] = [];

  for (const layer of layers) {
    if (usedLayers.has(layer)) continue;

    const beat = coverageBeatForLayer(plan, layer);
    if (!beat) continue;

    lines.push(...beat.narration);
    usedLayers.add(layer);
  }

  return lines;
}

function composeScene(
  project: EpisodeProject,
  scene: Scene,
  index: number,
  role: DocumentarySceneRole,
  targetWords: number,
  coverage: MechanismCoveragePlan,
  usedLayers: Set<CoverageLayer>,
  globalSentences: string[]
) {
  let candidates: string[] = [];

  if (role === "hook") {
    candidates = [
      `${resolvedNarrationQuestion(project)} Heavy rain may be part of the answer, but that explanation stops too early.`,
      ...roleAnalysis(role),
      ...coverageNarration(
        coverage,
        ["trigger"],
        usedLayers
      ),
    ];
  } else if (role === "data") {
    candidates = [
      "Start with the wider rainfall context.",
      ...coverage.monthlyContext,
      "Now zoom into the shorter flood event.",
      ...chartFacts(scene),
      ...coverage.eventContext,
      ...roleAnalysis(role),
    ];
  } else if (role === "geography") {
    candidates = [
      "Now put those measurements on the map.",
      ...mapFacts(scene),
      ...roleAnalysis(role),
    ];
  } else if (
    role === "mechanism" ||
    role === "frame" ||
    role === "governance" ||
    role === "consequence"
  ) {
    const layers = sceneCoverageLayers(project, scene, index);

    candidates = [
      role === "mechanism"
        ? "Now follow the water through the city."
        : role === "governance"
          ? "The physical system only works when the institutions around it keep it functional."
          : "",
      cleanBody(scene),
      ...coverageNarration(
        coverage,
        layers,
        usedLayers
      ),
    ];
  } else if (role === "trust_boundary") {
    const requiredBeforeBoundary = ([
      "blockage",
      "exposure",
      "impact",
      "response",
      "tradeoff",
    ] as CoverageLayer[]).filter(
      (layer) => !usedLayers.has(layer)
    );

    candidates = [
      ...coverageNarration(
        coverage,
        requiredBeforeBoundary,
        usedLayers
      ),
      "This is where the evidence becomes narrower.",
      "The most detailed evidence on drainage, paving, blockage and maintenance comes from the South C case study.",
      "That gives us a well-documented local mechanism, but it does not prove that exactly the same combination of drivers operates in every flood-prone part of Nairobi.",
      ...roleAnalysis(role),
    ];
  } else if (role === "synthesis") {
    const remainingLayers = ([
      "surface_response",
      "flow_path",
      "capacity",
      "blockage",
      "maintenance",
      "development",
      "exposure",
      "impact",
      "response",
      "tradeoff",
    ] as CoverageLayer[]).filter(
      (layer) => !usedLayers.has(layer)
    );

    candidates = [
      ...coverageNarration(
        coverage,
        remainingLayers,
        usedLayers
      ),
      "Taken together, the evidence points to a chain of conditions rather than one simple cause.",
      ...roleAnalysis(role),
    ];
  }

  const selected = selectUnique(
    candidates.filter(Boolean),
    scene,
    globalSentences
  );

  return trimToWords(
    selected.join(" "),
    Math.max(80, Math.round(targetWords * 1.12))
  );
}

export function buildGenericLongFormNarration(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
) {
  const isLongForm =
    project.episode.targetMinutes >= 7 &&
    LONG_FORM_MODES.has(project.episode.storyMode || "");

  if (!isLongForm) {
    return project.scenes;
  }

  const plan = buildLongFormPlan(project);
  const coverage = buildMechanismCoveragePlan(
    project,
    datasetsOverride
  );

  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const usedLayers = new Set<CoverageLayer>();
  const globalSentences: string[] = [];

  return project.scenes.map((scene, index) => {
    const target = targetById.get(scene.id);

    if (!target) {
      return {
        ...scene,
        narration: "",
      };
    }

    return {
      ...scene,
      narration: composeScene(
        project,
        scene,
        index,
        target.role,
        target.targetWords,
        coverage,
        usedLayers,
        globalSentences
      ),
    };
  });
}
