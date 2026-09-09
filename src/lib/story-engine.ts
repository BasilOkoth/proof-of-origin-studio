import { buildEpisode } from "./generator";
import { analyzeRetention } from "./retention";
import { getStoryPack } from "./story-packs";
import { refreshVisualIntelligence } from "./visual-reasoning";
import type {
  EpisodeProject,
  EvidenceItem,
  Scene,
  StoryMode,
  ThumbnailConcept,
} from "./types";

export type StoryIntake = {
  mode: StoryMode;
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

function first<T>(items: T[], fallback: T): T {
  return items.length ? items[0] : fallback;
}

function durationPlan(totalSec: number) {
  const weights = [0.09, 0.12, 0.14, 0.13, 0.14, 0.13, 0.12, 0.13];
  return weights.map((weight) => Math.max(6, Math.round(totalSec * weight)));
}

function evidenceText(item?: EvidenceItem) {
  if (!item) return "No supporting evidence has been added yet.";
  const statement = clean(item.statement);
  if (!statement) return "An evidence item is present but has not been described yet.";
  return item.source ? `${statement} Source: ${clean(item.source)}.` : statement;
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

function questionTitle(question: string) {
  const value = clean(question);
  if (!value) return "What Does the Evidence Actually Show?";
  return value.endsWith("?") ? value : `${value}?`;
}

function buildGenericEpisode(intake: StoryIntake): EpisodeProject {
  const pack = getStoryPack(intake.mode);
  const observed = intake.evidence.filter(
    (item) => item.kind === "observed" && clean(item.statement)
  );
  const inferences = intake.evidence.filter(
    (item) => item.kind === "inference" && clean(item.statement)
  );
  const limitations = intake.evidence.filter(
    (item) => item.kind === "limitation" && clean(item.statement)
  );

  const primary = observed[0];
  const secondary = observed[1];
  const tertiary = observed[2];
  const inference = inferences[0];
  const limitation = limitations[0];

  const totalSec = Math.round(Math.max(1, intake.targetMinutes) * 60);
  const d = durationPlan(totalSec);
  const question = clean(intake.question) || pack.questionPlaceholder;
  const brief = clean(intake.experiment) || pack.briefPlaceholder;
  const topic = clean(intake.topic) || pack.label;

  const primaryText = evidenceText(primary);
  const secondaryText = evidenceText(secondary ?? primary);
  const tertiaryText = evidenceText(tertiary ?? secondary ?? primary);
  const inferenceText = evidenceText(inference);
  const limitationText = limitation
    ? evidenceText(limitation)
    : "The available evidence has limits. This story should not claim more than the sources and observations can support.";

  const scenes: Scene[] = [
    scene(
      "hook",
      d[0],
      pack.accentLabel,
      question,
      primaryText,
      `Here is the question: ${question} Instead of starting with an answer, start with the strongest thing we can actually observe. ${primaryText} The rest of this story will separate what the evidence shows from what we think it means, and from what it still cannot establish.`,
      primary ? [primary.id] : []
    ),
    scene(
      "document",
      d[1],
      "THE SETUP",
      topic,
      brief,
      `The context matters. ${brief} This is the frame for interpreting the evidence, not proof by itself. The goal is to make the method, source or intervention visible enough that a viewer can understand where the result came from and what comparison is being made.`,
      []
    ),
    scene(
      "proof_card",
      d[2],
      "OBSERVED EVIDENCE",
      "Start with what can be shown.",
      primaryText,
      `The first piece of observed evidence is: ${primaryText} This should appear on screen as the real source, screenshot, figure, measurement or record wherever possible. Showing the evidence directly reduces the gap between narration and what the viewer can verify for themselves.`,
      primary ? [primary.id] : []
    ),
    scene(
      "diagram",
      d[3],
      "INTERPRETATION",
      "What does that evidence suggest?",
      inferenceText,
      inference
        ? `Now move from observation to interpretation. ${inferenceText} This is an inference, not a new fact. Keeping that label visible matters because reasonable people can sometimes interpret the same evidence differently.`
        : `There is not yet a written inference in the evidence ledger. That is useful information: the video should pause before converting observations into a conclusion that has not been explicitly justified.`,
      inference ? [inference.id] : [],
      {
        visualLabels:
          intake.mode === "world_explained"
            ? ["Place", "Pattern", "Drivers", "Consequences"]
            : ["Observation", "Interpretation", "Context", "Implication"],
      }
    ),
    scene(
      "proof_card",
      d[4],
      "MORE EVIDENCE",
      "Does another observation support or complicate the story?",
      secondaryText,
      `A strong evidence-led story should not depend on one isolated sentence. The next observation is: ${secondaryText} If this evidence points in a different direction, keep that tension rather than forcing everything into a neat conclusion.`,
      secondary ? [secondary.id] : primary ? [primary.id] : []
    ),
    scene(
      "timeline",
      d[5],
      "CONTEXT",
      "Put the result back into the process.",
      tertiaryText,
      `The result also needs context. ${tertiaryText} Ask what happened before this observation, what changed, what stayed constant and what conditions could have influenced the outcome. That is how a result becomes a useful explanation rather than a disconnected statistic.`,
      tertiary ? [tertiary.id] : [],
      {
        visualLabels:
          intake.mode === "world_explained"
            ? ["Baseline", "Pressure", "Change", "Evidence", "What follows"]
            : ["Baseline", "Method", "Observation", "Context", "Meaning"],
      }
    ),
    scene(
      "quote",
      d[6],
      "LIMITATION",
      "What does this not prove?",
      limitationText,
      `This is the trust boundary. ${limitationText} A credible video earns trust by saying where its evidence stops. Limitations should remain in the final edit even when they make the conclusion less dramatic.`,
      limitation ? [limitation.id] : []
    ),
    scene(
      "cta",
      d[7],
      "THE TAKEAWAY",
      "Show the evidence. Label the inference. Keep the limitation.",
      `The current evidence supports a careful answer to: ${question}`,
      `So what can we say? Start with the observed evidence, then the interpretation, then the limitation. That is the answer this episode can responsibly support. If another source, dataset, experiment or counter-example could change the conclusion, that becomes the next useful test rather than something to hide.`,
      []
    ),
  ];

  const purposes = [
    "Stop the scroll with the central question and strongest evidence.",
    "Give enough setup to make the result interpretable.",
    "Deliver visible proof early.",
    "Separate interpretation from observation.",
    "Add corroborating or complicating evidence.",
    "Reset attention by showing process or context.",
    "State the limitation before the conclusion overreaches.",
    "Resolve the question and open the next evidence gap.",
  ];
  scenes.forEach((item, index) => {
    item.retentionPurpose = purposes[index];
  });

  const titles = [
    questionTitle(question),
    intake.mode === "world_explained"
      ? `${topic}: The Pattern Hidden in the Evidence`
      : `${topic}: What the Evidence Actually Shows`,
    `I Looked at the Evidence Behind ${topic}`,
    `${topic}: The Result, the Limitation, and What It Means`,
    `Before You Believe the Claim About ${topic}, Look at This Evidence`,
  ];

  const thumbnails: ThumbnailConcept[] = [
    {
      title: "THE EVIDENCE",
      kicker: "WHAT IT SHOWS",
      visual: "The strongest real source or result centered with one highlighted finding.",
    },
    {
      title: "CLAIM vs PROOF",
      kicker: "NOT THE SAME",
      visual: "Claim on one side and the supporting evidence object on the other.",
    },
    {
      title: "WHAT CHANGED?",
      kicker: "LOOK CLOSER",
      visual: "Before/after, baseline/result or source/finding comparison depending on the story pack.",
    },
  ];

  const hook = `${question} Here is the strongest evidence I found.`;
  const shorts = [
    {
      title: `What the evidence says about ${topic}`,
      hook,
      script: `${hook} ${primaryText} The important part is separating that observation from the conclusion we draw from it.`,
    },
    {
      title: "Observation is not interpretation",
      hook: "One of the easiest ways to overstate evidence is to blur what happened with what we think it means.",
      script: `${primaryText} ${inference ? `The interpretation is: ${inferenceText}` : "The interpretation still needs to be stated and justified."}`,
    },
    {
      title: "The limitation matters",
      hook: "A strong result can still have a boundary.",
      script: `${limitationText} Good evidence communication keeps that boundary visible instead of editing it out.`,
    },
  ];

  const draft: EpisodeProject = {
    version: "origin-studio-1",
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    brand: {
      channelName: intake.channelName || "Evidence Studio",
      byline: intake.byline || "Evidence-led video workflow",
      accentLabel: pack.accentLabel,
    },
    episode: {
      workingTitle: titles[0],
      question,
      experiment: brief,
      targetMinutes: intake.targetMinutes,
      audience: intake.audience,
      storyMode: intake.mode,
    },
    evidence: intake.evidence,
    assets: [],
    scenes,
    titles,
    shorts,
    thumbnails,
    publishing: {
      description: `${question}\n\nThis episode is built from an evidence-led workflow that keeps observations, interpretation and limitations separate while making sources, data and geography visible where the evidence supports them.\n\nMode: ${pack.label}.`,
      pinnedComment: `What evidence, source or counter-example should be added before the next version of this story?`,
      linkedinPost: `I am testing a different way to turn evidence into video: start with what can actually be shown, label the interpretation, and keep the limitation visible.\n\nQuestion: ${question}\n\nStrongest observation: ${primaryText}`,
    },
  };

  draft.retention = analyzeRetention(draft);
  return refreshVisualIntelligence(draft);
}

export function buildStoryEpisode(intake: StoryIntake): EpisodeProject {
  if (intake.mode === "hps") {
    const project = buildEpisode({
      channelName: intake.channelName,
      byline: intake.byline,
      topic: intake.topic,
      question: intake.question,
      experiment: intake.experiment,
      audience: intake.audience,
      targetMinutes: intake.targetMinutes,
      evidence: intake.evidence,
    });
    project.episode.storyMode = "hps";
    return refreshVisualIntelligence(project);
  }

  return buildGenericEpisode(intake);
}
