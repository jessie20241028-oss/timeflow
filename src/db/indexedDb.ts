import {
  AIGrowthReport,
  DailyDiary,
  DailyTask,
  DEFAULT_DANGO_SETTINGS,
  DEFAULT_SETTINGS,
  OfflineMutation,
  PeriodReview,
  TimeEntry,
  UserSettings,
} from '../types/timeflow';
import { addDays, formatLocalDate } from '../utils/stats';

const DB_NAME = 'timeflow_db';
const DB_VERSION = 1;

export const STORES = {
  entries: 'entries',
  tasks: 'tasks',
  diaries: 'diaries',
  reviews: 'reviews',
  aiReports: 'aiReports',
  settings: 'settings',
  offlineQueue: 'offlineQueue',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openTimeFlowDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.entries)) {
        const store = db.createObjectStore(STORES.entries, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.tasks)) {
        const store = db.createObjectStore(STORES.tasks, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.diaries)) {
        db.createObjectStore(STORES.diaries, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORES.reviews)) {
        const store = db.createObjectStore(STORES.reviews, { keyPath: 'id' });
        store.createIndex('periodType', 'periodType', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.aiReports)) {
        const store = db.createObjectStore(STORES.aiReports, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.offlineQueue)) {
        db.createObjectStore(STORES.offlineQueue, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openTimeFlowDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, item: T): Promise<void> {
  const db = await openTimeFlowDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await openTimeFlowDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openTimeFlowDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function recordOfflineMutationIfNeeded(
  entityType: OfflineMutation['entityType'],
  action: OfflineMutation['action'],
  entityId: string,
) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const item: OfflineMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityType,
      action,
      entityId,
      timestamp: Date.now(),
      synced: false,
    };
    await putInStore(STORES.offlineQueue, item);
  }
}

export interface AllTimeFlowData {
  entries: TimeEntry[];
  tasks: DailyTask[];
  diaries: DailyDiary[];
  reviews: PeriodReview[];
  aiReports: AIGrowthReport[];
  settings: UserSettings;
  offlineQueue: OfflineMutation[];
}

export function normalizeSettings(raw?: Partial<UserSettings> | null): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    key: 'user_settings',
    breakRanges: Array.isArray(raw?.breakRanges) ? raw.breakRanges : DEFAULT_SETTINGS.breakRanges,
    longTermGoals: Array.isArray(raw?.longTermGoals)
      ? raw.longTermGoals
      : DEFAULT_SETTINGS.longTermGoals,
    dango: {
      ...DEFAULT_DANGO_SETTINGS,
      ...(raw?.dango ?? {}),
    },
  };
}

export async function loadAllData(): Promise<AllTimeFlowData> {
  const [entries, tasks, diaries, reviews, aiReports, settingsList, offlineQueue] =
    await Promise.all([
      getAllFromStore<TimeEntry>(STORES.entries),
      getAllFromStore<DailyTask>(STORES.tasks),
      getAllFromStore<DailyDiary>(STORES.diaries),
      getAllFromStore<PeriodReview>(STORES.reviews),
      getAllFromStore<AIGrowthReport>(STORES.aiReports),
      getAllFromStore<UserSettings>(STORES.settings),
      getAllFromStore<OfflineMutation>(STORES.offlineQueue),
    ]);

  const settings = normalizeSettings(settingsList[0]);
  return {
    entries,
    tasks,
    diaries,
    reviews,
    aiReports: aiReports.sort((a, b) => b.createdAt - a.createdAt),
    settings,
    offlineQueue,
  };
}

export async function saveEntry(entry: TimeEntry): Promise<void> {
  await putInStore(STORES.entries, entry);
  await recordOfflineMutationIfNeeded('entry', 'upsert', entry.id);
}

export async function saveEntriesBatch(entries: TimeEntry[]): Promise<void> {
  const db = await openTimeFlowDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.entries, 'readwrite');
    const store = tx.objectStore(STORES.entries);
    for (const e of entries) store.put(e);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeEntry(id: string): Promise<void> {
  await deleteFromStore(STORES.entries, id);
  await recordOfflineMutationIfNeeded('entry', 'delete', id);
}

export async function saveTask(task: DailyTask): Promise<void> {
  await putInStore(STORES.tasks, task);
  await recordOfflineMutationIfNeeded('task', 'upsert', task.id);
}

export async function removeTask(id: string): Promise<void> {
  await deleteFromStore(STORES.tasks, id);
  await recordOfflineMutationIfNeeded('task', 'delete', id);
}

export async function saveDiary(diary: DailyDiary): Promise<void> {
  await putInStore(STORES.diaries, diary);
  await recordOfflineMutationIfNeeded('diary', 'upsert', diary.date);
}

export async function removeDiary(date: string): Promise<void> {
  await deleteFromStore(STORES.diaries, date);
  await recordOfflineMutationIfNeeded('diary', 'delete', date);
}

export async function saveReview(review: PeriodReview): Promise<void> {
  await putInStore(STORES.reviews, review);
  await recordOfflineMutationIfNeeded('review', 'upsert', review.id);
}

export async function saveAIReport(report: AIGrowthReport): Promise<void> {
  await putInStore(STORES.aiReports, report);
}

export async function removeAIReport(id: string): Promise<void> {
  await deleteFromStore(STORES.aiReports, id);
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await putInStore(STORES.settings, settings);
}

export async function flushOfflineQueue(): Promise<number> {
  const queue = await getAllFromStore<OfflineMutation>(STORES.offlineQueue);
  if (queue.length === 0) return 0;
  await clearStore(STORES.offlineQueue);
  return queue.length;
}

export async function clearAllDatabase(): Promise<void> {
  await Promise.all([
    clearStore(STORES.entries),
    clearStore(STORES.tasks),
    clearStore(STORES.diaries),
    clearStore(STORES.reviews),
    clearStore(STORES.aiReports),
    clearStore(STORES.offlineQueue),
  ]);
}

export interface TimeFlowBackupPayload {
  app: 'TimeFlow';
  version: number;
  exportedAt: number;
  data: {
    entries: TimeEntry[];
    tasks: DailyTask[];
    diaries: DailyDiary[];
    reviews: PeriodReview[];
    aiReports: AIGrowthReport[];
    settings?: UserSettings;
  };
}

export async function restoreFromBackup(
  payload: TimeFlowBackupPayload,
  mode: 'merge' | 'replace',
): Promise<{ entriesCount: number; diariesCount: number; reviewsCount: number }> {
  if (mode === 'replace') {
    await clearAllDatabase();
  }

  const db = await openTimeFlowDB();
  const tx = db.transaction(
    [STORES.entries, STORES.tasks, STORES.diaries, STORES.reviews, STORES.aiReports, STORES.settings],
    'readwrite',
  );

  const safeEntries = Array.isArray(payload.data.entries) ? payload.data.entries : [];
  const safeTasks = Array.isArray(payload.data.tasks) ? payload.data.tasks : [];
  const safeDiaries = Array.isArray(payload.data.diaries) ? payload.data.diaries : [];
  const safeReviews = Array.isArray(payload.data.reviews) ? payload.data.reviews : [];
  const safeAIReports = Array.isArray(payload.data.aiReports) ? payload.data.aiReports : [];

  for (const e of safeEntries) tx.objectStore(STORES.entries).put(e);
  for (const t of safeTasks) tx.objectStore(STORES.tasks).put(t);
  for (const d of safeDiaries) tx.objectStore(STORES.diaries).put(d);
  for (const r of safeReviews) tx.objectStore(STORES.reviews).put(r);
  for (const a of safeAIReports) tx.objectStore(STORES.aiReports).put(a);
  if (payload.data.settings) {
    tx.objectStore(STORES.settings).put(normalizeSettings(payload.data.settings));
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return {
    entriesCount: safeEntries.length,
    diariesCount: safeDiaries.length,
    reviewsCount: safeReviews.length,
  };
}

/**
 * Generates an explicit, realistic 7-day sample dataset ONLY when the user clicks "加载示例数据"
 * so they can test multi-day analytics, diaries, and AI reports immediately.
 */
export async function loadSampleDataset(): Promise<void> {
  const today = formatLocalDate(new Date());
  const now = Date.now();
  const sampleEntries: TimeEntry[] = [];
  const sampleTasks: DailyTask[] = [];
  const sampleDiaries: DailyDiary[] = [];

  const templates = [
    {
      startTime: '08:30',
      endTime: '10:30',
      title: '核心产品需求文档撰写与架构评审',
      category: 'work' as const,
      thought: '把需求拆分到最小可验证模块后，评审沟通效率提升明显',
      resultNote: '输出 2.4k 字规格说明书并通过团队评审',
      priority: 'high' as const,
      status: 'completed' as const,
      energy: 'high' as const,
      isUnplanned: false,
    },
    {
      startTime: '10:30',
      endTime: '12:00',
      title: '系统性能调优与代码重构',
      category: 'work' as const,
      thought: '发现重复查询问题，合并后响应更快',
      resultNote: '接口平均耗时从 320ms 降至 110ms',
      priority: 'high' as const,
      status: 'completed' as const,
      energy: 'high' as const,
      isUnplanned: false,
    },
    {
      startTime: '12:00',
      endTime: '13:30',
      title: '午餐与午休恢复',
      category: 'rest' as const,
      thought: '保持 25 分钟闭目休息，下午精力更稳',
      resultNote: '精力恢复良好',
      priority: 'medium' as const,
      status: 'completed' as const,
      energy: 'medium' as const,
      isUnplanned: false,
      isBreakPreset: true,
    },
    {
      startTime: '14:00',
      endTime: '15:30',
      title: '跨部门临时同步与问题排查',
      category: 'work' as const,
      thought: '临时插入会议打断了深度编码节奏，下次需提前约定议程',
      resultNote: '定位并解决线上数据同步边界问题',
      priority: 'medium' as const,
      status: 'completed' as const,
      energy: 'medium' as const,
      isUnplanned: true,
    },
    {
      startTime: '16:00',
      endTime: '17:30',
      title: 'AI 应用架构专题课程学习',
      category: 'learning' as const,
      thought: '结构化输出 Schema 能大幅提高解析稳定性',
      resultNote: '完成 2 节课程笔记与示例代码验证',
      priority: 'high' as const,
      status: 'completed' as const,
      energy: 'medium' as const,
      isUnplanned: false,
    },
    {
      startTime: '19:30',
      endTime: '20:30',
      title: '慢跑 5 公里与拉伸',
      category: 'exercise' as const,
      thought: '有氧运动有效缓解久坐疲劳',
      resultNote: '配速 5\'45"，心率稳定在有氧区间',
      priority: 'medium' as const,
      status: 'completed' as const,
      energy: 'medium' as const,
      isUnplanned: false,
    },
    {
      startTime: '21:00',
      endTime: '22:00',
      title: '阅读《深度工作》并整理卡片笔记',
      category: 'reading' as const,
      thought: '为高频事务设定批处理窗口可以保护上午黄金两小时',
      resultNote: '整理 4 张永久笔记卡片',
      priority: 'low' as const,
      status: 'completed' as const,
      energy: 'low' as const,
      isUnplanned: false,
    },
  ];

  for (let offset = 6; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    templates.forEach((tpl, idx) => {
      // On today, leave the evening reading item as 'planned' so planned vs actual is clearly visible
      const status = offset === 0 && idx >= 5 ? 'planned' : tpl.status;
      sampleEntries.push({
        ...tpl,
        id: `sample-${date}-${idx}`,
        date,
        status,
        createdAt: now - offset * 86400000 + idx,
        updatedAt: now - offset * 86400000 + idx,
      });
    });

    sampleTasks.push(
      {
        id: `sample-task-${date}-1`,
        date,
        title: '完成核心文档与架构定稿',
        isTopThree: true,
        completed: offset > 0 || true,
        priority: 'high',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `sample-task-${date}-2`,
        date,
        title: '完成每日 90 分钟专题学习',
        isTopThree: true,
        completed: offset > 0,
        priority: 'high',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `sample-task-${date}-3`,
        date,
        title: '晚间跑步 5km 或核心训练',
        isTopThree: true,
        completed: offset > 0,
        priority: 'medium',
        createdAt: now,
        updatedAt: now,
      },
    );

    if (offset > 0) {
      sampleDiaries.push({
        date,
        work: {
          completed: '完成核心规格文档撰写及系统性能调优。',
          outcomes: '接口平均耗时下降，方案通过团队确认。',
          unfinished: '部分边界测试待明日继续补充。',
        },
        learning: {
          learned: 'AI 结构化输出与深度工作时间块策略。',
          insights: '上午高精力时段应彻底隔离杂务消息。',
          knowledgeToSave: '建立“批处理沟通窗口”习惯。',
        },
        thinking: {
          problems: '下午临时同步会打断了连续思考。',
          causes: '未在日历中锁定下午专注块，且缺少会议前置议程。',
          solutions: '将常规沟通收敛至 14:00-15:00 固定窗口。',
        },
        review: {
          wentWell: '上午 2 小时连续深度工作质量极高，且坚持了晚间运动。',
          toImprove: '减少非计划内的即时消息响应频率。',
          timeReasonable: '工作与学习比例协调，保留了必要的午休恢复时间。',
          timeWasters: '碎片化临时答疑耗时约 30 分钟。',
        },
        tomorrowPlan: {
          topThree: ['推进核心模块联调', '整理专题学习复盘', '保持晚间拉伸'],
          ongoingTasks: '持续跟进性能指标监控。',
          oneIssueToFix: '严格控制计划外打断时间。',
        },
        aiGenerated: false,
        versions: [],
        updatedAt: now - offset * 86400000,
      });
    }
  }

  const db = await openTimeFlowDB();
  const tx = db.transaction([STORES.entries, STORES.tasks, STORES.diaries], 'readwrite');
  for (const e of sampleEntries) tx.objectStore(STORES.entries).put(e);
  for (const t of sampleTasks) tx.objectStore(STORES.tasks).put(t);
  for (const d of sampleDiaries) tx.objectStore(STORES.diaries).put(d);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
