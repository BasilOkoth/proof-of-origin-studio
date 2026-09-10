export type EvidenceKind = "observed" | "inference" | "limitation";

export type StoryMode =
  | "hps"
  | "experiment"
  | "research"
  | "report"
  | "investigation"
  | "explainer"
  | "case_study"
  | "world_explained";

export type EvidenceSourceType =
  | "paper"
  | "report"
  | "dataset"
  | "field"
  | "web"
  | "interview"
  | "hps"
  | "other";

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  statement: string;
  source?: string;
  sourceType?: EvidenceSourceType;
  sourceLabel?: string;
  sourcePage?: number;
  year?: number;
  value?: number;
  unit?: string;
  category?: string;
  latitude?: number;
  longitude?: number;
};

export type EvidenceAsset = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  sourceLabel?: string;
  sourceType?: EvidenceSourceType;
  visualEvidenceVersion?: string;
};

export type NarrationWord = {
  text: string;
  startSec: number;
  endSec: number;
};

export type NarrationSentence = {
  id: string;
  sceneId: string;
  text: string;
  startSec: number;
  endSec: number;
  words: NarrationWord[];
};

export type NarrationTrack = {
  provider: "elevenlabs" | "estimated";
  voiceId?: string;
  modelId?: string;
  audioDataUrl?: string;
  mimeType?: string;
  durationSec: number;
  generatedAt: string;
  sentences: NarrationSentence[];
  captionStyle: "kinetic";
};

export type HpsDetectedChange = {
  kind: "value" | "text" | "unknown";
  category?: "currency" | "percentage" | "date" | "number" | "text";
  label?: string;
  before?: string;
  after?: string;
  raw: string;
};

export type HpsIngestion = {
  rawText: string;
  sourceUrl?: string;
  recordId?: string;
  relationship?: string;
  relationshipConfidence?: number;
  assetIdentity?: string;
  textIntegrity?: string;
  registrySignature?: string;
  creatorSignature?: string;
  status?: string;
  simHashSimilarity?: number;
  criticalStatus?: string;
  matchedCriticalValues?: number;
  registeredCriticalValues?: number;
  registeredValuesNotMatched?: number;
  candidateValuesNotExplained?: number;
  detectedChanges: HpsDetectedChange[];
  observations: string[];
  limitations: string[];
};

export type ChartType = "bar" | "line" | "scatter" | "ranking";

export type ChartDatum = {
  label: string;
  value: number;
  x?: number;
  group?: string;
};

export type ChartSpec = {
  type: ChartType;
  title: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  data: ChartDatum[];
  sourceLabel?: string;
};

export type MapPoint = {
  label: string;
  latitude: number;
  longitude: number;
  value?: number;
  note?: string;
};

export type MapLineLayer = {
  id: string;
  kind: "line";
  label?: string;
  coordinates: Array<[number, number]>;
  value?: number;
  sourceLabel?: string;
};

export type MapPolygonLayer = {
  id: string;
  kind: "polygon";
  label?: string;
  coordinates: Array<Array<[number, number]>>;
  value?: number;
  sourceLabel?: string;
};

export type MapPointLayer = {
  id: string;
  kind: "point";
  label?: string;
  points: MapPoint[];
  sourceLabel?: string;
};

export type MapLayerSpec =
  | MapLineLayer
  | MapPolygonLayer
  | MapPointLayer;

export type MapCameraSpec = {
  centerLatitude?: number;
  centerLongitude?: number;
  zoom?: number;
  overviewZoom?: number;
};

export type MapSpec = {
  title: string;
  subtitle?: string;
  points: MapPoint[];
  sourceLabel?: string;
  focus?: "world" | "africa" | "custom";
  basemap?: "openstreetmap" | "none";
  camera?: MapCameraSpec;
  layers?: MapLayerSpec[];
  attribution?: string;
  pointMode?: "symbols" | "heat";
};

export type VisualKind =
  | "evidence_card"
  | "source_highlight"
  | "data_chart"
  | "map_story"
  | "timeline"
  | "comparison"
  | "systems_diagram"
  | "field_evidence"
  | "quote"
  | "minimal";

export type VisualPlan = {
  kind: VisualKind;
  reason: string;
  evidenceIds: string[];
  confidence: number;
};

export type SceneKind =
  | "hook"
  | "document"
  | "value_swap"
  | "proof_card"
  | "confidence"
  | "timeline"
  | "diagram"
  | "quote"
  | "cta"
  | "data_chart"
  | "map_story"
  | "source_highlight";

export type RetentionBeat = {
  atSec: number;
  type:
    | "hook"
    | "open_loop"
    | "pattern_interrupt"
    | "proof"
    | "payoff"
    | "reset"
    | "cta";
  label: string;
};

export type RetentionScore = {
  overall: number;
  hook: number;
  pacing: number;
  proofDensity: number;
  curiosity: number;
  clarity: number;
  warnings: string[];
  beats: RetentionBeat[];
};

export type Scene = {
  id: string;
  kind: SceneKind;
  durationSec: number;
  eyebrow: string;
  headline: string;
  body: string;
  narration: string;
  factIds: string[];
  assetId?: string;
  before?: string;
  after?: string;
  metric?: number;
  retentionPurpose?: string;
  visualPlan?: VisualPlan;
  chart?: ChartSpec;
  map?: MapSpec;
  sourceLabel?: string;
  sourceExcerpt?: string;
  visualLabels?: string[];
  autoVisual?: boolean;
};

export type ThumbnailConcept = {
  title: string;
  kicker: string;
  visual: string;
};

export type VisualIntelligenceScore = {
  overall: number;
  evidenceDensity: number;
  visualVariation: number;
  geographicContext: number;
  dataStorytelling: number;
  sourceVisibility: number;
  warnings: string[];
};

export type DatasetAnalysis = {
  name: string;
  rowCount: number;
  columns: string[];
  numericColumns: string[];
  dateColumns: string[];
  latitudeColumn?: string;
  longitudeColumn?: string;
  recommendedChart?: ChartSpec;
  recommendedMap?: MapSpec;
  insight?: string;
  analysisVersion?: string;
  sourceKind?: "csv" | "xlsx" | "geojson" | "legacy";
  sourceText?: string;
};

export type DocumentIngestion = {
  fileName: string;
  kind: "research" | "report" | "text";
  title: string;
  extractedCharacters: number;
  suggestedTopic: string;
  suggestedQuestion: string;
  suggestedBrief: string;
  evidence: EvidenceItem[];
};

export type EpisodeProject = {
  version: "origin-studio-1";
  id: string;
  createdAt: string;
  brand: {
    channelName: string;
    byline: string;
    accentLabel: string;
  };
  episode: {
    workingTitle: string;
    question: string;
    experiment: string;
    targetMinutes: number;
    audience: string;
    storyMode?: StoryMode;
  };
  evidence: EvidenceItem[];
  assets: EvidenceAsset[];
  hpsIngestion?: HpsIngestion;
  narration?: NarrationTrack;
  scenes: Scene[];
  titles: string[];
  shorts: {
    title: string;
    hook: string;
    script: string;
  }[];
  thumbnails: ThumbnailConcept[];
  publishing: {
    description: string;
    pinnedComment: string;
    linkedinPost: string;
  };
  retention?: RetentionScore;
  visualIntelligence?: VisualIntelligenceScore;
  datasets?: DatasetAnalysis[];
  documentIngestion?: DocumentIngestion;
};
