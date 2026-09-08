import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type {
  NarrationSentence,
  NarrationTrack,
  NarrationWord,
} from "@/lib/types";

function activeSentence(
  track: NarrationTrack,
  time: number
): NarrationSentence | undefined {
  return track.sentences.find(
    (sentence) =>
      time >= sentence.startSec - 0.03 &&
      time <= sentence.endSec + 0.03
  );
}

function fallbackWords(sentence: NarrationSentence): NarrationWord[] {
  const parts = sentence.text.split(/\s+/).filter(Boolean);
  const duration = Math.max(0.2, sentence.endSec - sentence.startSec);
  const perWord = duration / Math.max(1, parts.length);

  return parts.map((text, index) => ({
    text,
    startSec: sentence.startSec + index * perWord,
    endSec: sentence.startSec + (index + 1) * perWord,
  }));
}

export function AnimatedCaptions({
  track,
}: {
  track?: NarrationTrack;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!track?.sentences.length) return null;

  const time = frame / fps;
  const sentence = activeSentence(track, time);

  if (!sentence) return null;

  const words =
    sentence.words?.length > 0
      ? sentence.words
      : fallbackWords(sentence);

  let activeIndex = words.findIndex(
    (word) =>
      time >= word.startSec - 0.02 &&
      time <= word.endSec + 0.02
  );

  if (activeIndex < 0) {
    activeIndex = words.findLastIndex((word) => time > word.endSec);
    activeIndex = Math.max(0, activeIndex);
  }

  const groupSize = 6;
  const groupStart =
    Math.floor(activeIndex / groupSize) * groupSize;
  const visibleWords = words.slice(
    groupStart,
    groupStart + groupSize
  );

  const sentenceEnter = interpolate(
    time,
    [sentence.startSec, sentence.startSec + 0.14],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 72,
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: sentenceEnter,
        transform: `translateY(${interpolate(
          sentenceEnter,
          [0, 1],
          [20, 0]
        )}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 1510,
          padding: "17px 26px 19px",
          borderRadius: 20,
          background: "rgba(4,7,15,.79)",
          border: "1px solid rgba(255,255,255,.11)",
          boxShadow: "0 18px 60px rgba(0,0,0,.39)",
          backdropFilter: "blur(12px)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "8px 13px",
        }}
      >
        {visibleWords.map((word, localIndex) => {
          const index = groupStart + localIndex;
          const active =
            time >= word.startSec - 0.02 &&
            time <= word.endSec + 0.02;

          const wordFrame = Math.max(
            0,
            Math.round((time - word.startSec) * fps)
          );

          const pop = active
            ? spring({
                frame: wordFrame,
                fps,
                config: {
                  damping: 16,
                  stiffness: 240,
                },
              })
            : 0;

          const completed = index < activeIndex;

          return (
            <span
              key={`${word.startSec}-${localIndex}`}
              style={{
                display: "inline-block",
                color: active
                  ? "#55d8ff"
                  : completed
                    ? "#f7f9ff"
                    : "#9faac3",
                fontSize: 42,
                lineHeight: 1.05,
                fontWeight: active ? 1000 : 850,
                letterSpacing: -1,
                transform: `scale(${
                  active
                    ? interpolate(pop, [0, 1], [0.88, 1.08])
                    : 1
                })`,
                textShadow: active
                  ? "0 0 28px rgba(85,216,255,.28)"
                  : "none",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
