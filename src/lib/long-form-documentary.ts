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

export type MechanismLayer =
  | "trigger"
  | "surface_response"
  | "flow_path"
  | "capacity"
  | "blockage"
  | "maintenance"
  | "development"
  | "exposure"
  | "unknown";

export type LongFormPlan = {
  targetWords: number;
  wordsPerMinute: number;
  sceneTargets: Array<{
    sceneId: string;
    role: DocumentarySceneRole;
    mechanismLayer: MechanismLayer;
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

function tokens(value: string) {
  const stop = new Set([
    "the","a","an","and","or","of","to","in","on","for","with","from",
    "that","this","these","those","is","are","was","were","be","been",
    "being","it","its","as","at","by","into","than","then","now",
    "evidence","data","scene","story","shows","show","question","answer",
    "system","current","draft","items",
  ]);

  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function overlapScore(a: string, b: string) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });

  return overlap / Math.max(1, Math.min(aa.size, bb.size));
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

  let subject = clean(match[1])
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

  const canonical =
    extractCanonicalFloodQuestion(original) ||
    extractCanonicalFloodQuestion(title);

  if (canonical) return canonical;

  if (original) {
    return original.replace(/[?.!]+$/, "") + "?";
  }

  return title
    ? `What is really driving ${title.replace(/[?.!]+$/, "")}?`
    : "";
}

function stripSourceJunk(value: string) {
  return clean(value)
    .replace(/\b(?:the source is|source:)\s+[^.]+\.?/gi, " ")
    .replace(/\bthe source-backed observation is:\s*/gi, "")
    .replace(/\bthe current interpretation is:\s*/gi, "")
    .replace(/\bone limitation is explicit:\s*/gi, "")
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
    /^(?:drainage systems?|culvert|trench|waste|floods?|motorists?|vehicle|road|map|plate|figure|clogged drainage)\b/i.test(text) &&
    wordCount(text) <= 16
  );
}

function looksLikeRawSource(value: string) {
  const text = clean(value);
  if (!text) return true;
  if (INTERNAL_METADATA.test(text)) return true;
  if (RAW_SOURCE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (/^\s*[a-z]\)\s+/i.test(text)) return true;
  if (/^(?:figure|plate|table|map)\s+\d/i.test(text)) return true;
  if (/\bsource:\b/i.test(text)) return true;
  if (wordCount(text) > 36) return true;
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
  const cleaned = stripSourceJunk(scene.body);

  return splitSentences(cleaned)
    .filter((sentence) => !looksLikeRawSource(sentence))
    .filter((sentence) => !sameAsSceneLabel(scene, sentence))
    .filter((sentence) => wordCount(sentence) >= 5)
    .slice(0, 3)
    .join(" ");
}

function transformCaptionEvidence(value: string) {
  const text = clean(value);

  if (/^clogged drainage systems?$/i.test(text)) {
    return "The local case documents clogged drainage, showing that available drainage capacity can be reduced by obstruction.";
  }

  if (/waste.+drainage/i.test(text)) {
    return "The local case documents poorly disposed waste in drainage, a condition that can obstruct stormwater movement.";
  }

  const clearing = text.match(/drainage systems?\s+being cleared by\s+(.+?)$/i);
  if (clearing) {
    return `The source documents drainage clearing by ${clean(clearing[1])}, showing maintenance as part of the local response.`;
  }

  const culvert = text.match(/culvert(?:\s+and\s+trench)?\s+constructed by\s+(.+?)$/i);
  if (culvert) {
    return `The source documents culvert and trench construction by ${clean(culvert[1])}, showing a local infrastructure response to drainage pressure.`;
  }

  return "";
}

function readableEvidenceStatement(item: EvidenceItem) {
  const raw = stripSourceJunk(item.statement);
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

function evidenceForScene(project: EpisodeProject, scene: Scene) {
  const ids = new Set(scene.factIds || []);
  return project.evidence.filter((item) => ids.has(item.id));
}

function mechanismLayerFromText(value: string): MechanismLayer {
  const text = normalise(value);

  if (/rain|precipitation|storm|trigger|weather/.test(text)) {
    return "trigger";
  }
  if (/impervious|built surface|pavement|roof|infiltration|absorption|ground cover/.test(text)) {
    return "surface_response";
  }
  if (/runoff|flow path|waterway|river|channel|natural drainage|where water can go/.test(text)) {
    return "flow_path";
  }
  if (/capacity|culvert|drain size|stormwater|drainage network|infrastructure/.test(text)) {
    return "capacity";
  }
  if (/waste|silt|clog|block|obstruction|blocked drain/.test(text)) {
    return "blockage";
  }
  if (/maintenance|clearing|cleaning|repair|management/.test(text)) {
    return "maintenance";
  }
  if (/development|urbanization|urbanisation|densification|land use|building|planning/.test(text)) {
    return "development";
  }
  if (/exposure|settlement|household|people|damage|livelihood|road|property/.test(text)) {
    return "exposure";
  }

  return "unknown";
}

export function roleForScene(
  project: EpisodeProject,
  scene: Scene,
  index: number
): DocumentarySceneRole {
  const text = `${scene.eyebrow} ${scene.headline} ${scene.body}`.toLowerCase();

  if (index === 0) return "hook";
  if (scene.kind === "cta") return "closure";
  if (scene.chart || scene.kind === "data_chart") return "data";
  if (scene.map || scene.kind === "map_story") return "geography";

  if (
    /trust boundary|limitation|uncertain|does not prove|still not prove|not establish|scope/.test(text) ||
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
    /mechanism|flow|path|process|driver|cause|chain|interaction|network|cycle|what happens after|turns it into|water can go|built surface|infiltration|runoff|capacity|blockage/.test(text) ||
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
    mechanism: 1.45,
    consequence: 1.0,
    governance: 1.2,
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

  const rows = project.scenes.map((scene, index) => {
    const role = roleForScene(project, scene, index);
    return {
      sceneId: scene.id,
      role,
      mechanismLayer:
        role === "mechanism" || role === "governance" || role === "consequence"
          ? mechanismLayerFromText(
              `${scene.eyebrow} ${scene.headline} ${scene.body}`
            )
          : "unknown" as MechanismLayer,
    };
  });

  const totalWeight =
    rows.reduce((sum, row) => sum + roleWeight(row.role), 0) || 1;

  const sceneTargets = rows.map((row) => {
    const raw = Math.round(
      targetWords * (roleWeight(row.role) / totalWeight)
    );

    const min =
      row.role === "closure" ? 35 :
      row.role === "trust_boundary" ? 85 :
      row.role === "mechanism" ? 120 :
      row.role === "governance" ? 110 :
      90;

    const max =
      row.role === "hook" ? 140 :
      row.role === "mechanism" ? 220 :
      row.role === "governance" ? 190 :
      row.role === "closure" ? 75 :
      170;

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
        ? `${peak.label} records the highest value at ${formatValue(peak.value)}${suffix}, followed by ${second.label} at ${formatValue(second.value)}${suffix}.`
        : `${peak.label} records the highest value at ${formatValue(peak.value)}${suffix}.`,
    ];
  }

  const ranked = [...data].sort((a, b) => b.value - a.value);
  const first = ranked[0];
  const second = ranked[1];

  return [
    second
      ? `${first.label} records the highest plotted value at ${formatValue(first.value)}${suffix}, followed by ${second.label} at ${formatValue(second.value)}${suffix}.`
      : `${first.label} records the highest plotted value at ${formatValue(first.value)}${suffix}.`,
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

function purposeSentence(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole
) {
  switch (role) {
    case "hook": {
      const question = resolvedNarrationQuestion(project);
      return question
        ? `${question} Heavy rain may be part of the answer, but that explanation stops too early.`
        : "The visible event is easy to describe. The system behind it is harder to see.";
    }
    case "data":
      return "Start by measuring the trigger.";
    case "geography":
      return "Now put those measurements on the map.";
    case "mechanism":
      return "To understand the outcome, follow what happens after the trigger enters the system.";
    case "consequence":
      return "The pathway matters because its effects are experienced in real places and by real people.";
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

function mechanismLayerNarration(layer: MechanismLayer) {
  switch (layer) {
    case "surface_response":
      return [
        "What happens at the surface is one of the first turning points. A permeable surface can absorb part of the incoming water, while roofs, roads and other sealed surfaces leave more water moving across the surface.",
        "As the balance shifts toward sealed ground, a larger share of rainfall has to be carried away by streets, channels, drains or natural waterways.",
        "That changes the pressure placed on the rest of the drainage system before any blockage or infrastructure failure is considered.",
      ];
    case "flow_path":
      return [
        "Water then needs a route. Natural channels, roadside drains, rivers and low points together form a network of possible flow paths.",
        "If those paths remain open, water can be transferred away from one location. If they are narrowed, obstructed or disconnected, water is more likely to accumulate.",
        "This is why a flood mechanism is spatial: the same rainfall can behave differently depending on the routes available to it.",
      ];
    case "capacity":
      return [
        "The next question is capacity. Drainage infrastructure is designed to move a finite amount of water, not an unlimited volume.",
        "Capacity depends on dimensions, connectivity and the amount of runoff arriving at the network.",
        "A drainage system built for an earlier pattern of development can face greater pressure as buildings, roads and paved surfaces increase around it.",
      ];
    case "blockage":
      return [
        "Nominal capacity is not the same as usable capacity. Waste, sediment and other obstructions can reduce the space available for water to move.",
        "That means a drain can be present on the ground and still perform below its intended capacity during an intense event.",
        "Blockage therefore acts as an amplifier: it does not create the rainfall, but it can worsen the consequences of the water already arriving.",
      ];
    case "maintenance":
      return [
        "Maintenance determines whether infrastructure keeps the capacity it was designed to provide.",
        "Clearing drains, removing accumulated material and repairing damaged sections are therefore part of flood-risk management, not separate from it.",
        "The practical question is not only whether drainage exists, but whether it is functional when an intense event occurs.",
      ];
    case "development":
      return [
        "Urban development changes both the amount of runoff and the infrastructure expected to carry it.",
        "Densification can add roofs, paved compounds and roads while also changing natural channels and concentrating more people and assets in the same catchment.",
        "If drainage upgrades do not keep pace with those changes, the relationship between rainfall and flood damage can become progressively more severe.",
      ];
    case "exposure":
      return [
        "Even when water accumulates, the scale of disaster depends on what is exposed to it.",
        "Roads, homes, businesses and public infrastructure turn a hydrological event into disruption, loss and risk to people.",
        "Flood risk is therefore a combination of the physical pathway and the concentration of people and assets along that pathway.",
      ];
    case "trigger":
      return [
        "The trigger matters, but it is only the first part of the chain.",
        "Rainfall determines how much water enters the system and how quickly pressure can build.",
        "The final outcome depends on what the urban system does with that water once it arrives.",
      ];
    default:
      return [
        "A trigger does not act in isolation. The outcome depends on what the system can absorb, move, store or release after that trigger arrives.",
        "Where movement remains open and capacity is sufficient, pressure can dissipate. Where pathways are constrained, water can accumulate.",
        "The mechanism therefore sits between the initial event and the visible damage.",
      ];
  }
}

function roleAnalysis(role: DocumentarySceneRole) {
  switch (role) {
    case "hook":
      return [
        "A flood is a visible event, but the causes sit upstream of what the viewer finally sees.",
        "The useful question is not simply whether it rained, but how the city transformed rainfall into runoff, accumulation and exposure.",
      ];
    case "data":
      return [
        "These measurements establish the intensity of the event at the locations that were actually observed.",
        "They tell us when and where rainfall was large enough to matter, but they do not reveal how drainage performed at every street.",
        "Rainfall is therefore necessary context, not a complete explanation.",
      ];
    case "geography":
      return [
        "Geography matters because measurements only describe the places where observations actually exist.",
        "A small set of points can reveal where observations were taken, but it is not a continuous flood-risk surface for the whole city.",
        "A mapped point is evidence of an observation location, not proof that the same conditions apply everywhere around it.",
      ];
    case "governance":
      return [
        "Capacity on paper and capacity in practice are not the same thing.",
        "Maintenance, enforcement, infrastructure investment and development control all shape how the physical system performs over time.",
      ];
    case "trust_boundary":
      return [
        "That limit does not weaken the explanation; it defines how far the conclusion can responsibly travel.",
        "A detailed local case can reveal a mechanism without proving that the same combination of factors operates everywhere else.",
        "The responsible conclusion is therefore narrower than the strongest possible claim.",
      ];
    case "synthesis":
      return [
        "The strongest explanation connects the trigger, the surface response, the flow path, available capacity, maintenance and exposure.",
        "The visible flood is therefore the end of a chain, not the whole explanation.",
      ];
    default:
      return [];
  }
}

function relatedEvidence(
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
    ...explicit.map((item) => ({ item, score: 1000 })),
    ...project.evidence
      .filter((item) => !explicitIds.has(item.id))
      .map((item) => ({
        item,
        score: overlapScore(sceneText, item.statement) * 100,
      }))
      .filter((row) => row.score >= 26),
  ]
    .filter(({ item }) =>
      kind === "limitation"
        ? item.kind === "limitation"
        : item.kind !== "limitation"
    )
    .map(({ item, score }) => ({
      score,
      text: readableEvidenceStatement(item),
    }))
    .filter((row) => row.text)
    .filter((row) => !usedEvidence.has(normalise(row.text)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  candidates.forEach((row) => {
    usedEvidence.add(normalise(row.text));
  });

  return candidates.map((row) => row.text);
}

function evidenceSentence(text: string, role: DocumentarySceneRole, index: number) {
  const statement = clean(text).replace(/[.?!]+$/, "");

  if (/^the (?:source|local case) documents\b/i.test(statement)) {
    return `${statement}.`;
  }

  if (role === "trust_boundary") {
    return index === 0
      ? `One important boundary is that ${lowerFirst(statement)}.`
      : `A second limitation is that ${lowerFirst(statement)}.`;
  }

  return index === 0
    ? `The evidence indicates that ${lowerFirst(statement)}.`
    : `A related observation is that ${lowerFirst(statement)}.`;
}

function selectUnique(
  candidates: string[],
  scene: Scene,
  globalSentences: string[]
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

    const duplicate = [...globalSentences, ...accepted].some(
      (existing) =>
        similarity(existing, text) >=
        (Math.min(wordCount(existing), wordCount(text)) <= 12 ? 0.48 : 0.56)
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

function composeScene(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole,
  mechanismLayer: MechanismLayer,
  targetWords: number,
  usedEvidence: Set<string>,
  globalSentences: string[]
) {
  const body = readableBody(scene);

  const evidenceKind =
    role === "trust_boundary"
      ? "limitation"
      : "observation";

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
      ? relatedEvidence(
          project,
          scene,
          usedEvidence,
          evidenceKind,
          evidenceLimit
        )
      : [];

  const evidenceSentences = evidence.map((item, index) =>
    evidenceSentence(item, role, index)
  );

  let candidates: string[] = [
    purposeSentence(project, scene, role),
  ];

  if (role === "data") {
    candidates.push(...chartFacts(scene), ...roleAnalysis(role));
  } else if (role === "geography") {
    candidates.push(...mapFacts(scene), ...roleAnalysis(role));
  } else if (role === "mechanism") {
    candidates.push(
      body,
      ...mechanismLayerNarration(mechanismLayer),
      ...evidenceSentences
    );
  } else if (role === "trust_boundary") {
    candidates.push(
      ...evidenceSentences,
      body,
      ...roleAnalysis(role)
    );
  } else if (role === "governance") {
    candidates.push(
      body,
      ...mechanismLayerNarration(mechanismLayer),
      ...evidenceSentences,
      ...roleAnalysis(role)
    );
  } else if (role === "synthesis") {
    candidates.push(body, ...roleAnalysis(role));
  } else if (role === "closure") {
    candidates = [];
  } else {
    candidates.push(body, ...evidenceSentences, ...roleAnalysis(role));
  }

  const selected = selectUnique(
    candidates.filter(Boolean),
    scene,
    globalSentences
  );

  return trimToWords(
    selected.join(" "),
    Math.max(70, Math.round(targetWords * 1.08))
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
    return project.scenes;
  }

  const plan = buildLongFormPlan(project);
  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const usedEvidence = new Set<string>();
  const globalSentences: string[] = [];

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
        target.mechanismLayer,
        target.targetWords,
        usedEvidence,
        globalSentences
      ),
    };
  });
}
