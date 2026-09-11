import type {
  DatasetAnalysis,
  EpisodeProject,
  EvidenceItem,
  Scene,
} from "./types";

export type CoverageLayer =
  | "trigger"
  | "surface_response"
  | "flow_path"
  | "capacity"
  | "blockage"
  | "maintenance"
  | "development"
  | "exposure"
  | "impact"
  | "response"
  | "tradeoff";

export type CoverageBeat = {
  layer: CoverageLayer;
  confidence: number;
  evidenceIds: string[];
  narration: string[];
};

export type MechanismCoveragePlan = {
  beats: CoverageBeat[];
  monthlyContext: string[];
  eventContext: string[];
  warnings: string[];
};

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function normalise(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.%/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function isInternal(value: string) {
  return /current story-grounded evidence|story-grounded evidence|this draft|visual intelligence|retention score|source count|dataset count|the story is built only from evidence/i.test(
    value
  );
}

function isRawAcademic(value: string) {
  const text = clean(value);

  return (
    !text ||
    isInternal(text) ||
    /\b\d+\.\d+(?:\.\d+)?\b/.test(text) ||
    /\bworld meteorological organization\b/i.test(text) ||
    /\bresearch conducted overtime\b/i.test(text) ||
    /\bsteven\s*\(\d{4}\)/i.test(text) ||
    /\baccording to\b.+\(\d{4}\)/i.test(text) ||
    /\bcauses of rising cases\b/i.test(text) ||
    /\bhowever adequate attention has not been given\b/i.test(text) ||
    wordCount(text) > 45
  );
}

function looksLikeForeignCase(value: string) {
  const text = normalise(value);

  const foreignPlaces = [
    "delhi",
    "india",
    "mumbai",
    "chennai",
    "bangladesh",
    "pakistan",
    "china",
    "beijing",
    "london",
    "new york",
    "jakarta",
    "manila",
  ];

  const hasForeignPlace = foreignPlaces.some((place) =>
    text.includes(place)
  );

  const hasLocalAnchor =
    /\bnairobi\b|\bsouth c\b|\bkenya\b|\bdagoretti\b|\bwilson airport\b|\bmoi air base\b/.test(
      text
    );

  return hasForeignPlace && !hasLocalAnchor;
}

function localNarrationEligibility(item: EvidenceItem) {
  const statement = clean(item.statement);

  if (!statement) return false;
  if (looksLikeForeignCase(statement)) return false;

  /*
   * Foreign literature may remain useful as background research, but it must
   * not be narrated as if it were Nairobi evidence.
   */
  return true;
}

function layerScore(layer: CoverageLayer, value: string) {
  const text = normalise(value);

  const patterns: Record<CoverageLayer, RegExp[]> = {
    trigger: [
      /rain/, /rainfall/, /precipitation/, /storm/, /climate/,
    ],
    surface_response: [
      /impervious/, /paved/, /paving/, /roof/, /infiltration/,
      /absorption/, /ground cover/, /built surface/, /sealed surface/,
    ],
    flow_path: [
      /runoff/, /flow path/, /waterway/, /river/, /channel/,
      /natural drainage/, /water can go/, /drainage path/,
    ],
    capacity: [
      /capacity/, /culvert/, /drain size/, /stormwater/,
      /drainage system/, /drainage network/, /infrastructure/,
    ],
    blockage: [
      /waste/, /silt/, /clog/, /blocked/, /blockage/,
      /obstruction/, /solid waste/,
    ],
    maintenance: [
      /maintenance/, /clearing/, /cleaning/, /repair/,
      /county government/, /management/,
    ],
    development: [
      /development/, /urbanization/, /urbanisation/,
      /densification/, /land use/, /building/, /built-up/,
      /ground area covered/, /planning/,
    ],
    exposure: [
      /exposure/, /settlement/, /household/, /people/,
      /damage/, /livelihood/, /road/, /property/, /vehicle/,
    ],
    impact: [
      /submerged/, /stuck/, /flooded road/, /flooded vehicle/,
      /motorist/, /mobility/, /disruption/, /property damage/,
      /road closure/, /loss/,
    ],
    response: [
      /clearing/, /culvert/, /trench/, /maintenance/, /upgrade/,
      /drainage improvement/, /stormwater management/, /development control/,
      /bylaw/, /enforcement/,
    ],
    tradeoff: [
      /trade-off/, /tradeoff/, /development control/, /densification/,
      /upgrade cost/, /land use/, /planning/, /enforcement/,
      /maintenance budget/, /infrastructure investment/,
    ],
  };

  return patterns[layer].reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0),
    0
  );
}

function transformEvidence(
  layer: CoverageLayer,
  value: string
) {
  const text = clean(value)
    .replace(/[.?!]+$/, "")
    .trim();

  if (!text || isInternal(text)) return "";
  if (/^source\s*:/i.test(text)) return "";
  if (/managing flooding in residential areas of nairobi/i.test(text) && wordCount(text) < 18) return "";
  if (looksLikeForeignCase(text)) return "";

  if (/^clogged drainage systems?$/i.test(text)) {
    return "The local case documents clogged drainage, showing that obstruction can reduce the usable capacity of the network.";
  }

  if (/waste.+drainage/i.test(text) && wordCount(text) <= 24) {
    return "The local case documents waste in drainage routes, a condition that can obstruct stormwater movement.";
  }

  const clearing = text.match(
    /drainage systems?\s+being cleared by\s+(.+?)$/i
  );
  if (clearing) {
    return `The source documents drainage clearing by ${clean(
      clearing[1]
    )}, showing that maintenance is part of the local flood response.`;
  }

  const culvert = text.match(
    /culvert(?:\s+and\s+trench)?\s+constructed by\s+(.+?)$/i
  );
  if (culvert) {
    return `The source documents culvert and trench construction by ${clean(
      culvert[1]
    )}, showing a local attempt to improve drainage capacity.`;
  }

  if (
    layer === "surface_response" &&
    /paved.+densification.+infiltration/i.test(text)
  ) {
    return "The local study links paving and denser building coverage with lower infiltration, leaving more rainfall to move across the surface as runoff.";
  }

  if (
    layer === "development" &&
    /ground area covered by buildings|minimize the rate of water infiltration|densification/i.test(
      text
    )
  ) {
    return "The local study describes densification and increasing building coverage as changes that reduce infiltration and place more pressure on stormwater drainage.";
  }

  if (
    layer === "flow_path" &&
    /natural.+channel|drainage.+obstruct|waterway.+obstruct|channel.+obstruct/i.test(
      text
    )
  ) {
    return "The local evidence describes natural drainage routes being altered or obstructed by development, reducing the pathways available for water to move.";
  }

  if (
    layer === "flow_path" &&
    /natural drainage courses.+changed|natural drainage.+changed|reduced capacity for excess water/i.test(
      text
    )
  ) {
    return "The local study describes natural drainage routes being changed by urban development, leaving less capacity for excess water to move safely through the city.";
  }

  if (
    layer === "surface_response" &&
    /urban flooding.+rural flooding|coverage of large parts of the ground|roofs.+roads.+pavements|water absorption rate.+low/i.test(
      text
    )
  ) {
    return "The study explains that as open ground is replaced by roofs, roads and paving, less rainfall can soak into the soil and more becomes surface runoff.";
  }

  if (
    layer === "capacity" &&
    /development.+drainage|drainage.+upgrade|overwhelm|original drain|0\.5/i.test(
      text
    )
  ) {
    return "The local case indicates that development has increased pressure on drainage infrastructure without equivalent upgrades in carrying capacity.";
  }

  if (
    layer === "impact" &&
    /submerged vehicle|motorists stuck|flooded road|flooded .*road|floods? .*road/i.test(
      text
    )
  ) {
    return "The local case documents flooded roads and stranded vehicles, showing how drainage failure can quickly become a mobility and access problem.";
  }

  if (
    layer === "response" &&
    /drainage systems? being cleared|culvert|trench|stormwater management/i.test(
      text
    )
  ) {
    return "The local evidence records drainage clearing and small infrastructure works, showing that restoring flow and improving capacity are part of the practical response.";
  }

  if (
    layer === "tradeoff" &&
    /development control|densification|planning|land use|drainage upgrade/i.test(
      text
    )
  ) {
    return "The evidence points to a planning trade-off: continued urban development increases demand on drainage systems, so growth and stormwater capacity have to be managed together.";
  }

  if (isRawAcademic(text)) return "";

  if (wordCount(text) <= 30) {
    return `The evidence indicates that ${text.charAt(0).toLowerCase()}${text.slice(1)}.`;
  }

  return "";
}

function layerExplanation(layer: CoverageLayer) {
  const text: Record<CoverageLayer, string[]> = {
    trigger: [
      "Rainfall determines how much water enters the urban system and how quickly pressure can build.",
      "But rainfall is a trigger, not the whole mechanism. What matters next is how the city receives, moves and stores that water.",
    ],
    surface_response: [
      "The first transformation happens at the surface. Soil and other permeable ground can absorb part of the rainfall, while roofs, roads and paved compounds leave more water moving across the surface.",
      "As the share of sealed ground increases, a larger proportion of rainfall becomes runoff that must be carried by streets, channels, drains or waterways.",
    ],
    flow_path: [
      "Runoff still needs somewhere to go. Rivers, natural channels, roadside drains and low points form a network of flow paths through the city.",
      "When those pathways remain connected, water can move away. When they are narrowed, obstructed or cut off, accumulation becomes more likely.",
    ],
    capacity: [
      "The next constraint is carrying capacity. A drainage network can move only a finite volume of water at a given time.",
      "If runoff increases while the network remains unchanged, the gap between water arriving and water being carried away can grow.",
    ],
    blockage: [
      "Usable capacity can be smaller than design capacity. Waste, sediment and physical obstruction reduce the space available for water to move.",
      "A drain may therefore exist and still perform below its intended capacity during an intense event.",
    ],
    maintenance: [
      "Maintenance determines whether drainage keeps the capacity it was designed to provide.",
      "Clearing accumulated material, repairing damaged sections and keeping outlets open are therefore part of flood-risk management, not separate from it.",
    ],
    development: [
      "Urban development changes both sides of the equation: it can increase runoff while also changing the infrastructure expected to carry that runoff.",
      "Densification, paving and new construction can therefore raise pressure on stormwater systems unless drainage and land-use controls evolve with them.",
    ],
    exposure: [
      "Water becomes a disaster when it meets exposed people, roads, homes, businesses and public infrastructure.",
      "Flood risk is therefore not only about the physical volume of water; it is also about what lies in the path of that water.",
    ],
    impact: [
      "The consequences become visible when water interrupts movement, damages property or cuts access through the city.",
      "Flooded roads and stranded vehicles show the point where a drainage problem becomes a mobility, access and safety problem.",
      "At that point, the cost of flooding spreads beyond stormwater infrastructure into everyday urban life.",
    ],
    response: [
      "The evidence also points toward practical responses: keeping drainage paths open, restoring blocked sections and increasing capacity where pressure has outgrown the existing network.",
      "Those measures work best when maintenance is continuous rather than only reactive after flooding has already occurred.",
      "The local evidence on drainage clearing and small infrastructure works shows that restoring flow and improving capacity are already part of the practical response.",
    ],
    tradeoff: [
      "There is also a planning trade-off. Nairobi needs housing, roads and continued development, but changes in land cover can increase runoff and add pressure to existing drainage.",
      "Maintenance alone cannot solve a structural mismatch if runoff keeps increasing faster than the network is upgraded.",
      "The response is therefore not simply to build more drains, but to coordinate drainage investment, land-use control, routine maintenance and protection of natural flow paths.",
    ],
  };

  return text[layer];
}

function buildBeat(
  layer: CoverageLayer,
  evidence: EvidenceItem[]
): CoverageBeat {
  const ranked = evidence
    .map((item) => ({
      item,
      score: layerScore(layer, item.statement),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const transformed = ranked
    .map((row) => transformEvidence(layer, row.item.statement))
    .filter(Boolean);

  return {
    layer,
    confidence: ranked.length
      ? Math.min(0.98, 0.58 + ranked[0].score * 0.08)
      : 0.45,
    evidenceIds: ranked.map((row) => row.item.id),
    narration: [
      ...layerExplanation(layer),
      ...transformed.slice(0, 2),
    ],
  };
}

function chartContext(
  dataset: DatasetAnalysis,
  kind: "monthly" | "event"
) {
  const chart = dataset.recommendedChart;
  if (!chart?.data?.length) return [];

  const ranked = [...chart.data]
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);

  const first = ranked[0];
  const second = ranked[1];
  if (!first) return [];

  const unit = clean(chart.unit || chart.yLabel || "");
  const suffix = unit ? ` ${unit}` : "";

  if (kind === "monthly") {
    return [
      second
        ? `Across the broader rainfall record, ${first.label} has the highest plotted total at ${first.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}, followed by ${second.label} at ${second.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}.`
        : `${first.label} has the highest plotted rainfall total at ${first.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}.`,
      "That wider pattern gives the event seasonal context before we zoom into the shorter flood episode.",
    ];
  }

  return [
    second
      ? `During the event comparison, ${first.label} has the highest plotted value at ${first.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}, followed by ${second.label} at ${second.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}.`
      : `${first.label} has the highest plotted event value at ${first.value.toLocaleString(undefined, {maximumFractionDigits: 1})}${suffix}.`,
  ];
}

export function buildMechanismCoveragePlan(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
): MechanismCoveragePlan {
  const evidence = project.evidence.filter(
    (item) =>
      item.kind !== "limitation" &&
      !isInternal(item.statement) &&
      localNarrationEligibility(item)
  );

  const layers: CoverageLayer[] = [
    "trigger",
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
  ];

  const beats = layers.map((layer) =>
    buildBeat(layer, evidence)
  );

  const datasets =
    datasetsOverride ||
    project.datasets ||
    [];

  const monthly = datasets.find((dataset) =>
    /monthly rainfall|month/i.test(
      `${dataset.name} ${dataset.recommendedChart?.title || ""}`
    )
  );

  const event = datasets.find((dataset) =>
    /flood event|event|7-day|seven-day/i.test(
      `${dataset.name} ${dataset.recommendedChart?.title || ""} ${dataset.recommendedChart?.yLabel || ""}`
    )
  );

  const warnings = beats
    .filter((beat) => beat.evidenceIds.length === 0)
    .map(
      (beat) =>
        `No direct source evidence was matched to mechanism layer: ${beat.layer}. Explanation is generic and should not be presented as a Nairobi-specific finding.`
    );

  return {
    beats,
    monthlyContext: monthly
      ? chartContext(monthly, "monthly")
      : [],
    eventContext: event
      ? chartContext(event, "event")
      : [],
    warnings,
  };
}

export function coverageBeatForLayer(
  plan: MechanismCoveragePlan,
  layer: CoverageLayer
) {
  return plan.beats.find((beat) => beat.layer === layer);
}

export function sceneCoverageLayers(
  project: EpisodeProject,
  scene: Scene,
  index: number
): CoverageLayer[] {
  const text = normalise(
    `${scene.eyebrow} ${scene.headline} ${scene.body}`
  );

  const direct = ([
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
  ] as CoverageLayer[])
    .map((layer) => ({
      layer,
      score: layerScore(layer, text),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.layer);

  if (direct.length) return direct.slice(0, 3);

  const nonDataScenes = project.scenes
    .map((candidate, candidateIndex) => ({
      candidate,
      candidateIndex,
    }))
    .filter(
      ({ candidate }) =>
        !candidate.chart &&
        !candidate.map &&
        candidate.kind !== "cta" &&
        candidate.kind !== "quote"
    );

  const ordinal = nonDataScenes.findIndex(
    (row) => row.candidate.id === scene.id
  );

  if (ordinal === 0 || index === 0) {
    return ["trigger", "surface_response"];
  }
  if (ordinal === 1) {
    return ["flow_path", "capacity"];
  }
  if (ordinal === 2) {
    return ["blockage", "development"];
  }
  if (ordinal === 3) {
    return ["maintenance", "exposure"];
  }
  if (ordinal === 4) {
    return ["impact", "response"];
  }
  if (ordinal >= 5) {
    return ["tradeoff"];
  }

  return [];
}
