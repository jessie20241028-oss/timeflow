import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  DANGO_ANIMATIONS,
  DangoChatContextKey,
  getTimeOfDayContext,
  pickRandomDangoMessage,
} from '../constants/dango';
import { useTimeFlow } from '../context/TimeFlowContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { DangoState, DEFAULT_DANGO_SETTINGS } from '../types/timeflow';
import { computeDangoGrowth } from '../utils/dangoGrowth';

export interface DangoCelebrationTrigger {
  id: number;
  type: 'task' | 'goal' | 'rest';
  message?: string;
}

interface DangoCatProps {
  state: DangoState;
  contextHint?: DangoChatContextKey;
  statusNote?: string;
  celebrationTrigger?: DangoCelebrationTrigger | null;
  variant?: 'dock' | 'inline' | 'sidebar';
  className?: string;
}

const DangoSvgFallback: React.FC<{ state: DangoState; size: number }> = ({ state, size }) => {
  const isSleep = state === 'rest';
  const isCelebrate = state === 'celebrate' || state === 'goal_celebrate';
  const isPlus = state === 'companion_plus';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="团子 Dango"
    >
      <ellipse cx="80" cy="142" rx="40" ry="7" fill="#E2E8F0" />
      <path d="M114 125 Q138 118 134 102" stroke="#94A3B8" strokeWidth="9" strokeLinecap="round" />
      <path d="M114 125 Q138 118 134 102" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="80" cy="112" rx="38" ry="30" fill="#FFFFFF" stroke="#334155" strokeWidth="3" />
      <polygon points="48,54 43,26 66,43" fill="#FFFFFF" stroke="#334155" strokeWidth="3" strokeLinejoin="round" />
      <polygon points="112,54 117,26 94,43" fill="#FFFFFF" stroke="#334155" strokeWidth="3" strokeLinejoin="round" />
      <polygon points="50,50 47,33 61,44" fill="#DBEAFE" />
      <polygon points="110,50 113,33 99,44" fill="#DBEAFE" />
      <ellipse cx="80" cy="68" rx="37" ry="31" fill="#FFFFFF" stroke="#334155" strokeWidth="3" />
      {isSleep ? (
        <>
          <path d="M58 67 Q64 72 70 67" stroke="#334155" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M90 67 Q96 72 102 67" stroke="#334155" strokeWidth="2.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="64" cy="67" r="6" fill="#2563EB" />
          <circle cx="96" cy="67" r="6" fill="#2563EB" />
          <circle cx="62" cy="65" r="2" fill="#FFFFFF" />
          <circle cx="94" cy="65" r="2" fill="#FFFFFF" />
        </>
      )}
      <path d="M77 74 L83 74 L80 77 Z" fill="#F472B6" />
      <path d="M74 79 Q80 83 86 79" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M53 89 Q80 98 107 89" stroke="#2563EB" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="80" cy="96" r="5" fill="#F59E0B" stroke="#1E40AF" strokeWidth="1.5" />
      {isCelebrate && (
        <>
          <circle cx="32" cy="36" r="4" fill="#2563EB" />
          <circle cx="128" cy="34" r="4" fill="#F59E0B" />
        </>
      )}
      {isPlus && (
        <polygon points="122,22 125,29 132,30 127,35 128,42 122,38 116,42 117,35 112,30 119,29" fill="#F59E0B" />
      )}
    </svg>
  );
};

export const DangoCat: React.FC<DangoCatProps> = ({
  state,
  contextHint,
  statusNote,
  celebrationTrigger,
  variant = 'inline',
  className = '',
}) => {
  const { entries, tasks, diaries, settings } = useTimeFlow();
  const prefersReducedMotion = useReducedMotion();

  const dangoSettings = useMemo(
    () => ({ ...DEFAULT_DANGO_SETTINGS, ...(settings.dango ?? {}) }),
    [settings.dango],
  );

  const growth = useMemo(
    () => computeDangoGrowth(entries, tasks, diaries),
    [entries, tasks, diaries],
  );

  const unlockedWarm = growth.rewards.some((r) => r.id === 'weekly_5' && r.unlocked);
  const unlockedPlusPose = growth.rewards.some((r) => r.id === 'streak_3' && r.unlocked);

  const [usePlusPose, setUsePlusPose] = useState(false);
  const [overrideState, setOverrideState] = useState<DangoState | null>(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [autoBubbleMsg, setAutoBubbleMsg] = useState<string | null>(null);
  const [manualMessage, setManualMessage] = useState<string>(() =>
    pickRandomDangoMessage(contextHint ?? getTimeOfDayContext(), { unlockedWarm }),
  );
  const [growthModalOpen, setGrowthModalOpen] = useState(false);
  const [gifError, setGifError] = useState(false);
  const [pngError, setPngError] = useState(false);
  const [lowFreqGifActive, setLowFreqGifActive] = useState(true);

  const lastTriggerIdRef = useRef<number>(0);
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedBaseState: DangoState =
    state === 'idle' && usePlusPose && unlockedPlusPose ? 'companion_plus' : state;
  const activeState: DangoState = overrideState ?? resolvedBaseState;
  const animMeta = DANGO_ANIMATIONS[activeState] ?? DANGO_ANIMATIONS.idle;

  // Reset image fallback flags when active asset path changes
  useEffect(() => {
    setGifError(false);
    setPngError(false);
  }, [activeState]);

  // Handle celebration triggers cleanly with auto-recovery back to normal state
  useEffect(() => {
    if (!celebrationTrigger || celebrationTrigger.id <= 0) return;
    if (celebrationTrigger.id === lastTriggerIdRef.current) return;
    lastTriggerIdRef.current = celebrationTrigger.id;

    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    if (autoToastTimerRef.current) clearTimeout(autoToastTimerRef.current);

    if (celebrationTrigger.type === 'rest') {
      setOverrideState('rest');
      celebTimerRef.current = setTimeout(() => setOverrideState(null), 2000);
      if (dangoSettings.chatBubbleEnabled) {
        const msg =
          celebrationTrigger.message ??
          pickRandomDangoMessage('rest', { unlockedWarm });
        setAutoBubbleMsg(msg);
        setManualMessage(msg);
        autoToastTimerRef.current = setTimeout(() => setAutoBubbleMsg(null), 3500);
      }
      return;
    }

    if (!dangoSettings.taskCelebrationEnabled) {
      return;
    }

    const targetState: DangoState =
      celebrationTrigger.type === 'goal' ? 'goal_celebrate' : 'celebrate';
    setOverrideState(targetState);
    const duration = celebrationTrigger.type === 'goal' ? 2100 : 1800;
    celebTimerRef.current = setTimeout(() => setOverrideState(null), duration);

    if (dangoSettings.chatBubbleEnabled) {
      const msg =
        celebrationTrigger.message ??
        pickRandomDangoMessage('celebrate', { unlockedWarm });
      setAutoBubbleMsg(msg);
      setManualMessage(msg);
      autoToastTimerRef.current = setTimeout(() => setAutoBubbleMsg(null), 3600);
    }
  }, [celebrationTrigger, dangoSettings.taskCelebrationEnabled, dangoSettings.chatBubbleEnabled, unlockedWarm]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      if (autoToastTimerRef.current) clearTimeout(autoToastTimerRef.current);
    };
  }, []);

  const canAnimate = dangoSettings.animationsEnabled && !prefersReducedMotion;
  const isCelebratingNow = activeState === 'celebrate' || activeState === 'goal_celebrate';

  // Gentle low-frequency duty cycle: plays GIF briefly (~3.6s) then rests quietly on static PNG (~9s)
  useEffect(() => {
    if (!canAnimate) {
      setLowFreqGifActive(false);
      return;
    }
    if (dangoSettings.animationFrequency === 'normal' || isCelebratingNow) {
      setLowFreqGifActive(true);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const runPlayPhase = () => {
      if (cancelled) return;
      setLowFreqGifActive(true);
      timer = setTimeout(() => {
        if (cancelled) return;
        setLowFreqGifActive(false);
        timer = setTimeout(runPlayPhase, 9000);
      }, 3600);
    };

    runPlayPhase();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canAnimate, dangoSettings.animationFrequency, isCelebratingNow, activeState]);

  // Refresh contextual message when context changes & bubble isn't actively displaying a celebration
  useEffect(() => {
    if (!autoBubbleMsg) {
      const ctx =
        contextHint ??
        (activeState === 'work'
          ? 'work'
          : activeState === 'learn'
            ? 'learn'
            : activeState === 'rest'
              ? 'rest'
              : getTimeOfDayContext());
      setManualMessage(pickRandomDangoMessage(ctx, { unlockedWarm }));
    }
  }, [contextHint, activeState, unlockedWarm, autoBubbleMsg]);

  if (!dangoSettings.enabled) {
    return null;
  }

  const shouldMountGif = canAnimate && lowFreqGifActive && !gifError;
  const avatarSize = variant === 'dock' ? 76 : variant === 'sidebar' ? 68 : 60;

  const renderAvatarMedia = (size: number) => {
    if (shouldMountGif) {
      return (
        <img
          src={animMeta.gif}
          alt={`团子 Dango - ${animMeta.label}`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setGifError(true)}
          className="h-full w-full select-none object-contain transition-transform duration-200"
        />
      );
    }
    if (!pngError) {
      return (
        <img
          src={animMeta.fallbackImg}
          alt={`团子 Dango - ${animMeta.label}`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setPngError(true)}
          className="h-full w-full select-none object-contain"
        />
      );
    }
    return <DangoSvgFallback state={activeState} size={size} />;
  };

  const resolvedContext: DangoChatContextKey = isCelebratingNow
    ? 'celebrate'
    : contextHint ??
      (activeState === 'work'
        ? 'work'
        : activeState === 'learn'
          ? 'learn'
          : activeState === 'rest'
            ? 'rest'
            : getTimeOfDayContext());

  const handleCatClick = () => {
    if (dangoSettings.chatBubbleEnabled) {
      setAutoBubbleMsg(null);
      setBubbleOpen((prev) => {
        if (!prev) {
          setManualMessage((curr) =>
            pickRandomDangoMessage(resolvedContext, { exclude: curr, unlockedWarm }),
          );
        }
        return !prev;
      });
    } else if (dangoSettings.growthEnabled) {
      setGrowthModalOpen(true);
    }
  };

  const handleNextLine = () => {
    setAutoBubbleMsg(null);
    setManualMessage((curr) =>
      pickRandomDangoMessage(resolvedContext, { exclude: curr, unlockedWarm }),
    );
  };

  const showBubble = dangoSettings.chatBubbleEnabled && (bubbleOpen || Boolean(autoBubbleMsg));
  const displayedBubbleText = autoBubbleMsg ?? manualMessage;

  const growthModal = growthModalOpen && dangoSettings.growthEnabled && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="团子陪伴成长档案"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              {renderAvatarMedia(48)}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">团子陪伴成长档案</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                记录每一份真实的时间投入 · 无打卡压力 · 无惩罚机制
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setGrowthModalOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭成长档案"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Factual stats grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-500">累计记录天数</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {growth.totalRecordedDays} 天
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-500">当前连续记录</p>
            <p className="mt-1 font-mono text-lg font-semibold text-blue-600 tabular-nums">
              {growth.currentStreakDays} 天
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-500">累计专注陪伴</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {growth.totalHours}h
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-500">近 7 天活跃</p>
            <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {growth.weeklyRecordDays} 天 · {growth.weeklyEntryCount} 条
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-500">已完成核心大事</p>
            <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {growth.completedTopThreeCount} 项
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-500">本月记录天数</p>
            <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {growth.monthlyActiveDays} 天
            </p>
          </div>
        </div>

        {/* Plus pose switcher if unlocked */}
        {unlockedPlusPose && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-2.5 text-xs">
            <span className="font-medium text-blue-900">
              已解锁「进阶陪伴形态（星标眨耳）」，可在空闲时切换展示
            </span>
            <button
              type="button"
              onClick={() => setUsePlusPose((v) => !v)}
              className="rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              {usePlusPose ? '切回趴姿' : '启用星标形态'}
            </button>
          </div>
        )}

        {/* Unlockable rewards list */}
        <div className="mt-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">陪伴里程碑解锁</h4>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              已解锁 {growth.unlockedCount} / {growth.rewards.length}
            </span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {growth.rewards.map((reward) => (
              <li key={reward.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <span>{reward.title}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span
                      className={`text-xs font-medium ${
                        reward.unlocked ? 'text-blue-600' : 'text-slate-500'
                      }`}
                    >
                      {reward.unlocked ? '已解锁' : reward.requirementLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{reward.description}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-slate-600 tabular-nums">
                  {reward.progressText}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  if (variant === 'dock') {
    return (
      <>
        <div className={`print:hidden flex flex-col items-end ${className}`}>
          <div className="relative w-full sm:w-auto">
            {showBubble && (
              <div className="mb-2.5 w-full rounded-xl border border-slate-200 bg-white p-3.5 shadow-md sm:ml-auto sm:w-80">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    团子 Dango · {animMeta.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBubbleOpen(false);
                      setAutoBubbleMsg(null);
                    }}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="关闭气泡"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{displayedBubbleText}</p>
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                  <button
                    type="button"
                    onClick={handleNextLine}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    换一句
                  </button>
                  {dangoSettings.growthEnabled && (
                    <button
                      type="button"
                      onClick={() => setGrowthModalOpen(true)}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
                    >
                      <Award className="h-3.5 w-3.5 text-blue-600" />
                      陪伴成长 ({growth.totalRecordedDays}天)
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={handleCatClick}
                  className="group relative flex shrink-0 items-center justify-center rounded-xl bg-slate-50/80 p-1 transition-transform duration-150 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  style={{ width: avatarSize, height: avatarSize }}
                  aria-label="点击与团子 Dango 互动"
                  title={`团子 Dango · ${animMeta.label}`}
                >
                  {renderAvatarMedia(avatarSize - 8)}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">团子 Dango</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-blue-600">{animMeta.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-600">
                    {statusNote || animMeta.description}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {dangoSettings.chatBubbleEnabled && (
                  <button
                    type="button"
                    onClick={handleCatClick}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {showBubble ? '收起' : '聊一句'}
                  </button>
                )}
                {dangoSettings.growthEnabled && (
                  <button
                    type="button"
                    onClick={() => setGrowthModalOpen(true)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                  >
                    成长
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {growthModal}
      </>
    );
  }

  if (variant === 'sidebar') {
    return (
      <>
        <section
          className={`rounded-xl border border-slate-200 bg-white p-4 print:hidden ${className}`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCatClick}
              className="flex shrink-0 items-center justify-center rounded-xl bg-slate-50 p-1 transition-transform duration-150 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{ width: avatarSize, height: avatarSize }}
              aria-label="点击与团子 Dango 互动"
            >
              {renderAvatarMedia(avatarSize - 8)}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">团子 Dango</span>
                <span aria-hidden="true">·</span>
                <span className="text-blue-600">{animMeta.label}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {statusNote || animMeta.description}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                {dangoSettings.chatBubbleEnabled && (
                  <button
                    type="button"
                    onClick={handleCatClick}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {showBubble ? '收起对话' : '点击交流'}
                  </button>
                )}
                {dangoSettings.growthEnabled && (
                  <button
                    type="button"
                    onClick={() => setGrowthModalOpen(true)}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    陪伴成长 ({growth.totalRecordedDays}天)
                  </button>
                )}
              </div>
            </div>
          </div>

          {showBubble && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-relaxed text-slate-700">{displayedBubbleText}</p>
                <button
                  type="button"
                  onClick={() => {
                    setBubbleOpen(false);
                    setAutoBubbleMsg(null);
                  }}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="关闭气泡"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleNextLine}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                换一句
              </button>
            </div>
          )}
        </section>
        {growthModal}
      </>
    );
  }

  // variant === 'inline' (DailyLogPage header strip)
  return (
    <>
      <section
        className={`rounded-xl border border-slate-200 bg-white px-4 py-3 print:hidden ${className}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCatClick}
              className="flex shrink-0 items-center justify-center rounded-xl bg-slate-50 p-1 transition-transform duration-150 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{ width: avatarSize, height: avatarSize }}
              aria-label="点击与团子 Dango 互动"
            >
              {renderAvatarMedia(avatarSize - 6)}
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="text-sm font-semibold text-slate-900">团子 Dango</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-blue-600">{animMeta.label}</span>
                {statusNote && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate text-slate-500">{statusNote}</span>
                  </>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {showBubble ? displayedBubbleText : animMeta.description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 text-xs">
            {dangoSettings.chatBubbleEnabled && (
              <button
                type="button"
                onClick={showBubble ? handleNextLine : handleCatClick}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                {showBubble ? '换一句' : '和团子说话'}
              </button>
            )}
            {showBubble && (
              <button
                type="button"
                onClick={() => {
                  setBubbleOpen(false);
                  setAutoBubbleMsg(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="收起气泡"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {dangoSettings.growthEnabled && (
              <button
                type="button"
                onClick={() => setGrowthModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-blue-600 hover:bg-blue-50 whitespace-nowrap"
              >
                <Award className="h-3.5 w-3.5" />
                成长 {growth.totalRecordedDays}天
              </button>
            )}
          </div>
        </div>
      </section>
      {growthModal}
    </>
  );
};
