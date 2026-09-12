import type { DialogueLine, StoryworldProductionPackage } from "./storyworld-types";

export type GenerationProvider = "manual" | "openai-images" | "video-provider" | "elevenlabs" | "existing-audio";
export type GenerationStatus = "blocked" | "ready" | "generated" | "approved" | "failed";
export type GenerationJobKind =
  | "character-reference"
  | "shot-image"
  | "shot-video"
  | "voice"
  | "sfx"
  | "music"
  | "caption";

export type CharacterReferenceAsset = {
  characterId: string;
  characterName: string;
  faceLockKey: string;
  referencePath: string;
  approved: boolean;
  canonicalAssetId?: string;
  sha256?: string;
  approvedAt?: string;
  wardrobeVersion?: string;
  prompt: string;
  voiceId?: string;
  notes: string[];
};

export type VoiceCue = {
  id: string;
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
  delivery?: string;
  voiceProfileKey?: string;
  outputPath: string;
};

export type CaptionCue = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
};

export type GenerationJob = {
  id: string;
  kind: GenerationJobKind;
  provider: GenerationProvider;
  status: GenerationStatus;
  blockedBy: string[];
  prompt?: string;
  outputPath: string;
  shotId?: string;
  characterIds?: string[];
  metadata?: Record<string, string | number | boolean | string[]>;
};

export type RenderShot = {
  id: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  label: string;
  purpose: string;
  camera: string;
  visual: string;
  imagePath: string;
  videoPath: string;
  seedImagePath?: string;
  preferredAsset: "video" | "image";
  motionInstruction: string;
  narration?: string;
  dialogue?: DialogueLine[];
  onScreenText?: string[];
  sound?: string;
};

export type StoryworldRenderPlan = {
  width: 1080;
  height: 1920;
  fps: 30;
  durationSec: number;
  compositionId: "StoryworldEpisode";
  worldId: string;
  episodeId: string;
  shots: RenderShot[];
  voices: VoiceCue[];
  captions: CaptionCue[];
  musicDirection: string;
  subtitleDirection: string;
  title: string;
  episodeTitle: string;
};

export type StoryworldGenerationPlan = {
  schemaVersion: "storyworld-v0.3";
  generatedAt: string;
  sourcePackage: StoryworldProductionPackage;
  characterReferences: CharacterReferenceAsset[];
  jobs: GenerationJob[];
  render: StoryworldRenderPlan;
  approvalGates: string[];
};
