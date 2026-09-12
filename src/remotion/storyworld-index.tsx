import React from "react";
import { Composition, registerRoot } from "remotion";
import { StoryworldEpisode } from "./StoryworldEpisode";
import type { StoryworldGenerationPlan } from "@/lib/storyworld-generation-types";

const placeholderPlan = {
  schemaVersion: "storyworld-v0.3",
  generatedAt: "",
  sourcePackage: {} as never,
  characterReferences: [],
  jobs: [],
  approvalGates: [],
  render: {
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 70,
    compositionId: "StoryworldEpisode",
    worldId: "placeholder",
    episodeId: "placeholder",
    shots: [],
    voices: [],
    captions: [],
    musicDirection: "",
    subtitleDirection: "",
    title: "Storyworld",
    episodeTitle: "Pilot",
  },
} satisfies StoryworldGenerationPlan;

const Root: React.FC = () => (
  <Composition
    id="StoryworldEpisode"
    component={StoryworldEpisode}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={70 * 30}
    defaultProps={{ plan: placeholderPlan, assetAvailability: {} }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.round(props.plan.render.durationSec * props.plan.render.fps)),
      fps: props.plan.render.fps,
      width: props.plan.render.width,
      height: props.plan.render.height,
    })}
  />
);

registerRoot(Root);
