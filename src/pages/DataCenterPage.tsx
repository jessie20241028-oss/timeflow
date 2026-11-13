import React, { useMemo, useRef, useState } from 'react';
import {
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTimeFlow } from '../context/TimeFlowContext';
import { TimeFlowBackupPayload } from '../db/indexedDb';
import {
  ActivityCategory,
  CATEGORY_LIST,
  CATEGORY_MAP,
  NavPageId,
  STATUS_LABELS,
} from '../types/timeflow';
import { formatDurationHuman, getEntryDurationMinutes } from '../utils/stats';
import {
  exportAllToExcel,
  exportEntriesToCSV,
  exportFullJSONBackup,
} from '../utils/exportUtils';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface DataCenterPageProps {
  onNavigate: (page: NavPageId, date?: string) => void;
}

export const DataCenterPage: React.FC<DataCenterPageProps> = ({ onNavigate }) => {
  const {
    entries,
    tasks,
    diaries,
    reviews,
    aiReports,
    settings,
    offlinePendingCount,
    deleteEntry,
    deleteDiary,
    importBackup,
    seedSampleData,
    clearAllData,
  } = useTimeFlow();

  const [activeTab, setActiveTab] = useState<'entries' | 'diaries'>('entries');
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteDiaryDate, setDeleteDiaryDate] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<TimeFlowBackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFilters = Boolean(keyword.trim() || categoryFilter !== 'all' || startDate || endDate);

  const filteredEntries = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
        if (startDate && e.date < startDate) return false;
        if (endDate && e.date > endDate) return false;
        if (q) {
          const hit =
            e.title.toLowerCase().includes(q) ||
            e.thought.toLowerCase().includes(q) ||
            e.resultNote.toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  }, [entries, categoryFilter, startDate, endDate, keyword]);

  const handleExportExcel = () => {
    exportAllToExcel({
      entries,
      tasks,
      diaries,
      reviews,
      aiReports,
      settings,
      offlineQueue: [],
    });
    setStatusBanner('已导出 Excel (.xlsx) 完整工作簿（含时间记录、每日日记、周期复盘三个工作表）。');
  };

  const handleExportCSV = () => {
    const target = hasFilters ? filteredEntries : entries;
    exportEntriesToCSV(target);
    setStatusBanner(`已导出 ${target.length} 条记录至 UTF-8 CSV 文件，可使用 Excel 或 Numbers 直接打开。`);
  };

  const handleExportJSON = () => {
    exportFullJSONBackup({
      entries,
      tasks,
      diaries,
      reviews,
      aiReports,
      settings,
      offlineQueue: [],
    });
    setStatusBanner('已生成完整 JSON 备份文件，可用于迁移设备或灾难恢复。');
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as TimeFlowBackupPayload;
      if (parsed?.app !== 'TimeFlow' || !parsed?.data || !Array.isArray(parsed.data.entries)) {
        throw new Error('文件格式无效，请选择由 TimeFlow 导出的 JSON 备份文件。');
      }
      setPendingRestore(parsed);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'JSON 文件解析失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmRestoreBackup = async () => {
    if (!pendingRestore) return;
    const result = await importBackup(pendingRestore, restoreMode);
    setPendingRestore(null);
    setStatusBanner(
      `数据恢复成功：导入 ${result.entriesCount} 条时间记录、${result.diariesCount} 篇日记、${result.reviewsCount} 份复盘。`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">数据管理中心</h1>
          <p className="mt-1 text-xs text-slate-500">
            所有记录持久化保存于浏览器本地 IndexedDB 数据库，刷新或关闭页面不会丢失；支持 Excel / CSV / JSON 完整导出与迁移恢复。
          </p>
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          时间记录 {entries.length} 条 · 日记 {diaries.length} 篇 · 复盘 {reviews.length} 份
          {offlinePendingCount > 0 ? ` · 待同步 ${offlinePendingCount} 条` : ''}
        </div>
      </div>

      {statusBanner && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          {statusBanner}
        </div>
      )}

      {/* Export / Import / Backup Toolbar */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">数据导出与备份</h2>
          <p className="mt-1 text-xs text-slate-500">
            建议每周导出一次 JSON 完整备份，或导出 Excel / CSV 进行离线归档。
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-4 w-4" />
              导出 Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <FileText className="h-4 w-4 text-slate-500" />
              {hasFilters ? `导出筛选结果 CSV (${filteredEntries.length})` : '导出 CSV'}
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4 text-slate-500" />
              导出 JSON 完整备份
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">数据恢复、迁移与初始化</h2>
          <p className="mt-1 text-xs text-slate-500">
            支持从 JSON 备份文件恢复历史数据，或一键导入 7 天演示数据体验图表与 AI 分析。
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              从 JSON 备份恢复
            </button>
            <button
              type="button"
              onClick={async () => {
                await seedSampleData();
                setStatusBanner('已成功加载近 7 天真实结构的演示数据。');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Database className="h-4 w-4 text-slate-500" />
              加载 7 天演示数据
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
            >
              <Trash2 className="h-4 w-4" />
              清空全部数据
            </button>
          </div>
        </div>
      </section>

      {/* Restore Mode Confirmation Panel */}
      {pendingRestore && (
        <section className="rounded-xl border border-blue-300 bg-blue-50/50 p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            检测到有效的 TimeFlow 备份文件（导出于{' '}
            {new Date(pendingRestore.exportedAt).toLocaleString('zh-CN', { hour12: false })}）
          </h3>
          <p className="mt-1 text-xs text-slate-600 tabular-nums">
            包含时间记录 {pendingRestore.data.entries.length} 条、日记{' '}
            {pendingRestore.data.diaries?.length ?? 0} 篇、周期复盘{' '}
            {pendingRestore.data.reviews?.length ?? 0} 份。请选择恢复方式：
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="restoreMode"
                checked={restoreMode === 'merge'}
                onChange={() => setRestoreMode('merge')}
              />
              <span>增量合并（保留现有数据，按 ID 合并导入）</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="restoreMode"
                checked={restoreMode === 'replace'}
                onChange={() => setRestoreMode('replace')}
              />
              <span className="text-red-700">完全覆盖（先清空当前本地库，再写入备份）</span>
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={confirmRestoreBackup}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              确认执行恢复
            </button>
            <button
              type="button"
              onClick={() => setPendingRestore(null)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </section>
      )}

      {/* Tabs: Time Entries vs Diaries */}
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('entries')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'entries'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          时间记录明细 ({entries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('diaries')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'diaries'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          历史日记列表 ({diaries.length})
        </button>
      </div>

      {activeTab === 'entries' ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="按关键词搜索业务内容、思考栏、成果备注..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as ActivityCategory | 'all')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                aria-label="按分类筛选"
              >
                <option value="all">全部分类</option>
                {CATEGORY_LIST.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                aria-label="起始日期"
              />
              <span className="text-xs text-slate-400">至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                aria-label="结束日期"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5">日期与时间</th>
                  <th className="px-4 py-2.5">分类</th>
                  <th className="px-4 py-2.5">业务内容</th>
                  <th className="px-4 py-2.5">思考 / 成果</th>
                  <th className="px-4 py-2.5">状态</th>
                  <th className="px-4 py-2.5 text-right">时长</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                      暂无符合条件的历史记录。
                    </td>
                  </tr>
                ) : (
                  filteredEntries.slice(0, 100).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {item.date} {item.startTime}-{item.endTime}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                        {CATEGORY_MAP[item.category]?.label}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{item.title}</td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-xs text-slate-500">
                        {item.resultNote || item.thought || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {STATUS_LABELS[item.status]}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDurationHuman(getEntryDurationMinutes(item))}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onNavigate('daily-log', item.date)}
                          className="mr-2 text-xs font-medium text-blue-600 hover:underline"
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(item.id)}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-2.5">日记日期</th>
                <th className="px-4 py-2.5">今日工作完成摘要</th>
                <th className="px-4 py-2.5">今日复盘亮点</th>
                <th className="px-4 py-2.5">历史版本数</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {diaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    暂无历史日记。
                  </td>
                </tr>
              ) : (
                [...diaries]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((d) => (
                    <tr key={d.date} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-800 tabular-nums whitespace-nowrap">
                        {d.date}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-xs text-slate-600">
                        {d.work.completed || '—'}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-xs text-slate-600">
                        {d.review.wentWell || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                        {d.versions.length}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onNavigate('diary', d.date)}
                          className="mr-3 text-xs font-medium text-blue-600 hover:underline"
                        >
                          查看/编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteDiaryDate(d.date)}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="确认删除该条记录？"
        description="删除后该记录将从本地数据库永久移除，所有相关统计图表将同步重新计算。"
        onConfirm={async () => {
          if (deleteTargetId) {
            await deleteEntry(deleteTargetId);
            setDeleteTargetId(null);
          }
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteDiaryDate)}
        title={`确认删除 ${deleteDiaryDate ?? ''} 的日记？`}
        description="删除后该日记及其历史版本快照将被永久移除，无法恢复。"
        onConfirm={async () => {
          if (deleteDiaryDate) {
            await deleteDiary(deleteDiaryDate);
            setDeleteDiaryDate(null);
          }
        }}
        onCancel={() => setDeleteDiaryDate(null)}
      />

      <ConfirmDialog
        open={confirmClearOpen}
        title="危险操作：确认清空全部本地数据？"
        description="该操作会永久删除全部时间记录、日记、周期复盘和 AI 分析报告。强烈建议先导出 JSON 备份后再执行。"
        confirmLabel="确认永久清空"
        onConfirm={async () => {
          await clearAllData();
          setConfirmClearOpen(false);
          setStatusBanner('已清空本地全部历史数据。');
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
};
