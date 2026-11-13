import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTimeFlow } from '../context/TimeFlowContext';
import { CATEGORY_LIST, CATEGORY_MAP } from '../types/timeflow';
import {
  addDays,
  computeRangeStats,
  formatDurationHuman,
  formatHours,
  formatLocalDate,
  getEntryDurationMinutes,
  getPeriodRange,
} from '../utils/stats';

type PresetRange = '7d' | '30d' | 'month' | 'quarter' | 'year' | 'custom';

export const AnalyticsPage: React.FC = () => {
  const { entries } = useTimeFlow();
  const today = formatLocalDate(new Date());

  const [preset, setPreset] = useState<PresetRange>('7d');
  const [customStart, setCustomStart] = useState(addDays(today, -13));
  const [customEnd, setCustomEnd] = useState(today);

  const { startDate, endDate, rangeLabel } = useMemo(() => {
    if (preset === '7d') {
      return { startDate: addDays(today, -6), endDate: today, rangeLabel: '最近 7 天' };
    }
    if (preset === '30d') {
      return { startDate: addDays(today, -29), endDate: today, rangeLabel: '最近 30 天' };
    }
    if (preset === 'month') {
      const r = getPeriodRange('month', today);
      return { startDate: r.startDate, endDate: r.endDate, rangeLabel: r.label };
    }
    if (preset === 'quarter') {
      const r = getPeriodRange('quarter', today);
      return { startDate: r.startDate, endDate: r.endDate, rangeLabel: r.label };
    }
    if (preset === 'year') {
      const r = getPeriodRange('year', today);
      return { startDate: r.startDate, endDate: r.endDate, rangeLabel: r.label };
    }
    return {
      startDate: customStart <= customEnd ? customStart : customEnd,
      endDate: customStart <= customEnd ? customEnd : customStart,
      rangeLabel: '自定义区间',
    };
  }, [preset, today, customStart, customEnd]);

  const stats = useMemo(
    () => computeRangeStats(entries, startDate, endDate),
    [entries, startDate, endDate],
  );

  // Category distribution for pie & breakdown table
  const categoryData = useMemo(() => {
    return CATEGORY_LIST.map((cat) => {
      const mins = stats.categoryMinutes[cat.id];
      const completedMins = stats.categoryCompletedMinutes[cat.id];
      const pct = stats.recordedMinutes > 0 ? Math.round((mins / stats.recordedMinutes) * 100) : 0;
      return {
        id: cat.id,
        name: cat.label,
        color: cat.color,
        minutes: mins,
        hours: Number((mins / 60).toFixed(2)),
        completedHours: Number((completedMins / 60).toFixed(2)),
        percent: pct,
        isRest: cat.isRest,
        isEffective: cat.isEffective,
      };
    });
  }, [stats]);

  const nonZeroCategoryData = categoryData.filter((d) => d.minutes > 0);

  // Weekly aggregation inside the range for Weekly Category Trend
  const weeklyAggregation = useMemo(() => {
    const weeks = new Map<
      string,
      {
        label: string;
        work: number;
        learning: number;
        exercise: number;
        rest: number;
      }
    >();
    for (const day of stats.dailySeries) {
      const r = getPeriodRange('week', day.date);
      const cur = weeks.get(r.periodKey) ?? {
        label: r.periodKey,
        work: 0,
        learning: 0,
        exercise: 0,
        rest: 0,
      };
      cur.work = Number((cur.work + day.workHours).toFixed(2));
      cur.learning = Number((cur.learning + day.learningHours).toFixed(2));
      cur.exercise = Number((cur.exercise + day.exerciseHours).toFixed(2));
      cur.rest = Number((cur.rest + day.restHours).toFixed(2));
      weeks.set(r.periodKey, cur);
    }
    return Array.from(weeks.values());
  }, [stats.dailySeries]);

  // Monthly structure aggregation inside the range
  const monthlyAggregation = useMemo(() => {
    const months = new Map<
      string,
      {
        label: string;
        work: number;
        learning: number;
        exercise: number;
        rest: number;
      }
    >();
    for (const day of stats.dailySeries) {
      const mKey = day.date.slice(0, 7);
      const cur = months.get(mKey) ?? {
        label: mKey,
        work: 0,
        learning: 0,
        exercise: 0,
        rest: 0,
      };
      cur.work = Number((cur.work + day.workHours).toFixed(2));
      cur.learning = Number((cur.learning + day.learningHours).toFixed(2));
      cur.exercise = Number((cur.exercise + day.exerciseHours).toFixed(2));
      cur.rest = Number((cur.rest + day.restHours).toFixed(2));
      months.set(mKey, cur);
    }
    return Array.from(months.values());
  }, [stats.dailySeries]);

  // Output vs Time table: entries with concrete resultNote or high priority
  const outcomeEntries = useMemo(() => {
    return entries
      .filter(
        (e) =>
          e.date >= startDate &&
          e.date <= endDate &&
          e.status !== 'cancelled' &&
          (e.resultNote.trim().length > 0 || e.priority === 'high'),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
      .slice(0, 20);
  }, [entries, startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Header + Date Range Filter */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">时间分析中心</h1>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            统计口径：{rangeLabel}（{startDate} 至 {endDate}）· 已严格排除同日重叠时间并独立统计休息时段
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['7d', '近7天'],
                ['30d', '近30天'],
                ['month', '本月'],
                ['quarter', '本季度'],
                ['year', '本年'],
                ['custom', '自定义'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  preset === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => e.target.value && setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
              />
              <span className="text-xs text-slate-400">至</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => e.target.value && setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
              />
            </div>
          )}
        </div>
      </div>

      {/* Efficiency Metrics */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">累计记录总时长</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatHours(stats.recordedMinutes)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">共 {stats.totalEntries} 条记录</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">有效投入时间</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-blue-600 tabular-nums">
            {formatHours(stats.effectiveMinutes)}h
          </p>
          <p className="mt-1 text-xs text-slate-500">工作/学习/阅读/运动已完成</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">必要休息恢复</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-700 tabular-nums">
            {formatHours(stats.restMinutes)}h
          </p>
          <p className="mt-1 text-xs text-slate-500">独立统计，不计入工作时长</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">计划完成率</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-600 tabular-nums">
            {stats.completionRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            计划完成 {formatHours(stats.plannedCompletedMinutes)}h / 计划{' '}
            {formatHours(stats.plannedMinutes)}h
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <p className="text-xs font-medium text-slate-500">计划外时间占比</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-amber-600 tabular-nums">
            {stats.unplannedRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            计划外 {formatHours(stats.unplannedMinutes)}h
          </p>
        </div>
      </section>

      {stats.totalEntries === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-700">当前所选区间内没有真实时间记录</p>
          <p className="mt-1 text-xs text-slate-500">
            请调整日期范围，或在「每日记录」中添加记录后查看实时分析图表。
          </p>
        </div>
      ) : (
        <>
          {/* Row 1: Category Breakdown + Daily Bar Chart */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
              <h2 className="mb-4 text-base font-semibold text-slate-900">时间分类结构与占比</h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={nonZeroCategoryData}
                      dataKey="minutes"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={84}
                      paddingAngle={2}
                    >
                      {nonZeroCategoryData.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: unknown) => `${formatHours(Number(val))} 小时`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {categoryData.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-slate-800">{cat.name}</span>
                      {cat.isRest && (
                        <span className="text-xs text-slate-400">（必要恢复）</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-slate-600 tabular-nums">
                      {cat.hours}h · {cat.percent}%
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <h2 className="mb-1 text-base font-semibold text-slate-900">每日投入时间柱状图</h2>
              <p className="mb-4 text-xs text-slate-500">
                展示每天计划时长与实际已完成时长对比
              </p>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.dailySeries}
                    margin={{ top: 8, right: 12, left: -14, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="h" />
                    <Tooltip formatter={(val: unknown) => `${val} 小时`} />
                    <Legend />
                    <Bar
                      dataKey="plannedHours"
                      name="计划/记录时长"
                      fill="#CBD5E1"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="completedHours"
                      name="实际完成时长"
                      fill="#2563EB"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Row 2: Work vs Learning + Weekly Trend */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-base font-semibold text-slate-900">工作与学习时间对比</h2>
              <p className="mb-4 text-xs text-slate-500">工作时长 vs 学习与阅读总时长（小时）</p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={stats.dailySeries}
                    margin={{ top: 8, right: 12, left: -14, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="h" />
                    <Tooltip formatter={(val: unknown) => `${val} 小时`} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="workHours"
                      name="工作"
                      stroke={CATEGORY_MAP.work.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="learningHours"
                      name="学习/阅读"
                      stroke={CATEGORY_MAP.learning.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                {monthlyAggregation.length > 1 ? '每月时间结构变化' : '每周分类时间趋势'}
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                按自然周/月汇总主要类别时间分布（小时）
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyAggregation.length > 1 ? monthlyAggregation : weeklyAggregation}
                    margin={{ top: 8, right: 12, left: -14, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748B' }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="h" />
                    <Tooltip formatter={(val: unknown) => `${val} 小时`} />
                    <Legend />
                    <Bar dataKey="work" name="工作" stackId="s" fill={CATEGORY_MAP.work.color} />
                    <Bar
                      dataKey="learning"
                      name="学习/阅读"
                      stackId="s"
                      fill={CATEGORY_MAP.learning.color}
                    />
                    <Bar
                      dataKey="exercise"
                      name="运动"
                      stackId="s"
                      fill={CATEGORY_MAP.exercise.color}
                    />
                    <Bar dataKey="rest" name="休息" stackId="s" fill={CATEGORY_MAP.rest.color} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Row 3: Time Investment vs Concrete Outcomes */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">时间投入与实际成果对照</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                展示区间内高优先级事项与已填写成果备注的记录，便于评估投入产出比
              </p>
            </div>
            {outcomeEntries.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                当前区间内暂无填写「结果备注」的高优记录，建议在每日记录备注栏补充量化成果。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="px-4 py-2.5">日期与时段</th>
                      <th className="px-4 py-2.5">分类</th>
                      <th className="px-4 py-2.5">事项内容</th>
                      <th className="px-4 py-2.5">实际成果备注</th>
                      <th className="px-4 py-2.5 text-right">投入时长</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outcomeEntries.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {item.date} {item.startTime}-{item.endTime}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                          {CATEGORY_MAP[item.category]?.label}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{item.title}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {item.resultNote || '（尚未填写具体成果备注）'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDurationHuman(getEntryDurationMinutes(item))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
