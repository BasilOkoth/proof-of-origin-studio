# Storyworld Engine V0.3 — Canonical Character Vault

V0.3 turns recurring characters into versioned production assets rather than prompt text.

## What is locked now

For **The Kamau Will**:

- Amara Otieno — `kamau-amara-canonical-v1`
- Victor Kamau Jr. — `kamau-victor-canonical-v1`
- Evelyn Kamau — `kamau-evelyn-canonical-v1`
- Daniel Muriuki — `kamau-muriuki-canonical-v1`
- Elias Kamau — `kamau-elias-canonical-v1`

Each canonical portrait has:

- stable asset ID
- canonical path
- SHA-256 fingerprint
- wardrobe version
- stable voice-profile key
- continuity notes

Eight Episode 1 key-scene seed images are also included. They guide composition and mood but **never override the canonical character identity**.

## Install

Unzip the V0.3 package. From anywhere, run:

```bash
node /path/to/storyworld-engine-v0.3/install-storyworld-engine-v0.3.mjs /path/to/proof-of-origin-studio
```

If the installer is copied into the repository root with the `payload` folder beside it, this also works:

```bash
node install-storyworld-engine-v0.3.mjs
```

Then:

```bash
npm run storyworld:verify-vault
npm run storyworld:prepare -- kamau-will
npm run dev
```

Open:

- `/storyworld`
- `/storyworld/generate`

## Why SHA-256 matters

Character reference files are production masters. If one is silently replaced, the series can drift even when the path stays the same. `storyworld:verify-vault` recomputes every canonical character and seed-image fingerprint and fails if the bytes no longer match the approved registry.

## Generation hierarchy

`World Bible → canonical character asset → shot master → approved shot → motion → voice/SFX/music → Remotion`

For a recurring character shot, the shot prompt now carries the canonical asset path and fingerprint. Provider adapters can map the same stable asset to whatever reference-image or identity mechanism the chosen image/video provider supports.

## Seed images

V0.3 includes seed visual references for:

- k01 — will
- k04 — announcement
- k05 — Victor reaction
- k06 — Amara classroom
- k10 — summons
- k12 — envelope
- k16 — archival reveal
- k18 — confession reaction

The Remotion fallback order is now:

`generated video → generated still → approved seed image → storyboard card`

This lets editorial timing improve before all 19 final shot assets are generated.

## Voice profiles

V0.3 creates stable application-level voice keys:

- `kamau-amara-v1`
- `kamau-victor-v1`
- `kamau-evelyn-v1`
- `kamau-muriuki-v1`
- `kamau-elias-v1`

These are not provider voice IDs. Once final casting is approved, map each key to one permanent provider voice ID and never change it silently.

## Next layer

V0.4 should add provider executors and post-generation continuity review:

- image provider adapter
- image-to-video provider adapter
- ElevenLabs key → voice-ID mapping
- face/wardrobe continuity inspection
- shot approval UI
- final 19-shot production render
