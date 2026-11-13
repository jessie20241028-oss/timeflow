import { DangoState, TimeEntry } from '../types/timeflow';
import { timeToMinutes } from '../utils/stats';

export interface DangoAnimationMeta {
  gif: string;
  fallbackImg: string;
  label: string;
  description: string;
}

export const DANGO_ANIMATIONS: Record<DangoState, DangoAnimationMeta> = {
  idle: {
    gif: '/dango/dango-idle.gif',
    fallbackImg: '/dango/dango-idle.png',
    label: '日常陪伴',
    description: '安静趴着陪伴你，偶尔眨眨眼、轻轻摇尾巴',
  },
  work: {
    gif: '/dango/dango-work.gif',
    fallbackImg: '/dango/dango-work.png',
    label: '专注工作中',
    description: '认真看着小电脑，陪你稳步推进任务',
  },
  learn: {
    gif: '/dango/dango-learn.gif',
    fallbackImg: '/dango/dango-learn.png',
    label: '学习思考中',
    description: '翻开小书本，和你一起记录与沉淀认知',
  },
  rest: {
    gif: '/dango/dango-rest.gif',
    fallbackImg: '/dango/dango-rest.png',
    label: '休息恢复中',
    description: '闭眼打盹充电，把节奏放慢一点也没关系',
  },
  celebrate: {
    gif: '/dango/dango-celebrate.gif',
    fallbackImg: '/dango/dango-celebrate.png',
    label: '任务完成！',
    description: '开心跳跃挥爪，为你点亮这一步的完成感',
  },
  goal_celebrate: {
    gif: '/dango/dango-goal-celebrate.gif',
    fallbackImg: '/dango/dango-goal-celebrate.png',
    label: '每日目标达成',
    description: '开心转圈撒花，庆祝今天的核心重点全部达成',
  },
  companion_plus: {
    gif: '/dango/dango-companion-plus.gif',
    fallbackImg: '/dango/dango-companion-plus.png',
    label: '进阶陪伴形态',
    description: '持续记录解锁的星标眨耳形态，继续温柔同行',
  },
};

export type DangoChatContextKey = 'morning' | 'work' | 'learn' | 'rest' | 'celebrate';

export const DANGO_CHAT_MESSAGES: Record<DangoChatContextKey, string[]> = {
  morning: [
    '早安，先写下今天最重要的三件小事，我们慢慢来。',
    '新的一天开始啦，把节奏留给自己，一步步记录就好。',
    '团子已就位，今天也陪你一起把时间花在真正重要的事上。',
  ],
  work: [
    '专注当下的这一段就好，其他杂念先交给团子帮你看门。',
    '按自己的节奏推进中，每完成一小块都很值得肯定。',
    '需要切换状态时记得顺手记上一笔，思路会更清晰。',
  ],
  learn: [
    '认真积累的每一页，都会在未来的某一天发亮。',
    '把今天的一点新认知记下来，就是很棒的成长沉淀。',
    '慢一点理解没关系，深度思考本来就需要一点安静的时间。',
  ],
  rest: [
    '好好休息也是时间管理的一部分，团子陪你一起充充电。',
    '工作和学习之外，记得给眼睛和大脑留一段安静空白。',
    '呼——闭眼放空一小会儿，恢复好精力再继续出发吧。',
  ],
  celebrate: [
    '太棒了！这一步已经稳稳拿下，给你比个小猫爪赞。',
    '又完成了一件事，记得在心里给自己一点小鼓励。',
    '看到你的进展啦，团子在角落为你开心跳跃中！',
  ],
};

const UNLOCKED_WARM_LINES: string[] = [
  '我们已经是并肩记录好几天的小搭档了，谢谢你一直照顾自己的时间。',
  '连续积累下来的每一小时，都在悄悄让生活变得更有秩序。',
];

export function pickRandomDangoMessage(
  contextKey: DangoChatContextKey,
  options?: { exclude?: string; unlockedWarm?: boolean },
): string {
  const basePool = DANGO_CHAT_MESSAGES[contextKey] ?? DANGO_CHAT_MESSAGES.morning;
  const pool =
    options?.unlockedWarm && (contextKey === 'morning' || contextKey === 'celebrate')
      ? [...basePool, ...UNLOCKED_WARM_LINES]
      : basePool;
  const candidates =
    options?.exclude && pool.length > 1
      ? pool.filter((msg) => msg !== options.exclude)
      : pool;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] ?? basePool[0];
}

export function getTimeOfDayContext(): DangoChatContextKey {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'rest';
  return 'work';
}

export function resolveDailyDangoState(
  entries: TimeEntry[],
  date: string,
): { state: DangoState; context: DangoChatContextKey; reason: string } {
  const activeEntries = entries
    .filter((e) => e.date === date && e.status !== 'cancelled')
    .sort((a, b) => {
      const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      return diff !== 0 ? diff : a.updatedAt - b.updatedAt;
    });

  if (activeEntries.length === 0) {
    return {
      state: 'idle',
      context: getTimeOfDayContext(),
      reason: '当日暂无记录，团子安静趴着等待陪伴',
    };
  }

  // Prefer currently in-progress entry; otherwise use the latest recorded entry on that day
  const inProgress = [...activeEntries]
    .reverse()
    .find((e) => e.status === 'in_progress');
  const focusEntry = inProgress ?? activeEntries[activeEntries.length - 1];

  if (focusEntry.category === 'work') {
    return {
      state: 'work',
      context: 'work',
      reason: `当前关联记录「${focusEntry.title}」（工作）`,
    };
  }
  if (focusEntry.category === 'learning' || focusEntry.category === 'reading') {
    return {
      state: 'learn',
      context: 'learn',
      reason: `当前关联记录「${focusEntry.title}」（学习/阅读）`,
    };
  }
  if (focusEntry.category === 'rest') {
    return {
      state: 'rest',
      context: 'rest',
      reason: `当前关联记录「${focusEntry.title}」（休息恢复）`,
    };
  }

  return {
    state: 'idle',
    context: getTimeOfDayContext(),
    reason: `当前关联记录「${focusEntry.title}」`,
  };
}
