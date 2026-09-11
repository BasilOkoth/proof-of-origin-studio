import { analyzeRetention } from "./retention";
import { buildCinematicPresentationReport } from "./cinematic-director";
import {
  applyVisualAssetRequirements,
  visualRequirementWarnings,
} from "./visual-requirements";
import type {
  DatasetAnalysis,
  EpisodeProject,
  EvidenceItem,
  Scene,
  VisualIntelligenceScore,
  VisualPlan,
} from "./types";

const clean = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const clamp = (value: number) =>
  Math.max(
    0,
    Math.min(
      100,
      Math.round(value)
    )
  );

function evidenceForScene(
  project: EpisodeProject,
  scene: Scene
) {
  const ids = new Set(
    scene.factIds
  );

  return project.evidence.filter(
    (item) =>
      ids.has(item.id)
  );
}

function firstSource(
  items: EvidenceItem[]
) {
  return items.find(
    (item) =>
      clean(
        item.source || ""
      ) ||
      clean(
        item.sourceLabel || ""
      )
  );
}

function isTrustBoundary(text: string) {
  return /trust boundary|limitation|uncertain|does not prove|doesn't prove|not establish|evidence still not prove|scope|boundary of the evidence/i.test(
    text
  );
}

function isMechanism(text: string) {
  return /what happens after|what turns it into|flow path|flow|runoff|pathway|path way|cycle|cause chain|driver|mechanism|process|after water hits|moves through/i.test(
    text
  );
}

function isSynthesis(
  project: EpisodeProject,
  scene: Scene
) {
  const index =
    project.scenes.findIndex(
      (item) =>
        item.id === scene.id
    );

  const text =
    `${scene.eyebrow} ${scene.headline} ${scene.body}`;

  return (
    /risk is a system|taken together|what does this mean|final synthesis|the system underneath|not one cause|system rather than a single cause/i.test(
      text
    ) ||
    (
      index >=
      Math.floor(
        project.scenes.length *
          0.78
      ) &&
      scene.kind !== "cta"
    )
  );
}

function isUrbanForm(text: string) {
  return /built surface|urban form|pavement|paved|building|built-up|infiltration|land use|development|surface the rain lands on/i.test(
    text
  );
}

function isMaintenance(text: string) {
  return /maintenance|clearing|drainage capacity|blocked drain|blockage|waste|debris|culvert|institutional response|management/i.test(
    text
  );
}

function chooseVisual(
  project: EpisodeProject,
  scene: Scene
): VisualPlan {
  const evidence =
    evidenceForScene(
      project,
      scene
    );

  const source =
    firstSource(evidence);

  const text =
    `${scene.eyebrow} ${scene.headline} ${scene.body}`;

  /*
   * Evidence-native structures keep absolute precedence.
   */
  if (scene.chart) {
    return {
      kind:
        "data_chart",
      reason:
        "Production treatment: animated data reveal. The scene contains structured quantitative data, so the pattern should be revealed in narration order rather than treated as a generic evidence card.",
      evidenceIds:
        scene.factIds,
      confidence: 99,
    };
  }

  if (scene.map) {
    return {
      kind:
        "map_story",
      reason:
        "Production treatment: animated map story. Geography is part of the evidence, so the camera and labels should reveal the spatial pattern progressively.",
      evidenceIds:
        scene.factIds,
      confidence: 99,
    };
  }

  /*
   * A strong real-world opening should remain photographic even if the hook
   * uses words such as system, interaction or cause. Those words describe the
   * argument, not necessarily the best visual grammar for the first scene.
   */
  if (
    scene.kind === "hook" &&
    scene.assetId
  ) {
    return {
      kind: "field_evidence",
      reason:
        "Production treatment: cinematic full-screen documentary image. Open in the physical world first, then move into diagrams and data as the explanation develops.",
      evidenceIds: scene.factIds,
      confidence: 96,
    };
  }

  /*
   * When a scene is explicitly about urban form or maintenance and already has
   * a relevant real image, keep the physical evidence on screen. The image can
   * carry explanatory overlays without converting the entire scene into a
   * systems diagram.
   */
  if (
    scene.assetId &&
    isUrbanForm(text)
  ) {
    return {
      kind: "field_evidence",
      reason:
        "Production treatment: documentary photo with explanatory overlay. Keep the real urban-form image full-screen or near full-screen and annotate only the mechanism that the evidence supports.",
      evidenceIds: scene.factIds,
      confidence: 96,
    };
  }

  if (
    scene.assetId &&
    isMaintenance(text)
  ) {
    return {
      kind: "field_evidence",
      reason:
        "Production treatment: documentary maintenance/source visual. Show the real infrastructure, blockage, culvert or clearing image with restrained provenance and subtle camera movement.",
      evidenceIds: scene.factIds,
      confidence: 96,
    };
  }

  /*
   * Editorial purpose now outranks the simple existence of an image asset.
   * Previously every scene with an asset immediately became field_evidence,
   * which flattened the whole film into one visual grammar.
   */
  if (
    isTrustBoundary(text)
  ) {
    return {
      kind:
        "source_highlight",
      reason:
        "Production treatment: evidence-boundary/source visual. This scene is about what the evidence cannot establish, so show the source, local map or explicit evidence boundary rather than another generic photo.",
      evidenceIds:
        scene.factIds,
      confidence: source
        ? 94
        : 86,
    };
  }

  if (
    isSynthesis(
      project,
      scene
    )
  ) {
    return {
      kind:
        "systems_diagram",
      reason:
        "Production treatment: cinematic callback plus systems payoff. Reuse real evidence imagery where available, then progressively reconnect the causal system instead of ending on another field-evidence card.",
      evidenceIds:
        scene.factIds,
      confidence: 93,
    };
  }

  if (
    isMechanism(text) ||
    scene.kind ===
      "diagram"
  ) {
    return {
      kind:
        "systems_diagram",
      reason:
        /water|runoff|flow|path/i.test(
          text
        )
          ? "Production treatment: animated flow-path/mechanism. Follow movement through the system step by step; use real imagery as texture or callback, not as the whole explanation."
          : "Production treatment: animated systems diagram. Reveal relationships progressively and keep observed, interpreted and uncertain links visually distinct.",
      evidenceIds:
        scene.factIds,
      confidence: 92,
    };
  }

  if (
    /before|after|change|changed|increase|decrease|from .+ to |versus| vs\.? /i.test(
      text
    )
  ) {
    return {
      kind:
        "comparison",
      reason:
        "Production treatment: comparison reveal. A side-by-side or before/after treatment makes the change legible without turning the scene into another document card.",
      evidenceIds:
        scene.factIds,
      confidence: 88,
    };
  }

  if (
    /where|location|region|country|city|basin|river|lake|route|spatial|geograph|terrain/i.test(
      text
    ) &&
    !scene.assetId
  ) {
    return {
      kind:
        "map_story",
      reason:
        "Production treatment: geographic story. Use a mapped treatment when spatial evidence is available; otherwise keep the scene flagged for a stronger map rather than substituting a generic photo.",
      evidenceIds:
        scene.factIds,
      confidence: 72,
    };
  }

  if (
    /over time|year|decade|history|sequence|before|then|later|trend/i.test(
      text
    ) ||
    scene.kind ===
      "timeline"
  ) {
    return {
      kind:
        "timeline",
      reason:
        "Production treatment: timeline/progression. Reveal change through time rather than presenting all evidence at once.",
      evidenceIds:
        scene.factIds,
      confidence: 86,
    };
  }

  /*
   * Real-world images remain valuable, but their treatment is differentiated
   * by editorial purpose.
   */
  if (
    scene.assetId
  ) {
    return {
      kind:
        "field_evidence",
      reason:
        scene.kind === "hook"
          ? "Production treatment: cinematic full-screen documentary image. Use the strongest real visual as the opening anchor with subtle camera movement and minimal typography."
          : "Production treatment: full-screen documentary evidence. Let the real image carry the scene and avoid enclosing it in a presentation-style card.",
      evidenceIds:
        scene.factIds,
      confidence: 96,
    };
  }

  if (
    source &&
    /research|report|study|source|evidence|finding/i.test(
      text
    )
  ) {
    return {
      kind:
        "source_highlight",
      reason:
        "Production treatment: source crop/highlight. Make the relevant figure, sentence or source object part of the frame rather than hiding it behind narration.",
      evidenceIds:
        scene.factIds,
      confidence: 91,
    };
  }

  if (
    scene.kind ===
      "quote"
  ) {
    return {
      kind: "quote",
      reason:
        "Production treatment: quiet visual hold. Use one strong image or restrained typography and give the viewer a deliberate visual breath.",
      evidenceIds:
        scene.factIds,
      confidence: 88,
    };
  }

  if (evidence.length) {
    return {
      kind:
        "evidence_card",
      reason:
        "Production treatment: evidence object. No stronger visual treatment is currently supported; show the observation clearly and flag the scene for a more cinematic asset if it remains visually repetitive.",
      evidenceIds:
        scene.factIds,
      confidence: 78,
    };
  }

  return {
    kind: "minimal",
    reason:
      "Production treatment: restrained placeholder. No stronger evidence-specific visual is available; flag the scene for sourcing rather than inventing proof.",
    evidenceIds: [],
    confidence: 55,
  };
}

function datasetScenes(
  datasets: DatasetAnalysis[],
  targetSeconds = 44
): Scene[] {
  const result: Scene[] =
    [];

  const chartDataset =
    datasets.find(
      (item) =>
        item.recommendedChart
    );

  const mapDataset =
    datasets.find(
      (item) =>
        item.recommendedMap
    );

  if (
    chartDataset
      ?.recommendedChart
  ) {
    const chart =
      chartDataset
        .recommendedChart;

    result.push({
      id: crypto.randomUUID(),
      kind: "data_chart",
      durationSec:
        targetSeconds,
      eyebrow:
        "DATA STORY",
      headline:
        chart.title,
      body:
        chartDataset.insight ||
        "A structured dataset turns the claim into a visible pattern.",
      narration:
        `Now look at the data itself. ${
          chartDataset.insight ||
          `This dataset contains ${chartDataset.rowCount} observations.`
        } The point of the chart is not decoration. It lets us see the pattern, compare magnitudes and ask whether the headline claim survives contact with the underlying numbers.`,
      factIds: [],
      chart,
      retentionPurpose:
        "Pattern reset: convert quantitative evidence into a visual comparison or trend.",
      autoVisual: true,
    });
  }

  if (
    mapDataset
      ?.recommendedMap
  ) {
    const map =
      mapDataset
        .recommendedMap;

    result.push({
      id: crypto.randomUUID(),
      kind: "map_story",
      durationSec:
        targetSeconds,
      eyebrow:
        "GEOGRAPHIC CONTEXT",
      headline:
        map.title,
      body:
        map.subtitle ||
        "The pattern changes when the evidence is placed back on the map.",
      narration:
        `The geography matters too. This dataset contains ${map.points.length} mapped observations. Putting them on the map helps separate a general claim from a spatial pattern: where the evidence clusters, where it is absent, and which places should not be treated as interchangeable.`,
      factIds: [],
      map,
      retentionPurpose:
        "Geographic reset: make place and scale part of the causal explanation.",
      autoVisual: true,
    });
  }

  return result;
}

function promoteSourceScene(
  project: EpisodeProject,
  scenes: Scene[]
) {
  if (
    ![
      "research",
      "report",
      "investigation",
      "world_explained",
    ].includes(
      project.episode
        .storyMode || ""
    )
  ) {
    return scenes;
  }

  if (
    scenes.some(
      (scene) =>
        scene.kind ===
        "source_highlight"
    )
  ) {
    return scenes;
  }

  const target =
    scenes.find((scene) => {
      if (
        scene.kind !==
        "proof_card"
      ) {
        return false;
      }

      return Boolean(
        firstSource(
          evidenceForScene(
            project,
            scene
          )
        )
      );
    });

  if (!target) {
    return scenes;
  }

  return scenes.map(
    (scene) => {
      if (
        scene.id !==
        target.id
      ) {
        return scene;
      }

      const source =
        firstSource(
          evidenceForScene(
            project,
            scene
          )
        );

      return {
        ...scene,
        kind:
          "source_highlight" as const,
        sourceLabel:
          source?.sourceLabel ||
          source?.source ||
          "Source evidence",
        sourceExcerpt:
          source?.statement,
      };
    }
  );
}

function dominantPlanWarning(
  scenes: Scene[],
  plans: VisualPlan[]
) {
  const counts =
    new Map<string, number>();

  plans.forEach((plan) => {
    counts.set(
      plan.kind,
      (counts.get(
        plan.kind
      ) || 0) + 1
    );
  });

  const dominant =
    [...counts.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      )[0];

  if (
    !dominant ||
    dominant[1] < 4
  ) {
    return "";
  }

  const [kind, count] =
    dominant;

  const candidates =
    scenes
      .map(
        (scene, index) => ({
          scene,
          index,
        })
      )
      .filter(
        ({ scene }) =>
          scene.visualPlan?.kind ===
          kind
      )
      .slice(0, 6)
      .map(
        ({ scene, index }) =>
          `Scene ${String(
            index + 1
          ).padStart(
            2,
            "0"
          )} "${scene.headline}"`
      );

  return `Visual treatment is still concentrated: ${count} scenes use ${kind}. ${candidates.join(
    "; "
  )}. Convert mechanism scenes to systems/flow diagrams, limitation scenes to evidence-boundary/source visuals, synthesis scenes to cinematic callbacks, and keep real photographs for scenes where the physical world is the strongest treatment.`;
}

function visualScore(
  project: EpisodeProject
): VisualIntelligenceScore {
  const scenes =
    project.scenes;

  const plans =
    scenes
      .map(
        (scene) =>
          scene.visualPlan
      )
      .filter(
        Boolean
      ) as VisualPlan[];

  const unique =
    new Set(
      plans.map(
        (plan) =>
          plan.kind
      )
    );

  const evidenceScenes =
    scenes.filter(
      (scene) =>
        scene.factIds.length ||
        scene.assetId ||
        scene.chart ||
        scene.map
    ).length;

  const sourced =
    project.evidence.filter(
      (item) =>
        clean(
          item.source || ""
        ) ||
        clean(
          item.sourceLabel ||
            ""
        )
    ).length;

  const mapScenes =
    scenes.filter(
      (scene) =>
        scene.map
    ).length;

  const chartScenes =
    scenes.filter(
      (scene) =>
        scene.chart
    ).length;

  const evidenceDensity =
    clamp(
      (evidenceScenes /
        Math.max(
          1,
          scenes.length
        )) *
        100
    );

  /*
   * Score actual scene grammar diversity, not merely whether an evidence
   * asset exists. Five distinct treatments in a nine-scene documentary is
   * already strong; seven or more is exceptional.
   */
  const visualVariation =
    clamp(
      (unique.size / 6) *
        100
    );

  const geographicContext =
    mapScenes
      ? 100
      : project.evidence.some(
            (item) =>
              item.latitude !==
                undefined &&
              item.longitude !==
                undefined
          )
        ? 72
        : 28;

  const dataStorytelling =
    chartScenes
      ? 100
      : project.evidence.some(
            (item) =>
              item.value !==
                undefined ||
              item.year !==
                undefined
          )
        ? 58
        : 24;

  const sourceVisibility =
    clamp(
      (sourced /
        Math.max(
          1,
          project.evidence
            .length
        )) *
        100
    );

  const warnings: string[] =
    [];

  const dominantWarning =
    dominantPlanWarning(
      scenes,
      plans
    );

  if (
    dominantWarning
  ) {
    warnings.push(
      dominantWarning
    );
  } else if (
    visualVariation < 65
  ) {
    warnings.push(
      "Evidence coverage is strong, but the scene grammar still needs more variety. Prefer a mechanism diagram, evidence-boundary/source visual, comparison, timeline or cinematic callback before adding another generic field-evidence scene."
    );
  }

  if (
    evidenceDensity < 55
  ) {
    warnings.push(
      "Too many scenes are explanation-only. Increase visible proof density with source material, measured data or field evidence."
    );
  }

  if (
    sourceVisibility < 50
  ) {
    warnings.push(
      "Most evidence items do not yet carry a visible source reference. Add DOI, URL, report/page, dataset or interview labels."
    );
  }

  if (
    project.episode
      .storyMode ===
      "world_explained" &&
    !mapScenes
  ) {
    warnings.push(
      "World Explained mode has no mapped evidence yet. Add a geocoded CSV or a manually sourced map before publication."
    );
  }

  if (
    project.episode
      .storyMode ===
      "world_explained" &&
    !chartScenes
  ) {
    warnings.push(
      "World Explained mode has no data-story scene yet. Add a CSV or structured quantitative evidence when the topic supports it."
    );
  }

  const {
    lines:
      visualRequests,
  } =
    visualRequirementWarnings(
      project
    );

  warnings.push(
    ...visualRequests
  );

  const cinematic =
    buildCinematicPresentationReport(
      project
    );

  warnings.push(
    ...cinematic.warnings
  );

  const overall = clamp(
    evidenceDensity * 0.28 +
      visualVariation *
        0.24 +
      geographicContext *
        0.14 +
      dataStorytelling *
        0.18 +
      sourceVisibility *
        0.16
  );

  return {
    overall,
    evidenceDensity,
    visualVariation,
    geographicContext,
    dataStorytelling,
    sourceVisibility,
    warnings,
  };
}

export function applyVisualIntelligence(
  project: EpisodeProject,
  datasets: DatasetAnalysis[] =
    project.datasets || []
): EpisodeProject {
  let scenes =
    project.scenes
      .filter(
        (scene) =>
          !scene.autoVisual
      )
      .map((scene) => ({
        ...scene,
      }));

  scenes =
    promoteSourceScene(
      project,
      scenes
    );

  const additions =
    datasetScenes(
      datasets
    );

  if (
    additions.length
  ) {
    const insertion =
      Math.min(
        3,
        scenes.length
      );

    scenes = [
      ...scenes.slice(
        0,
        insertion
      ),
      ...additions,
      ...scenes.slice(
        insertion
      ),
    ];
  }

  scenes =
    scenes.map(
      (scene) => ({
        ...scene,
        visualPlan:
          chooseVisual(
            {
              ...project,
              scenes,
            },
            scene
          ),
      })
    );

  scenes =
    applyVisualAssetRequirements(
      {
        ...project,
        scenes,
      },
      scenes
    );

  const next: EpisodeProject =
    {
      ...project,
      scenes,
      datasets,
    };

  delete next.narration;

  next.retention =
    analyzeRetention(next);

  next.visualIntelligence =
    visualScore(next);

  return next;
}

export function refreshVisualIntelligence(
  project: EpisodeProject
): EpisodeProject {
  let scenes: Scene[] =
    project.scenes.map(
      (scene) => ({
        ...scene,
        visualPlan:
          chooseVisual(
            project,
            scene
          ),
      })
    );

  scenes =
    applyVisualAssetRequirements(
      {
        ...project,
        scenes,
      },
      scenes
    );

  const next = {
    ...project,
    scenes,
  };

  next.visualIntelligence =
    visualScore(next);

  return next;
}
