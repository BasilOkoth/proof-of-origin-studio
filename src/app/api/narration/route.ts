import { z } from "zod";

import {
  buildNarrationText,
  estimateNarration,
  timingsFromAlignment,
} from "@/lib/narration";
import type {
  EpisodeProject,
  NarrationTrack,
} from "@/lib/types";

const BodySchema = z.object({
  project: z.any(),
  provider: z.enum(["estimate", "elevenlabs"]),
  wordsPerMinute: z.number().min(80).max(240).optional(),
  voiceId: z.string().optional(),
  modelId: z.string().optional(),
});

function isLongFormDocumentary(project: EpisodeProject) {
  return (
    project.episode.storyMode === "world_explained" &&
    project.episode.targetMinutes >= 7
  );
}

function documentaryWordsPerMinute(
  project: EpisodeProject,
  requested?: number
) {
  if (!isLongFormDocumentary(project)) {
    return requested || 155;
  }

  /*
   * Premium evidence documentaries need slightly more breathing room than
   * fast social narration. Keep World Explained planning around 145 wpm.
   */
  return Math.min(requested || 145, 145);
}

function documentaryVoiceSpeed(project: EpisodeProject) {
  /*
   * ElevenLabs speed 1.0 was reading the current documentary too quickly.
   * 0.94 gives charts, maps, source reveals and visual evidence more room
   * without making the delivery feel artificially slow.
   */
  return isLongFormDocumentary(project) ? 0.94 : 1;
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;

    if (!project?.scenes?.length) {
      return Response.json(
        { error: "The episode has no scenes to narrate." },
        { status: 400 }
      );
    }

    if (body.provider === "estimate") {
      const wordsPerMinute = documentaryWordsPerMinute(
        project,
        body.wordsPerMinute
      );

      const track = estimateNarration(
        project,
        wordsPerMinute
      );

      const built = buildNarrationText(project);
      const wordCount =
        built.text.match(/\S+/g)?.length || 0;

      return Response.json({
        track,
        audioGenerated: false,
        narrationPlan: {
          wordCount,
          wordsPerMinute,
          targetMinutes:
            project.episode.targetMinutes,
          estimatedMinutes: Number(
            (track.durationSec / 60).toFixed(2)
          ),
          style: isLongFormDocumentary(project)
            ? "long-form evidence documentary"
            : "standard",
        },
      });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId =
      body.voiceId?.trim() ||
      process.env.ELEVENLABS_VOICE_ID;
    const modelId =
      body.modelId?.trim() ||
      process.env.ELEVENLABS_MODEL_ID ||
      "eleven_multilingual_v2";

    if (!apiKey) {
      return Response.json(
        {
          error:
            "ELEVENLABS_API_KEY is not configured in .env.local.",
        },
        { status: 503 }
      );
    }

    if (!voiceId) {
      return Response.json(
        {
          error:
            "Enter a voice ID or set ELEVENLABS_VOICE_ID in .env.local.",
        },
        { status: 400 }
      );
    }

    const built = buildNarrationText(project);

    if (!built.text.trim()) {
      return Response.json(
        { error: "The episode narration is empty." },
        { status: 400 }
      );
    }

    const voiceSpeed =
      documentaryVoiceSpeed(project);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        voiceId
      )}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: built.text,
          model_id: modelId,
          voice_settings: {
            stability: 0.48,
            similarity_boost: 0.82,
            speed: voiceSpeed,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error:
            data?.detail?.message ||
            data?.detail ||
            data?.message ||
            "ElevenLabs narration request failed.",
        },
        { status: response.status }
      );
    }

    const alignment = data.alignment;

    if (
      !alignment?.characters ||
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
        { status: 502 }
      );
    }

    const sentences = timingsFromAlignment(
      project,
      alignment
    );

    const durationSec =
      alignment.character_end_times_seconds[
        alignment.character_end_times_seconds
          .length - 1
      ] || 0;

    const track: NarrationTrack = {
      provider: "elevenlabs",
      voiceId,
      modelId,
      audioDataUrl: `data:audio/mpeg;base64,${data.audio_base64}`,
      mimeType: "audio/mpeg",
      durationSec,
      generatedAt: new Date().toISOString(),
      sentences,
      captionStyle: "kinetic",
    };

    const wordCount =
      built.text.match(/\S+/g)?.length || 0;

    return Response.json({
      track,
      audioGenerated: true,
      narrationPlan: {
        wordCount,
        voiceSpeed,
        targetMinutes:
          project.episode.targetMinutes,
        actualMinutes: Number(
          (durationSec / 60).toFixed(2)
        ),
        style: isLongFormDocumentary(project)
          ? "long-form evidence documentary"
          : "standard",
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to generate narration.",
      },
      { status: 500 }
    );
  }
}
