# The Case Content Pipeline

## Purpose

This document defines the first-pass offline workflow for producing playable case content and avatar assets for `The Case`.

The pipeline is intentionally split into two stages:

1. generate structured draft cases locally
2. review and import approved cases into Supabase

This keeps low-quality generations out of the live pool while still letting us batch-produce content quickly.

## Current Tooling

The project now includes two scripts:

- `npm run cases:generate`
- `npm run cases:import`
- `npm run cases:set-status`

Generated files are written to `content/generated/cases/` and local avatar copies are written to `content/generated/assets/`.

## Generation Step

`npm run cases:generate` calls the Groq API and asks the configured model to return a single valid mystery case as strict schema-compliant JSON.

Default model:

- `openai/gpt-oss-120b`

Useful flags:

- `npm run cases:generate -- --count=5`
- `npm run cases:generate -- --model=openai/gpt-oss-120b --count=3`

Each generated file is wrapped with metadata and contains:

- generation timestamp
- source model
- prompt version
- the validated case payload

## Validation Rules

The generator validates each case before saving it.

- suspects must be between `3` and `5`
- evidence items must be between `3` and `5`
- required strings must be present and non-empty
- suspect names must be unique
- evidence names must be unique
- `guilty_suspect_name` must match one of the suspects

Invalid generations fail fast and are not written to disk.

## Import Step

`npm run cases:import` reads generated JSON files, validates them again, creates deterministic DiceBear SVG avatars, uploads those assets to Supabase Storage, and inserts the case plus suspects into Supabase.

Default import behaviour:

- imports all files in `content/generated/cases/`
- uploads SVG assets into the `case-assets` storage bucket
- inserts imported cases as `draft`

Useful flags:

- `npm run cases:import -- --status=draft`
- `npm run cases:import -- --status=ready`
- `npm run cases:import -- --file=content/generated/cases/example.json`

## Storage Behaviour

The import step ensures the `case-assets` bucket exists and uploads:

- victim SVGs under `victims/`
- suspect SVGs under `suspects/`

The final stored public URLs are written into:

- `cases.victim_avatar_url`
- `suspects.avatar_url`

## Recommended Workflow

The intended workflow for now is:

1. generate a batch locally
2. read through the generated JSON files
3. cull weak or repetitive cases
4. import surviving cases as `draft`
5. review drafts in Supabase
6. promote only approved cases to `ready`

## Promotion Step

`npm run cases:set-status` gives us a simple operational path for moving imported content between non-live and live states without editing the database manually.

Useful examples:

- `npm run cases:set-status -- --victim="Lena Marlowe" --status=ready`
- `npm run cases:set-status -- --id=<case-id> --status=ready`
- `npm run cases:set-status -- --victim="Lena Marlowe" --status=culled`

## Next Improvements

This first pass is deliberately practical rather than complete. The next sensible upgrades are:

- stronger tone and safety validation
- duplicate-theme detection across batches
- automatic suspect-name and clue-quality scoring
- a review UI or checklist for moving `draft` to `ready`
- more explicit asset manifests for traceability
