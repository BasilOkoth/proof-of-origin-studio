export type EvidenceKind = "observed" | "inference" | "limitation";

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  statement: string;
  source?: string;
};

export type EvidenceAsset = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
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

export type SceneKind =
  | "hook"
  | "document"
  | "value_swap"
  | "proof_card"
  | "confidence"
  | "timeline"
  | "diagram"
  | "quote"
  | "cta";

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
};

export type ThumbnailConcept = {
  title: string;
  kicker: string;
  visual: string;
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
};
