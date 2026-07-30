import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Nexus",
};

// Layout-only shell for now, per build-order-complete.md step 10 — the six sections from
// docs/01_MVP/Dashboard.md all need real data (recent/favorited items, search) that doesn't
// exist until Notes (Day 3) and Search (Day 4) ship. Each just gets its friendly empty state.
const SECTIONS = [
  {
    title: "Recent Items",
    body: "Nothing here yet — items you create or edit will show up in this list.",
  },
  {
    title: "Recently Viewed",
    body: "Items you've opened recently will appear here.",
  },
  {
    title: "Favorites",
    body: "Favorite a Collection or Knowledge Item and it'll show up here.",
  },
  {
    title: "Recent Collections",
    body: "Your most recently active Collections will appear here.",
  },
  {
    title: "Statistics",
    body: "0 items · 0 Collections",
  },
  {
    title: "Upcoming Reminders",
    body: "No upcoming reminders.",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-1 rounded-lg border border-border p-4">
            <h2 className="font-semibold">{section.title}</h2>
            <p className="text-muted-foreground text-sm">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
