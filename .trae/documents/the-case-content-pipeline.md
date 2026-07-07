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
- `npm run cases:build-pool`
- `npm run cases:top-up-ready`
- `npm run cases:import`
- `npm run cases:set-status`

Generated files are written to `content/generated/cases/` and local avatar copies are written to `content/generated/assets/`.

## Generation Step

`npm run cases:generate` calls the Groq API and asks the configured model to return a single valid mystery case as strict schema-compliant JSON.

Default model:

- `openai/gpt-oss-20b`

Recommended fallback chain for strict structured outputs:

- `openai/gpt-oss-120b`

Useful flags:

- `npm run cases:generate -- --count=5`
- `npm run cases:generate -- --model=openai/gpt-oss-20b --count=25`
- `npm run cases:generate -- --count=100 --max-failures=20`

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
- `guilty_suspect_name` must exactly match one of the suspects

Invalid generations are retried automatically before the batch runner gives up on that slot. Failed attempts are reported in the final JSON summary instead of always aborting the entire batch immediately.

## Automated Pool Build

`npm run cases:build-pool` is the hardened path for scaling the case library. It generates cases, checks them against the existing Supabase corpus plus already approved cases in the current run, rejects duplicates or bland results, saves rejected drafts locally for audit, and imports approved cases straight into Supabase.

Useful flags:

- `npm run cases:build-pool -- --count=10`
- `npm run cases:build-pool -- --count=25 --min-score=72 --status=draft`
- `npm run cases:build-pool -- --count=10 --max-attempts=40 --dry-run`
- `npm run cases:build-pool -- --count=25 --fallback-models=model-a,model-b`

The automated review currently checks:

- exact and near-duplicate victim, suspect, and evidence overlap
- narrative and clue detail depth
- language variety as a rough proxy for case freshness
- a minimum interestingness score before import

## Ready Pool Autopilot

`npm run cases:top-up-ready` is the operational “one command” path. It checks the current number of `ready` cases in Supabase and only generates as many additional approved cases as needed to reach a target ready-pool size.

Useful flags:

- `npm run cases:top-up-ready -- --target-ready=25`
- `npm run cases:top-up-ready -- --target-ready=40 --min-score=74`
- `npm run cases:top-up-ready -- --target-ready=25 --dry-run`
- `npm run cases:top-up-ready -- --target-ready=25 --fallback-models=model-a,model-b`

Default behaviour:

- counts existing `ready` cases in Supabase
- computes the shortfall against the target
- generates only the missing number of cases
- applies duplicate and quality checks
- imports approved cases directly as `ready`
- pauses cleanly if all configured Groq models hit their daily token cap
- resumes naturally on the next scheduled run because the script recalculates the live shortfall each time

This is the recommended command when you do not want a manual review step.

## Import Step

`npm run cases:import` reads generated JSON files, validates them again, reviews them against the current Supabase corpus, creates deterministic DiceBear SVG avatars, uploads those assets to Supabase Storage, and inserts only approved cases plus suspects into Supabase.

Default import behaviour:

- imports all files in `content/generated/cases/`
- uploads SVG assets into the `case-assets` storage bucket
- inserts imported cases as `draft`

Useful flags:

- `npm run cases:import -- --status=draft`
- `npm run cases:import -- --status=ready`
- `npm run cases:import -- --file=content/generated/cases/example.json`
- `npm run cases:import -- --status=draft --min-score=72`

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

For larger pool-building sessions, a practical rhythm is:

1. run `npm run cases:build-pool -- --count=25 --min-score=72 --status=draft`
2. spot-check the approved and rejected outputs
3. promote the strongest imported drafts to `ready`
4. keep a reserve pool in `draft` so the live pool never runs dry

For the no-review / auto-ready workflow:

1. run `npm run cases:top-up-ready -- --target-ready=25 --min-score=72`
2. let the script top the pool up automatically
3. only inspect rejections or strange outputs if the approval rate drops

## Scheduled Automation

The repository now includes a GitHub Actions workflow at `.github/workflows/case-pool-top-up.yml`.

It supports:

- manual trigger with `workflow_dispatch`
- scheduled runs every 6 hours

Once the required repository secrets are configured, this gives you the “ideally none” path where the ready pool replenishes itself without you running the script locally.

## Groq Rate-Limit Notes

The published Groq rate-limit table is useful, but it must be read alongside Groq's Structured Outputs support matrix because this pipeline relies on strict `json_schema`.

- `openai/gpt-oss-120b`: `30 RPM`, `1K RPD`, `8K TPM`, `200K TPD`
- `meta-llama/llama-4-scout-17b-16e-instruct`: `30 RPM`, `1K RPD`, `30K TPM`, `500K TPD`
- `qwen/qwen3-32b`: `60 RPM`, `1K RPD`, `6K TPM`, `500K TPD`

For this project, the practical implication is:

1. use `openai/gpt-oss-20b` as the default because it supports strict `json_schema`
2. keep `openai/gpt-oss-120b` as the strict-compatible fallback
3. do not configure `qwen/qwen3-32b` or `meta-llama/llama-4-scout-17b-16e-instruct` for this pipeline unless the code is changed to use best-effort structured outputs instead of strict mode

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
