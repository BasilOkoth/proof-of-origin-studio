import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { buildStoryworldPackage } from "@/lib/storyworld-engine";
import { buildStoryworldGenerationPlan } from "@/lib/storyworld-generation";
import type { GenerationJob, StoryworldGenerationPlan } from "@/lib/storyworld-generation-types";
import {
  readRuntimeAsset,
  readRuntimeState,
  repoPublicPath,
  runtimeAssetExists,
  setRuntimeJob,
  storyworldStorageRoot,
  writeRuntimeAsset,
} from "@/lib/storyworld-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  action: z.enum([
    "generate-still",
    "approve-still",
    "start-video",
    "check-video",
    "generate-voice",
    "generate-sfx",
    "generate-music",
    "materialize-captions",
  ]),
  worldId: z.string().min(1),
  jobId: z.string().optional(),
  quality: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
});

type VoiceMap = Record<string, string>;

function getPlan(worldId: string) {
  return buildStoryworldGenerationPlan(buildStoryworldPackage(worldId));
}

function findJob(plan: StoryworldGenerationPlan, jobId: string | undefined, kind?: GenerationJob["kind"]) {
  if (!jobId) throw new Error("jobId is required.");
  const job = plan.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (kind && job.kind !== kind) throw new Error(`${jobId} is not a ${kind} job.`);
  return job;
}

function mimeForPath(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function addReference(form: FormData, filePath: string, index: number) {
  const resolved = repoPublicPath(filePath);
  const bytes = await fs.readFile(resolved);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeForPath(resolved) });
  form.append("image[]", blob, `reference-${index}${path.extname(resolved) || ".png"}`);
}

function referencePrompt(job: GenerationJob, plan: StoryworldGenerationPlan) {
  const characterIds = job.characterIds || [];
  const labels = characterIds.map((id, index) => {
    const ref = plan.characterReferences.find((item) => item.characterId === id);
    return ref ? `Reference image ${index + 1} is the canonical identity for ${ref.characterName}; preserve that person's face, age, skin tone, hair and proportions exactly.` : "";
  }).filter(Boolean);
  const seed = String(job.metadata?.seedImagePath || "");
  if (seed) labels.push(`The final reference image is a composition/mood seed only. Do not copy a conflicting face from it; canonical character references have priority.`);
  return `${labels.join(" ")} ${job.prompt || ""}`.trim();
}

async function openAiStill(plan: StoryworldGenerationPlan, job: GenerationJob, quality: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.STORYWORLD_IMAGE_MODEL || "gpt-image-2.5-sunburst";
  const referencePaths = Array.isArray(job.metadata?.referencePaths) ? job.metadata?.referencePaths as string[] : [];
  const seedImagePath = String(job.metadata?.seedImagePath || "");
  const allRefs = [...referencePaths, ...(seedImagePath ? [seedImagePath] : [])];
  let response: Response;

  if (allRefs.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", referencePrompt(job, plan));
    form.append("size", "720x1280");
    form.append("quality", quality);
    form.append("output_format", "png");
    for (let i = 0; i < allRefs.length; i += 1) await addReference(form, allRefs[i], i);
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: job.prompt, size: "720x1280", quality, output_format: "png", n: 1 }),
    });
  }

  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI image generation failed (${response.status}): ${raw.slice(0, 900)}`);
  const payload = JSON.parse(raw) as { data?: Array<{ b64_json?: string }> };
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI returned no image data.");
  return { bytes: Buffer.from(base64, "base64"), model };
}

function parseVoiceMap(): VoiceMap {
  let map: VoiceMap = {};
  const raw = process.env.STORYWORLD_VOICE_MAP;
  if (raw) {
    try { map = JSON.parse(raw) as VoiceMap; } catch { throw new Error("STORYWORLD_VOICE_MAP is not valid JSON."); }
  }
  return map;
}

function voiceIdFor(profileKey: string) {
  const map = parseVoiceMap();
  if (map[profileKey]) return map[profileKey];
  const envKey = `STORYWORLD_VOICE_${profileKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  return process.env[envKey];
}

async function elevenVoice(job: GenerationJob) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const profileKey = String(job.metadata?.voiceProfileKey || "");
  const voiceId = voiceIdFor(profileKey);
  if (!voiceId) throw new Error(`No ElevenLabs voice is mapped for ${profileKey}. Configure STORYWORLD_VOICE_MAP.`);
  const prompt = job.prompt || "";
  const colon = prompt.indexOf(":");
  const text = colon >= 0 ? prompt.slice(colon + 1).replace(/\s+Delivery:.*$/s, "").trim() : prompt;
  const model = process.env.STORYWORLD_TTS_MODEL || "eleven_multilingual_v2";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!response.ok) throw new Error(`ElevenLabs voice failed (${response.status}): ${(await response.text()).slice(0, 700)}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), model };
}

async function elevenSfx(job: GenerationJob, plan: StoryworldGenerationPlan) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const shot = plan.render.shots.find((item) => item.id === job.shotId);
  const duration = Math.max(0.5, Math.min(30, shot?.durationSec || 3));
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text: job.prompt || "restrained cinematic room tone", model_id: "eleven_text_to_sound_v2", duration_seconds: duration, loop: false, prompt_influence: 0.45 }),
  });
  if (!response.ok) throw new Error(`ElevenLabs SFX failed (${response.status}): ${(await response.text()).slice(0, 700)}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), model: "eleven_text_to_sound_v2" };
}

async function elevenMusic(job: GenerationJob, plan: StoryworldGenerationPlan) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192", {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ prompt: job.prompt || "restrained cinematic score", model_id: "music_v2", music_length_ms: Math.round(plan.render.durationSec * 1000) }),
  });
  if (!response.ok) throw new Error(`ElevenLabs music failed (${response.status}): ${(await response.text()).slice(0, 700)}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), model: "music_v2" };
}

async function startRunwayVideo(job: GenerationJob, stillJob: GenerationJob, plan: StoryworldGenerationPlan) {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is not configured.");
  const still = await readRuntimeAsset(stillJob.outputPath);
  const dataUri = `data:image/png;base64,${still.toString("base64")}`;
  const shot = plan.render.shots.find((item) => item.id === job.shotId);
  const duration = Math.max(2, Math.min(10, Math.round(shot?.durationSec || 5)));
  const model = process.env.STORYWORLD_VIDEO_MODEL || "gen4.5";
  const ratio = process.env.STORYWORLD_VIDEO_RATIO || "720:1280";
  const response = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" },
    body: JSON.stringify({ model, promptImage: dataUri, promptText: job.prompt, ratio, duration }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Runway video start failed (${response.status}): ${raw.slice(0, 900)}`);
  const payload = JSON.parse(raw) as { id?: string };
  if (!payload.id) throw new Error("Runway returned no task ID.");
  return { taskId: payload.id, model };
}

async function checkRunwayVideo(taskId: string) {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is not configured.");
  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Runway task check failed (${response.status}): ${raw.slice(0, 900)}`);
  return JSON.parse(raw) as { status?: string; output?: string[]; failure?: string; failureCode?: string };
}

function providers() {
  let voiceCount = 0;
  try { voiceCount = Object.keys(parseVoiceMap()).length; } catch { voiceCount = 0; }
  return {
    openaiImages: Boolean(process.env.OPENAI_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    runway: Boolean(process.env.RUNWAYML_API_SECRET),
    voiceMapCount: voiceCount,
    imageModel: process.env.STORYWORLD_IMAGE_MODEL || "gpt-image-2.5-sunburst",
    videoModel: process.env.STORYWORLD_VIDEO_MODEL || "gen4.5",
    persistentStorageConfigured: Boolean(process.env.STORYWORLD_ASSET_DIR),
    storageRoot: storyworldStorageRoot(),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const worldId = url.searchParams.get("worldId") || "kamau-will";
    const plan = getPlan(worldId);
    const state = await readRuntimeState(worldId, plan.render.episodeId);
    return Response.json({ state, providers: providers() });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to load Storyworld production state." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const plan = getPlan(body.worldId);
    const state = await readRuntimeState(body.worldId, plan.render.episodeId);

    if (body.action === "generate-still") {
      const job = findJob(plan, body.jobId, "shot-image");
      const quality = body.quality || process.env.STORYWORLD_IMAGE_QUALITY || "medium";
      await setRuntimeJob(state, job.id, { status: "generating", outputPath: job.outputPath, provider: "openai-images", model: process.env.STORYWORLD_IMAGE_MODEL || "gpt-image-2.5-sunburst" });
      try {
        const result = await openAiStill(plan, job, quality);
        await writeRuntimeAsset(job.outputPath, result.bytes);
        const runtimeJob = await setRuntimeJob(state, job.id, { status: "generated", outputPath: job.outputPath, provider: "openai-images", model: result.model });
        return Response.json({ ok: true, runtimeJob, state });
      } catch (error: any) {
        await setRuntimeJob(state, job.id, { status: "failed", outputPath: job.outputPath, provider: "openai-images", error: error?.message || "Image generation failed." });
        throw error;
      }
    }

    if (body.action === "approve-still") {
      const job = findJob(plan, body.jobId, "shot-image");
      if (!(await runtimeAssetExists(job.outputPath))) throw new Error("Generate the still before approving it.");
      const existing = state.jobs[job.id];
      const runtimeJob = await setRuntimeJob(state, job.id, { status: "approved", outputPath: job.outputPath, provider: existing?.provider || "openai-images", model: existing?.model });
      return Response.json({ ok: true, runtimeJob, state });
    }

    if (body.action === "start-video") {
      const job = findJob(plan, body.jobId, "shot-video");
      const stillJob = findJob(plan, `image-${job.shotId}`, "shot-image");
      if (state.jobs[stillJob.id]?.status !== "approved") throw new Error("Approve the still before animation.");
      const result = await startRunwayVideo(job, stillJob, plan);
      const runtimeJob = await setRuntimeJob(state, job.id, { status: "generating", outputPath: job.outputPath, provider: "runway", taskId: result.taskId, model: result.model });
      return Response.json({ ok: true, runtimeJob, state });
    }

    if (body.action === "check-video") {
      const job = findJob(plan, body.jobId, "shot-video");
      const current = state.jobs[job.id];
      if (!current?.taskId) throw new Error("This video job has no Runway task ID.");
      const task = await checkRunwayVideo(current.taskId);
      const status = String(task.status || "").toUpperCase();
      if (status === "SUCCEEDED") {
        const url = task.output?.[0];
        if (!url) throw new Error("Runway task succeeded but returned no video URL.");
        const fileResponse = await fetch(url);
        if (!fileResponse.ok) throw new Error(`Unable to download completed Runway video (${fileResponse.status}).`);
        await writeRuntimeAsset(job.outputPath, Buffer.from(await fileResponse.arrayBuffer()));
        const runtimeJob = await setRuntimeJob(state, job.id, { status: "generated", outputPath: job.outputPath, provider: "runway", taskId: current.taskId, model: current.model });
        return Response.json({ ok: true, runtimeJob, state, providerStatus: status });
      }
      if (status === "FAILED" || status === "CANCELED") {
        const message = task.failure || task.failureCode || `Runway task ${status.toLowerCase()}.`;
        const runtimeJob = await setRuntimeJob(state, job.id, { status: "failed", outputPath: job.outputPath, provider: "runway", taskId: current.taskId, model: current.model, error: message });
        return Response.json({ ok: false, runtimeJob, state, providerStatus: status, error: message }, { status: 502 });
      }
      return Response.json({ ok: true, runtimeJob: current, state, providerStatus: status || "PENDING" });
    }

    if (body.action === "generate-voice") {
      const job = findJob(plan, body.jobId, "voice");
      const result = await elevenVoice(job);
      await writeRuntimeAsset(job.outputPath, result.bytes);
      const runtimeJob = await setRuntimeJob(state, job.id, { status: "generated", outputPath: job.outputPath, provider: "elevenlabs", model: result.model });
      return Response.json({ ok: true, runtimeJob, state });
    }

    if (body.action === "generate-sfx") {
      const job = findJob(plan, body.jobId, "sfx");
      const result = await elevenSfx(job, plan);
      await writeRuntimeAsset(job.outputPath, result.bytes);
      const runtimeJob = await setRuntimeJob(state, job.id, { status: "generated", outputPath: job.outputPath, provider: "elevenlabs", model: result.model });
      return Response.json({ ok: true, runtimeJob, state });
    }

    if (body.action === "generate-music") {
      const job = findJob(plan, "music-master", "music");
      const result = await elevenMusic(job, plan);
      await writeRuntimeAsset(job.outputPath, result.bytes);
      const runtimeJob = await setRuntimeJob(state, job.id, { status: "generated", outputPath: job.outputPath, provider: "elevenlabs", model: result.model });
      return Response.json({ ok: true, runtimeJob, state });
    }

    if (body.action === "materialize-captions") {
      const job = findJob(plan, "captions-master", "caption");
      await writeRuntimeAsset(job.outputPath, Buffer.from(JSON.stringify(plan.render.captions, null, 2)));
      const runtimeJob = await setRuntimeJob(state, job.id, { status: "generated", outputPath: job.outputPath, provider: "storyworld" });
      return Response.json({ ok: true, runtimeJob, state });
    }

    throw new Error("Unsupported action.");
  } catch (error: any) {
    return Response.json({ error: error?.message || "Storyworld production action failed." }, { status: 500 });
  }
}
