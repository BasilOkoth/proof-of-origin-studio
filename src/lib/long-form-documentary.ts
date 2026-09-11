import type {
  DatasetAnalysis,
  EpisodeProject,
  Scene,
} from "./types";

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

function sentences(value: string) {
  return clean(value)
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);
}

function normalise(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.%-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for",
    "with", "from", "that", "this", "these", "those", "is", "are",
    "was", "were", "be", "been", "being", "it", "its", "as", "at",
    "by", "into", "than", "then", "now", "evidence", "data", "scene",
    "story", "shows", "show", "question", "answer", "system",
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

  const union = new Set([...aa, ...bb]).size;
  return union ? overlap / union : 0;
}

function numericFingerprint(value: string) {
  return Array.from(
    new Set(clean(value).match(/\b\d+(?:\.\d+)?\b/g) || [])
  )
    .sort()
    .join("|");
}

function naturalQuestion(project: EpisodeProject) {
  const original = clean(project.episode.question);
  const title = clean(project.episode.workingTitle);

  if (
    original &&
    !/forces behind\s+why\b/i.test(original) &&
    !/how do the forces behind/i.test(original)
  ) {
    return original.replace(/[?.!]+$/, "") + "?";
  }

  const source = title || original;

  const flood = source.match(/^why\s+(.+?)\s+floods?$/i);
  if (flood) {
    return `Why does ${flood[1]} flood so often?`;
  }

  const keeps = source.match(/^why\s+(.+?)\s+keeps?\s+(.+)$/i);
  if (keeps) {
    return `Why does ${keeps[1]} keep ${keeps[2].replace(/[?.!]+$/, "")}?`;
  }

  if (/^why\b/i.test(source)) {
    return source.replace(/[?.!]+$/, "") + "?";
  }

  return original
    ? original.replace(/[?.!]+$/, "") + "?"
    : title
      ? `What is really driving ${title.replace(/[?.!]+$/, "")}?`
      : "";
}

function stripProductionLanguage(value: string) {
  return clean(value)
    .replace(/\b(?:the source is|source:)\s+[^.]+\.?/gi, " ")
    .replace(/\bthe source-backed observation is:\s*/gi, "")
    .replace(/\bthe current interpretation is:\s*/gi, "")
    .replace(/\bone limitation is explicit:\s*/gi, "")
    .replace(/\bthe story is built only from evidence[^.]*\.?/gi, " ")
    .replace(/\bthe evidence card remains visible[^.]*\.?/gi, " ")
    .replace(/\bthe analytical value of this scene[^.]*\.?/gi, " ")
    .replace(/\ba mechanism is convincing only when the arrows[^.]*\.?/gi, " ")
    .replace(/\bthe chart makes the comparison visible\.?/gi, " ")
    .replace(/\bthe point of the chart is not decoration\.?/gi, " ")
    .replace(/\blocation is not decoration here[^.]*\.?/gi, " ")
    .replace(/\bnumbers are most useful when they change the question[^.]*\.?/gi, " ")
    .replace(/\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi, "")
    .replace(/^\s*[a-z]\)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeRawSource(value: string) {
  const text = clean(value);

  if (!text) return true;
  if (/^\s*[a-z]\)\s+/i.test(text)) return true;
  if (/^(?:figure|plate|table|map)\s+\d/i.test(text)) return true;
  if (/\bsource:\b/i.test(text)) return true;
  if (wordCount(text) > 42) return true;

  const awkward = [
    /this has built up by the fact that/i,
    /urban flooding is significantly differs/i,
    /another form of .* identified takes place when/i,
    /apart from the rising of/i,
    /on top of the storm/i,
    /secondly,\s*flooding has been seen over time as either/i,
  ];

  return awkward.some((pattern) => pattern.test(text));
}

function sentenceScore(value: string) {
  let score = 0;
  const count = wordCount(value);

  if (count >= 7 && count <= 28) score += 4;
  if (count > 28 && count <= 36) score += 2;
  if (/[.!?]$/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (looksLikeRawSource(value)) score -= 8;

  return score;
}

function readableExisting(scene: Scene) {
  const cleaned = stripProductionLanguage(scene.narration);

  return sentences(cleaned)
    .filter((sentence) => !looksLikeRawSource(sentence))
    .sort((a, b) => sentenceScore(b) - sentenceScore(a))
    .slice(0, 4)
    .sort(
      (a, b) =>
        sentences(cleaned).indexOf(a) -
        sentences(cleaned).indexOf(b)
    )
    .join(" ");
}

function readableBody(scene: Scene) {
  const cleaned = stripProductionLanguage(scene.body);

  return sentences(cleaned)
    .filter((sentence) => !looksLikeRawSource(sentence))
    .slice(0, 2)
    .join(" ");
}

function evidenceForScene(project: EpisodeProject, scene: Scene) {
  const ids = new Set(scene.factIds || []);
  return project.evidence.filter((item) => ids.has(item.id));
}

function conciseEvidence(
  project: EpisodeProject,
  scene: Scene,
  usedEvidence: Set<string>,
  kind: "observation" | "limitation"
) {
  const candidates = evidenceForScene(project, scene)
    .filter((item) =>
      kind === "limitation"
        ? item.kind === "limitation"
        : item.kind !== "limitation"
    )
    .map((item) => stripProductionLanguage(item.statement))
    .filter(
      (text) =>
        text.length >= 25 &&
        !looksLikeRawSource(text)
    );

  for (const text of candidates) {
    const key = normalise(text);
    if (usedEvidence.has(key)) continue;

    usedEvidence.add(key);

    if (kind === "limitation") {
      return `The limitation is that ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    return `The evidence indicates that ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  return "";
}

function roleForScene(
  project: EpisodeProject,
  scene: Scene,
  index: number
): DocumentarySceneRole {
  const text = `${scene.eyebrow} ${scene.headline} ${scene.body}`.toLowerCase();

  if (index === 0) return "hook";
  if (scene.kind === "cta") return "closure";

  if (
    scene.chart ||
    scene.kind === "data_chart" ||
    /data story|trend|pattern|measured|comparison|rate|total|percent|million|billion/.test(text)
  ) {
    return "data";
  }

  if (
    scene.map ||
    scene.kind === "map_story" ||
    /geograph|location|where|spatial|region|county|city|basin|route|terrain/.test(text)
  ) {
    return "geography";
  }

  if (
    /trust boundary|limitation|uncertain|does not prove|not establish|scope/.test(text) ||
    scene.kind === "quote"
  ) {
    return "trust_boundary";
  }

  if (
    /governance|policy|maintenance|institution|response|management|planning|enforcement|regulation/.test(text)
  ) {
    return "governance";
  }

  if (
    /impact|consequence|people|community|household|worker|farmer|health|livelihood|loss|damage|exposure/.test(text)
  ) {
    return "consequence";
  }

  if (
    /system|mechanism|flow|path|process|driver|cause|chain|interaction|network|cycle/.test(text) ||
    scene.kind === "diagram" ||
    scene.kind === "timeline"
  ) {
    return "mechanism";
  }

  if (index >= Math.floor(project.scenes.length * 0.72)) {
    return "synthesis";
  }

  return "frame";
}

function roleWeight(role: DocumentarySceneRole) {
  const weights: Record<DocumentarySceneRole, number> = {
    hook: 1.05,
    frame: 0.85,
    data: 0.95,
    geography: 0.85,
    mechanism: 1.15,
    consequence: 1.0,
    governance: 1.05,
    trust_boundary: 0.8,
    synthesis: 1.05,
    closure: 0.55,
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
    project.episode.targetMinutes * documentaryWordsPerMinute(project)
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
      row.role === "closure" ? 45 :
      row.role === "trust_boundary" ? 60 :
      65;

    const max =
      row.role === "hook" ? 115 :
      row.role === "mechanism" ? 145 :
      row.role === "governance" ? 140 :
      row.role === "closure" ? 85 :
      130;

    return {
      sceneId: row.sceneId,
      role: row.role,
      targetWords: Math.max(min, Math.min(max, raw)),
    };
  });

  return {
    targetWords,
    wordsPerMinute,
    sceneTargets,
  };
}

function chartSentence(scene: Scene) {
  const chart = scene.chart;
  if (!chart) return "";

  const ranked = [...chart.data]
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);

  const first = ranked[0];
  const second = ranked[1];
  if (!first) return "";

  const unit = clean(chart.unit || chart.yLabel || "");

  if (!second) {
    return `${first.label} records the highest plotted value at ${first.value.toLocaleString(
      undefined,
      { maximumFractionDigits: 1 }
    )}${unit ? ` ${unit}` : ""}.`;
  }

  return `${first.label} records the highest plotted value at ${first.value.toLocaleString(
    undefined,
    { maximumFractionDigits: 1 }
  )}${unit ? ` ${unit}` : ""}, followed by ${second.label} at ${second.value.toLocaleString(
    undefined,
    { maximumFractionDigits: 1 }
  )}${unit ? ` ${unit}` : ""}.`;
}

function mapSentence(scene: Scene) {
  if (!scene.map) return "";

  const labels = scene.map.points
    .slice(0, 4)
    .map((point) => clean(point.label))
    .filter(Boolean);

  return labels.length
    ? `The mapped observations are ${labels.join(", ")}.`
    : "";
}

function bridge(
  project: EpisodeProject,
  role: DocumentarySceneRole
) {
  switch (role) {
    case "hook": {
      const question = naturalQuestion(project);
      return question
        ? `${question} The obvious answer is only the beginning.`
        : "The visible event is easy to describe. The system behind it is not.";
    }

    case "data":
      return "Start with what can be measured.";

    case "geography":
      return "Then put those measurements back on the map.";

    case "mechanism":
      return "The next step is to follow what happens between the trigger and the outcome.";

    case "consequence":
      return "That process matters because its effects are experienced on the ground.";

    case "governance":
      return "The physical system is only part of the story.";

    case "trust_boundary":
      return "This is where the evidence becomes narrower.";

    case "synthesis":
      return "Taken together, the evidence points to a system rather than a single cause.";

    default:
      return "";
  }
}

function usefulAnalysis(role: DocumentarySceneRole) {
  switch (role) {
    case "data":
      return "Those measurements establish the pattern, but they do not by themselves explain why the outcome occurs.";

    case "geography":
      return "The map shows where the current observations exist; it should not be read as evidence for places the dataset does not cover.";

    case "mechanism":
      return "The important point is the pathway: a trigger becomes a larger problem only when conditions along that pathway amplify it.";

    case "governance":
      return "That means technical capacity and the way the system is maintained or managed have to be considered together.";

    case "trust_boundary":
      return "That boundary does not weaken the story; it defines how far the conclusion can responsibly travel.";

    case "synthesis":
      return "The strongest explanation therefore connects the trigger, the pathway, the conditions that amplify it, and the people or places exposed to the result.";

    default:
      return "";
  }
}

function uniqueSentences(
  candidates: string[],
  globalSentences: string[],
  globalNumbers: Set<string>
) {
  const accepted: string[] = [];

  for (const candidate of candidates.flatMap(sentences)) {
    const text = clean(candidate);
    if (!text || looksLikeRawSource(text)) continue;

    const duplicate = [...globalSentences, ...accepted].some((existing) => {
      const score = similarity(existing, text);
      const threshold =
        Math.min(wordCount(existing), wordCount(text)) <= 12 ? 0.48 : 0.58;

      return score >= threshold;
    });

    if (duplicate) continue;

    const numeric = numericFingerprint(text);
    if (numeric && globalNumbers.has(numeric)) continue;

    accepted.push(text);
    if (numeric) globalNumbers.add(numeric);
  }

  globalSentences.push(...accepted);
  return accepted;
}

function trimToWords(value: string, maxWords: number) {
  const parts = sentences(value);
  const kept: string[] = [];
  let count = 0;

  for (const sentence of parts) {
    const length = wordCount(sentence);

    if (kept.length && count + length > maxWords) break;

    if (!kept.length && length > maxWords) {
      return clean(sentence)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, maxWords)
        .join(" ")
        .replace(/[,;:]?$/, ".")
        .trim();
    }

    kept.push(sentence);
    count += length;
  }

  return clean(kept.join(" "));
}

function composeScene(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole,
  targetWords: number,
  usedEvidence: Set<string>,
  globalSentences: string[],
  globalNumbers: Set<string>
) {
  const existing = readableExisting(scene);
  const body = readableBody(scene);

  let candidates: string[] = [];

  if (role === "data") {
    candidates = [
      bridge(project, role),
      chartSentence(scene),
      existing,
      body,
      usefulAnalysis(role),
    ];
  } else if (role === "geography") {
    candidates = [
      bridge(project, role),
      mapSentence(scene),
      existing,
      body,
      usefulAnalysis(role),
    ];
  } else if (role === "trust_boundary") {
    candidates = [
      bridge(project, role),
      conciseEvidence(project, scene, usedEvidence, "limitation"),
      existing,
      body,
      usefulAnalysis(role),
    ];
  } else if (role === "closure") {
    candidates = [existing, body];
  } else {
    candidates = [
      bridge(project, role),
      existing,
      body,
      conciseEvidence(project, scene, usedEvidence, "observation"),
      usefulAnalysis(role),
    ];
  }

  const selected = uniqueSentences(
    candidates.filter(Boolean),
    globalSentences,
    globalNumbers
  );

  return trimToWords(
    selected.join(" "),
    Math.max(45, Math.round(targetWords * 1.05))
  );
}

export function buildGenericLongFormNarration(
  project: EpisodeProject,
  _datasetsOverride?: DatasetAnalysis[]
) {
  const isLongForm =
    project.episode.targetMinutes >= 7 &&
    LONG_FORM_MODES.has(project.episode.storyMode || "");

  if (!isLongForm) {
    return project.scenes.map((scene) => ({
      ...scene,
      narration: readableExisting(scene) || readableBody(scene),
    }));
  }

  const plan = buildLongFormPlan(project);
  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const usedEvidence = new Set<string>();
  const globalSentences: string[] = [];
  const globalNumbers = new Set<string>();

  return project.scenes.map((scene) => {
    const target = targetById.get(scene.id);

    if (!target) {
      return {
        ...scene,
        narration: readableExisting(scene) || readableBody(scene),
      };
    }

    const narration = composeScene(
      project,
      scene,
      target.role,
      target.targetWords,
      usedEvidence,
      globalSentences,
      globalNumbers
    );

    return {
      ...scene,
      narration:
        narration ||
        readableExisting(scene) ||
        readableBody(scene),
    };
  });
}

export function resolvedNarrationQuestion(project: EpisodeProject) {
  return naturalQuestion(project);
}
