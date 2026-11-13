import React, { useMemo, useState } from 'react';
import { CheckCircle2, Info, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useTimeFlow } from '../context/TimeFlowContext';
import { AIGrowthReport, CATEGORY_LIST, CATEGORY_MAP, STATUS_LABELS } from '../types/timeflow';
import {
  addDays,
  computeRangeStats,
  formatHours,
  formatLocalDate,
  getEntryDurationMinutes,
  getPeriodRange,
} from '../utils/stats';
import { ConfirmDialog } from '../components/ConfirmDialog';

type ScopeOption = '7d' | '30d' | 'quarter' | 'all';

export const AIAnalysisPage: React.FC = () => {
  const {
    entries,
    diaries,
    settings,
    aiReports,
    isOnline,
    upsertAIReport,
    deleteAIReport,
    updateSettings,
  } = useTimeFlow();

  const today = formatLocalDate(new Date());
  const [scope, setScope] = useState<ScopeOption>('30d');
  const [includeDiaries, setIncludeDiaries] = useState(true);
  const [consentChecked, setConsentChecked] = useState(settings.aiDataConsent);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { startDate, endDate, rangeLabel } = useMemo(() => {
    if (scope === '7d') {
      return { startDate: addDays(today, -6), endDate: today, rangeLabel: '最近 7 天' };
    }
    if (scope === '30d') {
      return { startDate: addDays(today, -29), endDate: today, rangeLabel: '最近 30 天' };
    }
    if (scope === 'quarter') {
      const q = getPeriodRange('quarter', today);
      return { startDate: q.startDate, endDate: q.endDate, rangeLabel: q.label };
    }
    const dates = entries.map((e) => e.date).sort();
    return {
      startDate: dates[0] ?? today,
      endDate: dates[dates.length - 1] ?? today,
      rangeLabel: '全部历史记录',
    };
  }, [scope, today, entries]);

  const stats = useMemo(
    () => computeRangeStats(entries, startDate, endDate),
    [entries, startDate, endDate],
  );

  const scopedEntries = useMemo(
    () =>
      entries
        .filter((e) => e.date >= startDate && e.date <= endDate && e.status !== 'cancelled')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, startDate, endDate],
  );

  const scopedDiaries = useMemo(
    () =>
      diaries
        .filter((d) => d.date >= startDate && d.date <= endDate)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [diaries, startDate, endDate],
  );

  const activeReport: AIGrowthReport | null = useMemo(() => {
    if (selectedReportId) {
      return aiReports.find((r) => r.id === selectedReportId) ?? aiReports[0] ?? null;
    }
    return aiReports[0] ?? null;
  }, [aiReports, selectedReportId]);

  const handleRunAnalysis = async () => {
    if (!consentChecked) {
      setErrorMsg('请先勾选下方“确认发送所选范围数据至后端 AI 服务”后再执行分析。');
      return;
    }
    if (!isOnline) {
      setErrorMsg('当前处于离线状态，无法调用 AI 成长分析服务。基础统计与复盘功能仍可离线正常使用。');
      return;
    }
    if (scopedEntries.length === 0) {
      setErrorMsg('当前所选周期内没有真实时间记录，无法执行 AI 成长诊断。');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      if (consentChecked !== settings.aiDataConsent) {
        await updateSettings({ ...settings, aiDataConsent: true, updatedAt: Date.now() });
      }

      const categoryBreakdown = CATEGORY_LIST.map((cat) => {
        const mins = stats.categoryMinutes[cat.id];
        return {
          category: cat.label,
          hours: Number((mins / 60).toFixed(2)),
          percent:
            stats.recordedMinutes > 0 ? Math.round((mins / stats.recordedMinutes) * 100) : 0,
        };
      }).filter((c) => c.hours > 0);

      const summaryStats = {
        startDate,
        endDate,
        totalEntries: stats.totalEntries,
        recordedHours: Number(formatHours(stats.recordedMinutes)),
        effectiveHours: Number(formatHours(stats.effectiveMinutes)),
        restHours: Number(formatHours(stats.restMinutes)),
        completionRatePercent: stats.completionRate,
        unplannedRatePercent: stats.unplannedRate,
        activeDaysCount: stats.dailySeries.filter((d) => d.recordedHours > 0).length,
      };

      const entrySamples = scopedEntries.slice(0, 80).map((e) => ({
        date: e.date,
        time: `${e.startTime}-${e.endTime}`,
        minutes: getEntryDurationMinutes(e),
        category: CATEGORY_MAP[e.category]?.label,
        title: e.title,
        status: STATUS_LABELS[e.status],
        energy: e.energy,
        isUnplanned: e.isUnplanned,
        thought: e.thought,
        resultNote: e.resultNote,
      }));

      const diarySamples = includeDiaries
        ? scopedDiaries.slice(0, 20).map((d) => ({
            date: d.date,
            problems: d.thinking.problems,
            causes: d.thinking.causes,
            wentWell: d.review.wentWell,
            toImprove: d.review.toImprove,
            timeWasters: d.review.timeWasters,
          }))
        : [];

      const res = await fetch('/api/ai/growth-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rangeLabel,
          summaryStats,
          categoryBreakdown,
          entrySamples,
          diarySamples,
          goals: settings.longTermGoals,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI 服务返回错误');
      }

      const report: AIGrowthReport = {
        id: `ai-${Date.now()}`,
        createdAt: Date.now(),
        rangeLabel,
        startDate,
        endDate,
        recordCount: scopedEntries.length,
        ...data.analysis,
      };

      await upsertAIReport(report);
      setSelectedReportId(report.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '生成 AI 分析失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900">AI 成长分析</h1>
        <p className="mt-1 text-xs text-slate-500">
          可选独立模块：基于真实时间记录与日记洞察时间投入结构、低效模式与可执行改善方案。数据不足时将如实提示，绝不编造经历。
        </p>
      </div>

      {/* Control & Privacy Consent Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">分析时间范围：</span>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ['7d', '近7天'],
                    ['30d', '近30天'],
                    ['quarter', '本季度'],
                    ['all', '全部历史'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setScope(k)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      scope === k
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="tabular-nums">
                范围：{startDate} 至 {endDate}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">匹配时间记录：{scopedEntries.length} 条</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">匹配日记：{scopedDiaries.length} 篇</span>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={includeDiaries}
                  onChange={(e) => setIncludeDiaries(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                附带日记思考与复盘摘录（有助于 AI 分析深层原因）
              </label>

              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600"
                />
                <span>
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-blue-600" />
                  我确认将上述选定范围内的统计汇总、时间记录与日记摘录发送至后端 AI 模型进行诊断分析（不会上传范围外数据）。
                </span>
              </label>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? '正在深度分析...' : '生成 AI 成长诊断报告'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
      </section>

      {/* Main Layout: Saved Reports Sidebar + Active Report View */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            历史诊断报告（{aiReports.length}）
          </h2>
          {aiReports.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              尚未生成过 AI 成长分析报告。确认上方范围后点击生成，报告将自动保存在本地。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {aiReports.map((rep) => (
                <li
                  key={rep.id}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 transition-colors ${
                    activeReport?.id === rep.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedReportId(rep.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-slate-900">{rep.rangeLabel}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                      {new Date(rep.createdAt).toLocaleString('zh-CN', { hour12: false })} ·{' '}
                      {rep.recordCount} 条记录
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(rep.id)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="删除报告"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="lg:col-span-8">
          {!activeReport ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">暂无可展示的 AI 分析报告</p>
              <p className="mt-1 text-xs text-slate-500">
                选择分析时间范围并确认发送范围后，即可生成涵盖 8 大核心维度的诊断报告。
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Data Sufficiency Banner */}
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  <span className="font-semibold text-slate-900">数据样本说明：</span>
                  {activeReport.dataSufficiencyNote}
                </div>
              </div>

              {/* 1. 数据事实 */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-base font-semibold text-slate-900">01. 数据事实</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  {activeReport.dataFacts.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-xs text-blue-600 tabular-nums mt-0.5">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 2. 优势与长期价值投入 */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  02. 持续亮点与高价值投入
                </h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  {activeReport.strengthsAndHighlights.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 3. 问题发现 & 4. 原因分析 */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 text-base font-semibold text-slate-900">03. 问题发现</h3>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {activeReport.issuesFound.map((item, i) => (
                      <li key={i} className="leading-relaxed">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 text-base font-semibold text-slate-900">04. 原因分析</h3>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {activeReport.rootCauses.map((item, i) => (
                      <li key={i} className="leading-relaxed">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* 5. 改善建议 */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  05. 具体可执行改善建议
                </h3>
                <div className="divide-y divide-slate-100">
                  {activeReport.actionableSuggestions.map((s, i) => (
                    <div key={i} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                      <p className="mt-1 text-sm text-slate-700">{s.action}</p>
                      <p className="mt-1 text-xs text-blue-700">预期效果：{s.expectedImpact}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 6. 下一阶段目标 */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  06. 下一阶段可追踪目标
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <th className="py-2 pr-4">目标事项</th>
                        <th className="py-2 pr-4">衡量指标</th>
                        <th className="py-2">时间周期</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeReport.nextPhaseGoals.map((g, i) => (
                        <tr key={i}>
                          <td className="py-2.5 pr-4 font-medium text-slate-900">{g.goal}</td>
                          <td className="py-2.5 pr-4 text-slate-700">{g.metric}</td>
                          <td className="py-2.5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                            {g.timeframe}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="确认删除该份 AI 分析报告？"
        description="删除后将从本地历史报告列表中移除，无法恢复。"
        onConfirm={async () => {
          if (deleteTargetId) {
            await deleteAIReport(deleteTargetId);
            if (selectedReportId === deleteTargetId) setSelectedReportId(null);
            setDeleteTargetId(null);
          }
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
};
