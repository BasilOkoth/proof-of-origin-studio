import { getPilotEpisode, getStoryworld } from "./storyworld-data";
import type {
  CharacterLock,
  ContinuityIssue,
  EpisodeManifest,
  EpisodeQualityReport,
  EpisodeSpec,
  ShotManifest,
  ShotSpec,
  StoryworldBible,
  StoryworldProductionPackage,
} from "./storyworld-types";

const PREMIUM_VISUAL_PREFIX =
  "premium cinematic prestige drama, photorealistic, natural skin texture, realistic East African setting, restrained production design, sophisticated lighting, premium color grade, believable architecture, no generic AI gloss, no soap-opera aesthetic";

function characterPrompt(character: CharacterLock) {
  return `${character.name}: ${character.appearance} Wardrobe: ${character.wardrobe}`;
}

function continuityFingerprint(character: CharacterLock) {
  return [
    character.id,
    character.name,
    character.age,
    character.appearance,
    character.wardrobe,
    ...character.continuityRules,
  ].join(" | ");
}

export function buildShotPrompt(world: StoryworldBible, shot: ShotSpec) {
  const lockedCharacters = shot.characters
    .map((id) => world.characters.find((character) => character.id === id))
    .filter(Boolean) as CharacterLock[];

  const characterSection = lockedCharacters.length
    ? `CHARACTER LOCKS: ${lockedCharacters.map(characterPrompt).join(" || ")}.`
    : "No featured character face; prioritize environment and story object continuity.";

  const worldSection = `WORLD LANGUAGE: ${world.visualIdentity.join("; ")}.`;
  const promptNotes = shot.promptNotes ? `SHOT NOTES: ${shot.promptNotes}.` : "";

  return [
    PREMIUM_VISUAL_PREFIX,
    "vertical 9:16 composition",
    worldSection,
    characterSection,
    `SHOT: ${shot.visual}`,
    `CAMERA: ${shot.camera}.`,
    `STORY PURPOSE: ${shot.purpose}.`,
    promptNotes,
    "Preserve exact character identity, hair, age, skin tone, wardrobe and proportions from the approved character vault. Avoid text artifacts unless the shot explicitly requires readable on-screen text.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildEpisodeManifest(world: StoryworldBible, episode: EpisodeSpec): EpisodeManifest {
  const shots: ShotManifest[] = episode.shots.map((shot) => {
    const locks = shot.characters
      .map((id) => world.characters.find((character) => character.id === id))
      .filter(Boolean) as CharacterLock[];

    return {
      ...shot,
      durationSec: Number((shot.endSec - shot.startSec).toFixed(2)),
      imagePrompt: buildShotPrompt(world, shot),
      continuityFingerprint: locks.map(continuityFingerprint).join("\n---\n"),
    };
  });

  return {
    ...episode,
    shots,
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasUsefulCliffhanger(text: string) {
  return text.trim().length >= 20 && !/episode 2 coming soon/i.test(text);
}

function scoreEpisode(world: StoryworldBible, episode: EpisodeManifest): EpisodeQualityReport {
  const issues: ContinuityIssue[] = [];
  const characters = new Set(world.characters.map((character) => character.id));
  const sorted = [...episode.shots].sort((a, b) => a.startSec - b.startSec);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (!first || first.startSec !== 0) {
    issues.push({ severity: "blocker", message: "Episode must begin at 0:00 with an explicit first shot." });
  }

  if (!last || Math.abs(last.endSec - episode.runtimeSec) > 1) {
    issues.push({
      severity: "warning",
      message: `Last shot should end at the declared runtime (${episode.runtimeSec}s).`,
    });
  }

  let previousEnd = 0;
  for (const shot of sorted) {
    if (shot.startSec < previousEnd - 0.01) {
      issues.push({ severity: "blocker", message: `Shot ${shot.id} overlaps the previous shot.` });
    }
    if (shot.startSec > previousEnd + 0.25) {
      issues.push({ severity: "warning", message: `There is a timing gap before shot ${shot.id}.` });
    }
    if (shot.endSec <= shot.startSec) {
      issues.push({ severity: "blocker", message: `Shot ${shot.id} has a non-positive duration.` });
    }
    for (const characterId of shot.characters) {
      if (!characters.has(characterId)) {
        issues.push({ severity: "blocker", message: `Shot ${shot.id} references unknown character '${characterId}'.` });
      }
    }
    if (!shot.imagePrompt.includes("vertical 9:16")) {
      issues.push({ severity: "warning", message: `Shot ${shot.id} is missing the vertical composition lock.` });
    }
    previousEnd = shot.endSec;
  }

  if (episode.runtimeSec < 45 || episode.runtimeSec > 90) {
    issues.push({ severity: "warning", message: "Pilot runtime should normally stay between 45 and 90 seconds." });
  }

  if (episode.shots.length < 7) {
    issues.push({ severity: "warning", message: "Pilot may lack enough visual variation for short-form retention." });
  }

  const hook = clampScore(
    72 +
      Math.min(18, episode.firstFrame.length / 8) +
      (episode.beats[0]?.startSec === 0 ? 8 : 0)
  );
  const clarity = clampScore(76 + (episode.episodeQuestion.length > 20 ? 10 : 0) + (episode.payoff.length > 20 ? 8 : 0));
  const progress = clampScore(70 + Math.min(20, episode.beats.length * 4) + Math.min(10, episode.shots.length / 2));
  const payoff = clampScore(78 + (episode.payoff.length > 24 ? 14 : 4));
  const cliffhanger = clampScore(78 + (hasUsefulCliffhanger(episode.cliffhanger) ? 18 : 0));
  const continuity = clampScore(100 - issues.filter((i) => i.severity === "blocker").length * 35 - issues.filter((i) => i.severity === "warning").length * 8);
  const visual = clampScore(72 + Math.min(18, episode.shots.length) + (world.visualIdentity.length >= 4 ? 8 : 0));
  const sound = clampScore(78 + (world.soundIdentity.length >= 3 ? 10 : 0) + (episode.musicDirection.length > 60 ? 8 : 0));

  const score = clampScore(
    hook * 0.16 +
      clarity * 0.12 +
      progress * 0.12 +
      payoff * 0.14 +
      cliffhanger * 0.16 +
      continuity * 0.12 +
      visual * 0.1 +
      sound * 0.08
  );

  if (!issues.length) {
    issues.push({ severity: "info", message: "No structural blockers detected. Human editorial approval is still required before generation/render." });
  }

  return { score, hook, clarity, progress, payoff, cliffhanger, continuity, visual, sound, issues };
}

export function buildStoryworldPackage(worldId: string): StoryworldProductionPackage {
  const world = getStoryworld(worldId);
  const episode = getPilotEpisode(worldId);

  if (!world) throw new Error(`Unknown storyworld: ${worldId}`);
  if (!episode) throw new Error(`No pilot episode found for storyworld: ${worldId}`);

  const manifest = buildEpisodeManifest(world, episode);
  const quality = scoreEpisode(world, manifest);

  return {
    world,
    episode: manifest,
    quality,
    generatedAt: new Date().toISOString(),
    schemaVersion: "storyworld-v0.1",
  };
}

export function buildRenderBrief(pkg: StoryworldProductionPackage) {
  const { world, episode, quality } = pkg;

  return [
    `${world.title.toUpperCase()} — EPISODE ${episode.number}: ${episode.title.toUpperCase()}`,
    `${episode.runtimeSec}s | ${episode.aspectRatio} | ${world.genre}`,
    "",
    `EPISODE QUESTION: ${episode.episodeQuestion}`,
    `PAYOFF: ${episode.payoff}`,
    `CLIFFHANGER: ${episode.cliffhanger}`,
    "",
    `QUALITY SCORE: ${quality.score}/100`,
    "",
    "CHARACTER LOCKS",
    ...world.characters.map(
      (character) =>
        `- ${character.name}: ${character.appearance} | ${character.wardrobe} | ${character.continuityRules.join(" ")}`
    ),
    "",
    "SHOT PLAN",
    ...episode.shots.map(
      (shot) =>
        `${shot.startSec.toFixed(1)}–${shot.endSec.toFixed(1)}s | ${shot.label} | ${shot.camera}\n${shot.visual}\nPrompt: ${shot.imagePrompt}`
    ),
    "",
    `MUSIC: ${episode.musicDirection}`,
    `SUBTITLES: ${episode.subtitleDirection}`,
  ].join("\n");
}
