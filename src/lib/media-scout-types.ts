export type MediaProvider = "pexels" | "wikimedia";

export type MediaCandidate = {
  id: string;
  provider: MediaProvider;
  mediaType: "video" | "image";
  title: string;
  previewUrl: string;
  sourceUrl: string;
  downloadUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  creator?: string;
  creatorUrl?: string;
  licenseName: string;
  licenseUrl?: string;
  attribution: string;
  query: string;
  relevanceScore: number;
  metadata?: Record<string, string | number | boolean | undefined>;
};

export type MediaScoutSceneResult = {
  sceneId: string;
  headline: string;
  query: string;
  alternateQuery?: string;
  reason: string;
  recommendedType: "video" | "image";
  candidates: MediaCandidate[];
};

export type MediaScoutResult = {
  version: "origin-media-scout-1";
  generatedAt: string;
  sources: MediaProvider[];
  scenes: MediaScoutSceneResult[];
  notes: string[];
};
