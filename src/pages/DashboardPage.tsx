import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckSquare,
  Plus,
  Square,
  Trash2,
  Database,
  Clock,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTimeFlow } from '../context/TimeFlowContext';
import {
  ActivityCategory,
  CATEGORY_LIST,
  CATEGORY_MAP,
  DailyTask,
  NavPageId,
  TimeEntry,
} from '../types/timeflow';
import {
  addDays,
  computeRangeStats,
  formatHours,
  formatLocalDate,
  getWeekdayLabel,
  minutesToTime,
} from '../utils/stats';
import { DangoCat, DangoCelebrationTrigger } from '../components/DangoCat';
import { getTimeOfDayContext } from '../constants/dango';

interface DashboardPageProps {
  onNavigate: (page: NavPageId, date?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { entries, tasks, upsertEntry, upsertTask, deleteTask, seedSampleData } = useTimeFlow();
  const today = formatLocalDate(new Date());
  const weekday = getWeekdayLabel(today);

  // Quick add time entry state
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const roundedStart = Math.floor(currentMins / 30) * 30;
  const defaultStart = minutesToTime(Math.min(roundedStart, 21 * 60 + 30));
  const defaultEnd = minutesToTime(Math.min(roundedStart + 30, 22 * 60));

  const [quickTitle, setQuickTitle] = useState('');
  const [quickStart, setQuickStart] = useState(defaultStart);
  const [quickEnd, setQuickEnd] = useState(defaultEnd);
  const [quickCategory, setQuickCategory] = useState<ActivityCategory>('work');
  const [quickStatus, setQuickStatus] = useState<'planned' | 'completed'>('completed');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);

  // Quick add task state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTopThree, setNewTaskTopThree] = useState(true);
  const [celebrationTrigger, setCelebrationTrigger] = useState<DangoCelebrationTrigger | null>(
    null,
  );

  const todayStats = useMemo(() => computeRangeStats(entries, today, today), [entries, today]);
  const weekStart = addDays(today, -6);
  const weekStats = useMemo(
    () => computeRangeStats(entries, weekStart, today),
    [entries, weekStart, today],
  );

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.date === today)
        .sort((a, b) => Number(b.isTopThree) - Number(a.isTopThree) || a.createdAt - b.createdAt),
    [tasks, today],
  );

  const topThreeTasks = todayTasks.filter((t) => t.isTopThree).slice(0, 3);
  const pendingTasks = todayTasks.filter((t) => !t.completed);

  const completedTasks = todayTasks.filter((t) => t.completed);

  const categoryPieData = useMemo(() => {
    return CATEGORY_LIST.map((cat) => ({
      id: cat.id,
      name: cat.label,
      minutes: todayStats.categoryMinutes[cat.id],
      hours: Number((todayStats.categoryMinutes[cat.id] / 60).toFixed(2)),
      color: cat.color,
    })).filter((d) => d.minutes > 0);
  }, [todayStats]);

  const handleQuickAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) {
      setQuickError('请输入业务内容后再记录');
      return;
    }
    if (quickStart === quickEnd) {
      setQuickError('开始时间与结束时间不能相同');
      return;
    }
    setQuickError(null);
    const nowTs = Date.now();
    const isCross = quickEnd < quickStart;
    const entry: TimeEntry = {
      id: `entry-${nowTs}-${Math.random().toString(36).slice(2, 7)}`,
      date: today,
      startTime: quickStart,
      endTime: quickEnd,
      crossDay: isCross,
      title: quickTitle.trim(),
      category: quickCategory,
      thought: '',
      resultNote: '',
      priority: 'medium',
      status: quickStatus,
      energy: 'medium',
      isUnplanned: false,
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    await upsertEntry(entry);
    setQuickTitle('');
    if (quickCategory === 'rest') {
      setCelebrationTrigger({ id: Date.now(), type: 'rest' });
    } else if (quickStatus === 'completed') {
      setCelebrationTrigger({ id: Date.now(), type: 'task' });
    }
    // Advance quick slot forward by 30 mins for smooth consecutive logging
    if (!isCross) {
      const [eh, em] = quickEnd.split(':').map(Number);
      const endM = eh * 60 + em;
      if (endM + 30 <= 1440) {
        setQuickStart(quickEnd);
        setQuickEnd(minutesToTime(endM + 30));
      }
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const nowTs = Date.now();
    const isTop = newTaskTopThree && topThreeTasks.length < 3;
    const task: DailyTask = {
      id: `task-${nowTs}-${Math.random().toString(36).slice(2, 7)}`,
      date: today,
      title: newTaskTitle.trim(),
      isTopThree: isTop,
      completed: false,
      priority: isTop ? 'high' : 'medium',
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    await upsertTask(task);
    setNewTaskTitle('');
  };

  const toggleTask = async (task: DailyTask) => {
    const nextCompleted = !task.completed;
    await upsertTask({ ...task, completed: nextCompleted, updatedAt: Date.now() });
    if (nextCompleted) {
      const completedTopThreeAfter = topThreeTasks.filter((t) =>
        t.id === task.id ? nextCompleted : t.completed,
      ).length;
      if (task.isTopThree && topThreeTasks.length === 3 && completedTopThreeAfter === 3) {
        setCelebrationTrigger({
          id: Date.now(),
          type: 'goal',
          message: '太棒了！今日最重要的三项任务已全部达成！',
        });
      } else {
        setCelebrationTrigger({ id: Date.now(), type: 'task' });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">今日时间驾驶舱</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {today} · {weekday}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {entries.length === 0 && (
            <button
              type="button"
              onClick={seedSampleData}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Database className="h-4 w-4 text-slate-500" />
              加载 7 天演示数据
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('daily-log', today)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
          >
            打开今日 30 分钟时间表
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick Start Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">快速开始记录</h2>
          <span className="text-xs text-slate-500">支持自动保存至本地数据库</span>
        </div>
        <form onSubmit={handleQuickAddEntry} className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="flex items-center gap-2 lg:col-span-3">
            <input
              type="time"
              value={quickStart}
              onChange={(e) => setQuickStart(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              aria-label="开始时间"
            />
            <span className="text-slate-400">-</span>
            <input
              type="time"
              value={quickEnd}
              onChange={(e) => setQuickEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              aria-label="结束时间"
            />
          </div>

          <div className="lg:col-span-4">
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="输入当前正在做或刚完成的事情..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <select
              value={quickCategory}
              onChange={(e) => setQuickCategory(e.target.value as ActivityCategory)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              aria-label="活动分类"
            >
              {CATEGORY_LIST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={quickStatus}
              onChange={(e) => setQuickStatus(e.target.value as 'planned' | 'completed')}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              aria-label="完成状态"
            >
              <option value="completed">已完成</option>
              <option value="planned">计划中</option>
            </select>
          </div>

          <div className="lg:col-span-1">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              记录
            </button>
          </div>
        </form>
        {quickError && (
          <p className="mt-2 text-xs text-red-600">{quickError}</p>
        )}
      </section>

      {/* KPI Metrics Row */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">今日已记录时长</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatHours(todayStats.recordedMinutes)}
            <span className="ml-1 text-sm font-normal text-slate-500">小时</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            共 {todayStats.totalEntries} 条有效记录
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">今日工作时间</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-blue-600 tabular-nums">
            {formatHours(todayStats.categoryMinutes.work)}
            <span className="ml-1 text-sm font-normal text-slate-500">小时</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            已完成 {formatHours(todayStats.categoryCompletedMinutes.work)} 小时
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">今日学习时间</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-teal-600 tabular-nums">
            {formatHours(todayStats.categoryMinutes.learning + todayStats.categoryMinutes.reading)}
            <span className="ml-1 text-sm font-normal text-slate-500">小时</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">含专题学习与阅读</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">今日运动时间</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-600 tabular-nums">
            {formatHours(todayStats.categoryMinutes.exercise)}
            <span className="ml-1 text-sm font-normal text-slate-500">小时</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            休息恢复 {formatHours(todayStats.restMinutes)} 小时
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <p className="text-xs font-medium text-slate-500">今日计划完成率</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {todayStats.completionRate}
            <span className="ml-0.5 text-sm font-normal text-slate-500">%</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            计划完成 {formatHours(todayStats.plannedCompletedMinutes)}h / 计划{' '}
            {formatHours(todayStats.plannedMinutes)}h
          </p>
        </div>
      </section>

      {/* Main Grid: Top 3 + Pending Tasks | Category Breakdown + 7-Day Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column: Top 3 Priorities & Pending Tasks */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">今日最重要的三项任务</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {topThreeTasks.filter((t) => t.completed).length} / 3 已完成
              </span>
            </div>

            {topThreeTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                今日尚未设定三件大事，在下方快速添加以聚焦核心产出。
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topThreeTasks.map((task, idx) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleTask(task)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {task.completed ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <span className="font-mono text-xs text-slate-400 tabular-nums">
                        0{idx + 1}
                      </span>
                      <span
                        className={`truncate text-sm ${
                          task.completed ? 'text-slate-400 line-through' : 'font-medium text-slate-800'
                        }`}
                      >
                        {task.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      aria-label="删除任务"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddTask} className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="添加今日任务或重点事项..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                >
                  添加
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={newTaskTopThree}
                  onChange={(e) => setNewTaskTopThree(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                列为今日最重要的三项任务（当前已有 {topThreeTasks.length}/3）
              </label>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">今日待完成事项</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums">
                <span>{pendingTasks.length} 项待办</span>
                {completedTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCompletedTasks((v) => !v)}
                    className="text-blue-600 hover:underline"
                  >
                    {showCompletedTasks ? '隐藏已完成' : `查看已完成 (${completedTasks.length})`}
                  </button>
                )}
              </div>
            </div>
            {pendingTasks.length === 0 && !showCompletedTasks ? (
              <p className="py-4 text-center text-sm text-slate-500">当前无待完成待办事项。</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingTasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleTask(task)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Square className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate text-sm text-slate-800">{task.title}</span>
                    </button>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {task.isTopThree ? '核心大事' : '常规待办'}
                    </span>
                  </li>
                ))}
                {showCompletedTasks &&
                  completedTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleTask(task)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <CheckSquare className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="truncate text-sm text-slate-400 line-through">
                          {task.title}
                        </span>
                      </button>
                      <span className="text-xs text-slate-400 whitespace-nowrap">已完成</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right column: Category Breakdown + 7-day trend */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">今日时间分类占比</h2>
              <button
                type="button"
                onClick={() => onNavigate('analytics')}
                className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
              >
                进入分析中心
              </button>
            </div>

            {categoryPieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Clock className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">今日尚无时间记录，开始记录后将自动绘制分布图表。</p>
                <button
                  type="button"
                  onClick={() => onNavigate('daily-log', today)}
                  className="mt-3 rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  去填写今日时间表
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-2">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        dataKey="minutes"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {categoryPieData.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => `${formatHours(Number(val))} 小时`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2.5">
                  {categoryPieData.map((item) => {
                    const pct =
                      todayStats.recordedMinutes > 0
                        ? Math.round((item.minutes / todayStats.recordedMinutes) * 100)
                        : 0;
                    return (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-slate-700">{item.name}</span>
                        </div>
                        <div className="font-mono text-xs text-slate-600 tabular-nums">
                          {item.hours}h · {pct}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">最近 7 天时间投入趋势</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {weekStart} 至 {today} · 按实际去重时长统计（小时）
                </p>
              </div>
              <span className="font-mono text-xs text-slate-600 tabular-nums">
                近7天累计 {formatHours(weekStats.recordedMinutes)}h
              </span>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekStats.dailySeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="shortDate" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} unit="h" />
                  <Tooltip
                    formatter={(val: unknown, name: unknown) => [`${val} 小时`, String(name)]}
                  />
                  <Bar dataKey="workHours" name="工作" stackId="a" fill={CATEGORY_MAP.work.color} />
                  <Bar
                    dataKey="learningHours"
                    name="学习/阅读"
                    stackId="a"
                    fill={CATEGORY_MAP.learning.color}
                  />
                  <Bar
                    dataKey="exerciseHours"
                    name="运动"
                    stackId="a"
                    fill={CATEGORY_MAP.exercise.color}
                  />
                  <Bar dataKey="restHours" name="休息" stackId="a" fill={CATEGORY_MAP.rest.color} />
                  <Bar
                    dataKey="otherHours"
                    name="生活/其他"
                    stackId="a"
                    fill="#CBD5E1"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>

      {/* Dango Mascot Companion (inline on mobile/tablet, unobtrusive bottom-right dock on xl desktop) */}
      <DangoCat
        state="idle"
        variant="dock"
        contextHint={getTimeOfDayContext()}
        statusNote="默认趴着休息陪伴 · 点击可展开对话"
        celebrationTrigger={celebrationTrigger}
      />
    </div>
  );
};
