import type { CharacterLock, ShotManifest, StoryworldProductionPackage } from "./storyworld-types";
import { getLockedCharacter, getSeedShot } from "./storyworld-character-vault";
import type {
  CaptionCue,
  CharacterReferenceAsset,
  GenerationJob,
  StoryworldGenerationPlan,
  VoiceCue,
} from "./storyworld-generation-types";

function faceLockKey(character: CharacterLock) {
  return [character.id, character.age, character.appearance, character.wardrobe].join("::");
}

function buildCharacterReferencePrompt(pkg: StoryworldProductionPackage, character: CharacterLock) {
  return [
    "Create a premium photorealistic character reference sheet for a prestige African drama.",
    `SERIES: ${pkg.world.title}.`,
    `SETTING: ${pkg.world.setting}.`,
    `CHARACTER: ${character.name}, age ${character.age}, ${character.role}.`,
    `APPEARANCE LOCK: ${character.appearance}`,
    `WARDROBE LOCK: ${character.wardrobe}`,
    `ESSENCE: ${character.essence}`,
    `VISUAL MOTIFS: ${character.visualMotifs.join("; ")}.`,
    `CONTINUITY RULES: ${character.continuityRules.join(" ")}`,
    "Sheet must include a clean front portrait, three-quarter portrait, neutral profile, full-body wardrobe reference, and two subtle emotional expressions.",
    "Natural skin texture, believable Kenyan/East African casting, restrained styling, no beauty-filter look, no celebrity resemblance, no text artifacts on face or clothing.",
    "The reference is an identity lock for later shots, so facial geometry, hairstyle, skin tone, apparent age, proportions and wardrobe must be unambiguous.",
  ].join(" ");
}

function buildShotGenerationPrompt(pkg: StoryworldProductionPackage, shot: ShotManifest) {
  const referenced = shot.characters
    .map((id) => pkg.world.characters.find((character) => character.id === id))
    .filter(Boolean) as CharacterLock[];

  const refs = referenced.length
    ? referenced
        .map((character) => {
          const locked = getLockedCharacter(pkg.world.id, character.id);
          const canonical = locked
            ? `CANONICAL ASSET ${locked.assetId} at ${locked.canonicalPath}; SHA-256 ${locked.sha256}.`
            : "Use the approved character reference generated for this production.";
          return `${character.name}: ${canonical} Preserve exact face, hairstyle, apparent age, skin tone, body proportions and Episode 1 wardrobe. ${character.continuityRules.join(" ")}`;
        })
        .join(" || ")
    : "No recurring character face in this shot.";

  const seed = getSeedShot(pkg.world.id, shot.id);

  return [
    shot.imagePrompt,
    `REFERENCE REQUIREMENTS: ${refs}`,
    seed ? `COMPOSITION SEED: ${seed.seedPath}. Use it for framing/mood only; canonical character references override any identity ambiguity.` : "",
    "Render as a clean cinematic master frame without subtitles, platform UI or decorative borders.",
    "If a document must contain readable words, keep only the story-critical words and leave other copy indistinct so text can be composited later.",
    "Preserve realistic Nairobi architecture, natural skin texture, plausible lighting and physical scale.",
  ].filter(Boolean).join(" ");
}

function motionInstruction(shot: ShotManifest) {
  const camera = shot.camera.toLowerCase();
  if (camera.includes("macro")) return "subtle 2.5D push-in, realistic focus breathing, no morphing";
  if (camera.includes("wide")) return "slow cinematic dolly or parallax move, restrained environmental motion";
  if (camera.includes("close")) return "very subtle breathing and eye movement, micro push-in, no face drift";
  if (camera.includes("static")) return "no camera movement except filmic grain and extremely subtle light movement";
  return "restrained cinematic micro-motion matching the stated camera direction; no identity drift or object morphing";
}

function normalizeSpeaker(value: string) {
  return value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

function voiceProfileFor(pkg: StoryworldProductionPackage, speaker: string) {
  const normalized = normalizeSpeaker(speaker);
  const character = pkg.world.characters.find((candidate) => {
    const name = normalizeSpeaker(candidate.name);
    const last = name.split(" ").at(-1) || name;
    const first = name.split(" ")[0] || name;
    return normalized === name || normalized === first || normalized === last || name.includes(normalized);
  });
  if (!character) return undefined;
  return getLockedCharacter(pkg.world.id, character.id)?.voiceProfileKey;
}

function buildVoiceCues(pkg: StoryworldProductionPackage): VoiceCue[] {
  const cues: VoiceCue[] = [];
  for (const shot of pkg.episode.shots) {
    if (shot.narration) {
      const speaker = inferNarrator(pkg, shot.narration);
      cues.push({
        id: `${shot.id}-narration`,
        speaker,
        startSec: shot.startSec,
        endSec: shot.endSec,
        text: shot.narration,
        voiceProfileKey: voiceProfileFor(pkg, speaker),
        outputPath: `public/storyworld/${pkg.world.id}/${pkg.episode.id}/audio/${shot.id}-narration.mp3`,
      });
    }
    for (let i = 0; i < (shot.dialogue?.length || 0); i += 1) {
      const line = shot.dialogue![i];
      const count = shot.dialogue!.length;
      const slot = (shot.endSec - shot.startSec) / Math.max(1, count);
      cues.push({
        id: `${shot.id}-dialogue-${i + 1}`,
        speaker: line.speaker,
        startSec: Number((shot.startSec + slot * i).toFixed(2)),
        endSec: Number((shot.startSec + slot * (i + 1)).toFixed(2)),
        text: line.text,
        delivery: line.delivery,
        voiceProfileKey: voiceProfileFor(pkg, line.speaker),
        outputPath: `public/storyworld/${pkg.world.id}/${pkg.episode.id}/audio/${shot.id}-dialogue-${i + 1}.mp3`,
      });
    }
  }
  return cues;
}

function inferNarrator(pkg: StoryworldProductionPackage, text: string) {
  if (pkg.world.id === "kamau-will") {
    if (/Elias Kamau died|He left control/i.test(text)) return "AMARA";
    if (/If you're reading|father|David Otieno|stole/i.test(text)) return "ELIAS";
  }
  if (pkg.world.id === "217") return "AMANI";
  if (pkg.world.id === "sanctuary-7") return /At 6:42|strange part/i.test(text) ? "NIA" : "AMARA ADERA";
  return "NARRATOR";
}

function buildCaptionCues(voices: VoiceCue[]): CaptionCue[] {
  return voices.map((cue) => ({
    id: `caption-${cue.id}`,
    startSec: cue.startSec,
    endSec: cue.endSec,
    text: cue.text,
    speaker: cue.speaker,
  }));
}

export function buildStoryworldGenerationPlan(pkg: StoryworldProductionPackage): StoryworldGenerationPlan {
  const root = `public/storyworld/${pkg.world.id}/${pkg.episode.id}`;

  const characterReferences: CharacterReferenceAsset[] = pkg.world.characters.map((character) => {
    const locked = getLockedCharacter(pkg.world.id, character.id);
    return {
      characterId: character.id,
      characterName: character.name,
      faceLockKey: faceLockKey(character),
      referencePath: locked?.canonicalPath || `${root}/characters/${character.id}-reference.png`,
      approved: Boolean(locked),
      canonicalAssetId: locked?.assetId,
      sha256: locked?.sha256,
      approvedAt: locked?.approvedAt,
      wardrobeVersion: locked?.wardrobeVersion,
      prompt: buildCharacterReferencePrompt(pkg, character),
      voiceId: locked?.voiceProfileKey,
      notes: locked
        ? ["LOCKED: canonical reference approved for reuse.", ...locked.notes, ...character.continuityRules]
        : ["Approve this identity before generating any shot that contains the character.", ...character.continuityRules],
    };
  });

  const refMap = new Map(characterReferences.map((ref) => [ref.characterId, ref]));
  const jobs: GenerationJob[] = [];

  for (const character of characterReferences) {
    jobs.push({
      id: `character-${character.characterId}`,
      kind: "character-reference",
      provider: "manual",
      status: character.approved ? "approved" : "ready",
      blockedBy: [],
      prompt: character.prompt,
      outputPath: character.referencePath,
      characterIds: [character.characterId],
      metadata: {
        canonicalAssetId: character.canonicalAssetId || "pending",
        sha256: character.sha256 || "pending",
        voiceProfileKey: character.voiceId || "pending",
      },
    });
  }

  for (const shot of pkg.episode.shots) {
    const blockers = shot.characters
      .filter((id) => !refMap.get(id)?.approved)
      .map((id) => `character-${id}`);
    const imagePath = `${root}/shots/${shot.id}.png`;
    const videoPath = `${root}/shots/${shot.id}.mp4`;
    const seed = getSeedShot(pkg.world.id, shot.id);
    const referencePaths = shot.characters.map((id) => refMap.get(id)?.referencePath).filter(Boolean) as string[];

    jobs.push({
      id: `image-${shot.id}`,
      kind: "shot-image",
      provider: "openai-images",
      status: blockers.length ? "blocked" : "ready",
      blockedBy: blockers,
      prompt: buildShotGenerationPrompt(pkg, shot),
      outputPath: imagePath,
      shotId: shot.id,
      characterIds: shot.characters,
      metadata: {
        durationSec: shot.durationSec,
        camera: shot.camera,
        motionInstruction: motionInstruction(shot),
        referencePaths,
        seedImagePath: seed?.seedPath || "",
      },
    });

    jobs.push({
      id: `video-${shot.id}`,
      kind: "shot-video",
      provider: "video-provider",
      status: "blocked",
      blockedBy: [`image-${shot.id}`],
      prompt: `${buildShotGenerationPrompt(pkg, shot)} MOTION: ${motionInstruction(shot)}. Keep exact identity and geometry from the approved still/reference; avoid face drift, limb morphing, flicker, warped hands or changing wardrobe.`,
      outputPath: videoPath,
      shotId: shot.id,
      characterIds: shot.characters,
      metadata: { durationSec: shot.durationSec, camera: shot.camera, referencePaths },
    });
  }

  const voices = buildVoiceCues(pkg);
  for (const voice of voices) {
    jobs.push({
      id: `voice-${voice.id}`,
      kind: "voice",
      provider: "elevenlabs",
      status: "ready",
      blockedBy: [],
      prompt: `${voice.speaker}: ${voice.text}${voice.delivery ? ` Delivery: ${voice.delivery}` : ""}`,
      outputPath: voice.outputPath,
      metadata: {
        speaker: voice.speaker,
        startSec: voice.startSec,
        endSec: voice.endSec,
        voiceProfileKey: voice.voiceProfileKey || "casting-pending",
      },
    });
  }

  const captions = buildCaptionCues(voices);
  jobs.push({ id: "captions-master", kind: "caption", provider: "manual", status: "ready", blockedBy: [], outputPath: `${root}/captions.json`, metadata: { count: captions.length } });
  jobs.push({ id: "music-master", kind: "music", provider: "manual", status: "ready", blockedBy: [], prompt: pkg.episode.musicDirection, outputPath: `${root}/audio/music-master.mp3` });

  for (const shot of pkg.episode.shots) {
    if (!shot.sound) continue;
    jobs.push({ id: `sfx-${shot.id}`, kind: "sfx", provider: "manual", status: "ready", blockedBy: [], prompt: shot.sound, outputPath: `${root}/audio/${shot.id}-sfx.mp3`, shotId: shot.id });
  }

  const renderShots = pkg.episode.shots.map((shot) => {
    const seed = getSeedShot(pkg.world.id, shot.id);
    return {
      id: shot.id,
      startSec: shot.startSec,
      endSec: shot.endSec,
      durationSec: shot.durationSec,
      label: shot.label,
      purpose: shot.purpose,
      camera: shot.camera,
      visual: shot.visual,
      imagePath: `${root}/shots/${shot.id}.png`,
      videoPath: `${root}/shots/${shot.id}.mp4`,
      seedImagePath: seed?.seedPath,
      preferredAsset: "video" as const,
      motionInstruction: motionInstruction(shot),
      narration: shot.narration,
      dialogue: shot.dialogue,
      onScreenText: shot.onScreenText,
      sound: shot.sound,
    };
  });

  return {
    schemaVersion: "storyworld-v0.3",
    generatedAt: new Date().toISOString(),
    sourcePackage: pkg,
    characterReferences,
    jobs,
    render: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: pkg.episode.runtimeSec,
      compositionId: "StoryworldEpisode",
      worldId: pkg.world.id,
      episodeId: pkg.episode.id,
      shots: renderShots,
      voices,
      captions,
      musicDirection: pkg.episode.musicDirection,
      subtitleDirection: pkg.episode.subtitleDirection,
      title: pkg.world.title,
      episodeTitle: pkg.episode.title,
    },
    approvalGates: [
      "Locked character SHA-256 fingerprints must verify before production.",
      "Approve the hero still for each shot before image-to-video generation.",
      "Reject any shot with face, hair, age, skin-tone, wardrobe or body-proportion drift.",
      "Seed-shot images guide composition only; canonical character references control identity.",
      "Composite important readable text in Remotion rather than trusting generated text unless explicitly approved.",
      "Use one stable voiceProfileKey per recurring character; map it to a permanent provider voice ID once cast.",
      "Human editorial approval is mandatory before final render and publication.",
    ],
  };
}

export function summarizeGenerationPlan(plan: StoryworldGenerationPlan) {
  const counts = plan.jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.kind] = (acc[job.kind] || 0) + 1;
    return acc;
  }, {});
  return {
    world: plan.sourcePackage.world.title,
    episode: plan.sourcePackage.episode.title,
    runtimeSec: plan.render.durationSec,
    characters: plan.characterReferences.length,
    approvedCharacters: plan.characterReferences.filter((ref) => ref.approved).length,
    shots: plan.render.shots.length,
    seededShots: plan.render.shots.filter((shot) => shot.seedImagePath).length,
    jobs: plan.jobs.length,
    counts,
  };
}
