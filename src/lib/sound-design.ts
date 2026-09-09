import type { EpisodeProject, EvidenceAsset, Scene } from "./types";

export type SoundMood =
  | "curiosity"
  | "tension"
  | "momentum"
  | "reflection"
  | "proof"
  | "resolution";

export type SceneSoundPlan = {
  mood: SoundMood;
  musicEnergy: number;
  ambience: "city" | "nature" | "room" | "technology" | "none";
  transition: "hit" | "whoosh" | "tick" | "riser" | "none";
  silenceAtStartSec?: number;
  reason: string;
};

export type AudioRole = "music" | "ambience" | "sfx" | "unknown";

export function classifyAudioAsset(asset: EvidenceAsset): AudioRole {
  if (!asset.mimeType.startsWith("audio/")) return "unknown";
  const name = asset.name.toLowerCase();
  if (/\b(music|score|bed|theme|track)\b/.test(name)) return "music";
  if (/\b(ambience|ambient|city|room|forest|rain|street|market|nature)\b/.test(name)) return "ambience";
  if (/\b(sfx|hit|whoosh|tick|riser|impact|click|transition)\b/.test(name)) return "sfx";
  return "music";
}

export function planSceneSound(scene: Scene, index: number): SceneSoundPlan {
  const text = `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.narration}`;

  if (scene.kind === "hook") {
    return {
      mood: "curiosity",
      musicEnergy: 0.55,
      ambience: /\b(city|street|market|urban)\b/i.test(text) ? "city" : "none",
      transition: "riser",
      silenceAtStartSec: 0.15,
      reason: "Open with a brief breath of silence, then create curiosity without overwhelming narration.",
    };
  }

  if (scene.kind === "value_swap" || /\b(changed|difference|but|however|problem|risk)\b/i.test(text)) {
    return {
      mood: "tension",
      musicEnergy: 0.64,
      ambience: "none",
      transition: "hit",
      reason: "A contrast/change beat benefits from a precise impact and slightly higher tension.",
    };
  }

  if (scene.kind === "data_chart" || scene.kind === "map_story" || scene.kind === "diagram") {
    return {
      mood: "momentum",
      musicEnergy: 0.48,
      ambience: "none",
      transition: index % 2 ? "tick" : "whoosh",
      reason: "Explanatory graphics need forward motion but clean space around the voice.",
    };
  }

  if (scene.kind === "source_highlight" || scene.kind === "document" || scene.kind === "proof_card") {
    return {
      mood: "proof",
      musicEnergy: 0.28,
      ambience: "room",
      transition: "tick",
      reason: "Evidence should feel focused and credible; reduce musical energy while proof is on screen.",
    };
  }

  if (scene.kind === "quote") {
    return {
      mood: "reflection",
      musicEnergy: 0.22,
      ambience: "none",
      transition: "none",
      silenceAtStartSec: 0.25,
      reason: "A short silence gives the conceptual payoff room to land.",
    };
  }

  if (scene.kind === "cta") {
    return {
      mood: "resolution",
      musicEnergy: 0.5,
      ambience: "none",
      transition: "riser",
      reason: "Resolve the episode with renewed energy rather than a generic hard stop.",
    };
  }

  return {
    mood: "reflection",
    musicEnergy: 0.34,
    ambience: "none",
    transition: "none",
    reason: "Keep the bed restrained and let narration lead.",
  };
}

export function soundDesignPlan(project: EpisodeProject) {
  return project.scenes.map((scene, index) => ({
    sceneId: scene.id,
    headline: scene.headline,
    ...planSceneSound(scene, index),
  }));
}
