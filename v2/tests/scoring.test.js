import assert from "node:assert/strict";
import test from "node:test";
import { calculate, entryColumns, inferMode, validateScores, yleParts } from "../src/scoring.js";

function readingScores(total) {
  const maxes = [6, 7, 5, 6, 6];
  let left = total;
  const scores = { writing_task_totals_v1: 1 };
  maxes.forEach((max, index) => {
    const value = Math.min(max, left);
    scores[`r_p${index + 1}`] = value;
    left -= value;
  });
  return scores;
}

test("KET reading raw scores use the existing scale anchors", () => {
  assert.equal(calculate("A2", readingScores(7), "practice").skills.find((skill) => skill.id === "reading").scale, 82);
  assert.equal(calculate("A2", readingScores(10), "practice").skills.find((skill) => skill.id === "reading").scale, 91);
  assert.equal(calculate("A2", readingScores(13), "practice").skills.find((skill) => skill.id === "reading").scale, 100);
  assert.equal(calculate("A2", readingScores(6), "practice").skills.find((skill) => skill.id === "reading").scale, null);
});

test("KET writing task totals use the same anchors as criterion totals", () => {
  const result = calculate("A2", { writing_task_totals_v1: 1, w_task1: 6, w_task2: 4 }, "practice");
  const writing = result.skills.find((skill) => skill.id === "writing");
  assert.equal(writing.raw, 10);
  assert.equal(writing.max, 30);
  assert.equal(writing.scale, 91);
});

test("official KET scale average matches the old overall rule", () => {
  const result = calculate("A2", { reading: 120, writing: 110, listening: 130, speaking: 100 }, "official");
  assert.equal(result.overall, 115);
  assert.equal(result.skills.every((skill) => skill.scale != null && skill.shields == null), true);
});

test("combined historical KET papers do not invent an overall", () => {
  const result = calculate("A2", { __officialA2Combined: 1, readingWriting: 120, listening: 110, speaking: 100 }, "official");
  assert.equal(result.overall, null);
  assert.deepEqual(result.skills.map((skill) => skill.id), ["readingWriting", "listening", "speaking"]);
});

test("YLE part scores sum and estimate shields from the toolkit table", () => {
  const parts = yleParts("Movers", "listening");
  assert.equal(parts.length, 5);
  assert.equal(parts.reduce((sum, part) => sum + part.max, 0), 25);
  const full = Object.fromEntries(parts.map((part) => [part.id, 5]));
  full.yle_paper_parts_2024 = 1;
  const fullResult = calculate("Movers", full, "practice").skills.find((skill) => skill.id === "listening");
  assert.equal(fullResult.raw, 25);
  assert.equal(fullResult.estimatedShields, 5);
  assert.equal(fullResult.shields, null);

  const eleven = { ...full, y24_listening_p1: 5, y24_listening_p2: 2, y24_listening_p3: 2, y24_listening_p4: 2, y24_listening_p5: 0 };
  const low = calculate("Movers", eleven, "practice").skills.find((skill) => skill.id === "listening");
  assert.equal(low.raw, 11);
  assert.equal(low.estimatedShields, 2);
});

test("legacy Movers listening bands stay on the old cut scores", () => {
  const result = calculate("Movers", { yle_legacy_v7: 1, listening_raw: 11, listening_max: 25 }, "practice");
  assert.equal(result.skills.find((skill) => skill.id === "listening").estimatedShields, 2);
});

test("official YLE stores shields, not a made-up scale average", () => {
  const result = calculate("Flyers", { listening: 4, readingWriting: 3, speaking: 5 }, "official");
  assert.equal(result.overall, null);
  assert.deepEqual(result.skills.map((skill) => skill.shields), [4, 3, 5]);
});

test("out of range and half-point mistakes are rejected", () => {
  assert.equal(validateScores("A2", { reading: 79 }, "official").length > 0, true);
  assert.equal(validateScores("A2", { r_p1: 1.5 }, "practice").length > 0, true);
  assert.equal(validateScores("A2", { yle_paper_parts_2024: 1, r_p1: 1 }, "practice").length > 0, true);
});

test("new practice columns are the part scores, with speaking optional", () => {
  const columns = entryColumns("A2", "practice", inferMode("A2", "practice", [{}]), { includeSpeaking: false });
  assert.equal(columns.some((column) => column.id === "r_p1"), true);
  assert.equal(columns.some((column) => column.id === "w_task1"), true);
  assert.equal(columns.some((column) => column.id.startsWith("s_")), false);
  const flyers = entryColumns("Flyers", "practice", "yle-parts");
  assert.equal(flyers.filter((column) => column.groupId === "readingWriting").length, 7);
});

test("A2 speaking weights still reach the old maximum of 45", () => {
  const scores = { s_0: 5, s_1: 5, s_2: 5, s_3: 5 };
  const speaking = calculate("A2", scores, "practice").skills.find((skill) => skill.id === "speaking");
  assert.equal(speaking.raw, 45);
  assert.equal(speaking.scale, null);
});
