import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

export type RuntimeAssetStatus = "generating" | "generated" | "approved" | "failed";

export type RuntimeAssetState = {
  jobId: string;
  status: RuntimeAssetStatus;
  outputPath: string;
  provider: string;
  updatedAt: string;
  taskId?: string;
  model?: string;
  error?: string;
};

export type StoryworldRuntimeState = {
  version: 1;
  worldId: string;
  episodeId: string;
  updatedAt: string;
  jobs: Record<string, RuntimeAssetState>;
};

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

export function assertSafeId(value: string, label: string) {
  if (!SAFE_ID.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function storyworldStorageRoot() {
  return path.resolve(process.env.STORYWORLD_ASSET_DIR || "public/storyworld");
}

export function runtimeEpisodeRoot(worldId: string, episodeId: string) {
  assertSafeId(worldId, "worldId");
  assertSafeId(episodeId, "episodeId");
  return path.join(storyworldStorageRoot(), worldId, episodeId);
}

export function runtimePathForOutput(outputPath: string) {
  const marker = "public/storyworld/";
  if (!outputPath.startsWith(marker)) throw new Error(`Unsupported Storyworld output path: ${outputPath}`);
  const relative = outputPath.slice(marker.length);
  const pieces = relative.split("/");
  if (pieces.some((piece) => !piece || piece === "." || piece === "..")) throw new Error("Unsafe asset path.");
  return path.join(storyworldStorageRoot(), ...pieces);
}

export function repoPublicPath(outputPath: string) {
  if (!outputPath.startsWith("public/storyworld/")) throw new Error("Not a Storyworld public path.");
  return path.resolve(outputPath);
}

function statePath(worldId: string, episodeId: string) {
  return path.join(runtimeEpisodeRoot(worldId, episodeId), "_runtime-state.json");
}

export async function readRuntimeState(worldId: string, episodeId: string): Promise<StoryworldRuntimeState> {
  const file = statePath(worldId, episodeId);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as StoryworldRuntimeState;
  } catch {
    return { version: 1, worldId, episodeId, updatedAt: new Date().toISOString(), jobs: {} };
  }
}

export async function writeRuntimeState(state: StoryworldRuntimeState) {
  const file = statePath(state.worldId, state.episodeId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  state.updatedAt = new Date().toISOString();
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2));
  await fs.rename(temp, file);
}

export async function setRuntimeJob(
  state: StoryworldRuntimeState,
  jobId: string,
  patch: Omit<RuntimeAssetState, "jobId" | "updatedAt"> & Partial<Pick<RuntimeAssetState, "updatedAt">>
) {
  state.jobs[jobId] = {
    jobId,
    updatedAt: new Date().toISOString(),
    ...patch,
  };
  await writeRuntimeState(state);
  return state.jobs[jobId];
}

export async function writeRuntimeAsset(outputPath: string, bytes: Buffer | Uint8Array) {
  const file = runtimePathForOutput(outputPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return file;
}

export async function runtimeAssetExists(outputPath: string) {
  try {
    await fs.access(runtimePathForOutput(outputPath));
    return true;
  } catch {
    return false;
  }
}

export async function readRuntimeAsset(outputPath: string) {
  return fs.readFile(runtimePathForOutput(outputPath));
}

export function runtimeAssetRelativePath(outputPath: string) {
  return outputPath.replace(/^public\/storyworld\//, "");
}

export async function syncRuntimeEpisodeToPublic(worldId: string, episodeId: string) {
  const configuredRoot = storyworldStorageRoot();
  const publicRoot = path.resolve("public/storyworld");
  if (configuredRoot === publicRoot) return 0;

  const source = runtimeEpisodeRoot(worldId, episodeId);
  const target = path.join(publicRoot, worldId, episodeId);
  let copied = 0;

  async function walk(src: string, dst: string) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(src, { withFileTypes: true });
    } catch {
      return;
    }
    await fs.mkdir(dst, { recursive: true });
    for (const entry of entries) {
      if (entry.name === "_runtime-state.json") continue;
      const from = path.join(src, entry.name);
      const to = path.join(dst, entry.name);
      if (entry.isDirectory()) await walk(from, to);
      else {
        await fs.copyFile(from, to);
        copied += 1;
      }
    }
  }

  await walk(source, target);
  return copied;
}
