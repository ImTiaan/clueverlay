[OPEN] Debug Session: supabase-import-mismatch

## Symptom

- GitHub Actions `cases:top-up-ready` reports many approved/imported cases with real `caseId` values.
- The Supabase project currently queried from local env still shows `0` rows in `cases`.
- No runtime error is shown in the workflow output.

## Current Evidence

- Local direct query via service-role client returns `total: 0` rows in `cases`.
- Workflow JSON reports successful imports but inconsistent summary counts like `readyAfter: 1` after `approved: 25`.
- Direct lookup of a workflow-reported `caseId` in local project returned `null`.
- Local controlled import of one generated case succeeded and the inserted row became immediately visible in local queries.

## Hypotheses

1. GitHub Actions is still talking to a different Supabase backend than local, despite matching URL text.
2. The GitHub `SUPABASE_SERVICE_ROLE_KEY` points to a different effective Supabase context than local, even if the URL text matches.
3. The post-import counting path is querying a different state than the import path, creating misleading success output inside the workflow.
4. Storage/avatar side effects succeed, but the actual `cases`/`suspects` inserts are being skipped or rolled back in a way the current code does not surface.
5. One or more GitHub secret scopes or environments are not the same values the user expects from local.

## Next Step

- Add minimal workflow instrumentation to print safe Supabase project refs and authoritative `cases` counts/sample rows after the same GitHub run.
