import assert from "node:assert/strict";
import test from "node:test";
import { convertLegacyDatabase, exportEnvelope, OLD_DATABASE_KEY, parseImportJson, sittingKey } from "../src/legacy.js";
import { NEW_DATABASE_KEY, importBackupText, importOldDatabase } from "../src/store.js";

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function student(id, name, extra = {}) {
  return { id, name, className: "四1", setName: "A1", grade: "Y4", externalStudentId: null, ...extra };
}

function exam(id, extra) {
  return { id, exam: "A2", kind: "practice", date: "2026-11-09", source: "KET · 真题集1 · Test1", ...extra };
}

function attempt(id, studentId, examId, scores, extra = {}) {
  return {
    id,
    studentId,
    examId,
    exam: "A2",
    kind: "practice",
    date: "2026-11-09",
    source: "KET · 真题集1 · Test1",
    status: "recorded",
    scores,
    ...extra,
  };
}

function database(overrides = {}) {
  return {
    schemaVersion: 1,
    workspaceId: "ws-1",
    revision: 3,
    students: [],
    exams: [],
    attempts: [],
    identityAliases: {},
    ...overrides,
  };
}

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

test("same date, level and paper become one sitting", () => {
  const converted = convertLegacyDatabase(
    database({
      students: [student("s1", "林一"), student("s2", "林二"), student("s3", "林三")],
      exams: [exam("e1"), exam("e2"), exam("e3")],
      attempts: [
        attempt("a1", "s1", "e1", { r_p1: 4 }),
        attempt("a2", "s2", "e2", { r_p1: 5 }),
        attempt("a3", "s3", "e3", { r_p1: 6 }),
      ],
    }),
    { createId: ids() },
  );
  assert.equal(converted.sittings.length, 1);
  assert.equal(converted.results.length, 3);
  assert.deepEqual(converted.sittings[0].legacyExamIds.sort(), ["e1", "e2", "e3"]);
  assert.equal(converted.results.every((result) => result.sittingId === converted.sittings[0].id), true);
});

test("a different paper stays a different sitting", () => {
  const converted = convertLegacyDatabase(
    database({
      students: [student("s1", "林一"), student("s2", "林二")],
      exams: [exam("e1"), exam("e2", { source: "KET · 真题集1 · Test2" })],
      attempts: [
        attempt("a1", "s1", "e1", { r_p1: 4 }),
        attempt("a2", "s2", "e2", { r_p1: 5 }, { source: "KET · 真题集1 · Test2" }),
      ],
    }),
    { createId: ids() },
  );
  assert.equal(converted.sittings.length, 2);
});

test("extra spaces in the paper name still match", () => {
  const converted = convertLegacyDatabase(
    database({
      students: [student("s1", "林一"), student("s2", "林二")],
      exams: [exam("e1"), exam("e2", { source: "KET ·  真题集1 · Test1" })],
      attempts: [
        attempt("a1", "s1", "e1", { r_p1: 1 }),
        attempt("a2", "s2", "e2", { r_p1: 2 }, { source: " KET · 真题集1 · Test1 " }),
      ],
    }),
    { createId: ids() },
  );
  assert.equal(converted.sittings.length, 1);
});

test("practice and official with the same paper stay separate", () => {
  const converted = convertLegacyDatabase(
    database({
      students: [student("s1", "林一"), student("s2", "林二")],
      exams: [exam("e1"), exam("e2", { kind: "official" })],
      attempts: [
        attempt("a1", "s1", "e1", { r_p1: 4 }),
        attempt("a2", "s2", "e2", { reading: 120 }, { kind: "official" }),
      ],
    }),
    { createId: ids() },
  );
  assert.equal(converted.sittings.length, 2);
  assert.deepEqual(converted.sittings.map((sitting) => sitting.kind).sort(), ["official", "practice"]);
});

test("the same student twice is kept and not collapsed", () => {
  const converted = convertLegacyDatabase(
    database({
      students: [student("s1", "林一"), student("s2", "林二")],
      exams: [exam("e1"), exam("e2")],
      attempts: [
        attempt("a1", "s1", "e1", { r_p1: 4 }),
        attempt("a2", "s1", "e2", { r_p1: 6 }),
        attempt("a3", "s2", "e1", { r_p1: 5 }),
      ],
    }),
    { createId: ids() },
  );
  assert.equal(converted.results.length, 3);
  assert.equal(converted.sittings.length, 2);
  assert.equal(converted.sittings.every((sitting) => sitting.splitFromSamePaper), true);
  const perSitting = converted.sittings.map((sitting) => converted.results.filter((result) => result.sittingId === sitting.id).map((result) => result.studentId).sort());
  for (const idsInSitting of perSitting) assert.equal(new Set(idsInSitting).size, idsInSitting.length);
});

test("backup envelope and raw database both import", () => {
  const raw = database({
    students: [student("s1", "林一", { externalStudentId: "1001" })],
    exams: [exam("e1")],
    attempts: [attempt("a1", "s1", "e1", { r_p1: 3 }, { recordMeta: { category: "mock" } })],
  });
  const fromRaw = parseImportJson(raw);
  const fromBackup = parseImportJson({
    format: "cambridge-local",
    schemaVersion: 1,
    purpose: "backup",
    exportedAt: "2026-11-09T00:00:00.000Z",
    data: raw,
  });
  const fromCoordinator = parseImportJson({
    format: "cambridge-local",
    schemaVersion: 1,
    purpose: "coordinator",
    exportedAt: "2026-11-09T00:00:00.000Z",
    data: raw,
  });
  for (const parsed of [fromRaw, fromBackup, fromCoordinator]) {
    assert.equal(parsed.kind, "legacy");
    assert.equal(parsed.converted.students[0].externalStudentId, "1001");
    assert.equal(parsed.converted.results[0].scores.r_p1, 3);
    assert.equal(parsed.converted.results[0].recordMeta.category, "mock");
  }
});

test("v2 backup round-trips through the parser", () => {
  const workspace = {
    schemaVersion: 2,
    students: [student("s1", "林一")],
    sittings: [{ id: "sit-1", date: "2026-11-09", level: "A2", kind: "practice", paper: "真题1" }],
    results: [{ id: "r1", sittingId: "sit-1", studentId: "s1", status: "recorded", scores: { r_p1: 4 } }],
    prefs: { level: "A2" },
  };
  const parsed = parseImportJson(JSON.stringify(exportEnvelope(workspace)));
  assert.equal(parsed.kind, "v2");
  assert.equal(parsed.workspace.results[0].scores.r_p1, 4);
});

test("importing the old backup twice does not duplicate students or results", () => {
  const raw = database({
    students: [student("s1", "林一"), student("s2", "林二")],
    exams: [exam("e1"), exam("e2")],
    attempts: [attempt("a1", "s1", "e1", { r_p1: 4 }), attempt("a2", "s2", "e2", { r_p1: 5 })],
  });
  const file = JSON.stringify({ format: "cambridge-local", schemaVersion: 1, purpose: "backup", data: raw });
  const storage = memory();
  const first = importBackupText(storage, file);
  const second = importBackupText(storage, file);
  assert.equal(first.summary.studentsAdded, 2);
  assert.equal(first.summary.sittingsAdded, 1);
  assert.equal(first.summary.resultsAdded, 2);
  assert.equal(second.summary.studentsAdded, 0);
  assert.equal(second.summary.sittingsAdded, 0);
  assert.equal(second.summary.resultsAdded, 0);
  assert.equal(second.workspace.students.length, 2);
  assert.equal(second.workspace.results.length, 2);
});

test("a conflicting second score is kept, not overwritten", () => {
  const storage = memory();
  const first = database({
    students: [student("s1", "林一")],
    exams: [exam("e1")],
    attempts: [attempt("a1", "s1", "e1", { r_p1: 4 })],
  });
  const second = database({
    students: [student("s1", "林一")],
    exams: [exam("e9")],
    attempts: [attempt("a9", "s1", "e9", { r_p1: 6 })],
  });
  importBackupText(storage, JSON.stringify({ format: "cambridge-local", schemaVersion: 1, purpose: "backup", data: first }));
  const merged = importBackupText(storage, JSON.stringify({ format: "cambridge-local", schemaVersion: 1, purpose: "backup", data: second }));
  assert.equal(merged.summary.resultsSkipped, 1);
  assert.equal(merged.workspace.results.length, 1);
  assert.equal(merged.workspace.results[0].scores.r_p1, 4);
});

test("reading the old browser data never writes the old keys", () => {
  const raw = database({
    students: [student("s1", "林一")],
    exams: [exam("e1", { partEvidence: [{ id: "ev1", note: "kept" }] })],
    attempts: [attempt("a1", "s1", "e1", { r_p1: 2 })],
  });
  const original = JSON.stringify(raw);
  const storage = memory({
    [OLD_DATABASE_KEY]: original,
    "cambridge-local-v1-recovery": "keep-me",
    "cambridge-workspace-profile-v1": JSON.stringify({ teacherName: "林老师", customTitle: "四年级英语" }),
    "cambridge-set-analysis-v2": "{\"merges\":[]}",
  });
  const imported = importOldDatabase(storage);
  assert.deepEqual(storage.writes, [NEW_DATABASE_KEY]);
  assert.equal(storage.data[OLD_DATABASE_KEY], original);
  assert.equal(storage.data["cambridge-local-v1-recovery"], "keep-me");
  assert.equal(storage.data["cambridge-set-analysis-v2"], "{\"merges\":[]}");
  assert.equal(imported.workspace.students[0].name, "林一");
  assert.equal(imported.workspace.sittings.length, 1);
  assert.equal(imported.workspace.sittings[0].partEvidence[0].id, "ev1");
  assert.equal(imported.workspace.profile.teacherName, "林老师");
  assert.equal(sittingKey(imported.workspace.sittings[0]).includes("真题集1"), true);
});

test("broken old data is not replaced or deleted", () => {
  const storage = memory({ [OLD_DATABASE_KEY]: "{not json" });
  assert.throws(() => importOldDatabase(storage), /没有改动任何数据/);
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.data[OLD_DATABASE_KEY], "{not json");
});

test("rejects a file that is not a score backup", () => {
  assert.throws(() => parseImportJson({ hello: "world" }), /不是本程序或旧版导出的成绩文件/);
});
