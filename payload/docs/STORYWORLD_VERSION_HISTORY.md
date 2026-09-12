# Storyworld Engine — cumulative release history

This complete release includes every feature from the earlier development passes.

## V0.1 — Story architecture
- Three worlds: The Kamau Will, 2:17, Sanctuary 7.
- World bibles, character locks, pilot episode manifests and shot prompts.
- Structural quality scoring and continuity checks.
- `/storyworld` production UI.

## V0.2 — Generation and render planning
- Generation job graph for character references, stills, motion, voice, SFX, music and captions.
- `/storyworld/generate` generation dashboard.
- Remotion Storyworld composition and render script.
- Prepare command that exports production JSON and prompt packs.

## V0.3 — Canonical character vault
- Locked Kamau character masters with SHA-256 fingerprints.
- Eight Episode 1 seed-shot references.
- Vault verification command.
- Generation queue automatically unblocks shots whose character identities are approved.

## V1.0 Complete — single-install cumulative package
- Contains V0.1, V0.2 and V0.3 in one release.
- Idempotent installer: safe to run again to repair/update Storyworld-owned files.
- Pre-install backup of existing Storyworld files and `package.json`.
- Install manifest and doctor command.
- Example production plans for all three pilot worlds plus the Kamau V0.3 plan.
- No previous Storyworld installer is required.
