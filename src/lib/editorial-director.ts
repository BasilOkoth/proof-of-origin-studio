import type {
  EpisodeProject,
  Scene,
} from "./types";
import {
  buildProductionIntelligence,
  type ProductionIntelligence,
  type ShotInstruction,
} from "./production-intelligence";

export type EditorialBeatType =
  | "cold_open"
  | "establish"
  | "evidence"
  | "context"
  | "reveal"
  | "breath"
  | "callback"
  | "transition"
  | "payoff"
  | "cta";

export type EditorialBeat = {
  id: string;
  sceneId: string;
  type: EditorialBeatType;
  startSec: number;
  durationSec: number;
  shotRole: ShotInstruction["role"];
  instruction: string;
  visualAction: string;
  audioAction: string;
  captionAction:
    | "normal"
    | "reduced"
    | "off";
  emphasis:
    | "low"
    | "medium"
    | "high";
  callbackSceneId?: string;
};

export type EditorialDirection = {
  version:
    "editorial-director-1";
  generatedAt: string;
  production:
    ProductionIntelligence;
  beats: EditorialBeat[];
  pacing: {
    averageShotLengthSec: number;
    longestBeatSec: number;
    visualResetCount: number;
    quietBeatCount: number;
  };
  warnings: string[];
  score: number;
};

function sceneStart(
  project: EpisodeProject,
  index: number
) {
  return project.scenes
    .slice(0, index)
    .reduce(
      (sum, scene) =>
        sum +
        scene.durationSec,
      0
    );
}

function classifyBeat(
  scene: Scene,
  index: number
): EditorialBeatType {
  if (index === 0) {
    return "cold_open";
  }

  if (
    scene.kind ===
      "value_swap" ||
    scene.kind ===
      "confidence"
  ) {
    return "reveal";
  }

  if (
    scene.kind ===
      "document" ||
    scene.kind ===
      "source_highlight" ||
    scene.kind ===
      "proof_card"
  ) {
    return "evidence";
  }

  if (
    scene.kind ===
      "map_story" ||
    scene.kind ===
      "data_chart"
  ) {
    return "context";
  }

  if (
    scene.kind ===
    "quote"
  ) {
    return "breath";
  }

  if (
    scene.kind ===
    "cta"
  ) {
    return "cta";
  }

  if (
    scene.kind ===
      "diagram" ||
    scene.kind ===
      "timeline"
  ) {
    return "transition";
  }

  return index >= 7
    ? "payoff"
    : "establish";
}

function splitCount(
  scene: Scene,
  role: ShotInstruction["role"]
) {
  /*
   * The final branded documentary closure is authored as one continuous
   * composition. Do not split it into multiple editorial beats, otherwise
   * the outro animation restarts halfway through the ending.
   */
  if (
    scene.kind ===
    "cta"
  ) {
    return 1;
  }

  if (
    scene.durationSec <= 14
  ) {
    return 1;
  }

  if (
    role === "broll" ||
    role === "archive"
  ) {
    return Math.min(
      4,
      Math.max(
        2,
        Math.round(
          scene.durationSec /
            7
        )
      )
    );
  }

  if (
    role === "map" ||
    role === "chart" ||
    role === "diagram"
  ) {
    return Math.min(
      3,
      Math.max(
        2,
        Math.round(
          scene.durationSec /
            10
        )
      )
    );
  }

  if (
    scene.durationSec > 28
  ) {
    return 2;
  }

  return 1;
}

function visualAction(
  beatType:
    EditorialBeatType,
  shot:
    ShotInstruction,
  part: number,
  total: number
) {
  if (
    beatType ===
    "cold_open"
  ) {
    return part === 0
      ? "Open on the strongest concrete image or document detail. Avoid an intro card."
      : "Escalate visually before explaining; introduce one unanswered visual question.";
  }

  if (
    beatType ===
    "reveal"
  ) {
    return part === 0
      ? "Delay the answer by one visual beat, then reveal the changed value or observed result."
      : "Hold the result long enough to be read; avoid cutting away immediately.";
  }

  if (
    beatType ===
    "breath"
  ) {
    return "Use one strong image or restrained typography. Reduce motion and let the narration carry the moment.";
  }

  if (
    shot.role ===
    "map"
  ) {
    return part === 0
      ? "Begin wider than the final area to orient the viewer."
      : part ===
          total - 1
        ? "Finish on the exact location, route, cluster or boundary that matters to the argument."
        : "Advance the geographic story in narration order.";
  }

  if (
    shot.role ===
    "chart"
  ) {
    return part === 0
      ? "Introduce the axis and source before the data moves."
      : "Reveal only the values being discussed; avoid dashboard-style clutter.";
  }

  if (
    shot.role ===
    "document"
  ) {
    return part === 0
      ? "Show the source object first."
      : "Push into the exact sentence, figure or value being discussed.";
  }

  if (
    shot.role ===
    "diagram"
  ) {
    return "Reveal the mechanism progressively; never show the full system before narration explains it.";
  }

  if (
    shot.role ===
    "archive"
  ) {
    return "Use source-labelled archival material and change shots only when the narration changes idea, time or place.";
  }

  if (
    shot.role ===
    "broll"
  ) {
    return part === 0
      ? "Establish place, people or physical process with an authentic shot."
      : "Cut to a complementary detail, action or consequence rather than another generic wide shot.";
  }

  return "Use brief editorial typography as a reset, then return quickly to evidence or the physical world.";
}

function audioAction(
  beatType:
    EditorialBeatType,
  part: number
) {
  switch (beatType) {
    case "cold_open":
      return part === 0
        ? "Start with minimal music or natural ambience. Let the first line land clearly."
        : "Introduce subtle momentum only after the core question is established.";

    case "reveal":
      return part === 0
        ? "Reduce music just before the reveal."
        : "Use a restrained impact or evidence tick, then leave space after the result.";

    case "breath":
      return "Duck the score noticeably. Consider 0.5–1.0 seconds of near-silence around the key line.";

    case "payoff":
      return "Let the score resolve gradually; avoid a sudden inspirational swell.";

    case "cta":
      return "Keep energy forward but restrained. Bridge to the next question rather than ending with generic hype.";

    default:
      return "Keep narration dominant. Use ambience or score only to support continuity and mood.";
  }
}

function captionAction(
  beatType:
    EditorialBeatType
) {
  if (
    beatType ===
    "breath"
  ) {
    return "off" as const;
  }

  if (
    beatType ===
    "reveal"
  ) {
    return "reduced" as const;
  }

  return "normal" as const;
}

function emphasis(
  beatType:
    EditorialBeatType
) {
  if (
    beatType ===
      "cold_open" ||
    beatType ===
      "reveal" ||
    beatType ===
      "payoff"
  ) {
    return "high" as const;
  }

  if (
    beatType ===
      "breath" ||
    beatType ===
      "evidence"
  ) {
    return "medium" as const;
  }

  return "low" as const;
}

function callbackTarget(
  project: EpisodeProject,
  scene: Scene,
  index: number
): string | undefined {
  if (index < 5) {
    return undefined;
  }

  const hook =
    project.scenes[0];

  const earlyReveal =
    project.scenes.find(
      (candidate) =>
        candidate.kind ===
          "value_swap" ||
        candidate.kind ===
          "document" ||
        candidate.kind ===
          "confidence"
    );

  if (
    scene.kind ===
      "quote" ||
    scene.kind ===
      "cta"
  ) {
    return (
      earlyReveal?.id ||
      hook?.id
    );
  }

  return undefined;
}

export function buildEditorialDirection(
  project: EpisodeProject
): EditorialDirection {
  const production =
    buildProductionIntelligence(
      project
    );

  const shotByScene =
    new Map(
      production.shots.map(
        (shot) => [
          shot.sceneId,
          shot,
        ]
      )
    );

  const beats:
    EditorialBeat[] = [];

  project.scenes.forEach(
    (
      scene,
      sceneIndex
    ) => {
      const shot =
        shotByScene.get(
          scene.id
        );

      if (!shot) {
        return;
      }

      const type =
        classifyBeat(
          scene,
          sceneIndex
        );

      const parts =
        splitCount(
          scene,
          shot.role
        );

      const partDuration =
        scene.durationSec /
        parts;

      const start =
        sceneStart(
          project,
          sceneIndex
        );

      const callbackSceneId =
        callbackTarget(
          project,
          scene,
          sceneIndex
        );

      for (
        let part = 0;
        part < parts;
        part += 1
      ) {
        const localType =
          callbackSceneId &&
          part ===
            parts - 1 &&
          scene.kind !==
            "cta"
            ? "callback"
            : type;

        beats.push({
          id:
            `${scene.id}-beat-${part + 1}`,
          sceneId:
            scene.id,
          type:
            localType,
          startSec:
            Number(
              (
                start +
                partDuration *
                  part
              ).toFixed(
                2
              )
            ),
          durationSec:
            Number(
              partDuration.toFixed(
                2
              )
            ),
          shotRole:
            shot.role,
          instruction:
            localType ===
            "callback"
              ? "Return visually to an earlier image, document detail or motif so the story feels authored rather than linear."
              : shot.reason,
          visualAction:
            localType ===
            "callback"
              ? "Reuse the earlier visual motif with a new crop, annotation or meaning. Do not replay it identically."
              : visualAction(
                  type,
                  shot,
                  part,
                  parts
                ),
          audioAction:
            audioAction(
              type,
              part
            ),
          captionAction:
            captionAction(
              type
            ),
          emphasis:
            emphasis(
              type
            ),
          callbackSceneId:
            localType ===
            "callback"
              ? callbackSceneId
              : undefined,
        });
      }
    }
  );

  const durations =
    beats.map(
      (beat) =>
        beat.durationSec
    );

  const averageShotLengthSec =
    durations.length
      ? durations.reduce(
          (a, b) =>
            a + b,
          0
        ) /
        durations.length
      : 0;

  const quietBeatCount =
    beats.filter(
      (beat) =>
        beat.type ===
          "breath" ||
        beat.captionAction ===
          "off"
    ).length;

  const visualResetCount =
    production.rhythm.filter(
      (item) =>
        item.reset
    ).length;

  const warnings = [
    ...production.warnings,
  ];

  if (
    averageShotLengthSec >
    10
  ) {
    warnings.push(
      "Average editorial beat is long. Consider more shot variation in B-roll and archival sections."
    );
  }

  if (
    !quietBeatCount &&
    project.scenes.length >=
      8
  ) {
    warnings.push(
      "The episode has no deliberate quiet beat. Premium edits usually benefit from at least one visual or sonic breath."
    );
  }

  if (
    beats.filter(
      (beat) =>
        beat.type ===
        "callback"
    ).length === 0 &&
    project.scenes.length >=
      8
  ) {
    warnings.push(
      "No visual callback was planned. Reusing an early motif later can make the episode feel more authored."
    );
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          production.score *
            0.65 +
            Math.min(
              15,
              visualResetCount *
                2
            ) +
            Math.min(
              10,
              quietBeatCount *
                5
            ) +
            Math.min(
              10,
              beats.filter(
                (beat) =>
                  beat.type ===
                  "callback"
              ).length *
                5
            ) -
            warnings.length *
              2
        )
      )
    );

  return {
    version:
      "editorial-director-1",
    generatedAt:
      new Date().toISOString(),
    production,
    beats,
    pacing: {
      averageShotLengthSec:
        Number(
          averageShotLengthSec.toFixed(
            2
          )
        ),
      longestBeatSec:
        Number(
          (
            durations.length
              ? Math.max(
                  ...durations
                )
              : 0
          ).toFixed(
            2
          )
        ),
      visualResetCount,
      quietBeatCount,
    },
    warnings,
    score,
  };
}
