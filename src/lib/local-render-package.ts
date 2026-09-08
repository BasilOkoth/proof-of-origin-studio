"use client";

import JSZip from "jszip";

import type { EpisodeProject } from "@/lib/types";

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const readme = `# Proof of Origin Studio — Local Render Package

This package contains the exact editable episode project exported from Proof of Origin Studio.
It is designed to be rendered on your own computer so the online Render web service does not need to hold Remotion + Chromium in a ~256 MB process.

## First-time setup

1. Install Node.js 22 or newer.
2. Clone or download the Proof of Origin Studio repository:
   https://github.com/BasilOkoth/proof-of-origin-studio
3. Open a terminal in that repository.
4. Run:

   npm install

## Render this episode

Copy the entire folder you downloaded into the repository root, or copy project.json into the repository root.

### Windows

Double-click render-episode-windows.bat

Or in Command Prompt / PowerShell:

   npm run render -- ./project.json ./renders/proof-of-origin-episode.mp4

### macOS / Linux

Run:

   chmod +x render-episode-mac-linux.sh
   ./render-episode-mac-linux.sh

Or:

   npm run render -- ./project.json ./renders/proof-of-origin-episode.mp4

## Shorts

The repository already contains the Short renderer. To render Short 1:

   npm run render:short -- ./project.json 0 ./renders/proof-of-origin-short-1.mp4

## Thumbnail

To render Thumbnail 1:

   npm run render:thumbnail -- ./project.json 0 ./renders/proof-of-origin-thumbnail-1.png

## What is included

- project.json — the complete approved episode blueprint
- assets/ — extracted evidence images/files from the project where possible
- narration/ — extracted narration audio when premium narration exists
- render-episode-windows.bat — one-click Windows render helper
- render-episode-mac-linux.sh — macOS/Linux helper
- README.txt — these instructions

Important: project.json remains the source of truth. It retains the original data URLs so the current Remotion compositions can render exactly as the Studio currently expects. The extracted assets/audio are also included as convenient backups.
`;

function dataUrlParts(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  return {
    mime: match[1] || "application/octet-stream",
    base64: Boolean(match[2]),
    body: match[3],
  };
}

function extensionForMime(mime: string) {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
  };
  return map[mime] || "bin";
}

function addDataUrl(zip: JSZip, path: string, dataUrl: string) {
  const parsed = dataUrlParts(dataUrl);
  if (!parsed) return;

  if (parsed.base64) {
    zip.file(path, parsed.body, { base64: true });
  } else {
    zip.file(path, decodeURIComponent(parsed.body));
  }
}

export async function downloadLocalRenderPackage(project: EpisodeProject) {
  const zip = new JSZip();
  const projectJson = JSON.stringify(project, null, 2);

  zip.file("project.json", projectJson);
  zip.file("README.txt", readme);

  zip.file(
    "render-episode-windows.bat",
    `@echo off\r\nsetlocal\r\nif not exist package.json (\r\n  echo ERROR: Put this package inside the proof-of-origin-studio repository first.\r\n  pause\r\n  exit /b 1\r\n)\r\nif not exist node_modules (\r\n  echo Installing dependencies...\r\n  call npm install\r\n  if errorlevel 1 exit /b 1\r\n)\r\nif not exist renders mkdir renders\r\ncall npm run render -- ./project.json ./renders/proof-of-origin-episode.mp4\r\nif errorlevel 1 (\r\n  echo Render failed. See the error above.\r\n  pause\r\n  exit /b 1\r\n)\r\necho.\r\necho DONE: renders\\proof-of-origin-episode.mp4\r\npause\r\n`
  );

  zip.file(
    "render-episode-mac-linux.sh",
    `#!/usr/bin/env bash\nset -euo pipefail\nif [ ! -f package.json ]; then\n  echo "ERROR: Put this package inside the proof-of-origin-studio repository first."\n  exit 1\nfi\nif [ ! -d node_modules ]; then\n  npm install\nfi\nmkdir -p renders\nnpm run render -- ./project.json ./renders/proof-of-origin-episode.mp4\necho "DONE: renders/proof-of-origin-episode.mp4"\n`
  );

  for (const asset of project.assets || []) {
    if (!asset.dataUrl) continue;
    const parsed = dataUrlParts(asset.dataUrl);
    const ext = parsed ? extensionForMime(parsed.mime) : "bin";
    const base = safeName(asset.name || asset.id || "asset");
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(base);
    addDataUrl(zip, `assets/${hasExt ? base : `${base}.${ext}`}`, asset.dataUrl);
  }

  const narration = project.narration;
  if (narration?.audioDataUrl) {
    const parsed = dataUrlParts(narration.audioDataUrl);
    const ext = extensionForMime(parsed?.mime || narration.mimeType || "audio/mpeg");
    addDataUrl(zip, `narration/narration.${ext}`, narration.audioDataUrl);
    zip.file(
      "narration/timing.json",
      JSON.stringify(
        {
          provider: narration.provider,
          voiceId: narration.voiceId,
          modelId: narration.modelId,
          durationSec: narration.durationSec,
          generatedAt: narration.generatedAt,
          sentences: narration.sentences,
        },
        null,
        2
      )
    );
  }

  zip.file(
    "PACKAGE-INFO.json",
    JSON.stringify(
      {
        format: "proof-origin-studio-local-render-package",
        version: 1,
        projectId: project.id,
        exportedAt: new Date().toISOString(),
        containsNarrationAudio: Boolean(project.narration?.audioDataUrl),
        assetCount: project.assets?.length || 0,
      },
      null,
      2
    )
  );

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  triggerDownload(
    blob,
    `proof-of-origin-${safeName(project.id || "episode")}-local-render.zip`
  );
}
