import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTimeFlow } from '../context/TimeFlowContext';
import {
  CATEGORY_MAP,
  DailyDiary,
  DiarySnapshotContent,
  DiaryVersion,
  ENERGY_LABELS,
  STATUS_LABELS,
} from '../types/timeflow';
import {
  addDays,
  buildLocalDiaryDraft,
  computeRangeStats,
  createEmptyDiary,
  formatDurationHuman,
  formatHours,
  formatLocalDate,
  getEntryDurationMinutes,
  getWeekdayLabel,
} from '../utils/stats';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DangoCat } from '../components/DangoCat';

interface DiaryPageProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

function extractSnapshot(diary: DailyDiary): DiarySnapshotContent {
  return {
    work: { ...diary.work },
    learning: { ...diary.learning },
    thinking: { ...diary.thinking },
    review: { ...diary.review },
    tomorrowPlan: {
      topThree: [...diary.tomorrowPlan.topThree],
      ongoingTasks: diary.tomorrowPlan.ongoingTasks,
      oneIssueToFix: diary.tomorrowPlan.oneIssueToFix,
    },
  };
}

export const DiaryPage: React.FC<DiaryPageProps> = ({ selectedDate, onDateChange }) => {
  const { entries, tasks, diaries, settings, isOnline, upsertDiary, deleteDiary, updateSettings } =
    useTimeFlow();

  const storedDiary = useMemo(
    () => diaries.find((d) => d.date === selectedDate),
    [diaries, selectedDate],
  );

  const [draft, setDraft] = useState<DailyDiary>(() =>
    storedDiary ? storedDiary : createEmptyDiary(selectedDate),
  );
  const latestDraftRef = useRef<DailyDiary>(draft);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Flush any pending unsaved edits when date changes or component unmounts
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        upsertDiary({ ...latestDraftRef.current, updatedAt: Date.now() });
      }
    };
  }, [selectedDate, upsertDiary]);

  // Sync draft when date or stored diary changes (if not currently dirty)
  useEffect(() => {
    if (storedDiary) {
      if (!dirtyRef.current || latestDraftRef.current.date !== selectedDate) {
        setDraft(storedDiary);
        latestDraftRef.current = storedDiary;
        dirtyRef.current = false;
      }
    } else if (!dirtyRef.current || latestDraftRef.current.date !== selectedDate) {
      const empty = createEmptyDiary(selectedDate);
      setDraft(empty);
      latestDraftRef.current = empty;
      dirtyRef.current = false;
    }
    setAiError(null);
  }, [selectedDate, storedDiary]);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => e.date === selectedDate && e.status !== 'cancelled')
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [entries, selectedDate],
  );

  const dayTasks = useMemo(
    () => tasks.filter((t) => t.date === selectedDate),
    [tasks, selectedDate],
  );

  const dayStats = useMemo(
    () => computeRangeStats(entries, selectedDate, selectedDate),
    [entries, selectedDate],
  );

  const pastDiaryDates = useMemo(
    () => [...diaries].sort((a, b) => b.date.localeCompare(a.date)),
    [diaries],
  );

  const persistDiary = async (next: DailyDiary) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    const updated: DailyDiary = { ...next, updatedAt: Date.now() };
    latestDraftRef.current = updated;
    setDraft(updated);
    await upsertDiary(updated);
  };

  const scheduleAutoSave = (next: DailyDiary) => {
    latestDraftRef.current = next;
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        upsertDiary({ ...latestDraftRef.current, updatedAt: Date.now() });
      }
    }, 450);
  };

  const handleGenerateLocalDraft = async () => {
    const generated = buildLocalDiaryDraft(selectedDate, entries, tasks);
    const snapshot: DiaryVersion = {
      id: `ver-${Date.now()}`,
      timestamp: Date.now(),
      label: '自动汇总时间记录前备份',
      content: extractSnapshot(draft),
    };
    const next: DailyDiary = {
      ...draft,
      ...generated,
      tomorrowPlan: {
        ...generated.tomorrowPlan,
        topThree: [
          generated.tomorrowPlan.topThree[0] ?? '',
          generated.tomorrowPlan.topThree[1] ?? '',
          generated.tomorrowPlan.topThree[2] ?? '',
        ],
      },
      versions: storedDiary ? [snapshot, ...draft.versions].slice(0, 15) : draft.versions,
    };
    await persistDiary(next);
  };

  const runAIDiaryGeneration = async () => {
    if (!isOnline) {
      setAiError('当前处于离线状态，无法连接 AI 服务，请先使用「汇总记录生成草稿」离线生成。');
      return;
    }
    if (dayEntries.length === 0) {
      setAiError('当日暂无时间记录，请先记录时间投入后再使用 AI 生成日记初稿。');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const payloadEntries = dayEntries.map((e) => ({
        startTime: e.startTime,
        endTime: e.endTime,
        title: e.title,
        categoryLabel: CATEGORY_MAP[e.category]?.label ?? e.category,
        thought: e.thought,
        resultNote: e.resultNote,
        statusLabel: STATUS_LABELS[e.status],
        energyLabel: ENERGY_LABELS[e.energy],
        isUnplanned: e.isUnplanned,
      }));

      const res = await fetch('/api/ai/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          entries: payloadEntries,
          tasks: dayTasks.map((t) => ({
            title: t.title,
            completed: t.completed,
            isTopThree: t.isTopThree,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI 服务响应异常');
      }
      const aiDraft = data.draft as DiarySnapshotContent;
      const versionBackup: DiaryVersion = {
        id: `ver-${Date.now()}`,
        timestamp: Date.now(),
        label: 'AI 生成前历史版本',
        content: extractSnapshot(draft),
      };
      const next: DailyDiary = {
        ...draft,
        ...aiDraft,
        tomorrowPlan: {
          topThree: [
            aiDraft.tomorrowPlan?.topThree?.[0] ?? '',
            aiDraft.tomorrowPlan?.topThree?.[1] ?? '',
            aiDraft.tomorrowPlan?.topThree?.[2] ?? '',
          ],
          ongoingTasks: aiDraft.tomorrowPlan?.ongoingTasks ?? '',
          oneIssueToFix: aiDraft.tomorrowPlan?.oneIssueToFix ?? '',
        },
        aiGenerated: true,
        versions: storedDiary ? [versionBackup, ...draft.versions].slice(0, 15) : draft.versions,
      };
      await persistDiary(next);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '生成 AI 日记失败');
    } finally {
      setAiLoading(false);
    }
  };

  const handleClickAIGenerate = () => {
    if (!settings.aiDataConsent) {
      setShowConsentModal(true);
      return;
    }
    runAIDiaryGeneration();
  };

  const handleSaveVersionSnapshot = async () => {
    const current = latestDraftRef.current;
    const version: DiaryVersion = {
      id: `ver-${Date.now()}`,
      timestamp: Date.now(),
      label: `手动存档 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
      content: extractSnapshot(current),
    };
    await persistDiary({
      ...current,
      versions: [version, ...current.versions].slice(0, 20),
    });
  };

  const handleRestoreVersion = async (ver: DiaryVersion) => {
    const current = latestDraftRef.current;
    const currentBackup: DiaryVersion = {
      id: `ver-${Date.now()}`,
      timestamp: Date.now(),
      label: '恢复历史版本前自动备份',
      content: extractSnapshot(current),
    };
    await persistDiary({
      ...current,
      ...ver.content,
      versions: [currentBackup, ...current.versions].slice(0, 20),
    });
    setShowVersions(false);
  };

  const updateField = <K extends keyof DiarySnapshotContent>(
    section: K,
    patch: Partial<DiarySnapshotContent[K]>,
  ) => {
    setDraft((prev) => {
      const next: DailyDiary = {
        ...prev,
        [section]: {
          ...prev[section],
          ...patch,
        },
      };
      scheduleAutoSave(next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">每日日记</h1>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => onDateChange(addDays(selectedDate, -1))}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="前一天"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && onDateChange(e.target.value)}
                className="bg-transparent font-mono text-sm font-medium text-slate-900 focus:outline-none tabular-nums"
              />
              <span className="text-xs text-slate-500">{getWeekdayLabel(selectedDate)}</span>
            </div>
            <button
              type="button"
              onClick={() => onDateChange(addDays(selectedDate, 1))}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="后一天"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onDateChange(formatLocalDate(new Date()))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            今天
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleGenerateLocalDraft}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <BookOpen className="h-3.5 w-3.5 text-slate-500" />
            汇总今日记录生成草稿
          </button>

          <button
            type="button"
            onClick={handleClickAIGenerate}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiLoading ? 'AI 正在整理...' : 'AI 生成日记初稿'}
          </button>

          <button
            type="button"
            onClick={handleSaveVersionSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Save className="h-3.5 w-3.5 text-slate-500" />
            保存版本快照
          </button>

          <button
            type="button"
            onClick={() => setShowVersions((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <History className="h-3.5 w-3.5 text-slate-500" />
            历史版本 ({draft.versions.length})
          </button>

          {storedDiary && (
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              aria-label="删除当日日记"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {aiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {aiError}
        </div>
      )}

      {/* Version History Drawer */}
      {showVersions && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">日记历史版本记录</h2>
            <button
              type="button"
              onClick={() => setShowVersions(false)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              关闭
            </button>
          </div>
          {draft.versions.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">
              当前暂无历史版本快照。点击「保存版本快照」或生成新草稿时会自动留存历史版本。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {draft.versions.map((ver) => (
                <li key={ver.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{ver.label}</span>
                    <span className="ml-3 font-mono text-xs text-slate-400 tabular-nums">
                      {new Date(ver.timestamp).toLocaleString('zh-CN', { hour12: false })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreVersion(ver)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    恢复此版本
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Sidebar inside Diary: Day's Real Records Summary + Past Diary List */}
        <aside className="space-y-6 lg:col-span-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">当日时间记录自动汇总</h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {formatHours(dayStats.recordedMinutes)}h
              </span>
            </div>

            {dayEntries.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">
                该日期尚未记录任何时间段。前往「每日记录」添加后，此处将自动联动显示。
              </p>
            ) : (
              <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                {dayEntries.map((e) => (
                  <li key={e.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono tabular-nums">
                        {e.startTime}-{e.endTime}
                      </span>
                      <span>
                        {CATEGORY_MAP[e.category]?.label} ·{' '}
                        {formatDurationHuman(getEntryDurationMinutes(e))}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{e.title}</p>
                    {e.thought && (
                      <p className="mt-1 text-xs text-slate-600">思考：{e.thought}</p>
                    )}
                    {e.resultNote && (
                      <p className="mt-0.5 text-xs text-blue-700">成果：{e.resultNote}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              历史日记索引（共 {pastDiaryDates.length} 篇）
            </h2>
            {pastDiaryDates.length === 0 ? (
              <p className="text-xs text-slate-500">编辑任意部分后即自动永久保存。</p>
            ) : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {pastDiaryDates.map((d) => (
                  <li key={d.date}>
                    <button
                      type="button"
                      onClick={() => onDateChange(d.date)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        d.date === selectedDate
                          ? 'bg-blue-50 font-semibold text-blue-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-mono text-xs tabular-nums">
                        {d.date} · {getWeekdayLabel(d.date)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {d.aiGenerated ? '含AI初稿' : '手动/汇总'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DangoCat
            state="learn"
            contextHint="learn"
            statusNote="安静阅读与笔记模式 · 陪你梳理今日收获"
            variant="sidebar"
          />
        </aside>

        {/* Right Main Editor: 5 Structured Sections */}
        <div className="space-y-5 lg:col-span-8">
          {/* 1. 今日工作 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">一、今日工作</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  今天完成了哪些重要工作？
                </label>
                <textarea
                  rows={3}
                  value={draft.work.completed}
                  onChange={(e) => updateField('work', { completed: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  placeholder="列出核心交付或推进的工作..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  有哪些具体成果？
                </label>
                <textarea
                  rows={2}
                  value={draft.work.outcomes}
                  onChange={(e) => updateField('work', { outcomes: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  placeholder="量化数据、上线功能、完成文档..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  哪些事情没有完成？
                </label>
                <textarea
                  rows={2}
                  value={draft.work.unfinished}
                  onChange={(e) => updateField('work', { unfinished: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  placeholder="未完成事项及阻塞点..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 2. 今日学习 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">二、今日学习</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">学到了什么？</label>
                <textarea
                  rows={2}
                  value={draft.learning.learned}
                  onChange={(e) => updateField('learning', { learned: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  有哪些新的认知？
                </label>
                <textarea
                  rows={2}
                  value={draft.learning.insights}
                  onChange={(e) => updateField('learning', { insights: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  有什么值得沉淀的知识？
                </label>
                <textarea
                  rows={2}
                  value={draft.learning.knowledgeToSave}
                  onChange={(e) => updateField('learning', { knowledgeToSave: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 3. 今日思考 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">三、今日思考</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  今天遇到了什么问题？
                </label>
                <textarea
                  rows={2}
                  value={draft.thinking.problems}
                  onChange={(e) => updateField('thinking', { problems: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  问题产生的原因是什么？
                </label>
                <textarea
                  rows={2}
                  value={draft.thinking.causes}
                  onChange={(e) => updateField('thinking', { causes: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  有没有新的解决思路？
                </label>
                <textarea
                  rows={2}
                  value={draft.thinking.solutions}
                  onChange={(e) => updateField('thinking', { solutions: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 4. 今日复盘 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">四、今日复盘</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  今天做得好的事情
                </label>
                <textarea
                  rows={3}
                  value={draft.review.wentWell}
                  onChange={(e) => updateField('review', { wentWell: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  今天需要改善的事情
                </label>
                <textarea
                  rows={3}
                  value={draft.review.toImprove}
                  onChange={(e) => updateField('review', { toImprove: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  时间投入是否合理？
                </label>
                <textarea
                  rows={2}
                  value={draft.review.timeReasonable}
                  onChange={(e) => updateField('review', { timeReasonable: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  哪些事情消耗了不必要的时间？
                </label>
                <textarea
                  rows={2}
                  value={draft.review.timeWasters}
                  onChange={(e) => updateField('review', { timeWasters: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 5. 明日计划 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">五、明日计划</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  最重要的三件事
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={draft.tomorrowPlan.topThree[idx] ?? ''}
                      onChange={(e) => {
                        const nextArr = [...draft.tomorrowPlan.topThree];
                        nextArr[idx] = e.target.value;
                        updateField('tomorrowPlan', { topThree: nextArr });
                      }}
                      onBlur={() => persistDiary(draft)}
                      placeholder={`第 ${idx + 1} 件大事`}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  需要持续跟进的任务
                </label>
                <textarea
                  rows={2}
                  value={draft.tomorrowPlan.ongoingTasks}
                  onChange={(e) => updateField('tomorrowPlan', { ongoingTasks: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  明天需要改善的一个问题
                </label>
                <input
                  type="text"
                  value={draft.tomorrowPlan.oneIssueToFix}
                  onChange={(e) => updateField('tomorrowPlan', { oneIssueToFix: e.target.value })}
                  onBlur={() => persistDiary(draft)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => persistDiary(draft)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              保存今日日记
            </button>
          </div>
        </div>
      </div>

      {/* Consent confirmation for AI Diary generation */}
      <ConfirmDialog
        open={showConsentModal}
        danger={false}
        title="确认发送当日记录至 AI 服务生成日记初稿？"
        description={`将把 ${selectedDate} 的 ${dayEntries.length} 条时间记录与任务清单发送给后端 AI 接口以生成结构化日记初稿，不会包含其他日期的隐私数据。`}
        confirmLabel="同意并生成"
        onConfirm={async () => {
          setShowConsentModal(false);
          await updateSettings({ ...settings, aiDataConsent: true, updatedAt: Date.now() });
          await runAIDiaryGeneration();
        }}
        onCancel={() => setShowConsentModal(false)}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`确认删除 ${selectedDate} 的日记？`}
        description="删除后该日期的日记内容及历史版本将被永久移除，且不会影响当日的时间记录。"
        onConfirm={async () => {
          await deleteDiary(selectedDate);
          setConfirmDeleteOpen(false);
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
};
