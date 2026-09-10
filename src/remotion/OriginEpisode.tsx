import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { buildEditorialDirection } from "@/lib/editorial-director";
import { buildIllustrationDirection } from "@/lib/illustration-director";
import type { EpisodeProject } from "@/lib/types";
import { AnimatedCaptions } from "./Captions";
import { EditorialBeatScene } from "./EditorialBeatScene";
import { IllustrationConceptScene } from "./IllustrationConceptScene";

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

function beatPhase(beatId: string) {
  const match = beatId.match(/-beat-(\d+)$/);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function shouldExecuteIllustration(
  shotRole: string,
  sceneKind: string,
  hasExecution: boolean
) {
  if (!hasExecution) return false;

  /*
   * Evidence-first precedence:
   * maps, charts, source highlights, documents and proof cards keep their
   * evidence-native renderers. Illustration executes only when the editorial
   * director has selected a diagram-like role, or the scene itself is an
   * explicitly explanatory diagram/timeline.
   */
  return (
    shotRole === "diagram" ||
    sceneKind === "diagram" ||
    sceneKind === "timeline"
  );
}

export const OriginEpisode: React.FC<EpisodeProject> = (
  project
) => {
  const { fps } = useVideoConfig();
  const direction = buildEditorialDirection(project);
  const illustration = buildIllustrationDirection(project);

  const sceneById = new Map(
    project.scenes.map((scene) => [scene.id, scene])
  );

  const illustrationByScene = new Map(
    illustration.scenes.map((plan) => [plan.sceneId, plan])
  );

  return (
    <AbsoluteFill style={{ background: bg }}>
      {direction.beats.map((beat) => {
        const scene = sceneById.get(beat.sceneId);

        if (!scene) return null;

        const illustrationPlan =
          illustrationByScene.get(scene.id);

        const from = Math.max(
          0,
          Math.round(beat.startSec * fps)
        );

        const durationInFrames = Math.max(
          1,
          Math.round(beat.durationSec * fps)
        );

        const executeIllustration =
          Boolean(illustrationPlan?.shouldIllustrate) &&
          shouldExecuteIllustration(
            beat.shotRole,
            scene.kind,
            Boolean(illustrationPlan?.execution)
          );

        return (
          <Sequence
            key={beat.id}
            from={from}
            durationInFrames={durationInFrames}
          >
            {executeIllustration && illustrationPlan ? (
              <IllustrationConceptScene
                scene={scene}
                plan={illustrationPlan}
                phase={beatPhase(beat.id)}
              />
            ) : (
              <EditorialBeatScene
                scene={scene}
                project={project}
                beat={beat}
              />
            )}
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
