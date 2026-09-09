import type { EpisodeProject, Scene } from "./types";
import type { AudioCue, AudioDirection } from "./audio-types";

function episodeDuration(project: EpisodeProject) {
  return project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
}

function sceneStart(project: EpisodeProject, index: number) {
  return project.scenes.slice(0, index).reduce((sum, scene) => sum + scene.durationSec, 0);
}

function soundMood(scene: Scene) {
  const text = `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.narration}`;
  if (scene.kind === "hook") return "curiosity";
  if (scene.kind === "value_swap" || /\b(risk|problem|change|changed|however|but)\b/i.test(text)) return "tension";
  if (scene.kind === "source_highlight" || scene.kind === "document" || scene.kind === "proof_card") return "proof";
  if (scene.kind === "quote") return "reflection";
  if (scene.kind === "cta") return "resolution";
  return "momentum";
}

function ambienceFor(scene: Scene) {
  const text = `${scene.headline} ${scene.body} ${scene.narration}`;
  if (/\b(city|urban|street|market|traffic|nairobi|accra|lagos)\b/i.test(text)) return "city";
  if (/\b(forest|river|farm|nature|coast|mangrove|rain|landscape)\b/i.test(text)) return "nature";
  if (/\b(document|report|office|meeting|interview|research)\b/i.test(text)) return "room";
  if (/\b(digital|data|computer|technology|screen|platform)\b/i.test(text)) return "technology";
  return "none";
}

function transitionFor(scene: Scene, index: number): AudioCue["transition"] {
  if (scene.kind === "hook") return "riser";
  if (scene.kind === "value_swap") return "hit";
  if (scene.kind === "data_chart" || scene.kind === "map_story") return index % 2 ? "tick" : "whoosh";
  if (scene.kind === "source_highlight" || scene.kind === "document") return "tick";
  if (scene.kind === "cta") return "riser";
  return "none";
}

export function buildAudioDirectionPlan(project: EpisodeProject): AudioDirection {
  const total = episodeDuration(project);
  const capped = Math.min(total, 600);
  const title = project.episode.workingTitle || project.episode.question;
  const mode = project.episode.storyMode || "explainer";

  const scorePrompt = [
    `Instrumental documentary explainer score for "${title}".`,
    `Editorial style: premium evidence-led visual journalism, intelligent, contemporary, restrained, human.`,
    `Narrative arc: begin with curiosity, develop subtle investigative momentum, reduce energy under evidence and quotations, add controlled tension around contradictions, then resolve warmly.`,
    `No vocals. No lyrics. Avoid bombastic trailer music, heroic clichés, comedy, corporate ukulele, or overpowering percussion.`,
    `Leave space for spoken narration. Use a coherent sonic palette across the full piece, with gentle sectional evolution rather than unrelated tracks.`,
    `Suitable for a ${mode} story.`,
  ].join(" ");

  const cues: AudioCue[] = [];

  project.scenes.forEach((scene, index) => {
    const startSec = sceneStart(project, index);
    const mood = soundMood(scene);
    const ambience = ambienceFor(scene);
    const transition = transitionFor(scene, index);

    if (ambience !== "none") {
      const descriptors: Record<string, string> = {
        city: "Natural East African urban ambience, distant traffic and people, documentary realism, no intelligible foreground speech, subtle and non-distracting",
        nature: "Natural outdoor ambience, soft wind and environmental texture, documentary realism, no dramatic animals, subtle and loopable",
        room: "Quiet documentary room tone, subtle interior presence, neutral, realistic, no distinct voices, seamless loop",
        technology: "Subtle modern technology room ambience, faint electronic texture and interface presence, realistic, restrained, no melody",
      };
      cues.push({
        id: `ambience-${scene.id}`,
        sceneId: scene.id,
        kind: "ambience",
        label: `ambience-${ambience}`,
        prompt: descriptors[ambience],
        startSec,
        durationSec: Math.min(30, Math.max(8, scene.durationSec)),
        volume: 0.045,
        loop: scene.durationSec > 20,
        transition: "none",
      });
    }

    if (transition !== "none") {
      const prompts: Record<string, string> = {
        hit: "Short restrained documentary impact, clean low-mid transient, sophisticated, not cinematic trailer boom, about half a second",
        whoosh: "Short elegant editorial transition whoosh, clean air movement, modern documentary explainer, subtle, no sci-fi character",
        tick: "Clean editorial evidence tick, precise soft click with slight tonal body, understated, professional",
        riser: mood === "resolution"
          ? "Short warm editorial lift into a resolution, subtle rising texture, optimistic but restrained, no trailer swell"
          : "Short investigative documentary riser, restrained curiosity, subtle tension, clean ending, no horror or trailer drama",
      };
      cues.push({
        id: `sfx-${scene.id}`,
        sceneId: scene.id,
        kind: "sfx",
        label: `sfx-${transition}`,
        prompt: prompts[transition],
        startSec,
        durationSec: transition === "tick" ? 1 : 2.5,
        volume: 0.13,
        loop: false,
        transition,
      });
    }
  });

  // De-duplicate reusable ambience/SFX prompts. The renderer can reuse the same asset at many cue positions.
  const unique = new Map<string, AudioCue>();
  for (const cue of cues) {
    const key = `${cue.kind}:${cue.label}:${cue.prompt}`;
    if (!unique.has(key)) unique.set(key, cue);
  }

  return {
    version: "origin-audio-director-1",
    generatedAt: new Date().toISOString(),
    provider: "elevenlabs",
    score: {
      prompt: scorePrompt,
      modelId: "music_v2",
      durationSec: capped,
    },
    cues,
    assets: [],
    notes: [
      total > 600
        ? `Episode is ${Math.round(total)}s; ElevenLabs Music generation is capped at 600s, so the score is generated for the first 600s.`
        : `One coherent score is generated for the ${Math.round(total)}s episode.`,
      `Generated ambience/SFX are intentionally restrained beneath narration.`,
      `All generated audio assets retain provider, model, prompt and generation time metadata.`,
    ],
  };
}

export function uniqueGenerationCues(direction: AudioDirection) {
  const unique = new Map<string, AudioCue>();
  for (const cue of direction.cues) {
    const key = `${cue.kind}:${cue.label}:${cue.prompt}`;
    if (!unique.has(key)) unique.set(key, cue);
  }
  return [...unique.values()];
}
