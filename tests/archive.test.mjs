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

test("snapshot contains all expected collections", async () => {
  const data = await archiveData();
  assert.equal(data.series.length, 9);
  assert.equal(data.series.reduce((sum, series) => sum + series.entries.length, 0), 441);
  assert.equal(data.series.find((series) => series.id === "idol-radio-s4").entries.length, 162);
  assert.equal(data.series.find((series) => series.id === "idol-radio-early").entries.length, 44);
  assert.equal(data.series.find((series) => series.id === "hello-the-b").entries.length, 80);
  assert.equal(data.series.find((series) => series.id === "ebs-listening").entries.length, 52);
});

test("Season 4 rows have dates, links and matched galleries", async () => {
  const data = await archiveData();
  const entries = data.series.find((series) => series.id === "idol-radio-s4").entries;
  assert.ok(entries.every((entry) => /^\d{6}$/.test(entry.date)));
  assert.ok(entries.every((entry) => /^https:\/\//.test(entry.watchUrl)));
  assert.ok(entries.every((entry) => /^https:\/\//.test(entry.folderUrl)));
  assert.ok(entries.every((entry) => entry.media.length > 0));
  assert.equal(data.unmatched.length, 1);
  assert.equal(data.unmatched[0].date, "260616");
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
