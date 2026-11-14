import test from "node:test";
import assert from "node:assert/strict";
import {
  parseReadingList,
  changeReadingEntry,
  mergeReadingLists,
} from "../src/lib/reading-list";
test("reading state validates imported records and persists independent saved/read flags", () => {
  assert.deepEqual(parseReadingList("invalid"), []);
  assert.deepEqual(
    parseReadingList([
      {
        slug: "../../admin",
        title: "x",
        saved: true,
        read: false,
        updatedAt: new Date().toISOString(),
      },
    ]),
    [],
  );
  let s = changeReadingEntry(
    [],
    { slug: "react", title: "ReAct" },
    { saved: true },
  );
  s = changeReadingEntry(s, { slug: "react", title: "ReAct" }, { read: true });
  s = changeReadingEntry(
    s,
    { slug: "react", title: "ReAct" },
    { saved: false },
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].read, true);
  assert.equal(s[0].saved, false);
  assert.equal(changeReadingEntry(s, s[0], { read: false }).length, 0);
});
test("reading import merges by timestamp without losing newer local changes", () => {
  const old = {
    slug: "react",
    title: "ReAct",
    saved: true,
    read: false,
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  const recent = { ...old, read: true, updatedAt: "2025-01-01T00:00:00.000Z" };
  assert.deepEqual(mergeReadingLists([recent], [old]), [recent]);
  assert.deepEqual(mergeReadingLists([old], [recent]), [recent]);
});
