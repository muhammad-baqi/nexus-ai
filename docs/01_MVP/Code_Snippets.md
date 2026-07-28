# Code Snippets

## Overview

Code Snippets are a Knowledge Item type for storing reusable pieces of
code with correct syntax highlighting and language tagging — serving
primarily the Developer persona (Daniel), who needs fast capture and
retrieval of code fragments alongside his other saved material, without
switching to a separate snippet-manager tool.

## Requirements

Users shall be able to:

- Create a Code Snippet with: code content, language, title,
  description, and tags
- View the snippet with correct syntax highlighting for its language
- Edit the code content, language, title, description, and tags
- Copy the snippet content to clipboard in one action
- Tag, favorite, archive, move, trash, and share a snippet (shared
  behavior, see `Knowledge_Items.md`)

## Fields

| Field | Required | Notes |
|---|---|---|
| Code content | Yes | Plain text, stored verbatim (whitespace-preserving) |
| Language | Yes | Selected from a standard supported-language list |
| Title | Yes | User-provided (not auto-derived, unlike bookmarks) |
| Description | No | Free text explaining what the snippet does/when to use it |
| Tags | No | Same tagging mechanism as all Knowledge Items |

## Editor

- A code-focused editing surface (not the rich-text Note editor) with:
  monospace font, line numbers, and syntax highlighting matching the
  selected language.
- Language selection can be manual (user picks from a dropdown) or
  auto-suggested based on content, with manual selection always
  available as an override — auto-detection is a convenience, not a
  requirement to get right on the first try.
- No autosave-while-typing-continuously requirement as strict as Notes'
  (snippets are typically shorter and pasted in, not composed over a
  long session), but changes should still save promptly (either on
  blur/explicit save, or the same debounced autosave pattern as Notes —
  implementation's choice, product requirement is: don't lose the
  user's edit on accidental navigation away).

## Copy to Clipboard

A single-click "copy" action on the snippet's detail view (and ideally
from list/grid views too) copies the raw code content, without any
added formatting, line numbers, or wrapping.

## Search Integration

The full code content, title, description, tags, and language are
indexed for Global Search (per `Search.md`), so a user can find a
snippet by searching for a distinctive function or variable name inside
it, not just its title.

## Error States

- Unsupported/unrecognized language selection: falls back to plain-text
  rendering (no highlighting) rather than failing to save or display.
- Very large snippet content: no hard product-level limit specified for
  MVP, but the editor should remain responsive; if a technical limit is
  needed it should be generous (e.g., large enough for a full source
  file, not just a few lines) and enforced consistently client/server
  side, same pattern as file size limits in `File_Uploads.md`.

## Out of Scope for MVP

- Multi-file snippets (a "snippet" is a single block of code, not a
  saved directory/project)
- Executing/running snippet code within Nexus
- Snippet-specific version history beyond what's already covered by the
  shared metadata-edit history in `Knowledge_Items.md`

## Acceptance Criteria

- [ ] A user can create, edit, and view a Code Snippet with correct
      syntax highlighting for its selected language.
- [ ] Copy-to-clipboard reproduces the exact stored content.
- [ ] Snippet code content is searchable via Global Search.
- [ ] Covered by unit tests (language-detection fallback logic),
      integration tests (CRUD API), and an end-to-end test: create
      snippet → search for a unique string inside its code → find it.
