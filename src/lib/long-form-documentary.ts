import type {
  DatasetAnalysis,
  EpisodeProject,
  EvidenceItem,
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

const INTERNAL_METADATA =
  /current story-grounded evidence|story-grounded evidence|evidence items?|current story|this draft|draft contains|scene \d+|visual intelligence|retention score|source count|dataset count/i;

const RAW_SOURCE_PATTERNS = [
  /\b\d+\.\d+(?:\.\d+)?\b/,
  /\bworld meteorological organization\b/i,
  /\bresearch conducted overtime\b/i,
  /\bconducted over time based on disasters\b/i,
  /\bcauses of rising cases\b/i,
  /\bsummarized a number of climatological changes\b/i,
  /\bhowever adequate attention has not been given\b/i,
  /\burban flooding is significantly differs\b/i,
  /\bthis has built up by the fact that\b/i,
  /\banother form of .* identified takes place when\b/i,
  /\bapart from the rising of\b/i,
  /\bon top of the storm\b/i,
  /\bsecondly,\s*flooding has been seen over time as either\b/i,
];

const PRODUCTION_LANGUAGE =
  /a strong explanation has to|observed\s*≠\s*inferred|evidence before aesthetics|the story is built only from evidence|the analytical value of this scene|the point of the chart is not decoration|location is not decoration|source-backed observation|current interpretation/i;

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function lowerFirst(value: string) {
  const text = clean(value);
  return text
    ? `${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : "";
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

function tokenise(value: string) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for",
    "with", "from", "that", "this", "these", "those", "is", "are",
    "was", "were", "be", "been", "being", "it", "its", "as", "at",
    "by", "into", "than", "then", "now", "evidence", "data", "scene",
    "story", "shows", "show", "question", "answer", "system", "current",
    "draft", "items",
  ]);

  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function overlapScore(a: string, b: string) {
  const aa = new Set(tokenise(a));
  const bb = new Set(tokenise(b));

  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });

  return overlap / Math.max(1, Math.min(aa.size, bb.size));
}

function semanticSimilarity(a: string, b: string) {
  const aa = new Set(tokenise(a));
  const bb = new Set(tokenise(b));

  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });

  const union = new Set([...aa, ...bb]).size;
  return union ? overlap / union : 0;
}

function numbers(value: string) {
  return clean(value).match(/\b\d+(?:\.\d+)?\b/g) || [];
}

function conceptKey(value: string) {
  const text = normalise(value);

  if (
    /follow .*(trigger|cause).*(outcome|damage)|follow .*mechanism|between .*trigger .*outcome|pathway/.test(
      text
    )
  ) {
    return "pathway";
  }

  if (
    /put .*measurements .*map|put .*evidence .*place|mapped observations|geographic context/.test(
      text
    )
  ) {
    return "map-transition";
  }

  if (
    /start with what can be measured|what can be measured|measure the trigger|measuring the trigger/.test(
      text
    )
  ) {
    return "measure-transition";
  }

  if (
    /does not prove|cannot establish|limitation|boundary|should not be read as evidence/.test(
      text
    )
  ) {
    return "trust-boundary";
  }

  if (
    /single cause|rather than one cause|rather than a single cause|system rather than/.test(
      text
    )
  ) {
    return "system-synthesis";
  }

  return "";
}

function extractCanonicalFloodQuestion(value: string) {
  const text = clean(value);

  /*
   * Search anywhere in a stylised title/question, but stop at "flood/floods".
   * This deliberately ignores trailing generated text such as
   * "interact to produce the outcome we see".
   */
  const match = text.match(/\bwhy\s+(.+?)\s+floods?\b/i);
  if (!match) return "";

  let subject = clean(match[1]);

  subject = subject
    .replace(/^(?:the hidden system behind|the system behind)\s+/i, "")
    .replace(/^(?:does|do)\s+/i, "")
    .trim();

  if (!subject) return "";

  return `Why does ${subject} flood so often?`;
}

export function resolvedNarrationQuestion(project: EpisodeProject) {
  const original = clean(project.episode.question);
  const title = clean(project.episode.workingTitle);

  const canonical =
    extractCanonicalFloodQuestion(original) ||
    extractCanonicalFloodQuestion(title);

  if (canonical) return canonical;

  const malformed =
    /forces behind\s+why\b/i.test(original) ||
    /how do the forces behind/i.test(original) ||
    /produce the outcome we see/i.test(original) ||
    /^what is really driving the hidden system behind why/i.test(original);

  if (original && !malformed) {
    return original.replace(/[?.!]+$/, "") + "?";
  }

  if (original) {
    const embeddedWhy = original.match(/\bwhy\s+(.+)/i)?.[0];
    if (embeddedWhy) {
      return embeddedWhy.replace(/[?.!]+$/, "") + "?";
    }
  }

  if (title) {
    const embeddedWhy = title.match(/\bwhy\s+(.+)/i)?.[0];
    if (embeddedWhy) {
      return embeddedWhy.replace(/[?.!]+$/, "") + "?";
    }

    return `What is really driving ${title.replace(/[?.!]+$/, "")}?`;
  }

  return "";
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
    .replace(/\ba strong explanation has to move from the visible event[^.]*\.?/gi, " ")
    .replace(/\bcurrent story-grounded evidence[^.]*\.?/gi, " ")
    .replace(/\bstory-grounded evidence[^.]*\.?/gi, " ")
    .replace(/\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi, "")
    .replace(/^\s*[a-z]\)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceLooksLikeCaption(value: string) {
  const text = clean(value);

  return (
    /^(?:drainage systems?|culvert|trench|waste|floods?|motorists?|vehicle|road|map|plate|figure)\b/i.test(
      text
    ) &&
    !/[.!?].+[A-Za-z]/.test(text)
  );
}

function looksLikeRawSource(value: string) {
  const text = clean(value);

  if (!text) return true;
  if (INTERNAL_METADATA.test(text)) return true;
  if (PRODUCTION_LANGUAGE.test(text)) return true;
  if (RAW_SOURCE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (/^\s*[a-z]\)\s+/i.test(text)) return true;
  if (/^(?:figure|plate|table|map)\s+\d/i.test(text)) return true;
  if (/\bsource:\b/i.test(text)) return true;
  if (wordCount(text) > 34) return true;

  return false;
}

function sameAsSceneLabel(scene: Scene, value: string) {
  const candidate = normalise(value);
  if (!candidate) return true;

  return (
    candidate === normalise(scene.headline) ||
    candidate === normalise(scene.eyebrow)
  );
}

function readableBody(scene: Scene) {
  const cleaned = stripProductionLanguage(scene.body);

  return splitSentences(cleaned)
    .filter((sentence) => !looksLikeRawSource(sentence))
    .filter((sentence) => !sameAsSceneLabel(scene, sentence))
    .filter((sentence) => wordCount(sentence) >= 5)
    .slice(0, 3)
    .join(" ");
}

function readableSourceExcerpt(scene: Scene) {
  const text = stripProductionLanguage(scene.sourceExcerpt || "");
  if (
    !text ||
    looksLikeRawSource(text) ||
    sameAsSceneLabel(scene, text) ||
    sourceLooksLikeCaption(text)
  ) {
    return "";
  }
  return text;
}

function evidenceForScene(project: EpisodeProject, scene: Scene) {
  const ids = new Set(scene.factIds || []);
  return project.evidence.filter((item) => ids.has(item.id));
}

function transformCaptionEvidence(value: string) {
  const text = clean(value);

  if (/waste.+drainage/i.test(text)) {
    return "The source documents poorly disposed waste in the drainage system, a condition that can obstruct the movement of stormwater.";
  }

  const clearing = text.match(
    /drainage systems?\s+being cleared by\s+(.+?)[.!?]?$/i
  );
  if (clearing) {
    return `The source documents drainage clearing by ${clean(
      clearing[1]
    )}, showing that maintenance is part of the local response.`;
  }

  const culvert = text.match(
    /culvert(?:\s+and\s+trench)?\s+constructed by\s+(.+?)[.!?]?$/i
  );
  if (culvert) {
    return `The source documents culvert and trench construction by ${clean(
      culvert[1]
    )}, showing a local infrastructure response to drainage pressure.`;
  }

  return "";
}

function readableEvidenceStatement(item: EvidenceItem) {
  const raw = stripProductionLanguage(item.statement);
  const transformed = transformCaptionEvidence(raw);

  if (transformed) return transformed;

  if (
    !raw ||
    raw.length < 20 ||
    looksLikeRawSource(raw) ||
    sourceLooksLikeCaption(raw)
  ) {
    return "";
  }

  return raw;
}

function relatedEvidenceForScene(
  project: EpisodeProject,
  scene: Scene,
  usedEvidence: Set<string>,
  kind: "observation" | "limitation",
  limit: number
) {
  const sceneText =
    `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.sourceExcerpt || ""}`;

  const explicit = evidenceForScene(project, scene);
  const explicitIds = new Set(explicit.map((item) => item.id));

  const candidates = [
    ...explicit.map((item) => ({
      item,
      priority: 1000,
    })),
    ...project.evidence
      .filter((item) => !explicitIds.has(item.id))
      .map((item) => ({
        item,
        priority: overlapScore(sceneText, item.statement) * 100,
      }))
      .filter((row) => row.priority >= 30),
  ]
    .filter(({ item }) =>
      kind === "limitation"
        ? item.kind === "limitation"
        : item.kind !== "limitation"
    )
    .map(({ item, priority }) => ({
      item,
      priority,
      text: readableEvidenceStatement(item),
    }))
    .filter((row) => row.text)
    .filter((row) => !usedEvidence.has(normalise(row.text)))
    .sort((a, b) => {
      const observedA = a.item.kind === "observed" ? 12 : 0;
      const observedB = b.item.kind === "observed" ? 12 : 0;
      return b.priority + observedB - (a.priority + observedA);
    });

  const selected = candidates.slice(0, limit);

  selected.forEach((row) => {
    usedEvidence.add(normalise(row.text));
  });

  return selected.map((row) => row.text);
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

  if (scene.chart || scene.kind === "data_chart") {
    return "data";
  }

  if (scene.map || scene.kind === "map_story") {
    return "geography";
  }

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
    /impact|consequence|people|community|household|worker|farmer|health|livelihood|loss|damage|exposure/.test(
      text
    )
  ) {
    return "consequence";
  }

  if (
    /mechanism|flow|path|process|driver|cause|chain|interaction|network|cycle|what happens after|turns it into|water can go|built surface|infiltration|runoff/.test(
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
    frame: 0.9,
    data: 1.0,
    geography: 0.9,
    mechanism: 1.3,
    consequence: 1.0,
    governance: 1.15,
    trust_boundary: 0.85,
    synthesis: 1.05,
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

export function buildLongFormPlan(
  project: EpisodeProject
): LongFormPlan {
  const targetWords = targetWordCount(project);
  const wordsPerMinute = documentaryWordsPerMinute(project);

  const rows = project.scenes.map((scene, index) => ({
    sceneId: scene.id,
    role: roleForScene(project, scene, index),
  }));

  const totalWeight =
    rows.reduce(
      (sum, row) => sum + roleWeight(row.role),
      0
    ) || 1;

  const sceneTargets = rows.map((row) => {
    const raw = Math.round(
      targetWords * (roleWeight(row.role) / totalWeight)
    );

    const min =
      row.role === "closure"
        ? 35
        : row.role === "trust_boundary"
          ? 80
          : 90;

    const max =
      row.role === "hook"
        ? 135
        : row.role === "mechanism"
          ? 190
          : row.role === "governance"
            ? 175
            : row.role === "closure"
              ? 75
              : 160;

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

function formatValue(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function chartFacts(scene: Scene) {
  const chart = scene.chart;
  if (!chart) return [];

  const data = chart.data.filter((item) =>
    Number.isFinite(item.value)
  );

  if (!data.length) return [];

  const unit = clean(chart.unit || chart.yLabel || "");
  const suffix = unit ? ` ${unit}` : "";

  if (chart.type === "line") {
    const ranked = [...data].sort((a, b) => b.value - a.value);
    const peak = ranked[0];
    const second = ranked[1];

    return [
      "Across the plotted period, the pattern is uneven rather than a simple rise or fall.",
      second
        ? `${peak.label} records the highest value at ${formatValue(
            peak.value
          )}${suffix}, followed by ${second.label} at ${formatValue(
            second.value
          )}${suffix}.`
        : `${peak.label} records the highest value at ${formatValue(
            peak.value
          )}${suffix}.`,
    ];
  }

  const ranked = [...data].sort((a, b) => b.value - a.value);
  const first = ranked[0];
  const second = ranked[1];

  return [
    second
      ? `${first.label} records the highest plotted value at ${formatValue(
          first.value
        )}${suffix}, followed by ${second.label} at ${formatValue(
          second.value
        )}${suffix}.`
      : `${first.label} records the highest plotted value at ${formatValue(
          first.value
        )}${suffix}.`,
  ];
}

function mapFacts(scene: Scene) {
  if (!scene.map) return [];

  const labels = scene.map.points
    .slice(0, 4)
    .map((point) => clean(point.label))
    .filter(Boolean);

  const count = scene.map.points.length;

  return [
    labels.length
      ? `The dataset places ${count} observations on the map, including ${labels.join(
          ", "
        )}.`
      : `The dataset places ${count} observations on the map.`,
  ];
}

function purposeSentence(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole
) {
  const body = readableBody(scene);

  switch (role) {
    case "hook": {
      const question = resolvedNarrationQuestion(project);
      return question
        ? `${question} Heavy rain may be part of the answer, but that explanation stops too early.`
        : "The visible event is easy to describe. The system behind it is harder to see.";
    }

    case "frame":
      return body;

    case "data":
      return "Start by measuring the trigger.";

    case "geography":
      return "Now put those measurements on the map.";

    case "mechanism":
      return "To understand the outcome, follow what happens after the trigger enters the system.";

    case "consequence":
      return "That pathway matters because its effects are experienced in real places and by real people.";

    case "governance":
      return "Infrastructure only works as a system when it is maintained, managed and matched to the pressures placed on it.";

    case "trust_boundary":
      return "This is where the evidence becomes narrower.";

    case "synthesis":
      return "Taken together, the evidence points to a chain of conditions rather than one simple cause.";

    default:
      return "";
  }
}

function analysisSentences(role: DocumentarySceneRole) {
  switch (role) {
    case "hook":
      return [
        "A flood is a visible event, but the causes sit upstream of what the viewer finally sees.",
        "The useful question is therefore not simply whether it rained, but how rainfall moved through the city and what conditions amplified it.",
        "That means separating the trigger from the pathway, and the pathway from the final damage.",
      ];

    case "data":
      return [
        "These measurements establish the intensity of the event at the locations that were actually observed.",
        "They tell us when and where rainfall was large enough to matter, but they do not tell us how much water reached each street or how drainage performed at every location.",
        "Rainfall is therefore necessary context, not a complete explanation.",
      ];

    case "geography":
      return [
        "Geography matters because measurements only describe the places where observations actually exist.",
        "Three points can reveal a spatial pattern in the observations, but they are not a continuous flood-risk surface for the whole city.",
        "A mapped point is evidence of an observation location, not proof that the same conditions apply everywhere around it.",
      ];

    case "mechanism":
      return [
        "A trigger does not act in isolation. The outcome depends on what the system can absorb, move, store or release after that trigger arrives.",
        "Where movement remains open and capacity is sufficient, pressure can dissipate. Where pathways are constrained, water can accumulate and the same rainfall can produce a very different result.",
        "The mechanism therefore sits between the weather event and the visible flood.",
      ];

    case "consequence":
      return [
        "That is where a physical process becomes a social and economic outcome.",
        "Exposure matters because the consequences depend not only on the hazard but also on who, what and which places sit in its path.",
      ];

    case "governance":
      return [
        "Capacity on paper and capacity in practice are not the same thing.",
        "A drain can exist and still perform poorly if maintenance, blockage, connectivity or surrounding development changes how water reaches it.",
        "Management therefore affects the effective capacity of infrastructure over time, not just whether infrastructure is present.",
      ];

    case "trust_boundary":
      return [
        "That limit does not weaken the explanation; it defines how far the conclusion can responsibly travel.",
        "A detailed local case can reveal a mechanism without proving that the same combination of factors operates everywhere else.",
        "The responsible conclusion is therefore narrower than the strongest possible claim.",
      ];

    case "synthesis":
      return [
        "The strongest explanation connects the trigger, the pathway, the conditions that amplify it and the places exposed to the result.",
        "Rainfall starts the sequence, but surfaces, waterways, drainage, maintenance and exposure shape what happens next.",
        "The visible flood is therefore the end of a chain, not the whole explanation.",
      ];

    default:
      return [];
  }
}

function paraphraseEvidence(
  text: string,
  role: DocumentarySceneRole,
  index: number
) {
  const statement = clean(text).replace(/[.?!]+$/, "");

  if (!statement) return "";

  if (
    /^the source documents\b/i.test(statement) ||
    /^the source shows\b/i.test(statement)
  ) {
    return `${statement}.`;
  }

  if (role === "trust_boundary") {
    return index === 0
      ? `One important boundary is that ${lowerFirst(statement)}.`
      : `A second limitation is that ${lowerFirst(statement)}.`;
  }

  if (role === "mechanism") {
    return index === 0
      ? `At this point in the pathway, the evidence indicates that ${lowerFirst(statement)}.`
      : `A related observation is that ${lowerFirst(statement)}.`;
  }

  if (role === "governance") {
    return index === 0
      ? `The local evidence adds another layer: ${lowerFirst(statement)}.`
      : `It also indicates that ${lowerFirst(statement)}.`;
  }

  return index === 0
    ? `The evidence indicates that ${lowerFirst(statement)}.`
    : `A related observation is that ${lowerFirst(statement)}.`;
}

function selectUnique(
  candidates: string[],
  scene: Scene,
  globalSentences: string[],
  globalConcepts: Set<string>,
  usedNumbers: Set<string>
) {
  const accepted: string[] = [];

  for (const candidate of candidates.flatMap(splitSentences)) {
    const text = clean(candidate);

    if (
      !text ||
      looksLikeRawSource(text) ||
      sameAsSceneLabel(scene, text)
    ) {
      continue;
    }

    const concept = conceptKey(text);
    if (concept && globalConcepts.has(concept)) {
      continue;
    }

    const duplicate = [...globalSentences, ...accepted].some(
      (existing) => {
        const score = semanticSimilarity(existing, text);
        const shorter = Math.min(
          wordCount(existing),
          wordCount(text)
        );

        return score >= (shorter <= 12 ? 0.46 : 0.56);
      }
    );

    if (duplicate) continue;

    const candidateNumbers = numbers(text);
    if (
      candidateNumbers.length > 0 &&
      candidateNumbers.every((value) => usedNumbers.has(value))
    ) {
      /*
       * Do not restate an already-spoken number in a second sentence unless
       * the sentence introduces a genuinely new measured value.
       */
      continue;
    }

    accepted.push(text);

    if (concept) {
      globalConcepts.add(concept);
    }

    candidateNumbers.forEach((value) => usedNumbers.add(value));
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
  globalConcepts: Set<string>,
  usedNumbers: Set<string>
) {
  const body = readableBody(scene);
  const excerpt = readableSourceExcerpt(scene);

  const evidenceKind =
    role === "trust_boundary"
      ? "limitation"
      : "observation";

  /*
   * Quantitative scenes should be narrated from their actual chart/map,
   * not from loosely related dataset evidence that can repeat or confuse
   * the numbers already on screen.
   */
  const evidenceLimit =
    role === "data" || role === "geography"
      ? 0
      : role === "mechanism" || role === "governance"
        ? 4
        : role === "trust_boundary"
          ? 3
          : 2;

  const evidence =
    evidenceLimit > 0
      ? relatedEvidenceForScene(
          project,
          scene,
          usedEvidence,
          evidenceKind,
          evidenceLimit
        )
      : [];

  const evidenceSentences = evidence.map((item, index) =>
    paraphraseEvidence(item, role, index)
  );

  let candidates: string[] = [];

  if (role === "hook") {
    candidates = [
      purposeSentence(project, scene, role),
      ...analysisSentences(role),
      body,
      excerpt,
      ...evidenceSentences,
    ];
  } else if (role === "data") {
    candidates = [
      purposeSentence(project, scene, role),
      ...chartFacts(scene),
      ...analysisSentences(role),
    ];
  } else if (role === "geography") {
    candidates = [
      purposeSentence(project, scene, role),
      ...mapFacts(scene),
      ...analysisSentences(role),
    ];
  } else if (role === "trust_boundary") {
    candidates = [
      purposeSentence(project, scene, role),
      ...evidenceSentences,
      excerpt,
      body,
      ...analysisSentences(role),
    ];
  } else if (role === "closure") {
    candidates = [];
  } else {
    candidates = [
      purposeSentence(project, scene, role),
      body,
      excerpt,
      ...evidenceSentences,
      ...analysisSentences(role),
    ];
  }

  const selected = selectUnique(
    candidates.filter(Boolean),
    scene,
    globalSentences,
    globalConcepts,
    usedNumbers
  );

  return trimToWords(
    selected.join(" "),
    Math.max(65, Math.round(targetWords * 1.08))
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
    return project.scenes.map((scene, index) => {
      const role = roleForScene(project, scene, index);
      const body = readableBody(scene);

      return {
        ...scene,
        narration:
          purposeSentence(project, scene, role) ||
          body ||
          "",
      };
    });
  }

  const plan = buildLongFormPlan(project);

  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const usedEvidence = new Set<string>();
  const globalSentences: string[] = [];
  const globalConcepts = new Set<string>();
  const usedNumbers = new Set<string>();

  return project.scenes.map((scene) => {
    const target = targetById.get(scene.id);

    if (!target) {
      return {
        ...scene,
        narration: readableBody(scene),
      };
    }

    return {
      ...scene,
      narration: composeScene(
        project,
        scene,
        target.role,
        target.targetWords,
        usedEvidence,
        globalSentences,
        globalConcepts,
        usedNumbers
      ),
    };
  });
}
