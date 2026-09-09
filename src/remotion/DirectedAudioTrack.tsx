import React from "react";
import { Audio, Sequence } from "remotion";
import type { EpisodeProject } from "@/lib/types";
import type { AudioDirection } from "@/lib/audio-types";

function asset(project: EpisodeProject, id?: string) {
  return id ? project.assets.find((item) => item.id === id) : undefined;
}

export function DirectedAudioTrack({
  project,
  direction,
}: {
  project: EpisodeProject;
  direction?: AudioDirection;
}) {
  if (!direction) return null;

  const score = asset(project, direction.score.assetId);

  return (
    <>
      {score && (
        <Sequence from={0} durationInFrames={Math.max(1, Math.round(direction.score.durationSec * 30))}>
          <Audio src={score.dataUrl} volume={0.09} />
        </Sequence>
      )}

      {direction.cues.map((cue) => {
        const media = asset(project, cue.assetId);
        if (!media) return null;

        return (
          <Sequence
            key={cue.id}
            from={Math.max(0, Math.round(cue.startSec * 30))}
            durationInFrames={Math.max(1, Math.round(cue.durationSec * 30))}
          >
            <Audio src={media.dataUrl} volume={cue.volume} />
          </Sequence>
        );
      })}
    </>
  );
}
