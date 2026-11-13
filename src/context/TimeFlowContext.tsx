import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AIGrowthReport,
  DailyDiary,
  DailyTask,
  DEFAULT_SETTINGS,
  PeriodReview,
  TimeEntry,
  UserSettings,
} from '../types/timeflow';
import {
  clearAllDatabase,
  flushOfflineQueue,
  loadAllData,
  loadSampleDataset,
  removeAIReport,
  removeDiary,
  removeEntry,
  removeTask,
  restoreFromBackup,
  saveAIReport,
  saveDiary,
  saveEntriesBatch,
  saveEntry,
  saveReview,
  saveSettings,
  saveTask,
  TimeFlowBackupPayload,
} from '../db/indexedDb';
import { useOnlineStatus } from '../hooks/usePWA';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface TimeFlowContextValue {
  loading: boolean;
  entries: TimeEntry[];
  tasks: DailyTask[];
  diaries: DailyDiary[];
  reviews: PeriodReview[];
  aiReports: AIGrowthReport[];
  settings: UserSettings;
  offlinePendingCount: number;
  isOnline: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  saveMessage: string;
  upsertEntry: (entry: TimeEntry) => Promise<void>;
  patchEntry: (id: string, patch: Partial<TimeEntry>) => Promise<void>;
  upsertEntriesBatch: (items: TimeEntry[]) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  upsertTask: (task: DailyTask) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  upsertDiary: (diary: DailyDiary) => Promise<void>;
  deleteDiary: (date: string) => Promise<void>;
  upsertReview: (review: PeriodReview) => Promise<void>;
  upsertAIReport: (report: AIGrowthReport) => Promise<void>;
  deleteAIReport: (id: string) => Promise<void>;
  updateSettings: (settings: UserSettings) => Promise<void>;
  importBackup: (
    payload: TimeFlowBackupPayload,
    mode: 'merge' | 'replace',
  ) => Promise<{ entriesCount: number; diariesCount: number; reviewsCount: number }>;
  seedSampleData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  reloadData: () => Promise<void>;
}

const TimeFlowContext = createContext<TimeFlowContextValue | null>(null);

export const TimeFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const entriesRef = useRef<TimeEntry[]>([]);
  entriesRef.current = entries;
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [diaries, setDiaries] = useState<DailyDiary[]>([]);
  const [reviews, setReviews] = useState<PeriodReview[]>([]);
  const [aiReports, setAIReports] = useState<AIGrowthReport[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  const reloadData = useCallback(async () => {
    try {
      const data = await loadAllData();
      setEntries(data.entries);
      setTasks(data.tasks);
      setDiaries(data.diaries);
      setReviews(data.reviews);
      setAIReports(data.aiReports);
      setSettings(data.settings);
      setOfflinePendingCount(data.offlineQueue.length);
    } catch (err) {
      console.error('Failed to load TimeFlow IndexedDB:', err);
      setSaveStatus('error');
      setSaveMessage('本地数据库读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Flush offline mutation queue when connectivity is restored
  useEffect(() => {
    if (isOnline && offlinePendingCount > 0) {
      flushOfflineQueue().then((flushed) => {
        if (flushed > 0) {
          setOfflinePendingCount(0);
          setSaveStatus('saved');
          setLastSavedAt(Date.now());
          setSaveMessage(`网络已恢复，已同步 ${flushed} 条离线更改`);
        }
      });
    }
  }, [isOnline, offlinePendingCount]);

  const markSaving = () => {
    setSaveStatus('saving');
    setSaveMessage('正在保存...');
  };

  const markSaved = (customMsg?: string) => {
    const now = Date.now();
    setSaveStatus('saved');
    setLastSavedAt(now);
    setSaveMessage(customMsg ?? (isOnline ? '已自动保存' : '已离线保存至本地'));
    if (!isOnline) {
      setOfflinePendingCount((c) => c + 1);
    }
  };

  const markError = (err: unknown) => {
    console.error(err);
    setSaveStatus('error');
    setSaveMessage('保存失败，请检查浏览器存储权限');
  };

  const upsertEntry = useCallback(
    async (entry: TimeEntry) => {
      markSaving();
      try {
        const nextList = entriesRef.current.some((e) => e.id === entry.id)
          ? entriesRef.current.map((e) => (e.id === entry.id ? entry : e))
          : [...entriesRef.current, entry];
        entriesRef.current = nextList;
        setEntries(nextList);
        await saveEntry(entry);
        markSaved();
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const patchEntry = useCallback(
    async (id: string, patch: Partial<TimeEntry>) => {
      const current = entriesRef.current.find((e) => e.id === id);
      if (!current) return;
      const merged: TimeEntry = { ...current, ...patch, updatedAt: Date.now() };
      await upsertEntry(merged);
    },
    [upsertEntry],
  );

  const upsertEntriesBatch = useCallback(
    async (items: TimeEntry[]) => {
      markSaving();
      try {
        await saveEntriesBatch(items);
        setEntries((prev) => {
          const map = new Map(prev.map((e) => [e.id, e]));
          for (const item of items) map.set(item.id, item);
          return Array.from(map.values());
        });
        markSaved(`已保存 ${items.length} 条记录`);
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      markSaving();
      try {
        await removeEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        markSaved('已删除记录');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const upsertTask = useCallback(
    async (task: DailyTask) => {
      markSaving();
      try {
        await saveTask(task);
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === task.id);
          return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task];
        });
        markSaved();
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      markSaving();
      try {
        await removeTask(id);
        setTasks((prev) => prev.filter((t) => t.id !== id));
        markSaved('已删除任务');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const upsertDiary = useCallback(
    async (diary: DailyDiary) => {
      markSaving();
      try {
        await saveDiary(diary);
        setDiaries((prev) => {
          const exists = prev.some((d) => d.date === diary.date);
          return exists ? prev.map((d) => (d.date === diary.date ? diary : d)) : [...prev, diary];
        });
        markSaved('日记已自动保存');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const deleteDiary = useCallback(
    async (date: string) => {
      markSaving();
      try {
        await removeDiary(date);
        setDiaries((prev) => prev.filter((d) => d.date !== date));
        markSaved('已删除日记');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const upsertReview = useCallback(
    async (review: PeriodReview) => {
      markSaving();
      try {
        await saveReview(review);
        setReviews((prev) => {
          const exists = prev.some((r) => r.id === review.id);
          return exists ? prev.map((r) => (r.id === review.id ? review : r)) : [...prev, review];
        });
        markSaved('复盘已保存');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const upsertAIReport = useCallback(
    async (report: AIGrowthReport) => {
      markSaving();
      try {
        await saveAIReport(report);
        setAIReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
        markSaved('AI 报告已保存');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const deleteAIReport = useCallback(
    async (id: string) => {
      markSaving();
      try {
        await removeAIReport(id);
        setAIReports((prev) => prev.filter((r) => r.id !== id));
        markSaved('已删除报告');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const updateSettings = useCallback(
    async (next: UserSettings) => {
      markSaving();
      try {
        await saveSettings(next);
        setSettings(next);
        markSaved('设置已保存');
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [isOnline],
  );

  const importBackup = useCallback(
    async (payload: TimeFlowBackupPayload, mode: 'merge' | 'replace') => {
      markSaving();
      try {
        const res = await restoreFromBackup(payload, mode);
        await reloadData();
        markSaved('数据恢复完成');
        return res;
      } catch (err) {
        markError(err);
        throw err;
      }
    },
    [reloadData],
  );

  const seedSampleData = useCallback(async () => {
    markSaving();
    try {
      await loadSampleDataset();
      await reloadData();
      markSaved('已加载近 7 天演示数据');
    } catch (err) {
      markError(err);
      throw err;
    }
  }, [reloadData]);

  const clearAllData = useCallback(async () => {
    markSaving();
    try {
      await clearAllDatabase();
      await reloadData();
      markSaved('已清空全部历史数据');
    } catch (err) {
      markError(err);
      throw err;
    }
  }, [reloadData]);

  return (
    <TimeFlowContext.Provider
      value={{
        loading,
        entries,
        tasks,
        diaries,
        reviews,
        aiReports,
        settings,
        offlinePendingCount,
        isOnline,
        saveStatus,
        lastSavedAt,
        saveMessage,
        upsertEntry,
        patchEntry,
        upsertEntriesBatch,
        deleteEntry,
        upsertTask,
        deleteTask,
        upsertDiary,
        deleteDiary,
        upsertReview,
        upsertAIReport,
        deleteAIReport,
        updateSettings,
        importBackup,
        seedSampleData,
        clearAllData,
        reloadData,
      }}
    >
      {children}
    </TimeFlowContext.Provider>
  );
};

export function useTimeFlow(): TimeFlowContextValue {
  const ctx = useContext(TimeFlowContext);
  if (!ctx) {
    throw new Error('useTimeFlow must be used inside TimeFlowProvider');
  }
  return ctx;
}
