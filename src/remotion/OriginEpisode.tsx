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
import { shouldUseCinematicMontage } from "@/lib/cinematic-director";
import type {
  EpisodeProject,
  Scene,
} from "@/lib/types";
import {
  AnimatedCaptions,
  type CaptionPlacement,
} from "./Captions";
import { EditorialBeatScene } from "./EditorialBeatScene";
import { IllustrationConceptScene } from "./IllustrationConceptScene";
import { PremiumOutroScene } from "./PremiumOutroScene";
import { CinematicEvidenceMontageScene } from "./CinematicEvidenceMontageScene";

const bg = "#070b16";

function captionPlacementFor(
  scene: Scene | undefined,
  shotRole: string | undefined
): CaptionPlacement {
  if (!scene) {
    return "lower_center";
  }

  /*
   * Premium default: narration lives in a centred lower-third rail.
   * Do not push subtitles into distant corners merely because the scene
   * contains a left-aligned headline.
   */
  if (
    scene.kind === "hook" ||
    shotRole === "broll" ||
    shotRole === "archive" ||
    shotRole === "headline"
  ) {
    return "lower_center";
  }

  /*
   * Charts and maps keep narration in the centered lower-third rail.
   * This avoids the scene title and keeps captions visually connected
   * to the narration instead of floating over the chart header.
   */
  if (
    scene.map ||
    scene.chart ||
    shotRole === "map" ||
    shotRole === "chart"
  ) {
    return "lower_center";
  }

  /*
   * Documents and source-highlight scenes can be visually dense in the lower
   * third. Use a centred mid-frame subtitle position rather than left/right
   * corner placement.
   */
  if (
    scene.kind === "document" ||
    scene.kind === "source_highlight" ||
    scene.kind === "proof_card" ||
    shotRole === "document"
  ) {
    return "center";
  }

  /*
   * Diagrams and explanatory scenes remain lower-centred. The caption is
   * compact enough not to read as a second headline.
   */
  return "lower_center";
}

function CaptionDirector({
  project,
}: {
  project: EpisodeProject;
}) {
  const frame =
    useCurrentFrame();

  const { fps } =
    useVideoConfig();

  if (
    !project.narration
  ) {
    return null;
  }

  const time =
    frame / fps;

  const direction =
    buildEditorialDirection(
      project
    );

  const activeBeat =
    direction.beats.find(
      (beat) =>
        time >=
          beat.startSec &&
        time <
          beat.startSec +
            beat.durationSec
    );

  if (!activeBeat) {
    return (
      <AnimatedCaptions
        track={project.narration}
        placement="lower_center"
      />
    );
  }

  const activeScene =
    project.scenes.find(
      (scene) =>
        scene.id ===
        activeBeat.sceneId
    );

  /*
   * The branded outro already contains authored text and should not have
   * kinetic narration sitting on top of it.
   */
  if (
    activeScene?.kind ===
    "cta"
  ) {
    return null;
  }

  if (
    activeBeat.captionAction ===
    "off"
  ) {
    return null;
  }

  const placement =
    captionPlacementFor(
      activeScene,
      activeBeat.shotRole
    );

  return (
    <AnimatedCaptions
      track={project.narration}
      placement={placement}
      reduced={
        activeBeat.captionAction ===
        "reduced"
      }
    />
  );
}

function beatPhase(
  beatId: string
) {
  const match =
    beatId.match(
      /-beat-(\d+)$/
    );

  return match
    ? Math.max(
        0,
        Number(match[1]) -
          1
      )
    : 0;
}

function shouldExecuteIllustration(
  shotRole: string,
  scene: Scene,
  hasExecution: boolean
) {
  if (!hasExecution) {
    return false;
  }

  const approvedVisualKind =
    String(
      scene.visualPlan
        ?.kind || ""
    );

  if (
    scene.map ||
    scene.chart
  ) {
    return false;
  }

  if (
    approvedVisualKind ===
    "systems_diagram"
  ) {
    return true;
  }

  return (
    shotRole ===
      "diagram" ||
    scene.kind ===
      "diagram" ||
    scene.kind ===
      "timeline"
  );
}

export const OriginEpisode: React.FC<
  EpisodeProject
> = (project) => {
  const { fps } =
    useVideoConfig();

  const direction =
    buildEditorialDirection(
      project
    );

  const illustration =
    buildIllustrationDirection(
      project
    );

  const sceneById =
    new Map(
      project.scenes.map(
        (scene) => [
          scene.id,
          scene,
        ]
      )
    );

  const sceneIndexById =
    new Map(
      project.scenes.map(
        (scene, index) => [
          scene.id,
          index,
        ]
      )
    );

  const illustrationByScene =
    new Map(
      illustration.scenes.map(
        (plan) => [
          plan.sceneId,
          plan,
        ]
      )
    );

  return (
    <AbsoluteFill
      style={{
        background: bg,
      }}
    >
      {direction.beats.map(
        (beat) => {
          const scene =
            sceneById.get(
              beat.sceneId
            );

          if (!scene) {
            return null;
          }

          const illustrationPlan =
            illustrationByScene.get(
              scene.id
            );

          const sceneIndex =
            sceneIndexById.get(
              scene.id
            ) ?? 0;

          const useCinematicMontage =
            shouldUseCinematicMontage(
              project,
              scene,
              sceneIndex
            );

          const from =
            Math.max(
              0,
              Math.round(
                beat.startSec *
                  fps
              )
            );

          const durationInFrames =
            Math.max(
              1,
              Math.round(
                beat.durationSec *
                  fps
              )
            );

          const executeIllustration =
            Boolean(
              illustrationPlan
                ?.shouldIllustrate
            ) &&
            shouldExecuteIllustration(
              beat.shotRole,
              scene,
              Boolean(
                illustrationPlan
                  ?.execution
              )
            );

          return (
            <Sequence
              key={beat.id}
              from={from}
              durationInFrames={
                durationInFrames
              }
            >
              {scene.kind ===
              "cta" ? (
                <PremiumOutroScene
                  scene={scene}
                  project={
                    project
                  }
                />
              ) : useCinematicMontage ? (
                <CinematicEvidenceMontageScene
                  scene={scene}
                  project={project}
                  sceneIndex={sceneIndex}
                />
              ) : executeIllustration &&
                illustrationPlan ? (
                <IllustrationConceptScene
                  scene={scene}
                  plan={
                    illustrationPlan
                  }
                  phase={beatPhase(
                    beat.id
                  )}
                />
              ) : (
                <EditorialBeatScene
                  scene={scene}
                  project={
                    project
                  }
                  beat={beat}
                />
              )}
            </Sequence>
          );
        }
      )}

      {project.narration
        ?.audioDataUrl && (
        <Audio
          src={
            project.narration
              .audioDataUrl
          }
        />
      )}

      <CaptionDirector
        project={project}
      />
    </AbsoluteFill>
  );
};
