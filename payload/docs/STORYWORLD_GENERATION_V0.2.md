# Storyworld Engine V0.2 — Generation Layer

V0.2 converts the deterministic Storyworld V0.1 production manifest into a generation queue and Remotion-ready render plan.

## Core rule

**Do not generate recurring-character shots until the character reference has been approved.**

The dependency chain is:

`World Bible → Character Reference → Approved Hero Still → Video Motion → Voice/SFX/Music → Remotion Render`

This intentionally separates story logic from expensive media generation.

## Install

Use `install-storyworld-engine-v0.2.mjs` from the repository root, or copy the files in this package into the same paths.

The installer adds two package scripts:

```json
"storyworld:prepare": "tsx scripts/prepare-storyworld.ts",
"render:storyworld": "tsx scripts/render-storyworld.ts"
```

## Prepare The Kamau Will pilot

```bash
npm run storyworld:prepare -- kamau-will
```

This creates:

- `episodes/storyworld/kamau-will-kamau-e01.production.json`
- `public/storyworld/kamau-will/kamau-e01/characters/`
- `public/storyworld/kamau-will/kamau-e01/shots/`
- `public/storyworld/kamau-will/kamau-e01/audio/`
- `public/storyworld/kamau-will/kamau-e01/GENERATION_PROMPTS.md`

## Generation workflow

1. Generate each character reference sheet from `characterReferences[].prompt`.
2. Human-approve the identity and put it at the specified `referencePath`.
3. Generate the shot master still from the `shot-image` job prompt, using the approved recurring-character references.
4. Approve the still.
5. Animate the approved still using the paired `shot-video` job prompt and motion instruction.
6. Assign permanent recurring voice IDs and generate the voice jobs.
7. Add SFX and one restrained music master.
8. Render:

```bash
npm run render:storyworld -- episodes/storyworld/kamau-will-kamau-e01.production.json
```

If shot assets do not yet exist, the Remotion composition renders premium storyboard fallback cards so pacing can be tested early.

## Provider strategy

V0.2 is intentionally provider-agnostic. `GenerationJob.provider` identifies the intended class of provider, while prompts and output paths remain stable. This makes it possible to change image/video/voice providers without rewriting the story engine.

Recommended progression:

- image/reference generation: an image model supporting reference images/identity consistency
- motion: an image-to-video model, using the approved shot still as source
- voice: existing ElevenLabs Audio Director / permanent character voice IDs
- final assembly: Remotion

## Why this architecture matters

A single text-to-video prompt per scene is not enough for a serial franchise. It tends to create character drift, wardrobe drift, visual inconsistency, accidental text artifacts and weak editorial control. The V0.2 dependency graph makes continuity an explicit production gate.
