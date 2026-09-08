import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { NarrationSentence, NarrationTrack } from "@/lib/types";

function sentenceAtTime(
  track: NarrationTrack,
  timeSec: number
): NarrationSentence | undefined {
  return track.sentences.find(
    (sentence) =>
      timeSec >= sentence.startSec - 0.03 &&
      timeSec <= sentence.endSec + 0.03
  );
}

export function KineticCaptions({
  track,
}: {
  track: NarrationTrack;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const sentence = sentenceAtTime(track, timeSec);

  if (!sentence?.words.length) return null;

  const activeIndex = Math.max(
    0,
    sentence.words.findIndex(
      (word) => timeSec >= word.startSec && timeSec <= word.endSec
    )
  );

  const safeActive =
    activeIndex >= 0 ? activeIndex : sentence.words.length - 1;

  // Keep captions compact and highly readable: six-word kinetic phrases.
  const groupSize = 6;
  const groupStart = Math.floor(safeActive / groupSize) * groupSize;
  const visibleWords = sentence.words.slice(
    groupStart,
    groupStart + groupSize
  );

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 76,
        transform: "translateX(-50%)",
        width: 1500,
        display: "flex",
        justifyContent: "center",
        zIndex: 100,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "11px 15px",
          padding: "17px 26px 19px",
          borderRadius: 20,
          background: "rgba(4,7,14,.72)",
          border: "1px solid rgba(255,255,255,.11)",
          boxShadow: "0 18px 55px rgba(0,0,0,.42)",
          backdropFilter: "blur(14px)",
        }}
      >
        {visibleWords.map((word, localIndex) => {
          const globalIndex = groupStart + localIndex;
          const active =
            timeSec >= word.startSec && timeSec <= word.endSec;

          const localFrame = Math.max(
            0,
            Math.round((timeSec - word.startSec) * fps)
          );

          const pop = active
            ? spring({
                frame: localFrame,
                fps,
                config: { damping: 15, stiffness: 230 },
              })
            : 0;

          const scale = active
            ? interpolate(pop, [0, 1], [0.88, 1.08])
            : globalIndex < safeActive
              ? 1
              : 0.98;

          return (
            <span
              key={`${word.startSec}-${localIndex}`}
              style={{
                display: "inline-block",
                color: active
                  ? "#55d8ff"
                  : globalIndex < safeActive
                    ? "#f7f9ff"
                    : "#9da9c4",
                fontSize: 43,
                lineHeight: 1.05,
                letterSpacing: -1.2,
                fontWeight: active ? 1000 : 850,
                transform: `scale(${scale})`,
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
