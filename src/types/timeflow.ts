export type ActivityCategory =
  | 'work'
  | 'learning'
  | 'reading'
  | 'exercise'
  | 'life'
  | 'rest'
  | 'entertainment'
  | 'commute'
  | 'other';

export type TaskPriority = 'high' | 'medium' | 'low';

export type EntryStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export type EnergyLevel = 'high' | 'medium' | 'low';

export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD (local date when activity starts)
  startTime: string; // HH:mm
  endTime: string; // HH:mm (if <= startTime, treated as cross-day ending on next day)
  crossDay?: boolean;
  title: string; // 业务内容（概略）
  category: ActivityCategory;
  colorTag?: string; // optional override hex
  thought: string; // 思考栏
  resultNote: string; // 结果备注
  priority: TaskPriority;
  status: EntryStatus;
  energy: EnergyLevel;
  isUnplanned: boolean;
  isBreakPreset?: boolean;
  plannedMinutes?: number; // planned duration in minutes (defaults to duration if status !== 'cancelled')
  createdAt: number;
  updatedAt: number;
}

export interface DailyTask {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  isTopThree: boolean;
  completed: boolean;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
}

export interface DiarySnapshotContent {
  work: {
    completed: string;
    outcomes: string;
    unfinished: string;
  };
  learning: {
    learned: string;
    insights: string;
    knowledgeToSave: string;
  };
  thinking: {
    problems: string;
    causes: string;
    solutions: string;
  };
  review: {
    wentWell: string;
    toImprove: string;
    timeReasonable: string;
    timeWasters: string;
  };
  tomorrowPlan: {
    topThree: string[];
    ongoingTasks: string;
    oneIssueToFix: string;
  };
}

export interface DiaryVersion {
  id: string;
  timestamp: number;
  label: string;
  content: DiarySnapshotContent;
}

export interface DailyDiary extends DiarySnapshotContent {
  date: string; // YYYY-MM-DD
  aiGenerated: boolean;
  versions: DiaryVersion[];
  updatedAt: number;
}

export type ReviewPeriodType = 'week' | 'month' | 'quarter' | 'year';

export interface PeriodReview {
  id: string; // `${periodType}:${periodKey}`
  periodType: ReviewPeriodType;
  periodKey: string;
  startDate: string;
  endDate: string;
  notes: {
    importantAchievements: string;
    unfinishedMatters: string;
    mainProblems: string;
    nextDirection: string;
    learningGrowth: string;
    longTermAlignment: string;
    keyEventsAndLessons: string;
  };
  updatedAt: number;
}

export interface AIGrowthReport {
  id: string;
  createdAt: number;
  rangeLabel: string;
  startDate: string;
  endDate: string;
  recordCount: number;
  dataSufficiencyNote: string;
  dataFacts: string[];
  issuesFound: string[];
  rootCauses: string[];
  strengthsAndHighlights: string[];
  actionableSuggestions: Array<{
    title: string;
    action: string;
    expectedImpact: string;
  }>;
  nextPhaseGoals: Array<{
    goal: string;
    metric: string;
    timeframe: string;
  }>;
}

export interface BreakRange {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}

export type DangoState =
  | 'idle'
  | 'work'
  | 'learn'
  | 'rest'
  | 'celebrate'
  | 'goal_celebrate'
  | 'companion_plus';

export type DangoFrequency = 'low' | 'normal';

export interface DangoSettings {
  enabled: boolean;
  animationsEnabled: boolean;
  taskCelebrationEnabled: boolean;
  chatBubbleEnabled: boolean;
  growthEnabled: boolean;
  animationFrequency: DangoFrequency;
}

export const DEFAULT_DANGO_SETTINGS: DangoSettings = {
  enabled: true,
  animationsEnabled: true,
  taskCelebrationEnabled: true,
  chatBubbleEnabled: true,
  growthEnabled: true,
  animationFrequency: 'low',
};

export interface UserSettings {
  key: 'user_settings';
  dayStartHour: number;
  dayEndHour: number;
  slotMinutes: number;
  breakRanges: BreakRange[];
  aiDataConsent: boolean;
  longTermGoals: string[];
  dango?: DangoSettings;
  updatedAt: number;
}

export interface OfflineMutation {
  id: string;
  entityType: 'entry' | 'task' | 'diary' | 'review' | 'settings' | 'aiReport';
  action: 'upsert' | 'delete';
  entityId: string;
  timestamp: number;
  synced: boolean;
}

export type NavPageId =
  | 'dashboard'
  | 'daily-log'
  | 'diary'
  | 'analytics'
  | 'review-week'
  | 'review-month'
  | 'review-quarter'
  | 'review-year'
  | 'ai-analysis'
  | 'data-center'
  | 'settings';

export interface CategoryMeta {
  id: ActivityCategory;
  label: string;
  color: string;
  softBg: string;
  textColor: string;
  isEffective: boolean;
  isRest: boolean;
}

export const CATEGORY_LIST: CategoryMeta[] = [
  {
    id: 'work',
    label: '工作',
    color: '#2563EB',
    softBg: '#EFF6FF',
    textColor: '#1D4ED8',
    isEffective: true,
    isRest: false,
  },
  {
    id: 'learning',
    label: '学习',
    color: '#0D9488',
    softBg: '#F0FDFA',
    textColor: '#0F766E',
    isEffective: true,
    isRest: false,
  },
  {
    id: 'reading',
    label: '阅读',
    color: '#4F46E5',
    softBg: '#EEF2FF',
    textColor: '#4338CA',
    isEffective: true,
    isRest: false,
  },
  {
    id: 'exercise',
    label: '运动',
    color: '#16A34A',
    softBg: '#F0FDF4',
    textColor: '#15803D',
    isEffective: true,
    isRest: false,
  },
  {
    id: 'life',
    label: '生活',
    color: '#D97706',
    softBg: '#FFFBEB',
    textColor: '#B45309',
    isEffective: false,
    isRest: false,
  },
  {
    id: 'rest',
    label: '休息',
    color: '#64748B',
    softBg: '#F1F5F9',
    textColor: '#475569',
    isEffective: false,
    isRest: true,
  },
  {
    id: 'entertainment',
    label: '娱乐',
    color: '#9333EA',
    softBg: '#FAF5FF',
    textColor: '#7E22CE',
    isEffective: false,
    isRest: false,
  },
  {
    id: 'commute',
    label: '通勤',
    color: '#475569',
    softBg: '#F8FAFC',
    textColor: '#334155',
    isEffective: false,
    isRest: false,
  },
  {
    id: 'other',
    label: '其他',
    color: '#94A3B8',
    softBg: '#F8FAFC',
    textColor: '#64748B',
    isEffective: false,
    isRest: false,
  },
];

export const CATEGORY_MAP: Record<ActivityCategory, CategoryMeta> = CATEGORY_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ActivityCategory, CategoryMeta>,
);

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
};

export const STATUS_LABELS: Record<EntryStatus, string> = {
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

export const ENERGY_LABELS: Record<EnergyLevel, string> = {
  high: '高精力',
  medium: '中精力',
  low: '低精力',
};

export const DEFAULT_SETTINGS: UserSettings = {
  key: 'user_settings',
  dayStartHour: 8,
  dayEndHour: 22,
  slotMinutes: 30,
  breakRanges: [
    { id: 'lunch', label: '午休时间', startTime: '12:00', endTime: '13:30' },
    { id: 'dinner', label: '晚餐时间', startTime: '18:00', endTime: '19:00' },
  ],
  aiDataConsent: false,
  longTermGoals: [
    '每天保持深度工作与系统性学习输出',
    '每周保持 3 次以上规律运动与充足休息',
  ],
  dango: DEFAULT_DANGO_SETTINGS,
  updatedAt: Date.now(),
};
