# Storyworld Production Engine V0.1

Storyworld is a new production lane for Origin Studio. It is designed for original fictional IP rather than evidence-led documentary production.

The central rule is simple:

> Generative models are replaceable. The story bible and continuity memory are the asset.

## V0 pipeline

1. Story Bible
2. Character Vault
3. Episode Spec
4. Shot Manifest
5. Character/World prompt composition
6. Continuity fingerprinting
7. Pre-generation quality gate
8. JSON/render-brief export

V0 intentionally stops before calling image, video, voice or music providers. This allows the story structure and continuity contract to be approved before spending generation credits.

## Included pilot worlds

- The Kamau Will — EP01: Fifty-One Percent
- 2:17 — EP01: The Map
- Sanctuary 7 — EP01: The Migration

## Route

After installation and starting the Next.js app, open:

`http://localhost:3000/storyworld`

The UI can:

- switch between the three worlds
- inspect the locked character vault
- inspect every pilot shot and its generated visual prompt
- rebuild the deterministic production manifest
- download the manifest as JSON
- copy a human-readable render brief
- run a structural/continuity quality gate before expensive generation

## Files added

- `src/lib/storyworld-types.ts`
- `src/lib/storyworld-data.ts`
- `src/lib/storyworld-engine.ts`
- `src/app/storyworld/page.tsx`

No existing Origin Studio route or evidence pipeline is overwritten.

## Next production layers

### V0.2 — Asset Provider Adapters

Add provider-neutral interfaces for:

- image generation
- image-to-video / text-to-video
- voice generation
- music and sound effects

Each provider receives the locked prompt/character payload rather than inventing its own story context.

### V0.3 — Character Reference Vault

Store approved reference images for every character and attach provider-specific reference IDs/embeddings where supported.

The vault should keep:

- canonical face references
- full-body references
- wardrobe references
- expression sheet
- voice ID
- visual do-not-change rules

### V0.4 — Continuity Inspector

After asset generation, compare each generated shot with the character lock and flag likely drift in:

- face identity
- hair
- age
- wardrobe
- props
- location continuity
- time of day

Human approval remains required.

### V0.5 — Remotion Storyworld Composition

Convert an approved manifest into a vertical Remotion timeline containing:

- shot media
- dialogue/narration audio
- ambience and SFX
- subtitles
- title lock
- safe-zone handling for Shorts/Reels/TikTok

### V0.6 — Analytics Feedback

Store episode performance:

- viewed vs swiped
- 3-second retention
- 25/50/75% retention
- completion
- rewatches
- shares/1,000 views
- comments/1,000 views
- follows
- next-episode conversion

The system should compare worlds based on audience behaviour and recommend whether to continue, revise or kill a franchise experiment.

## Important architecture decision

Do not let an AI model regenerate the story bible on every run.

The correct hierarchy is:

`World memory → approved character locks → approved episode logic → shot prompts → generative provider`

not:

`prompt → model invents everything again`

This is what makes the system capable of building durable IP rather than one-off AI clips.
