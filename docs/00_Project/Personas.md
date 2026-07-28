# Personas

These personas guide feature prioritization and UX decisions. Each
represents a distinct pattern of how someone would actually use Nexus.

---

## 1. Priya — The Researcher

**Context:** Graduate student writing a thesis, pulling from academic
PDFs, websites, and her own notes.

**Needs**
- Save PDFs and have their text be searchable, not just the filename
- Organize by project/chapter using collections and tags together
- Come back to a source months later and find it by a fragment she
  remembers, not the exact title

**Frustration with current tools:** Bookmarks live in the browser, PDFs
live in a folder, and notes live in a separate app — cross-referencing
them means manually maintaining links between three systems.

**What Nexus must do for her:** unify PDFs, bookmarks, and notes in one
searchable collection, and make full-text PDF search actually work.

---

## 2. Daniel — The Developer

**Context:** Software engineer collecting code snippets, documentation
links, and technical articles across several side projects.

**Needs**
- Fast capture of a snippet with correct syntax highlighting
- Tags that map to technologies/projects ("react", "postgres",
  "project-x")
- Quick retrieval while actively coding — doesn't want to dig

**Frustration with current tools:** Snippet managers don't handle links
and PDFs; bookmark managers don't handle code. He currently uses three
tools and forgets which thing is where.

**What Nexus must do for him:** treat code snippets as a first-class
item type with the same search and tagging as everything else.

---

## 3. Maria — The Lifelong Learner

**Context:** Professional who reads widely outside of work — articles,
recipes, travel plans, book notes — and wants one tidy place for all of
it, without much technical overhead.

**Needs**
- Simple collections she can browse visually (color, icons)
- Favorite the things she reveres, archive the ones she's done with
- A dashboard that reminds her what she recently saved

**Frustration with current tools:** Too many single-purpose apps
(recipe app, travel app, reading list app) for what feels like one
personal habit: "save interesting things."

**What Nexus must do for her:** make organization visual and low-effort,
and surface recent/favorite items without her having to search for them.

---

## 4. Tomás — The Professional

**Context:** Uses Nexus to track competitive research, meeting
follow-ups, and reference material for his job.

**Needs**
- Reminders tied to saved items ("follow up on this in a week")
- Share a specific item with a colleague via a public link
- Trust that deleted-by-accident items can be restored

**Frustration with current tools:** No good way to attach a "remind me"
to a bookmark; sharing usually means forwarding a raw link over email
with no context.

**What Nexus must do for him:** reminders and a trash/restore safety net
are not nice-to-haves, they're why he'd choose this tool at all.

---

## How These Personas Map to MVP Features

| Persona | Primary MVP features they depend on |
|---|---|
| Priya (Researcher) | PDFs, full-text search, tags, collections |
| Daniel (Developer) | Code snippets, tags, fast search |
| Maria (Learner) | Collections with color/icon, favorites, dashboard |
| Tomás (Professional) | Reminders, sharing, trash/restore |

No persona depends on anything in "Out of Scope — MVP." This is a
deliberate check: if a proposed feature doesn't clearly serve one of
these four people, its priority should be questioned.
