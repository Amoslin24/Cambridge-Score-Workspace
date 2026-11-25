import assert from "node:assert/strict";
import test from "node:test";
import { classAttention, cohortCompare, evidenceLine, judgeItems, laterFollowUp, partSnapshots } from "../src/attention.js";
import { EXAMPLE } from "./fixtures.js";

const roster = EXAMPLE.students;
const three = roster.slice(0, 3);

function sitting(id, date, paper, extra = {}) {
  return { id, date, level: "A2", kind: "practice", paper, ...extra };
}

function scored(id, sittingId, studentId, scores, status = "recorded") {
  return { id, sittingId, studentId, status, scores: { writing_task_totals_v1: 1, ...scores } };
}

test("EXAMPLE fixture is labelled and is not treated as real students", () => {
  assert.equal(EXAMPLE.label, "EXAMPLE");
  assert.match(EXAMPLE.note, /不是真实学生/);
  assert.ok(EXAMPLE.students.every((student) => student.name.startsWith("示例")));
});

test("parts are ranked by percent, and a higher raw score can still be the lower rate", () => {
  const items = [
    { id: "wide", label: "宽", percent: 50, n: 3, rawAverage: 5, max: 10 },
    { id: "narrow", label: "窄", percent: 80, n: 3, rawAverage: 4, max: 5 },
  ];
  const judgement = judgeItems(items);
  assert.equal(judgement.status, "signal");
  assert.deepEqual(judgement.low.map((item) => item.id), ["wide"]);
  assert.ok(judgement.gap >= 10);
});

test("a blank cell is not counted as zero", () => {
  const exam = sitting("s", "2026-11-09", "示例卷");
  const results = [
    scored("1", "s", "ex-jia", { r_p1: 6 }),
    scored("2", "s", "ex-yi", { r_p1: 6 }),
    scored("3", "s", "ex-bing", {}),
  ];
  const part = partSnapshots(exam, results, three).find((item) => item.id === "r_p1");
  assert.equal(part.n, 2);
  assert.equal(part.blank, 1);
  assert.equal(part.percent, 100);
  assert.notEqual(part.percent, 67);
});

test("an absence is not counted as zero", () => {
  const exam = sitting("s", "2026-11-09", "示例卷");
  const results = [
    scored("1", "s", "ex-jia", { r_p1: 3 }),
    scored("2", "s", "ex-yi", { r_p1: 3 }),
    scored("3", "s", "ex-bing", {}, "absent"),
  ];
  const part = partSnapshots(exam, results, three).find((item) => item.id === "r_p1");
  assert.equal(part.absent, 1);
  assert.equal(part.n, 2);
  assert.equal(Math.round(part.percent), 50);
});

test("a small gap or a tie is not called the weakest part", () => {
  const close = judgeItems([
    { id: "a", label: "甲项", percent: 50, n: 3 },
    { id: "b", label: "乙项", percent: 55, n: 3 },
  ]);
  assert.equal(close.status, "close");
  assert.match(close.message, /不把某一项说成最弱/);
  const tied = judgeItems([
    { id: "a", label: "甲项", percent: 50, n: 3 },
    { id: "b", label: "乙项", percent: 50.6, n: 3 },
  ]);
  assert.equal(tied.status, "tie");
  assert.match(tied.message, /不单指某一项/);
});

test("fewer than three scored students is insufficient, not a ranking", () => {
  const judgement = judgeItems([
    { id: "a", label: "甲项", percent: 10, n: 2 },
    { id: "b", label: "乙项", percent: 90, n: 2 },
  ]);
  assert.equal(judgement.status, "insufficient");
  assert.match(judgement.message, /不足 3 人/);
  assert.equal(judgement.message.includes("最低"), false);
});

test("one low sitting is a signal and two comparable lows are marked repeated", () => {
  const first = sitting("e1", "2026-10-01", "示例卷A");
  const second = sitting("e2", "2026-11-01", "示例卷B");
  const low = { r_p1: 1, r_p2: 7 };
  const results = ["ex-jia", "ex-yi", "ex-bing"].flatMap((studentId, index) => [
    scored(`a${index}`, "e1", studentId, low),
    scored(`b${index}`, "e2", studentId, low),
  ]);
  const once = classAttention({ students: three, sittings: [first], results });
  assert.equal(once.items[0].repeated, false);
  assert.equal(once.items[0].partId, "r_p1");
  const twice = classAttention({ students: three, sittings: [first, second], results });
  assert.equal(twice.items[0].repeated, true);
  assert.equal(twice.items[0].hitCount, 2);
  assert.match(evidenceLine(twice.items[0]), /%（/);
  assert.match(evidenceLine(twice.items[0]), /3 人有分/);
});

test("different levels or assessment types are not subtracted", () => {
  const practice = sitting("p", "2026-10-01", "练习卷");
  const official = sitting("o", "2026-11-01", "正式卷", { kind: "official" });
  const otherLevel = sitting("b", "2026-11-01", "另一级", { level: "B1" });
  const results = [scored("1", "p", "ex-jia", { r_p1: 3 })];
  assert.equal(cohortCompare(practice, official, three, results, "r_p1", 6).ok, false);
  assert.equal(cohortCompare(practice, otherLevel, three, results, "r_p1", 6).ok, false);
  assert.match(cohortCompare(practice, official, three, results, "r_p1", 6).reason, /不能相减/);
});

test("class change is reported separately from the matched-student difference", () => {
  const earlier = sitting("e1", "2026-10-01", "示例卷A");
  const later = sitting("e2", "2026-11-01", "示例卷B");
  const results = [
    scored("1", "e1", "ex-jia", { r_p1: 2 }),
    scored("2", "e1", "ex-yi", { r_p1: 2 }),
    scored("3", "e1", "ex-bing", {}, "absent"),
    scored("4", "e2", "ex-jia", { r_p1: 4 }),
    scored("5", "e2", "ex-yi", { r_p1: 4 }),
    scored("6", "e2", "ex-bing", { r_p1: 6 }),
    scored("7", "e2", "ex-ding", { r_p1: 6 }),
  ];
  const compared = cohortCompare(earlier, later, roster, results, "r_p1", 6);
  assert.equal(compared.ok, true);
  assert.equal(compared.matchedCount, 2);
  assert.equal(compared.onlyLater.map((student) => student.name).join("、"), "示例丙、示例丁");
  assert.equal(Math.round(compared.earlierMean), 33);
  assert.equal(Math.round(compared.laterMean), 67);
  assert.ok(compared.delta > 30 && compared.delta < 34);
  assert.equal(compared.samePaper, false);
  assert.match(compared.note, /不能当成能力/);
});

test("a later exam is shown beside a follow-up without judging the teaching", () => {
  const followUp = {
    id: "note-1",
    className: "示例班",
    level: "A2",
    kind: "practice",
    partId: "r_p1",
    label: "阅读第1部分",
    observation: "EXAMPLE 先看题目要求",
    nextCheck: "EXAMPLE 下次看是否还空着",
    createdAt: "2026-10-15",
  };
  const exam = sitting("e2", "2026-11-01", "示例卷B");
  const results = three.map((student, index) => scored(String(index), "e2", student.id, { r_p1: 3 }));
  const later = laterFollowUp(followUp, [exam], results, three);
  assert.equal(later.length, 1);
  assert.equal(later[0].n, 3);
  assert.match(later[0].note, /不是对教学效果的判断/);
});

test("old records still import while follow-up notes stay on the new workspace", async () => {
  const { importBackupText } = await import("../src/store.js");
  const storage = memory({
    "cambridge-score-workspace-v2": JSON.stringify({
      schemaVersion: 2,
      students: [],
      sittings: [],
      results: [],
      followUps: [{ id: "keep-me", className: "示例班", level: "A2", kind: "practice", partId: "r_p1", label: "阅读第1部分", observation: "EXAMPLE", nextCheck: "", createdAt: "2026-10-01" }],
      prefs: {},
    }),
  });
  const legacy = {
    format: "cambridge-local",
    schemaVersion: 1,
    purpose: "backup",
    data: {
      schemaVersion: 1,
      students: [{ id: "s1", name: "示例甲", className: "", setName: "示例班", grade: "", externalStudentId: "" }],
      exams: [{ id: "e1", exam: "A2", kind: "practice", date: "2026-11-09", source: "KET · 真题集1 · Test1" }],
      attempts: [{ id: "a1", studentId: "s1", examId: "e1", exam: "A2", kind: "practice", date: "2026-11-09", source: "KET · 真题集1 · Test1", status: "recorded", scores: { r_p1: 1 } }],
    },
  };
  const originalOld = JSON.stringify(legacy);
  storage.data["cambridge-local-v1"] = originalOld;
  const merged = importBackupText(storage, JSON.stringify(legacy));
  assert.equal(storage.data["cambridge-local-v1"], originalOld);
  assert.equal(storage.writes.includes("cambridge-local-v1"), false);
  assert.equal(merged.workspace.followUps[0].id, "keep-me");
  assert.equal(merged.workspace.results.length, 1);
});

function memory(initial = {}) {
  const data = { ...initial };
  const writes = [];
  return {
    data,
    writes,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      writes.push(key);
      data[key] = String(value);
    },
    removeItem(key) {
      writes.push(`del:${key}`);
      delete data[key];
    },
  };
}
