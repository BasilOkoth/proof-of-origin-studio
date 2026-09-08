import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
} from "@remotion/renderer";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Usage: npm run render -- ./path/to/episode.json [output.mp4]"
    );
  }

  const outputPath =
    process.argv[3] ||
    path.resolve("renders", `${path.basename(inputPath, ".json")}.mp4`);

  const project = JSON.parse(await fs.readFile(inputPath, "utf8"));

  const serveUrl = await bundle({
    entryPoint: path.resolve("src/remotion/index.ts"),
  });

  const composition = await selectComposition({
    serveUrl,
    id: "OriginEpisode",
    inputProps: project,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: project,
  });

  console.log(`Rendered: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
