import type {
  EpisodeProject,
  NarrationSentence,
  NarrationTrack,
  NarrationWord,
} from "./types";
import { analyzeRetention } from "./retention";

export type NarrationAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type SentenceSource = {
  id: string;
  sceneId: string;
  text: string;
  startChar: number;
  endChar: number;
};

type SentenceRange = {
  text: string;
  start: number;
  end: number;
};

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "fig",
  "eq",
  "no",
  "st",
  "vs",
  "etc",
]);

function previousToken(input: string, index: number) {
  const before = input.slice(0, index);
  const match = before.match(/([A-Za-z]+)$/);
  return match?.[1]?.toLowerCase() || "";
}

function isDecimalPoint(input: string, index: number) {
  return (
    input[index] === "." &&
    /\d/.test(input[index - 1] || "") &&
    /\d/.test(input[index + 1] || "")
  );
}

function isAbbreviationPoint(input: string, index: number) {
  if (input[index] !== ".") return false;
  const token = previousToken(input, index);
  return ABBREVIATIONS.has(token);
}

function sentenceRanges(input: string): SentenceRange[] {
  const ranges: SentenceRange[] = [];
  let start = 0;

  const push = (endExclusive: number) => {
    const raw = input.slice(start, endExclusive);
    const leading = raw.search(/\S/);
    if (leading < 0) {
      start = endExclusive;
      return;
    }

    const trailingMatch = raw.match(/\s*$/);
    const trailing = trailingMatch?.[0]?.length || 0;
    const trimmedStart = start + leading;
    const trimmedEnd = endExclusive - trailing;
    const text = input.slice(trimmedStart, trimmedEnd);

    if (text) {
      ranges.push({
        text,
        start: trimmedStart,
        end: trimmedEnd,
      });
    }

    start = endExclusive;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (!".!?".includes(ch)) continue;

    if (ch === "." && isDecimalPoint(input, i)) continue;
    if (ch === "." && isAbbreviationPoint(input, i)) continue;

    let end = i + 1;

    while (
      end < input.length &&
      /[.!?"'”’)]/.test(input[end])
    ) {
      end += 1;
    }

    const next = input[end];
    if (next && !/\s/.test(next)) continue;

    push(end);
    i = end - 1;
  }

  if (start < input.length) {
    push(input.length);
  }

  return ranges;
}

export function buildNarrationText(project: EpisodeProject) {
  let text = "";
  const sentences: SentenceSource[] = [];

  project.scenes.forEach((scene) => {
    const narration = scene.narration.trim();
    if (!narration) return;

    if (text) text += " ";

    const sceneStart = text.length;
    text += narration;

    for (const range of sentenceRanges(narration)) {
      const startChar = sceneStart + range.start;

      sentences.push({
        id: `${scene.id}-sentence-${sentences.length + 1}`,
        sceneId: scene.id,
        text: range.text,
        startChar,
        endChar: sceneStart + range.end,
      });
    }
  });

  return { text, sentences };
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

function charStart(alignment: NarrationAlignment, index: number) {
  const values = alignment.character_start_times_seconds;
  return values[clampIndex(index, values.length)] ?? 0;
}

function charEnd(alignment: NarrationAlignment, indexExclusive: number) {
  const values = alignment.character_end_times_seconds;
  return (
    values[clampIndex(indexExclusive - 1, values.length)] ??
    values[values.length - 1] ??
    0
  );
}

function wordTiming(
  sentence: SentenceSource,
  alignment: NarrationAlignment
): NarrationWord[] {
  const result: NarrationWord[] = [];
  const rx = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(sentence.text))) {
    const startChar = sentence.startChar + match.index;
    const endChar = startChar + match[0].length;

    result.push({
      text: match[0],
      startSec: charStart(alignment, startChar),
      endSec: charEnd(alignment, endChar),
    });
  }

  return result;
}

export function timingsFromAlignment(
  project: EpisodeProject,
  alignment: NarrationAlignment
): NarrationSentence[] {
  const built = buildNarrationText(project);

  return built.sentences.map((sentence) => ({
    id: sentence.id,
    sceneId: sentence.sceneId,
    text: sentence.text,
    startSec: charStart(alignment, sentence.startChar),
    endSec: charEnd(alignment, sentence.endChar),
    words: wordTiming(sentence, alignment),
  }));
}

export function estimateNarration(
  project: EpisodeProject,
  wordsPerMinute = 155
): NarrationTrack {
  const built = buildNarrationText(project);
  const secondsPerWord = 60 / Math.max(90, wordsPerMinute);
  let cursor = 0;

  const sentences: NarrationSentence[] = built.sentences.map((sentence) => {
    const startSec = cursor;
    const wordTexts = sentence.text.match(/\S+/g) || [];

    const words: NarrationWord[] = wordTexts.map((text) => {
      const cleanLength = Math.max(
        1,
        text.replace(/[^\p{L}\p{N}]/gu, "").length
      );

      const pause = /[.!?]["'”’)]?$/.test(text)
        ? 0.22
        : /[,;:]$/.test(text)
          ? 0.08
          : 0;

      const duration =
        secondsPerWord *
          Math.max(0.68, Math.min(1.45, cleanLength / 5.2)) +
        pause;

      const wordStart = cursor;
      cursor += duration;

      return {
        text,
        startSec: wordStart,
        endSec: cursor,
      };
    });

    const endSec = Math.max(startSec + 0.35, cursor);
    cursor += 0.08;

    return {
      id: sentence.id,
      sceneId: sentence.sceneId,
      text: sentence.text,
      startSec,
      endSec,
      words,
    };
  });

  return {
    provider: "estimated",
    generatedAt: new Date().toISOString(),
    durationSec: cursor,
    sentences,
    captionStyle: "kinetic",
  };
}

export function applyNarrationTiming(
  project: EpisodeProject,
  track: NarrationTrack
): EpisodeProject {
  const firstStartByScene = new Map<string, number>();

  for (const sentence of track.sentences) {
    if (!firstStartByScene.has(sentence.sceneId)) {
      firstStartByScene.set(sentence.sceneId, sentence.startSec);
    }
  }

  const sceneStarts = project.scenes.map(
    (scene, index) =>
      firstStartByScene.get(scene.id) ??
      (index === 0 ? 0 : undefined)
  );

  let fallbackCursor = 0;

  const scenes = project.scenes.map((scene, index) => {
    const start =
      sceneStarts[index] ??
      fallbackCursor;

    const nextKnown =
      project.scenes
        .slice(index + 1)
        .map((candidate) => firstStartByScene.get(candidate.id))
        .find((value) => typeof value === "number") ??
      track.durationSec;

    const duration = Math.max(
      1.5,
      Number((Math.max(start + 1.5, nextKnown) - start).toFixed(3))
    );

    fallbackCursor = start + duration;

    return {
      ...scene,
      durationSec: duration,
    };
  });

  const timedProject: EpisodeProject = {
    ...project,
    scenes,
    narration: track,
  };

  // CRITICAL:
  // Retention must be recomputed only after the new narration track and
  // scene timings are attached. This prevents stale warnings/scores from
  // earlier narration builds from surviving into the Retention Lab.
  return {
    ...timedProject,
    retention: analyzeRetention(timedProject),
  };
}

export const syncSceneDurationsToNarration = applyNarrationTiming;
