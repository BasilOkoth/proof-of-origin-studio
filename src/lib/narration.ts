import type {
  EpisodeProject,
  NarrationSentence,
  NarrationTrack,
  NarrationWord,
} from "./types";

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

export function buildNarrationText(project: EpisodeProject) {
  let text = "";
  const sentences: SentenceSource[] = [];

  project.scenes.forEach((scene) => {
    const narration = scene.narration.trim();
    if (!narration) return;

    if (text) text += " ";

    const sceneStart = text.length;
    text += narration;

    const rx = /[^.!?]+(?:[.!?]+["'”’)]*|$)/g;
    let match: RegExpExecArray | null;

    while ((match = rx.exec(narration))) {
      const raw = match[0];
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const leading = raw.indexOf(trimmed);
      const startChar = sceneStart + match.index + Math.max(0, leading);

      sentences.push({
        id: `${scene.id}-sentence-${sentences.length + 1}`,
        sceneId: scene.id,
        text: trimmed,
        startChar,
        endChar: startChar + trimmed.length,
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

  return {
    ...project,
    scenes,
    narration: track,
  };
}

export const syncSceneDurationsToNarration = applyNarrationTiming;
