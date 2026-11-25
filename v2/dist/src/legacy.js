/**
 * Read-only conversion from the old app's schemaVersion 1 database, or from
 * its backup envelope, into exam sittings. A sitting is one date + level +
 * paper + the way it was marked (practice / official / classroom). Practice
 * and official results are not merged: their numbers mean different things.
 */

export const OLD_DATABASE_KEY = "cambridge-local-v1";
export const OLD_RECOVERY_KEY = "cambridge-local-v1-recovery";
export const OLD_PROFILE_KEY = "cambridge-workspace-profile-v1";
export const OLD_ANALYSIS_KEY = "cambridge-set-analysis-v2";
export const NEW_DATABASE_KEY = "cambridge-score-workspace-v2";

export const UNTOUCHED_KEYS = [OLD_DATABASE_KEY, OLD_RECOVERY_KEY, OLD_PROFILE_KEY, OLD_ANALYSIS_KEY];

export function normalizePaper(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function sittingKey(sitting) {
  const base = JSON.stringify([sitting.date || "", sitting.level || "", sitting.kind || "", normalizePaper(sitting.paper)]);
  return sitting.splitFromSamePaper ? `${base}#${sitting.splitKey || sitting.id}` : base;
}

function text(value, max = 200) {
  const cleaned = String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim();
  return cleaned.slice(0, max);
}

function copyStudent(student, index) {
  return {
    id: text(student?.id, 150) || `student-${index + 1}`,
    name: text(student?.name, 80) || "（未填姓名）",
    className: text(student?.className, 80),
    setName: text(student?.setName, 80),
    grade: text(student?.grade, 80),
    externalStudentId: student?.externalStudentId == null ? "" : text(student.externalStudentId, 100),
  };
}

function attemptPaper(attempt, exam) {
  return normalizePaper(attempt?.source || exam?.source || "");
}

export function convertLegacyDatabase(database, { createId = () => crypto.randomUUID() } = {}) {
  if (!database || typeof database !== "object" || Array.isArray(database)) {
    throw new Error("这不是可以读取的成绩文件");
  }
  const exams = Array.isArray(database.exams) ? database.exams : [];
  const attempts = Array.isArray(database.attempts) ? database.attempts : [];
  const studentsIn = Array.isArray(database.students) ? database.students : [];
  const examById = new Map(exams.filter((exam) => exam && exam.id).map((exam) => [exam.id, exam]));
  const students = studentsIn.map(copyStudent);
  const groups = new Map();

  attempts.forEach((attempt, index) => {
    if (!attempt || typeof attempt !== "object") return;
    const exam = examById.get(attempt.examId) || {};
    const date = text(attempt.date || exam.date, 10);
    const level = text(attempt.exam || exam.exam, 20);
    const kind = text(attempt.kind || exam.kind, 20) || "practice";
    const paper = attemptPaper(attempt, exam);
    const key = JSON.stringify([date, level, kind, paper]);
    if (!groups.has(key)) {
      groups.set(key, {
        date,
        level,
        kind,
        paper,
        legacyExamIds: [],
        partEvidence: [],
        attempts: [],
      });
    }
    const group = groups.get(key);
    if (attempt.examId && !group.legacyExamIds.includes(attempt.examId)) group.legacyExamIds.push(attempt.examId);
    if (Array.isArray(exam.partEvidence)) {
      for (const evidence of exam.partEvidence) {
        if (evidence && !group.partEvidence.some((item) => item?.id === evidence.id)) group.partEvidence.push(evidence);
      }
    }
    group.attempts.push({ attempt, index });
  });

  const sittings = [];
  const results = [];
  for (const group of groups.values()) {
    const buckets = [];
    for (const item of group.attempts) {
      const studentId = item.attempt.studentId;
      let bucket = [...buckets].reverse().find((candidate) => !candidate.studentIds.has(studentId));
      if (!bucket) {
        bucket = { studentIds: new Set(), attempts: [] };
        buckets.push(bucket);
      }
      bucket.studentIds.add(studentId);
      bucket.attempts.push(item);
    }
    buckets.forEach((bucket, bucketIndex) => {
      const sittingId = createId();
      const paper = group.paper;
      const split = buckets.length > 1;
      sittings.push({
        id: sittingId,
        date: group.date,
        level: group.level,
        kind: group.kind,
        paper,
        legacyExamIds: group.legacyExamIds,
        partEvidence: bucketIndex === 0 ? group.partEvidence : [],
        splitFromSamePaper: split,
        splitKey: split ? [...bucket.studentIds].sort().join("|") : "",
      });
      for (const item of bucket.attempts) {
        const attempt = item.attempt;
        results.push({
          id: text(attempt.id, 150) || createId(),
          sittingId,
          studentId: attempt.studentId,
          status: attempt.status === "absent" ? "absent" : "recorded",
          scores: attempt.scores && typeof attempt.scores === "object" && !Array.isArray(attempt.scores) ? { ...attempt.scores } : {},
          gradeAtExam: text(attempt.gradeAtExam, 80),
          classAtExam: text(attempt.classAtExam, 80),
          setAtExam: text(attempt.setAtExam, 80),
          recordMeta: attempt.recordMeta && typeof attempt.recordMeta === "object" ? attempt.recordMeta : null,
        });
      }
    });
  }

  return {
    students,
    sittings,
    results,
    profile: null,
    identityAliases: database.identityAliases && typeof database.identityAliases === "object" ? database.identityAliases : {},
  };
}

export function parseImportJson(payload) {
  let data = payload;
  if (typeof payload === "string") {
    if (payload.length > 40 * 1024 * 1024) throw new Error("文件超过 40 MB");
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error("这不是有效的 JSON 文件");
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("文件内容无法识别");
  if (data.format === "cambridge-score-workspace" && data.schemaVersion === 2 && data.data) {
    return { kind: "v2", workspace: data.data };
  }
  if (data.format === "cambridge-local" && data.schemaVersion === 1 && data.data && ["backup", "coordinator"].includes(String(data.purpose))) {
    return { kind: "legacy", converted: convertLegacyDatabase(data.data) };
  }
  if (data.schemaVersion === 1 && (Array.isArray(data.students) || Array.isArray(data.attempts) || Array.isArray(data.exams))) {
    return { kind: "legacy", converted: convertLegacyDatabase(data) };
  }
  if (data.schemaVersion === 2 && Array.isArray(data.students) && Array.isArray(data.sittings)) {
    return { kind: "v2", workspace: data };
  }
  throw new Error("这不是本程序或旧版导出的成绩文件");
}

function norm(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function findStudent(students, incoming) {
  const external = text(incoming.externalStudentId, 100);
  if (external) {
    const hits = students.filter((student) => text(student.externalStudentId, 100) === external);
    if (hits.length >= 1) return hits[0];
  }
  const name = norm(incoming.name);
  const setName = norm(incoming.setName);
  if (!name) return null;
  const byNameAndSet = students.filter((student) => norm(student.name) === name && norm(student.setName) === setName);
  if (byNameAndSet.length === 1) return byNameAndSet[0];
  const byName = students.filter((student) => norm(student.name) === name);
  if (byName.length === 1) return byName[0];
  return null;
}

function sameScores(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

export function emptyWorkspace() {
  return { schemaVersion: 2, students: [], sittings: [], results: [], followUps: [], prefs: {}, profile: null };
}

export function mergeConverted(workspace, converted) {
  const next = {
    schemaVersion: 2,
    students: workspace.students.map((student) => ({ ...student })),
    sittings: workspace.sittings.map((sitting) => ({ ...sitting })),
    results: workspace.results.map((result) => ({ ...result })),
    followUps: [...(workspace.followUps || [])],
    prefs: { ...(workspace.prefs || {}) },
    profile: workspace.profile || converted.profile || null,
  };
  const summary = { studentsAdded: 0, sittingsAdded: 0, resultsAdded: 0, resultsSkipped: 0 };
  const idMap = new Map();
  for (const incoming of converted.students) {
    const found = findStudent(next.students, incoming);
    if (found) {
      idMap.set(incoming.id, found.id);
      if (!found.externalStudentId && incoming.externalStudentId) found.externalStudentId = incoming.externalStudentId;
      if (!found.setName && incoming.setName) found.setName = incoming.setName;
      if (!found.className && incoming.className) found.className = incoming.className;
      if (!found.grade && incoming.grade) found.grade = incoming.grade;
      continue;
    }
    const id = next.students.some((student) => student.id === incoming.id) ? crypto.randomUUID() : incoming.id;
    idMap.set(incoming.id, id);
    next.students.push({ ...incoming, id });
    summary.studentsAdded += 1;
  }
  const sittingMap = new Map();
  for (const incoming of converted.sittings) {
    const key = sittingKey(incoming);
    const found = next.sittings.find((sitting) => sittingKey(sitting) === key);
    if (found) {
      sittingMap.set(incoming.id, found.id);
      continue;
    }
    const id = next.sittings.some((sitting) => sitting.id === incoming.id) ? crypto.randomUUID() : incoming.id;
    sittingMap.set(incoming.id, id);
    next.sittings.push({ ...incoming, id });
    summary.sittingsAdded += 1;
  }
  for (const incoming of converted.results) {
    const sittingId = sittingMap.get(incoming.sittingId);
    const studentId = idMap.get(incoming.studentId) || incoming.studentId;
    if (!sittingId || !next.students.some((student) => student.id === studentId)) {
      summary.resultsSkipped += 1;
      continue;
    }
    const existing = next.results.find((result) => result.sittingId === sittingId && result.studentId === studentId);
    if (existing) {
      if (!sameScores(existing.scores, incoming.scores) || existing.status !== incoming.status) summary.resultsSkipped += 1;
      continue;
    }
    next.results.push({ ...incoming, id: next.results.some((result) => result.id === incoming.id) ? crypto.randomUUID() : incoming.id, sittingId, studentId });
    summary.resultsAdded += 1;
  }
  for (const item of converted.followUps || []) {
    if (item && !next.followUps.some((existing) => existing.id === item.id)) next.followUps.push(item);
  }
  return { workspace: next, summary };
}

export function workspaceFromV2(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    schemaVersion: 2,
    students: Array.isArray(source.students) ? source.students.map(copyStudent) : [],
    sittings: Array.isArray(source.sittings)
      ? source.sittings.map((sitting) => ({
          id: text(sitting.id, 150) || crypto.randomUUID(),
          date: text(sitting.date, 10),
          level: text(sitting.level, 20),
          kind: text(sitting.kind, 20) || "practice",
          paper: normalizePaper(sitting.paper),
          legacyExamIds: Array.isArray(sitting.legacyExamIds) ? sitting.legacyExamIds : [],
          partEvidence: Array.isArray(sitting.partEvidence) ? sitting.partEvidence : [],
          splitFromSamePaper: !!sitting.splitFromSamePaper,
          splitKey: text(sitting.splitKey, 2000),
        }))
      : [],
    results: Array.isArray(source.results)
      ? source.results.map((result) => ({
          id: text(result.id, 150) || crypto.randomUUID(),
          sittingId: result.sittingId,
          studentId: result.studentId,
          status: result.status === "absent" ? "absent" : "recorded",
          scores: result.scores && typeof result.scores === "object" && !Array.isArray(result.scores) ? { ...result.scores } : {},
          gradeAtExam: text(result.gradeAtExam, 80),
          classAtExam: text(result.classAtExam, 80),
          setAtExam: text(result.setAtExam, 80),
          recordMeta: result.recordMeta && typeof result.recordMeta === "object" ? result.recordMeta : null,
        }))
      : [],
    followUps: Array.isArray(source.followUps) ? source.followUps.map(copyFollowUp).filter(Boolean) : [],
    prefs: source.prefs && typeof source.prefs === "object" ? { ...source.prefs } : {},
    profile: source.profile && typeof source.profile === "object" ? { ...source.profile } : null,
  };
}

function copyFollowUp(item) {
  if (!item || typeof item !== "object") return null;
  const observation = text(item.observation, 80);
  const nextCheck = text(item.nextCheck, 80);
  if (!observation && !nextCheck) return null;
  return {
    id: text(item.id, 150) || crypto.randomUUID(),
    className: text(item.className, 80),
    level: text(item.level, 20),
    kind: text(item.kind, 20) || "practice",
    partId: text(item.partId, 80),
    label: text(item.label, 80),
    observation,
    nextCheck,
    createdAt: text(item.createdAt, 40),
  };
}

export function exportEnvelope(workspace) {
  return {
    format: "cambridge-score-workspace",
    schemaVersion: 2,
    purpose: "backup",
    exportedAt: new Date().toISOString(),
    data: workspace,
  };
}

export function readOldProfile(storage) {
  try {
    const raw = storage.getItem(OLD_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      customTitle: text(parsed.customTitle, 60),
      grade: text(parsed.grade, 30),
      teacherName: text(parsed.teacherName, 60),
      academicYear: text(parsed.academicYear, 30),
      sets: text(parsed.sets, 120),
    };
  } catch {
    return null;
  }
}

export function readOldDatabase(storage) {
  const raw = storage.getItem(OLD_DATABASE_KEY);
  if (raw == null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("旧版数据读出来不是有效的文件，没有改动任何数据");
  }
  return parsed;
}
