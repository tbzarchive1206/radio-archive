import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFile(new URL(file, root), "utf8");

async function archiveData() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(await read("data/archive-data.js"), context);
  return context.window.RADIO_ARCHIVE_DATA;
}

async function syncReport() {
  return JSON.parse(await read("data/sync-report.json"));
}

test("snapshot contains all expected collections", async () => {
  const data = await archiveData();
  const report = await syncReport();
  const seriesById = new Map(data.series.map((series) => [series.id, series]));
  const minimumEntries = {
    "idol-radio-s4": 162,
    "idol-radio-early": 44,
    "hello-the-b": 80,
    "ebs-listening": 52,
  };
  const entries = data.series.flatMap((series) => series.entries);

  assert.equal(data.series.length, 9);
  assert.equal(entries.length, report.entries);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);

  for (const [id, minimum] of Object.entries(minimumEntries)) {
    assert.ok(seriesById.has(id), `Missing expected collection: ${id}`);
    assert.ok(
      seriesById.get(id).entries.length >= minimum,
      `${id} unexpectedly lost entries`,
    );
  }
});

test("Season 4 rows have dates, links and matched galleries", async () => {
  const data = await archiveData();
  const entries = data.series.find((series) => series.id === "idol-radio-s4").entries;
  assert.ok(entries.every((entry) => /^\d{6}$/.test(entry.date)));
  assert.ok(entries.every((entry) => /^https:\/\//.test(entry.watchUrl)));
  assert.ok(entries.every((entry) => /^https:\/\//.test(entry.folderUrl)));
  assert.ok(entries.every((entry) => entry.media.length > 0));
  assert.ok(Array.isArray(data.unmatched));

  const seasonDates = new Set(entries.map((entry) => entry.date));
  for (const item of data.unmatched) {
    assert.equal(item.kind, "photo-folder-without-sheet-row");
    assert.match(item.date, /^\d{6}$/);
    assert.match(item.folderUrl, /^https:\/\//);
    assert.ok(item.mediaCount > 0);
    assert.ok(!seasonDates.has(item.date), `Gallery ${item.date} should be matched`);
  }
});

test("front end supports search, contextual filters and local galleries", async () => {
  const app = await read("app.js");
  const html = await read("index.html");
  const styles = await read("styles.css");
  assert.match(app, /SEARCH RESULTS/);
  assert.match(app, /member-filter/);
  assert.match(app, /episode-filter/);
  assert.match(app, /media-grid/);
  assert.match(app, /thumbnail\?id=/);
  assert.match(app, /Haknyeon \(2017-2025\)/);
  assert.match(app, /New \(2017 - 2026\)/);
  assert.match(app, /episode-thumb/);
  assert.doesNotMatch(app, /category\.description/);
  assert.doesNotMatch(app, /item\.description/);
  assert.doesNotMatch(app, /series\.description/);
  assert.doesNotMatch(html, /iframe/i);
  assert.doesNotMatch(await read("data/archive-data.js"), /GOOGLE_DRIVE_API_KEY/);
  assert.match(styles, /repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.site-shell\{width:100%/);
});
