# GitHub Repository Items (Future)

## Status
Skeleton — not scoped for detailed implementation. Directional only.

## Idea

A new Knowledge Item type for saving a reference to a GitHub repository
(or specific file/gist within one), useful for the Developer persona
(Daniel) alongside Code Snippets.

## Anticipated Shape

- User pastes a GitHub URL (repo, file, or gist).
- System fetches metadata via the GitHub API: repo name, description,
  primary language, star count, last-updated date.
- Optionally, fetch and display a specific file's content (with syntax
  highlighting, reusing the Code Snippet rendering approach) rather than
  just a link card.

## Open Questions

- Whether this requires GitHub OAuth (to access private repos the user
  has permission to) or is limited to public repos only, which would be
  far simpler for a first version.
- Rate limiting against the GitHub API for metadata refresh.

## Dependencies

Reuses the metadata-fetch background-job pattern from Website Bookmarks,
and the syntax-highlighting component already required for Code
Snippets in the MVP.
