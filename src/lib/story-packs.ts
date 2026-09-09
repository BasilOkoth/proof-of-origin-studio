import type { StoryMode } from "./types";

export type StoryPack = {
  id: StoryMode;
  label: string;
  description: string;
  briefLabel: string;
  questionPlaceholder: string;
  briefPlaceholder: string;
  accentLabel: string;
};

export const STORY_PACKS: StoryPack[] = [
  {
    id: "hps",
    label: "HPS Verification",
    description:
      "Stress-test provenance, identity and integrity claims with observed verification evidence.",
    briefLabel: "Controlled experiment",
    questionPlaceholder:
      "I changed one number in a registered document. Could HPS detect it?",
    briefPlaceholder:
      "Describe exactly what was changed and how the candidate was verified.",
    accentLabel: "PROVENANCE EXPERIMENT",
  },
  {
    id: "experiment",
    label: "Experiment",
    description:
      "Turn a controlled test into a result-first story that separates observations from interpretation.",
    briefLabel: "Experiment / method",
    questionPlaceholder:
      "What happens when we change one variable and measure the result?",
    briefPlaceholder:
      "Describe the setup, controlled variable, measurement and comparison.",
    accentLabel: "EVIDENCE-LED EXPERIMENT",
  },
  {
    id: "research",
    label: "Research Paper",
    description:
      "Explain a study through its question, method, findings, limitations and practical meaning.",
    briefLabel: "Study / source brief",
    questionPlaceholder:
      "What did this study actually find, and how strong is the evidence?",
    briefPlaceholder:
      "Summarize the study design, population or system, methods and most important result.",
    accentLabel: "RESEARCH EXPLAINER",
  },
  {
    id: "report",
    label: "Report / Impact",
    description:
      "Turn a long report into a concise evidence-backed story about what changed and what remains uncertain.",
    briefLabel: "Report brief",
    questionPlaceholder:
      "What changed, what evidence supports it, and what should happen next?",
    briefPlaceholder:
      "Describe the programme, reporting period, intervention and headline outcome.",
    accentLabel: "REPORT-TO-VIDEO",
  },
  {
    id: "investigation",
    label: "Investigation",
    description:
      "Structure a claim around supporting evidence, conflicting evidence, uncertainty and a careful conclusion.",
    briefLabel: "Claim / investigation brief",
    questionPlaceholder:
      "What can the available evidence actually establish about this claim?",
    briefPlaceholder:
      "State the claim, what was checked, the sources used and what remains unresolved.",
    accentLabel: "EVIDENCE INVESTIGATION",
  },
  {
    id: "explainer",
    label: "Evidence Explainer",
    description:
      "Explain a complex topic without losing the distinction between facts, interpretation and caveats.",
    briefLabel: "Explainer brief",
    questionPlaceholder:
      "What do we know, how do we know it, and what is still uncertain?",
    briefPlaceholder:
      "Describe the topic, audience and key evidence that should anchor the explanation.",
    accentLabel: "EVIDENCE EXPLAINER",
  },
  {
    id: "case_study",
    label: "Case Study",
    description:
      "Show a real problem, intervention, observed outcome, trade-offs and transferable lesson.",
    briefLabel: "Case brief",
    questionPlaceholder:
      "What changed in this case, and what can others learn from it?",
    briefPlaceholder:
      "Describe the starting problem, intervention, observed result and context.",
    accentLabel: "CASE STUDY",
  },
  {
    id: "world_explained",
    label: "World Explained",
    description:
      "Build a premium evidence-led explainer around geography, data, systems, field realities and source-visible visual reasoning.",
    briefLabel: "World / systems brief",
    questionPlaceholder:
      "What is really happening here, why is it happening, and what does the evidence reveal?",
    briefPlaceholder:
      "Describe the place, system or phenomenon, the evidence available, the key tension and the surprising or consequential question.",
    accentLabel: "THE WORLD EXPLAINED THROUGH EVIDENCE",
  },
];

export function getStoryPack(mode: StoryMode) {
  return STORY_PACKS.find((pack) => pack.id === mode) ?? STORY_PACKS[0];
}
