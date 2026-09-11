import type { EpisodeProject } from "./types";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalStoryQuestion(value?: string) {
  const text = clean(value);
  if (!text) return "";

  const flood = text.match(/\bwhy\s+(.+?)\s+floods?\b/i);
  if (flood) {
    const subject = clean(flood[1])
      .replace(/^(?:the hidden system behind|the system behind)\s+/i, "")
      .replace(/^(?:does|do)\s+/i, "")
      .trim();

    if (subject) {
      return `Why does ${subject} flood so often?`;
    }
  }

  const malformed =
    /how do the forces behind\s+why\b/i.test(text) ||
    /forces behind\s+why\b/i.test(text) ||
    /interact to produce the outcome we see/i.test(text);

  if (malformed) {
    const embedded = text.match(/\bwhy\s+(.+?)\s+floods?\b/i);
    if (embedded) {
      return `Why does ${clean(embedded[1])} flood so often?`;
    }
  }

  return text.replace(/[?.!]+$/, "") + "?";
}

export function canonicalProjectQuestion(project: EpisodeProject) {
  return canonicalStoryQuestion(project.episode.question);
}
