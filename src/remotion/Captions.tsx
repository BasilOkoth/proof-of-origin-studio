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
  | "lower_center"
  | "center"
  | "upper_center";

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
    case "center":
      return {
        left: "50%",
        top: "58%",
        bottom: "auto",
        transform:
          "translate(-50%, -50%)",
      };

    case "upper_center":
      return {
        left: "50%",
        top: "18%",
        bottom: "auto",
        transform:
          "translateX(-50%)",
      };

    default:
      return {
        left: "50%",
        bottom: "8%",
        top: "auto",
        transform:
          "translateX(-50%)",
      };
  }
}

function maxCaptionWidth(
  placement: CaptionPlacement
) {
  return placement === "center"
    ? 900
    : 1040;
}

export function AnimatedCaptions({
  track,
  placement =
    "lower_center",
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
   * Keep narration captions compact enough to read as subtitles rather
   * than a second headline.
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
    reduced ? 27 : 32;

  const placementCss =
    placementStyle(
      placement
    );

  const entranceY =
    interpolate(
      sentenceEnter,
      [0, 1],
      [10, 0]
    );

  const transform =
    placementCss.transform
      ? `${placementCss.transform} translateY(${entranceY}px)`
      : `translateY(${entranceY}px)`;

  return (
    <div
      style={{
        position:
          "absolute",
        zIndex: 100,
        display:
          "flex",
        justifyContent:
          "center",
        alignItems:
          "center",
        pointerEvents:
          "none",
        opacity:
          sentenceEnter *
          (reduced
            ? 0.72
            : 1),
        width:
          "max-content",
        maxWidth:
          "calc(100% - 120px)",
        ...placementCss,
        transform,
      }}
    >
      <div
        style={{
          width:
            "fit-content",
          maxWidth:
            maxCaptionWidth(
              placement
            ),
          minHeight:
            reduced
              ? 48
              : 54,
          padding:
            reduced
              ? "9px 15px 10px"
              : "11px 18px 12px",
          borderRadius:
            14,
          background:
            reduced
              ? "rgba(4,7,15,.68)"
              : "rgba(4,7,15,.86)",
          border:
            "1px solid rgba(255,255,255,.10)",
          boxShadow:
            "0 10px 34px rgba(0,0,0,.34)",
          backdropFilter:
            "blur(12px)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          display:
            "flex",
          justifyContent:
            "center",
          alignItems:
            "center",
          flexWrap:
            "wrap",
          gap:
            "4px 8px",
          textAlign:
            "center",
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
                    -0.4,
                  transform:
                    `scale(${
                      active
                        ? interpolate(
                            pop,
                            [0, 1],
                            [
                              0.96,
                              1.02,
                            ]
                          )
                        : 1
                    })`,
                  textShadow:
                    active
                      ? "0 0 16px rgba(85,216,255,.17)"
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
