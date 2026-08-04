// Day 4 performance validation (build-order-complete.md #19): seeds a real account with 5,000
// items so Global Search's <500ms server-side target (Success_Metrics.md, Search.md) can be
// measured against a realistic dataset size. Only "note" exists as a type until Day 5 (websites/
// PDFs/images/files/code snippets), so "mixed types" here means varied titles/bodies/tags/
// collections/favorite/archived flags, not multiple `type` values — there's nothing else to mix
// in yet. Batched inserts (500/batch) keep this fast on local hardware, unlike Day 3's stress
// test which additionally had to drive a live browser render of every seeded item — this script
// only seeds; nothing here opens a browser. Run with:
//
//   docker compose exec app node scripts/seed-search-stress-test.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://host.docker.internal:54324";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
}

const ITEM_COUNT = 5000;
const BATCH_SIZE = 500;
const COLLECTION_NAMES = ["Reading List", "Work", "Recipes", "Travel"];
const TAG_NAMES = ["idea", "urgent", "reference", "draft", "personal", "research", "todo", "archive-me"];
const WORDS = [
  "project", "plan", "meeting", "notes", "recipe", "travel", "budget", "review", "design",
  "roadmap", "summary", "draft", "idea", "research", "checklist", "update", "proposal", "sprint",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomTitle(i) {
  const w1 = WORDS[i % WORDS.length];
  const w2 = WORDS[(i * 7 + 3) % WORDS.length];
  return `${w1[0].toUpperCase()}${w1.slice(1)} ${w2} #${i}`;
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
  const email = `search-stress-test+${stamp}@example.com`;
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
  console.log(`[seed] ${collections.length} collections ready`);

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .insert(TAG_NAMES.map((name) => ({ owner_id: ownerId, name })))
    .select("id, name");
  if (tagsError) throw new Error(`creating tags failed: ${tagsError.message}`);
  console.log(`[seed] ${tags.length} tags ready`);

  console.log(`[seed] inserting ${ITEM_COUNT} notes in batches of ${BATCH_SIZE}...`);
  const allItemIds = [];
  for (let batchStart = 0; batchStart < ITEM_COUNT; batchStart += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, ITEM_COUNT - batchStart) }, (_, j) => {
      const i = batchStart + j;
      const collection = collections[i % collections.length];
      return {
        owner_id: ownerId,
        collection_id: collection.id,
        type: "note",
        title: randomTitle(i),
        description: `Body content for stress test item ${i}: ${WORDS[(i * 3) % WORDS.length]} ${WORDS[(i * 5 + 1) % WORDS.length]}.`,
        is_favorite: i % 11 === 0,
        is_archived: i % 13 === 0,
      };
    });
    const { data: inserted, error: insertError } = await supabase
      .from("knowledge_items")
      .insert(batch)
      .select("id");
    if (insertError) throw new Error(`batch insert failed at ${batchStart}: ${insertError.message}`);
    allItemIds.push(...inserted.map((row) => row.id));
    process.stdout.write(`\r[seed] inserted ${allItemIds.length}/${ITEM_COUNT}`);
  }
  console.log("");

  console.log("[seed] attaching 0-3 random tags per item...");
  for (let batchStart = 0; batchStart < allItemIds.length; batchStart += BATCH_SIZE) {
    const idBatch = allItemIds.slice(batchStart, batchStart + BATCH_SIZE);
    const itemTagRows = [];
    for (const itemId of idBatch) {
      const tagCount = Math.floor(Math.random() * 4);
      const shuffled = [...tags].sort(() => Math.random() - 0.5);
      for (const tag of shuffled.slice(0, tagCount)) {
        itemTagRows.push({ knowledge_item_id: itemId, tag_id: tag.id });
      }
    }
    if (itemTagRows.length > 0) {
      const { error: itemTagsError } = await supabase.from("knowledge_item_tags").insert(itemTagRows);
      if (itemTagsError) throw new Error(`attaching tags failed at ${batchStart}: ${itemTagsError.message}`);
    }
  }
  console.log("[seed] tag attachments done");

  console.log("\n[seed] done. Log in with:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`\nOWNER_ID=${ownerId}`);
}

main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
});
