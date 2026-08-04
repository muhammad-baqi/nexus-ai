// Day 3 stress-test seed script (build-order-complete.md #15).
//
// Creates a real account (via real signup + real Mailpit confirmation, no service-role
// shortcuts) and seeds it with extra Collections, Tags, and Notes, all inserted through the
// normal anon-key + authenticated-session client — the same client the app itself uses, so
// every insert is subject to real RLS rather than a service-role bypass. Run with:
//
//   docker compose exec app node scripts/seed-stress-test.mjs
//
// NOTE_COUNT is intentionally small (15, not build-order-complete.md's "a few hundred") — scaled
// down for local hardware; still enough to exercise the same list/collection-view render path.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://host.docker.internal:54324";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
}

const NOTE_COUNT = 15;
const COLLECTION_NAMES = ["Reading List", "Work", "Recipes", "Travel"];
const TAG_NAMES = ["idea", "urgent", "reference", "draft", "personal", "research", "todo", "archive-me"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchConfirmationTokenHash(email) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const { messages } = await listRes.json();
    const latest = messages
      .filter((m) => m.To.some((to) => to.Address === email))
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())[0];

    if (latest) {
      const messageRes = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
      const message = await messageRes.json();
      const match = /token_hash=([^&\s"]+)/.exec(message.Text);
      if (match) return decodeURIComponent(match[1]);
    }
    await sleep(500);
  }
  throw new Error(`No confirmation email with a token_hash found for ${email}`);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const stamp = Date.now();
  const email = `stress-test+${stamp}@example.com`;
  const password = "StressTest123!";

  console.log(`[seed] signing up ${email}`);
  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw new Error(`signUp failed: ${signUpError.message}`);

  const tokenHash = await fetchConfirmationTokenHash(email);
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`);

  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user.id;
  console.log(`[seed] confirmed and signed in as ${email} (${ownerId})`);

  // The signup trigger already created a default "Inbox" collection — add a few more so notes
  // have somewhere varied to live.
  const { data: existingCollections, error: existingCollectionsError } = await supabase
    .from("collections")
    .select("id, name");
  if (existingCollectionsError) throw new Error(`reading collections failed: ${existingCollectionsError.message}`);

  const { data: newCollections, error: collectionsError } = await supabase
    .from("collections")
    .insert(COLLECTION_NAMES.map((name) => ({ owner_id: ownerId, name })))
    .select("id, name");
  if (collectionsError) throw new Error(`creating collections failed: ${collectionsError.message}`);

  const collections = [...existingCollections, ...newCollections];
  console.log(`[seed] ${collections.length} collections ready: ${collections.map((c) => c.name).join(", ")}`);

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .insert(TAG_NAMES.map((name) => ({ owner_id: ownerId, name })))
    .select("id, name");
  if (tagsError) throw new Error(`creating tags failed: ${tagsError.message}`);
  console.log(`[seed] ${tags.length} tags ready: ${tags.map((t) => t.name).join(", ")}`);

  const notesToInsert = Array.from({ length: NOTE_COUNT }, (_, i) => {
    const collection = collections[i % collections.length];
    return {
      owner_id: ownerId,
      collection_id: collection.id,
      type: "note",
      title: `Stress test note ${i + 1}`,
      description: `This is the body of stress test note ${i + 1}, seeded for the Day 3 stress test.`,
      is_favorite: i % 4 === 0,
      is_archived: i % 7 === 0,
    };
  });

  const { data: notes, error: notesError } = await supabase
    .from("knowledge_items")
    .insert(notesToInsert)
    .select("id");
  if (notesError) throw new Error(`creating notes failed: ${notesError.message}`);
  console.log(`[seed] ${notes.length} notes created`);

  // Attach 0-3 random tags per note.
  const itemTagRows = [];
  for (const note of notes) {
    const tagCount = Math.floor(Math.random() * 4);
    const shuffled = [...tags].sort(() => Math.random() - 0.5);
    for (const tag of shuffled.slice(0, tagCount)) {
      itemTagRows.push({ knowledge_item_id: note.id, tag_id: tag.id });
    }
  }
  if (itemTagRows.length > 0) {
    const { error: itemTagsError } = await supabase.from("knowledge_item_tags").insert(itemTagRows);
    if (itemTagsError) throw new Error(`attaching tags failed: ${itemTagsError.message}`);
  }
  console.log(`[seed] ${itemTagRows.length} tag attachments created`);

  console.log("\n[seed] done. Log in with:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}

main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
});
