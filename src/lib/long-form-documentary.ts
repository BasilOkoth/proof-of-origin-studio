import type {
  DatasetAnalysis,
  EpisodeProject,
  EvidenceItem,
  Scene,
} from "./types";

export type DocumentarySceneRole =
  | "hook"
  | "frame"
  | "data"
  | "geography"
  | "mechanism"
  | "consequence"
  | "governance"
  | "trust_boundary"
  | "synthesis"
  | "closure";

export type LongFormPlan = {
  targetWords: number;
  wordsPerMinute: number;
  sceneTargets: Array<{
    sceneId: string;
    role: DocumentarySceneRole;
    targetWords: number;
  }>;
};

const LONG_FORM_MODES = new Set([
  "world_explained",
  "investigation",
  "explainer",
  "case_study",
  "research",
  "report",
]);

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function words(text: string) {
  return clean(text)
    .split(/\s+/)
    .filter(Boolean);
}

function wordCount(text: string) {
  return words(text).length;
}

function sentenceList(text: string) {
  return clean(text)
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);
}

function firstSentence(text: string) {
  return sentenceList(text)[0] || clean(text);
}

function lastSentence(text: string) {
  const parts = sentenceList(text);
  return parts[parts.length - 1] || clean(text);
}

function evidenceForScene(
  project: EpisodeProject,
  scene: Scene
) {
  const ids = new Set(scene.factIds || []);
  return project.evidence.filter((item) =>
    ids.has(item.id)
  );
}

function sourceLabel(item?: EvidenceItem) {
  return clean(
    item?.sourceLabel ||
    item?.source ||
    ""
  );
}

function safeEvidenceStatements(
  project: EpisodeProject,
  scene: Scene
) {
  return evidenceForScene(project, scene)
    .map((item) => ({
      item,
      statement: clean(item.statement),
    }))
    .filter(
      ({ statement }) =>
        statement.length >= 30 &&
        !/^(?:plate|figure|map|chart|table)\s+\d/i.test(
          statement
        )
    )
    .slice(0, 3);
}

function storyAnchor(project: EpisodeProject) {
  return clean(
    `${project.episode.workingTitle}. ${project.episode.question}`
  );
}

function isLongForm(project: EpisodeProject) {
  return (
    project.episode.targetMinutes >= 7 &&
    LONG_FORM_MODES.has(
      project.episode.storyMode || ""
    )
  );
}

export function documentaryWordsPerMinute(
  project: EpisodeProject
) {
  if (!isLongForm(project)) {
    return 155;
  }

  if (
    project.episode.targetMinutes >= 10
  ) {
    return 142;
  }

  return 145;
}

function targetWordCount(
  project: EpisodeProject
) {
  const wpm =
    documentaryWordsPerMinute(
      project
    );

  const raw =
    project.episode.targetMinutes *
    wpm;

  /*
   * Give an 8–9 minute documentary enough editorial breathing room without
   * forcing the script into an artificial exact count.
   */
  return Math.round(
    Math.max(
      980,
      Math.min(1800, raw)
    )
  );
}

function roleForScene(
  project: EpisodeProject,
  scene: Scene,
  index: number
): DocumentarySceneRole {
  const text =
    `${scene.eyebrow} ${scene.headline} ${scene.body}`.toLowerCase();

  if (index === 0) {
    return "hook";
  }

  if (scene.kind === "cta") {
    return "closure";
  }

  if (
    scene.chart ||
    scene.kind === "data_chart" ||
    /data story|trend|pattern|measured|comparison|rate|total|percent|million|billion/.test(
      text
    )
  ) {
    return "data";
  }

  if (
    scene.map ||
    scene.kind === "map_story" ||
    /geograph|location|where|spatial|region|county|city|basin|route|terrain/.test(
      text
    )
  ) {
    return "geography";
  }

  if (
    /trust boundary|limitation|uncertain|does not prove|not establish|evidence stops|scope/.test(
      text
    ) ||
    scene.kind === "quote"
  ) {
    return "trust_boundary";
  }

  if (
    /governance|policy|maintenance|institution|response|management|planning|enforcement|regulation/.test(
      text
    )
  ) {
    return "governance";
  }

  if (
    /impact|consequence|people|community|household|worker|farmer|health|livelihood|loss|damage|exposure/.test(
      text
    )
  ) {
    return "consequence";
  }

  if (
    /system|mechanism|flow|path|process|driver|cause|chain|interaction|network|cycle/.test(
      text
    ) ||
    scene.kind === "diagram" ||
    scene.kind === "timeline"
  ) {
    return "mechanism";
  }

  if (
    index >=
    Math.floor(
      project.scenes.length * 0.72
    )
  ) {
    return "synthesis";
  }

  return "frame";
}

function roleWeight(
  role: DocumentarySceneRole
) {
  const weights: Record<
    DocumentarySceneRole,
    number
  > = {
    hook: 1.0,
    frame: 0.95,
    data: 1.12,
    geography: 1.03,
    mechanism: 1.12,
    consequence: 1.0,
    governance: 1.0,
    trust_boundary: 0.88,
    synthesis: 1.04,
    closure: 0.7,
  };

  return weights[role];
}

export function buildLongFormPlan(
  project: EpisodeProject
): LongFormPlan {
  const targetWords =
    targetWordCount(project);

  const wpm =
    documentaryWordsPerMinute(
      project
    );

  const rows =
    project.scenes.map(
      (scene, index) => {
        const role =
          roleForScene(
            project,
            scene,
            index
          );

        const durationWeight =
          Math.max(
            0.45,
            scene.durationSec
          );

        return {
          sceneId: scene.id,
          role,
          raw:
            durationWeight *
            roleWeight(role),
        };
      }
    );

  const rawTotal =
    rows.reduce(
      (sum, row) =>
        sum + row.raw,
      0
    ) || 1;

  const sceneTargets =
    rows.map((row) => ({
      sceneId: row.sceneId,
      role: row.role,
      targetWords:
        Math.max(
          55,
          Math.round(
            targetWords *
              (row.raw /
                rawTotal)
          )
        ),
    }));

  const current =
    sceneTargets.reduce(
      (sum, row) =>
        sum + row.targetWords,
      0
    );

  const delta =
    targetWords - current;

  if (
    sceneTargets.length &&
    delta
  ) {
    const lastNarrative =
      [...sceneTargets]
        .reverse()
        .find(
          (row) =>
            row.role !==
            "closure"
        ) ||
      sceneTargets[
        sceneTargets.length - 1
      ];

    lastNarrative.targetWords =
      Math.max(
        55,
        lastNarrative.targetWords +
          delta
      );
  }

  return {
    targetWords,
    wordsPerMinute: wpm,
    sceneTargets,
  };
}

function datasetContext(
  project: EpisodeProject,
  scene: Scene,
  datasetsOverride?: DatasetAnalysis[]
) {
  if (!scene.chart) {
    return "";
  }

  const chart = scene.chart;
  const values = [...chart.data]
    .filter((item) =>
      Number.isFinite(
        item.value
      )
    )
    .sort(
      (a, b) =>
        b.value - a.value
    );

  const first =
    values[0];
  const second =
    values[1];

  if (
    first &&
    second
  ) {
    const unit =
      clean(chart.unit) ||
      clean(chart.yLabel) ||
      "units";

    return clean(
      `The chart makes the comparison visible. ${first.label} is the highest plotted value at ${first.value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })} ${unit}, followed by ${second.label} at ${second.value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })} ${unit}. The comparison establishes the pattern in the measured data, but the chart should not be asked to prove a mechanism that it does not measure.`
    );
  }

  return clean(
    `The chart turns the available measurements into a visible pattern. It is useful for showing magnitude, sequence or contrast, while the causal explanation still has to come from evidence that directly addresses the mechanism.`
  );
}

function mapContext(
  scene: Scene
) {
  if (!scene.map) {
    return "";
  }

  const labels =
    scene.map.points
      .slice(0, 5)
      .map((point) =>
        clean(point.label)
      )
      .filter(Boolean);

  const placeText =
    labels.length
      ? `The mapped observations include ${labels.join(
          ", "
        )}.`
      : `The map locates the available observations in space.`;

  return clean(
    `${placeText} Geography matters because the same process can produce different outcomes across different places. The map should therefore show where the evidence exists, where it does not, and what spatial conclusion the current data can actually support.`
  );
}

function evidenceParagraph(
  project: EpisodeProject,
  scene: Scene
) {
  const evidence =
    safeEvidenceStatements(
      project,
      scene
    );

  if (!evidence.length) {
    return "";
  }

  const parts =
    evidence.map(
      ({ item, statement }) => {
        const label =
          sourceLabel(item);

        if (
          item.kind ===
          "limitation"
        ) {
          return `One limitation is explicit: ${statement}${
            label
              ? ` The source is ${label}.`
              : ""
          }`;
        }

        if (
          item.kind ===
          "inference"
        ) {
          return `The current interpretation is: ${statement}${
            label
              ? ` It is grounded in ${label}, but it remains interpretation rather than a new observation.`
              : " It remains interpretation rather than a new observation."
          }`;
        }

        return `The source-backed observation is: ${statement}${
          label
            ? ` The source is ${label}.`
            : ""
        }`;
      }
    );

  return clean(
    parts.join(" ")
  );
}

function roleBridge(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole
) {
  const question =
    clean(
      project.episode.question
    );

  const headline =
    clean(scene.headline);

  switch (role) {
    case "hook":
      return clean(
        `${question ? `The story begins with a deceptively simple question: ${question}` : `The story begins with a question that looks simpler than it is.`} The first answer is rarely the whole answer. A strong explanation has to move from the visible event to the system underneath it, while keeping observation, interpretation and uncertainty separate.`
      );

    case "frame":
      return clean(
        `This is where the frame of the story matters. ${headline ? `${headline}.` : ""} Instead of treating the issue as one isolated event, the useful question is which parts of the system interact, which links are directly observed, and which links still require stronger evidence.`
      );

    case "data":
      return clean(
        `Now move from description to measurement. Numbers are most useful when they change the question: they can reveal magnitude, timing, contrast or an outlier that narration alone would hide.`
      );

    case "geography":
      return clean(
        `Now put the evidence back into place. Location is not decoration here; it changes what can be inferred about exposure, movement, concentration and the limits of generalising from one site to another.`
      );

    case "mechanism":
      return clean(
        `The next step is to follow the mechanism rather than jump from cause to outcome. What enters the system, what changes along the way, where capacity or constraints appear, and what finally produces the observed result?`
      );

    case "consequence":
      return clean(
        `The system becomes consequential when it reaches people, livelihoods, infrastructure or ecosystems. The important distinction is between a measured consequence and a plausible consequence that still needs direct evidence.`
      );

    case "governance":
      return clean(
        `Physical processes do not operate outside institutions. Policy, maintenance, enforcement, investment and coordination can change how the same underlying pressure is translated into risk or resilience.`
      );

    case "trust_boundary":
      return clean(
        `This is the point where the story has to become more precise, not more confident. The evidence has a boundary, and that boundary belongs in the final explanation.`
      );

    case "synthesis":
      return clean(
        `By this point the evidence is more useful as a system than as a list of separate facts. The strongest conclusion should connect the observed pieces without pretending that one driver explains everything.`
      );

    case "closure":
      return clean(
        `A strong ending should not introduce a new claim. It should resolve the opening question, state what the evidence supports, and leave the remaining uncertainty visible.`
      );
  }
}

function analysisLayer(
  scene: Scene,
  role: DocumentarySceneRole
) {
  const body =
    clean(scene.body);

  if (!body) {
    return "";
  }

  if (
    role === "trust_boundary"
  ) {
    return clean(
      `${body} That limitation changes the strength of the conclusion. It does not make the evidence useless; it tells us the scale at which the evidence is reliable and what additional evidence would be needed for a broader claim.`
    );
  }

  if (
    role === "mechanism"
  ) {
    return clean(
      `${body} The analytical value of this scene is the relationship between steps, not the labels themselves. A mechanism is convincing only when the arrows are supported as carefully as the individual nodes.`
    );
  }

  if (
    role === "governance"
  ) {
    return clean(
      `${body} This creates an important trade-off: a technical intervention can fail if institutions cannot maintain it, while governance reform can remain abstract if the physical system itself lacks capacity.`
    );
  }

  if (
    role === "consequence"
  ) {
    return clean(
      `${body} Consequences are rarely distributed evenly. Who is exposed, where they are located, what alternatives they have, and how quickly they can recover all affect what the same event means in practice.`
    );
  }

  return clean(body);
}

function genericDepthParagraph(
  project: EpisodeProject,
  role: DocumentarySceneRole
) {
  const topic =
    clean(
      project.episode
        .workingTitle
    );

  switch (role) {
    case "hook":
      return clean(
        `That distinction matters because visible crises often compress several different processes into one image. The documentary should slow that compression down: first identify the trigger, then follow the pathway, then ask why the outcome appears where it does.`
      );

    case "data":
      return clean(
        `A single high value can be important without being sufficient. The pattern becomes more informative when it is compared across time, place or category and then connected to evidence that explains what changed in the system.`
      );

    case "geography":
      return clean(
        `A map also reveals absence. Areas without measurements should not silently inherit the values of measured locations. That gap is itself part of the evidence story and should remain visible.`
      );

    case "mechanism":
      return clean(
        `This is also where trade-offs appear. Strengthening one part of a system may shift pressure elsewhere, and solving a bottleneck is not the same as removing the underlying driver. The visual explanation should therefore reveal the sequence progressively rather than presenting a finished diagram as if every connection were equally certain.`
      );

    case "consequence":
      return clean(
        `This is why aggregate statistics can hide important differences. The same average can contain very different experiences across households, workers, neighbourhoods, firms or ecosystems.`
      );

    case "governance":
      return clean(
        `The practical question is therefore not simply whether a policy or intervention exists. It is whether responsibilities are clear, resources are available, implementation reaches the relevant places, and performance can be verified over time.`
      );

    case "trust_boundary":
      return clean(
        `Keeping that boundary visible is not a weakness in the story. It is what separates an evidence-led documentary from a confident narrative built on assumptions.`
      );

    case "synthesis":
      return clean(
        `The result is a more useful explanation of ${topic || "the issue"}: one that can distinguish immediate triggers from deeper drivers, local evidence from wider claims, and interventions that treat symptoms from interventions that change the system.`
      );

    default:
      return "";
  }
}

function dedupeSentences(
  parts: string[]
) {
  const seen =
    new Set<string>();

  const result:
    string[] = [];

  parts
    .flatMap(sentenceList)
    .forEach((sentence) => {
      const key =
        sentence
          .toLowerCase()
          .replace(
            /[^a-z0-9\s]/g,
            ""
          )
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      if (
        !key ||
        seen.has(key)
      ) {
        return;
      }

      seen.add(key);
      result.push(sentence);
    });

  return clean(
    result.join(" ")
  );
}

function fitToTarget(
  baseParts: string[],
  project: EpisodeProject,
  role: DocumentarySceneRole,
  targetWords: number
) {
  let text =
    dedupeSentences(
      baseParts
    );

  const depth =
    genericDepthParagraph(
      project,
      role
    );

  if (
    wordCount(text) <
      targetWords * 0.88 &&
    depth
  ) {
    text =
      dedupeSentences(
        [text, depth]
      );
  }

  /*
   * Do not manufacture facts merely to hit a word target. If the source-backed
   * material is still shorter than the target after one analytical depth layer,
   * leave it shorter. The duration checker can then flag the remaining gap.
   */
  return text;
}

export function buildGenericLongFormNarration(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
) {
  if (!isLongForm(project)) {
    return project.scenes;
  }

  const plan =
    buildLongFormPlan(
      project
    );

  const targetById =
    new Map(
      plan.sceneTargets.map(
        (row) => [
          row.sceneId,
          row,
        ]
      )
    );

  return project.scenes.map(
    (scene) => {
      const target =
        targetById.get(
          scene.id
        );

      if (!target) {
        return scene;
      }

      const existing =
        clean(
          scene.narration
        );

      const parts = [
        roleBridge(
          project,
          scene,
          target.role
        ),
        existing,
        datasetContext(
          project,
          scene,
          datasetsOverride
        ),
        mapContext(scene),
        evidenceParagraph(
          project,
          scene
        ),
        analysisLayer(
          scene,
          target.role
        ),
      ].filter(Boolean);

      const narration =
        fitToTarget(
          parts,
          project,
          target.role,
          target.targetWords
        );

      return {
        ...scene,
        narration,
      };
    }
  );
}
