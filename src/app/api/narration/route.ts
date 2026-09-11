import { z } from "zod";

import {
  buildNarrationText,
  estimateNarration,
  timingsFromAlignment,
} from "@/lib/narration";
import {
  buildLongFormPlan,
  documentaryWordsPerMinute,
} from "@/lib/long-form-documentary";
import {
  applyNarrationDirector,
} from "@/lib/narration-director";
import type {
  EpisodeProject,
  NarrationTrack,
} from "@/lib/types";

const BodySchema = z.object({
  project: z.any(),
  provider: z.enum([
    "estimate",
    "elevenlabs",
  ]),
  wordsPerMinute: z
    .number()
    .min(80)
    .max(240)
    .optional(),
  voiceId: z
    .string()
    .optional(),
  modelId: z
    .string()
    .optional(),
});

const LONG_FORM_MODES =
  new Set([
    "world_explained",
    "investigation",
    "explainer",
    "case_study",
    "research",
    "report",
  ]);

function isLongFormDocumentary(
  project: EpisodeProject
) {
  return (
    project.episode
      .targetMinutes >= 7 &&
    LONG_FORM_MODES.has(
      project.episode
        .storyMode || ""
    )
  );
}

function narrationWpm(
  project: EpisodeProject,
  requested?: number
) {
  if (
    !isLongFormDocumentary(
      project
    )
  ) {
    return (
      requested || 155
    );
  }

  const documentaryWpm =
    documentaryWordsPerMinute(
      project
    );

  /*
   * A caller can request slower narration, but cannot accidentally speed a
   * long-form documentary above the editorial planning pace.
   */
  return Math.min(
    requested ||
      documentaryWpm,
    documentaryWpm
  );
}

function documentaryVoiceSpeed(
  project: EpisodeProject
) {
  return isLongFormDocumentary(
    project
  )
    ? 0.94
    : 1;
}

function narrationPlanSummary(
  project: EpisodeProject,
  wordCount: number,
  minutes: number
) {
  if (
    !isLongFormDocumentary(
      project
    )
  ) {
    return {
      style: "standard",
      wordCount,
      targetMinutes:
        project.episode
          .targetMinutes,
      estimatedMinutes:
        Number(
          minutes.toFixed(2)
        ),
    };
  }

  const plan =
    buildLongFormPlan(
      project
    );

  return {
    style:
      "generic long-form evidence documentary",
    wordCount,
    targetWords:
      plan.targetWords,
    targetMinutes:
      project.episode
        .targetMinutes,
    estimatedMinutes:
      Number(
        minutes.toFixed(2)
      ),
    coveragePercent:
      Math.round(
        Math.min(
          100,
          (wordCount /
            Math.max(
              1,
              plan.targetWords
            )) *
            100
        )
      ),
    sceneRoles:
      plan.sceneTargets.map(
        (scene) => ({
          sceneId:
            scene.sceneId,
          role:
            scene.role,
          targetWords:
            scene.targetWords,
        })
      ),
  };
}

export async function POST(
  request: Request
) {
  try {
    const body =
      BodySchema.parse(
        await request.json()
      );

    const incomingProject =
      body.project as EpisodeProject;

    if (
      !incomingProject?.scenes
        ?.length
    ) {
      return Response.json(
        {
          error:
            "The episode has no scenes to narrate.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * SERVER-AUTHORITATIVE NARRATION
     *
     * Do not trust the browser to have the newest narration director loaded.
     * A stale client bundle can otherwise keep sending old scene narration
     * even after the repository has been updated.
     *
     * Rebuild the approved script on the server on every timing/TTS request.
     * The current narration director ignores legacy scene narration and
     * composes from scene purpose + evidence + chart/map facts + boundaries.
     */
    const project =
      applyNarrationDirector(
        incomingProject,
        incomingProject.datasets
      );

    if (
      body.provider ===
      "estimate"
    ) {
      const wordsPerMinute =
        narrationWpm(
          project,
          body.wordsPerMinute
        );

      const track =
        estimateNarration(
          project,
          wordsPerMinute
        );

      const built =
        buildNarrationText(
          project
        );

      const wordCount =
        built.text.match(
          /\S+/g
        )?.length || 0;

      return Response.json({
        track,
        audioGenerated:
          false,
        narrationPlan: {
          ...narrationPlanSummary(
            project,
            wordCount,
            track.durationSec /
              60
          ),
          wordsPerMinute,
          serverAuthoritative:
            true,
        },
      });
    }

    const apiKey =
      process.env
        .ELEVENLABS_API_KEY;

    const voiceId =
      body.voiceId?.trim() ||
      process.env
        .ELEVENLABS_VOICE_ID;

    const modelId =
      body.modelId?.trim() ||
      process.env
        .ELEVENLABS_MODEL_ID ||
      "eleven_multilingual_v2";

    if (!apiKey) {
      return Response.json(
        {
          error:
            "ELEVENLABS_API_KEY is not configured in .env.local.",
        },
        {
          status: 503,
        }
      );
    }

    if (!voiceId) {
      return Response.json(
        {
          error:
            "Enter a voice ID or set ELEVENLABS_VOICE_ID in .env.local.",
        },
        {
          status: 400,
        }
      );
    }

    const built =
      buildNarrationText(
        project
      );

    if (
      !built.text.trim()
    ) {
      return Response.json(
        {
          error:
            "The episode narration is empty.",
        },
        {
          status: 400,
        }
      );
    }

    const voiceSpeed =
      documentaryVoiceSpeed(
        project
      );

    const response =
      await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
          voiceId
        )}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "xi-api-key":
              apiKey,
          },
          body:
            JSON.stringify({
              text:
                built.text,
              model_id:
                modelId,
              voice_settings:
                {
                  stability:
                    0.48,
                  similarity_boost:
                    0.82,
                  speed:
                    voiceSpeed,
                },
            }),
        }
      );

    const data =
      await response.json();

    if (
      !response.ok
    ) {
      return Response.json(
        {
          error:
            data?.detail
              ?.message ||
            data?.detail ||
            data?.message ||
            "ElevenLabs narration request failed.",
        },
        {
          status:
            response.status,
        }
      );
    }

    const alignment =
      data.alignment;

    if (
      !alignment
        ?.characters ||
      !alignment
        ?.character_start_times_seconds ||
      !alignment
        ?.character_end_times_seconds
    ) {
      return Response.json(
        {
          error:
            "The narration provider returned audio without usable character timing.",
        },
        {
          status: 502,
        }
      );
    }

    const sentences =
      timingsFromAlignment(
        project,
        alignment
      );

    const durationSec =
      alignment
        .character_end_times_seconds[
          alignment
            .character_end_times_seconds
            .length - 1
        ] || 0;

    const track:
      NarrationTrack = {
      provider:
        "elevenlabs",
      voiceId,
      modelId,
      audioDataUrl:
        `data:audio/mpeg;base64,${data.audio_base64}`,
      mimeType:
        "audio/mpeg",
      durationSec,
      generatedAt:
        new Date().toISOString(),
      sentences,
      captionStyle:
        "kinetic",
    };

    const wordCount =
      built.text.match(
        /\S+/g
      )?.length || 0;

    return Response.json({
      track,
      audioGenerated: true,
      narrationPlan: {
        ...narrationPlanSummary(
          project,
          wordCount,
          durationSec / 60
        ),
        voiceSpeed,
        actualMinutes:
          Number(
            (
              durationSec /
              60
            ).toFixed(
              2
            )
          ),
        serverAuthoritative:
          true,
      },
    });
  } catch (
    error: any
  ) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to generate narration.",
      },
      {
        status: 500,
      }
    );
  }
}
