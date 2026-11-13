import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  Plus,
  Printer,
  Scissors,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Footer } from '../components/Footer';
import { useTimeFlow } from '../context/TimeFlowContext';
import {
  ActivityCategory,
  CATEGORY_LIST,
  CATEGORY_MAP,
  ENERGY_LABELS,
  EnergyLevel,
  EntryStatus,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TaskPriority,
  TimeEntry,
} from '../types/timeflow';
import {
  addDays,
  computeRangeStats,
  findOverlappingEntryIdsForDate,
  formatDurationHuman,
  formatHours,
  formatLocalDate,
  getEntryDurationMinutes,
  getWeekdayLabel,
  minutesToTime,
  timeToMinutes,
} from '../utils/stats';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DangoCat, DangoCelebrationTrigger } from '../components/DangoCat';
import { resolveDailyDangoState } from '../constants/dango';

interface DailyLogPageProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

export const DailyLogPage: React.FC<DailyLogPageProps> = ({ selectedDate, onDateChange }) => {
  const { entries, settings, upsertEntry, patchEntry, upsertEntriesBatch, deleteEntry } =
    useTimeFlow();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isNewModal, setIsNewModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [celebrationTrigger, setCelebrationTrigger] = useState<DangoCelebrationTrigger | null>(
    null,
  );

  React.useEffect(() => {
    setMergeSelectedIds([]);
  }, [selectedDate]);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => e.date === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.createdAt - b.createdAt),
    [entries, selectedDate],
  );

  const overlappingIds = useMemo(
    () => findOverlappingEntryIdsForDate(entries, selectedDate),
    [entries, selectedDate],
  );

  const dayStats = useMemo(
    () => computeRangeStats(entries, selectedDate, selectedDate),
    [entries, selectedDate],
  );

  const dailyDango = useMemo(
    () => resolveDailyDangoState(entries, selectedDate),
    [entries, selectedDate],
  );

  // Build 30-minute default grid slots (e.g., 08:00-22:00)
  const gridSlots = useMemo(() => {
    const slots: Array<{ start: string; end: string; startMin: number; endMin: number }> = [];
    const startM = settings.dayStartHour * 60;
    const endM = settings.dayEndHour * 60;
    const step = settings.slotMinutes || 30;
    for (let m = startM; m < endM; m += step) {
      slots.push({
        start: minutesToTime(m),
        end: minutesToTime(m + step),
        startMin: m,
        endMin: m + step,
      });
    }
    return slots;
  }, [settings.dayStartHour, settings.dayEndHour, settings.slotMinutes]);

  // Check if slot falls inside a configured gray break range (lunch/dinner)
  const getBreakRangeLabel = (startMin: number, endMin: number): string | null => {
    for (const br of settings.breakRanges) {
      const bStart = timeToMinutes(br.startTime);
      const bEnd = timeToMinutes(br.endTime);
      if (startMin >= bStart && endMin <= bEnd) {
        return br.label;
      }
    }
    return null;
  };

  // Search across all historical entries
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.thought.toLowerCase().includes(q) ||
          e.resultNote.toLowerCase().includes(q) ||
          CATEGORY_MAP[e.category]?.label.includes(q),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 30);
  }, [entries, searchQuery]);

  // Map grid slots to rendered rows: multi-slot entries span multiple slots cleanly without duplication
  const slotRows = useMemo(() => {
    const usedEntryIds = new Set<string>();
    const rows: Array<{
      slotStart: string;
      slotEnd: string;
      slotStartMin: number;
      slotEndMin: number;
      entry: TimeEntry | null;
      rowSpan: number;
      coveredByPrevious: boolean;
      breakLabel: string | null;
    }> = [];

    for (let i = 0; i < gridSlots.length; i++) {
      const slot = gridSlots[i];
      const breakLabel = getBreakRangeLabel(slot.startMin, slot.endMin);

      // Find an entry that starts inside or exactly at this slot, or covers it
      const covering = dayEntries.find((e) => {
        const es = timeToMinutes(e.startTime);
        const ee = e.crossDay || timeToMinutes(e.endTime) <= es ? 1440 : timeToMinutes(e.endTime);
        return es <= slot.startMin && ee > slot.startMin;
      });

      if (covering) {
        if (usedEntryIds.has(covering.id)) {
          rows.push({
            slotStart: slot.start,
            slotEnd: slot.end,
            slotStartMin: slot.startMin,
            slotEndMin: slot.endMin,
            entry: covering,
            rowSpan: 0,
            coveredByPrevious: true,
            breakLabel,
          });
          continue;
        }
        usedEntryIds.add(covering.id);
        const es = timeToMinutes(covering.startTime);
        const ee =
          covering.crossDay || timeToMinutes(covering.endTime) <= es
            ? 1440
            : timeToMinutes(covering.endTime);
        let span = 1;
        for (let k = i + 1; k < gridSlots.length; k++) {
          if (gridSlots[k].startMin < ee) span++;
          else break;
        }
        rows.push({
          slotStart: slot.start,
          slotEnd: slot.end,
          slotStartMin: slot.startMin,
          slotEndMin: slot.endMin,
          entry: covering,
          rowSpan: span,
          coveredByPrevious: false,
          breakLabel,
        });
      } else {
        // Also check if an entry starts strictly inside this slot (e.g. 08:15)
        const startingInside = dayEntries.find((e) => {
          if (usedEntryIds.has(e.id)) return false;
          const es = timeToMinutes(e.startTime);
          return es >= slot.startMin && es < slot.endMin;
        });

        if (startingInside) {
          usedEntryIds.add(startingInside.id);
          const ee =
            startingInside.crossDay ||
            timeToMinutes(startingInside.endTime) <= timeToMinutes(startingInside.startTime)
              ? 1440
              : timeToMinutes(startingInside.endTime);
          let span = 1;
          for (let k = i + 1; k < gridSlots.length; k++) {
            if (gridSlots[k].startMin < ee) span++;
            else break;
          }
          rows.push({
            slotStart: slot.start,
            slotEnd: slot.end,
            slotStartMin: slot.startMin,
            slotEndMin: slot.endMin,
            entry: startingInside,
            rowSpan: span,
            coveredByPrevious: false,
            breakLabel,
          });
        } else {
          rows.push({
            slotStart: slot.start,
            slotEnd: slot.end,
            slotStartMin: slot.startMin,
            slotEndMin: slot.endMin,
            entry: null,
            rowSpan: 1,
            coveredByPrevious: false,
            breakLabel,
          });
        }
      }
    }

    const dayStartMin = settings.dayStartHour * 60;
    const dayEndMin = settings.dayEndHour * 60;
    const unplaced = dayEntries.filter((e) => !usedEntryIds.has(e.id));
    const overlappingWithPrimary = unplaced.filter((e) => {
      const es = timeToMinutes(e.startTime);
      const ee = e.crossDay || timeToMinutes(e.endTime) <= es ? 1440 : timeToMinutes(e.endTime);
      return !e.crossDay && es < dayEndMin && ee > dayStartMin;
    });
    const outOfWindowEntries = unplaced.filter((e) => !overlappingWithPrimary.includes(e));

    return { rows, overlappingWithPrimary, outOfWindowEntries };
  }, [gridSlots, dayEntries, settings.breakRanges, settings.dayStartHour, settings.dayEndHour]);

  const openCreateModal = (startTime = '08:00', endTime = '08:30', isBreak = false) => {
    const now = Date.now();
    setModalError(null);
    setEditingEntry({
      id: `entry-${now}-${Math.random().toString(36).slice(2, 7)}`,
      date: selectedDate,
      startTime,
      endTime,
      crossDay: endTime < startTime,
      title: isBreak ? '午休 / 用餐恢复' : '',
      category: isBreak ? 'rest' : 'work',
      thought: '',
      resultNote: '',
      priority: 'medium',
      status: 'completed',
      energy: 'medium',
      isUnplanned: false,
      isBreakPreset: isBreak,
      createdAt: now,
      updatedAt: now,
    });
    setIsNewModal(true);
  };

  const openEditModal = (entry: TimeEntry) => {
    setModalError(null);
    setEditingEntry({ ...entry });
    setIsNewModal(false);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    if (!editingEntry.title.trim()) {
      setModalError('请填写业务内容');
      return;
    }
    if (editingEntry.startTime === editingEntry.endTime && !editingEntry.crossDay) {
      setModalError('开始时间与结束时间不能相同（若跨整天 24 小时请勾选跨天活动）');
      return;
    }
    setModalError(null);
    await upsertEntry({
      ...editingEntry,
      title: editingEntry.title.trim(),
      updatedAt: Date.now(),
    });
    if (editingEntry.category === 'rest') {
      setCelebrationTrigger({ id: Date.now(), type: 'rest' });
    } else if (editingEntry.status === 'completed') {
      setCelebrationTrigger({ id: Date.now(), type: 'task' });
    }
    setEditingEntry(null);
  };

  const handleInlineFieldUpdate = async (
    entry: TimeEntry,
    patch: Partial<TimeEntry>,
  ) => {
    await patchEntry(entry.id, patch);
    if (patch.category === 'rest') {
      setCelebrationTrigger({ id: Date.now(), type: 'rest' });
    } else if (patch.status === 'completed' && entry.status !== 'completed') {
      setCelebrationTrigger({ id: Date.now(), type: 'task' });
    }
  };

  const handleCopyYesterday = async () => {
    const yesterday = addDays(selectedDate, -1);
    const yEntries = entries.filter((e) => e.date === yesterday);
    if (yEntries.length === 0) {
      setFeedbackMsg(`昨日（${yesterday}）暂无时间记录可供复制`);
      return;
    }
    const existingKeys = new Set(
      dayEntries.map((e) => `${e.startTime}-${e.endTime}-${e.title}`),
    );
    const toClone = yEntries.filter(
      (e) => !existingKeys.has(`${e.startTime}-${e.endTime}-${e.title}`),
    );
    if (toClone.length === 0) {
      setFeedbackMsg('昨日日程模板中的时段今日已全部存在，未重复添加');
      return;
    }
    const now = Date.now();
    const clones: TimeEntry[] = toClone.map((e, idx) => ({
      ...e,
      id: `entry-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      date: selectedDate,
      status: 'planned',
      resultNote: '',
      thought: '',
      createdAt: now + idx,
      updatedAt: now + idx,
    }));
    await upsertEntriesBatch(clones);
    const skipped = yEntries.length - clones.length;
    setFeedbackMsg(
      skipped > 0
        ? `已复制昨日 ${clones.length} 条日程为今日计划模板（跳过 ${skipped} 条已存在时段）`
        : `已将昨日 ${clones.length} 条日程复制为今日计划模板`,
    );
  };

  const handleSplitEntry = async (entry: TimeEntry) => {
    const dur = getEntryDurationMinutes(entry);
    const step = settings.slotMinutes || 30;
    if (dur <= step) {
      setFeedbackMsg(`该记录时长不超过 ${step} 分钟，无需拆分`);
      return;
    }
    const s = timeToMinutes(entry.startTime);
    const isCross = Boolean(entry.crossDay || timeToMinutes(entry.endTime) <= s);
    const endDayOne = isCross ? 1440 : timeToMinutes(entry.endTime);
    const newEntries: TimeEntry[] = [];
    const now = Date.now();
    let idx = 0;
    for (let m = s; m < endDayOne; m += step) {
      const nextEnd = Math.min(m + step, endDayOne);
      newEntries.push({
        ...entry,
        id: idx === 0 ? entry.id : `entry-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        date: entry.date,
        startTime: minutesToTime(m),
        endTime: minutesToTime(nextEnd),
        crossDay: false,
        createdAt: idx === 0 ? entry.createdAt : now + idx,
        updatedAt: now + idx,
      });
      idx++;
    }
    if (isCross) {
      const nextDate = addDays(entry.date, 1);
      const endDayTwo = timeToMinutes(entry.endTime);
      for (let m = 0; m < endDayTwo; m += step) {
        const nextEnd = Math.min(m + step, endDayTwo);
        newEntries.push({
          ...entry,
          id: `entry-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          date: nextDate,
          startTime: minutesToTime(m),
          endTime: minutesToTime(nextEnd),
          crossDay: false,
          createdAt: now + idx,
          updatedAt: now + idx,
        });
        idx++;
      }
    }
    await upsertEntriesBatch(newEntries);
    setFeedbackMsg(`已将「${entry.title}」拆分为 ${newEntries.length} 个独立时段`);
  };

  const handleMergeSelected = async () => {
    if (mergeSelectedIds.length < 2) return;
    const selected = dayEntries
      .filter((e) => mergeSelectedIds.includes(e.id))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (selected.length < 2) return;

    const first = selected[0];
    const minStart = Math.min(...selected.map((e) => timeToMinutes(e.startTime)));
    const maxEnd = Math.max(
      ...selected.map((e) =>
        e.crossDay || timeToMinutes(e.endTime) <= timeToMinutes(e.startTime)
          ? 1440
          : timeToMinutes(e.endTime),
      ),
    );

    const merged: TimeEntry = {
      ...first,
      startTime: minutesToTime(minStart),
      endTime: minutesToTime(maxEnd),
      crossDay: false,
      title: selected.map((s) => s.title).filter(Boolean).join(' / '),
      thought: selected.map((s) => s.thought).filter(Boolean).join('\n'),
      resultNote: selected.map((s) => s.resultNote).filter(Boolean).join('\n'),
      updatedAt: Date.now(),
    };

    await upsertEntry(merged);
    for (let i = 1; i < selected.length; i++) {
      await deleteEntry(selected[i].id);
    }
    setMergeSelectedIds([]);
    setFeedbackMsg(`已将 ${selected.length} 个时段合并为 ${merged.startTime}-${merged.endTime}`);
  };

  const toggleMergeSelect = (id: string) => {
    setMergeSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const renderEntryRowContent = (entry: TimeEntry, rowSpan = 1) => {
    const cat = CATEGORY_MAP[entry.category];
    const durMins = getEntryDurationMinutes(entry);
    const isOverlap = overlappingIds.has(entry.id);
    const isSelectedForMerge = mergeSelectedIds.includes(entry.id);

    return (
      <>
        <td rowSpan={rowSpan} className="border-r border-slate-200 px-3 py-2.5 align-top">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSelectedForMerge}
                  onChange={() => toggleMergeSelect(entry.id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  title="勾选以合并多个时段"
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: entry.colorTag || cat.color }}
                />
                <button
                  type="button"
                  onClick={() => openEditModal(entry)}
                  className="text-left text-sm font-semibold text-slate-900 hover:text-blue-600"
                >
                  {entry.title}
                </button>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                {entry.startTime}-{entry.endTime} ({formatDurationHuman(durMins)})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-slate-500">
              <select
                value={entry.category}
                onChange={(e) =>
                  handleInlineFieldUpdate(entry, { category: e.target.value as ActivityCategory })
                }
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                aria-label="修改分类"
              >
                {CATEGORY_LIST.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">·</span>
              <span>{PRIORITY_LABELS[entry.priority]}</span>
              <span aria-hidden="true">·</span>
              <span>{ENERGY_LABELS[entry.energy]}</span>
              {entry.isUnplanned && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-700">计划外</span>
                </>
              )}
              {isOverlap && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-red-600">时间重叠</span>
                </>
              )}
            </div>
          </div>
        </td>

        <td rowSpan={rowSpan} className="border-r border-slate-200 px-3 py-2.5 align-top">
          <textarea
            rows={2}
            defaultValue={entry.thought}
            key={`${entry.id}-thought-${entry.updatedAt}`}
            onBlur={(e) => {
              if (e.target.value !== entry.thought) {
                handleInlineFieldUpdate(entry, { thought: e.target.value });
              }
            }}
            placeholder="记录想法、发现的问题、收获..."
            className="w-full resize-none rounded border border-transparent bg-transparent p-1 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-200 focus:bg-white focus:outline-none"
          />
        </td>

        <td rowSpan={rowSpan} className="border-r border-slate-200 px-3 py-2.5 align-top">
          <div className="flex flex-col gap-1.5">
            <textarea
              rows={2}
              defaultValue={entry.resultNote}
              key={`${entry.id}-result-${entry.updatedAt}`}
              onBlur={(e) => {
                if (e.target.value !== entry.resultNote) {
                  handleInlineFieldUpdate(entry, { resultNote: e.target.value });
                }
              }}
              placeholder="产出数据、交付物或结果备注..."
              className="w-full resize-none rounded border border-transparent bg-transparent p-1 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-200 focus:bg-white focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={entry.status}
                onChange={(e) =>
                  handleInlineFieldUpdate(entry, { status: e.target.value as EntryStatus })
                }
                className={`rounded border px-2 py-0.5 text-xs font-medium focus:outline-none ${
                  entry.status === 'completed'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : entry.status === 'in_progress'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : entry.status === 'cancelled'
                        ? 'border-slate-200 bg-slate-100 text-slate-500'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
                aria-label="完成状态"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </td>

        <td rowSpan={rowSpan} className="px-2 py-2.5 align-top">
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => openEditModal(entry)}
              className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
            >
              编辑
            </button>
            {durMins > (settings.slotMinutes || 30) && (
              <button
                type="button"
                onClick={() => handleSplitEntry(entry)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
                title="拆分为30分钟时段"
              >
                <Scissors className="h-3 w-3" />
                拆分
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteTargetId(entry.id)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label="删除记录"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">每日时间记录</h1>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => onDateChange(addDays(selectedDate, -1))}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="上一天"
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
              aria-label="下一天"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDateChange(formatLocalDate(new Date()))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            回到今天
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* Search box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索历史记录..."
              className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none sm:w-56"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {mergeSelectedIds.length >= 2 && (
            <button
              type="button"
              onClick={handleMergeSelected}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Layers className="h-3.5 w-3.5" />
              合并已选 {mergeSelectedIds.length} 项
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyYesterday}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Copy className="h-3.5 w-3.5 text-slate-500" />
            复制昨日日程模板
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            打印时间表
          </button>

          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            自定义时间段 / 补录
          </button>
        </div>
      </div>

      {/* Feedback or Overlap warning */}
      {feedbackMsg && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-blue-600 hover:text-blue-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {overlappingIds.size > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            检测到当日存在时间段重叠记录。统计中心已按规则自动去重，不会重复累计重叠时间。
          </span>
        </div>
      )}

      {/* Search Results Drawer */}
      {searchQuery.trim() && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              历史记录搜索结果（匹配 {searchResults.length} 条）
            </h2>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              收起结果
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">未找到包含「{searchQuery}」的时间记录。</p>
          ) : (
            <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onDateChange(item.date);
                    setSearchQuery('');
                  }}
                  className="flex w-full items-center justify-between gap-4 py-2.5 text-left hover:bg-slate-50 px-2 rounded"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        {item.date} {item.startTime}-{item.endTime}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-600">
                        {CATEGORY_MAP[item.category]?.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{item.title}</p>
                  </div>
                  <span className="text-xs font-medium text-blue-600 whitespace-nowrap">跳转该日</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Dango Daily Companion Strip (outside schedule table & inputs) */}
      <DangoCat
        state={dailyDango.state}
        contextHint={dailyDango.context}
        statusNote={dailyDango.reason}
        celebrationTrigger={celebrationTrigger}
        variant="inline"
      />

      {/* Daily Summary Strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="text-slate-600">
          已记录（去重）：
          <span className="ml-1 font-mono font-semibold text-slate-900 tabular-nums">
            {formatHours(dayStats.recordedMinutes)}h
          </span>
        </div>
        <div className="text-slate-600">
          工作：
          <span className="ml-1 font-mono font-semibold text-blue-600 tabular-nums">
            {formatHours(dayStats.categoryMinutes.work)}h
          </span>
        </div>
        <div className="text-slate-600">
          学习/阅读：
          <span className="ml-1 font-mono font-semibold text-teal-600 tabular-nums">
            {formatHours(dayStats.categoryMinutes.learning + dayStats.categoryMinutes.reading)}h
          </span>
        </div>
        <div className="text-slate-600">
          休息：
          <span className="ml-1 font-mono font-semibold text-slate-700 tabular-nums">
            {formatHours(dayStats.restMinutes)}h
          </span>
        </div>
        <div className="text-slate-600">
          计划完成率：
          <span className="ml-1 font-mono font-semibold text-slate-900 tabular-nums">
            {dayStats.completionRate}%
          </span>
        </div>
        <div className="ml-auto text-xs text-slate-400">
          勾选左侧复选框可合并相邻时段
        </div>
      </div>

      {/* Main 30-Minute Reference Table (Desktop & Tablet & Print) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block print:block print:overflow-visible print:rounded-none">
        <table className="w-full min-w-[840px] border-collapse text-left print:min-w-0">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="w-32 border-r border-slate-200 px-3 py-3">时间</th>
              <th className="w-[34%] border-r border-slate-200 px-3 py-3">业务内容（概略）</th>
              <th className="w-[26%] border-r border-slate-200 px-3 py-3">思考栏</th>
              <th className="w-[24%] border-r border-slate-200 px-3 py-3">备注栏（成果与状态）</th>
              <th className="w-20 px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {slotRows.rows.map((row) => {
              const isGrayBreak = Boolean(row.breakLabel);

              if (row.coveredByPrevious) {
                return (
                  <tr
                    key={row.slotStart}
                    className={isGrayBreak ? 'bg-slate-100/70' : 'bg-white'}
                  >
                    <td className="border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-400 tabular-nums">
                      {row.slotStart}-{row.slotEnd}
                    </td>
                  </tr>
                );
              }

              if (row.entry) {
                return (
                  <tr
                    key={row.slotStart}
                    className={`group transition-colors ${
                      isGrayBreak ? 'bg-slate-100/70' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="border-r border-slate-200 px-3 py-2.5 align-top font-mono text-xs font-medium text-slate-600 tabular-nums">
                      {row.slotStart}-{row.slotEnd}
                      {row.breakLabel && (
                        <div className="mt-1 text-[11px] font-normal text-slate-400">
                          {row.breakLabel}
                        </div>
                      )}
                    </td>
                    {/* Span remaining 4 columns across rowSpan */}
                    {renderEntryRowContent(row.entry, row.rowSpan)}
                  </tr>
                );
              }

              return (
                <tr
                  key={row.slotStart}
                  className={`transition-colors ${
                    isGrayBreak
                      ? 'bg-slate-100/80 hover:bg-slate-100'
                      : 'hover:bg-blue-50/40'
                  }`}
                >
                  <td className="border-r border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                    {row.slotStart}-{row.slotEnd}
                  </td>
                  <td colSpan={4} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openCreateModal(row.slotStart, row.slotEnd, isGrayBreak)}
                        className="flex flex-1 items-center gap-2 py-0.5 text-left text-xs text-slate-400 hover:text-blue-600"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {row.breakLabel
                          ? `${row.breakLabel}（默认灰底休息时段，点击可记录或自定义）`
                          : '点击记录该时段内容...'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Compact Timeline List (< 768px) */}
      <div className="space-y-2 md:hidden print:hidden">
        {slotRows.rows.map((row) => {
          if (row.coveredByPrevious) return null;
          const isGrayBreak = Boolean(row.breakLabel);
          if (row.entry) {
            const e = row.entry;
            const cat = CATEGORY_MAP[e.category];
            const durMins = getEntryDurationMinutes(e);
            return (
              <div
                key={row.slotStart}
                className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
                      {e.startTime}-{e.endTime} ({formatDurationHuman(durMins)})
                    </span>
                    <span className="text-xs text-slate-500">{cat.label}</span>
                  </div>
                  <select
                    value={e.status}
                    onChange={(ev) =>
                      handleInlineFieldUpdate(e, { status: ev.target.value as EntryStatus })
                    }
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700"
                    aria-label="修改状态"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => openEditModal(e)}
                  className="block w-full text-left text-sm font-semibold text-slate-900"
                >
                  {e.title}
                </button>
                {e.thought && <p className="text-xs text-slate-600">思考：{e.thought}</p>}
                {e.resultNote && <p className="text-xs text-blue-700">成果：{e.resultNote}</p>}
                <div className="flex items-center justify-end gap-3 pt-1 text-xs">
                  {durMins > (settings.slotMinutes || 30) && (
                    <button
                      type="button"
                      onClick={() => handleSplitEntry(e)}
                      className="text-slate-600"
                    >
                      拆分
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(e)}
                    className="font-medium text-blue-600"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(e.id)}
                    className="text-red-600"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={row.slotStart}
              type="button"
              onClick={() => openCreateModal(row.slotStart, row.slotEnd, isGrayBreak)}
              className={`flex w-full items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-left ${
                isGrayBreak ? 'bg-slate-100/80' : 'bg-white'
              }`}
            >
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {row.slotStart}-{row.slotEnd}
              </span>
              <span className="text-xs text-slate-400">
                {row.breakLabel ? `${row.breakLabel} · 点击记录` : '+ 点击记录'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Author attribution immediately following the daily 30-minute schedule */}
      <Footer variant="schedule" />

      {/* Overlapping entries inside default window */}
      {slotRows.overlappingWithPrimary.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-white overflow-x-auto">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
            同日重叠时段记录（{slotRows.overlappingWithPrimary.length} 条 · 统计时已自动去重避免重复累计）
          </div>
          <table className="w-full min-w-[760px] border-collapse text-left">
            <tbody className="divide-y divide-slate-200">
              {slotRows.overlappingWithPrimary.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/60">
                  <td className="w-32 border-r border-slate-200 px-3 py-2.5 align-top font-mono text-xs font-medium text-amber-700 tabular-nums">
                    {entry.startTime}-{entry.endTime}
                    <div className="mt-1 text-[11px] font-normal">重叠时段</div>
                  </td>
                  {renderEntryRowContent(entry)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Out-of-window entries (early morning or late night / cross-day) */}
      {slotRows.outOfWindowEntries.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600">
            常规时段外记录（早于 {settings.dayStartHour}:00 或晚于 {settings.dayEndHour}:00 / 跨天活动）
          </div>
          <table className="w-full min-w-[760px] border-collapse text-left">
            <tbody className="divide-y divide-slate-200">
              {slotRows.outOfWindowEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/60">
                  <td className="w-32 border-r border-slate-200 px-3 py-2.5 align-top font-mono text-xs font-medium text-slate-600 tabular-nums">
                    {entry.startTime}-{entry.endTime}
                    {entry.crossDay && (
                      <div className="mt-1 text-[11px] text-blue-600">跨天至次日</div>
                    )}
                  </td>
                  {renderEntryRowContent(entry)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Create / Edit Entry Modal */}
      {editingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveModal}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-base font-semibold text-slate-900">
                {isNewModal ? '新增 / 补录时间记录' : '编辑时间记录'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">日期</label>
                  <input
                    type="date"
                    value={editingEntry.date}
                    onChange={(e) => setEditingEntry({ ...editingEntry, date: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">开始时间</label>
                  <input
                    type="time"
                    value={editingEntry.startTime}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setEditingEntry({
                        ...editingEntry,
                        startTime: nextStart,
                        crossDay: editingEntry.endTime < nextStart,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">结束时间</label>
                  <input
                    type="time"
                    value={editingEntry.endTime}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      setEditingEntry({
                        ...editingEntry,
                        endTime: nextEnd,
                        crossDay: nextEnd < editingEntry.startTime,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(editingEntry.crossDay)}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, crossDay: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-600"
                />
                跨天活动（如 23:00 至次日 01:00，统计时将自动拆分到对应日期）
              </label>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  业务内容（具体做了什么）
                </label>
                <input
                  type="text"
                  value={editingEntry.title}
                  onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                  placeholder="例如：撰写周报、系统联调、专题阅读..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">活动分类</label>
                  <select
                    value={editingEntry.category}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        category: e.target.value as ActivityCategory,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {CATEGORY_LIST.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">优先级</label>
                  <select
                    value={editingEntry.priority}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        priority: e.target.value as TaskPriority,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">完成状态</label>
                  <select
                    value={editingEntry.status}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        status: e.target.value as EntryStatus,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">精力状态</label>
                  <select
                    value={editingEntry.energy}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        energy: e.target.value as EnergyLevel,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {Object.entries(ENERGY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  思考栏（当时的想法、发现的问题、学习收获）
                </label>
                <textarea
                  rows={2}
                  value={editingEntry.thought}
                  onChange={(e) => setEditingEntry({ ...editingEntry, thought: e.target.value })}
                  placeholder="记录过程中的洞察或阻塞..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  结果备注（产出、数据、成果）
                </label>
                <textarea
                  rows={2}
                  value={editingEntry.resultNote}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, resultNote: e.target.value })
                  }
                  placeholder="例如：输出 2000 字文档、完成 3 组训练..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editingEntry.isUnplanned}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, isUnplanned: e.target.checked })
                  }
                  className="rounded border-slate-300 text-amber-600"
                />
                标记为「计划外事项」
              </label>
              {modalError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {modalError}
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                保存记录
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Two-step delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="确认删除该条时间记录？"
        description="删除后将同步更新当日与周期统计数据，该操作无法撤销（建议定期在数据管理中心导出备份）。"
        onConfirm={async () => {
          if (deleteTargetId) {
            await deleteEntry(deleteTargetId);
            setDeleteTargetId(null);
          }
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
};
