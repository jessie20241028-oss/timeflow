import { DailyDiary, DailyTask, TimeEntry } from '../types/timeflow';
import {
  addDays,
  computeIntervalUnionMinutes,
  expandEntriesToSlices,
  formatLocalDate,
} from './stats';

export interface DangoGrowthReward {
  id: 'streak_3' | 'weekly_5' | 'hours_10' | 'monthly_15';
  title: string;
  description: string;
  requirementLabel: string;
  progressText: string;
  unlocked: boolean;
}

export interface DangoGrowthSummary {
  totalRecordedDays: number;
  currentStreakDays: number;
  bestStreakDays: number;
  weeklyRecordDays: number;
  weeklyEntryCount: number;
  completedTopThreeCount: number;
  monthlyActiveDays: number;
  monthlyTopThreeCompleted: number;
  totalMinutes: number;
  totalHours: number;
  rewards: DangoGrowthReward[];
  unlockedCount: number;
}

/**
 * Computes strictly factual, non-punitive companion growth stats from real user history.
 */
export function computeDangoGrowth(
  entries: TimeEntry[],
  tasks: DailyTask[],
  diaries: DailyDiary[],
  todayStr: string = formatLocalDate(new Date()),
): DangoGrowthSummary {
  const activeEntries = entries.filter((e) => e.status !== 'cancelled');
  const slices = expandEntriesToSlices(activeEntries);

  // Deduplicated minutes across all recorded days
  const slicesByDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const s of slices) {
    const arr = slicesByDate.get(s.date) ?? [];
    arr.push({ start: s.startMin, end: s.endMin });
    slicesByDate.set(s.date, arr);
  }

  let totalMinutes = 0;
  for (const intervals of slicesByDate.values()) {
    totalMinutes += computeIntervalUnionMinutes(intervals);
  }

  // Recorded day set: any date with at least one non-cancelled entry or saved diary
  const recordedDatesSet = new Set<string>();
  for (const e of activeEntries) {
    recordedDatesSet.add(e.date);
  }
  for (const d of diaries) {
    recordedDatesSet.add(d.date);
  }
  const sortedDates = Array.from(recordedDatesSet).sort();
  const totalRecordedDays = sortedDates.length;

  // Best consecutive streak
  let bestStreakDays = 0;
  let running = 0;
  let prevDate: string | null = null;
  for (const dt of sortedDates) {
    if (prevDate && addDays(prevDate, 1) === dt) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > bestStreakDays) bestStreakDays = running;
    prevDate = dt;
  }

  // Current streak (counts up to today, or yesterday if today is not yet logged so morning starts gently)
  let currentStreakDays = 0;
  let cursor = recordedDatesSet.has(todayStr)
    ? todayStr
    : recordedDatesSet.has(addDays(todayStr, -1))
      ? addDays(todayStr, -1)
      : '';
  while (cursor && recordedDatesSet.has(cursor)) {
    currentStreakDays += 1;
    cursor = addDays(cursor, -1);
  }

  // Weekly progress (rolling 7 days ending today)
  const weekStart = addDays(todayStr, -6);
  const weeklyRecordDays = sortedDates.filter((d) => d >= weekStart && d <= todayStr).length;
  const weeklyEntryCount = activeEntries.filter(
    (e) => e.date >= weekStart && e.date <= todayStr,
  ).length;

  // Completed Top-3 tasks
  const completedTopThreeCount = tasks.filter((t) => t.isTopThree && t.completed).length;

  // Monthly active days & Top-3 tasks (current calendar month YYYY-MM)
  const currentMonthPrefix = todayStr.slice(0, 7);
  const monthlyActiveDays = sortedDates.filter((d) => d.startsWith(currentMonthPrefix)).length;
  const monthlyTopThreeCompleted = tasks.filter(
    (t) => t.isTopThree && t.completed && t.date.startsWith(currentMonthPrefix),
  ).length;

  const totalHours = Number((totalMinutes / 60).toFixed(1));

  const rewards: DangoGrowthReward[] = [
    {
      id: 'streak_3',
      title: '星标眨耳陪伴动作',
      description: '解锁团子「进阶陪伴形态」，可在日常界面切换展示。',
      requirementLabel: '连续记录满 3 天',
      progressText: `${Math.min(bestStreakDays, 3)} / 3 天`,
      unlocked: bestStreakDays >= 3,
    },
    {
      id: 'weekly_5',
      title: '周度温暖寄语',
      description: '单周累计记录满 5 天，解锁团子的老搭档温暖台词。',
      requirementLabel: '近 7 天记录满 5 天',
      progressText: `${Math.min(weeklyRecordDays, 5)} / 5 天`,
      unlocked: weeklyRecordDays >= 5,
    },
    {
      id: 'hours_10',
      title: '十小时同行徽章',
      description: '累计记录满 10 小时真实时间投入，点亮专注陪伴纪念。',
      requirementLabel: '累计记录满 10 小时',
      progressText: `${Math.min(totalHours, 10).toFixed(1)} / 10.0 小时`,
      unlocked: totalMinutes >= 600,
    },
    {
      id: 'monthly_15',
      title: '月度成长特别庆典',
      description: '单月记录满 15 天，团子将以专属撒花姿态见证你的月度积累。',
      requirementLabel: '本月记录满 15 天',
      progressText: `${Math.min(monthlyActiveDays, 15)} / 15 天`,
      unlocked: monthlyActiveDays >= 15,
    },
  ];

  const unlockedCount = rewards.filter((r) => r.unlocked).length;

  return {
    totalRecordedDays,
    currentStreakDays,
    bestStreakDays,
    weeklyRecordDays,
    weeklyEntryCount,
    completedTopThreeCount,
    monthlyActiveDays,
    monthlyTopThreeCompleted,
    totalMinutes,
    totalHours,
    rewards,
    unlockedCount,
  };
}
