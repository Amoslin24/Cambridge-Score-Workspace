/**
 * Cambridge score rules copied from the existing workspace (the published
 * bundle), not redesigned. Anchors match the Nov 2023 practice-test
 * conversion guide already encoded there. YLE shield bands match the Mock
 * Test Toolkit table already encoded there. Estimated shields are explicitly
 * not official results.
 */

export const LEVELS = ["Starters", "Movers", "Flyers", "A2", "B1", "B2"];

export const LEVEL_LABEL = {
  Starters: "Starters",
  Movers: "Movers",
  Flyers: "Flyers",
  A2: "KET",
  B1: "PET",
  B2: "FCE",
};

export const KIND_LABEL = {
  practice: "练习",
  official: "正式考试",
  classroom: "课堂练习",
};

export const SKILL_LABEL = {
  listening: "听力",
  reading: "阅读",
  writing: "写作",
  speaking: "口语",
  readingWriting: "读写",
  useOfEnglish: "英语运用",
};

const YLE = ["Starters", "Movers", "Flyers"];
const FLAG_ITEMS = "yle_paper_2024";
const FLAG_PARTS = "yle_paper_parts_2024";
const FLAG_LEGACY = "yle_legacy_v7";
const FLAG_WRITING_TASKS = "writing_task_totals_v1";
const FLAG_A2_COMBINED = "__officialA2Combined";
const MODE_FLAGS = [FLAG_ITEMS, FLAG_PARTS, FLAG_LEGACY, FLAG_WRITING_TASKS, FLAG_A2_COMBINED];

const SCALE_RANGE = {
  A2: { min: 80, max: 150 },
  B1: { min: 102, max: 170 },
  B2: { min: 122, max: 190 },
  Starters: { min: 1, max: 5 },
  Movers: { min: 1, max: 5 },
  Flyers: { min: 1, max: 5 },
};

const YLE_TOOLKIT = {
  Starters: {
    listening: { max: 20, thresholds: [0, 11, 13, 16, 18] },
    readingWriting: { max: 25, thresholds: [0, 13, 16, 19, 21] },
  },
  Movers: {
    listening: { max: 25, thresholds: [0, 11, 14, 18, 21] },
    readingWriting: { max: 39, thresholds: [0, 18, 24, 29, 33] },
  },
  Flyers: {
    listening: { max: 25, thresholds: [0, 14, 17, 20, 23] },
    readingWriting: { max: 48, thresholds: [0, 24, 30, 36, 42] },
  },
};

const YLE_ITEM_SHAPE = {
  Starters: [
    [5, 5, 5, 5],
    [5, 5, 5, 5, 5],
  ],
  Movers: [
    [5, 5, 5, 5, 5],
    [5, 6, 6, 5, 7, 6],
  ],
  Flyers: [
    [5, 5, 5, 5, 5],
    [10, 5, 6, 10, 7, 5, 1],
  ],
};

export function isYle(level) {
  return YLE.includes(level);
}

export function levelLabel(level) {
  return LEVEL_LABEL[level] || level || "";
}

function paperMode(scores) {
  if (scores?.[FLAG_PARTS] === 1) return "parts2024";
  if (scores?.[FLAG_ITEMS] === 1) return "items2024";
  if (scores?.[FLAG_LEGACY] === 1) return "legacyV7";
  return "totals";
}

function itemMax(level, skill, partIndex, questionIndex) {
  if (level === "Movers" && skill === "readingWriting" && partIndex === 5 && questionIndex > 1) return 2;
  if (level === "Flyers" && skill === "readingWriting" && partIndex === 6) return 5;
  return 1;
}

export function yleItems(level, skill) {
  const shape = YLE_ITEM_SHAPE[level]?.[skill === "listening" ? 0 : 1];
  if (!shape || !["listening", "readingWriting"].includes(skill)) return [];
  return shape.flatMap((count, partIndex) =>
    Array.from({ length: count }, (_, questionIndex) => ({
      id: `y24_${skill}_p${partIndex + 1}_q${questionIndex + 1}`,
      part: partIndex + 1,
      max: itemMax(level, skill, partIndex, questionIndex),
      step: 1,
    })),
  );
}

export function yleParts(level, skill) {
  const grouped = new Map();
  for (const item of yleItems(level, skill)) {
    if (!grouped.has(item.part)) grouped.set(item.part, { id: `y24_${skill}_p${item.part}`, part: item.part, max: 0, step: 1 });
    grouped.get(item.part).max += item.max;
  }
  return [...grouped.values()];
}

function sumPartScores(fields, scores) {
  const complete = fields.length > 0 && fields.every((field) => typeof scores[field.id] === "number");
  const parts = [...new Set(fields.map((field) => Number(field.id.match(/_p(\d+)/)[1])))].map((part) => {
    const group = fields.filter((field) => Number(field.id.match(/_p(\d+)/)[1]) === part);
    const filled = group.every((field) => typeof scores[field.id] === "number");
    return {
      part,
      raw: filled ? group.reduce((sum, field) => sum + scores[field.id], 0) : null,
      max: group.reduce((sum, field) => sum + field.max, 0),
    };
  });
  return {
    raw: complete ? fields.reduce((sum, field) => sum + scores[field.id], 0) : null,
    max: fields.reduce((sum, field) => sum + field.max, 0),
    complete,
    parts,
  };
}

function legacyShield(level, skill, raw, scores) {
  if (paperMode(scores) !== "legacyV7" || raw === null || !["Movers", "Flyers"].includes(level)) return null;
  if (!["listening", "readingWriting"].includes(skill)) return null;
  const bands =
    skill === "listening" ? [0, 11, 14, 18, 21] : level === "Movers" ? [0, 18, 24, 29, 33] : [0, 18, 24, 36, 42];
  return bands.filter((band) => raw >= band).length;
}

function estimateShield(level, skill, raw, max, complete, mode) {
  const rule = YLE_TOOLKIT[level]?.[skill.id || skill];
  const skillId = skill.id || skill;
  if (!["parts2024", "items2024", "totals"].includes(mode) || !rule || !complete) return null;
  if (!Number.isInteger(raw) || raw < 0 || raw > rule.max || max !== rule.max) return null;
  return rule.thresholds.filter((band) => raw >= band).length;
}

function partFields(prefix, maxes, partNumbers, steps) {
  return maxes.map((max, index) => ({
    id: `${prefix}_p${partNumbers?.[index] ?? index + 1}`,
    part: partNumbers?.[index] ?? index + 1,
    max,
    step: steps?.[index] ?? 1,
    weight: 1,
  }));
}

function writingCriteria(compact) {
  const names = compact ? ["内容", "组织", "语言"] : ["内容", "交际效果", "组织", "语言"];
  return [1, 2].flatMap((task) =>
    names.map((name, index) => ({
      id: `w${task}_${index}`,
      label: compact ? `写作第${task + 5}部分 · ${name}` : `写作任务${task} · ${name}`,
      max: 5,
      step: 1,
      weight: 1,
    })),
  );
}

function writingTasks(level) {
  return [1, 2].map((task) => ({
    id: `w_task${task}`,
    label: level === "A2" ? `写作第${task + 5}部分` : `写作任务${task}`,
    max: level === "A2" ? 15 : 20,
    step: 1,
    weight: 1,
  }));
}

function speakingFields(level) {
  const names = [
    "语法和词汇",
    ...(level === "A2" ? [] : ["话语组织"]),
    "发音",
    "互动交流",
    "总体表现",
  ];
  return names.map((label, index, all) => ({
    id: `s_${index}`,
    label,
    max: 5,
    step: 0.5,
    weight: index === all.length - 1 ? { A2: 3, B1: 2, B2: 4 }[level] : level === "B1" ? 1 : 2,
  }));
}

function skill(id, fields, anchors) {
  return {
    id,
    label: SKILL_LABEL[id] || id,
    fields,
    anchors,
    max: fields.reduce((sum, field) => sum + field.max * (field.weight ?? 1), 0),
  };
}

const MAIN_SUITE = {
  A2: {
    skills: [
      skill("reading", partFields("r", [6, 7, 5, 6, 6]), [
        [7, 82],
        [13, 100],
        [20, 120],
        [28, 140],
      ]),
      skill("writing", writingCriteria(true), [
        [8, 82],
        [12, 100],
        [18, 120],
        [26, 140],
      ]),
      skill("listening", partFields("l", [5, 5, 5, 5, 5]), [
        [6, 82],
        [11, 100],
        [17, 120],
        [23, 140],
      ]),
      skill("speaking", speakingFields("A2"), [
        [10, 82],
        [18, 100],
        [27, 120],
        [41, 140],
      ]),
    ],
  },
  B1: {
    skills: [
      skill("reading", partFields("r", [5, 5, 5, 5, 6, 6]), [
        [5, 102],
        [13, 120],
        [23, 140],
        [29, 160],
      ]),
      skill("writing", writingCriteria(false), [
        [10, 102],
        [16, 120],
        [24, 140],
        [34, 160],
      ]),
      skill("listening", partFields("l", [7, 6, 6, 6]), [
        [5, 102],
        [11, 120],
        [18, 140],
        [23, 160],
      ]),
      skill("speaking", speakingFields("B1"), [
        [7, 102],
        [12, 120],
        [18, 140],
        [27, 160],
      ]),
    ],
  },
  B2: {
    skills: [
      skill("reading", partFields("r", [8, 12, 12, 10], [1, 5, 6, 7], [1, 2, 2, 1]), [
        [10, 122],
        [16, 140],
        [24, 160],
        [37, 180],
      ]),
      skill("useOfEnglish", partFields("u", [8, 8, 12], [2, 3, 4]), [
        [7, 122],
        [11, 140],
        [18, 160],
        [24, 180],
      ]),
      skill("writing", writingCriteria(false), [
        [10, 122],
        [16, 140],
        [24, 160],
        [34, 180],
      ]),
      skill("listening", partFields("l", [8, 10, 5, 7]), [
        [8, 122],
        [12, 140],
        [18, 160],
        [27, 180],
      ]),
      skill("speaking", speakingFields("B2"), [
        [14, 122],
        [24, 140],
        [36, 160],
        [54, 180],
      ]),
    ],
  },
};

function yleSkillShell(id) {
  return {
    id,
    label: SKILL_LABEL[id],
    max: 0,
    anchors: [],
    fields: [
      { id: `${id}_raw`, label: "得分", max: 10000, step: 0.5, weight: 1 },
      { id: `${id}_max`, label: "满分", max: 10000, step: 0.5, weight: 1 },
    ],
  };
}

function examSkills(level) {
  if (isYle(level)) return ["listening", "readingWriting", "speaking"].map(yleSkillShell);
  return MAIN_SUITE[level]?.skills || [];
}

function officialSkills(level, scores) {
  if (level === "A2" && scores?.[FLAG_A2_COMBINED] === 1) {
    return [
      { id: "readingWriting", label: SKILL_LABEL.readingWriting, fields: [], anchors: [], max: 0 },
      ...MAIN_SUITE.A2.skills.filter((item) => item.id === "listening" || item.id === "speaking"),
    ];
  }
  return examSkills(level);
}

function writingEntryFields(level, scores, criteria) {
  return scores?.[FLAG_WRITING_TASKS] === 1 && ["A2", "B1", "B2"].includes(level) ? writingTasks(level) : criteria;
}

function practiceFields(level, skillId, scores, fallback) {
  if (skillId === "writing") return writingEntryFields(level, scores, fallback);
  if (skillId === "speaking") return fallback;
  const mode = paperMode(scores);
  if (mode === "parts2024") return yleParts(level, skillId);
  if (mode === "items2024") return yleItems(level, skillId);
  return fallback;
}

function isPlain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function flagErrors(level, scores, kind) {
  const errors = [];
  for (const flag of [FLAG_ITEMS, FLAG_PARTS, FLAG_LEGACY]) {
    if (Object.hasOwn(scores, flag) && scores[flag] !== 1) errors.push("少儿试卷的记分方式标记不正确");
  }
  if (Object.hasOwn(scores, FLAG_ITEMS) && Object.hasOwn(scores, FLAG_PARTS)) {
    errors.push("逐题分数和各部分分数不能写在同一次里");
  }
  if ((Object.hasOwn(scores, FLAG_ITEMS) || Object.hasOwn(scores, FLAG_PARTS)) && Object.hasOwn(scores, FLAG_LEGACY)) {
    errors.push("现行逐题或各部分记分不能套用旧的估算方式");
  }
  if ([FLAG_ITEMS, FLAG_PARTS, FLAG_LEGACY].some((flag) => Object.hasOwn(scores, flag)) && (!YLE_ITEM_SHAPE[level] || kind === "official")) {
    errors.push("少儿原始分标记只能用在练习成绩上");
  }
  if (Object.hasOwn(scores, FLAG_LEGACY) && (kind !== "practice" || !["Movers", "Flyers"].includes(level))) {
    errors.push("旧估算方式只适用于 Movers / Flyers 练习");
  }
  if (Object.hasOwn(scores, FLAG_WRITING_TASKS)) {
    if (scores[FLAG_WRITING_TASKS] !== 1) errors.push("写作记分方式标记不正确");
    if (!["A2", "B1", "B2"].includes(level) || kind === "official") errors.push("写作任务总分只能用在 KET、PET、FCE 的练习里");
  }
  return errors;
}

function stepError(label, min, max, step) {
  const how = step === 0.5 ? "可以填半分" : step === 1 ? "只填整数" : `只填 ${step} 的倍数`;
  return `${label}应在 ${min}–${max} 之间，${how}`;
}

export function validateScores(level, scores, kind) {
  if (!LEVELS.includes(level)) return ["级别无法识别"];
  if (!["official", "practice", "classroom"].includes(kind)) return ["考试类型无法识别"];
  if (!isPlain(scores)) return ["成绩格式不正确"];
  const official = kind === "official";
  const skills = official ? officialSkills(level, scores) : examSkills(level);
  const fields = official
    ? skills.map((item) => ({ id: item.id, label: item.label, max: SCALE_RANGE[level].max, step: 1 }))
    : skills.flatMap((item) => practiceFields(level, item.id, scores, item.fields).map((field) => ({ ...field, label: field.label || item.label })));
  const known = new Map(fields.map((field) => [field.id, field]));
  if (level === "A2" && official && scores[FLAG_A2_COMBINED] === 1) {
    known.set(FLAG_A2_COMBINED, { id: FLAG_A2_COMBINED, label: "正式成绩口径", max: 1, step: 1 });
  }
  if (isYle(level) && !official) {
    for (const flag of [FLAG_ITEMS, FLAG_PARTS, FLAG_LEGACY]) known.set(flag, { id: flag, label: flag, max: 1, step: 1 });
  }
  if (!isYle(level) && !official) known.set(FLAG_WRITING_TASKS, { id: FLAG_WRITING_TASKS, label: "写作记分方式", max: 1, step: 1 });
  const errors = flagErrors(level, scores, kind);
  for (const [key, value] of Object.entries(scores)) {
    const field = known.get(key);
    if (!field) {
      errors.push(`有无法识别的分数：${key}`);
      continue;
    }
    if (value === null) continue;
    const min = key === FLAG_A2_COMBINED ? 1 : official ? SCALE_RANGE[level].min : 0;
    const step = field.step ?? 1;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > field.max || Math.abs(value / step - Math.round(value / step)) > 1e-8) {
      errors.push(stepError(SKILL_LABEL[key] || field.label || key, min, field.max, step));
    }
  }
  if (isYle(level) && !official) {
    for (const item of examSkills(level)) {
      if (["parts2024", "items2024"].includes(paperMode(scores)) && item.id !== "speaking") continue;
      const raw = scores[`${item.id}_raw`];
      const max = scores[`${item.id}_max`];
      if (max != null && max <= 0) errors.push(`${item.label}满分必须大于 0`);
      if (raw != null && max == null) errors.push(`${item.label}写了得分，还要写满分`);
      if (raw != null && max != null && raw > max) errors.push(`${item.label}得分不能超过满分`);
    }
  }
  return errors;
}

function interpolate(raw, anchors) {
  if (!Number.isFinite(raw) || anchors.length < 2 || raw < anchors[0][0] || raw > anchors[anchors.length - 1][0]) return null;
  for (let index = 1; index < anchors.length; index += 1) {
    const [leftRaw, leftScale] = anchors[index - 1];
    const [rightRaw, rightScale] = anchors[index];
    if (raw <= rightRaw) return leftScale + ((raw - leftRaw) * (rightScale - leftScale)) / (rightRaw - leftRaw);
  }
  return null;
}

export function calculate(level, scores, kind = "practice") {
  const errors = validateScores(level, scores, kind);
  if (errors.length) throw new Error(errors.join("；"));
  const skills = (kind === "official" ? officialSkills(level, scores) : examSkills(level)).map((item) => {
    if (isYle(level)) {
      if (kind === "official") {
        const shields = scores[item.id] ?? null;
        return { id: item.id, label: item.label, raw: null, max: 5, percent: null, scale: null, shields, estimatedShields: null, complete: shields !== null, parts: [] };
      }
      if (["parts2024", "items2024"].includes(paperMode(scores)) && item.id !== "speaking") {
        const summed = sumPartScores(paperMode(scores) === "parts2024" ? yleParts(level, item.id) : yleItems(level, item.id), scores);
        return {
          id: item.id,
          label: item.label,
          ...summed,
          percent: summed.raw === null ? null : (summed.raw / summed.max) * 100,
          scale: null,
          shields: null,
          estimatedShields: kind === "practice" ? estimateShield(level, item, summed.raw, summed.max, summed.complete, paperMode(scores)) : null,
        };
      }
      const raw = scores[`${item.id}_raw`] ?? null;
      const max = scores[`${item.id}_max`] ?? null;
      const complete = raw !== null && max !== null;
      return {
        id: item.id,
        label: item.label,
        raw,
        max: max ?? 0,
        percent: !complete ? null : (raw / max) * 100,
        scale: null,
        shields: null,
        parts: [],
        estimatedShields:
          kind === "practice" && complete
            ? paperMode(scores) === "legacyV7"
              ? legacyShield(level, item.id, raw, scores)
              : estimateShield(level, item, raw, max, true, paperMode(scores))
            : null,
        complete,
      };
    }
    if (kind === "official") {
      const scale = scores[item.id] ?? null;
      return { id: item.id, label: item.label, raw: null, max: item.max, percent: null, scale, shields: null, estimatedShields: null, complete: scale !== null, parts: [] };
    }
    const fields = item.id === "writing" ? writingEntryFields(level, scores, item.fields) : item.fields;
    const complete = fields.every((field) => typeof scores[field.id] === "number");
    const raw = complete ? fields.reduce((sum, field) => sum + scores[field.id] * (field.weight ?? 1), 0) : null;
    return {
      id: item.id,
      label: item.label,
      raw,
      max: item.max,
      shields: null,
      percent: raw === null ? null : (raw / item.max) * 100,
      scale: raw === null || kind === "classroom" ? null : interpolate(raw, item.anchors),
      estimatedShields: null,
      complete,
      parts: fields.map((field) => ({
        part: field.part || field.id,
        id: field.id,
        label: field.label,
        raw: typeof scores[field.id] === "number" ? scores[field.id] : null,
        max: field.max,
      })),
    };
  });
  const overall =
    !(level === "A2" && kind === "official" && scores[FLAG_A2_COMBINED] === 1) && skills.every((item) => item.scale !== null)
      ? Math.round(skills.reduce((sum, item) => sum + item.scale, 0) / skills.length)
      : null;
  return { skills, overall };
}

export function inferMode(level, kind, scoresList) {
  const scores = (scoresList || []).find((item) => item && Object.keys(item).some((key) => !MODE_FLAGS.includes(key))) || (scoresList || []).find(Boolean) || {};
  if (kind === "official") return scores[FLAG_A2_COMBINED] === 1 ? "official-combined" : "official";
  if (isYle(level)) {
    if (scores[FLAG_ITEMS] === 1) return "yle-items";
    if (scores[FLAG_LEGACY] === 1) return "yle-legacy";
    if (scores[FLAG_PARTS] === 1 || scores[`${"listening"}_raw`] == null) return "yle-parts";
    return "yle-totals";
  }
  if (scores[FLAG_WRITING_TASKS] === 1) return "tasks";
  if (Object.keys(scores).some((key) => /^w\d+_/.test(key))) return "criteria";
  return "tasks";
}

export function modeFlags(mode) {
  if (mode === "yle-parts") return { [FLAG_PARTS]: 1 };
  if (mode === "yle-items") return { [FLAG_ITEMS]: 1 };
  if (mode === "yle-legacy") return { [FLAG_LEGACY]: 1 };
  if (mode === "tasks") return { [FLAG_WRITING_TASKS]: 1 };
  if (mode === "official-combined") return { [FLAG_A2_COMBINED]: 1 };
  return {};
}

function column(id, label, group, groupId, max, step, extra = {}) {
  return { id, label, group, groupId, min: extra.min ?? 0, max, step, role: extra.role || "score", optional: !!extra.optional };
}

export function entryColumns(level, kind, mode, { includeSpeaking = true } = {}) {
  if (mode === "official" || mode === "official-combined") {
    const skills = mode === "official-combined"
      ? [
          ["readingWriting", "读写"],
          ["listening", "听力"],
          ["speaking", "口语"],
        ]
      : isYle(level)
        ? [
            ["listening", "听力"],
            ["readingWriting", "读写"],
            ["speaking", "口语"],
          ]
        : examSkills(level).map((item) => [item.id, item.label]);
    const range = SCALE_RANGE[level];
    return skills.map(([id, label]) => column(id, isYle(level) ? `${label}（盾）` : `${label}（标准分）`, label, id, range.max, 1, { min: range.min }));
  }
  if (mode === "yle-parts" || mode === "yle-items" || mode === "yle-totals" || mode === "yle-legacy") {
    const columns = [];
    if (mode === "yle-parts" || mode === "yle-items") {
      for (const skillId of ["listening", "readingWriting"]) {
        const fields = mode === "yle-parts" ? yleParts(level, skillId) : yleItems(level, skillId);
        for (const field of fields) {
          const label = mode === "yle-parts" ? `${SKILL_LABEL[skillId]}第${field.part}部分` : `${SKILL_LABEL[skillId]}第${field.part}部分第${field.id.match(/_q(\d+)/)[1]}题`;
          columns.push(column(field.id, label, SKILL_LABEL[skillId], skillId, field.max, 1));
        }
      }
    } else {
      for (const skillId of ["listening", "readingWriting"]) {
        columns.push(column(`${skillId}_raw`, `${SKILL_LABEL[skillId]}得分`, SKILL_LABEL[skillId], skillId, 10000, 0.5));
        columns.push(column(`${skillId}_max`, `${SKILL_LABEL[skillId]}满分`, SKILL_LABEL[skillId], skillId, 10000, 0.5, { role: "max" }));
      }
    }
    columns.push(column("speaking_raw", "口语得分", "口语", "speaking", 10000, 0.5));
    columns.push(column("speaking_max", "口语满分", "口语", "speaking", 10000, 0.5, { role: "max" }));
    return columns;
  }
  const columns = [];
  for (const item of examSkills(level)) {
    if (item.id === "speaking" && !includeSpeaking) continue;
    const fields = item.id === "writing" && mode === "tasks" ? writingTasks(level) : item.id === "writing" ? writingCriteria(level === "A2") : item.fields;
    for (const field of fields) {
      const label = field.label || `${item.label}第${field.part}部分`;
      columns.push(column(field.id, label.startsWith(item.label) ? label : `${item.label}第${field.part}部分`, item.label, item.id, field.max, field.step, { optional: item.id === "speaking" }));
    }
  }
  return columns;
}

export function hasNumericScore(scores) {
  return Object.entries(scores || {}).some(([key, value]) => !MODE_FLAGS.includes(key) && typeof value === "number");
}

export { SCALE_RANGE, MODE_FLAGS };
