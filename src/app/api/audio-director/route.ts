import { z } from "zod";
import { buildAudioDirectionPlan, uniqueGenerationCues } from "@/lib/audio-director";
import type { EpisodeProject, EvidenceAsset } from "@/lib/types";
import type { AudioDirection, GeneratedAudioAsset } from "@/lib/audio-types";

export const runtime = "nodejs";

const BodySchema = z.object({
  project: z.any(),
  generate: z.boolean().default(true),
  includeMusic: z.boolean().default(true),
  includeAmbience: z.boolean().default(true),
  includeSfx: z.boolean().default(true),
});

function bytesToDataUrl(bytes: ArrayBuffer, mime = "audio/mpeg") {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

async function elevenMusic(
  apiKey: string,
  prompt: string,
  durationSec: number
): Promise<GeneratedAudioAsset> {
  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      prompt,
      model_id: "music_v2",
      music_length_ms: Math.max(3000, Math.min(600000, Math.round(durationSec * 1000))),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs Music failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const bytes = await response.arrayBuffer();
  const id = crypto.randomUUID();
  return {
    id,
    name: "music-origin-documentary-score.mp3",
    mimeType: "audio/mpeg",
    dataUrl: bytesToDataUrl(bytes),
    provenance: {
      provider: "elevenlabs",
      endpoint: "/v1/music",
      modelId: "music_v2",
      prompt,
      generatedAt: new Date().toISOString(),
      outputFormat: "mp3_48000_192",
    },
  };
}

async function elevenSfx(
  apiKey: string,
  prompt: string,
  durationSec: number,
  loop: boolean,
  label: string
): Promise<GeneratedAudioAsset> {
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: prompt,
      model_id: "eleven_text_to_sound_v2",
      duration_seconds: Math.max(0.5, Math.min(30, durationSec)),
      loop,
      prompt_influence: 0.45,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs Sound Effects failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const bytes = await response.arrayBuffer();
  const id = crypto.randomUUID();
  return {
    id,
    name: `${slug(label)}.mp3`,
    mimeType: "audio/mpeg",
    dataUrl: bytesToDataUrl(bytes),
    provenance: {
      provider: "elevenlabs",
      endpoint: "/v1/sound-generation",
      modelId: "eleven_text_to_sound_v2",
      prompt,
      generatedAt: new Date().toISOString(),
      outputFormat: "mp3_44100_128",
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;

    if (!project?.scenes?.length) {
      return Response.json({ error: "The episode has no scenes." }, { status: 400 });
    }

    const direction = buildAudioDirectionPlan(project);

    if (!body.generate) {
      return Response.json({ direction, generated: false });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "ELEVENLABS_API_KEY is not configured." },
        { status: 503 }
      );
    }

    const generated: GeneratedAudioAsset[] = [];

    if (body.includeMusic) {
      const score = await elevenMusic(
        apiKey,
        direction.score.prompt,
        direction.score.durationSec
      );
      direction.score.assetId = score.id;
      generated.push(score);
    }

    const generationCues = uniqueGenerationCues(direction);

    // Sequential generation is intentional: it avoids burst rate-limit problems
    // and makes errors easier to attribute to a specific cue.
    for (const cue of generationCues) {
      if (cue.kind === "ambience" && !body.includeAmbience) continue;
      if (cue.kind === "sfx" && !body.includeSfx) continue;
      if (cue.kind === "music") continue;

      const asset = await elevenSfx(
        apiKey,
        cue.prompt,
        cue.durationSec,
        Boolean(cue.loop),
        cue.label
      );
      generated.push(asset);

      // Attach this reusable asset to every equivalent cue.
      for (const target of direction.cues) {
        if (
          target.kind === cue.kind &&
          target.label === cue.label &&
          target.prompt === cue.prompt
        ) {
          target.assetId = asset.id;
        }
      }
    }

    direction.assets = generated;

    const existing = project.assets || [];
    const updatedProject: EpisodeProject = {
      ...project,
      assets: [
        ...existing.filter((asset) => !generated.some((g) => g.id === asset.id)),
        ...generated.map(({ provenance: _provenance, ...asset }) => asset as EvidenceAsset),
      ],
    };

    return Response.json({
      direction,
      updatedProject,
      generated: true,
      assetCount: generated.length,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Unable to generate audio direction." },
      { status: 500 }
    );
  }
}
