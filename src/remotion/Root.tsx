import React from "react";
import { Composition } from "remotion";
import { OriginEpisode } from "./OriginEpisode";
import { OriginShort } from "./OriginShort";
import { OriginThumbnail } from "./OriginThumbnail";
import { makeSample } from "@/lib/sample";
import type { EpisodeProject } from "@/lib/types";

const fps = 30;
const sample = makeSample();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="OriginEpisode"
        component={OriginEpisode}
        width={1920}
        height={1080}
        fps={fps}
        durationInFrames={sample.scenes.reduce(
          (sum, scene) => sum + Math.round(scene.durationSec * fps),
          0
        )}
        defaultProps={sample}
        calculateMetadata={({ props }) => {
          const project = props as EpisodeProject;
          return {
            durationInFrames: project.scenes.reduce(
              (sum, scene) => sum + Math.round(scene.durationSec * fps),
              0
            ),
          };
        }}
      />

      <Composition
        id="OriginShort"
        component={OriginShort}
        width={1080}
        height={1920}
        fps={fps}
        durationInFrames={60 * fps}
        defaultProps={{ project: sample, shortIndex: 0 }}
      />

      <Composition
        id="OriginThumbnail"
        component={OriginThumbnail}
        width={1280}
        height={720}
        fps={fps}
        durationInFrames={1}
        defaultProps={{ project: sample, thumbnailIndex: 0 }}
      />
    </>
  );
};
