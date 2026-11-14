import assert from "node:assert/strict";
import { test } from "node:test";
import type { Post } from "../src/lib/posts";

// Node 24 runs the source directly; Next.js keeps its usual extensionless imports.
const source = "../src/lib/posts.ts";
const { characterCount, validatePost, mergePosts, createDemoPosts, isPost } =
  await import(source) as typeof import("../src/lib/posts");

function post(id: string, created_at: string, body = id): Post {
  return { id, user_id: null, body, created_at };
}

test("accepts exactly 280 Unicode code points and rejects the 281st", () => {
  assert.equal(characterCount("hello😀"), 6);
  assert.equal(characterCount("😀".repeat(280)), 280);
  assert.equal(validatePost("😀".repeat(280)), null);
  assert.match(validatePost("😀".repeat(281)) ?? "", /280/);
  assert.equal(validatePost("x".repeat(280)), null);
  assert.match(validatePost("x".repeat(281)) ?? "", /280/);
});

test("rejects empty and whitespace-only messages, including Unicode whitespace", () => {
  for (const value of ["", " ", "\t\n\r", "\u00a0\u2003"]) {
    assert.ok(validatePost(value), `Expected ${JSON.stringify(value)} to be rejected`);
  }
  assert.equal(validatePost(" Hello, wall! \n"), null);
});

test("merges an initial snapshot with live inserts without duplicate rows", () => {
  const older = post("older", "2026-11-01T10:00:00Z");
  const newer = post("newer", "2026-11-01T11:00:00Z");
  const merged = mergePosts([older, newer], [newer]);
  assert.deepEqual(merged.map((entry) => entry.id), ["newer", "older"]);
  assert.equal(merged.length, 2);
});

test("retains an insert received while an older feed snapshot is loading", () => {
  const oldest = post("oldest", "2026-11-01T09:00:00Z");
  const duringFetch = post("during-fetch", "2026-11-01T12:00:00Z");
  const merged = mergePosts([duringFetch], [oldest]);
  assert.deepEqual(merged.map((entry) => entry.id), ["during-fetch", "oldest"]);
});

test("sorts by actual timestamps, including offsets, without mutating its input", () => {
  const input = [
    post("older", "2026-11-01T16:00:00+08:00"),
    post("newer", "2026-11-01T09:00:00Z"),
  ];
  assert.deepEqual(mergePosts(input).map((entry) => entry.id), ["newer", "older"]);
  assert.deepEqual(input.map((entry) => entry.id), ["older", "newer"]);
});

test("uses a deterministic ID tiebreaker for posts with identical timestamps", () => {
  const time = "2026-11-01T10:00:00Z";
  assert.deepEqual(mergePosts([post("a", time), post("b", time)]).map((entry) => entry.id), ["b", "a"]);
});

test("creates five valid, unique, newest-first demo posts within the message limit", () => {
  const demo = createDemoPosts(Date.parse("2026-11-01T12:00:00Z"));
  assert.equal(demo.length, 5);
  assert.deepEqual(demo.map((entry) => entry.id), ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"]);
  assert.equal(new Set(demo.map((entry) => entry.id)).size, 5);
  for (const entry of demo) {
    assert.ok(isPost(entry));
    assert.equal(validatePost(entry.body), null);
  }
  assert.deepEqual(mergePosts(demo), demo);
});
