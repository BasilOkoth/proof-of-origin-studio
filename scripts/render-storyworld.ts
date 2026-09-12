import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { StoryworldGenerationPlan } from "../src/lib/storyworld-generation-types";
import { syncRuntimeEpisodeToPublic } from "../src/lib/storyworld-runtime";

async function exists(file: string | undefined) {
  if (!file) return false;
  try { await fs.access(path.resolve(file)); return true; } catch { return false; }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: npm run render:storyworld -- plan.json [output.mp4]");
  const plan = JSON.parse(await fs.readFile(inputPath, "utf8")) as StoryworldGenerationPlan;
  const outputPath = process.argv[3] || path.resolve("renders", `${plan.render.worldId}-${plan.render.episodeId}.mp4`);

  const synced = await syncRuntimeEpisodeToPublic(plan.render.worldId, plan.render.episodeId);
  if (synced) console.log(`Synced ${synced} generated Storyworld asset(s) into public/ for rendering.`);

  const assets = new Set<string>();
  for (const shot of plan.render.shots) {
    assets.add(shot.imagePath);
    assets.add(shot.videoPath);
    if (shot.seedImagePath) assets.add(shot.seedImagePath);
    assets.add(`public/storyworld/${plan.render.worldId}/${plan.render.episodeId}/audio/${shot.id}-sfx.mp3`);
  }
  for (const voice of plan.render.voices) assets.add(voice.outputPath);
  assets.add(`public/storyworld/${plan.render.worldId}/${plan.render.episodeId}/audio/music-master.mp3`);

  const assetAvailability: Record<string, boolean> = {};
  for (const asset of assets) assetAvailability[asset] = await exists(asset);

  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/storyworld-index.tsx") });
  const inputProps = { plan, assetAvailability };
  const composition = await selectComposition({ serveUrl, id: "StoryworldEpisode", inputProps });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: outputPath, inputProps });
  console.log(`Rendered storyworld episode: ${outputPath}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
