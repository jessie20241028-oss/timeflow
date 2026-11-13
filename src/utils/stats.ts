import {
  ActivityCategory,
  CATEGORY_LIST,
  CATEGORY_MAP,
  DailyDiary,
  DailyTask,
  DiarySnapshotContent,
  ReviewPeriodType,
  TimeEntry,
} from '../types/timeflow';

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(dateStr: string, delta: number): string {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + delta);
  return formatLocalDate(dt);
}

export function getWeekdayLabel(dateStr: string): string {
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return days[parseLocalDate(dateStr).getDay()] ?? '';
}

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  return Math.max(0, Math.min(1440, h * 60 + m));
}

export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatHours(minutes: number): string {
  const hrs = minutes / 60;
  return hrs.toFixed(1);
}

export function formatDurationHuman(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded <= 0) return '0 分钟';
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

export function getEntryDurationMinutes(entry: TimeEntry): number {
  const s = timeToMinutes(entry.startTime);
  const e = timeToMinutes(entry.endTime);
  if (entry.crossDay || e < s || (e === s && entry.crossDay)) {
    return 1440 - s + e;
  }
  return Math.max(0, e - s);
}

export interface DaySlice {
  date: string;
  startMin: number;
  endMin: number;
  entry: TimeEntry;
}

/**
 * Splits entries across midnight into per-local-day intervals [startMin, endMin).
 */
export function expandEntriesToSlices(entries: TimeEntry[]): DaySlice[] {
  const slices: DaySlice[] = [];
  for (const entry of entries) {
    const s = timeToMinutes(entry.startTime);
    const e = timeToMinutes(entry.endTime);
    const isCross = Boolean(entry.crossDay) || e < s;
    if (!isCross) {
      if (e > s) {
        slices.push({ date: entry.date, startMin: s, endMin: e, entry });
      }
    } else {
      if (1440 > s) {
        slices.push({ date: entry.date, startMin: s, endMin: 1440, entry });
      }
      if (e > 0) {
        slices.push({ date: addDays(entry.date, 1), startMin: 0, endMin: e, entry });
      }
    }
  }
  return slices;
}

interface Interval {
  start: number;
  end: number;
}

export function computeIntervalUnionMinutes(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (sorted.length === 0) return 0;
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start <= curEnd) {
      curEnd = Math.max(curEnd, next.end);
    } else {
      total += curEnd - curStart;
      curStart = next.start;
      curEnd = next.end;
    }
  }
  total += curEnd - curStart;
  return total;
}

export function findOverlappingEntryIdsForDate(entries: TimeEntry[], date: string): Set<string> {
  const slices = expandEntriesToSlices(entries).filter(
    (s) => s.date === date && s.entry.status !== 'cancelled',
  );
  const overlapping = new Set<string>();
  for (let i = 0; i < slices.length; i++) {
    for (let j = i + 1; j < slices.length; j++) {
      const a = slices[i];
      const b = slices[j];
      if (Math.max(a.startMin, b.startMin) < Math.min(a.endMin, b.endMin)) {
        overlapping.add(a.entry.id);
        overlapping.add(b.entry.id);
      }
    }
  }
  return overlapping;
}

export interface RangeStatistics {
  startDate: string;
  endDate: string;
  totalEntries: number;
  recordedMinutes: number; // deduplicated union of non-cancelled entries
  plannedMinutes: number; // deduplicated union of planned entries (!isUnplanned)
  plannedCompletedMinutes: number; // deduplicated union of completed planned entries
  completedMinutes: number; // deduplicated union of all status === 'completed'
  effectiveMinutes: number; // deduplicated union of completed effective categories (work, learning, reading, exercise)
  restMinutes: number; // deduplicated union of rest (never counted in work!)
  unplannedMinutes: number; // deduplicated union of unplanned entries
  completionRate: number; // 0..100 (plannedCompletedMinutes / plannedMinutes)
  unplannedRate: number; // 0..100
  categoryMinutes: Record<ActivityCategory, number>; // overlap-resolved timeline allocation summing to recordedMinutes
  categoryCompletedMinutes: Record<ActivityCategory, number>;
  dailySeries: Array<{
    date: string;
    shortDate: string;
    recordedHours: number;
    completedHours: number;
    plannedHours: number;
    workHours: number;
    learningHours: number;
    exerciseHours: number;
    restHours: number;
    otherHours: number;
  }>;
}

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const STATUS_RANK: Record<string, number> = { completed: 4, in_progress: 3, planned: 2, cancelled: 0 };

/**
 * Computes exact statistics over [startDate, endDate] inclusive.
 * Enforces all Section V statistical rules:
 * 1. Duration = end - start (with cross-day split).
 * 2. Overlapping intervals on the same day never double-count.
 * 3. Category breakdown resolves overlapping minutes deterministically so sum(categories) === total recorded union.
 * 4. Rest is tracked independently and never added to work.
 * 5. Unfilled slots are never assumed as rest.
 * 6. Planned and actual completed time are computed separately; unfinished tasks never count as completed.
 */
export function computeRangeStats(
  entries: TimeEntry[],
  startDate: string,
  endDate: string,
): RangeStatistics {
  const allSlices = expandEntriesToSlices(entries).filter(
    (s) => s.date >= startDate && s.date <= endDate && s.entry.status !== 'cancelled',
  );

  // Build date sequence
  const dateList: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 400) {
    dateList.push(cursor);
    cursor = addDays(cursor, 1);
    guard++;
  }

  const slicesByDate = new Map<string, DaySlice[]>();
  for (const s of allSlices) {
    const arr = slicesByDate.get(s.date) ?? [];
    arr.push(s);
    slicesByDate.set(s.date, arr);
  }

  const categoryMinutes: Record<ActivityCategory, number> = {
    work: 0,
    learning: 0,
    reading: 0,
    exercise: 0,
    life: 0,
    rest: 0,
    entertainment: 0,
    commute: 0,
    other: 0,
  };
  const categoryCompletedMinutes: Record<ActivityCategory, number> = { ...categoryMinutes };

  let recordedMinutes = 0;
  let plannedMinutes = 0;
  let plannedCompletedMinutes = 0;
  let completedMinutes = 0;
  let effectiveMinutes = 0;
  let restMinutes = 0;
  let unplannedMinutes = 0;

  const uniqueEntryIds = new Set<string>();
  const dailySeries: RangeStatistics['dailySeries'] = [];

  for (const date of dateList) {
    const daySlices = slicesByDate.get(date) ?? [];
    for (const ds of daySlices) uniqueEntryIds.add(ds.entry.id);

    // Exact union for total recorded / planned / completed
    const dayRecordedUnion = computeIntervalUnionMinutes(
      daySlices.map((s) => ({ start: s.startMin, end: s.endMin })),
    );
    const dayPlannedUnion = computeIntervalUnionMinutes(
      daySlices
        .filter((s) => !s.entry.isUnplanned)
        .map((s) => ({ start: s.startMin, end: s.endMin })),
    );
    const dayPlannedCompletedUnion = computeIntervalUnionMinutes(
      daySlices
        .filter((s) => !s.entry.isUnplanned && s.entry.status === 'completed')
        .map((s) => ({ start: s.startMin, end: s.endMin })),
    );
    const dayCompletedUnion = computeIntervalUnionMinutes(
      daySlices
        .filter((s) => s.entry.status === 'completed')
        .map((s) => ({ start: s.startMin, end: s.endMin })),
    );
    const dayEffectiveUnion = computeIntervalUnionMinutes(
      daySlices
        .filter((s) => s.entry.status === 'completed' && CATEGORY_MAP[s.entry.category].isEffective)
        .map((s) => ({ start: s.startMin, end: s.endMin })),
    );
    const dayRestUnion = computeIntervalUnionMinutes(
      daySlices
        .filter((s) => CATEGORY_MAP[s.entry.category].isRest)
        .map((s) => ({ start: s.startMin, end: s.endMin })),
    );
    const dayUnplannedUnion = computeIntervalUnionMinutes(
      daySlices
        .filter((s) => s.entry.isUnplanned)
        .map((s) => ({ start: s.startMin, end: s.endMin })),
    );

    // Minute-by-minute deterministic timeline attribution for non-overlapping category breakdown
    const dayCatMins: Record<ActivityCategory, number> = {
      work: 0,
      learning: 0,
      reading: 0,
      exercise: 0,
      life: 0,
      rest: 0,
      entertainment: 0,
      commute: 0,
      other: 0,
    };

    if (daySlices.length > 0) {
      // Sort slices so higher status rank, higher priority, later updated wins overlapping minutes
      const ordered = [...daySlices].sort((a, b) => {
        const sr = (STATUS_RANK[b.entry.status] ?? 0) - (STATUS_RANK[a.entry.status] ?? 0);
        if (sr !== 0) return sr;
        const pr = (PRIORITY_RANK[b.entry.priority] ?? 0) - (PRIORITY_RANK[a.entry.priority] ?? 0);
        if (pr !== 0) return pr;
        return b.entry.updatedAt - a.entry.updatedAt;
      });

      const ownerCat = new Int8Array(1440).fill(-1);
      const ownerCompletedCat = new Int8Array(1440).fill(-1);
      const catIndexMap = new Map<ActivityCategory, number>();
      CATEGORY_LIST.forEach((c, idx) => catIndexMap.set(c.id, idx));

      for (const s of ordered) {
        const catIdx = catIndexMap.get(s.entry.category) ?? 8;
        for (let m = s.startMin; m < s.endMin; m++) {
          if (ownerCat[m] === -1) {
            ownerCat[m] = catIdx;
          }
          if (s.entry.status === 'completed' && ownerCompletedCat[m] === -1) {
            ownerCompletedCat[m] = catIdx;
          }
        }
      }

      for (let m = 0; m < 1440; m++) {
        if (ownerCat[m] !== -1) {
          const cat = CATEGORY_LIST[ownerCat[m]].id;
          dayCatMins[cat]++;
          categoryMinutes[cat]++;
        }
        if (ownerCompletedCat[m] !== -1) {
          const cat = CATEGORY_LIST[ownerCompletedCat[m]].id;
          categoryCompletedMinutes[cat]++;
        }
      }
    }

    recordedMinutes += dayRecordedUnion;
    plannedMinutes += dayPlannedUnion;
    plannedCompletedMinutes += dayPlannedCompletedUnion;
    completedMinutes += dayCompletedUnion;
    effectiveMinutes += dayEffectiveUnion;
    restMinutes += dayRestUnion;
    unplannedMinutes += dayUnplannedUnion;

    dailySeries.push({
      date,
      shortDate: date.slice(5),
      recordedHours: Number((dayRecordedUnion / 60).toFixed(2)),
      completedHours: Number((dayCompletedUnion / 60).toFixed(2)),
      plannedHours: Number((dayPlannedUnion / 60).toFixed(2)),
      workHours: Number((dayCatMins.work / 60).toFixed(2)),
      learningHours: Number(((dayCatMins.learning + dayCatMins.reading) / 60).toFixed(2)),
      exerciseHours: Number((dayCatMins.exercise / 60).toFixed(2)),
      restHours: Number((dayCatMins.rest / 60).toFixed(2)),
      otherHours: Number(
        ((dayCatMins.life + dayCatMins.entertainment + dayCatMins.commute + dayCatMins.other) / 60).toFixed(2),
      ),
    });
  }

  const completionRate =
    plannedMinutes > 0 ? Math.round((plannedCompletedMinutes / plannedMinutes) * 100) : 0;
  const unplannedRate =
    recordedMinutes > 0 ? Math.round((unplannedMinutes / recordedMinutes) * 100) : 0;

  return {
    startDate,
    endDate,
    totalEntries: uniqueEntryIds.size,
    recordedMinutes,
    plannedMinutes,
    plannedCompletedMinutes,
    completedMinutes,
    effectiveMinutes,
    restMinutes,
    unplannedMinutes,
    completionRate,
    unplannedRate,
    categoryMinutes,
    categoryCompletedMinutes,
    dailySeries,
  };
}

/**
 * Period Date Range Calculations (real local calendar ranges).
 */
export function getPeriodRange(
  type: ReviewPeriodType,
  anchorDate: string,
): { periodKey: string; label: string; startDate: string; endDate: string } {
  const dt = parseLocalDate(anchorDate);
  const year = dt.getFullYear();
  const month = dt.getMonth(); // 0-11

  if (type === 'week') {
    const day = dt.getDay(); // 0=Sun..6=Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startDate = formatLocalDate(monday);
    const endDate = formatLocalDate(sunday);

    // ISO-8601 week number calculation (UTC-normalized to prevent DST hour drift)
    const utcThursday = new Date(
      Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3),
    );
    const isoYear = utcThursday.getUTCFullYear();
    const utcJan4 = new Date(Date.UTC(isoYear, 0, 4));
    const weekNum =
      1 +
      Math.round(
        ((utcThursday.getTime() - utcJan4.getTime()) / 86400000 -
          3 +
          ((utcJan4.getUTCDay() + 6) % 7)) /
          7,
      );
    const periodKey = `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
    return {
      periodKey,
      label: `${isoYear} 年第 ${weekNum} 周（${startDate} 至 ${endDate}）`,
      startDate,
      endDate,
    };
  }

  if (type === 'month') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const mStr = String(month + 1).padStart(2, '0');
    return {
      periodKey: `${year}-${mStr}`,
      label: `${year} 年 ${month + 1} 月`,
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  }

  if (type === 'quarter') {
    const q = Math.floor(month / 3) + 1;
    const startMonth = (q - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return {
      periodKey: `${year}-Q${q}`,
      label: `${year} 年第 ${q} 季度（${startMonth + 1}–${startMonth + 3} 月）`,
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  }

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return {
    periodKey: `${year}`,
    label: `${year} 年度`,
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  };
}

export function shiftAnchorDate(type: ReviewPeriodType, anchorDate: string, delta: number): string {
  const dt = parseLocalDate(anchorDate);
  if (type === 'week') {
    dt.setDate(dt.getDate() + delta * 7);
  } else if (type === 'month') {
    dt.setMonth(dt.getMonth() + delta);
  } else if (type === 'quarter') {
    dt.setMonth(dt.getMonth() + delta * 3);
  } else {
    dt.setFullYear(dt.getFullYear() + delta);
  }
  return formatLocalDate(dt);
}

/**
 * Deterministic local diary draft generator (works completely offline from real daily entries).
 */
export function buildLocalDiaryDraft(
  date: string,
  entries: TimeEntry[],
  tasks: DailyTask[],
): DiarySnapshotContent {
  const dayEntries = entries
    .filter((e) => e.date === date && e.status !== 'cancelled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const workCompleted = dayEntries.filter((e) => e.category === 'work' && e.status === 'completed');
  const allUnfinished = dayEntries.filter(
    (e) => e.status === 'planned' || e.status === 'in_progress',
  );
  const learningEntries = dayEntries.filter(
    (e) => e.category === 'learning' || e.category === 'reading',
  );
  const thoughts = dayEntries.filter((e) => e.thought.trim().length > 0);
  const outcomes = dayEntries.filter((e) => e.resultNote.trim().length > 0);
  const unplanned = dayEntries.filter((e) => e.isUnplanned);
  const unfinishedTasks = tasks.filter((t) => t.date === date && !t.completed);

  const stats = computeRangeStats(entries, date, date);

  return {
    work: {
      completed:
        workCompleted.length > 0
          ? workCompleted.map((e) => `• ${e.startTime}-${e.endTime} ${e.title}`).join('\n')
          : '今日暂无已标记完成的工作记录。',
      outcomes:
        outcomes.length > 0
          ? outcomes.map((e) => `• ${e.title}：${e.resultNote}`).join('\n')
          : '今日暂无填写结果备注，建议补充关键产出数据。',
      unfinished:
        allUnfinished.length > 0 || unfinishedTasks.length > 0
          ? [
              ...allUnfinished.map((e) => `• [日程] ${e.title}（${e.startTime}-${e.endTime}）`),
              ...unfinishedTasks.map((t) => `• [待办] ${t.title}`),
            ].join('\n')
          : '计划内事项均已闭环。',
    },
    learning: {
      learned:
        learningEntries.length > 0
          ? learningEntries
              .map((e) => `• ${e.title}（${formatDurationHuman(getEntryDurationMinutes(e))}）`)
              .join('\n')
          : '今日暂无学习或阅读记录。',
      insights:
        learningEntries.some((e) => e.thought.trim())
          ? learningEntries
              .filter((e) => e.thought.trim())
              .map((e) => `• ${e.thought}`)
              .join('\n')
          : '可在时间记录思考栏补充学习心得。',
      knowledgeToSave:
        learningEntries.some((e) => e.resultNote.trim())
          ? learningEntries
              .filter((e) => e.resultNote.trim())
              .map((e) => `• ${e.resultNote}`)
              .join('\n')
          : '',
    },
    thinking: {
      problems:
        thoughts.length > 0
          ? thoughts.map((e) => `• [${e.title}] ${e.thought}`).join('\n')
          : '今日思考栏暂无问题记录。',
      causes: '',
      solutions: '',
    },
    review: {
      wentWell:
        stats.completedMinutes > 0
          ? `今日总完成投入 ${formatDurationHuman(stats.completedMinutes)}（计划内完成 ${formatDurationHuman(stats.plannedCompletedMinutes)}），计划完成率 ${stats.completionRate}%。`
          : '建议回顾今日核心高精力时段是否产出了预期成果。',
      toImprove:
        unplanned.length > 0
          ? `今日出现 ${unplanned.length} 项计划外事项（共 ${formatDurationHuman(stats.unplannedMinutes)}），需评估是否可提前缓冲或拒绝。`
          : '保持按计划推进节奏，持续优化精力匹配。',
      timeReasonable: `工作 ${formatHours(stats.categoryMinutes.work)}h · 学习与阅读 ${formatHours(
        stats.categoryMinutes.learning + stats.categoryMinutes.reading,
      )}h · 运动 ${formatHours(stats.categoryMinutes.exercise)}h · 休息 ${formatHours(
        stats.categoryMinutes.rest,
      )}h`,
      timeWasters:
        unplanned.length > 0
          ? unplanned.map((e) => `• ${e.startTime}-${e.endTime} ${e.title}`).join('\n')
          : '',
    },
    tomorrowPlan: {
      topThree: unfinishedTasks.slice(0, 3).map((t) => t.title),
      ongoingTasks:
        unfinishedTasks.length > 3
          ? unfinishedTasks
              .slice(3)
              .map((t) => `• ${t.title}`)
              .join('\n')
          : '',
      oneIssueToFix: '',
    },
  };
}

export function createEmptyDiary(date: string): DailyDiary {
  return {
    date,
    work: { completed: '', outcomes: '', unfinished: '' },
    learning: { learned: '', insights: '', knowledgeToSave: '' },
    thinking: { problems: '', causes: '', solutions: '' },
    review: { wentWell: '', toImprove: '', timeReasonable: '', timeWasters: '' },
    tomorrowPlan: { topThree: ['', '', ''], ongoingTasks: '', oneIssueToFix: '' },
    aiGenerated: false,
    versions: [],
    updatedAt: Date.now(),
  };
}
