import type { EpisodeProject } from "./types";
import { buildEditorialDirection } from "./editorial-director";

export type SequenceCut = {
  id: string;
  sceneId: string;
  atSec: number;
  durationSec: number;
  visual:
    | "broll"
    | "archive"
    | "map"
    | "chart"
    | "document"
    | "diagram"
    | "quiet"
    | "headline";
  transition:
    | "cut"
    | "match_cut"
    | "dip"
    | "push"
    | "hold"
    | "graphic_bridge";
  instruction: string;
  audioInstruction: string;
};

function transitionFor(
  currentVisual: SequenceCut["visual"],
  previousVisual?: SequenceCut["visual"]
): SequenceCut["transition"] {
  if (!previousVisual) return "cut";
  if (currentVisual === "quiet") return "hold";
  if (currentVisual === previousVisual) return "match_cut";
  if (currentVisual === "map" || currentVisual === "chart") {
    return "graphic_bridge";
  }
  if (
    currentVisual === "document" &&
    (previousVisual === "broll" || previousVisual === "archive")
  ) {
    return "push";
  }
  return "cut";
}

export function buildCinematicSequence(project: EpisodeProject) {
  const direction = buildEditorialDirection(project);

  const cuts: SequenceCut[] = [];
  let previousVisual: SequenceCut["visual"] | undefined;

  direction.beats.forEach((beat) => {
    const visual = beat.shotRole;
    cuts.push({
      id: beat.id,
      sceneId: beat.sceneId,
      atSec: beat.startSec,
      durationSec: beat.durationSec,
      visual,
      transition: transitionFor(visual, previousVisual),
      instruction: beat.visualAction,
      audioInstruction: beat.audioAction,
    });
    previousVisual = visual;
  });

  return {
    version: "cinematic-sequencer-1" as const,
    generatedAt: new Date().toISOString(),
    editorialScore: direction.score,
    cuts,
    warnings: direction.warnings,
  };
}
