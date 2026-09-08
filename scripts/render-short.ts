import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

async function main() {
  const inputPath = process.argv[2];
  const shortIndex = Number(process.argv[3] || 0);
  const outputPath =
    process.argv[4] ||
    path.resolve(
      "renders",
      `${path.basename(inputPath || "episode", ".json")}-short-${shortIndex + 1}.mp4`
    );

  if (!inputPath) {
    throw new Error(
      "Usage: npm run render:short -- episode.json [shortIndex] [output.mp4]"
    );
  }

  const project = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/remotion/index.ts"),
  });

  const inputProps = { project, shortIndex };

  const composition = await selectComposition({
    serveUrl,
    id: "OriginShort",
    inputProps,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
  });

  console.log(`Rendered short: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
