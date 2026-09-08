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

export type RenderedFile = {
  path: string;
  size: number;
  cleanup: () => Promise<void>;
};

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

async function finalizeRenderedFile(output: string): Promise<RenderedFile> {
  const stats = await fs.stat(output);
  let cleaned = false;

  return {
    path: output,
    size: stats.size,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await fs.rm(output, { force: true }).catch(() => undefined);
    },
  };
}

async function removeFailedOutput(output: string) {
  await fs.rm(output, { force: true }).catch(() => undefined);
}

/**
 * Render the long-form episode to a temporary file.
 *
 * Important:
 * - We return the file path instead of reading the complete MP4 into Node memory.
 * - concurrency: 1 reduces simultaneous Chromium/frame-render pressure on
 *   memory-constrained Render instances.
 * - The API route owns cleanup after the response stream closes.
 */
export async function renderEpisodeFile(
  project: EpisodeProject
): Promise<RenderedFile> {
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
      concurrency: 1,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    return await finalizeRenderedFile(output);
  } catch (error) {
    await removeFailedOutput(output);
    throw error;
  }
}

/**
 * Render a Short to a temporary MP4 without loading the finished file into RAM.
 */
export async function renderShortFile(
  project: EpisodeProject,
  shortIndex: number
): Promise<RenderedFile> {
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
      concurrency: 1,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    return await finalizeRenderedFile(output);
  } catch (error) {
    await removeFailedOutput(output);
    throw error;
  }
}

/**
 * Render a thumbnail to a temporary PNG. It is streamed too, keeping all
 * render/download paths consistent and avoiding unnecessary Buffer copies.
 */
export async function renderThumbnailFile(
  project: EpisodeProject,
  thumbnailIndex: number
): Promise<RenderedFile> {
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

    return await finalizeRenderedFile(output);
  } catch (error) {
    await removeFailedOutput(output);
    throw error;
  }
}
