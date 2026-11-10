export function parseTsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source.trim()) return [];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      continue;
    }
    if (char === "\t") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      if (row.some((item) => item.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (quoted) return { error: "粘贴的内容里引号没有闭合" };
  row.push(cell);
  if (row.some((item) => item.trim() !== "")) rows.push(row);
  return rows;
}

export function namesFromPaste(text) {
  const parsed = parseTsv(text);
  if (parsed?.error) return { names: [], error: parsed.error };
  const rows = parsed;
  if (rows.length < 2 && rows.every((row) => row.length < 2)) {
    return { names: [], single: true };
  }
  let start = 0;
  const first = rows[0]?.[0]?.trim() || "";
  if (/^(姓名|学生|name)$/i.test(first)) start = 1;
  const names = [];
  for (const row of rows.slice(start)) {
    const name = String(row[0] ?? "").trim();
    if (name) names.push(name);
  }
  return { names, single: false };
}

function cleanHeader(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

export function applyScorePaste({ text, students, columns, startRow = 0, startCol = 0 }) {
  const parsed = parseTsv(text);
  if (parsed?.error) return { changes: [], notes: [parsed.error] };
  const rows = parsed;
  if (!rows.length) return { changes: [], notes: ["没有可粘贴的内容"] };
  const notes = [];
  const changes = [];
  const headerCells = rows[0].map(cleanHeader);
  const columnByHeader = new Map(columns.map((column) => [cleanHeader(column.label), column]));
  const hasName = headerCells.some((cell) => ["姓名", "学生", "name"].includes(cell));
  const hasColumn = headerCells.some((cell) => columnByHeader.has(cell));
  if (hasName || hasColumn) {
    const nameIndex = headerCells.findIndex((cell) => ["姓名", "学生", "name"].includes(cell));
    const mapped = headerCells.map((cell) => columnByHeader.get(cell) || null);
    if (!mapped.some(Boolean)) return { changes: [], notes: ["表头没有对上分数栏，请直接粘贴数字"] };
    for (const row of rows.slice(1)) {
      const name = nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "";
      const student = name ? students.find((item) => item.name.trim() === name) : null;
      if (name && !student) {
        notes.push(`没有找到学生「${name}」，这一行跳过了`);
        continue;
      }
      const target = student || null;
      mapped.forEach((column, index) => {
        if (!column || !target) return;
        const raw = row[index] ?? "";
        if (String(raw).trim() === "") {
          changes.push({ studentId: target.id, columnId: column.id, clear: true });
          return;
        }
        changes.push({ studentId: target.id, columnId: column.id, text: String(raw).trim() });
      });
    }
    return { changes, notes };
  }
  const nameHits = rows.filter((row) => students.some((student) => student.name.trim() === String(row[0] ?? "").trim())).length;
  if (nameHits >= Math.min(2, rows.length) || (rows.length === 1 && nameHits === 1 && rows[0].length > 1)) {
    for (const row of rows) {
      const student = students.find((item) => item.name.trim() === String(row[0] ?? "").trim());
      if (!student) continue;
      columns.forEach((column, index) => {
        const raw = row[index + 1];
        if (raw == null) return;
        if (String(raw).trim() === "") changes.push({ studentId: student.id, columnId: column.id, clear: true });
        else changes.push({ studentId: student.id, columnId: column.id, text: String(raw).trim() });
      });
    }
    return { changes, notes };
  }
  rows.forEach((row, rowIndex) => {
    const student = students[startRow + rowIndex];
    if (!student) return;
    row.forEach((raw, columnIndex) => {
      const column = columns[startCol + columnIndex];
      if (!column) return;
      if (String(raw).trim() === "") changes.push({ studentId: student.id, columnId: column.id, clear: true });
      else changes.push({ studentId: student.id, columnId: column.id, text: String(raw).trim() });
    });
  });
  return { changes, notes };
}

export function parseScoreText(text) {
  const normalized = String(text ?? "")
    .trim()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xff10 + 48))
    .replace(/．/g, ".")
    .replace(/。/g, ".");
  if (!normalized) return { empty: true };
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { error: "请填写数字" };
  return { value: Number(normalized) };
}
