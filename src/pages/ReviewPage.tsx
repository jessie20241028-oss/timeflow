import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTimeFlow } from '../context/TimeFlowContext';
import { CATEGORY_LIST, CATEGORY_MAP, PeriodReview, ReviewPeriodType } from '../types/timeflow';
import {
  computeRangeStats,
  formatHours,
  formatLocalDate,
  getPeriodRange,
  shiftAnchorDate,
} from '../utils/stats';

interface ReviewPageProps {
  periodType: ReviewPeriodType;
}

const PERIOD_TITLES: Record<ReviewPeriodType, string> = {
  week: '周度复盘',
  month: '月度复盘',
  quarter: '季度复盘',
  year: '年度复盘',
};

const EMPTY_NOTES: PeriodReview['notes'] = {
  importantAchievements: '',
  unfinishedMatters: '',
  mainProblems: '',
  nextDirection: '',
  learningGrowth: '',
  longTermAlignment: '',
  keyEventsAndLessons: '',
};

export const ReviewPage: React.FC<ReviewPageProps> = ({ periodType }) => {
  const { entries, tasks, reviews, settings, upsertReview } = useTimeFlow();
  const today = formatLocalDate(new Date());
  const [anchorDate, setAnchorDate] = useState(today);

  const range = useMemo(
    () => getPeriodRange(periodType, anchorDate),
    [periodType, anchorDate],
  );
  const prevAnchor = useMemo(
    () => shiftAnchorDate(periodType, anchorDate, -1),
    [periodType, anchorDate],
  );
  const prevRange = useMemo(
    () => getPeriodRange(periodType, prevAnchor),
    [periodType, prevAnchor],
  );

  const reviewId = `${periodType}:${range.periodKey}`;
  const storedReview = useMemo(
    () => reviews.find((r) => r.id === reviewId),
    [reviews, reviewId],
  );

  const [notes, setNotes] = useState<PeriodReview['notes']>(
    storedReview?.notes ?? EMPTY_NOTES,
  );
  const latestNotesRef = useRef<PeriodReview['notes']>(notes);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaRef = useRef({ reviewId, periodType, periodKey: range.periodKey, startDate: range.startDate, endDate: range.endDate });
  metaRef.current = { reviewId, periodType, periodKey: range.periodKey, startDate: range.startDate, endDate: range.endDate };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const m = metaRef.current;
        upsertReview({
          id: m.reviewId,
          periodType: m.periodType,
          periodKey: m.periodKey,
          startDate: m.startDate,
          endDate: m.endDate,
          notes: latestNotesRef.current,
          updatedAt: Date.now(),
        });
      }
    };
  }, [reviewId, upsertReview]);

  useEffect(() => {
    const initial = storedReview?.notes ?? EMPTY_NOTES;
    setNotes(initial);
    latestNotesRef.current = initial;
    dirtyRef.current = false;
  }, [storedReview, reviewId]);

  const savedPeriodReviews = useMemo(
    () =>
      reviews
        .filter((r) => r.periodType === periodType)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [reviews, periodType],
  );

  const stats = useMemo(
    () => computeRangeStats(entries, range.startDate, range.endDate),
    [entries, range.startDate, range.endDate],
  );

  const prevStats = useMemo(
    () => computeRangeStats(entries, prevRange.startDate, prevRange.endDate),
    [entries, prevRange.startDate, prevRange.endDate],
  );

  const periodEntries = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.date >= range.startDate && e.date <= range.endDate && e.status !== 'cancelled',
      ),
    [entries, range.startDate, range.endDate],
  );

  const completedImportant = useMemo(
    () =>
      periodEntries
        .filter((e) => e.status === 'completed' && (e.priority === 'high' || e.resultNote.trim()))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 15),
    [periodEntries],
  );

  const unfinishedItems = useMemo(() => {
    const unfinishedEntries = periodEntries.filter(
      (e) => e.status === 'planned' || e.status === 'in_progress',
    );
    const unfinishedTasks = tasks.filter(
      (t) => t.date >= range.startDate && t.date <= range.endDate && !t.completed,
    );
    return { unfinishedEntries, unfinishedTasks };
  }, [periodEntries, tasks, range.startDate, range.endDate]);

  // For annual/quarterly reviews, aggregate by month; for weekly/monthly, use dailySeries
  const chartData = useMemo(() => {
    if (periodType === 'year' || periodType === 'quarter') {
      const byMonth = new Map<
        string,
        { label: string; work: number; learning: number; exercise: number; rest: number }
      >();
      for (const d of stats.dailySeries) {
        const mKey = d.date.slice(0, 7);
        const cur = byMonth.get(mKey) ?? {
          label: mKey,
          work: 0,
          learning: 0,
          exercise: 0,
          rest: 0,
        };
        cur.work = Number((cur.work + d.workHours).toFixed(2));
        cur.learning = Number((cur.learning + d.learningHours).toFixed(2));
        cur.exercise = Number((cur.exercise + d.exerciseHours).toFixed(2));
        cur.rest = Number((cur.rest + d.restHours).toFixed(2));
        byMonth.set(mKey, cur);
      }
      return Array.from(byMonth.values());
    }
    return stats.dailySeries.map((d) => ({
      label: d.shortDate,
      work: d.workHours,
      learning: d.learningHours,
      exercise: d.exerciseHours,
      rest: d.restHours,
    }));
  }, [periodType, stats.dailySeries]);

  const handleSave = async (nextNotes = notes) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    latestNotesRef.current = nextNotes;
    await upsertReview({
      id: reviewId,
      periodType,
      periodKey: range.periodKey,
      startDate: range.startDate,
      endDate: range.endDate,
      notes: nextNotes,
      updatedAt: Date.now(),
    });
  };

  const updateNoteField = (patch: Partial<PeriodReview['notes']>) => {
    setNotes((prev) => {
      const next = { ...prev, ...patch };
      latestNotesRef.current = next;
      dirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (dirtyRef.current) {
          dirtyRef.current = false;
          const m = metaRef.current;
          upsertReview({
            id: m.reviewId,
            periodType: m.periodType,
            periodKey: m.periodKey,
            startDate: m.startDate,
            endDate: m.endDate,
            notes: latestNotesRef.current,
            updatedAt: Date.now(),
          });
        }
      }, 450);
      return next;
    });
  };

  const hoursDelta = Number(
    ((stats.recordedMinutes - prevStats.recordedMinutes) / 60).toFixed(1),
  );

  return (
    <div className="space-y-6">
      {/* Header + Period Navigator */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{PERIOD_TITLES[periodType]}</h1>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            当前周期：{range.label}（{range.startDate} 至 {range.endDate}）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setAnchorDate(shiftAnchorDate(periodType, anchorDate, -1))}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              上一周期
            </button>
            <div className="flex items-center gap-1.5 border-x border-slate-100 px-2.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => e.target.value && setAnchorDate(e.target.value)}
                className="bg-transparent font-mono text-xs font-medium text-slate-800 focus:outline-none tabular-nums"
                aria-label="选择定位日期"
              />
            </div>
            <button
              type="button"
              onClick={() => setAnchorDate(shiftAnchorDate(periodType, anchorDate, 1))}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"
            >
              下一周期
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAnchorDate(today)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            回到当前周期
          </button>
        </div>
      </div>

      {/* Period KPI Cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">本周期总投入</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatHours(stats.recordedMinutes)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            较上一周期 {hoursDelta >= 0 ? `+${hoursDelta}h` : `${hoursDelta}h`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">工作总时长</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-blue-600 tabular-nums">
            {formatHours(stats.categoryMinutes.work)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            上一周期 {formatHours(prevStats.categoryMinutes.work)}h
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">学习与阅读</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-teal-600 tabular-nums">
            {formatHours(stats.categoryMinutes.learning + stats.categoryMinutes.reading)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            上一周期{' '}
            {formatHours(prevStats.categoryMinutes.learning + prevStats.categoryMinutes.reading)}h
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">运动与休息</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-600 tabular-nums">
            {formatHours(stats.categoryMinutes.exercise)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            休息恢复 {formatHours(stats.restMinutes)}h
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <p className="text-xs font-medium text-slate-500">计划完成率</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.completionRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            上一周期 {prevStats.completionRate}%
          </p>
        </div>
      </section>

      {/* Chart + Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            {periodType === 'year' || periodType === 'quarter'
              ? '按月时间投入分布趋势'
              : '每日时间投入分布'}
          </h2>
          <p className="mb-4 text-xs text-slate-500">真实去重统计（小时）</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="h" />
                <Tooltip formatter={(val: unknown) => `${val} 小时`} />
                <Legend />
                <Bar dataKey="work" name="工作" stackId="a" fill={CATEGORY_MAP.work.color} />
                <Bar
                  dataKey="learning"
                  name="学习/阅读"
                  stackId="a"
                  fill={CATEGORY_MAP.learning.color}
                />
                <Bar
                  dataKey="exercise"
                  name="运动"
                  stackId="a"
                  fill={CATEGORY_MAP.exercise.color}
                />
                <Bar dataKey="rest" name="休息" stackId="a" fill={CATEGORY_MAP.rest.color} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">各类别累计时长与对比</h2>
          <div className="divide-y divide-slate-100">
            {CATEGORY_LIST.map((cat) => {
              const curMins = stats.categoryMinutes[cat.id];
              const prevMins = prevStats.categoryMinutes[cat.id];
              const pct =
                stats.recordedMinutes > 0
                  ? Math.round((curMins / stats.recordedMinutes) * 100)
                  : 0;
              return (
                <div key={cat.id} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm text-slate-800">{cat.label}</span>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="font-semibold text-slate-900">
                      {formatHours(curMins)}h
                    </span>
                    <span className="ml-1.5 text-slate-400">({pct}%)</span>
                    <span className="ml-2 text-slate-400">上期 {formatHours(prevMins)}h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Auto-aggregated Achievements & Unfinished Items */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            本周期已完成重要事项与成果（自动汇总）
          </h2>
          {completedImportant.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">本周期暂无高优已完成记录或成果备注。</p>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {completedImportant.map((item) => (
                <li key={item.id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono tabular-nums">
                      {item.date} {item.startTime}-{item.endTime}
                    </span>
                    <span>{CATEGORY_MAP[item.category]?.label}</span>
                  </div>
                  <p className="mt-0.5 font-medium text-slate-900">{item.title}</p>
                  {item.resultNote && (
                    <p className="mt-0.5 text-xs text-blue-700">成果：{item.resultNote}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            本周期未完成事项（自动汇总）
          </h2>
          {unfinishedItems.unfinishedEntries.length === 0 &&
          unfinishedItems.unfinishedTasks.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">本周期记录中的计划事项均已完成。</p>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {unfinishedItems.unfinishedEntries.map((item) => (
                <li key={item.id} className="py-2 text-sm">
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    [{item.date} 日程]
                  </span>{' '}
                  <span className="text-slate-800">{item.title}</span>
                </li>
              ))}
              {unfinishedItems.unfinishedTasks.map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    [{t.date} 待办]
                  </span>{' '}
                  <span className="text-slate-800">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Structured Reflection Form tailored to Period Type */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {PERIOD_TITLES[periodType]}文字沉淀
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              结合上方统计数据与长期目标进行复盘，失焦或点击保存按钮将持久化到 IndexedDB
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSave(notes)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Save className="h-3.5 w-3.5" />
            保存复盘
          </button>
        </div>

        {settings.longTermGoals.length > 0 && (periodType === 'quarter' || periodType === 'year') && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">已设定的长期目标：</span>
            {settings.longTermGoals.join(' ｜ ')}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {periodType === 'week'
                ? '本周重要成果与进展'
                : periodType === 'month'
                  ? '本月重要成果与里程碑'
                  : periodType === 'quarter'
                    ? '本季度重要目标与重点项目进展'
                    : '全年重要成果与年度关键事件'}
            </label>
            <textarea
              rows={3}
              value={notes.importantAchievements}
              onChange={(e) => updateNoteField({ importantAchievements: e.target.value })}
              onBlur={() => handleSave()}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {periodType === 'week'
                ? '本周主要问题与阻塞'
                : periodType === 'month'
                  ? '时间使用中存在的问题'
                  : periodType === 'quarter'
                    ? '本季度未达预期项与原因'
                    : '年度经验与教训总结'}
            </label>
            <textarea
              rows={3}
              value={notes.mainProblems}
              onChange={(e) => updateNoteField({ mainProblems: e.target.value })}
              onBlur={() => handleSave()}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {periodType === 'year' ? '个人成长轨迹与能力跃迁' : '学习与能力提升情况'}
            </label>
            <textarea
              rows={3}
              value={notes.learningGrowth}
              onChange={(e) => updateNoteField({ learningGrowth: e.target.value })}
              onBlur={() => handleSave()}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {periodType === 'week'
                ? '下周改善方向'
                : periodType === 'month'
                  ? '下个月改善计划'
                  : periodType === 'quarter'
                    ? '时间分配是否符合长期目标 & 下季度重点方向'
                    : '下一年度的目标建议与规划'}
            </label>
            <textarea
              rows={3}
              value={notes.nextDirection}
              onChange={(e) => updateNoteField({ nextDirection: e.target.value })}
              onBlur={() => handleSave()}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {savedPeriodReviews.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            已保存的{PERIOD_TITLES[periodType]}历史周期（点击可切换查看）
          </h2>
          <div className="flex flex-wrap gap-2">
            {savedPeriodReviews.map((rev) => (
              <button
                key={rev.id}
                type="button"
                onClick={() => setAnchorDate(rev.startDate)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                  rev.id === reviewId
                    ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {rev.periodKey}（{rev.startDate} ~ {rev.endDate}）
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
