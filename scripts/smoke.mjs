import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const baseUrl = process.env.WALL_TEST_URL || "http://localhost:3000";
const artifactDir = new URL("../artifacts/", import.meta.url);
const mocked = process.argv.includes("--mock");
await mkdir(artifactDir, { recursive: true });
const report = { baseUrl, transport: mocked ? "mocked HTTP; real Supabase is NOT verified" : "real Supabase", startedAt: new Date().toISOString(), mode: null, checks: [], insertedPosts: [], errors: [], networkErrors: [] };
let browser;
const mockPosts = [
  "Remember when writing on someone's wall was the whole point? Let's bring a little of that back. 👋",
  "Currently: making a playlist, ignoring my to-do list, and feeling very 2008. Anyone have a song recommendation? 🎧",
  "A tiny corner of the internet with no algorithms. Just us, and whatever's on our minds. I like it here.",
].map((body, index) => ({ id: randomUUID(), user_id: null, body, created_at: new Date(Date.now() - (index * 19 + 4) * 60_000).toISOString() }));

async function installMock(context) {
  if (!mocked) return;
  await context.route("**/rest/v1/posts*", async route => {
    const request = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const post = { id: randomUUID(), user_id: null, body: input.body, created_at: new Date().toISOString() };
      mockPosts.unshift(post);
      return route.fulfill({ status: 201, contentType: "application/json", headers, body: JSON.stringify(request.headers().accept?.includes("vnd.pgrst.object") ? post : [post]) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(mockPosts) });
  });
  // Close the blocked external socket. Mock mode deliberately skips realtime verification.
  await context.routeWebSocket("**/realtime/v1/websocket*", socket => socket.close());
}

async function check(name, action) {
  try {
    await action();
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch { /* The owner starts the server independently. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
}

function watch(page) {
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("requestfailed", request => {
    if (request.url().includes("supabase.co")) report.networkErrors.push({ url: new URL(request.url()).origin, failure: request.failure()?.errorText });
  });
  page.on("response", async response => {
    if (response.request().method() !== "POST" || !response.url().includes("/rest/v1/posts") || !response.ok()) return;
    try {
      const records = await response.json();
      for (const post of Array.isArray(records) ? records : [records]) {
        if (post?.id && !report.insertedPosts.some(item => item.id === post.id)) {
          report.insertedPosts.push({ id: post.id, body: post.body, created_at: post.created_at });
        }
      }
    } catch { /* Empty response bodies are allowed by PostgREST. */ }
  });
}

async function waitForFeed(page) {
  await page.locator('section[aria-label="Wall posts"][aria-busy="false"]').waitFor({ timeout: 30_000 });
  const alert = page.locator(".error-banner[role='alert']");
  if (await alert.count()) throw new Error(`Wall feed returned an error: ${await alert.innerText()}`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await installMock(context);
  const page = await context.newPage();
  watch(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForFeed(page);
  report.mode = await page.locator(".live-status").innerText();
  assert.ok(!report.mode.includes("Preview"), "This integration run requires genuine Supabase configuration; preview mode is not sufficient.");
  if (!mocked) await page.waitForFunction(() => document.querySelector(".live-status")?.textContent.includes("Live updates on"), { timeout: 30_000 });
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete), null, { timeout: 15_000 }).catch(() => {});
  await check("All local avatar images load successfully", async () => {
    const images = await page.locator(".avatar img").evaluateAll(elements => elements.map(image => ({ src: image.getAttribute("src"), loaded: image.complete && image.naturalWidth > 0 })));
    assert.ok(images.length > 0, "Avatar images are present");
    assert.ok(images.every(image => image.src.startsWith("/")), "Avatar sources are local assets");
    assert.ok(images.every(image => image.loaded), JSON.stringify(images.filter(image => !image.loaded)));
  });
  await page.screenshot({ path: fileURLToPath(new URL(`wall-desktop${mocked ? "-mocked" : ""}.png`, artifactDir)), fullPage: true, animations: "disabled" });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await installMock(mobileContext);
  const mobile = await mobileContext.newPage();
  watch(mobile);
  await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForFeed(mobile);
  await mobile.waitForFunction(() => Array.from(document.images).every(image => image.complete), null, { timeout: 15_000 }).catch(() => {});
  await check("Mobile layout has no horizontal overflow", async () => {
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Document is wider than the viewport");
  });
  await mobile.screenshot({ path: fileURLToPath(new URL(`wall-mobile${mocked ? "-mocked" : ""}.png`, artifactDir)), fullPage: true, animations: "disabled" });
  await mobileContext.close();

  if (mocked) await check("Initial load failure shows an honest error and reload recovers", async () => {
    const failureContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installMock(failureContext);
    const failurePage = await failureContext.newPage();
    watch(failurePage);
    let rejectReads = true;
    await failurePage.route("**/rest/v1/posts*", route => rejectReads && route.request().method() === "GET"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary read failure" }) })
      : route.fallback());
    await failurePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await failurePage.getByRole("heading", { name: "The wall is out of reach" }).waitFor();
    assert.equal(await failurePage.locator(".post-card").count(), 0);
    rejectReads = false;
    await failurePage.getByRole("button", { name: "Reload the wall", exact: true }).click();
    await waitForFeed(failurePage);
    assert.ok(await failurePage.locator(".post-card").count() > 0);
    await failureContext.close();
  });

  await check("Short landscape dialogs fit, scroll, and keep Close reachable", async () => {
    const landscapeContext = await browser.newContext({ viewport: { width: 667, height: 320 }, isMobile: true, hasTouch: true });
    await installMock(landscapeContext);
    const landscape = await landscapeContext.newPage();
    watch(landscape);
    await landscape.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await waitForFeed(landscape);
    await landscape.locator(".side-nav button").filter({ hasText: "Friends" }).click();
    const dialog = landscape.getByRole("dialog");
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 668 && box.y + box.height <= 321, JSON.stringify(box));
    const scroll = await dialog.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflow: getComputedStyle(element).overflowY }));
    assert.ok(["auto", "scroll"].includes(scroll.overflow), "Dialog permits vertical scrolling");
    assert.ok(scroll.scrollHeight > scroll.clientHeight, "Long dialog content actually scrolls at 320px height");
    const closeBox = await dialog.getByRole("button", { name: "Close", exact: true }).boundingBox();
    assert.ok(closeBox.y >= 0 && closeBox.y + closeBox.height <= 320, "Close remains visible");
    await landscape.screenshot({ path: fileURLToPath(new URL(`wall-landscape-dialog${mocked ? "-mocked" : ""}.png`, artifactDir)), fullPage: false, animations: "disabled" });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await landscapeContext.close();
  });

  const composer = page.getByRole("textbox", { name: "What's on your mind?" });
  const share = page.getByRole("button", { name: "Share", exact: true });
  await check("Empty and whitespace-only posts cannot be shared", async () => {
    assert.equal(await share.isDisabled(), true);
    await composer.fill("   \n  ");
    assert.equal(await share.isDisabled(), true);
    await composer.fill("");
  });
  await check("280-character limit counts Unicode code points", async () => {
    await composer.fill("🌿".repeat(281));
    assert.equal(Array.from(await composer.inputValue()).length, 280);
    assert.match(await page.locator("#character-count").innerText(), /280\s*\/\s*280/);
    assert.equal(await share.isEnabled(), true);
    await composer.fill("");
  });

  const second = await context.newPage();
  watch(second);
  await second.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForFeed(second);
  if (!mocked) await second.waitForFunction(() => document.querySelector(".live-status")?.textContent.includes("Live updates on"), { timeout: 30_000 });
  const marker = `Wall integration ${new Date().toISOString()} — a little hello from the browser test.`;
  await check("Failed share retains the draft and shows an error without adding a post", async () => {
    const initialCount = await page.locator(".post-card").count();
    const rejectInsert = route => route.request().method() === "POST"
      ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Temporary test rejection. Please retry." }) })
      : route.continue();
    await page.route("**/rest/v1/posts*", rejectInsert);
    await composer.fill(marker);
    await share.click();
    await page.locator(".error-banner[role='alert']").waitFor();
    assert.equal(await composer.inputValue(), marker);
    assert.equal(await page.locator(".post-card").count(), initialCount);
    assert.equal(await page.locator(".post-card").filter({ hasText: marker }).count(), 0);
    await page.unroute("**/rest/v1/posts*", rejectInsert);
  });
  await check(mocked ? "Error banner retries the original draft through mocked HTTP" : "Error banner retries the original draft as a real Supabase post", async () => {
    let releaseInsert;
    let markStarted;
    const started = new Promise(resolve => { markStarted = resolve; });
    const gate = new Promise(resolve => { releaseInsert = resolve; });
    const delayInsert = async route => {
      if (route.request().method() === "POST") {
        markStarted();
        await gate;
      }
      await route.fallback();
    };
    await page.route("**/rest/v1/posts*", delayInsert);
    const stored = page.waitForResponse(response => response.url().includes("/rest/v1/posts") && response.request().method() === "POST" && response.ok(), { timeout: 20_000 });
    stored.catch(() => {});
    await page.locator(".error-banner").getByRole("button", { name: "Try again", exact: true }).click();
    await started;
    try {
      await check("Pending share disables textarea, smile, and Share", async () => {
        assert.equal(await composer.isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "Add a smile", exact: true }).isDisabled(), true);
        assert.equal(await page.locator(".share-button").isDisabled(), true);
        assert.equal(await composer.inputValue(), marker);
      });
    } finally {
      releaseInsert();
    }
    const response = await stored;
    const result = await response.json();
    const rows = Array.isArray(result) ? result : [result];
    assert.equal(rows[0].body, marker);
    assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
    await page.locator(".post-card").filter({ hasText: marker }).waitFor();
    await composer.waitFor({ state: "visible" });
    assert.equal(await composer.inputValue(), "");
    assert.equal(await composer.isEnabled(), true);
    assert.equal(await page.getByRole("button", { name: "Add a smile", exact: true }).isEnabled(), true);
    await page.unroute("**/rest/v1/posts*", delayInsert);
  });
  if (mocked) report.checks.push({ name: "Real Supabase persistence and cross-tab realtime", skipped: true, reason: "External browser requests are sandbox-blocked. HTTP mock checks UI behavior only." });
  else await check("Another tab receives the new post without refresh", async () => {
      await second.locator(".post-card").filter({ hasText: marker }).waitFor({ timeout: 20_000 });
    });
  await check("Post persists after page reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForFeed(page);
    await page.locator(".post-card").filter({ hasText: marker }).waitFor();
  });
  await check("Feed is sorted newest first", async () => {
    assert.ok((await page.locator(".post-card").first().innerText()).includes(marker));
    const timestamps = await page.locator(".post-card time").evaluateAll(elements => elements.map(element => Date.parse(element.getAttribute("datetime"))));
    for (let index = 1; index < timestamps.length; index++) assert.ok(timestamps[index - 1] >= timestamps[index]);
  });
  await check("My posts remembers this browser's successful shares", async () => {
    await page.locator(".feed-tabs").getByRole("button", { name: "My posts", exact: true }).click();
    await page.locator(".post-card").filter({ hasText: marker }).waitFor();
    assert.equal(await page.locator(".post-card").count(), 1);
    await page.locator(".feed-tabs").getByRole("button", { name: "All posts", exact: true }).click();
  });
  const card = page.locator(".post-card").filter({ hasText: marker });
  await check("Like toggle responds and persists after reload", async () => {
    await card.getByRole("button", { name: "Like", exact: true }).click();
    assert.equal(await card.getByRole("button", { name: "Liked", exact: true }).getAttribute("aria-pressed"), "true");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForFeed(page);
    assert.equal(await card.getByRole("button", { name: "Liked", exact: true }).getAttribute("aria-pressed"), "true");
  });
  await check("Post menu saves a post and saved filter shows it", async () => {
    await card.getByRole("button", { name: "Options for Alex Morgan's post" }).click();
    await page.getByRole("menuitem", { name: "Save post", exact: true }).click();
    assert.equal(await card.getByRole("button", { name: "Saved", exact: true }).getAttribute("aria-pressed"), "true");
    await page.locator(".side-nav button").filter({ hasText: "Saved posts" }).click();
    await card.waitFor();
    assert.equal(await page.locator(".post-card").count(), 1);
    await card.getByRole("button", { name: "Saved", exact: true }).click();
    await page.getByRole("heading", { name: "Keep a little something" }).waitFor();
    await page.locator(".side-nav button").filter({ hasText: "The Wall" }).click();
  });
  await check("About dialog opens and closes accessibly", async () => {
    await page.getByRole("button", { name: "About this wall The internet, a little simpler." }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("heading", { name: "A little more like 2008." }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  });
  await check("Wall search finds and clears a post", async () => {
    await page.getByRole("textbox", { name: "Search the wall" }).fill(marker);
    assert.equal(await page.locator(".post-card").count(), 1);
    await page.getByRole("button", { name: "Clear search" }).click();
    assert.equal(await page.getByRole("textbox", { name: "Search the wall" }).inputValue(), "");
  });
  await check("Browser has no uncaught JavaScript errors", async () => assert.deepEqual(report.errors, []));
} catch (error) {
  report.failure = error.stack || error.message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL(`smoke-report${mocked ? "-mocked" : ""}.json`, artifactDir), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
