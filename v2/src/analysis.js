import { calculate, entryColumns, inferMode, levelLabel, SKILL_LABEL } from "./scoring.js";

export function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatDate(iso, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "日期未填";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const body = `${month}月${day}日`;
  return year === now.getFullYear() ? body : `${year}年${body}`;
}

export function sittingTitle(sitting, now = new Date()) {
  const paper = sitting.paper ? sitting.paper : "试卷未写名称";
  const kind = sitting.kind === "official" ? "正式" : sitting.kind === "classroom" ? "课堂" : "练习";
  const level = levelLabel(sitting.level);
  const alreadyNamed = paper === level || paper.startsWith(`${level} `) || paper.startsWith(`${level}·`) || paper.startsWith(`${level} ·`);
  const body = alreadyNamed ? paper : `${level} · ${paper}`;
  return `${formatDate(sitting.date, now)} · ${body} · ${kind}`;
}

function scoredResults(sitting, results) {
  return results.filter((result) => result.sittingId === sitting.id && result.status !== "absent");
}

export function resultMetrics(sitting, result) {
  if (!result || result.status === "absent") return { absent: result?.status === "absent", skills: [], overall: null };
  try {
    const calculated = calculate(sitting.level, result.scores || {}, sitting.kind);
    const skills = calculated.skills
      .filter((skill) => skill.complete)
      .map((skill) => ({
        id: skill.id,
        label: SKILL_LABEL[skill.id] || skill.label,
        unit: sitting.kind === "official" ? (skill.shields != null ? "shield" : "scale") : "percent",
        value: sitting.kind === "official" ? (skill.shields ?? skill.scale) : skill.percent,
        raw: skill.raw,
        max: skill.max,
        shields: skill.shields,
        scale: skill.scale,
        estimatedShields: skill.estimatedShields,
        parts: skill.parts || [],
      }));
    return { absent: false, skills, overall: calculated.overall, error: "" };
  } catch (error) {
    return { absent: false, skills: [], overall: null, error: error instanceof Error ? error.message : "这组成绩暂时算不出来" };
  }
}

function average(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function skillSummary(sitting, results) {
  const rows = scoredResults(sitting, results).map((result) => resultMetrics(sitting, result)).filter((row) => !row.error);
  const ids = [];
  for (const row of rows) for (const skill of row.skills) if (!ids.includes(skill.id)) ids.push(skill.id);
  return ids.map((id) => {
    const found = rows.flatMap((row) => row.skills.filter((skill) => skill.id === id));
    const unit = found[0]?.unit || "percent";
    return {
      id,
      label: found[0]?.label || SKILL_LABEL[id] || id,
      unit,
      average: average(found.map((skill) => skill.value)),
      rawAverage: average(found.map((skill) => skill.raw).filter((value) => Number.isFinite(value))),
      max: found.find((skill) => Number.isFinite(skill.max))?.max ?? null,
      estimatedShield: average(found.map((skill) => skill.estimatedShields).filter((value) => Number.isFinite(value))),
      n: found.length,
    };
  }).filter((skill) => skill.n > 0 && Number.isFinite(skill.average));
}

export function partSummary(sitting, results) {
  if (sitting.kind === "official") return [];
  const relevant = results.filter((result) => result.sittingId === sitting.id);
  const mode = inferMode(sitting.level, sitting.kind, relevant.map((result) => result.scores));
  const columns = entryColumns(sitting.level, sitting.kind, mode).filter((column) => column.role === "score");
  return columns.map((column) => {
    const values = relevant
      .filter((result) => result.status !== "absent")
      .map((result) => result.scores?.[column.id])
      .filter((value) => typeof value === "number");
    const avg = average(values);
    return {
      id: column.id,
      label: column.label,
      group: column.group,
      groupId: column.groupId,
      max: column.max,
      average: avg,
      percent: avg == null || !column.max ? null : (avg / column.max) * 100,
      n: values.length,
    };
  }).filter((part) => part.n > 0 && Number.isFinite(part.average) && part.max > 0 && part.max <= 1000);
}

function weakest(items, valueOf) {
  const usable = items.filter((item) => Number.isFinite(valueOf(item)));
  if (usable.length < 2) return [];
  const lowest = Math.min(...usable.map(valueOf));
  return usable.filter((item) => valueOf(item) === lowest);
}

function strongest(items, valueOf) {
  const usable = items.filter((item) => Number.isFinite(valueOf(item)));
  if (usable.length < 2) return [];
  const highest = Math.max(...usable.map(valueOf));
  return usable.filter((item) => valueOf(item) === highest);
}

function unitWord(unit, delta) {
  const number = formatNumber(Math.abs(delta));
  if (unit === "shield") return `${number} 盾`;
  if (unit === "percent") return `${formatNumber(Math.abs(delta))} 个百分点`;
  return `${number} 分`;
}

function moveClause(skill, delta) {
  if (!skill || !Number.isFinite(delta) || Math.abs(delta) < 0.05) return "";
  const direction = delta > 0 ? "提高" : "下降";
  return `${skill.label}比上次${direction} ${unitWord(skill.unit, delta)}`;
}

export function compareSkills(current, previous) {
  if (!previous) return [];
  return current
    .map((skill) => {
      const before = previous.find((item) => item.id === skill.id && item.unit === skill.unit);
      if (!before) return null;
      return { ...skill, previous: before.average, delta: skill.average - before.average };
    })
    .filter(Boolean);
}

export function takeaway({ skills, parts, deltas }) {
  const sentences = [];
  const moves = (deltas || []).filter((item) => Number.isFinite(item.delta));
  if (moves.length) {
    const ranked = [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const biggest = ranked[0];
    const flat = moves.every((item) => Math.abs(item.delta) < 0.05);
    if (flat) sentences.push("各科和上次持平");
    else if (biggest) sentences.push(moveClause(biggest, biggest.delta));
  }
  const weakSkills = weakest(skills || [], (skill) => skill.average);
  const strongSkills = strongest(skills || [], (skill) => skill.average);
  if (weakSkills.length && !(strongSkills.length === 1 && weakSkills.length === 1 && strongSkills[0].id === weakSkills[0].id)) {
    const names = weakSkills.map((skill) => skill.label).join("、");
    const sample = weakSkills[0];
    const value = sample.unit === "percent" && Number.isFinite(sample.rawAverage) && sample.max
      ? `${formatNumber(sample.rawAverage)}/${formatNumber(sample.max)}`
      : sample.unit === "shield"
        ? `${formatNumber(sample.average)} 盾`
        : `${formatNumber(sample.average)} 分`;
    sentences.push(`${names}最弱（班均 ${value}）`);
  } else if (strongSkills.length && weakSkills.length && strongSkills[0].id !== weakSkills[0].id) {
    sentences.push(`${strongSkills.map((skill) => skill.label).join("、")}最高，${weakSkills.map((skill) => skill.label).join("、")}最弱`);
  }
  const weakParts = weakest(parts || [], (part) => part.percent);
  if (weakParts.length) {
    const names = weakParts.map((part) => part.label).join("、");
    const sample = weakParts[0];
    sentences.push(`${names}最低（班均 ${formatNumber(sample.average)}/${formatNumber(sample.max)}）`);
  }
  if (!sentences.length) {
    if ((skills || []).length === 1) return `这次记下了${skills[0].label}。`;
    if ((parts || []).length === 1) return `这次记下了${parts[0].label}。`;
    return "这场还没有可以比较的分数。";
  }
  return `${sentences.join("，")}。`;
}

export function classReport(sitting, results, previousSitting, allResults) {
  const skills = skillSummary(sitting, results);
  const parts = partSummary(sitting, results);
  const previous = previousSitting ? skillSummary(previousSitting, allResults) : [];
  const deltas = compareSkills(skills, previous);
  return { skills, parts, deltas, sentence: takeaway({ skills, parts, deltas }) };
}

export function previousComparableSitting(sitting, sittings) {
  return sittings
    .filter((item) => item.id !== sitting.id && item.level === sitting.level && item.kind === sitting.kind && item.date && sitting.date && item.date < sitting.date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0] || null;
}

export function studentSkillSeries(studentId, sittings, results, { level, kind, skillId }) {
  return sittings
    .filter((sitting) => sitting.level === level && sitting.kind === kind && sitting.date)
    .map((sitting) => {
      const result = results.find((item) => item.sittingId === sitting.id && item.studentId === studentId);
      const metrics = resultMetrics(sitting, result);
      const skill = metrics.skills.find((item) => item.id === skillId);
      if (!skill || !Number.isFinite(skill.value)) return null;
      return { sittingId: sitting.id, date: sitting.date, paper: sitting.paper, value: skill.value, unit: skill.unit, raw: skill.raw, max: skill.max };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sittingId.localeCompare(b.sittingId));
}

export function classSkillSeries(sittings, results, { level, kind, skillId }) {
  return sittings
    .filter((sitting) => sitting.level === level && sitting.kind === kind && sitting.date)
    .map((sitting) => {
      const skill = skillSummary(sitting, results).find((item) => item.id === skillId);
      if (!skill) return null;
      return { sittingId: sitting.id, date: sitting.date, paper: sitting.paper, value: skill.average, unit: skill.unit, n: skill.n, raw: skill.rawAverage, max: skill.max };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sittingId.localeCompare(b.sittingId));
}

export function seriesDelta(series) {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const before = series[series.length - 2];
  return { delta: last.value - before.value, unit: last.unit, from: before.date, to: last.date };
}

export function deltaPhrase(delta, unit, noun) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return `${noun}和上次持平`;
  return `${noun}比上次${delta > 0 ? "提高" : "下降"} ${unitWord(unit, delta)}`;
}

export function studentSentence(studentName, latestSkills, seriesBySkill) {
  const moves = latestSkills
    .map((skill) => {
      const series = seriesBySkill[skill.id] || [];
      const change = seriesDelta(series);
      if (!change) return null;
      return { ...skill, delta: change.delta };
    })
    .filter(Boolean);
  const parts = [];
  if (moves.length && moves.every((item) => Math.abs(item.delta) < 0.05)) parts.push("各科和上次持平");
  else if (moves.length) {
    const biggest = [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    parts.push(deltaPhrase(biggest.delta, biggest.unit, biggest.label));
  }
  const weak = weakest(latestSkills, (skill) => skill.value);
  if (weak.length >= 1 && latestSkills.length >= 2) parts.push(`这次${weak.map((skill) => skill.label).join("、")}最弱`);
  if (!parts.length) return latestSkills.length ? `${studentName}这次记下了${latestSkills.map((skill) => skill.label).join("、")}。` : `${studentName}还没有可计算的成绩。`;
  return `${parts.join("，")}。`;
}

export function canCompare(left, right) {
  if (!left || !right || left.id === right.id) return { ok: false, reason: "请选择两场不同的考试。" };
  if (left.level !== right.level || left.kind !== right.kind) {
    return { ok: false, reason: "这两场的级别或计分方式不同，不能把数字直接相减。" };
  }
  return { ok: true, reason: "" };
}

export function orderedPair(left, right) {
  if (!left || !right) return [left, right];
  if (left.date && right.date && left.date > right.date) return [right, left];
  return [left, right];
}
