import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { buildEditorialDirection } from "@/lib/editorial-director";
import type { EpisodeProject } from "@/lib/types";
import { AnimatedCaptions } from "./Captions";
import { EditorialBeatScene } from "./EditorialBeatScene";

const bg = "#070b16";

function CaptionDirector({
  project,
}: {
  project: EpisodeProject;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!project.narration) return null;

  const time = frame / fps;
  const direction = buildEditorialDirection(project);

  const activeBeat = direction.beats.find(
    (beat) =>
      time >= beat.startSec &&
      time < beat.startSec + beat.durationSec
  );

  if (activeBeat?.captionAction === "off") {
    return null;
  }

  if (activeBeat?.captionAction === "reduced") {
    return (
      <div style={{ opacity: 0.52 }}>
        <AnimatedCaptions track={project.narration} />
      </div>
    );
  }

  return <AnimatedCaptions track={project.narration} />;
}

export const OriginEpisode: React.FC<EpisodeProject> = (
  project
) => {
  const { fps } = useVideoConfig();
  const direction = buildEditorialDirection(project);

  const sceneById = new Map(
    project.scenes.map((scene) => [scene.id, scene])
  );

  return (
    <AbsoluteFill style={{ background: bg }}>
      {direction.beats.map((beat) => {
        const scene = sceneById.get(beat.sceneId);

        if (!scene) return null;

        const from = Math.max(
          0,
          Math.round(beat.startSec * fps)
        );

        const durationInFrames = Math.max(
          1,
          Math.round(beat.durationSec * fps)
        );

        return (
          <Sequence
            key={beat.id}
            from={from}
            durationInFrames={durationInFrames}
          >
            <EditorialBeatScene
              scene={scene}
              project={project}
              beat={beat}
            />
          </Sequence>
        );
      })}

      {project.narration?.audioDataUrl && (
        <Audio src={project.narration.audioDataUrl} />
      )}

      <CaptionDirector project={project} />
    </AbsoluteFill>
  );
};
