import type { EvidenceAsset } from "./types";

export type AudioCueKind = "music" | "ambience" | "sfx";

export type AudioCue = {
  id: string;
  sceneId?: string;
  kind: AudioCueKind;
  label: string;
  prompt: string;
  startSec: number;
  durationSec: number;
  volume: number;
  loop?: boolean;
  transition?: "hit" | "whoosh" | "tick" | "riser" | "none";
  assetId?: string;
};

export type AudioProvenance = {
  provider: "elevenlabs";
  endpoint: "/v1/music" | "/v1/sound-generation";
  modelId: string;
  prompt: string;
  generatedAt: string;
  outputFormat: string;
};

export type GeneratedAudioAsset = EvidenceAsset & {
  provenance?: AudioProvenance;
};

export type AudioDirection = {
  version: "origin-audio-director-1";
  generatedAt: string;
  provider: "elevenlabs";
  score: {
    prompt: string;
    modelId: "music_v2";
    durationSec: number;
    assetId?: string;
  };
  cues: AudioCue[];
  assets: GeneratedAudioAsset[];
  notes: string[];
};
