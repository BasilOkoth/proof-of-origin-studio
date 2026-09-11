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
  VisualKind,
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

function chooseVisual(
  project: EpisodeProject,
  scene: Scene
): VisualPlan {
  const evidence =
    evidenceForScene(
      project,
      scene
    );

  const text =
    `${scene.eyebrow} ${scene.headline} ${scene.body}`;

  if (scene.chart) {
    return {
      kind:
        "data_chart",
      reason:
        "The scene contains structured quantitative data, so the evidence should be seen as a chart rather than narrated as a list of numbers.",
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
        "The evidence has explicit geographic coordinates, so location is part of the explanation rather than decoration.",
      evidenceIds:
        scene.factIds,
      confidence: 99,
    };
  }

  if (scene.assetId) {
    return {
      kind:
        "field_evidence",
      reason:
        "A real uploaded evidence asset exists for this scene; show the source material before adding abstraction.",
      evidenceIds:
        scene.factIds,
      confidence: 96,
    };
  }

  if (
    firstSource(evidence) &&
    /research|report|study|source|evidence|finding/i.test(
      text
    )
  ) {
    return {
      kind:
        "source_highlight" as const,
      reason:
        "This claim is source-backed; make the citation or source excerpt part of the visual story instead of hiding it in the description.",
      evidenceIds:
        scene.factIds,
      confidence: 91,
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
        "The narration contains a meaningful comparison or change; a side-by-side visual makes the causal or temporal difference legible.",
      evidenceIds:
        scene.factIds,
      confidence: 86,
    };
  }

  if (
    /where|location|region|country|city|basin|river|lake|route|spatial|geograph/i.test(
      text
    )
  ) {
    return {
      kind:
        "map_story",
      reason:
        "Geography is part of the claim. Use a map when coordinates or a mapped dataset are available; otherwise retain a geographic placeholder for manual sourcing.",
      evidenceIds:
        scene.factIds,
      confidence: 68,
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
        "The explanation depends on sequence or change through time, so the viewer should see the progression rather than only hear it.",
      evidenceIds:
        scene.factIds,
      confidence: 84,
    };
  }

  if (
    /system|flow|cycle|cause|driver|mechanism|process|why|interact|relationship/i.test(
      text
    ) ||
    scene.kind ===
      "diagram"
  ) {
    return {
      kind:
        "systems_diagram",
      reason:
        "The scene explains relationships or mechanisms. A systems diagram can make the logic visible and reduce abstract narration.",
      evidenceIds:
        scene.factIds,
      confidence: 82,
    };
  }

  if (
    scene.kind ===
    "quote"
  ) {
    return {
      kind: "quote",
      reason:
        "The scene is a principle, limitation or direct takeaway that benefits from visual breathing room.",
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
        "The scene has linked evidence. Put the actual observation on screen rather than relying on generic illustration.",
      evidenceIds:
        scene.factIds,
      confidence: 80,
    };
  }

  return {
    kind: "minimal",
    reason:
      "No stronger evidence-specific visual is available yet. Keep the scene visually restrained and flag it for sourcing rather than inventing proof.",
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

  const visualVariation =
    clamp(
      (unique.size / 7) *
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

  if (
    visualVariation < 55
  ) {
    warnings.push(
      "Visual grammar is repetitive. Add a map, chart, source highlight or real evidence asset before final rendering."
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
