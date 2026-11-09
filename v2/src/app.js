import {
  canCompare,
  classReport,
  classSkillSeries,
  deltaPhrase,
  formatDate,
  formatNumber,
  previousComparableSitting,
  resultMetrics,
  seriesDelta,
  sittingTitle,
  skillSummary,
  studentSentence,
  studentSkillSeries,
} from "./analysis.js";
import { classAttention, cohortCompare, evidenceLine, judgeItems, laterFollowUp, partSnapshots, RULE_LINES } from "./attention.js";
import { normalizePaper } from "./legacy.js";
import { applyScorePaste, namesFromPaste, parseScoreText } from "./paste.js";
import {
  LEVELS,
  LEVEL_LABEL,
  MODE_FLAGS,
  SCALE_RANGE,
  SKILL_LABEL,
  entryColumns,
  inferMode,
  isYle,
  levelLabel,
  modeFlags,
  validateScores,
} from "./scoring.js";
import { backupText, importBackupText, importOldDatabase, loadWorkspace, oldDataSummary, saveWorkspace } from "./store.js";

const app = document.querySelector("#app");
let workspace = loadOrEmpty();
let storageError = "";
let entryDraft = null;
let compareSelection = { left: "", right: "" };
let trendSelection = { level: "", kind: "", skillId: "", studentId: "" };
let rosterMessage = "";

function loadOrEmpty() {
  try {
    return loadWorkspace(localStorage);
  } catch (error) {
    storageError = error.message;
    return { schemaVersion: 2, students: [], sittings: [], results: [], prefs: {}, profile: null };
  }
}

function persist() {
  try {
    saveWorkspace(localStorage, workspace);
    storageError = "";
  } catch (error) {
    storageError = error instanceof Error ? error.message : "保存失败";
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "line", "text", "circle", "polyline", "g", "rect", "path"]);

function h(tag, attrs = {}, ...children) {
  const node = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  let value = null;
  let hasValue = false;
  let checked = null;
  let hasChecked = false;
  for (const [key, item] of Object.entries(attrs)) {
    if (item == null || item === false) continue;
    if (key === "class") node.setAttribute("class", item);
    else if (key === "dataset") Object.assign(node.dataset, item);
    else if (key.startsWith("on") && typeof item === "function") node.addEventListener(key.slice(2).toLowerCase(), item);
    else if (key === "value") {
      value = item;
      hasValue = true;
    } else if (key === "checked") {
      checked = item !== false && item != null;
      hasChecked = true;
    } else node.setAttribute(key, item === true ? "" : String(item));
  }
  for (const child of children) append(node, child);
  if (hasValue && "value" in node) node.value = value == null ? "" : String(value);
  if (hasChecked) node.checked = checked;
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((item) => append(node, item));
    return;
  }
  node.append(child.nodeType ? child : document.createTextNode(String(child)));
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { page: parts[0] || "home", id: parts[1] || "", params: new URLSearchParams(query) };
}

function go(hash) {
  if (location.hash !== hash) location.hash = hash;
  render();
}

function classes() {
  return [...new Set(workspace.students.map((student) => student.setName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh"));
}

function sortedStudents() {
  return [...workspace.students].sort((a, b) => a.name.localeCompare(b.name, "zh") || a.setName.localeCompare(b.setName, "zh"));
}

function visibleStudents(setName) {
  const students = sortedStudents();
  return setName ? students.filter((student) => student.setName === setName) : students;
}

function sittingsByDate() {
  return [...workspace.sittings].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""));
}

function findSitting(id) {
  return workspace.sittings.find((sitting) => sitting.id === id) || null;
}

function resultsFor(sittingId) {
  return workspace.results.filter((result) => result.sittingId === sittingId);
}

function shell(body, { wide = false } = {}) {
  const title = workspace.profile?.customTitle || workspace.profile?.teacherName || "";
  app.replaceChildren(
    h("header", { class: "top" },
      h("a", { href: "#/" }, "先看什么"),
      h("nav", { class: "top-links" }, h("a", { href: "#/entry" }, "记分"), h("a", { href: "#/students" }, "名单"), h("a", { href: "#/backup" }, "备份")),
      title ? h("span", {}, title) : null,
    ),
    h("main", { class: wide ? "wrap wide" : "wrap" }, storageError ? h("div", { class: "alert", role: "alert" }, storageError) : null, body),
  );
}

function buttonLink(hash, className, text) {
  return h("a", { class: className, href: hash }, text);
}

function selectedClass() {
  if (workspace.prefs?.classAll) return "";
  const names = classes();
  const preferred = workspace.prefs?.setName || "";
  if (preferred && names.includes(preferred)) return preferred;
  return names.length === 1 ? names[0] : "";
}

function renderHome() {
  const names = classes();
  const selected = selectedClass();
  const students = visibleStudents(selected);
  const old = oldDataSummary(localStorage);
  if (!workspace.students.length) {
    shell(h("div", {},
      h("h1", {}, "先看什么"),
      h("p", { class: "lead" }, "还没有学生，所以还没有可看的问题。先把名单加上。"),
      buttonLink("#/students", "btn", "添加学生"),
      old.present && !old.broken && (old.students || old.attempts) ? h("button", { class: "btn-secondary", type: "button", onClick: importOld }, "从旧版导入") : null,
      old.present ? h("p", { class: "hint" }, "从旧版导入只读取，不会修改旧版。") : null,
      rosterMessage ? h("div", { class: "note" }, rosterMessage) : null,
    ));
    return;
  }
  const attention = classAttention({ students, sittings: workspace.sittings, results: workspace.results });
  shell(h("div", {},
    h("h1", {}, selected ? `${selected}先看什么` : "先看什么"),
    h("p", { class: "lead" }, "先选班。下面最多三条：哪一项这次偏低、涉及谁、分数是什么。点进去再看趋势。"),
    names.length ? h("div", {}, h("label", { for: "home-class" }, "哪个班"), h("select", { id: "home-class", value: selected, onChange: (event) => { workspace.prefs = { ...(workspace.prefs || {}), setName: event.target.value, classAll: event.target.value === "" }; persist(); render(); } }, [h("option", { value: "" }, "全部学生"), ...names.map((name) => h("option", { value: name }, name))])) : null,
    rosterMessage ? h("div", { class: "note" }, rosterMessage) : null,
    attention.items.length ? h("div", { class: "exam-list section" }, attention.items.map((item) => h("a", { href: attentionHref(item, selected) },
      h("strong", {}, `${item.repeated ? "再次出现" : "一次信号"} · ${item.label}`),
      h("div", {}, evidenceLine(item)),
      h("div", { class: "meta" }, item.repeated ? `同一级别的练习里，这项已经出现 ${item.hitCount} 次。` : "目前只在一场里达到这条线。"),
      h("div", {}, item.affected.length ? `不高于班均：${item.affected.map((student) => student.name).join("、")}` : `有分的 ${item.n} 人正确率一样。`),
    ))) : h("div", { class: "card" }, h("p", {}, "现在没有达到「偏低」标准的部分。人数不够，或各项正确率差不多时，这里不会硬指一项。")),
    h("details", { class: "section" }, h("summary", {}, "这些判断用的规则"), RULE_LINES.map((line) => h("p", { class: "hint" }, line))),
    h("div", { class: "btn-row section" },
      buttonLink("#/entry", "btn", "录入这次考试"),
      buttonLink("#/students", "btn-quiet", "名单"),
      buttonLink("#/backup", "btn-quiet", "备份"),
      buttonLink("#/results", "btn-quiet", "各场成绩"),
    ),
  ));
}

function attentionHref(item, className) {
  const params = new URLSearchParams({ part: item.partId, level: item.level, kind: item.kind, class: className || "" });
  return `#/attention?${params}`;
}

function addStudents(names, setName) {
  const classroom = setName.trim();
  let added = 0;
  let skipped = 0;
  for (const name of names) {
    const exists = workspace.students.some((student) => student.name.trim() === name && student.setName === classroom);
    if (exists) {
      skipped += 1;
      continue;
    }
    workspace.students.push({ id: crypto.randomUUID(), name, className: "", setName: classroom, grade: "", externalStudentId: "" });
    added += 1;
  }
  workspace.prefs = { ...(workspace.prefs || {}), setName: classroom };
  persist();
  rosterMessage = added ? `已添加 ${added} 人。${skipped ? `跳过 ${skipped} 个重复姓名。` : ""}下一步：录入这次考试。` : "这些姓名已经在名单里。";
  render();
  document.querySelector("#student-name")?.focus();
}

function renderStudents() {
  const prefs = workspace.prefs || {};
  const nameInput = h("input", { id: "student-name", type: "text", maxlength: "80", autocomplete: "off", placeholder: "学生姓名" });
  const classInput = h("input", { id: "student-class", type: "text", maxlength: "80", value: prefs.setName || "", placeholder: "例如 A1，可以空着" });
  nameInput.addEventListener("paste", (event) => {
    const parsed = namesFromPaste(event.clipboardData.getData("text"));
    if (parsed.error || parsed.single || parsed.names.length < 2) return;
    event.preventDefault();
    addStudents(parsed.names, classInput.value);
  });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    addStudents([name], classInput.value);
  });
  const list = sortedStudents().map((student) =>
    h("div", { class: "person" },
      h("strong", {}, student.name),
      h("div", { class: "meta" }, [student.setName ? `教学班 ${student.setName}` : "未分班", student.className ? ` · 行政班 ${student.className}` : "", student.externalStudentId ? ` · 学号 ${student.externalStudentId}` : ""].join("")),
      h("div", { class: "btn-row" },
        h("a", { href: `#/student/${student.id}` }, "看进步"),
        h("button", { class: "btn-quiet", type: "button", onClick: () => editStudent(student) }, "修改"),
        h("button", { class: "btn-quiet", type: "button", onClick: () => deleteStudent(student) }, "删除"),
      ),
    ),
  );
  shell(h("div", {},
    h("a", { class: "back", href: "#/" }, "返回"),
    h("h1", {}, "学生名单"),
    h("p", { class: "lead" }, workspace.students.length ? "还要加人，就写在下面。可以从 Excel 粘贴一整列姓名。" : "写下姓名后按回车。教学班填你上课的那一组，例如 A1。"),
    rosterMessage ? h("div", { class: "note" }, rosterMessage) : null,
    h("div", { class: "card fields" },
      h("div", {}, h("label", { class: "req", for: "student-name" }, "姓名"), nameInput),
      h("div", {}, h("label", { for: "student-class" }, "教学班"), classInput, h("span", { class: "hint" }, "同一组会排在一起。不是考试级别。")),
    ),
    workspace.students.length ? h("p", {}, buttonLink("#/entry", "btn", "下一步：录入这次考试")) : null,
    h("div", { class: "exam-list section" }, list),
  ));
}

function editStudent(student) {
  const name = prompt("姓名", student.name);
  if (name == null) return;
  const setName = prompt("教学班，例如 A1。可以空着。", student.setName || "");
  if (setName == null) return;
  if (!name.trim()) return;
  student.name = name.trim();
  student.setName = setName.trim();
  persist();
  render();
}

function deleteStudent(student) {
  if (!confirm(`删除${student.name}和这个学生的全部成绩？`)) return;
  workspace.students = workspace.students.filter((item) => item.id !== student.id);
  workspace.results = workspace.results.filter((result) => result.studentId !== student.id);
  persist();
  render();
}

function blankDraft(sitting) {
  const prefs = workspace.prefs || {};
  const onlyClass = classes().length === 1 ? classes()[0] : "";
  const draft = {
    date: sitting?.date || new Date().toISOString().slice(0, 10),
    level: sitting?.level || prefs.level || "A2",
    kind: sitting?.kind === "classroom" ? "classroom" : sitting?.kind || prefs.kind || "practice",
    paper: sitting?.paper || prefs.paper || "",
    setName: prefs.setName || onlyClass,
    includeSpeaking: !!prefs.includeSpeaking,
    visibleGroup: "",
    groupChosen: false,
    rows: {},
    dirty: false,
    loadedFrom: "",
    message: "",
  };
  if (sitting) fillDraft(draft, sitting);
  return draft;
}

function fillDraft(draft, sitting) {
  draft.loadedFrom = sitting.id;
  draft.rows = {};
  const scores = [];
  for (const result of resultsFor(sitting.id)) {
    const values = {};
    for (const [key, value] of Object.entries(result.scores || {})) {
      if (typeof value === "number" && !MODE_FLAGS.includes(key)) values[key] = String(value);
    }
    if (Object.keys(values).some((key) => key.startsWith("s_"))) draft.includeSpeaking = true;
    draft.rows[result.studentId] = { absent: result.status === "absent", values };
    scores.push(result.scores || {});
  }
  draft.modeHint = scores;
}

function matchingSitting(draft) {
  const paper = normalizePaper(draft.paper);
  return workspace.sittings.find((sitting) => !sitting.splitFromSamePaper && sitting.date === draft.date && sitting.level === draft.level && sitting.kind === draft.kind && normalizePaper(sitting.paper) === paper) || null;
}

function ensureDraft() {
  if (entryDraft) return entryDraft;
  const requested = parseRoute().params.get("id");
  entryDraft = blankDraft(requested ? findSitting(requested) : null);
  return entryDraft;
}

function rowOf(draft, studentId) {
  if (!draft.rows[studentId]) draft.rows[studentId] = { absent: false, values: {} };
  return draft.rows[studentId];
}

function renderEntry() {
  if (!workspace.students.length) {
    shell(h("div", {}, h("h1", {}, "还没有学生"), h("p", { class: "lead" }, "先添加学生，再记成绩。"), buttonLink("#/students", "btn", "添加学生")));
    return;
  }
  const draft = ensureDraft();
  const match = matchingSitting(draft);
  if (!draft.dirty && match && draft.loadedFrom !== match.id) fillDraft(draft, match);
  if (!draft.dirty && !match && draft.loadedFrom) {
    draft.rows = {};
    draft.loadedFrom = "";
  }
  const existingScores = match ? resultsFor(match.id).map((result) => result.scores) : draft.modeHint || [];
  const mode = inferMode(draft.level, draft.kind, existingScores.length ? existingScores : [{}]);
  const showSpeakingToggle = !isYle(draft.level) && draft.kind !== "official" && mode !== "official-combined";
  const columns = entryColumns(draft.level, draft.kind, mode, { includeSpeaking: draft.includeSpeaking || !showSpeakingToggle });
  const students = visibleStudents(draft.setName);
  const groups = [];
  for (const column of columns) {
    const last = groups.at(-1);
    if (!last || last.id !== column.groupId) groups.push({ id: column.groupId, label: column.group, columns: [column] });
    else last.columns.push(column);
  }
  if (!draft.groupChosen && window.innerWidth < 1000 && groups[0]) {
    draft.visibleGroup = groups[0].id;
    draft.groupChosen = true;
  }
  const shownGroups = draft.visibleGroup ? groups.filter((group) => group.id === draft.visibleGroup) : groups;
  const classOptions = ["", ...classes()];
  shell(h("div", {},
    h("a", { class: "back", href: "#/" }, "返回"),
    h("h1", {}, "录入这次考试"),
    h("p", { class: "lead" }, "一行一个学生。带 * 的要填。Tab 到下一格，Enter 到下一行。可以从 Excel 整块粘贴。"),
    draft.message ? h("div", { class: "alert", role: "alert" }, draft.message) : null,
    h("div", { class: "note", id: "match-note" }, matchNote(draft)),
    h("div", { class: "card fields" },
      h("div", {}, h("label", { class: "req", for: "exam-date" }, "考试日期"), h("input", { id: "exam-date", type: "date", value: draft.date, onInput: (event) => { draft.date = event.target.value; refreshMatchNote(draft); } })),
      h("div", {}, h("label", { for: "exam-level" }, "级别"), h("select", { id: "exam-level", value: draft.level, onChange: (event) => changeLevel(draft, event) }, LEVELS.map((level) => h("option", { value: level }, LEVEL_LABEL[level])))),
      h("div", {}, h("label", {}, "这一次是"), h("div", { class: "choice" }, ["practice", "official"].map((kind) => h("button", { type: "button", "aria-pressed": String(draft.kind === kind), onClick: () => changeKind(draft, kind) }, kind === "practice" ? "练习" : "正式考试"))), h("span", { class: "hint" }, draft.kind === "official" ? (isYle(draft.level) ? "填写 1–5 盾。" : `填写标准分，${LEVEL_LABEL[draft.level]} 一般在 ${SCALE_RANGE[draft.level].min}–${SCALE_RANGE[draft.level].max}。`) : "填写每一部分的得分。")),
      h("div", {}, h("label", { for: "exam-paper" }, "试卷"), h("input", { id: "exam-paper", type: "text", maxlength: "80", value: draft.paper, placeholder: "例如 真题1", onInput: (event) => { draft.paper = event.target.value; refreshMatchNote(draft); } }), h("span", { class: "hint" }, "同一天、同一级别、同一份试卷，会记成一场。")),
      classes().length ? h("div", {}, h("label", { for: "exam-class" }, "哪个班"), h("select", { id: "exam-class", value: draft.setName, onChange: (event) => { draft.setName = event.target.value; render(); } }, classOptions.map((name) => h("option", { value: name }, name || "全部学生"))), h("span", { class: "hint" }, "教学班是你上课的那一组，例如 A1。")) : null,
      showSpeakingToggle ? h("div", { class: "full" }, h("label", { class: "check" }, h("input", { type: "checkbox", checked: draft.includeSpeaking ? "checked" : null, onChange: (event) => { draft.includeSpeaking = event.target.checked; render(); } }), "这次也记口语")) : null,
    ),
    h("div", { class: "tabs", role: "tablist" },
      h("button", { type: "button", "aria-pressed": String(!draft.visibleGroup), onClick: () => { draft.visibleGroup = ""; draft.groupChosen = true; render(); } }, "全部"),
      groups.map((group) => h("button", { type: "button", "aria-pressed": String(draft.visibleGroup === group.id), onClick: () => { draft.visibleGroup = group.id; draft.groupChosen = true; render(); } }, group.label)),
    ),
    h("div", { class: "scroll-controls" },
      h("button", { class: "btn-quiet", type: "button", onClick: () => document.querySelector("#score-scroll")?.scrollBy({ left: -260, behavior: "smooth" }) }, "← 向左"),
      h("span", { class: "hint" }, "姓名固定在左边。点项目，或左右滑动，看其余部分。"),
      h("button", { class: "btn-quiet", type: "button", onClick: () => document.querySelector("#score-scroll")?.scrollBy({ left: 260, behavior: "smooth" }) }, "向右 →"),
    ),
    h("div", { class: "scroll section", id: "score-scroll" }, scoreTable(draft, students, shownGroups.length ? shownGroups : groups)),
    h("p", { class: "hint" }, "空着的学生不会保存，空着也不算 0 分。勾选缺考的学生会记为缺考。"),
    h("p", {}, h("button", { class: "btn", type: "button", onClick: () => saveEntry(draft, columns, mode, students) }, "保存这次成绩")),
  ), { wide: true });
}

function matchNote(draft) {
  const match = matchingSitting(draft);
  if (!match) return "新的一场。同一天、同一级别、同一份试卷会记在一起。";
  return `这场已经有 ${resultsFor(match.id).length} 人。保存后会更新下面填了分数的学生。`;
}

function refreshMatchNote(draft) {
  const note = document.querySelector("#match-note");
  if (note) note.textContent = matchNote(draft);
}

function changeLevel(draft, event) {
  const next = event.target.value;
  if (next === draft.level) return;
  if (draft.dirty && !confirm("换级别后，还没保存的格子会清掉。")) {
    event.target.value = draft.level;
    return;
  }
  draft.level = next;
  draft.dirty = false;
  draft.rows = {};
  draft.loadedFrom = "";
  render();
}

function changeKind(draft, kind) {
  if (draft.kind === kind) return;
  if (draft.dirty && !confirm("练习和正式考试填的不是同一类分数。换过去后，还没保存的格子会清掉。")) return;
  draft.kind = kind;
  draft.dirty = false;
  draft.loadedFrom = "";
  draft.rows = {};
  render();
}

function scoreTable(draft, students, groups) {
  let columnIndex = 0;
  const headGroups = [h("th", { class: "sticky", rowspan: "2" }, "学生")];
  const headParts = [];
  for (const group of groups) {
    headGroups.push(h("th", { colspan: String(group.columns.length) }, group.label));
    for (const column of group.columns) {
      const index = columnIndex++;
      headParts.push(h("th", {}, column.label, column.role === "max" || column.max >= 1000 ? null : h("div", { class: "meta" }, `满分 ${column.max}`)));
      column._index = index;
    }
  }
  headGroups.push(h("th", { rowspan: "2" }, "缺考"));
  return h("table", { class: "score-table" },
    h("thead", {}, h("tr", {}, headGroups), h("tr", {}, headParts)),
    h("tbody", { onPaste: (event) => pasteScores(event, draft, students, groups.flatMap((group) => group.columns)) },
      students.map((student, rowIndex) => {
        const row = rowOf(draft, student.id);
        return h("tr", {},
          h("th", { class: "sticky" }, student.name, student.setName && !draft.setName ? h("div", { class: "meta" }, student.setName) : null),
          groups.flatMap((group) => group.columns).map((column) => h("td", {}, h("input", {
            class: "score",
            type: "text",
            inputmode: "decimal",
            "aria-label": `${student.name} ${column.label}`,
            dataset: { row: String(rowIndex), col: String(column._index) },
            value: row.values[column.id] || "",
            disabled: row.absent ? "disabled" : null,
            onInput: (event) => {
              const row = rowOf(draft, student.id);
              row.values[column.id] = event.target.value;
              row.touched = true;
              draft.dirty = true;
            },
            onKeydown: (event) => moveCell(event, rowIndex, column._index, students.length),
          }))),
          h("td", {}, h("input", {
            type: "checkbox",
            "aria-label": `${student.name} 缺考`,
            checked: row.absent,
            onChange: (event) => {
              const row = rowOf(draft, student.id);
              row.absent = event.target.checked;
              row.touched = true;
              draft.dirty = true;
              render();
            },
          })),
        );
      }),
    ),
  );
}

function moveCell(event, row, col, rowCount) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const next = document.querySelector(`[data-row="${row + 1}"][data-col="${col}"]`);
  if (next) next.focus();
  else if (row + 1 >= rowCount) document.querySelector(".btn")?.focus();
}

function pasteScores(event, draft, students, columns) {
  const text = event.clipboardData?.getData("text") || "";
  if (!text.includes("\t") && !text.includes("\n")) return;
  event.preventDefault();
  const startRow = Number(event.target?.dataset?.row || 0);
  const startCol = Number(event.target?.dataset?.col || 0);
  const applied = applyScorePaste({ text, students, columns, startRow, startCol });
  for (const change of applied.changes) {
    const row = rowOf(draft, change.studentId);
    row.touched = true;
    if (change.clear) delete row.values[change.columnId];
    else row.values[change.columnId] = change.text;
  }
  draft.dirty = true;
  draft.message = applied.notes.join(" ");
  render();
}

function saveEntry(draft, columns, mode, students) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    draft.message = "请填写考试日期。";
    render();
    return;
  }
  const messages = [];
  const writes = [];
  const removals = new Set();
  for (const student of students) {
    const row = draft.rows[student.id] || { absent: false, values: {} };
    const previous = resultsFor(matchingSitting(draft)?.id || "").find((result) => result.studentId === student.id);
    if (row.absent) {
      writes.push({ student, status: "absent", scores: modeFlags(mode) });
      continue;
    }
    const scores = { ...(previous?.scores || {}) };
    let any = false;
    for (const column of columns) {
      const text = (row.values[column.id] || "").trim();
      if (!text) {
        delete scores[column.id];
        continue;
      }
      const parsed = parseScoreText(text);
      if (parsed.error || parsed.empty) {
        messages.push(`${student.name}的${column.label}请填写数字。`);
        continue;
      }
      scores[column.id] = parsed.value;
      any = true;
    }
    for (const flag of MODE_FLAGS) delete scores[flag];
    Object.assign(scores, modeFlags(mode));
    if (!any) {
      if (previous && row.touched) removals.add(student.id);
      continue;
    }
    const problems = validateScores(draft.level, scores, draft.kind);
    if (problems.length) messages.push(`${student.name}：${problems[0]}`);
    else writes.push({ student, status: "recorded", scores });
  }
  if (messages.length) {
    draft.message = messages.slice(0, 4).join(" ");
    render();
    return;
  }
  if (!writes.length && !removals.size) {
    draft.message = "请至少填写一名学生的成绩，或勾选缺考。";
    render();
    return;
  }
  let sitting = matchingSitting(draft);
  if (!sitting) {
    sitting = {
      id: crypto.randomUUID(),
      date: draft.date,
      level: draft.level,
      kind: draft.kind,
      paper: normalizePaper(draft.paper),
      legacyExamIds: [],
      partEvidence: [],
      splitFromSamePaper: false,
      splitKey: "",
    };
    workspace.sittings.push(sitting);
  } else {
    sitting.paper = normalizePaper(draft.paper);
  }
  for (const studentId of removals) {
    workspace.results = workspace.results.filter((result) => !(result.sittingId === sitting.id && result.studentId === studentId));
  }
  for (const write of writes) {
    const existing = workspace.results.find((result) => result.sittingId === sitting.id && result.studentId === write.student.id);
    if (existing) {
      existing.status = write.status;
      existing.scores = write.scores;
      existing.setAtExam = write.student.setName;
    } else {
      workspace.results.push({
        id: crypto.randomUUID(),
        sittingId: sitting.id,
        studentId: write.student.id,
        status: write.status,
        scores: write.scores,
        gradeAtExam: write.student.grade || "",
        classAtExam: write.student.className || "",
        setAtExam: write.student.setName || "",
        recordMeta: null,
      });
    }
  }
  if (!resultsFor(sitting.id).length) workspace.sittings = workspace.sittings.filter((item) => item.id !== sitting.id);
  workspace.prefs = { ...(workspace.prefs || {}), level: draft.level, kind: draft.kind === "classroom" ? "practice" : draft.kind, paper: draft.paper, setName: draft.setName, includeSpeaking: draft.includeSpeaking };
  persist();
  entryDraft = null;
  go(`#/exam/${sitting.id}`);
}

function skillText(skill) {
  if (!skill) return "—";
  if (skill.unit === "shield") return `${formatNumber(skill.value)} 盾`;
  if (skill.unit === "scale") return `${formatNumber(skill.value)}`;
  if (Number.isFinite(skill.raw) && Number.isFinite(skill.max)) return `${formatNumber(skill.raw)}/${formatNumber(skill.max)}`;
  return formatNumber(skill.value);
}

function renderAttention() {
  const params = parseRoute().params;
  const partId = params.get("part") || "";
  const level = params.get("level") || "";
  const kind = params.get("kind") || "practice";
  const className = params.get("class") || "";
  const students = visibleStudents(className);
  const item = classAttention({ students, sittings: workspace.sittings, results: workspace.results }).items.find((entry) => entry.partId === partId && entry.level === level && entry.kind === kind)
    || classAttention({ students, sittings: workspace.sittings, results: workspace.results }).items[0];
  const history = workspace.sittings
    .filter((sitting) => sitting.level === level && sitting.kind === kind)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = history.map((sitting) => {
    const part = partSnapshots(sitting, workspace.results, students).find((entry) => entry.id === partId);
    const judgement = judgeItems(partSnapshots(sitting, workspace.results, students).filter((entry) => entry.n > 0));
    return { sitting, part, signal: judgement.status === "signal" && judgement.low.some((entry) => entry.id === partId) };
  }).filter((row) => row.part);
  const latest = rows.at(-1);
  const previous = rows.length > 1 ? rows.at(-2) : null;
  const compared = latest && previous ? cohortCompare(previous.sitting, latest.sitting, students, workspace.results, partId, latest.part.max) : null;
  const follow = (workspace.followUps || []).find((entry) => entry.partId === partId && entry.level === level && entry.kind === kind && entry.className === className);
  const later = follow ? laterFollowUp(follow, workspace.sittings, workspace.results, students) : [];
  shell(h("div", {},
    h("a", { class: "back", href: "#/" }, "返回"),
    h("h1", {}, item ? item.label : "这一项"),
    h("p", { class: "takeaway" }, item ? (item.repeated ? `再次出现。${evidenceLine(item)}` : `一次信号，还不是稳定结论。${evidenceLine(item)}`) : "这一项现在没有达到偏低的标准。"),
    h("p", { class: "hint" }, "分数不能说明原因。下面只列出谁的正确率不高于班均，以及各场的分母和人数。"),
    h("div", { class: "scroll" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "日期"), h("th", {}, "试卷"), h("th", {}, "正确率"), h("th", {}, "有分"), h("th", {}, "空着"), h("th", {}, "缺考"), h("th", {}, "这次"))),
      h("tbody", {}, rows.map((row) => h("tr", { class: row.signal ? "weak" : "" },
        h("td", {}, formatDate(row.sitting.date)),
        h("td", {}, row.sitting.paper || "未写名称"),
        h("td", {}, row.part.n ? `${formatNumber(row.part.percent)}%（${formatNumber(row.part.rawAverage)}/${formatNumber(row.part.max)}）` : "—"),
        h("td", {}, String(row.part.n)),
        h("td", {}, String(row.part.blank)),
        h("td", {}, String(row.part.absent)),
        h("td", {}, row.signal ? (rows.filter((entry) => entry.signal).length > 1 ? "再次出现" : "一次信号") : "未拉开"),
      ))),
    )),
    h("h2", { class: "section" }, "不高于班均的学生"),
    item?.affected?.length ? h("div", { class: "exam-list" }, item.affected.map((student) => h("a", { href: `#/student/${student.studentId}` }, h("strong", {}, student.name), h("div", {}, `${formatNumber(student.percent)}%（${formatNumber(student.raw)}/${formatNumber(item.max)}）`)))) : h("p", {}, "有分的人差不多，不单列谁。"),
    compared?.ok ? h("section", { class: "section card" },
      h("h2", {}, "和上场比，只算两次都有分的人"),
      h("p", {}, `上场 ${compared.earlierScored} 人有分，这场 ${compared.laterScored} 人有分，两次都有分的是 ${compared.matchedCount} 人。`),
      compared.onlyLater.length ? h("p", {}, `只在后一场有分：${compared.onlyLater.map((student) => student.name).join("、")}。`) : null,
      compared.onlyEarlier.length ? h("p", {}, `只在前一场有分：${compared.onlyEarlier.map((student) => student.name).join("、")}。`) : null,
      compared.matchedCount ? h("p", {}, Math.abs(compared.delta || 0) < 0.05 ? `两次都有分的这 ${compared.matchedCount} 人，正确率差不多（${formatNumber(compared.laterMean)}%）。` : `这 ${compared.matchedCount} 人的正确率从 ${formatNumber(compared.earlierMean)}% 到 ${formatNumber(compared.laterMean)}%，${compared.delta > 0 ? "高" : "低"} ${formatNumber(Math.abs(compared.delta))} 个百分点。`) : h("p", {}, "没有人两次都有分，所以不算分数差。"),
      h("p", { class: "hint" }, compared.note),
    ) : null,
    h("section", { class: "card section" },
      h("h2", {}, "下次核对（可选）"),
      h("p", { class: "hint" }, "写一句你看到的情况，和一句下次想核对的事。这里不会自动给教学建议。"),
      h("label", { for: "follow-observe" }, "看到的情况"),
      h("input", { id: "follow-observe", type: "text", maxlength: "80", value: follow?.observation || "", placeholder: "例如 这格空着的人不少" }),
      h("label", { for: "follow-next" }, "下次核对"),
      h("input", { id: "follow-next", type: "text", maxlength: "80", value: follow?.nextCheck || "", placeholder: "例如 下次看这一部分是否还偏低" }),
      rosterMessage ? h("div", { class: "note" }, rosterMessage) : null,
      h("p", {}, h("button", { class: "btn", type: "button", onClick: () => saveFollowUp({ partId, level, kind, className, label: item?.label || partId }) }, "记下这句")),
      later.length ? h("div", { class: "note" }, later.map((entry) => `${formatDate(entry.date)} ${entry.paper || ""}：${formatNumber(entry.percent)}%（${entry.n} 人）。${entry.note}`).join(" ")) : null,
    ),
    h("details", {}, h("summary", {}, "规则"), RULE_LINES.map((line) => h("p", { class: "hint" }, line))),
  ));
}

function saveFollowUp({ partId, level, kind, className, label }) {
  const observation = document.querySelector("#follow-observe")?.value.trim().slice(0, 80) || "";
  const nextCheck = document.querySelector("#follow-next")?.value.trim().slice(0, 80) || "";
  workspace.followUps = workspace.followUps || [];
  const same = (entry) => entry.partId === partId && entry.level === level && entry.kind === kind && entry.className === className;
  if (!observation && !nextCheck) workspace.followUps = workspace.followUps.filter((entry) => !same(entry));
  else {
    const existing = workspace.followUps.find(same);
    if (existing) {
      existing.observation = observation;
      existing.nextCheck = nextCheck;
      existing.label = label;
    } else {
      workspace.followUps.push({ id: crypto.randomUUID(), partId, level, kind, className, label, observation, nextCheck, createdAt: new Date().toISOString().slice(0, 10) });
    }
  }
  persist();
  rosterMessage = "已记下。这只是你的备忘，不是诊断。";
  render();
}

function renderExam() {
  const sitting = findSitting(parseRoute().id);
  if (!sitting) {
    shell(h("div", {}, h("h1", {}, "没有这场考试"), buttonLink("#/results", "btn", "返回成绩")));
    return;
  }
  const previous = previousComparableSitting(sitting, workspace.sittings);
  const report = classReport(sitting, workspace.results, previous, workspace.results);
  const students = sortedStudents();
  const parts = partSnapshots(sitting, workspace.results, students).filter((part) => part.n > 0);
  const judgement = judgeItems(parts);
  const signalIds = new Set(judgement.status === "signal" ? judgement.low.map((item) => item.id) : []);
  const estimated = report.skills.some((skill) => Number.isFinite(skill.estimatedShield));
  shell(h("div", {},
    h("a", { class: "back", href: "#/results" }, "返回成绩"),
    h("h1", {}, sittingTitle(sitting)),
    h("p", { class: "takeaway" }, sitting.kind === "official" ? report.sentence : judgement.message),
    estimated ? h("p", { class: "hint" }, "约几盾是按模拟参考表估算的，不是正式成绩。") : null,
    h("div", { class: "chips" }, report.skills.map((skill) => h("span", { class: "chip" }, `${skill.label} 班均 ${skill.unit === "percent" ? skillText({ ...skill, raw: skill.rawAverage, max: skill.max }) : skillText(skill)} · ${skill.n} 人`))),
    h("div", { class: "scroll" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { class: "sticky" }, "学生"), report.skills.map((skill) => h("th", {}, skill.label)), h("th", {}, "分数差"))),
      h("tbody", {}, students.map((student) => {
        const result = workspace.results.find((item) => item.sittingId === sitting.id && item.studentId === student.id);
        if (!result) return null;
        const metrics = resultMetrics(sitting, result);
        const delta = studentDelta(student.id, sitting, previous);
        return h("tr", {},
          h("th", { class: "sticky" }, h("a", { href: `#/student/${student.id}` }, student.name)),
          report.skills.map((skill) => h("td", {}, metrics.absent ? "缺考" : skillText(metrics.skills.find((item) => item.id === skill.id)))),
          h("td", {}, delta == null ? "—" : deltaNode(delta.delta, delta.unit)),
        );
      }).filter(Boolean)),
    )),
    h("p", { class: "hint" }, "分数差只描述同级别、同类型考试的数字，不是能力鉴定。"),
    parts.length ? h("section", { class: "section" },
      h("h2", {}, "各部分正确率"),
      h("div", { class: "scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { class: "sticky" }, "部分"), h("th", {}, "正确率"), h("th", {}, "有分"), h("th", {}, "空着"), h("th", {}, "缺考"))),
        h("tbody", {}, parts.map((part) => h("tr", { class: signalIds.has(part.id) ? "weak" : "" },
          h("th", { class: "sticky" }, part.label, signalIds.has(part.id) ? h("span", { class: "weak-label" }, " 这一次偏低") : null),
          h("td", {}, `${formatNumber(part.percent)}%（${formatNumber(part.rawAverage)}/${formatNumber(part.max)}）`),
          h("td", {}, String(part.n)),
          h("td", {}, String(part.blank)),
          h("td", {}, String(part.absent)),
        ))),
      )),
    ) : null,
    h("div", { class: "btn-row section" },
      h("a", { class: "btn", href: `#/entry?id=${sitting.id}` }, "修改成绩"),
      h("a", { class: "btn-secondary", href: `#/compare?right=${sitting.id}` }, "和另一场比"),
      h("a", { class: "btn-secondary", href: `#/trend?level=${sitting.level}&kind=${sitting.kind}` }, "看进步曲线"),
      h("button", { class: "btn-quiet", type: "button", onClick: () => deleteSitting(sitting) }, "删除这场"),
    ),
  ), { wide: true });
}

function lowestIds(items, valueOf) {
  const usable = items.filter((item) => Number.isFinite(valueOf(item)));
  if (usable.length < 2) return [];
  const lowest = Math.min(...usable.map(valueOf));
  return usable.filter((item) => valueOf(item) === lowest).map((item) => item.id);
}

function studentDelta(studentId, sitting, previous) {
  if (!previous) return null;
  const current = resultMetrics(sitting, workspace.results.find((result) => result.sittingId === sitting.id && result.studentId === studentId));
  const before = resultMetrics(previous, workspace.results.find((result) => result.sittingId === previous.id && result.studentId === studentId));
  if (current.absent || before.absent) return null;
  if (Number.isFinite(current.overall) && Number.isFinite(before.overall)) return { delta: current.overall - before.overall, unit: "scale" };
  const pairs = current.skills.map((skill) => {
    const earlier = before.skills.find((item) => item.id === skill.id && item.unit === skill.unit);
    return earlier ? skill.value - earlier.value : null;
  }).filter((value) => Number.isFinite(value));
  if (!pairs.length) return null;
  const unit = current.skills[0]?.unit || "percent";
  return { delta: pairs.reduce((sum, value) => sum + value, 0) / pairs.length, unit };
}

function deltaNode(delta, unit) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return "持平";
  const word = unit === "shield" ? "盾" : unit === "percent" ? "个百分点" : "分";
  return `${delta > 0 ? "高" : "低"} ${formatNumber(Math.abs(delta))} ${word}`;
}

function deleteSitting(sitting) {
  if (!confirm("删除这场考试和里面的成绩？")) return;
  workspace.sittings = workspace.sittings.filter((item) => item.id !== sitting.id);
  workspace.results = workspace.results.filter((result) => result.sittingId !== sitting.id);
  persist();
  go("#/results");
}

function renderResults() {
  const sittings = sittingsByDate();
  shell(h("div", {},
    h("a", { class: "back", href: "#/" }, "返回"),
    h("h1", {}, "成绩"),
    sittings.length ? h("p", { class: "lead" }, "点开一场看全班。想看变化，就对比两场，或看进步曲线。") : h("p", { class: "lead" }, "还没有成绩。下一步：录入这次考试。"),
    sittings.length > 1 ? h("div", { class: "btn-row" }, buttonLink("#/compare", "btn-secondary", "对比两场"), buttonLink("#/trend", "btn-secondary", "看进步曲线")) : null,
    !sittings.length ? buttonLink("#/entry", "btn", "录入这次考试") : null,
    h("div", { class: "exam-list section" }, sittings.map((sitting) => {
      const count = resultsFor(sitting.id).filter((result) => result.status !== "absent").length;
      const report = classReport(sitting, workspace.results, previousComparableSitting(sitting, workspace.sittings), workspace.results);
      return h("a", { href: `#/exam/${sitting.id}` }, h("strong", {}, sittingTitle(sitting)), h("div", {}, `${count} 人有分`), h("div", { class: "meta" }, report.sentence));
    })),
  ));
}

function renderCompare() {
  const route = parseRoute();
  const sittings = sittingsByDate();
  if (sittings.length < 2) {
    shell(h("div", {}, h("h1", {}, "对比两场"), h("p", { class: "lead" }, "至少要有两场成绩，才能比较。"), buttonLink("#/entry", "btn", "录入这次考试")));
    return;
  }
  if (!compareSelection.left) {
    const preferred = findSitting(route.params.get("right"));
    const pool = preferred ? [preferred, ...sittings.filter((sitting) => sitting.id !== preferred.id)] : sittings;
    let chosen = null;
    for (const right of pool) {
      const left = sittings.find((sitting) => sitting.id !== right.id && sitting.level === right.level && sitting.kind === right.kind);
      if (left) {
        chosen = { left: left.id, right: right.id };
        break;
      }
    }
    compareSelection = chosen || { left: sittings[1]?.id || "", right: sittings[0]?.id || "" };
  }
  let earlier = findSitting(compareSelection.left);
  let later = findSitting(compareSelection.right);
  if (earlier && later && earlier.date > later.date) {
    compareSelection = { left: later.id, right: earlier.id };
    [earlier, later] = [later, earlier];
  }
  const verdict = canCompare(earlier, later);
  const leftSkills = earlier ? skillSummary(earlier, workspace.results) : [];
  const rightSkills = later ? skillSummary(later, workspace.results) : [];
  const skillIds = [...new Set([...leftSkills, ...rightSkills].map((skill) => skill.id))];
  const options = sittings.map((sitting) => h("option", { value: sitting.id }, sittingTitle(sitting)));
  shell(h("div", {},
    h("a", { class: "back", href: "#/results" }, "返回成绩"),
    h("h1", {}, "对比两场"),
    h("p", { class: "lead" }, "左边是较早的一场，右边是较近的一场。变化是右边减去左边。"),
    h("div", { class: "fields" },
      h("div", {}, h("label", { for: "compare-left" }, "第一场"), h("select", { id: "compare-left", value: compareSelection.left, onChange: (event) => { compareSelection.left = event.target.value; render(); } }, options.map((option) => option.cloneNode(true)))),
      h("div", {}, h("label", { for: "compare-right" }, "第二场"), h("select", { id: "compare-right", value: compareSelection.right, onChange: (event) => { compareSelection.right = event.target.value; render(); } }, options.map((option) => option.cloneNode(true)))),
    ),
    verdict.ok ? h("p", { class: "takeaway" }, classReport(later, workspace.results, earlier, workspace.results).sentence) : h("p", { class: "alert" }, verdict.reason),
    h("div", { class: "scroll section" }, h("table", {},
      h("caption", { class: "meta" }, "全班"),
      h("thead", {}, h("tr", {}, h("th", { class: "sticky" }, "技能"), h("th", {}, earlier ? formatDate(earlier.date) : "第一场"), h("th", {}, later ? formatDate(later.date) : "第二场"), verdict.ok ? h("th", {}, "变化") : null)),
      h("tbody", {}, skillIds.map((id) => {
        const left = leftSkills.find((skill) => skill.id === id);
        const right = rightSkills.find((skill) => skill.id === id);
        const comparable = verdict.ok && left && right && left.unit === right.unit;
        return h("tr", {},
          h("th", { class: "sticky" }, (right || left).label),
          h("td", {}, left ? skillText({ ...left, raw: left.rawAverage, value: left.average }) : "—"),
          h("td", {}, right ? skillText({ ...right, raw: right.rawAverage, value: right.average }) : "—"),
          comparable ? h("td", {}, deltaNode(right.average - left.average, right.unit)) : verdict.ok ? h("td", {}, "—") : null,
        );
      })),
    )),
    verdict.ok ? studentCompare(earlier, later, skillIds) : null,
  ), { wide: true });
}

function studentCompare(earlier, later, skillIds) {
  const ids = new Set([...resultsFor(earlier.id), ...resultsFor(later.id)].map((result) => result.studentId));
  return h("section", { class: "section" }, h("h2", {}, "每个学生"), h("div", { class: "scroll" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { class: "sticky" }, "学生"), skillIds.flatMap((id) => [h("th", {}, `${SKILL_LABEL[id] || id} 前`), h("th", {}, `${SKILL_LABEL[id] || id} 后`), h("th", {}, "变化")]))),
    h("tbody", {}, [...ids].map((studentId) => {
      const student = workspace.students.find((item) => item.id === studentId);
      if (!student) return null;
      const before = resultMetrics(earlier, workspace.results.find((result) => result.sittingId === earlier.id && result.studentId === studentId));
      const after = resultMetrics(later, workspace.results.find((result) => result.sittingId === later.id && result.studentId === studentId));
      return h("tr", {}, h("th", { class: "sticky" }, h("a", { href: `#/student/${student.id}` }, student.name)), skillIds.flatMap((id) => {
        const left = before.skills.find((skill) => skill.id === id);
        const right = after.skills.find((skill) => skill.id === id);
        const comparable = left && right && left.unit === right.unit;
        return [h("td", {}, before.absent ? "缺考" : skillText(left)), h("td", {}, after.absent ? "缺考" : skillText(right)), h("td", {}, comparable ? deltaNode(right.value - left.value, right.unit) : "—")];
      }));
    }).filter(Boolean)),
  )));
}

function renderTrend() {
  const route = parseRoute();
  const available = sittingsByDate().filter((sitting) => sitting.date);
  if (available.length < 1) {
    shell(h("div", {}, h("h1", {}, "进步"), h("p", { class: "lead" }, "记下成绩之后，这里会画出上升还是下降。"), buttonLink("#/entry", "btn", "录入这次考试")));
    return;
  }
  if (!trendSelection.level) {
    const latest = findSitting(route.params.get("level") ? available.find((sitting) => sitting.level === route.params.get("level") && sitting.kind === (route.params.get("kind") || sitting.kind))?.id : "") || available[0];
    trendSelection.level = route.params.get("level") || latest.level;
    trendSelection.kind = route.params.get("kind") || latest.kind;
  }
  const seriesSittings = available.filter((sitting) => sitting.level === trendSelection.level && sitting.kind === trendSelection.kind);
  const skillIds = [...new Set(seriesSittings.flatMap((sitting) => skillSummary(sitting, workspace.results).map((skill) => skill.id)))];
  if (!skillIds.includes(trendSelection.skillId)) trendSelection.skillId = skillIds[0] || "reading";
  const levels = [...new Set(available.map((sitting) => sitting.level))];
  const kinds = [...new Set(available.filter((sitting) => sitting.level === trendSelection.level).map((sitting) => sitting.kind))];
  const classSeries = classSkillSeries(workspace.sittings, workspace.results, trendSelection);
  const classChange = seriesDelta(classSeries);
  shell(h("div", {},
    h("a", { class: "back", href: "#/results" }, "返回成绩"),
    h("h1", {}, "进步曲线"),
    h("p", { class: "lead" }, "只比较同一级别、同一种计分。练习看正确率，正式考试看标准分或盾。"),
    h("div", { class: "fields" },
      h("div", {}, h("label", { for: "trend-level" }, "级别"), h("select", { id: "trend-level", value: trendSelection.level, onChange: (event) => { trendSelection.level = event.target.value; trendSelection.kind = available.find((sitting) => sitting.level === trendSelection.level)?.kind || "practice"; render(); } }, levels.map((level) => h("option", { value: level }, levelLabel(level))))),
      h("div", {}, h("label", { for: "trend-kind" }, "类型"), h("select", { id: "trend-kind", value: trendSelection.kind, onChange: (event) => { trendSelection.kind = event.target.value; render(); } }, kinds.map((kind) => h("option", { value: kind }, kind === "official" ? "正式考试" : kind === "classroom" ? "课堂练习" : "练习")))),
    ),
    h("div", { class: "tabs", role: "tablist" }, skillIds.map((id) => h("button", { type: "button", "aria-pressed": String(trendSelection.skillId === id), onClick: () => { trendSelection.skillId = id; render(); } }, SKILL_LABEL[id] || id))),
    h("h2", {}, `全班${SKILL_LABEL[trendSelection.skillId] || ""}`),
    h("p", { class: "takeaway" }, classChange ? deltaPhrase(classChange.delta, classChange.unit, `本班${SKILL_LABEL[trendSelection.skillId] || ""}`) + "。" : classSeries.length ? "只有一场，再记一次就能看出上升还是下降。" : "这个项目还没有分数。"),
    chart(classSeries, trendSelection),
    seriesTable(classSeries, "场次"),
    h("h2", { class: "section" }, "一个学生"),
    h("label", { for: "trend-student" }, "学生"),
    h("select", { id: "trend-student", value: trendSelection.studentId, onChange: (event) => { trendSelection.studentId = event.target.value; render(); } }, [h("option", { value: "" }, "选择学生"), ...sortedStudents().map((student) => h("option", { value: student.id }, student.setName ? `${student.name} · ${student.setName}` : student.name))]),
    trendSelection.studentId ? studentTrend(trendSelection) : null,
  ), { wide: true });
}

function studentTrend(selection) {
  const student = workspace.students.find((item) => item.id === selection.studentId);
  if (!student) return null;
  const series = studentSkillSeries(student.id, workspace.sittings, workspace.results, selection);
  const change = seriesDelta(series);
  return h("div", {},
    h("p", { class: "takeaway" }, change ? `${deltaPhrase(change.delta, change.unit, student.name)}。` : series.length ? "只有一场成绩。" : "这个项目还没有这个学生的分数。"),
    chart(series, selection),
    seriesTable(series, "日期"),
  );
}

function chart(series, selection) {
  if (series.length < 1) return null;
  const unit = series[0].unit;
  const domain = unit === "shield" ? [1, 5] : unit === "percent" ? [0, 100] : [SCALE_RANGE[selection.level]?.min || 0, SCALE_RANGE[selection.level]?.max || 200];
  const width = 640;
  const height = 240;
  const pad = { left: 48, right: 64, top: 16, bottom: 40 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const y = (value) => pad.top + ((domain[1] - value) / (domain[1] - domain[0])) * innerHeight;
  const points = series.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const label = unit === "shield" ? "盾" : unit === "percent" ? "正确率" : "标准分";
  return h("svg", { class: "chart", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${label}折线` },
    h("line", { x1: pad.left, y1: pad.top, x2: pad.left, y2: height - pad.bottom, stroke: "#2c332e" }),
    h("line", { x1: pad.left, y1: height - pad.bottom, x2: width - pad.right, y2: height - pad.bottom, stroke: "#2c332e" }),
    h("text", { x: "4", y: pad.top + 8, "font-size": "14" }, String(domain[1])),
    h("text", { x: "4", y: height - pad.bottom, "font-size": "14" }, String(domain[0])),
    series.length > 1 ? h("polyline", { fill: "none", stroke: "#0c6b4c", "stroke-width": "3", points }) : null,
    series.map((point, index) => h("g", {},
      h("circle", { cx: x(index), cy: y(point.value), r: "5", fill: "#0c6b4c" }),
      h("text", { x: x(index), y: height - 14, "text-anchor": index === 0 ? "start" : index === series.length - 1 ? "end" : "middle", "font-size": "14" }, formatDate(point.date).replace("年", "/")),
    )),
  );
}

function seriesTable(series, firstHeading) {
  if (!series.length) return null;
  return h("div", { class: "scroll section" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", {}, firstHeading), h("th", {}, "日期"), h("th", {}, "分数"))),
    h("tbody", {}, series.map((point) => h("tr", {}, h("td", {}, point.paper || formatDate(point.date)), h("td", {}, formatDate(point.date)), h("td", {}, point.unit === "percent" && Number.isFinite(point.raw) ? `${formatNumber(point.raw)}/${formatNumber(point.max)}` : formatNumber(point.value))))),
  ));
}

function renderStudent() {
  const student = workspace.students.find((item) => item.id === parseRoute().id);
  if (!student) {
    shell(h("div", {}, h("h1", {}, "没有这个学生"), buttonLink("#/students", "btn", "返回名单")));
    return;
  }
  const own = workspace.results.filter((result) => result.studentId === student.id);
  const groups = new Map();
  for (const result of own) {
    const sitting = findSitting(result.sittingId);
    if (!sitting || result.status === "absent") continue;
    const key = `${sitting.level}|${sitting.kind}`;
    const group = groups.get(key) || { level: sitting.level, kind: sitting.kind, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const focusGroup = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  const latestSitting = focusGroup ? sittingsByDate().find((sitting) => sitting.level === focusGroup.level && sitting.kind === focusGroup.kind && own.some((result) => result.sittingId === sitting.id && result.status !== "absent")) : null;
  const latestMetrics = latestSitting ? resultMetrics(latestSitting, own.find((result) => result.sittingId === latestSitting.id)) : { skills: [] };
  const skillIds = latestMetrics.skills?.map((skill) => skill.id) || [];
  const seriesBySkill = Object.fromEntries(skillIds.map((skillId) => [skillId, studentSkillSeries(student.id, workspace.sittings, workspace.results, { level: latestSitting?.level, kind: latestSitting?.kind, skillId })]));
  const focus = skillIds.includes(trendSelection.skillId) ? trendSelection.skillId : skillIds[0];
  shell(h("div", {},
    h("a", { class: "back", href: "#/results" }, "返回成绩"),
    h("h1", {}, student.name),
    h("p", { class: "lead" }, student.setName ? `教学班 ${student.setName}` : "未分班"),
    h("p", { class: "takeaway" }, studentSentence(student.name, latestMetrics.skills || [], seriesBySkill)),
    groups.size > 1 ? h("p", { class: "hint" }, "这张图只画同一种计分。练习和正式考试没有画在一起。") : null,
    skillIds.length ? h("div", { class: "tabs" }, skillIds.map((id) => h("button", { type: "button", "aria-pressed": String(focus === id), onClick: () => { trendSelection.skillId = id; render(); } }, SKILL_LABEL[id] || id))) : null,
    focus ? chart(seriesBySkill[focus] || [], { level: latestSitting?.level, kind: latestSitting?.kind, skillId: focus }) : null,
    focus ? seriesTable(seriesBySkill[focus] || [], "试卷") : null,
    h("h2", { class: "section" }, "每次考试"),
    h("div", { class: "exam-list" }, own.map((result) => {
      const sitting = findSitting(result.sittingId);
      if (!sitting) return null;
      const metrics = resultMetrics(sitting, result);
      return h("a", { href: `#/exam/${sitting.id}` }, h("strong", {}, sittingTitle(sitting)), h("div", {}, metrics.absent ? "缺考" : metrics.skills.map((skill) => `${skill.label} ${skillText(skill)}`).join(" · ") || "没有可计算的分数"));
    }).filter(Boolean)),
  ), { wide: true });
}

function renderBackup() {
  const old = oldDataSummary(localStorage);
  shell(h("div", {},
    h("a", { class: "back", href: "#/" }, "返回"),
    h("h1", {}, "备份"),
    h("p", { class: "lead" }, "成绩只在这台浏览器里。换电脑，或交给另一位老师，先下载这个文件。"),
    h("button", { class: "btn", type: "button", onClick: downloadBackup }, "下载备份文件"),
    h("div", { class: "card section" },
      h("h2", {}, "从文件加回成绩"),
      h("p", { class: "hint" }, "同一名学生不会重复添加。已经记下的分数不会被盖掉。"),
      h("label", { class: "btn-secondary file-pick" }, "选择备份文件", h("input", { id: "backup-file", type: "file", accept: "application/json,.json", onChange: uploadBackup })),
    ),
    old.present ? h("div", { class: "card section" },
      h("h2", {}, "从旧版读取"),
      h("p", { class: "hint" }, old.broken ? "旧版数据读不出来，没有改动任何数据。" : "只读取，不会修改旧版网页里的成绩。"),
      old.broken ? null : h("button", { class: "btn-secondary", type: "button", onClick: importOld }, "从旧版导入"),
    ) : null,
    rosterMessage ? h("div", { class: "note" }, rosterMessage) : null,
  ));
}

function downloadBackup() {
  const blob = new Blob([backupText(workspace)], { type: "application/json" });
  const link = h("a", { href: URL.createObjectURL(blob), download: `剑桥成绩备份-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function uploadBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const merged = importBackupText(localStorage, String(reader.result || ""));
      workspace = merged.workspace;
      const summary = merged.summary;
      rosterMessage = `已加入 ${summary.studentsAdded} 名学生、${summary.sittingsAdded} 场考试、${summary.resultsAdded} 条成绩。${summary.resultsSkipped ? `${summary.resultsSkipped} 条和现有成绩不一致，保留了原来的。` : ""}`;
      render();
    } catch (error) {
      rosterMessage = error instanceof Error ? error.message : "文件无法读取";
      render();
    }
  };
  reader.readAsText(file);
}

function importOld() {
  try {
    const imported = importOldDatabase(localStorage);
    workspace = imported.workspace;
    if (imported.empty) rosterMessage = "旧版里还没有学生和成绩。";
    else {
      const summary = imported.summary;
      rosterMessage = `已从旧版读入 ${summary.studentsAdded} 名学生、${summary.sittingsAdded} 场考试。旧版没有被修改。`;
    }
  } catch (error) {
    rosterMessage = error instanceof Error ? error.message : "旧版数据没有读入";
  }
  render();
}

function render() {
  try {
    const route = parseRoute();
    if (route.page !== "entry") entryDraft = null;
    if (route.page === "students") renderStudents();
    else if (route.page === "entry") renderEntry();
    else if (route.page === "results") renderResults();
    else if (route.page === "exam") renderExam();
    else if (route.page === "attention") renderAttention();
    else if (route.page === "compare") renderCompare();
    else if (route.page === "trend") renderTrend();
    else if (route.page === "student") renderStudent();
    else if (route.page === "backup") renderBackup();
    else renderHome();
  } catch (error) {
    console.error(error);
    app.replaceChildren(h("pre", {}, error instanceof Error ? error.stack : String(error)));
  }
}

window.addEventListener("hashchange", render);
render();
