import type { EpisodeProject, Scene } from "./types";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function spokenUnits(text: string) {
  return clean(text)
    .replace(/\b7-day\b/gi, "seven-day")
    .replace(/\b24h\b/gi, "twenty-four-hour")
    .replace(/\b24-hour\b/gi, "twenty-four-hour")
    .replace(/\bmm\b/gi, "millimetres")
    .replace(/\bkm\b/gi, "kilometres")
    .replace(/\bkm2\b/gi, "square kilometres")
    .replace(/\b%\b/g, " percent");
}

function stripMetaNarration(text: string) {
  return clean(text)
    .replace(
      /The story is built only from evidence that still matches the active topic and question\.?/gi,
      ""
    )
    .replace(
      /The evidence card remains visible so the viewer can inspect the source behind the claim\.?/gi,
      ""
    )
    .replace(
      /The point of the chart is not decoration\.?/gi,
      ""
    )
    .replace(
      /The map shows where the measured evidence exists and keeps the viewer from treating every part of Nairobi as interchangeable\.?/gi,
      ""
    )
    .replace(
      /Where the evidence is still incomplete, that gap becomes the next research task.?not a sentence invented for the video\.?/gi,
      "Where the evidence is incomplete, that uncertainty stays visible."
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isTrustBoundary(scene: Scene) {
  return (
    clean(scene.eyebrow).toLowerCase().includes("trust boundary") ||
    clean(scene.headline).toLowerCase().includes("evidence still not prove")
  );
}

function isSystemsIntro(scene: Scene) {
  const headline = clean(scene.headline).toLowerCase();
  return (
    headline.includes("rain is the trigger") ||
    headline.includes("what turns it into a disaster")
  );
}

function isFlowPath(scene: Scene) {
  const text = `${scene.eyebrow} ${scene.headline}`.toLowerCase();
  return /flow path|after water hits|drainage capacity/.test(text);
}

function isUrbanForm(scene: Scene) {
  const text = `${scene.eyebrow} ${scene.headline}`.toLowerCase();
  return /urban form|city changes|surface the rain lands/.test(text);
}

function isMaintenance(scene: Scene) {
  const text = `${scene.eyebrow} ${scene.headline}`.toLowerCase();
  return /maintenance|infrastructure is a system|institutional/.test(text);
}

function isTakeaway(scene: Scene) {
  const text = `${scene.eyebrow} ${scene.headline}`.toLowerCase();
  return /takeaway|flooding is an event|flood risk is a system/.test(text);
}

function polishSystemsIntro(scene: Scene, text: string) {
  if (!isSystemsIntro(scene)) return text;

  return [
    "Heavy rain is the trigger.",
    "But between the rain and the damage sits an urban system: drains, waterways, built surfaces, settlement patterns and the institutions that maintain them.",
    "The real question is what happens to water as it moves through that system.",
  ].join(" ");
}

function polishFlowPath(scene: Scene, text: string) {
  if (!isFlowPath(scene)) return text;

  const body = clean(scene.body);

  if (/drainage capacity can be exceeded/i.test(body || text)) {
    return [
      "Now follow the water.",
      "Local evidence shows that drainage capacity can be exceeded when incoming flow is greater than the system can carry.",
      "At that point, a weather event becomes a flow problem: how much water arrives, where it can move, and where capacity or obstruction causes it to back up.",
    ].join(" ");
  }

  return text;
}

function polishUrbanForm(scene: Scene, text: string) {
  if (!isUrbanForm(scene)) return text;

  return [
    "The city also changes the surface the rain lands on.",
    "When infiltration falls, more water stays at the surface, increasing runoff and the volume the drainage network has to carry.",
    "That does not mean every building or paved surface causes flooding.",
    "It means urban form changes both how much water remains above ground and where that water can go.",
  ].join(" ");
}

function polishMaintenance(scene: Scene, text: string) {
  if (!isMaintenance(scene)) return text;

  return [
    "Drainage capacity is not fixed once concrete is poured.",
    "Maintenance and institutional response are part of the flood system too.",
    "So flooding is not only an infrastructure problem.",
    "It is also a management problem: the physical network and the way it is maintained, protected and operated work as one system.",
  ].join(" ");
}

function polishTrustBoundary(scene: Scene, text: string) {
  if (!isTrustBoundary(scene)) return text;

  return [
    "This is where the evidence becomes narrower.",
    "The strongest detailed mechanism evidence in this draft comes from a South C case study.",
    "That makes it valuable local evidence, but it does not prove that the same combination of drivers explains flooding across every part of Nairobi.",
    "A Nairobi-wide conclusion needs evidence that reaches beyond one neighbourhood and one type of source.",
  ].join(" ");
}

function polishTakeaway(scene: Scene, text: string) {
  if (!isTakeaway(scene)) return text;

  return [
    "The most responsible conclusion is a systems one.",
    "Rainfall triggers the event, but the scale and location of damage depend on how water moves through the city, how land is built, how infrastructure is maintained, and where people and assets are exposed.",
    "Where the evidence is incomplete, that uncertainty stays visible.",
  ].join(" ");
}

function chartNarration(scene: Scene, current: string) {
  const chart = scene.chart;
  if (!chart) return current;

  const body = spokenUnits(scene.body);

  if (chart.type === "line") {
    const ranked = [...chart.data]
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value);
    const peak = ranked[0];
    const second = ranked[1];

    if (peak && second) {
      const unit = chart.unit ? spokenUnits(chart.unit) : "millimetres";
      return clean(
        `Start with the rain. Across the plotted period, rainfall is highly uneven. ${peak.label} records the highest monthly total at ${peak.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}, followed by ${second.label} at ${second.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}. That establishes the weather signal, but rainfall alone does not explain the flooding.`
      );
    }

    return clean(
      `Start with the rain. ${body} That establishes the weather signal, but rainfall alone does not explain the flooding.`
    );
  }

  if (chart.type === "bar" || chart.type === "ranking") {
    const ranked = [...chart.data]
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value);
    const top = ranked[0];
    const second = ranked[1];
    const unit = chart.unit ? spokenUnits(chart.unit) : "millimetres";

    if (top && second) {
      return clean(
        `Now compare the event across the measured locations. ${top.label} records the highest ${spokenUnits(chart.yLabel || "measured total")}, at ${top.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}, followed by ${second.label} at ${second.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}. These numbers show the scale of the event. They do not, by themselves, explain the flooding.`
      );
    }

    return clean(
      `Now compare the event across the measured locations. ${body} These numbers show the scale of the event. They do not, by themselves, explain the flooding.`
    );
  }

  return clean(`Now look at the measured pattern. ${body}`);
}

function mapNarration(scene: Scene, current: string) {
  if (!scene.map) return current;

  const countWords: Record<number, string> = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
  };

  const points = scene.map.points || [];
  const labels = points
    .slice(0, 4)
    .map((point) => point.label)
    .filter(Boolean);

  const count = points.length;
  const countText = countWords[count] || String(count);

  if (count > 0 && labels.length) {
    return clean(
      `Now put those measurements on the city. The dataset maps ${countText} observations: ${labels.join(", ")}. That gives useful geographic context, but it is not a complete flood-risk map of Nairobi.`
    );
  }

  return clean(
    `Now put those measurements on the city. ${spokenUnits(scene.body)}`
  );
}

function openingNarration(scene: Scene, index: number, current: string) {
  if (index !== 0) return current;

  return [
    "Why Nairobi floods looks like one problem.",
    "But the evidence points to several systems interacting.",
    "When heavy rain hits the city, the outcome is not the same everywhere.",
    "Built surfaces can reduce infiltration and increase runoff.",
    "So the useful question is not simply whether it rained.",
    "It is what happens to that water after it lands on the city.",
  ].join(" ");
}

function removeDuplicateOpening(scene: Scene, text: string) {
  if (!scene.chart && !scene.map) return text;

  return clean(text)
    .replace(/^Now look at the data itself\.\s*/i, "")
    .replace(
      /^Now compare the event across stations or locations\.\s*/i,
      "Now compare the measured locations. "
    )
    .replace(
      /^Now put the observations in place\.\s*/i,
      "Now place the measurements on the city. "
    );
}

function approvedSceneNarration(scene: Scene, index: number) {
  let narration = clean(scene.narration);

  narration = stripMetaNarration(narration);
  narration = openingNarration(scene, index, narration);
  narration = polishSystemsIntro(scene, narration);
  narration = polishFlowPath(scene, narration);
  narration = polishUrbanForm(scene, narration);
  narration = polishMaintenance(scene, narration);
  narration = polishTrustBoundary(scene, narration);
  narration = polishTakeaway(scene, narration);
  narration = removeDuplicateOpening(scene, narration);

  if (scene.chart) {
    narration = chartNarration(scene, narration);
  } else if (scene.map) {
    narration = mapNarration(scene, narration);
  }

  return spokenUnits(narration);
}

function similarityKey(text: string) {
  return clean(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(
      /\b(the|a|an|this|that|now|shows|show|data|evidence)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string) {
  const aa = new Set(similarityKey(a).split(" ").filter(Boolean));
  const bb = new Set(similarityKey(b).split(" ").filter(Boolean));

  if (!aa.size || !bb.size) return 0;

  let overlap = 0;

  for (const token of aa) {
    if (bb.has(token)) overlap += 1;
  }

  const union = new Set([...aa, ...bb]).size;
  return union ? overlap / union : 0;
}


function bestTemporalDataset(project: EpisodeProject) {
  return [...(project.datasets || [])]
    .filter(
      (dataset) =>
        dataset.recommendedChart?.type === "line" &&
        dataset.recommendedChart.data?.length
    )
    .sort((a, b) => {
      const score = (dataset: typeof a) => {
        const title = `${dataset.name} ${dataset.recommendedChart?.title || ""} ${dataset.recommendedChart?.yLabel || ""}`.toLowerCase();
        let value = dataset.rowCount || 0;
        if (/rain|precip|monthly|2024/.test(title)) value += 100;
        if (/mm/.test(title)) value += 20;
        return value;
      };
      return score(b) - score(a);
    })[0];
}

function buildTemporalTriggerNarration(project: EpisodeProject) {
  const dataset = bestTemporalDataset(project);
  const chart = dataset?.recommendedChart;

  if (!chart || chart.type !== "line" || !chart.data?.length) {
    return "";
  }

  const ranked = [...chart.data]
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);

  const peak = ranked[0];
  const second = ranked[1];

  if (!peak) return "";

  const unit = chart.unit ? spokenUnits(chart.unit) : "millimetres";

  if (second) {
    return clean(
      `Start with the rain. Across the plotted period, rainfall is highly uneven. ${peak.label} records the highest monthly total at ${peak.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}, followed by ${second.label} at ${second.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}. That establishes the weather signal, but rainfall alone does not explain the flooding.`
    );
  }

  return clean(
    `Start with the rain. ${peak.label} records the highest plotted rainfall value at ${peak.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}. That establishes the weather signal, but rainfall alone does not explain the flooding.`
  );
}

function sceneLooksLikeTemporalTrigger(scene: Scene) {
  const text = `${scene.eyebrow} ${scene.headline}`.toLowerCase();

  return (
    scene.chart?.type === "line" ||
    /\btrigger\b/.test(text) ||
    /start with the rain|rainfall.*over time|monthly rainfall/.test(text)
  );
}

function narrationAlreadyContainsTemporalEvidence(scenes: Scene[]) {
  const joined = scenes
    .map((scene) => clean(scene.narration))
    .join(" ")
    .toLowerCase();

  return (
    /highest monthly total/.test(joined) ||
    /rainfall is highly uneven/.test(joined) ||
    /\b595\.6\b/.test(joined)
  );
}

function ensureTemporalTriggerNarration(
  project: EpisodeProject,
  scenes: Scene[]
) {
  const temporalNarration = buildTemporalTriggerNarration(project);
  if (!temporalNarration) return scenes;
  if (narrationAlreadyContainsTemporalEvidence(scenes)) return scenes;

  const next = scenes.map((scene) => ({ ...scene }));

  let targetIndex = next.findIndex(sceneLooksLikeTemporalTrigger);

  /*
   * If an earlier build lost the dedicated trigger scene but the dataset is
   * still in the project, place the rainfall evidence immediately before the
   * flow-path scene so the narration sequence remains:
   * system -> rainfall trigger -> flow path.
   */
  if (targetIndex < 0) {
    targetIndex = next.findIndex((scene) => isFlowPath(scene));
  }

  if (targetIndex < 0) return next;

  const target = next[targetIndex];

  if (isFlowPath(target)) {
    next[targetIndex] = {
      ...target,
      narration: `${temporalNarration} ${clean(target.narration)}`.trim(),
    };
  } else {
    next[targetIndex] = {
      ...target,
      narration: temporalNarration,
    };
  }

  return next;
}

export function applyNarrationDirector(
  project: EpisodeProject
): EpisodeProject {
  let previous = "";

  const repairedScenes = ensureTemporalTriggerNarration(
    project,
    project.scenes
  );

  const scenes = repairedScenes.map((scene, index) => {
    let narration = approvedSceneNarration(scene, index);

    /*
     * Avoid adjacent scenes repeating the same observation.
     * A later chart/map keeps its distinct visual job, but does not repeat
     * the previous scene's lead sentence.
     */
    if (previous && jaccard(previous, narration) > 0.72) {
      if (scene.map) {
        narration = clean(
          `Now put those measurements on the city. ${spokenUnits(scene.body)}`
        );
      } else if (scene.chart) {
        narration = clean(
          `Now compare the measured values directly. ${spokenUnits(scene.body)}`
        );
      }
    }

    previous = narration;

    return {
      ...scene,
      narration,
    };
  });

  return {
    ...project,
    scenes,
  };
}
