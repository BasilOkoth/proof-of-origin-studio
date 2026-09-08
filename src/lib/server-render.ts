import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";

import type { EpisodeProject } from "@/lib/types";

let cachedBundle: Promise<string> | null = null;

function getServeUrl() {
  if (!cachedBundle) {
    cachedBundle = bundle({
      entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
      webpackOverride: (config) => config,
    }).catch((error) => {
      cachedBundle = null;
      throw error;
    });
  }

  return cachedBundle;
}

export async function renderEpisodeBuffer(project: EpisodeProject) {
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: "OriginEpisode",
    inputProps: project,
  });

  const output = path.join(
    os.tmpdir(),
    `proof-origin-${randomUUID()}.mp4`
  );

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: output,
      inputProps: project,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    return await fs.readFile(output);
  } finally {
    await fs.rm(output, { force: true }).catch(() => undefined);
  }
}

export async function renderShortBuffer(
  project: EpisodeProject,
  shortIndex: number
) {
  const serveUrl = await getServeUrl();

  const inputProps = {
    project,
    shortIndex,
  };

  const composition = await selectComposition({
    serveUrl,
    id: "OriginShort",
    inputProps,
  });

  const output = path.join(
    os.tmpdir(),
    `proof-origin-short-${randomUUID()}.mp4`
  );

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: output,
      inputProps,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    return await fs.readFile(output);
  } finally {
    await fs.rm(output, { force: true }).catch(() => undefined);
  }
}

export async function renderThumbnailBuffer(
  project: EpisodeProject,
  thumbnailIndex: number
) {
  const serveUrl = await getServeUrl();

  const inputProps = {
    project,
    thumbnailIndex,
  };

  const composition = await selectComposition({
    serveUrl,
    id: "OriginThumbnail",
    inputProps,
  });

  const output = path.join(
    os.tmpdir(),
    `proof-origin-thumb-${randomUUID()}.png`
  );

  try {
    await renderStill({
      composition,
      serveUrl,
      output,
      inputProps,
      imageFormat: "png",
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    return await fs.readFile(output);
  } finally {
    await fs.rm(output, { force: true }).catch(() => undefined);
  }
}
