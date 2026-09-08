import type {
  EpisodeProject,
  EvidenceItem,
  Scene,
  ThumbnailConcept,
} from "./types";
import { analyzeRetention } from "./retention";

type Intake = {
  channelName: string;
  byline: string;
  topic: string;
  question: string;
  experiment: string;
  audience: string;
  targetMinutes: number;
  evidence: EvidenceItem[];
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function factText(evidence: EvidenceItem[], kind: EvidenceItem["kind"]) {
  return evidence
    .filter((item) => item.kind === kind)
    .map((item) => clean(item.statement))
    .filter(Boolean);
}

function first<T>(items: T[], fallback: T): T {
  return items.length ? items[0] : fallback;
}

function durationPlan(totalSec: number) {
  const weights = [0.07, 0.08, 0.1, 0.1, 0.12, 0.11, 0.12, 0.1, 0.1, 0.1];
  return weights.map((weight) => Math.max(5, Math.round(totalSec * weight)));
}

function scene(
  kind: Scene["kind"],
  durationSec: number,
  eyebrow: string,
  headline: string,
  body: string,
  narration: string,
  factIds: string[] = [],
  extra: Partial<Scene> = {}
): Scene {
  return {
    id: crypto.randomUUID(),
    kind,
    durationSec,
    eyebrow,
    headline,
    body,
    narration,
    factIds,
    ...extra,
  };
}

export function buildEpisode(intake: Intake): EpisodeProject {
  const observed = factText(intake.evidence, "observed");
  const inferences = factText(intake.evidence, "inference");
  const limitations = factText(intake.evidence, "limitation");
  const observedIds = intake.evidence
    .filter((item) => item.kind === "observed")
    .map((item) => item.id);

  const totalSec = Math.round(intake.targetMinutes * 60);
  const d = durationPlan(totalSec);

  const hookFact = first(
    observed,
    "The document changed, but it still looked convincing."
  );

  const changeFact =
    observed.find((fact) => /(?:→|->)/.test(fact)) ||
    observed.find((fact) => /changed from|text removed/i.test(fact)) ||
    observed[1] ||
    hookFact;

  const relationshipFact =
    observed.find((fact) => /relationship:/i.test(fact)) ||
    observed.find((fact) => /RELATED|EXACT ASSET|DERIVATIVE/i.test(fact)) ||
    observed[2] ||
    hookFact;

  const confidenceFact =
    observed.find((fact) => /relationship confidence/i.test(fact)) ||
    relationshipFact;

  const integrityFact =
    observed.find((fact) => /text integrity/i.test(fact)) ||
    observed.find((fact) => /canonical|SimHash/i.test(fact)) ||
    relationshipFact;

  const witnessFact =
    observed.find((fact) => /critical-value|unmatched|unexplained/i.test(fact)) ||
    observed.find((fact) => /signature/i.test(fact)) ||
    relationshipFact;

  const limitation = first(
    limitations,
    "A provenance result does not prove that every claim inside a document is factually true."
  );
  const inference = first(
    inferences,
    "The most useful question is not whether a file looks official, but whether its origin and integrity can be demonstrated."
  );

  const titleCore = clean(intake.topic || intake.experiment || intake.question);

  const scenes: Scene[] = [
    scene(
      "hook",
      d[0],
      "REAL EXPERIMENT",
      intake.question,
      hookFact,
      `Look at this file for a moment, because the interesting part is not whether it looks convincing. The question is: ${intake.question} I made one controlled change and then treated the altered file like something an ordinary recipient might receive. I did not tell the verifier what I changed first. ${hookFact} By the end of this test, I want a precise answer to two different questions: can the system still connect the candidate to its registered source, and can it tell that the content is no longer exactly the same?`,
      observedIds.slice(0, 1)
    ),
    scene(
      "document",
      d[1],
      "THE SETUP",
      intake.experiment,
      "Start with the exact registered object, then make one controlled change.",
      `Here is the setup. ${intake.experiment} The important thing is control. If I change ten things at once, the result becomes difficult to interpret. So the goal is to keep the document visually and structurally as close to the registered version as possible while changing one meaningful detail. I also want the test to resemble a real verification situation: the verifier should be able to work from the candidate in front of them, rather than relying on me to hand them the original file. That distinction matters because real recipients usually possess the suspicious or modified copy, not the issuer's pristine source.`,
      observedIds.slice(0, 2)
    ),
    scene(
      "value_swap",
      d[2],
      "THE CHANGE",
      "One small edit can carry a large meaning.",
      changeFact,
      `Now the controlled alteration. ${changeFact} This is exactly the kind of change that can be visually small but semantically large. A few characters can change an amount, a date, a percentage, a score or a contractual obligation while leaving the rest of the page almost untouched. That is why appearance alone is a weak test. A human reader may see the same logo, the same layout and the same wording and reasonably assume nothing important changed. The experiment asks whether the provenance and integrity evidence can make a finer distinction than visual familiarity can.`,
      observedIds.filter((id) => id).slice(0, 4),
      {
        before: extractBeforeAfter(changeFact)[0],
        after: extractBeforeAfter(changeFact)[1],
      }
    ),
    scene(
      "proof_card",
      d[3],
      "WHAT HPS CHECKS",
      "Identity first. Relationship second.",
      "Exact SHA-256 answers whether the bytes are identical. Resilient fingerprints help determine whether a changed file is still related.",
      `Before looking at the result, it helps to separate the layers. An exact SHA-256 match answers a narrow but powerful question: are these the exact same bytes? If the answer is no, that does not automatically mean the file is unrelated or fraudulent. Files can change through conversion, scanning, messaging apps, OCR or editing. So HPS also uses supporting fingerprints to ask whether the candidate remains related to a registered digital object. Then the integrity layers ask a different question again: even if the relationship is strong, did the text or a registered critical value change? Keeping those questions separate prevents one similarity score from being mistaken for proof of identity.`,
      []
    ),
    scene(
      "confidence",
      d[4],
      "THE RESULT",
      relationshipFact,
      "Show the observed result, not an exaggerated claim.",
      `Now the observed result. ${relationshipFact} ${confidenceFact !== relationshipFact ? confidenceFact : ""} ${integrityFact !== relationshipFact && integrityFact !== confidenceFact ? integrityFact : ""} The wording here matters. A relationship result means the candidate has evidence connecting it to the registered object. It does not mean the candidate is byte-for-byte identical. And relationship confidence is exactly that: confidence in the relationship, not an authenticity percentage and not a probability that every statement inside the file is true. This is where a good verifier has to resist the temptation to turn a nuanced result into a simple green badge.`,
      observedIds.slice(0, 8),
      { metric: extractPercent(confidenceFact) }
    ),
    scene(
      "diagram",
      d[5],
      "HOW TO READ IT",
      "Related does not mean identical.",
      inference,
      `This is the interpretation I want viewers to remember. ${inference} In digital provenance, several things can be true at the same time. A candidate can be strongly related to a registered source. Its registry and creator signatures can still be valid. And yet its own content can differ from the registered text. Those are not contradictory findings. They describe different layers of evidence. The useful mental model is: first establish exact identity if possible; if exact identity fails, establish relationship; then inspect the integrity evidence for meaningful changes. That structure is much safer than asking a single vague question like, "Is this document authentic?"`,
      intake.evidence.filter((x) => x.kind === "inference").map((x) => x.id)
    ),
    scene(
      "proof_card",
      d[6],
      "THE TRUST BOUNDARY",
      "Provenance is not the same thing as truth.",
      limitation,
      `There is also a boundary that should stay visible in every episode. ${limitation} A cryptographic signature can tell us something important about who signed a provenance record and whether that signed record was altered. It cannot magically tell us whether the issuer made a factual mistake, whether a number was truthful when first issued, or whether the underlying claim is lawful or fair. HPS is therefore not a universal truth detector. The stronger and more credible claim is narrower: it helps establish where a digital object came from, whether the exact bytes match, how a candidate relates to a registered object, and what integrity evidence survives.`,
      intake.evidence.filter((x) => x.kind === "limitation").map((x) => x.id)
    ),
    scene(
      "timeline",
      d[7],
      "WHY THIS MATTERS",
      "Digital files move through messy real-world workflows.",
      witnessFact,
      `Why build all these layers instead of simply rejecting every changed file? Because real digital documents do not stay pristine. They move through WhatsApp. A PDF becomes a Word file. A person takes a phone photograph. A scanner introduces OCR differences. A screenshot removes metadata. Sometimes those transformations are harmless; sometimes someone changes a material value. ${witnessFact} A practical provenance system has to preserve the connection to the source when ordinary transformation occurs, while becoming more cautious when integrity evidence changes. That is a harder problem than exact hashing alone, but it is also much closer to the way documents actually travel between people.`,
      observedIds.slice(-4)
    ),
    scene(
      "quote",
      d[8],
      "THE BIGGER IDEA",
      "Stop asking: “Does this look official?”",
      "Start asking: “Can the claimed source prove it issued this exact or related object?”",
      `The bigger idea is a change in how we think about trust. For a long time, people have relied on visual signals: letterheads, logos, seals, signatures, formatting and familiar institutional language. Those signals still have value, but all of them can be copied into another file. The stronger question is whether the claimed source can produce verifiable evidence connecting itself to the digital object in front of you. That does not eliminate judgment, but it changes the starting point from appearance to provenance. And as AI makes convincing digital material cheaper to create, I think that distinction becomes more important, not less.`,
      []
    ),
    scene(
      "cta",
      d[9],
      "NEXT TEST",
      "What should we try to break next?",
      "Documents. Images. Screenshots. AI-generated content. Research outputs.",
      `So that is the result of this experiment. The interesting part is not simply whether HPS passed or failed; it is what the test revealed about the boundary between exact identity, relationship and content integrity. The next question should be harder. We can send the file through a messaging app, photograph it, convert it again, change a date instead of an amount, or test an AI-generated asset with disclosed provenance. If you want to follow the stress tests, subscribe. And if there is a specific digital object or manipulation you think HPS should be able to handle, put it in the comments. That can become the next experiment.`,
      []
    ),
  ];

  scenes.forEach((item, index) => {
    const purposes = [
      "Stop the scroll: object + controlled change + question.",
      "Create an open loop: promise the viewer a measurable result.",
      "Pattern interrupt: show the exact before/after edit.",
      "Clarify the verification mechanism without slowing momentum.",
      "First major payoff: show the observed result prominently.",
      "Reframe the result so viewers do not confuse similarity with identity.",
      "Trust reset: state the limitation before the viewer can object.",
      "Pattern reset: shift to a transformation timeline.",
      "Deliver the bigger conceptual payoff.",
      "Convert curiosity into the next episode rather than a generic subscribe ask.",
    ];
    item.retentionPurpose = purposes[index] || "Maintain forward motion.";
  });

  const titles = [
    questionTitle(intake.question),
    `I Changed One Detail in a Digital Document. Could It Be Detected?`,
    `${titleCore}: What the Verification Result Actually Means`,
    `This File Looked Fine. The Provenance Evidence Said Otherwise.`,
    `Can You Tell When a Digital Document Has Been Altered?`,
  ];

  const thumbnails: ThumbnailConcept[] = [
    {
      title: "ONE CHANGE",
      kicker: "CAUGHT?",
      visual: "Large before → after value in the center, document blurred behind it.",
    },
    {
      title: "LOOKS REAL",
      kicker: "BUT CHANGED",
      visual: "Official-looking document on left, HPS warning card on right.",
    },
    {
      title: "SAME FILE?",
      kicker: "NOT QUITE",
      visual: "Two nearly identical documents with a single highlighted difference.",
    },
  ];

  const hook = `I changed one thing in this file. Could a verifier find it without already knowing what I changed?`;
  const shorts = [
    {
      title: "One change. Would HPS catch it?",
      hook,
      script: `${hook} ${hookFact} ${relationshipFact} The important part: provenance evidence can show that a file is related without pretending it is unchanged.`,
    },
    {
      title: "Related does not mean identical",
      hook: "A 90% similarity score can still hide an important edit.",
      script: `A file can remain strongly related to the original while one value, date or sentence changes. That is why HPS separates relationship confidence from exact text integrity.`,
    },
    {
      title: "Stop trusting letterheads",
      hook: "A logo can look official and still tell you nothing about origin.",
      script: `The better question is not whether a document looks official. It is whether the claimed issuer can cryptographically connect itself to the exact digital object you received.`,
    },
  ];

  const draft: EpisodeProject = {
    version: "origin-studio-1",
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    brand: {
      channelName: intake.channelName || "Proof of Origin",
      byline: intake.byline || "by Human Provenance Standard",
      accentLabel: "TRUTH-FIRST VIDEO SYSTEM",
    },
    episode: {
      workingTitle: titles[0],
      question: intake.question,
      experiment: intake.experiment,
      targetMinutes: intake.targetMinutes,
      audience: intake.audience,
    },
    evidence: intake.evidence,
    assets: [],
    scenes,
    titles,
    shorts,
    thumbnails,
    publishing: {
      description: `${intake.question}\n\nIn this episode, we run a controlled digital-provenance experiment and examine what the result really supports. The goal is not to declare a file “true” or “fake” from appearance alone, but to test origin, integrity and relationship evidence carefully.\n\nBuilt with a truth-first workflow: observations are separated from inference and limitations.`,
      pinnedComment: `What should I test next: a screenshot, a WhatsApp-forwarded PDF, a scanned certificate, an AI-generated image, or something else?`,
      linkedinPost: `One of the hardest problems in digital trust is that tiny edits can carry huge meaning.\n\nI ran a controlled test: ${intake.experiment}\n\nThe interesting question was not “does it still look official?” but “what can the provenance evidence actually support?”\n\nThat is the kind of experiment I will be documenting on ${intake.channelName || "Proof of Origin"}.`,
    },
  };

  draft.retention = analyzeRetention(draft);
  return draft;
}

function questionTitle(question: string) {
  const trimmed = clean(question);
  if (!trimmed) return "Can You Tell When a Digital File Has Been Altered?";
  return trimmed.endsWith("?") ? trimmed : `${trimmed}?`;
}

function extractPercent(value: string) {
  const match = value.match(/\b(\d{1,3})(?:\.\d+)?\s*%/);
  if (!match) return 79;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function extractBeforeAfter(value: string): [string, string] {
  const arrows = value.match(/([$€£]?\s*\d[\d,.]*)\s*(?:→|->|to)\s*([$€£]?\s*\d[\d,.]*)/i);
  if (arrows) return [arrows[1].trim(), arrows[2].trim()];
  return ["ORIGINAL", "CHANGED"];
}
