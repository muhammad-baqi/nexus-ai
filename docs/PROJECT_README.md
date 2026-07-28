# Nexus — Documentation

This is the working documentation set for **Nexus**, a personal
information hub for capturing, organizing, searching, and revisiting
knowledge from multiple sources. It's written to be handed directly to
AI coding agents (Claude Code, Cursor, Codex, etc.) or a human
engineering team as the source of truth for what to build.

## How This Repo Is Organized

Documentation is deliberately written at three different levels of
detail, matching how settled each part of the product is:

```
docs/
├── 00_Project/        ⭐ Complete — vision, mission, scope, roadmap,
│                          personas, success metrics
├── 01_MVP/             ⭐ Complete, detailed PRDs — every v1.0 feature
│                          with requirements, flows, error states, and
│                          acceptance criteria
├── 02_Development/     ○ Skeleton — directional notes on planned
│                          post-MVP features, intentionally sparse
└── 03_Architecture/    ⭐ Complete — tech stack, conceptual database
                           schema, API surface, and non-functional
                           requirements
```

**00_Project** answers "why are we building this and what does it need
to accomplish." Read this first.

**01_MVP** answers "exactly what does v1.0 do, feature by feature."
Each file follows the same shape: overview, requirements, detailed
behavior, error states, explicit out-of-scope notes, and acceptance
criteria. This is the folder an AI agent should be implementing directly
against.

**02_Development** is intentionally unfinished. These are real future
directions, not filler — but they're kept as skeletons on purpose so the
MVP stays the focus. Don't over-build against these; they exist to
inform architecture decisions (e.g., making sure the Notifications
channel model can add Telegram later) without pulling scope forward.

**03_Architecture** translates the MVP requirements into a conceptual
technical design: stack choices, data model, API shape, and the
non-functional requirements (performance, security, accessibility,
reliability, testing) that apply across every feature.

## Reading Order

1. `00_Project/Vision.md` → `Mission.md` → `Scope.md`
2. `00_Project/Personas.md` (to ground every feature in a real use case)
3. `03_Architecture/Tech_Stack.md` → `Database_Schema.md` → `API_Design.md`
4. `01_MVP/` — in any order; each file is self-contained but cross-
   references `Knowledge_Items.md` for shared behavior (tagging,
   favoriting, trash, sharing) rather than repeating it
5. `00_Project/Roadmap.md` (the day-by-day build sequence)
6. `02_Development/` (optional — future context only)

## Cross-Referencing

`01_MVP/Knowledge_Items.md` defines the shared Knowledge Item contract
(fields and behaviors common to every content type). The type-specific
documents — `Notes.md`, `Website_Bookmarks.md`, `File_Uploads.md`
(covering PDFs/Images/Files), and `Code_Snippets.md` — build on that
contract and reference it rather than restating it, to avoid the
documents drifting out of sync with each other.

## Full File Index

**00_Project/**
`Vision.md` · `Mission.md` · `Scope.md` · `Roadmap.md` · `Personas.md` ·
`Success_Metrics.md`

**01_MVP/**
`Authentication.md` · `Collections.md` · `Knowledge_Items.md` ·
`Notes.md` · `Website_Bookmarks.md` · `File_Uploads.md` ·
`Code_Snippets.md` · `Search.md` · `Dashboard.md` · `Settings.md` ·
`Notifications.md`

**02_Development/**
`Browser_Extension.md` · `Telegram.md` · `AI.md` ·
`Semantic_Search.md` · `RSS.md` · `GitHub.md`

**03_Architecture/**
`Tech_Stack.md` · `Database_Schema.md` · `API_Design.md` ·
`Non_Functional_Requirements.md`
