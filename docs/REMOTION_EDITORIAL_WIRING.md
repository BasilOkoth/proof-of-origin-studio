# Remotion Editorial Wiring

This is the final execution layer for the Editorial Director.

Previously, `OriginEpisode.tsx` rendered one entire scene at a time.

It now renders the `EditorialBeat[]` produced by `buildEditorialDirection()`.

## What changes in the MP4

A long scene can now become several editorial beats.

Each beat can have a different visual treatment:

- documentary B-roll
- archival context
- source/document focus
- map
- chart
- diagram
- quiet beat
- editorial headline

The renderer also follows caption direction:

- `normal` → captions shown normally
- `reduced` → captions remain visible but visually de-emphasised
- `off` → captions disappear for the beat

This allows reflective lines and major reveals to breathe.

## Media behavior

When a scene has an attached `EvidenceAsset`, B-roll/archive beats can render the image or video directly.

When no media asset exists, the renderer uses an intentional editorial fallback rather than pretending stock footage exists.

This is important: the production plan can request B-roll, but actual documentary footage still needs to be sourced and attached by the media pipeline.

## Remaining media-provider step

For fully automatic B-roll, connect the media scout to licensed/open providers and attach selected candidates to the project.

Good candidates include:

- Wikimedia Commons
- Pexels
- Pixabay
- Unsplash for still images
- institutional open media libraries
- user-uploaded field footage
- public-domain archives

The renderer is now ready to consume those assets.

## Final architecture

`SOURCE`
→ `EVIDENCE`
→ `STORY`
→ `VISUAL INTELLIGENCE`
→ `MEDIA / MAPS / DATA`
→ `AUDIO DIRECTION`
→ `EDITORIAL DIRECTOR`
→ `EDITORIAL BEATS`
→ `REMOTION`
→ `MP4`
