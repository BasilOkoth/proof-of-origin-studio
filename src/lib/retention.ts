import type { EpisodeProject, RetentionBeat, RetentionScore } from "./types";

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(n)));

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasConcreteProof(text: string) {
  return /(\$|KES|USD|%|\b\d{2,}\b|SHA-256|HPS-|RELATED|EXACT|CHANGED|VALID)/i.test(
    text
  );
}

function questionStrength(text: string) {
  let score = 55;
  if (/\?/.test(text)) score += 12;
  if (/\bI\b|\bwe\b/i.test(text)) score += 5;
  if (/\bchanged?\b|\bfake\b|\breal\b|\bdetect\b|\bcatch\b|\bprove\b/i.test(text))
    score += 12;
  if (text.length > 95) score -= 8;
  return clamp(score);
}

export function analyzeRetention(project: EpisodeProject): RetentionScore {
  const scenes = project.scenes;
  const totalSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);

  const hookScene = scenes[0];
  const hook = questionStrength(
    `${project.episode.question} ${hookScene?.headline || ""}`
  );

  const sceneDurations = scenes.map((s) => s.durationSec);
  const longScenes = sceneDurations.filter((d) => d > 55).length;
  const veryLongScenes = sceneDurations.filter((d) => d > 75).length;
  const avgScene = totalSec / Math.max(1, scenes.length);

  let pacing = 90;
  pacing -= longScenes * 5;
  pacing -= veryLongScenes * 8;
  if (avgScene > 50) pacing -= 8;
  if (avgScene < 18) pacing -= 6;
  pacing = clamp(pacing);

  const proofScenes = scenes.filter(
    (s) => s.factIds.length > 0 || hasConcreteProof(`${s.headline} ${s.body}`)
  ).length;
  const proofDensity = clamp((proofScenes / Math.max(1, scenes.length)) * 100);

  const curiositySignals = [
    /\?/,
    /\bwhat happened\b/i,
    /\bcould\b/i,
    /\bwould\b/i,
    /\bwhy\b/i,
    /\bnext\b/i,
    /\bbut\b/i,
    /\bhowever\b/i,
  ];
  const curiosityHits = scenes.reduce(
    (sum, s) =>
      sum +
      curiositySignals.filter((rx) =>
        rx.test(`${s.headline} ${s.body} ${s.narration}`)
      ).length,
    0
  );
  const curiosity = clamp(55 + curiosityHits * 4);

  const avgWordsPerScene =
    scenes.reduce((sum, s) => sum + words(s.narration), 0) /
    Math.max(1, scenes.length);
  let clarity = 92;
  if (avgWordsPerScene > 120) clarity -= 18;
  if (avgWordsPerScene > 160) clarity -= 15;
  clarity = clamp(clarity);

  const beats: RetentionBeat[] = [];
  let cursor = 0;

  scenes.forEach((scene, index) => {
    const at = Math.round(cursor);

    if (index === 0) {
      beats.push({
        atSec: at,
        type: "hook",
        label: "Show the object, the change and the central question immediately.",
      });
    }

    if (index === 1) {
      beats.push({
        atSec: at,
        type: "open_loop",
        label: "Promise a concrete result the viewer will see later.",
      });
    }

    if (scene.kind === "value_swap") {
      beats.push({
        atSec: at,
        type: "pattern_interrupt",
        label: "Visual before → after change.",
      });
    }

    if (
      scene.kind === "confidence" ||
      scene.factIds.length > 0 ||
      hasConcreteProof(scene.body)
    ) {
      beats.push({
        atSec: at,
        type: "proof",
        label: "Put observed evidence on screen.",
      });
    }

    if (scene.kind === "diagram" || scene.kind === "timeline") {
      beats.push({
        atSec: at,
        type: "reset",
        label: "Change visual grammar to reset attention.",
      });
    }

    if (index === scenes.length - 2) {
      beats.push({
        atSec: at,
        type: "payoff",
        label: "Deliver the larger insight promised by the hook.",
      });
    }

    if (scene.kind === "cta") {
      beats.push({
        atSec: at,
        type: "cta",
        label: "Tie the next-video tease to an unanswered experiment.",
      });
    }

    cursor += scene.durationSec;
  });

  const warnings: string[] = [];

  if (hook < 75) {
    warnings.push(
      "The opening question can be more concrete. Put the object and exact change in the first sentence."
    );
  }

  if (longScenes > 0) {
    warnings.push(
      `${longScenes} scene${longScenes === 1 ? "" : "s"} exceed 55 seconds. Consider a visual reset, proof insert or tighter narration.`
    );
  }

  if (proofDensity < 60) {
    warnings.push(
      "Proof density is low. Add more screenshots, measured results, before/after evidence or visible verification receipts."
    );
  }

  const gaps = beats
    .map((beat, i) => (i === 0 ? beat.atSec : beat.atSec - beats[i - 1].atSec))
    .filter((gap) => gap > 45);

  if (gaps.length) {
    warnings.push(
      "There are attention gaps longer than ~45 seconds without a planned proof, reset, payoff or pattern interrupt."
    );
  }

  const overall = clamp(
    hook * 0.27 +
      pacing * 0.22 +
      proofDensity * 0.2 +
      curiosity * 0.18 +
      clarity * 0.13
  );

  return {
    overall,
    hook,
    pacing,
    proofDensity,
    curiosity,
    clarity,
    warnings,
    beats,
  };
}
