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
    activeIndex = words.findLastIndex(
      (word) => time > word.endSec
    );
    activeIndex = Math.max(0, activeIndex);
  }

  /*
   * Keep subtitle groups short enough to remain inside a true lower-third
   * safe area. Five words works better than the previous six on long names.
   */
  const groupSize = 5;
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
        left: 86,
        right: 86,
        bottom: 118,
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: sentenceEnter,
        transform: `translateY(${interpolate(
          sentenceEnter,
          [0, 1],
          [18, 0]
        )}px)`,
      }}
    >
      <div
        style={{
          width: "fit-content",
          maxWidth: 1260,
          minHeight: 62,
          padding: "14px 22px 16px",
          borderRadius: 18,
          background: "rgba(4,7,15,.82)",
          border: "1px solid rgba(255,255,255,.105)",
          boxShadow: "0 16px 50px rgba(0,0,0,.34)",
          backdropFilter: "blur(12px)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "6px 11px",
          textAlign: "center",
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
                fontSize: 35,
                lineHeight: 1.08,
                fontWeight: active ? 950 : 820,
                letterSpacing: -0.8,
                transform: `scale(${
                  active
                    ? interpolate(
                        pop,
                        [0, 1],
                        [0.92, 1.045]
                      )
                    : 1
                })`,
                textShadow: active
                  ? "0 0 24px rgba(85,216,255,.24)"
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
