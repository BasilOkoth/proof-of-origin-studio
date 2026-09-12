# Storyworld Production Executor V0.4

V0.4 turns the V0.3 generation manifest into executable production actions.

## What is live

- Generate a shot still with the locked character references and optional seed frame.
- Review and approve/regenerate each still.
- Approval unlocks the matching motion job.
- Start image-to-video animation through Runway and check/download completed tasks.
- Generate permanent-character voice lines through ElevenLabs once voice IDs are mapped.
- Generate shot-level SFX and the episode music master through ElevenLabs.
- Materialize captions.
- Store runtime job state (`generating`, `generated`, `approved`, `failed`).
- Sync generated assets from a persistent asset directory into `public/` before Remotion rendering.
- Remotion now mixes voice, shot SFX, score and captions; video falls back to approved still, seed, then storyboard.

## Render environment variables

Required for still generation:

```text
OPENAI_API_KEY=...
```

Recommended optional settings:

```text
STORYWORLD_IMAGE_MODEL=gpt-image-2.5-sunburst
STORYWORLD_IMAGE_QUALITY=medium
```

Required for SFX, music and character voice:

```text
ELEVENLABS_API_KEY=...
```

Map application-level voice keys to permanent ElevenLabs voice IDs:

```text
STORYWORLD_VOICE_MAP={"kamau-amara-v1":"VOICE_ID","kamau-victor-v1":"VOICE_ID","kamau-evelyn-v1":"VOICE_ID","kamau-muriuki-v1":"VOICE_ID","kamau-elias-v1":"VOICE_ID"}
```

Required only for motion generation:

```text
RUNWAYML_API_SECRET=...
STORYWORLD_VIDEO_MODEL=gen4.5
STORYWORLD_VIDEO_RATIO=720:1280
```

## Persistence on Render

Generated media written to a normal Render service filesystem can disappear on restart/redeploy. Attach a persistent disk and set:

```text
STORYWORLD_ASSET_DIR=/var/data/storyworld
```

Use the mount path you configure in Render. The V0.4 runtime serves generated assets through `/api/storyworld/asset`, so they can live outside Next.js `public/`. The render script syncs them into `public/storyworld/...` immediately before bundling Remotion.

## Recommended first production test

1. Open `/storyworld/generate?world=kamau-will`.
2. Use `medium` still quality.
3. Click **Generate opening 5**.
4. Review K01–K05 and regenerate weak shots.
5. Approve each still only after character identity and wardrobe are correct.
6. Add `RUNWAYML_API_SECRET` and animate approved shots.
7. Map the five ElevenLabs voice IDs, then generate voices.
8. Generate SFX and music.
9. Render with the existing `render:storyworld` command.

Do not generate the entire season before this opening-sequence test passes editorial review.
