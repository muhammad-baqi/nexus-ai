---
paths:
  - "app/api/**/*.ts"
  - "src/app/api/**/*.ts"
---

# API route conventions

- Every route handler validates its input with zod before touching Supabase.
- Auth: pull the session via the Supabase server client; never trust a client-supplied
  user id.
- Return shape: mutating endpoints return the updated resource, not just `{ok: true}`.
- List endpoints: support `page`/`cursor` + `limit`, and accept the same filter/sort
  params documented in `docs/03_Architecture/API_Design.md` — don't invent new
  param names for the same concept.
- Background work (metadata fetch, exports, PDF extraction) goes through a scheduled
  function or webhook, never inline in a request/response cycle if it could run long.
