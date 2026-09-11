import type {
  EpisodeProject,
  RetentionBeat,
  RetentionScore,
  Scene,
  StoryMode,
} from "./types";

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(n)));

function clean(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function words(text?: string) {
  return clean(text).split(/\s+/).filter(Boolean).length;
}

function mode(project: EpisodeProject): StoryMode {
  return project.episode.storyMode || "explainer";
}

function isEvidenceDocumentary(project: EpisodeProject) {
  return new Set<StoryMode>([
    "world_explained",
    "research",
    "report",
    "investigation",
    "explainer",
    "case_study",
  ]).has(mode(project));
}

function hasConcreteProof(text: string) {
  return /(\$|KES|USD|%|\b\d+(?:\.\d+)?\b|millimetres?|mm\b|km\b|SHA-256|HPS-|RELATED|EXACT|CHANGED|VALID)/i.test(
    text
  );
}

function isEvidenceRich(scene: Scene) {
  return Boolean(
    scene.factIds?.length ||
      scene.chart ||
      scene.map ||
      scene.assetId ||
      scene.visualPlan?.evidenceIds?.length ||
      hasConcreteProof(`${scene.headline} ${scene.body} ${scene.narration}`)
  );
}

function isVisualReset(scene: Scene) {
  return Boolean(
    scene.kind === "diagram" ||
      scene.kind === "timeline" ||
      scene.kind === "data_chart" ||
      scene.kind === "map_story" ||
      scene.kind === "source_highlight" ||
      scene.visualPlan?.kind === "systems_diagram" ||
      scene.visualPlan?.kind === "comparison" ||
      scene.visualPlan?.kind === "field_evidence" ||
      scene.visualPlan?.kind === "map_story" ||
      scene.visualPlan?.kind === "data_chart"
  );
}

function documentaryHookScore(project: EpisodeProject) {
  const first = project.scenes[0];
  const text = clean(
    `${project.episode.question} ${first?.headline || ""} ${first?.narration || ""}`
  );

  let score = 58;

  if (/\?/.test(text)) score += 8;
  if (/\bwhy\b|\bhow\b/i.test(text)) score += 9;
  if (
    /\bflood|rain|waste|city|climate|river|drainage|forest|heat|water|mining|health|energy\b/i.test(
      text
    )
  ) {
    score += 8;
  }
  if (/\bbut\b|\byet\b|\bhowever\b|\bstops too early\b/i.test(text)) {
    score += 8;
  }
  if (
    /\btrigger\b|\bsystem\b|\bmechanism\b|\bwhat happens next\b|\bnot the whole\b/i.test(
      text
    )
  ) {
    score += 6;
  }
  if (words(first?.narration) >= 18 && words(first?.narration) <= 85) {
    score += 4;
  }

  return clamp(score);
}

function experimentHookScore(project: EpisodeProject) {
  const first = project.scenes[0];
  const text = clean(
    `${project.episode.question} ${first?.headline || ""} ${first?.narration || ""}`
  );

  let score = 55;
  if (/\?/.test(text)) score += 10;
  if (/\bI\b|\bwe\b/i.test(text)) score += 5;
  if (
    /\bchanged?\b|\bfake\b|\breal\b|\bdetect\b|\bcatch\b|\bprove\b|\btest\b/i.test(
      text
    )
  ) {
    score += 14;
  }
  if (hasConcreteProof(text)) score += 6;

  return clamp(score);
}

function hookScore(project: EpisodeProject) {
  return isEvidenceDocumentary(project)
    ? documentaryHookScore(project)
    : experimentHookScore(project);
}

function sceneStartTimes(project: EpisodeProject) {
  const starts = new Map<string, number>();

  if (project.narration?.sentences?.length) {
    for (const sentence of project.narration.sentences) {
      if (!starts.has(sentence.sceneId)) {
        starts.set(sentence.sceneId, sentence.startSec);
      }
    }
  }

  let cursor = 0;
  for (const scene of project.scenes) {
    if (!starts.has(scene.id)) starts.set(scene.id, cursor);
    cursor += scene.durationSec;
  }

  return starts;
}

function currentDuration(project: EpisodeProject) {
  if (
    project.narration?.durationSec &&
    Number.isFinite(project.narration.durationSec)
  ) {
    return project.narration.durationSec;
  }

  return project.scenes.reduce(
    (sum, scene) => sum + Math.max(0, scene.durationSec || 0),
    0
  );
}

function attentionBeats(project: EpisodeProject): RetentionBeat[] {
  const beats: RetentionBeat[] = [];
  const starts = sceneStartTimes(project);
  const documentary = isEvidenceDocumentary(project);

  project.scenes.forEach((scene, index) => {
    const at = Math.round(starts.get(scene.id) || 0);

    if (index === 0) {
      beats.push({
        atSec: at,
        type: "hook",
        label: documentary
          ? "State the phenomenon, tension and central question immediately."
          : "Show the object, change and central question immediately.",
      });
    }

    if (index === 1) {
      beats.push({
        atSec: at,
        type: "open_loop",
        label: documentary
          ? "Open the causal question the film will resolve."
          : "Promise the concrete result the viewer will see later.",
      });
    }

    if (isEvidenceRich(scene)) {
      beats.push({
        atSec: at,
        type: "proof",
        label: documentary
          ? "Put the source, measurement, map or field evidence on screen."
          : "Put observed evidence on screen.",
      });
    }

    if (isVisualReset(scene)) {
      beats.push({
        atSec: at,
        type: "reset",
        label: "Change visual grammar to reset attention.",
      });
    }

    if (scene.kind === "value_swap") {
      beats.push({
        atSec: at,
        type: "pattern_interrupt",
        label: "Visual before → after change.",
      });
    }

    // A long narrated scene can contain several proof/reset beats even if it is
    // one scene in the project. Use narration timing so Retention Lab tracks the
    // current script instead of the original storyboard duration.
    const sentenceTimes =
      project.narration?.sentences
        ?.filter((sentence) => sentence.sceneId === scene.id)
        .map((sentence) => sentence.startSec) || [];

    if (sentenceTimes.length >= 3) {
      const first = sentenceTimes[0];
      let lastInserted = at;

      for (const sentenceAt of sentenceTimes.slice(1, -1)) {
        if (sentenceAt - lastInserted >= 38) {
          beats.push({
            atSec: Math.round(sentenceAt),
            type: isEvidenceRich(scene) ? "proof" : "reset",
            label: isEvidenceRich(scene)
              ? "Refresh the visible proof while the explanation continues."
              : "Introduce a visual pattern interrupt while the narration continues.",
          });
          lastInserted = sentenceAt;
        }
      }

      // Avoid an unnecessary synthetic beat very close to the next scene.
      void first;
    }
  });

  const substantive = project.scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => scene.kind !== "cta");

  const payoffIndex = substantive.at(-1)?.index;
  if (payoffIndex !== undefined) {
    const scene = project.scenes[payoffIndex];
    beats.push({
      atSec: Math.round(starts.get(scene.id) || 0),
      type: "payoff",
      label: documentary
        ? "Deliver the system-level conclusion and evidence boundary."
        : "Deliver the larger insight promised by the hook.",
    });
  }

  const cta = project.scenes.find((scene) => scene.kind === "cta");
  if (cta) {
    beats.push({
      atSec: Math.round(starts.get(cta.id) || 0),
      type: "cta",
      label: documentary
        ? "Close on the resolved question or the next evidence-led story."
        : "Tie the next-video tease to an unanswered experiment.",
    });
  }

  const unique = new Map<string, RetentionBeat>();
  beats
    .sort((a, b) => a.atSec - b.atSec)
    .forEach((beat) => {
      unique.set(`${beat.atSec}:${beat.type}`, beat);
    });

  return [...unique.values()].sort((a, b) => a.atSec - b.atSec);
}

function currentCoveragePercent(project: EpisodeProject) {
  const targetSec = Math.max(1, project.episode.targetMinutes * 60);
  return clamp((currentDuration(project) / targetSec) * 100, 0, 120);
}

export function analyzeRetention(project: EpisodeProject): RetentionScore {
  const scenes = project.scenes;
  const totalSec = currentDuration(project);
  const hook = hookScore(project);

  const starts = sceneStartTimes(project);
  const durations = scenes.map((scene, index) => {
    const current = starts.get(scene.id) || 0;
    const nextScene = scenes[index + 1];
    const next = nextScene ? starts.get(nextScene.id) : totalSec;

    if (
      typeof next === "number" &&
      next > current
    ) {
      return next - current;
    }

    return scene.durationSec;
  });

  const longScenes = durations.filter((d) => d > 70).length;
  const veryLongScenes = durations.filter((d) => d > 100).length;
  const avgScene = totalSec / Math.max(1, scenes.length);

  let pacing = 94;
  pacing -= longScenes * 3;
  pacing -= veryLongScenes * 5;
  if (avgScene > 70) pacing -= 5;
  if (avgScene < 12) pacing -= 5;
  pacing = clamp(pacing);

  const proofScenes = scenes.filter(isEvidenceRich).length;
  const proofDensity = clamp(
    45 +
      (proofScenes / Math.max(1, scenes.length)) * 45 +
      (project.evidence.length ? 5 : 0) +
      (project.datasets?.length ? 5 : 0)
  );

  const curiositySignals = [
    /\?/,
    /\bwhy\b/i,
    /\bhow\b/i,
    /\bbut\b/i,
    /\byet\b/i,
    /\bhowever\b/i,
    /\bwhat happens\b/i,
    /\bnext\b/i,
    /\bnot the whole\b/i,
    /\btrade-off\b/i,
  ];

  const curiosityHits = scenes.reduce(
    (sum, scene) =>
      sum +
      curiositySignals.filter((rx) =>
        rx.test(
          `${scene.headline} ${scene.body} ${scene.narration}`
        )
      ).length,
    0
  );

  const curiosity = clamp(64 + curiosityHits * 3);

  const avgWordsPerMinute =
    totalSec > 0
      ? (scenes.reduce(
          (sum, scene) => sum + words(scene.narration),
          0
        ) /
          totalSec) *
        60
      : 0;

  let clarity = 95;
  if (avgWordsPerMinute > 165) clarity -= 8;
  if (avgWordsPerMinute > 180) clarity -= 10;

  const malformed = scenes.some((scene) =>
    /how do the forces behind why|source:\s|current story-grounded evidence/i.test(
      scene.narration
    )
  );
  if (malformed) clarity -= 12;
  clarity = clamp(clarity);

  const beats = attentionBeats(project);
  const warnings: string[] = [];

  if (hook < 78) {
    warnings.push(
      isEvidenceDocumentary(project)
        ? "Strengthen the opening with a concrete phenomenon, a tension and the central causal question."
        : "Make the opening more concrete by showing the object, change and question immediately."
    );
  }

  if (proofDensity < 65) {
    warnings.push(
      isEvidenceDocumentary(project)
        ? "Proof density is low. Add more visible source material, measured data, maps or field evidence."
        : "Proof density is low. Add more screenshots, measured results or visible verification receipts."
    );
  }

  const attentionGaps = beats
    .slice(1)
    .map((beat, index) => beat.atSec - beats[index].atSec)
    .filter((gap) => gap > 48);

  if (attentionGaps.length) {
    warnings.push(
      `There ${attentionGaps.length === 1 ? "is" : "are"} ${
        attentionGaps.length
      } attention gap${
        attentionGaps.length === 1 ? "" : "s"
      } longer than ~48 seconds. Add a proof refresh, map/chart change, field image or visual reset inside the existing narration.`
    );
  }

  const coverage = currentCoveragePercent(project);
  if (coverage < 85) {
    warnings.push(
      `Current narration covers about ${coverage}% of the requested ${project.episode.targetMinutes}-minute episode. Add usable evidence only if the longer cut is still required.`
    );
  }

  const overall = clamp(
    hook * 0.25 +
      pacing * 0.2 +
      proofDensity * 0.22 +
      curiosity * 0.18 +
      clarity * 0.15
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
