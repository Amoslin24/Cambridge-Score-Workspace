import { judgeItems } from "./attention.js";
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

export function takeaway({ skills, parts, deltas, kind = "practice" }) {
  const judgement = judgeItems((parts || []).filter((part) => Number.isFinite(part.percent)));
  if (kind === "official") {
    const move = descriptiveMove(deltas);
    return move ? `${move}正式成绩是标准分或盾，不按卷面正确率排名。` : "正式成绩是标准分或盾，不按卷面正确率排名。";
  }
  if ((parts || []).some((part) => part.n > 0)) return judgement.message;
  if ((skills || []).length === 1) return `这次只记下了${skills[0].label}，一项不能比较高低。`;
  return "这场还没有可以按正确率比较的部分。";
}

function descriptiveMove(deltas) {
  const moves = (deltas || []).filter((item) => Number.isFinite(item.delta) && item.unit === item.unit);
  if (!moves.length) return "";
  const biggest = [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  if (Math.abs(biggest.delta) < 0.05) return "和上场比，各项分数差不多。";
  const direction = biggest.delta > 0 ? "高" : "低";
  return `${biggest.label}比上场${direction} ${unitWord(biggest.unit, biggest.delta)}。这只是分数差，不是能力结论。`;
}

export function classReport(sitting, results, previousSitting, allResults, students) {
  const skills = skillSummary(sitting, results);
  const parts = partSummary(sitting, results);
  const pairs = previousSitting ? skills.map((skill) => matchedSkillPair(previousSitting, sitting, allResults, skill.id, students)) : [];
  const deltas = pairs.filter((pair) => pair.matchedCount).map((pair) => ({
    id: pair.skillId,
    label: skills.find((skill) => skill.id === pair.skillId)?.label || pair.skillId,
    unit: pair.unit,
    delta: pair.delta,
    average: pair.matchedMeanAfter,
    previous: pair.matchedMeanBefore,
    n: pair.matchedCount,
  }));
  return { skills, parts, deltas, pairs, sentence: takeaway({ skills, parts, deltas, kind: sitting.kind }) };
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
      return { sittingId: sitting.id, date: sitting.date, paper: sitting.paper, value: skill.average, unit: skill.unit, n: skill.n, raw: skill.rawAverage, max: skill.max, descriptive: true };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sittingId.localeCompare(b.sittingId));
}

export function skillObservation(sitting, result, skillId) {
  if (!result) return { state: "missing" };
  if (result.status === "absent") return { state: "absent" };
  const metrics = resultMetrics(sitting, result);
  if (metrics.error) return { state: "invalid" };
  const skill = metrics.skills.find((item) => item.id === skillId);
  if (!skill || !Number.isFinite(skill.value)) return { state: "incomplete" };
  return { state: "complete", value: skill.value, raw: skill.raw, max: skill.max, unit: skill.unit };
}

function peopleIn(sitting, results, students) {
  const ids = new Set([...(students || []).map((student) => student.id), ...results.filter((result) => result.sittingId === sitting.id).map((result) => result.studentId)]);
  const known = new Map((students || []).map((student) => [student.id, student]));
  return [...ids].map((id) => known.get(id) || { id, name: id });
}

export function matchedSkillPair(earlier, later, results, skillId, students) {
  const roster = peopleIn(earlier, results, students).concat(peopleIn(later, results, []).filter((student) => !peopleIn(earlier, results, students).some((item) => item.id === student.id)));
  const unique = [...new Map(roster.map((student) => [student.id, student])).values()];
  const rows = unique.map((student) => ({
    student,
    before: skillObservation(earlier, results.find((result) => result.sittingId === earlier.id && result.studentId === student.id), skillId),
    after: skillObservation(later, results.find((result) => result.sittingId === later.id && result.studentId === student.id), skillId),
  }));
  const matched = rows.filter((row) => row.before.state === "complete" && row.after.state === "complete");
  const beforeOnly = rows.filter((row) => row.before.state === "complete");
  const afterOnly = rows.filter((row) => row.after.state === "complete");
  const unit = matched[0]?.before.unit || beforeOnly[0]?.before.unit || afterOnly[0]?.after.unit || "percent";
  const max = matched[0]?.before.max || beforeOnly[0]?.before.max || afterOnly[0]?.after.max || null;
  const matchedMeanBefore = average(matched.map((row) => row.before.value));
  const matchedMeanAfter = average(matched.map((row) => row.after.value));
  return {
    skillId,
    earlier,
    later,
    rows,
    matched,
    matchedCount: matched.length,
    matchedMeanBefore,
    matchedMeanAfter,
    matchedRawBefore: average(matched.map((row) => row.before.raw)),
    matchedRawAfter: average(matched.map((row) => row.after.raw)),
    delta: matched.length ? matchedMeanAfter - matchedMeanBefore : null,
    unit,
    max,
    descriptiveBefore: average(beforeOnly.map((row) => row.before.value)),
    descriptiveAfter: average(afterOnly.map((row) => row.after.value)),
    descriptiveRawBefore: average(beforeOnly.map((row) => row.before.raw)),
    descriptiveRawAfter: average(afterOnly.map((row) => row.after.raw)),
    descriptiveBeforeN: beforeOnly.length,
    descriptiveAfterN: afterOnly.length,
    excluded: rows.filter((row) => !(row.before.state === "complete" && row.after.state === "complete")),
  };
}

function exclusionText(row) {
  const side = (state, when) => {
    if (state === "absent") return `${when}缺考`;
    if (state === "missing") return `${when}没有记录`;
    if (state === "incomplete") return `${when}这一项没填完（空着不算 0）`;
    if (state === "invalid") return `${when}算不出来`;
    return "";
  };
  return [side(row.before.state, "前一场"), side(row.after.state, "后一场")].filter(Boolean).join("，");
}

export function matchedPairNarrative(pair, label) {
  const sentences = [];
  if (!pair.matchedCount) sentences.push(`${label}没有同一批完整成绩，不能说上升或下降。`);
  else if (Math.abs(pair.delta) < 0.05) sentences.push(`同一批 ${pair.matchedCount} 人的${label}和上场差不多。这只是分数描述，不是能力结论。`);
  else sentences.push(`同一批 ${pair.matchedCount} 人的${label}比上场${pair.delta > 0 ? "高" : "低"} ${unitWord(pair.unit, pair.delta)}。这只是分数差，不是能力结论。`);
  if (pair.matchedCount && pair.unit === "percent" && Number.isFinite(pair.matchedRawBefore) && Number.isFinite(pair.max)) {
    sentences.push(`这批人是 ${formatNumber(pair.matchedRawBefore)}/${formatNumber(pair.max)} 到 ${formatNumber(pair.matchedRawAfter)}/${formatNumber(pair.max)}。`);
  }
  if (pair.excluded.length) sentences.push(`没有算进比较：${pair.excluded.map((row) => `${row.student.name}（${exclusionText(row)}）`).join("，")}。`);
  const differentPeople = pair.descriptiveBeforeN !== pair.matchedCount || pair.descriptiveAfterN !== pair.matchedCount;
  if (differentPeople && pair.descriptiveBeforeN && pair.descriptiveAfterN && Number.isFinite(pair.descriptiveRawBefore)) {
    sentences.push(`各场各自有分的人是 ${formatNumber(pair.descriptiveRawBefore)}/${formatNumber(pair.max)}（${pair.descriptiveBeforeN} 人）和 ${formatNumber(pair.descriptiveRawAfter)}/${formatNumber(pair.max)}（${pair.descriptiveAfterN} 人）。这两次不是同一批人，不能当成提高或下降。`);
  }
  return sentences.join("");
}

export function classSkillTrend(sittings, results, { level, kind, skillId, students }) {
  const ordered = sittings.filter((sitting) => sitting.level === level && sitting.kind === kind && sitting.date).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const pairs = [];
  for (let index = 1; index < ordered.length; index += 1) pairs.push(matchedSkillPair(ordered[index - 1], ordered[index], results, skillId, students));
  const latest = pairs.at(-1) || null;
  const chart = latest?.matchedCount
    ? [
        { date: latest.earlier.date, paper: latest.earlier.paper, value: latest.matchedMeanBefore, raw: latest.matchedRawBefore, max: latest.max, unit: latest.unit, n: latest.matchedCount },
        { date: latest.later.date, paper: latest.later.paper, value: latest.matchedMeanAfter, raw: latest.matchedRawAfter, max: latest.max, unit: latest.unit, n: latest.matchedCount },
      ]
    : [];
  return { pairs, latest, chart };
}

export function seriesDelta(series) {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const before = series[series.length - 2];
  return { delta: last.value - before.value, unit: last.unit, from: before.date, to: last.date };
}

export function deltaPhrase(delta, unit, noun) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return `${noun}和上场差不多。这只是分数描述，不是能力结论`;
  return `${noun}比上场${delta > 0 ? "高" : "低"} ${unitWord(unit, delta)}。这只是分数差，不是能力结论`;
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
  if (moves.length && moves.every((item) => Math.abs(item.delta) < 0.05)) parts.push("各科分数和上场差不多。这只是分数描述，不是能力结论");
  else if (moves.length) {
    const biggest = [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    parts.push(deltaPhrase(biggest.delta, biggest.unit, biggest.label));
  }
  if (!parts.length) return latestSkills.length ? `${studentName}记下了${latestSkills.map((skill) => skill.label).join("、")}。一项或一场分数不比较高低。` : `${studentName}还没有可计算的成绩。`;
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
