import type { EpisodeProject, Scene } from "./types";
import type { MediaScoutResult, MediaCandidate } from "./media-scout-types";
import type { SceneShotSequence, Shot, ShotRole } from "./shot-sequence-types";

function rhythm(scene: Scene): SceneShotSequence["rhythm"] {
  if (scene.kind === "hook" || scene.kind === "value_swap") return "fast";
  if (scene.kind === "quote" || scene.kind === "document") return "slow";
  return "medium";
}

function roleOrder(scene: Scene): ShotRole[] {
  if (scene.kind === "hook") {
    return ["establishing", "human", "detail", "graphic_interrupt", "payoff"];
  }
  if (scene.kind === "document" || scene.kind === "source_highlight") {
    return ["establishing", "evidence", "detail", "graphic_interrupt", "payoff"];
  }
  if (scene.kind === "diagram" || scene.kind === "timeline") {
    return ["establishing", "process", "graphic_interrupt", "detail", "payoff"];
  }
  if (scene.kind === "quote") {
    return ["human", "detail", "payoff"];
  }
  return ["establishing", "human", "process", "detail", "graphic_interrupt", "payoff"];
}

function durationWeights(roles: ShotRole[], pace: SceneShotSequence["rhythm"]) {
  const base: Record<ShotRole, number> = {
    establishing: 1.2,
    human: 1.4,
    detail: 1.0,
    process: 1.25,
    evidence: 1.3,
    graphic_interrupt: pace === "fast" ? 0.8 : 1.0,
    payoff: 1.1,
  };
  return roles.map((role) => base[role]);
}

function chooseCandidate(
  candidates: MediaCandidate[],
  role: ShotRole,
  used: Set<string>
) {
  const available = candidates.filter((c) => !used.has(c.id));
  const pool = available.length ? available : candidates;
  if (!pool.length) return undefined;

  const scored = pool.map((candidate) => {
    let score = candidate.relevanceScore || 0;
    const title = candidate.title.toLowerCase();

    if (role === "establishing") {
      if (candidate.mediaType === "video") score += 5;
      if ((candidate.width || 0) > (candidate.height || 0)) score += 3;
    }
    if (role === "human" && /\b(person|people|worker|farmer|woman|man|community|market)\b/.test(title)) score += 5;
    if (role === "detail" && candidate.mediaType === "image") score += 2;
    if (role === "process" && candidate.mediaType === "video") score += 5;
    if (role === "evidence" && candidate.mediaType === "image") score += 3;

    return { candidate, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.candidate;
}

function treatmentFor(role: ShotRole): Shot["treatment"] {
  if (role === "establishing") return "slow_push";
  if (role === "human") return "ken_burns";
  if (role === "detail") return "crop_detail";
  if (role === "process") return "hold";
  if (role === "evidence") return "slow_push";
  if (role === "graphic_interrupt") return "graphic";
  if (role === "payoff") return "fade";
  return "hold";
}

export function buildShotSequence(
  scene: Scene,
  candidates: MediaCandidate[]
): SceneShotSequence {
  const pace = rhythm(scene);
  const roles = roleOrder(scene);

  // Very short scenes should not be overcut.
  const maxShots =
    scene.durationSec < 8 ? 3 :
    scene.durationSec < 15 ? 4 :
    pace === "fast" ? 5 : 6;

  const selectedRoles = roles.slice(0, maxShots);
  const weights = durationWeights(selectedRoles, pace);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const used = new Set<string>();
  const shots: Shot[] = [];
  let cursor = 0;

  selectedRoles.forEach((role, index) => {
    const dur = Math.max(
      1.2,
      (scene.durationSec * weights[index]) / totalWeight
    );

    const needsRealMedia = !["graphic_interrupt", "payoff"].includes(role);
    const candidate = needsRealMedia
      ? chooseCandidate(candidates, role, used)
      : undefined;

    if (candidate) used.add(candidate.id);

    shots.push({
      id: `${scene.id}-${role}-${index}`,
      role,
      startSec: cursor,
      durationSec: Math.min(dur, Math.max(1.2, scene.durationSec - cursor)),
      candidate,
      note:
        role === "establishing"
          ? "Orient the viewer in place/context before explanation."
          : role === "human"
          ? "Move from system-scale abstraction to a person-centered visual."
          : role === "detail"
          ? "Use a tighter visual detail to reset attention."
          : role === "process"
          ? "Show physical action or movement while narration explains the mechanism."
          : role === "evidence"
          ? "Let the source/document become the visual object."
          : role === "graphic_interrupt"
          ? "Interrupt B-roll with a map, number, diagram or text beat."
          : "Land the key idea with a calmer final visual.",
      treatment: treatmentFor(role),
    });

    cursor += dur;
  });

  // Normalize the final shot to end exactly at scene duration.
  if (shots.length) {
    const last = shots[shots.length - 1];
    last.durationSec = Math.max(1, scene.durationSec - last.startSec);
  }

  return {
    sceneId: scene.id,
    headline: scene.headline,
    totalDurationSec: scene.durationSec,
    shots,
    rhythm: pace,
    rationale:
      pace === "fast"
        ? "Fast editorial rhythm: change visual grammar frequently while preserving a coherent story beat."
        : pace === "slow"
        ? "Slow editorial rhythm: fewer cuts, stronger holds, more room for evidence or reflection."
        : "Balanced editorial rhythm: alternate context, people, process, detail and graphics.",
  };
}

export function buildEpisodeShotSequences(
  project: EpisodeProject,
  scout: MediaScoutResult
): SceneShotSequence[] {
  return project.scenes.map((scene) => {
    const found = scout.scenes.find((x) => x.sceneId === scene.id);
    return buildShotSequence(scene, found?.candidates || []);
  });
}
