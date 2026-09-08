import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

async function main() {
  const inputPath = process.argv[2];
  const thumbnailIndex = Number(process.argv[3] || 0);
  const outputPath =
    process.argv[4] ||
    path.resolve(
      "renders",
      `${path.basename(inputPath || "episode", ".json")}-thumbnail-${thumbnailIndex + 1}.png`
    );

  if (!inputPath) {
    throw new Error(
      "Usage: npm run render:thumbnail -- episode.json [thumbnailIndex] [output.png]"
    );
  }

  const project = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/remotion/index.ts"),
  });

  const inputProps = { project, thumbnailIndex };

  const composition = await selectComposition({
    serveUrl,
    id: "OriginThumbnail",
    inputProps,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await renderStill({
    composition,
    serveUrl,
    output: outputPath,
    inputProps,
  });

  console.log(`Rendered thumbnail: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
