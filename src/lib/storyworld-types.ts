export type StoryworldStatus = "concept" | "pilot-ready" | "testing" | "validated";

export type DialogueLine = {
  speaker: string;
  text: string;
  delivery?: string;
};

export type CharacterLock = {
  id: string;
  name: string;
  age: number | string;
  role: string;
  essence: string;
  appearance: string;
  wardrobe: string;
  voice: string;
  visualMotifs: string[];
  continuityRules: string[];
};

export type StoryworldBible = {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  format: string;
  setting: string;
  status: StoryworldStatus;
  seasonQuestion: string;
  premise: string;
  visualIdentity: string[];
  soundIdentity: string[];
  palette: string[];
  characters: CharacterLock[];
};

export type StoryBeat = {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  purpose: string;
};

export type ShotSpec = {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  camera: string;
  visual: string;
  purpose: string;
  characters: string[];
  dialogue?: DialogueLine[];
  narration?: string;
  onScreenText?: string[];
  sound?: string;
  promptNotes?: string;
};

export type EpisodeSpec = {
  id: string;
  worldId: string;
  number: number;
  title: string;
  runtimeSec: number;
  aspectRatio: "9:16" | "16:9";
  episodeQuestion: string;
  payoff: string;
  cliffhanger: string;
  firstFrame: string;
  beats: StoryBeat[];
  shots: ShotSpec[];
  musicDirection: string;
  subtitleDirection: string;
  platformCaption: string;
  pinnedComment: string;
};

export type ShotManifest = ShotSpec & {
  durationSec: number;
  imagePrompt: string;
  continuityFingerprint: string;
};

export type EpisodeManifest = Omit<EpisodeSpec, "shots"> & {
  shots: ShotManifest[];
};

export type ContinuityIssue = {
  severity: "info" | "warning" | "blocker";
  message: string;
};

export type EpisodeQualityReport = {
  score: number;
  hook: number;
  clarity: number;
  progress: number;
  payoff: number;
  cliffhanger: number;
  continuity: number;
  visual: number;
  sound: number;
  issues: ContinuityIssue[];
};

export type StoryworldProductionPackage = {
  world: StoryworldBible;
  episode: EpisodeManifest;
  quality: EpisodeQualityReport;
  generatedAt: string;
  schemaVersion: "storyworld-v0.1";
};
