import path from "node:path";
import { buildStoryworldPackage } from "@/lib/storyworld-engine";
import { buildStoryworldGenerationPlan } from "@/lib/storyworld-generation";
import { readRuntimeAsset } from "@/lib/storyworld-runtime";

export const runtime = "nodejs";

function contentType(file: string) {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".mp3")) return "audio/mpeg";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const worldId = url.searchParams.get("worldId") || "kamau-will";
    const jobId = url.searchParams.get("jobId");
    if (!jobId) return Response.json({ error: "jobId is required." }, { status: 400 });
    const plan = buildStoryworldGenerationPlan(buildStoryworldPackage(worldId));
    const job = plan.jobs.find((item) => item.id === jobId);
    if (!job) return Response.json({ error: "Unknown job." }, { status: 404 });
    const bytes = await readRuntimeAsset(job.outputPath);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": contentType(path.basename(job.outputPath)),
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `inline; filename="${path.basename(job.outputPath)}"`,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Asset not found." }, { status: 404 });
  }
}
