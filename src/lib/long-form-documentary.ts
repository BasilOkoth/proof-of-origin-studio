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

const META_PATTERNS = [
  /the story is built only from evidence.*?(?:\.|$)/gi,
  /the evidence card remains visible.*?(?:\.|$)/gi,
  /the point of the chart is not decoration.*?(?:\.|$)/gi,
  /the analytical value of this scene.*?(?:\.|$)/gi,
  /a mechanism is convincing only when the arrows.*?(?:\.|$)/gi,
  /location is not decoration here.*?(?:\.|$)/gi,
  /numbers are most useful when they change the question.*?(?:\.|$)/gi,
  /the chart makes the comparison visible.*?(?:\.|$)/gi,
  /the chart establishes the measured pattern.*?(?:\.|$)/gi,
  /the comparison establishes the pattern in the measured data.*?(?:\.|$)/gi,
  /the map should therefore show where the evidence exists.*?(?:\.|$)/gi,
  /geography matters because evidence from one place.*?(?:\.|$)/gi,
  /geography matters because the same process.*?(?:\.|$)/gi,
];

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

function normaliseSentence(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.%-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceTokens(value: string) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on",
    "for", "with", "from", "that", "this", "these", "those",
    "is", "are", "was", "were", "be", "been", "being", "it",
    "its", "as", "at", "by", "into", "than", "then", "now",
    "evidence", "data", "scene", "story", "shows", "show",
  ]);

  return normaliseSentence(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function similarity(a: string, b: string) {
  const aa = new Set(sentenceTokens(a));
  const bb = new Set(sentenceTokens(b));

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
    new Set(
      clean(value)
        .match(/\b\d+(?:\.\d+)?\b/g) || []
    )
  )
    .sort()
    .join("|");
}

function stripProductionLanguage(value: string) {
  let next = clean(value);

  META_PATTERNS.forEach((pattern) => {
    next = next.replace(pattern, " ");
  });

  next = next
    .replace(
      /\b(?:the source is|source:)\s+[^.]+\.?/gi,
      " "
    )
    .replace(
      /\bthe source-backed observation is:\s*/gi,
      ""
    )
    .replace(
      /\bthe current interpretation is:\s*/gi,
      ""
    )
    .replace(
      /\bone limitation is explicit:\s*/gi,
      ""
    )
    .replace(
      /^\s*[a-z]\)\s+/i,
      ""
    )
    .replace(
      /\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return next;
}

function readableEvidenceStatement(value: string) {
  return stripProductionLanguage(value)
    .replace(
      /^this has built up by the fact that\s+/i,
      ""
    )
    .replace(
      /^on top of the storm,\s*/i,
      ""
    )
    .replace(
      /^urban flooding is significantly differs from rural flooding as\s+/i,
      ""
    )
    .replace(
      /^apart from\s+/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceForScene(
  project: EpisodeProject,
  scene: Scene
) {
  const ids = new Set(scene.factIds || []);
  return project.evidence.filter((item) => ids.has(item.id));
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
    /trust boundary|limitation|uncertain|does not prove|not establish|evidence stops|scope/.test(text) ||
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
    frame: 0.9,
    data: 1.0,
    geography: 0.9,
    mechanism: 1.15,
    consequence: 1.0,
    governance: 1.0,
    trust_boundary: 0.85,
    synthesis: 1.05,
    closure: 0.65,
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

export function buildLongFormPlan(
  project: EpisodeProject
): LongFormPlan {
  const targetWords = targetWordCount(project);
  const wordsPerMinute = documentaryWordsPerMinute(project);

  const rows = project.scenes.map((scene, index) => ({
    sceneId: scene.id,
    role: roleForScene(project, scene, index),
  }));

  const weightTotal =
    rows.reduce(
      (sum, row) => sum + roleWeight(row.role),
      0
    ) || 1;

  const sceneTargets = rows.map((row) => {
    const raw = Math.round(
      targetWords *
        (roleWeight(row.role) / weightTotal)
    );

    const minimum =
      row.role === "closure" ? 45 :
      row.role === "trust_boundary" ? 65 :
      70;

    const maximum =
      row.role === "hook" ? 125 :
      row.role === "mechanism" ? 155 :
      row.role === "closure" ? 95 :
      140;

    return {
      sceneId: row.sceneId,
      role: row.role,
      targetWords: Math.max(
        minimum,
        Math.min(maximum, raw)
      ),
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

  if (second) {
    return clean(
      `${first.label} records the highest plotted value at ${first.value.toLocaleString(
        undefined,
        { maximumFractionDigits: 1 }
      )}${unit ? ` ${unit}` : ""}, followed by ${second.label} at ${second.value.toLocaleString(
        undefined,
        { maximumFractionDigits: 1 }
      )}${unit ? ` ${unit}` : ""}.`
    );
  }

  return clean(
    `${first.label} records the highest plotted value at ${first.value.toLocaleString(
      undefined,
      { maximumFractionDigits: 1 }
    )}${unit ? ` ${unit}` : ""}.`
  );
}

function mapSentence(scene: Scene) {
  if (!scene.map) return "";

  const labels = scene.map.points
    .slice(0, 4)
    .map((point) => clean(point.label))
    .filter(Boolean);

  if (!labels.length) return "";

  return `The mapped observations are ${labels.join(", ")}.`;
}

function evidenceSentence(
  project: EpisodeProject,
  scene: Scene,
  usedEvidence: Set<string>
) {
  const candidates = evidenceForScene(project, scene)
    .filter((item) => item.kind !== "limitation")
    .map((item) => ({
      item,
      text: readableEvidenceStatement(item.statement),
    }))
    .filter(({ text }) => text.length >= 35);

  for (const candidate of candidates) {
    const key = normaliseSentence(candidate.text);

    if (usedEvidence.has(key)) continue;

    usedEvidence.add(key);

    const text = candidate.text
      .replace(/\bSource\b.*$/i, "")
      .trim();

    if (!text) continue;

    return clean(
      `The evidence indicates that ${text.charAt(0).toLowerCase()}${text.slice(1)}`
    );
  }

  return "";
}

function limitationSentence(
  project: EpisodeProject,
  scene: Scene,
  usedEvidence: Set<string>
) {
  const limitation = evidenceForScene(project, scene)
    .filter((item) => item.kind === "limitation")
    .map((item) => readableEvidenceStatement(item.statement))
    .find((text) => {
      const key = normaliseSentence(text);
      if (!text || usedEvidence.has(key)) return false;
      usedEvidence.add(key);
      return true;
    });

  return limitation
    ? clean(`The limit is important: ${limitation}`)
    : "";
}

function safeExistingNarration(scene: Scene) {
  const text = stripProductionLanguage(scene.narration);

  return sentences(text)
    .filter((sentence) => {
      if (/^(?:source|the source)\b/i.test(sentence)) return false;
      if (/^(?:plate|figure|table|map)\s+\d/i.test(sentence)) return false;
      if (/^the story is built/i.test(sentence)) return false;
      return sentence.length >= 18;
    })
    .join(" ");
}

function sceneBodySentence(scene: Scene) {
  const body = stripProductionLanguage(scene.body);

  if (!body) return "";

  return sentences(body)
    .filter((sentence) => sentence.length >= 20)
    .slice(0, 2)
    .join(" ");
}

function editorialBridge(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole
) {
  const question = clean(project.episode.question);

  switch (role) {
    case "hook":
      return question
        ? `The question is simple to ask: ${question} The answer is not.`
        : "The visible event is simple to describe. The system behind it is not.";

    case "data":
      return "Start with what can be measured.";

    case "geography":
      return "Then put those measurements back on the map.";

    case "mechanism":
      return "The next question is what happens between the trigger and the outcome.";

    case "consequence":
      return "That process matters because its effects are experienced on the ground.";

    case "governance":
      return "But the physical system is only part of the story.";

    case "trust_boundary":
      return "This is where the evidence becomes narrower.";

    case "synthesis":
      return "Taken together, the evidence points to a system rather than a single cause.";

    case "closure":
      return "";

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
    const cleanCandidate = clean(candidate);
    if (!cleanCandidate) continue;

    const numberKey = numericFingerprint(cleanCandidate);

    const duplicate = [...globalSentences, ...accepted].some(
      (existing) =>
        similarity(existing, cleanCandidate) >= 0.68
    );

    if (duplicate) continue;

    if (
      numberKey &&
      globalNumbers.has(numberKey) &&
      /\d/.test(cleanCandidate)
    ) {
      continue;
    }

    accepted.push(cleanCandidate);

    if (numberKey) {
      globalNumbers.add(numberKey);
    }
  }

  globalSentences.push(...accepted);
  return accepted;
}

function trimToWords(
  value: string,
  maxWords: number
) {
  const parts = sentences(value);
  const kept: string[] = [];
  let count = 0;

  for (const sentence of parts) {
    const length = wordCount(sentence);

    if (
      kept.length &&
      count + length > maxWords
    ) {
      break;
    }

    if (
      !kept.length &&
      length > maxWords
    ) {
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
  const existing = safeExistingNarration(scene);
  const body = sceneBodySentence(scene);

  let candidates: string[] = [];

  if (role === "data") {
    candidates = [
      editorialBridge(project, scene, role),
      chartSentence(scene),
      body,
      existing,
      "Those measurements establish the pattern, but they do not by themselves explain the mechanism.",
    ];
  } else if (role === "geography") {
    candidates = [
      editorialBridge(project, scene, role),
      mapSentence(scene),
      body,
      existing,
      "The map shows where the current observations exist; it should not be read as evidence for places the dataset does not cover.",
    ];
  } else if (role === "trust_boundary") {
    candidates = [
      editorialBridge(project, scene, role),
      limitationSentence(project, scene, usedEvidence),
      body,
      existing,
      "That boundary does not weaken the story. It defines how far the conclusion can responsibly travel.",
    ];
  } else if (role === "closure") {
    candidates = [
      existing,
      body,
    ];
  } else {
    candidates = [
      editorialBridge(project, scene, role),
      existing,
      body,
      evidenceSentence(project, scene, usedEvidence),
    ];
  }

  const unique = uniqueSentences(
    candidates.filter(Boolean),
    globalSentences,
    globalNumbers
  );

  const composed = clean(unique.join(" "));
  return trimToWords(
    composed,
    Math.max(45, Math.round(targetWords * 1.08))
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
      narration: stripProductionLanguage(scene.narration),
    }));
  }

  const plan = buildLongFormPlan(project);
  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const usedEvidence = new Set<string>();
  const globalSentences: string[] = [];
  const globalNumbers = new Set<string>();

  return project.scenes.map((scene, index) => {
    const target = targetById.get(scene.id);

    if (!target) {
      return {
        ...scene,
        narration: stripProductionLanguage(scene.narration),
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
        stripProductionLanguage(scene.narration) ||
        stripProductionLanguage(scene.body),
    };
  });
}
