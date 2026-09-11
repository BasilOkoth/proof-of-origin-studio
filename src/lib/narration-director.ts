import type { DatasetAnalysis, EpisodeProject, Scene } from "./types";
import { applyPremiumEnding } from "./premium-ending";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function spokenUnits(text: string) {
  return clean(text)
    .replace(/\((?:mm|millimetres)\)/gi, "")
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


function bestTemporalDataset(project: EpisodeProject, datasetsOverride?: DatasetAnalysis[]) {
  const sourceDatasets = datasetsOverride?.length ? datasetsOverride : (project.datasets || []);
  return [...sourceDatasets]
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

function buildTemporalTriggerNarration(project: EpisodeProject, datasetsOverride?: DatasetAnalysis[]) {
  const dataset = bestTemporalDataset(project, datasetsOverride);
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

  /*
   * Do not confuse the systems-intro headline "Rain is the trigger"
   * with the actual temporal rainfall chart.
   */
  return (
    scene.chart?.type === "line" ||
    /rainfall.*over time|monthly rainfall|rainfall pattern|rainfall trend/.test(text)
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
  scenes: Scene[],
  datasetsOverride?: DatasetAnalysis[]
) {
  const temporalNarration = buildTemporalTriggerNarration(
    project,
    datasetsOverride
  );

  if (!temporalNarration) return scenes;
  if (narrationAlreadyContainsTemporalEvidence(scenes)) return scenes;

  const next = scenes.map((scene) => ({ ...scene }));

  let targetIndex = next.findIndex(sceneLooksLikeTemporalTrigger);

  if (targetIndex >= 0) {
    next[targetIndex] = {
      ...next[targetIndex],
      narration: temporalNarration,
    };
    return next;
  }

  /*
   * Stale project fallback:
   * if the temporal scene itself is missing, place the rainfall paragraph
   * immediately before the first flow-path narration.
   */
  targetIndex = next.findIndex((scene) => isFlowPath(scene));

  if (targetIndex >= 0) {
    next[targetIndex] = {
      ...next[targetIndex],
      narration: `${temporalNarration} ${clean(next[targetIndex].narration)}`.trim(),
    };
  }

  return next;
}


function isNairobiFloodLongForm(project: EpisodeProject) {
  const context = `${project.episode.workingTitle} ${project.episode.question} ${project.episode.experiment}`.toLowerCase();
  return (
    project.episode.targetMinutes >= 7 &&
    /nairobi/.test(context) &&
    /flood/.test(context)
  );
}

const NAIROBI_FLOOD_LONG_FORM = [
  `Why Nairobi floods looks like a weather story. Clouds gather, rain falls, roads fill with water, and the explanation seems obvious: too much rain. But that explanation stops too early. Rainfall may start the event, yet it does not tell us why water accumulates in particular places, why some roads become impassable, or why the same problem returns. The evidence points to several urban systems interacting at once. Built surfaces change infiltration. Drainage determines how runoff leaves. Waste and sediment can obstruct that movement. Development changes where water can travel, while planning and maintenance shape how the system performs. So the useful question is not simply, did it rain? It is: what happens after that water lands on Nairobi?`,
  `Heavy rain is the trigger, but between the rain and the damage sits an urban system. A drop can land on a roof, road, bare soil, vegetation or pavement. Some infiltrates. Some becomes runoff. That runoff must move through streets, channels, drains, culverts and rivers. Each part of that path has a capacity, and each can be changed by development or maintenance. Rain supplies water to the system. Urban form changes how much stays on the surface. Drainage controls how quickly it can move. Blockages create bottlenecks. Low-lying areas receive water from elsewhere. Institutions influence whether channels remain open and whether development respects the space water needs. The real question is what happens as water moves through that chain.`,
  `Start with the rain. The 2024 monthly observations show a highly uneven year. April recorded the highest monthly total in the dataset at 595.6 millimetres, followed by November at 353.7 millimetres. May recorded 278.7 millimetres. Those values establish periods when the city's drainage and waterways faced greater hydrological pressure. But monthly totals have limits. A month can be wet because rain is spread across many days or because several intense episodes occur close together. Flooding responds to timing as well as totals. So this chart establishes the trigger, not the explanation. It tells us when large amounts of water entered the urban system. It does not tell us where that water travelled, which drains were obstructed, or which neighbourhoods were exposed.`,
  `Now follow the water. Local evidence from South C describes drainage capacity being overwhelmed when incoming stormwater exceeds what the network can carry. Instead of asking only how much rain fell, ask how much runoff reached a drain, how quickly it arrived, whether the channel was open, and whether there was an effective exit downstream. The case study describes blocked culverts, waste, silt and physical extensions interfering with drainage. It also reports drainage infrastructure that had not kept pace with rising built-up development. These mechanisms can reinforce one another. More impervious surface can increase runoff at the same time that obstruction reduces the capacity available to move it. When inflow rises and outflow is constrained, water backs up. A weather event becomes an urban flow-path problem.`,
  `The event data adds another layer. During the late-April to early-May period, Dagoretti Meteorological Station recorded the highest seven-day rainfall total in the plotted comparison, at 223.4 millimetres. Moi Air Base recorded 216.2 millimetres, while Wilson Airport recorded 207.9 millimetres. The values show substantial rainfall across all three observation points. But a rainfall station does not directly measure blocked drains, flood depth, river overflow, road design or household exposure. That distinction prevents us from turning a rainfall chart into a flood-risk map. These numbers establish the magnitude of the event. They do not explain why damage appeared where it did. For that, the observations have to be placed in the city and connected to the pathways water follows.`,
  `Put those observations on a map and the evidence becomes more honest. The current dataset contains three mapped rainfall locations: Dagoretti Corner, Wilson Airport and Moi Air Base. That gives useful geographic context, but it is not a complete picture of Nairobi. Three points cannot represent every neighbourhood, drainage catchment or local storm. A stronger spatial explanation would combine rainfall observations with elevation, drainage networks, rivers, land cover, observed flood locations and exposure. The South C study also points to terrain and movement of water from higher ground toward lower-lying areas. But that remains a local mechanism. The map should therefore show where the measurements exist, how they relate to the city, and where our evidence is still thin.`,
  `The city also changes the surface the rain lands on. In less built-up ground, some rainfall can infiltrate into soil or be slowed by vegetation. Roofs, roads and paved surfaces change that balance. The South C evidence links increasing built-up area with reduced ground absorption and greater surface runoff. The point is not that every building causes flooding. It is that urbanization changes the share of rainfall that remains at the surface and how quickly water reaches drainage channels. Development can also alter natural flow paths or occupy spaces that once stored or conveyed stormwater. If drainage capacity does not expand at the same pace, the margin between normal flow and overload becomes smaller. Urban form connects decisions made over years to a flood that unfolds in hours.`,
  `Then there is maintenance. A drain does not provide the same service simply because it exists on a plan. The South C study documents clogged drainage systems and waste disposed in channels, and it records county efforts to clear drains and construct culverts and trenches. That is why the drainage-clearing image matters. Flood protection is not only about building infrastructure once; it is about keeping pathways functional. Waste collection, sediment removal, enforcement around road reserves and routine inspection affect whether stormwater can move. The study also describes institutional challenges, including limited funding, delays and departments working in isolation. Those findings belong to one case study, but they demonstrate an important systems principle: physical infrastructure and the institutions responsible for operating it cannot be separated. A blocked drain is physical; how long it stays blocked is partly a management question.`,
  `This is where the evidence boundary matters. Much of the detailed mechanism evidence in this episode comes from a South C case study. That gives us observations of clogged drains, waste in drainage channels, changing development patterns, flood impacts, culverts and maintenance responses in a real Nairobi neighbourhood. But South C is not Nairobi in miniature. Other parts of the city have different terrain, river relationships, settlement patterns, infrastructure and exposure. The study can demonstrate mechanisms that are locally observed without proving that exactly the same combination explains every flood across the city. A stronger Nairobi-wide conclusion would need broader drainage data, more rainfall stations, observed flood footprints, river and riparian information, land-cover change and neighbourhood-level exposure. Keeping that boundary visible is what makes the story verifiable.`,
  `So what does the evidence support? Not a single villain and not a single fix. Rainfall triggers the event. Urban form influences runoff. Terrain shapes where water moves. Drainage capacity and obstruction affect whether it can leave. Maintenance determines whether infrastructure performs as intended. Planning influences where development occurs, while exposure determines who and what sits in the path of the water. That systems view changes the solution too. More drainage may help in some places, but without maintenance it can lose capacity. Clearing drains restores flow, but does not solve development in flood-prone corridors. Better waste management can reduce blockages, but does not remove the rainfall hazard. Protecting waterways and infiltration areas can create space for water, but those choices involve land and enforcement. The useful question is which combination reduces risk across the whole pathway. Flooding is the visible event. Flood risk is the system underneath it.`,
];

function applyLongFormDocumentaryNarration(
  project: EpisodeProject,
  scenes: Scene[]
) {
  if (!isNairobiFloodLongForm(project)) return scenes;

  return scenes.map((scene, index) => ({
    ...scene,
    narration:
      NAIROBI_FLOOD_LONG_FORM[index] ||
      clean(scene.narration),
  }));
}

export function applyNarrationDirector(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
): EpisodeProject {
  let previous = "";

  const polishedScenes = project.scenes.map((scene, index) => ({
    ...scene,
    narration: approvedSceneNarration(scene, index),
  }));

  /*
   * Repair the rainfall trigger AFTER normal scene polishing so it cannot
   * be overwritten by polishSystemsIntro().
   */
  const repairedScenes = ensureTemporalTriggerNarration(
    project,
    polishedScenes,
    datasetsOverride
  );

  const longFormScenes = applyLongFormDocumentaryNarration(
    project,
    repairedScenes
  );

  const scenes = longFormScenes.map((scene) => {
    let narration = clean(scene.narration);

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

  const premiumScenes =
    applyPremiumEnding(
      project,
      scenes
    );

  return {
    ...project,
    scenes: premiumScenes,
  };
}
