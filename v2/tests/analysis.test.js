import assert from "node:assert/strict";
import test from "node:test";
import { classReport, sittingTitle, studentSentence, takeaway } from "../src/analysis.js";
import { applyScorePaste, namesFromPaste, parseScoreText } from "../src/paste.js";

const students = [
  { id: "s1", name: "林一" },
  { id: "s2", name: "林二" },
];

function result(id, sittingId, studentId, scores) {
  return { id, sittingId, studentId, status: "recorded", scores };
}

test("class takeaway uses real averages and names the weakest skill", () => {
  const sittings = [
    { id: "a", date: "2026-10-01", level: "A2", kind: "official", paper: "正式10月" },
    { id: "b", date: "2026-11-09", level: "A2", kind: "official", paper: "正式11月" },
  ];
  const results = [
    result("1", "a", "s1", { reading: 100, writing: 100, listening: 100, speaking: 100 }),
    result("2", "a", "s2", { reading: 120, writing: 90, listening: 110, speaking: 100 }),
    result("3", "b", "s1", { reading: 110, writing: 100, listening: 100, speaking: 100 }),
    result("4", "b", "s2", { reading: 130, writing: 100, listening: 110, speaking: 100 }),
  ];
  const report = classReport(sittings[1], results, sittings[0], results);
  assert.equal(report.sentence, "阅读比上次提高 10 分，写作、口语最弱（班均 100 分）。");
  const reading = report.deltas.find((skill) => skill.id === "reading");
  assert.equal(reading.delta, 10);
});

test("a single entered skill is not called the weakest", () => {
  assert.equal(takeaway({ skills: [{ id: "reading", label: "阅读", average: 20, unit: "percent", rawAverage: 10, max: 30, n: 1 }], parts: [], deltas: [] }), "这次记下了阅读。");
});

test("part analysis highlights the lowest percent, not the smallest raw mark", () => {
  const sitting = { id: "p", date: "2026-11-09", level: "A2", kind: "practice", paper: "真题1" };
  const results = [
    result("1", "p", "s1", { writing_task_totals_v1: 1, r_p1: 1, r_p2: 7 }),
    result("2", "p", "s2", { writing_task_totals_v1: 1, r_p1: 1, r_p2: 7 }),
  ];
  const report = classReport(sitting, results, null, results);
  assert.match(report.sentence, /阅读第1部分最低（班均 1\/6）/);
  const first = report.parts.find((part) => part.id === "r_p1");
  const second = report.parts.find((part) => part.id === "r_p2");
  assert.ok(first.percent < second.percent);
});

test("student sentence compares that student with their own previous exam", () => {
  const sentence = studentSentence("林一", [
    { id: "reading", label: "阅读", value: 130, unit: "scale" },
    { id: "writing", label: "写作", value: 100, unit: "scale" },
  ], {
    reading: [
      { date: "2026-10-01", value: 120, unit: "scale" },
      { date: "2026-11-09", value: 130, unit: "scale" },
    ],
    writing: [
      { date: "2026-10-01", value: 100, unit: "scale" },
      { date: "2026-11-09", value: 100, unit: "scale" },
    ],
  });
  assert.equal(sentence, "阅读比上次提高 10 分，这次写作最弱。");
});

test("imported paper names are not labeled with the level twice", () => {
  const title = sittingTitle({ date: "2026-11-09", level: "A2", kind: "practice", paper: "KET · 真题集1 · Test1" }, new Date("2026-11-09T00:00:00Z"));
  assert.equal(title, "11月9日 · KET · 真题集1 · Test1 · 练习");
});

test("excel paste matches student names and a rectangle of numbers", () => {
  const columns = [
    { id: "r_p1", label: "阅读第1部分" },
    { id: "r_p2", label: "阅读第2部分" },
  ];
  const named = applyScorePaste({
    text: "姓名\t阅读第1部分\t阅读第2部分\n林二\t3\t4\n林一\t5\t6\n",
    students,
    columns,
  });
  assert.deepEqual(named.changes, [
    { studentId: "s2", columnId: "r_p1", text: "3" },
    { studentId: "s2", columnId: "r_p2", text: "4" },
    { studentId: "s1", columnId: "r_p1", text: "5" },
    { studentId: "s1", columnId: "r_p2", text: "6" },
  ]);
  const block = applyScorePaste({ text: "1\t2\n3\t4", students, columns, startRow: 0, startCol: 0 });
  assert.equal(block.changes[0].studentId, "s1");
  assert.equal(block.changes[2].text, "3");
  assert.deepEqual(parseScoreText("４．５"), { value: 4.5 });
  assert.equal(parseScoreText("").empty, true);
});

test("a column of names can be pasted onto the roster", () => {
  const parsed = namesFromPaste("姓名\n林一\n林二\n");
  assert.deepEqual(parsed.names, ["林一", "林二"]);
  assert.equal(namesFromPaste("林一").single, true);
});
