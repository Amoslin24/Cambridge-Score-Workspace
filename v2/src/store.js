import {
  NEW_DATABASE_KEY,
  OLD_DATABASE_KEY,
  UNTOUCHED_KEYS,
  convertLegacyDatabase,
  emptyWorkspace,
  exportEnvelope,
  mergeConverted,
  parseImportJson,
  readOldDatabase,
  readOldProfile,
  workspaceFromV2,
} from "./legacy.js";

function assertWritable(key) {
  if (key !== NEW_DATABASE_KEY || UNTOUCHED_KEYS.includes(key)) {
    throw new Error("不能写入旧版数据");
  }
}

export function loadWorkspace(storage) {
  const raw = storage.getItem(NEW_DATABASE_KEY);
  if (!raw) return emptyWorkspace();
  try {
    return workspaceFromV2(JSON.parse(raw));
  } catch {
    throw new Error("新版成绩读不出来。请先下载备份，不要清除浏览器数据。");
  }
}

export function saveWorkspace(storage, workspace) {
  assertWritable(NEW_DATABASE_KEY);
  const payload = JSON.stringify({ ...workspace, schemaVersion: 2 });
  storage.setItem(NEW_DATABASE_KEY, payload);
}

export function oldDataSummary(storage) {
  let raw = null;
  try {
    raw = storage.getItem(OLD_DATABASE_KEY);
  } catch {
    return { present: false, broken: true, students: 0, attempts: 0 };
  }
  if (raw == null) return { present: false, broken: false, students: 0, attempts: 0 };
  try {
    const parsed = JSON.parse(raw);
    return {
      present: true,
      broken: false,
      students: Array.isArray(parsed?.students) ? parsed.students.length : 0,
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts.length : 0,
    };
  } catch {
    return { present: true, broken: true, students: 0, attempts: 0 };
  }
}

export function importOldDatabase(storage) {
  const database = readOldDatabase(storage);
  if (!database) return { workspace: loadWorkspace(storage), summary: null, empty: true };
  const converted = convertLegacyDatabase(database);
  converted.profile = readOldProfile(storage);
  if (!converted.students.length && !converted.results.length) {
    return { workspace: loadWorkspace(storage), summary: { studentsAdded: 0, sittingsAdded: 0, resultsAdded: 0, resultsSkipped: 0 }, empty: true };
  }
  const current = safeCurrent(storage);
  const merged = mergeConverted(current, converted);
  if (!merged.workspace.profile && converted.profile) merged.workspace.profile = converted.profile;
  saveWorkspace(storage, merged.workspace);
  return { ...merged, empty: false };
}

export function importBackupText(storage, text) {
  const parsed = parseImportJson(text);
  const current = safeCurrent(storage);
  const converted = parsed.kind === "legacy" ? parsed.converted : workspaceFromV2(parsed.workspace);
  const merged = mergeConverted(current, converted);
  saveWorkspace(storage, merged.workspace);
  return merged;
}

function safeCurrent(storage) {
  try {
    return loadWorkspace(storage);
  } catch {
    return emptyWorkspace();
  }
}

export function backupText(workspace) {
  return JSON.stringify(exportEnvelope(workspace), null, 2);
}

export { NEW_DATABASE_KEY, UNTOUCHED_KEYS };
