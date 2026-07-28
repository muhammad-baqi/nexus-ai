# Vision

## What Nexus Is

Nexus is a personal information hub. It gives one person a single place to
capture anything they find worth keeping — a note, a website, a PDF, an
image, a code snippet — and to find it again later without remembering
which app it lives in.

Most people today scatter their knowledge across five or six tools: a notes
app, browser bookmarks, a "read it later" service, a folder of downloaded
PDFs, screenshots in a camera roll, and links pasted into chat apps to
themselves. None of these tools talk to each other. Search only works
inside a single tool, if at all. Nexus exists to replace that scatter with
one searchable, taggable, organized system.

## Why It Matters

The value of information collapses when it can't be found again. A
bookmark saved and never revisited is functionally the same as a bookmark
never saved. The core promise of Nexus is retrieval: whatever you put in,
you can get back out, quickly, by title, tag, content, or context.

## What Nexus Is Not

Nexus is not a replacement for a full document editor, a project
management tool, or a team wiki. It does not aim to be a place where
content is authored from scratch at length — it is a place where content
is *captured*, organized, and *found*. Note-taking is supported because
notes are a natural knowledge type, not because Nexus wants to compete
with dedicated writing tools.

Nexus is also not, at least in its first release, a collaboration
platform. It is built for a single user managing their own knowledge. Team
and shared-workspace features are an explicit future direction, not part
of the MVP.

## Design Principles

**One model, many types.** Every piece of saved information — a note, a
bookmark, a PDF — is a Knowledge Item. This means search, tagging,
favoriting, archiving, and trash all work identically regardless of what
kind of thing was saved. New content types can be added later without
redesigning the system, because they only need to plug into the existing
Knowledge Item model.

**Retrieval over authoring.** Every feature decision should be evaluated
against the question: does this help the user find something again? Rich
authoring features (like a full Markdown editor) are included because
users need to *create* notes, but the system's center of gravity is
search and organization, not composition.

**Fast and unobtrusive.** Saving something should take seconds. Searching
should return results instantly. The tool should get out of the user's way.

**Grow without rewriting.** The architecture should let new Knowledge Item
types, new integrations, and new notification channels be added
incrementally, without a foundational rewrite each time.

## Long-Term Direction

Beyond the MVP, Nexus is expected to grow toward:

- Passive capture (a browser extension that saves the current page in one
  click)
- Smarter organization (AI-suggested tags, duplicate detection, automatic
  summaries)
- Broader content types (RSS articles, GitHub repositories, social media
  embeds)
- Shared use (small teams and shared collections)

These are deliberately out of scope for the first release so that the
foundation — the Knowledge Item model, search, and core organization —
can be built solidly first.
