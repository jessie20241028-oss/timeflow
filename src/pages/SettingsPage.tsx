import React, { useEffect, useMemo, useState } from 'react';
import { Download, Laptop, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useTimeFlow } from '../context/TimeFlowContext';
import { usePWAInstall } from '../hooks/usePWA';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  BreakRange,
  DangoSettings,
  DEFAULT_DANGO_SETTINGS,
  DEFAULT_SETTINGS,
  UserSettings,
} from '../types/timeflow';
import { computeDangoGrowth } from '../utils/dangoGrowth';
import { DANGO_ANIMATIONS } from '../constants/dango';

export const SettingsPage: React.FC = () => {
  const { entries, tasks, diaries, settings, isOnline, offlinePendingCount, updateSettings } =
    useTimeFlow();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const prefersReducedMotion = useReducedMotion();

  const [form, setForm] = useState<UserSettings>(settings);
  const [newGoal, setNewGoal] = useState('');
  const [newBreakLabel, setNewBreakLabel] = useState('');
  const [newBreakStart, setNewBreakStart] = useState('12:00');
  const [newBreakEnd, setNewBreakEnd] = useState('13:00');
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const dangoForm: DangoSettings = useMemo(
    () => ({ ...DEFAULT_DANGO_SETTINGS, ...(form.dango ?? {}) }),
    [form.dango],
  );

  const growthSummary = useMemo(
    () => computeDangoGrowth(entries, tasks, diaries),
    [entries, tasks, diaries],
  );

  const updateDangoField = <K extends keyof DangoSettings>(key: K, value: DangoSettings[K]) => {
    const next: UserSettings = {
      ...form,
      dango: {
        ...dangoForm,
        [key]: value,
      },
    };
    setForm(next);
    handleSave(next);
  };

  const resetDangoDefaults = () => {
    const next: UserSettings = {
      ...form,
      dango: { ...DEFAULT_DANGO_SETTINGS },
    };
    setForm(next);
    handleSave(next);
  };

  const handleSave = async (next: UserSettings = form) => {
    const startH = Math.max(0, Math.min(12, Math.floor(Number(next.dayStartHour) || 8)));
    const endH = Math.max(14, Math.min(24, Math.floor(Number(next.dayEndHour) || 22)));
    const normalized = { ...next, dayStartHour: startH, dayEndHour: endH, updatedAt: Date.now() };
    setForm(normalized);
    await updateSettings(normalized);
    setSavedToast('设置已保存至本地');
    setTimeout(() => setSavedToast(null), 2000);
  };

  const addBreakRange = () => {
    if (!newBreakLabel.trim()) return;
    if (newBreakEnd <= newBreakStart) {
      setSavedToast('休息时段结束时间必须晚于开始时间');
      setTimeout(() => setSavedToast(null), 2500);
      return;
    }
    const item: BreakRange = {
      id: `br-${Date.now()}`,
      label: newBreakLabel.trim(),
      startTime: newBreakStart,
      endTime: newBreakEnd,
    };
    const next = { ...form, breakRanges: [...form.breakRanges, item] };
    setForm(next);
    setNewBreakLabel('');
    handleSave(next);
  };

  const removeBreakRange = (id: string) => {
    const next = { ...form, breakRanges: form.breakRanges.filter((b) => b.id !== id) };
    setForm(next);
    handleSave(next);
  };

  const addGoal = () => {
    if (!newGoal.trim()) return;
    const next = { ...form, longTermGoals: [...form.longTermGoals, newGoal.trim()] };
    setForm(next);
    setNewGoal('');
    handleSave(next);
  };

  const removeGoal = (idx: number) => {
    const next = {
      ...form,
      longTermGoals: form.longTermGoals.filter((_, i) => i !== idx),
    };
    setForm(next);
    handleSave(next);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">系统设置</h1>
          <p className="mt-1 text-xs text-slate-500">
            自定义每日记录时段、灰底休息区、长期成长目标与桌面端 PWA 安装
          </p>
        </div>
        {savedToast && (
          <span className="text-xs font-medium text-emerald-700">{savedToast}</span>
        )}
      </div>

      {/* 1. Daily Schedule Window */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">每日时间表默认范围</h2>
        <p className="mt-1 text-xs text-slate-500">
          默认为 08:00 至 22:00，按 30 分钟递增。范围外的早间或夜间记录仍可正常补录并显示在常规时段外区域。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">开始小时 (0–12)</label>
            <input
              type="number"
              min={0}
              max={12}
              value={form.dayStartHour}
              onChange={(e) => setForm({ ...form, dayStartHour: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">结束小时 (14–24)</label>
            <input
              type="number"
              min={14}
              max={24}
              value={form.dayEndHour}
              onChange={(e) => setForm({ ...form, dayEndHour: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => handleSave(form)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Save className="h-4 w-4" />
              保存时间范围
            </button>
          </div>
        </div>
      </section>

      {/* 2. Gray Break Ranges */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">灰底休息/用餐时段标识</h2>
        <p className="mt-1 text-xs text-slate-500">
          处于以下时间段内的 30 分钟行在「每日记录」中将显示浅灰背景，提示午休或晚餐恢复（仍可自由填写或覆盖）。
        </p>

        <ul className="mt-4 divide-y divide-slate-100">
          {form.breakRanges.map((br) => (
            <li key={br.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-800">{br.label}</span>
                <span className="ml-3 font-mono text-xs text-slate-500 tabular-nums">
                  {br.startTime} - {br.endTime}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeBreakRange(br.id)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="删除时段"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <input
            type="text"
            value={newBreakLabel}
            onChange={(e) => setNewBreakLabel(e.target.value)}
            placeholder="时段名称（如：下午茶休整）"
            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <input
            type="time"
            value={newBreakStart}
            onChange={(e) => setNewBreakStart(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm tabular-nums"
          />
          <span className="text-slate-400">-</span>
          <input
            type="time"
            value={newBreakEnd}
            onChange={(e) => setNewBreakEnd(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={addBreakRange}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            添加
          </button>
        </div>
      </section>

      {/* 3. Long-term Goals */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">个人长期成长目标</h2>
        <p className="mt-1 text-xs text-slate-500">
          将在季度复盘、年度复盘及 AI 成长分析中用于评估你的时间分配是否与长期目标对齐。
        </p>

        <ul className="mt-4 space-y-2">
          {form.longTermGoals.map((goal, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2 text-sm"
            >
              <span className="text-slate-800">{goal}</span>
              <button
                type="button"
                onClick={() => removeGoal(idx)}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="输入新的长期目标..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={addGoal}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            添加目标
          </button>
        </div>
      </section>

      {/* 3.5 Dango Mascot Companion Settings */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={
                dangoForm.animationsEnabled && !prefersReducedMotion
                  ? DANGO_ANIMATIONS.idle.gif
                  : DANGO_ANIMATIONS.idle.fallbackImg
              }
              alt="团子 Dango 预览"
              className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-50 object-contain p-1"
            />
            <div>
              <h2 className="text-base font-semibold text-slate-900">团子助手设置</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                配置 TimeFlow 专属虚拟猫咪伙伴「团子 Dango」的动画、气泡互动与陪伴成长功能
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetDangoDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            恢复团子默认设置
          </button>
        </div>

        {prefersReducedMotion && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-2.5 text-xs text-blue-900">
            检测到系统已开启「减少动态效果（prefers-reduced-motion）」，团子将自动保持静态显示以避免干扰。
          </div>
        )}

        <div className="mt-4 divide-y divide-slate-100">
          <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">显示虚拟伙伴「团子 Dango」</p>
              <p className="text-xs text-slate-500">关闭后首页、每日记录与日记页面将完全隐藏团子</p>
            </div>
            <input
              type="checkbox"
              checked={dangoForm.enabled}
              onChange={(e) => updateDangoField('enabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">启用动态 GIF 动画</p>
              <p className="text-xs text-slate-500">关闭后不加载动态 GIF，仅展示高清静态图</p>
            </div>
            <input
              type="checkbox"
              checked={dangoForm.animationsEnabled}
              disabled={!dangoForm.enabled}
              onChange={(e) => updateDangoField('animationsEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">任务与目标完成庆祝动画</p>
              <p className="text-xs text-slate-500">完成任务或三件大事时触发 1–2 秒欢呼动作后自动恢复</p>
            </div>
            <input
              type="checkbox"
              checked={dangoForm.taskCelebrationEnabled}
              disabled={!dangoForm.enabled}
              onChange={(e) => updateDangoField('taskCelebrationEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">点击对话气泡互动</p>
              <p className="text-xs text-slate-500">允许点击团子展开简短鼓励语录（绝不自动频繁弹出）</p>
            </div>
            <input
              type="checkbox"
              checked={dangoForm.chatBubbleEnabled}
              disabled={!dangoForm.enabled}
              onChange={(e) => updateDangoField('chatBubbleEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">团子陪伴成长记录</p>
              <p className="text-xs text-slate-500">
                根据真实记录天数与累计时长解锁小动作和纪念徽章（无打卡惩罚）
              </p>
            </div>
            <input
              type="checkbox"
              checked={dangoForm.growthEnabled}
              disabled={!dangoForm.enabled}
              onChange={(e) => updateDangoField('growthEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </label>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">动画频率控制</p>
              <p className="text-xs text-slate-500">
                低频模式会间歇停留在静态姿态，减少工作时的视觉分散
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                disabled={!dangoForm.enabled || !dangoForm.animationsEnabled}
                onClick={() => updateDangoField('animationFrequency', 'low')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  dangoForm.animationFrequency === 'low'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                低频安静（推荐）
              </button>
              <button
                type="button"
                disabled={!dangoForm.enabled || !dangoForm.animationsEnabled}
                onClick={() => updateDangoField('animationFrequency', 'normal')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  dangoForm.animationFrequency === 'normal'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                正常循环
              </button>
            </div>
          </div>
        </div>

        {dangoForm.growthEnabled && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 tabular-nums">
            <span>累计记录 {growthSummary.totalRecordedDays} 天</span>
            <span aria-hidden="true">·</span>
            <span>当前连续 {growthSummary.currentStreakDays} 天</span>
            <span aria-hidden="true">·</span>
            <span>累计时长 {growthSummary.totalHours}h</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-blue-600">
              已解锁 {growthSummary.unlockedCount}/{growthSummary.rewards.length} 项陪伴里程碑
            </span>
          </div>
        )}
      </section>

      {/* 4. PWA Desktop / Offline Status */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              桌面应用安装 (PWA) 与离线支持
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              网络状态：{isOnline ? '在线' : '离线模式（本地记录中）'} · 待同步变更：
              {offlinePendingCount} 条
            </p>
          </div>

          {isInstalled ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <Laptop className="h-4 w-4" />
              已作为独立桌面/移动应用运行
            </span>
          ) : isInstallable ? (
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              安装 TimeFlow 到桌面
            </button>
          ) : isIOS ? (
            <p className="text-xs text-slate-600">
              iPhone/iPad 请点击 Safari 底部「分享」按钮，选择「添加到主屏幕」。
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Mac Chrome / Edge 可点击地址栏右侧安装图标将 TimeFlow 添加到程序坞。
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.aiDataConsent}
              onChange={(e) => {
                const next = { ...form, aiDataConsent: e.target.checked };
                setForm(next);
                handleSave(next);
              }}
              className="rounded border-slate-300 text-blue-600"
            />
            允许在点击 AI 按钮时发送选定范围记录至后端 AI 接口
          </label>

          <button
            type="button"
            onClick={() => {
              setForm(DEFAULT_SETTINGS);
              handleSave(DEFAULT_SETTINGS);
            }}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            恢复默认设置
          </button>
        </div>
      </section>
    </div>
  );
};
