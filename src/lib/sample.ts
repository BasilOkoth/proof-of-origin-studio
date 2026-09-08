import type { EpisodeProject } from "./types";
import { buildEpisode } from "./generator";

export function makeSample(): EpisodeProject {
  return buildEpisode({
    channelName: "Proof of Origin",
    byline: "by Human Provenance Standard",
    topic: "Changed payment amount",
    question: "I changed one number in a registered document. Could HPS detect it?",
    experiment: "Change the Amount paid field from $74.34 to $70.00 and verify only the candidate document.",
    audience: "People curious about digital trust, AI, misinformation and verification.",
    targetMinutes: 6.5,
    evidence: [
      {
        id: "fact-1",
        kind: "observed",
        statement: "The candidate was classified as RELATED / MODIFIED.",
        source: "HPS verifier",
      },
      {
        id: "fact-2",
        kind: "observed",
        statement: "The Amount paid field was changed from $74.34 to $70.00.",
        source: "Controlled experiment",
      },
      {
        id: "fact-3",
        kind: "observed",
        statement: "Relationship confidence was 79%, while strict canonical text integrity changed.",
        source: "HPS verifier",
      },
      {
        id: "inf-1",
        kind: "inference",
        statement: "A high relationship score should not be interpreted as proof that the candidate content is unchanged.",
      },
      {
        id: "lim-1",
        kind: "limitation",
        statement: "HPS establishes provenance and integrity evidence; it does not prove that every factual statement inside a document is true.",
      },
    ],
  });
}
