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

export type CaptionPlacement =
  | "bottom_center"
  | "bottom_right"
  | "bottom_left"
  | "top_right";

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

function fallbackWords(
  sentence: NarrationSentence
): NarrationWord[] {
  const parts = sentence.text
    .split(/\s+/)
    .filter(Boolean);

  const duration = Math.max(
    0.2,
    sentence.endSec -
      sentence.startSec
  );

  const perWord =
    duration /
    Math.max(1, parts.length);

  return parts.map(
    (text, index) => ({
      text,
      startSec:
        sentence.startSec +
        index * perWord,
      endSec:
        sentence.startSec +
        (index + 1) *
          perWord,
    })
  );
}

function placementStyle(
  placement: CaptionPlacement
): React.CSSProperties {
  switch (placement) {
    case "bottom_right":
      return {
        left: "auto",
        right: 64,
        bottom: 54,
        justifyContent: "flex-end",
      };

    case "bottom_left":
      return {
        left: 64,
        right: "auto",
        bottom: 54,
        justifyContent: "flex-start",
      };

    case "top_right":
      return {
        left: "auto",
        right: 64,
        top: 64,
        bottom: "auto",
        justifyContent: "flex-end",
      };

    default:
      return {
        left: 64,
        right: 64,
        bottom: 54,
        justifyContent: "center",
      };
  }
}

function captionWidth(
  placement: CaptionPlacement
) {
  if (
    placement ===
      "bottom_right" ||
    placement ===
      "bottom_left" ||
    placement ===
      "top_right"
  ) {
    return 760;
  }

  return 980;
}

export function AnimatedCaptions({
  track,
  placement =
    "bottom_center",
  reduced = false,
}: {
  track?: NarrationTrack;
  placement?: CaptionPlacement;
  reduced?: boolean;
}) {
  const frame =
    useCurrentFrame();

  const { fps } =
    useVideoConfig();

  if (
    !track?.sentences.length
  ) {
    return null;
  }

  const time =
    frame / fps;

  const sentence =
    activeSentence(
      track,
      time
    );

  if (!sentence) {
    return null;
  }

  const words =
    sentence.words?.length >
    0
      ? sentence.words
      : fallbackWords(
          sentence
        );

  let activeIndex =
    words.findIndex(
      (word) =>
        time >=
          word.startSec -
            0.02 &&
        time <=
          word.endSec +
            0.02
    );

  if (
    activeIndex < 0
  ) {
    activeIndex =
      words.findLastIndex(
        (word) =>
          time >
          word.endSec
      );

    activeIndex =
      Math.max(
        0,
        activeIndex
      );
  }

  /*
   * Shorter word groups improve readability and stop captions from becoming
   * a second headline. Four words is a good documentary rhythm at 1080p.
   */
  const groupSize = 4;

  const groupStart =
    Math.floor(
      activeIndex /
        groupSize
    ) * groupSize;

  const visibleWords =
    words.slice(
      groupStart,
      groupStart +
        groupSize
    );

  const sentenceEnter =
    interpolate(
      time,
      [
        sentence.startSec,
        sentence.startSec +
          0.12,
      ],
      [0, 1],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const baseFontSize =
    reduced ? 27 : 31;

  return (
    <div
      style={{
        position:
          "absolute",
        zIndex: 100,
        display:
          "flex",
        pointerEvents:
          "none",
        opacity:
          sentenceEnter *
          (reduced
            ? 0.72
            : 1),
        transform:
          `translateY(${interpolate(
            sentenceEnter,
            [0, 1],
            [12, 0]
          )}px)`,
        ...placementStyle(
          placement
        ),
      }}
    >
      <div
        style={{
          width:
            "fit-content",
          maxWidth:
            captionWidth(
              placement
            ),
          minHeight:
            reduced
              ? 50
              : 56,
          padding:
            reduced
              ? "10px 16px 11px"
              : "12px 18px 13px",
          borderRadius:
            15,
          background:
            reduced
              ? "rgba(4,7,15,.70)"
              : "rgba(4,7,15,.88)",
          border:
            "1px solid rgba(255,255,255,.11)",
          boxShadow:
            "0 12px 38px rgba(0,0,0,.34)",
          backdropFilter:
            "blur(12px)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          display:
            "flex",
          justifyContent:
            placement ===
              "bottom_left"
              ? "flex-start"
              : placement ===
                  "bottom_right" ||
                placement ===
                  "top_right"
                ? "flex-end"
                : "center",
          alignItems:
            "center",
          flexWrap:
            "wrap",
          gap:
            "4px 8px",
          textAlign:
            placement ===
              "bottom_left"
              ? "left"
              : placement ===
                  "bottom_right" ||
                placement ===
                  "top_right"
                ? "right"
                : "center",
        }}
      >
        {visibleWords.map(
          (
            word,
            localIndex
          ) => {
            const index =
              groupStart +
              localIndex;

            const active =
              time >=
                word.startSec -
                  0.02 &&
              time <=
                word.endSec +
                  0.02;

            const wordFrame =
              Math.max(
                0,
                Math.round(
                  (time -
                    word.startSec) *
                    fps
                )
              );

            const pop =
              active
                ? spring({
                    frame:
                      wordFrame,
                    fps,
                    config: {
                      damping:
                        17,
                      stiffness:
                        220,
                    },
                  })
                : 0;

            const completed =
              index <
              activeIndex;

            return (
              <span
                key={`${word.startSec}-${localIndex}`}
                style={{
                  display:
                    "inline-block",
                  color:
                    active
                      ? "#55d8ff"
                      : completed
                        ? "#f7f9ff"
                        : "#aab4ca",
                  fontSize:
                    baseFontSize,
                  lineHeight:
                    1.12,
                  fontWeight:
                    active
                      ? 900
                      : 760,
                  letterSpacing:
                    -0.45,
                  transform:
                    `scale(${
                      active
                        ? interpolate(
                            pop,
                            [0, 1],
                            [
                              0.95,
                              1.025,
                            ]
                          )
                        : 1
                    })`,
                  textShadow:
                    active
                      ? "0 0 18px rgba(85,216,255,.18)"
                      : "0 2px 8px rgba(0,0,0,.3)",
                }}
              >
                {word.text}
              </span>
            );
          }
        )}
      </div>
    </div>
  );
}
