import { normalizePaper } from "./legacy.js";
import { entryColumns, inferMode } from "./scoring.js";

/** Display rules, not a diagnosis. Shown to the teacher in the same words. */
export const ATTENTION_RULE = {
  minSample: 3,
  minGap: 10,
  tieGap: 1,
};

export const RULE_LINES = [
  "比较用正确率：得分 ÷ 满分。原始分满分不同，不直接比大小。",
  "空着、没参加、缺考都不算 0，也不算进平均。旁边写明各有几人。",
  `至少 ${ATTENTION_RULE.minSample} 人有分，并且最低的一项比下一项低至少 ${ATTENTION_RULE.minGap} 个百分点，才标成「这一次偏低」。`,
  "差距更小，或几项差不多，就不说某一项最弱。",
  "只出现一次，叫「一次信号」，不是稳定结论。同一级别、同一种考试里再出现，才标「再次出现」。",
  "不同试卷的分数差只作描述，不能当成能力提高或下降。分数也不能说明原因。",
];

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function judgeItems(items) {
  const scored = (items || []).filter((item) => item.n > 0 && Number.isFinite(item.percent));
  const eligible = scored.filter((item) => item.n >= ATTENTION_RULE.minSample);
  if (eligible.length < 2) {
    const largest = scored.reduce((max, item) => Math.max(max, item.n), 0);
    return {
      status: "insufficient",
      low: [],
      gap: null,
      message: largest > 0 && largest < ATTENTION_RULE.minSample
        ? `有分的人不足 ${ATTENTION_RULE.minSample} 人，证据太少，先不排名。`
        : "能按正确率比较的项目不足两项，先不排名。",
    };
  }
  const sorted = [...eligible].sort((a, b) => a.percent - b.percent || String(a.id).localeCompare(String(b.id)));
  const floor = sorted[0].percent;
  const low = sorted.filter((item) => item.percent - floor <= ATTENTION_RULE.tieGap);
  const next = sorted.find((item) => item.percent - floor > ATTENTION_RULE.tieGap);
  if (!next) {
    return {
      status: "tie",
      low,
      gap: 0,
      message: `${low.map((item) => item.label).join("、")}的正确率差不多，不单指某一项。`,
    };
  }
  const gap = next.percent - floor;
  if (gap < ATTENTION_RULE.minGap) {
    return {
      status: "close",
      low,
      next,
      gap,
      message: `${low.map((item) => item.label).join("、")}比${next.label}低 ${formatGap(gap)} 个百分点，差距不大，不把某一项说成最弱。`,
    };
  }
  return {
    status: "signal",
    low,
    next,
    gap,
    message: `${low.map((item) => item.label).join("、")}这一次偏低，比${next.label}低 ${formatGap(gap)} 个百分点。这是一次信号，不是稳定结论。`,
  };
}

function formatGap(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function percentEvidence(raw, max) {
  if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0) return null;
  return (raw / max) * 100;
}

export function partSnapshots(sitting, results, students) {
  if (!sitting || sitting.kind === "official") return [];
  const roster = students || [];
  const sittingResults = results.filter((result) => result.sittingId === sitting.id);
  const mode = inferMode(sitting.level, sitting.kind, sittingResults.map((result) => result.scores));
  const columns = entryColumns(sitting.level, sitting.kind, mode).filter((column) => column.role === "score" && column.max > 0 && column.max < 1000);
  return columns.map((column) => {
    const scored = [];
    let blank = 0;
    let absent = 0;
    let notEntered = 0;
    for (const student of roster) {
      const result = sittingResults.find((item) => item.studentId === student.id);
      if (!result) {
        notEntered += 1;
        continue;
      }
      if (result.status === "absent") {
        absent += 1;
        continue;
      }
      const raw = result.scores?.[column.id];
      if (typeof raw !== "number") {
        blank += 1;
        continue;
      }
      scored.push({ studentId: student.id, name: student.name, raw, percent: percentEvidence(raw, column.max) });
    }
    const percents = scored.map((item) => item.percent);
    const raws = scored.map((item) => item.raw);
    return {
      id: column.id,
      label: column.label,
      group: column.group,
      groupId: column.groupId,
      max: column.max,
      n: scored.length,
      blank,
      absent,
      notEntered,
      percent: average(percents),
      rawAverage: average(raws),
      students: scored,
    };
  }).filter((part) => part.n + part.blank + part.absent + part.notEntered > 0);
}

function comparableSittings(sittings, level, kind) {
  return sittings
    .filter((sitting) => sitting.level === level && sitting.kind === kind && sitting.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function classAttention({ students, sittings, results }) {
  const groups = new Map();
  for (const sitting of sittings) {
    if (sitting.kind === "official" || sitting.kind === "classroom") continue;
    const key = `${sitting.level}|${sitting.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sitting);
  }
  const found = [];
  for (const [key, group] of groups) {
    const [level, kind] = key.split("|");
    const ordered = comparableSittings(group, level, kind);
    const history = new Map();
    for (const sitting of ordered) {
      const parts = partSnapshots(sitting, results, students);
      const judgement = judgeItems(parts);
      if (judgement.status !== "signal") continue;
      for (const item of judgement.low) {
        const full = parts.find((part) => part.id === item.id);
        const record = history.get(item.id) || { hits: [] };
        record.hits.push({ sitting, item: full, gap: judgement.gap, nextLabel: judgement.next?.label || "" });
        history.set(item.id, record);
      }
    }
    for (const [partId, record] of history) {
      const latest = record.hits[record.hits.length - 1];
      const mean = latest.item.percent;
      const scoredStudents = latest.item.students || [];
      const percents = scoredStudents.map((student) => student.percent);
      const spread = percents.length ? Math.max(...percents) - Math.min(...percents) : 0;
      const affected = spread <= ATTENTION_RULE.tieGap ? [] : scoredStudents.filter((student) => Number.isFinite(mean) && student.percent <= mean).sort((a, b) => a.percent - b.percent);
      found.push({
        id: `${level}|${kind}|${partId}`,
        level,
        kind,
        partId,
        label: latest.item.label,
        repeated: record.hits.length >= 2,
        hitCount: record.hits.length,
        gap: latest.gap,
        percent: latest.item.percent,
        rawAverage: latest.item.rawAverage,
        max: latest.item.max,
        n: latest.item.n,
        blank: latest.item.blank,
        absent: latest.item.absent,
        notEntered: latest.item.notEntered,
        sittingId: latest.sitting.id,
        date: latest.sitting.date,
        paper: latest.sitting.paper,
        affected,
        hits: record.hits.map((hit) => ({ sittingId: hit.sitting.id, date: hit.sitting.date, paper: hit.sitting.paper, percent: hit.item.percent, n: hit.item.n })),
      });
    }
  }
  found.sort((a, b) => Number(b.repeated) - Number(a.repeated) || b.date.localeCompare(a.date) || b.gap - a.gap);
  return { items: found.slice(0, 3), rules: RULE_LINES };
}

export function cohortCompare(earlier, later, students, results, partId, max) {
  if (!earlier || !later || earlier.id === later.id) return { ok: false, reason: "需要两场不同的考试。" };
  if (earlier.level !== later.level || earlier.kind !== later.kind) {
    return { ok: false, reason: "级别或考试类型不同，这两列分数不能相减。" };
  }
  const rows = students.map((student) => ({
    student,
    earlier: cellState(earlier, results, student.id, partId, max),
    later: cellState(later, results, student.id, partId, max),
  }));
  const matched = rows.filter((row) => row.earlier.state === "scored" && row.later.state === "scored");
  const earlierMean = average(matched.map((row) => row.earlier.percent));
  const laterMean = average(matched.map((row) => row.later.percent));
  const samePaper = normalizePaper(earlier.paper) === normalizePaper(later.paper);
  return {
    ok: true,
    samePaper,
    matchedCount: matched.length,
    earlierScored: rows.filter((row) => row.earlier.state === "scored").length,
    laterScored: rows.filter((row) => row.later.state === "scored").length,
    earlierAbsent: rows.filter((row) => row.earlier.state === "absent").length,
    laterAbsent: rows.filter((row) => row.later.state === "absent").length,
    earlierMissing: rows.filter((row) => row.earlier.state === "missing" || row.earlier.state === "blank").length,
    laterMissing: rows.filter((row) => row.later.state === "missing" || row.later.state === "blank").length,
    onlyEarlier: rows.filter((row) => row.earlier.state === "scored" && row.later.state !== "scored").map((row) => row.student),
    onlyLater: rows.filter((row) => row.later.state === "scored" && row.earlier.state !== "scored").map((row) => row.student),
    delta: matched.length ? laterMean - earlierMean : null,
    earlierMean,
    laterMean,
    rows,
    note: samePaper
      ? "同一份试卷上的分数差也只是描述，不能单独当成能力变化的证据。"
      : "两次试卷不同。分数差只描述卷面差别，不能当成能力提高或下降的证据。",
  };
}

function cellState(sitting, results, studentId, partId, max) {
  const result = results.find((item) => item.sittingId === sitting.id && item.studentId === studentId);
  if (!result) return { state: "missing" };
  if (result.status === "absent") return { state: "absent" };
  const raw = result.scores?.[partId];
  if (typeof raw !== "number") return { state: "blank" };
  return { state: "scored", raw, percent: percentEvidence(raw, max) };
}

export function evidenceLine(item) {
  const percent = formatGap(item.percent);
  const raw = formatGap(item.rawAverage);
  const max = formatGap(item.max);
  const bits = [`${percent}%（${raw}/${max}）`, `${item.n} 人有分`];
  if (item.blank) bits.push(`${item.blank} 人这格空着`);
  if (item.absent) bits.push(`${item.absent} 人缺考`);
  if (item.notEntered) bits.push(`${item.notEntered} 人没有这场记录`);
  return bits.join("，");
}

export function laterFollowUp(followUp, sittings, results, students) {
  if (!followUp?.createdAt) return [];
  const after = followUp.createdAt.slice(0, 10);
  return comparableSittings(sittings, followUp.level, followUp.kind)
    .filter((sitting) => sitting.date > after)
    .map((sitting) => {
      const part = partSnapshots(sitting, results, students).find((item) => item.id === followUp.partId);
      if (!part || part.n < 1) return null;
      return {
        sittingId: sitting.id,
        date: sitting.date,
        paper: sitting.paper,
        percent: part.percent,
        rawAverage: part.rawAverage,
        max: part.max,
        n: part.n,
        note: "这是后来那场的正确率，不是对教学效果的判断。",
      };
    })
    .filter(Boolean);
}
