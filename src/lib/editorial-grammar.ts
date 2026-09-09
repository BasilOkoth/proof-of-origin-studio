import type { Scene } from "./types";

export type EditorialVisualKind =
  | "kinetic_hook"
  | "comparison"
  | "flow"
  | "timeline"
  | "map_route"
  | "source_pullquote"
  | "stat"
  | "human"
  | "minimal";

export type EditorialVisualPlan = {
  kind: EditorialVisualKind;
  reason: string;
  emphasis?: string;
};

const hasNumber = (text: string) => /\b\d+(?:[.,]\d+)?%?\b/.test(text);
const hasGeo = (text: string) =>
  /\b(map|country|city|region|africa|kenya|nairobi|accra|lagos|senegal|nigeria|route|where|across)\b/i.test(text);
const hasFlow = (text: string) =>
  /\b(flow|moves|through|chain|system|process|pathway|cycle|input|output|supply|material)\b/i.test(text);
const hasContrast = (text: string) =>
  /\b(vs\.?|versus|but|however|instead|before|after|while|difference|compared|rather than)\b/i.test(text);
const hasSource = (text: string) =>
  /\b(report|paper|study|source|evidence|document|according to|dataset|research)\b/i.test(text);
const hasPeople = (text: string) =>
  /\b(people|workers|farmers|families|communities|women|youth|households|collectors|residents)\b/i.test(text);

export function classifyEditorialVisual(scene: Scene): EditorialVisualPlan {
  const text = `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.narration}`;

  if (scene.kind === "hook") {
    return { kind: "kinetic_hook", reason: "Open with motion, hierarchy and an unresolved question." };
  }
  if (scene.kind === "map_story" || hasGeo(text)) {
    return { kind: "map_route", reason: "The claim is spatial, so geography should carry the explanation." };
  }
  if (scene.kind === "value_swap" || hasContrast(text)) {
    return { kind: "comparison", reason: "A contrast is clearer as a visual before/after or split-screen." };
  }
  if (scene.kind === "diagram" || hasFlow(text)) {
    return { kind: "flow", reason: "A process/system should be shown as movement between stages." };
  }
  if (scene.kind === "timeline") {
    return { kind: "timeline", reason: "Chronology should be visible rather than narrated as prose." };
  }
  if (scene.kind === "quote" || scene.kind === "source_highlight" || hasSource(text)) {
    return { kind: "source_pullquote", reason: "The evidence/source should become an on-screen object." };
  }
  if (hasNumber(text)) {
    return { kind: "stat", reason: "A measurable quantity deserves a bold visual payoff." };
  }
  if (hasPeople(text)) {
    return { kind: "human", reason: "A human-centered claim should leave space for documentary imagery." };
  }
  return { kind: "minimal", reason: "Use restrained typography to reset visual attention." };
}

export function extractHeroNumber(scene: Scene): string | undefined {
  const text = `${scene.headline} ${scene.body}`;
  return text.match(/\b\d+(?:[.,]\d+)?%?\b/)?.[0];
}
