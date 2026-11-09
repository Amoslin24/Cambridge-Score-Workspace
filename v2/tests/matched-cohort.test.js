import assert from "node:assert/strict";
import test from "node:test";
import { classSkillTrend, matchedPairNarrative, matchedSkillPair, skillObservation } from "../src/analysis.js";

/**
 * EXAMPLE data, not real students.
 * First KET practice: A misses Reading part 5 (blank, not zero), B has explicit zeros, C is complete.
 * Second: A and B are complete, C is absent.
 * Unmatched means are 21.5/30 then 23/30. Only B is in both complete sets.
 */
const students = [
  { id: "A", name: "示例 A" },
  { id: "B", name: "示例 B" },
  { id: "C", name: "示例 C" },
];

const first = { id: "nov", date: "2026-11-09", level: "A2", kind: "practice", paper: "示例卷1" };
const second = { id: "dec", date: "2026-12-09", level: "A2", kind: "practice", paper: "示例卷2" };

function result(id, sittingId, studentId, scores, status = "recorded") {
  return { id, sittingId, studentId, status, scores };
}

const results = [
  result("a1", "nov", "A", { r_p1: 6, r_p2: 7, r_p3: 5, r_p4: 6 }),
  result("b1", "nov", "B", { r_p1: 6, r_p2: 7, r_p3: 5, r_p4: 0, r_p5: 0 }),
  result("c1", "nov", "C", { r_p1: 6, r_p2: 7, r_p3: 5, r_p4: 6, r_p5: 1 }),
  result("a2", "dec", "A", { r_p1: 6, r_p2: 7, r_p3: 5, r_p4: 6, r_p5: 4 }),
  result("b2", "dec", "B", { r_p1: 6, r_p2: 7, r_p3: 5, r_p4: 0, r_p5: 0 }),
  result("c2", "dec", "C", {}, "absent"),
];

test("a blank part is incomplete and an explicit zero still counts", () => {
  const blank = skillObservation(first, results[0], "reading");
  const zeros = skillObservation(first, results[1], "reading");
  const complete = skillObservation(first, results[2], "reading");
  assert.equal(blank.state, "incomplete");
  assert.equal(zeros.state, "complete");
  assert.equal(zeros.raw, 18);
  assert.equal(complete.raw, 25);
  assert.equal(skillObservation(second, results[5], "reading").state, "absent");
});

test("class reading trend does not turn unmatched 21.5/30 and 23/30 into an improvement", () => {
  const pair = matchedSkillPair(first, second, results, "reading", students);
  assert.equal(pair.descriptiveBeforeN, 2);
  assert.equal(pair.descriptiveAfterN, 2);
  assert.equal(pair.descriptiveRawBefore, 21.5);
  assert.equal(pair.descriptiveRawAfter, 23);
  assert.equal(pair.matchedCount, 1);
  assert.equal(pair.matched[0].student.name, "示例 B");
  assert.equal(pair.matchedRawBefore, 18);
  assert.equal(pair.matchedRawAfter, 18);
  assert.equal(pair.delta, 0);
  const text = matchedPairNarrative(pair, "阅读");
  assert.match(text, /同一批 1 人/);
  assert.match(text, /示例 A（前一场这一项没填完（空着不算 0））/);
  assert.match(text, /示例 C（后一场缺考）/);
  assert.match(text, /21\.5\/30（2 人）/);
  assert.match(text, /23\/30（2 人）/);
  assert.match(text, /不能当成提高或下降/);
  assert.equal(/高\s*5/.test(text), false);
  assert.equal(text.includes("5 个百分点"), false);

  const trend = classSkillTrend([first, second], results, { level: "A2", kind: "practice", skillId: "reading", students });
  assert.equal(trend.chart.length, 2);
  assert.equal(trend.chart[0].raw, 18);
  assert.equal(trend.chart[1].raw, 18);
  assert.equal(trend.chart[0].n, 1);
  assert.notEqual(trend.chart[0].raw, 21.5);
  assert.notEqual(trend.chart[1].raw, 23);
});
