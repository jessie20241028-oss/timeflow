import * as XLSX from 'xlsx';
import {
  AUTHOR_ATTRIBUTION_TEXT,
  COPYRIGHT_TEXT,
} from '../constants/branding';
import {
  CATEGORY_MAP,
  DailyDiary,
  ENERGY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TimeEntry,
} from '../types/timeflow';
import { AllTimeFlowData, TimeFlowBackupPayload } from '../db/indexedDb';
import { formatDurationHuman, getEntryDurationMinutes } from './stats';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildEntriesCSVContent(entries: TimeEntry[]): string {
  const headers = [
    '日期',
    '开始时间',
    '结束时间',
    '跨天',
    '时长(分钟)',
    '时长(可读)',
    '活动分类',
    '业务内容',
    '思考栏',
    '结果备注',
    '优先级',
    '完成状态',
    '精力状态',
    '计划外事项',
  ];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '').replace(/\r?\n/g, ' ');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );

  const rows = sorted.map((e) => {
    const mins = getEntryDurationMinutes(e);
    return [
      e.date,
      e.startTime,
      e.endTime,
      e.crossDay ? '是' : '否',
      mins,
      formatDurationHuman(mins),
      CATEGORY_MAP[e.category]?.label ?? e.category,
      e.title,
      e.thought,
      e.resultNote,
      PRIORITY_LABELS[e.priority],
      STATUS_LABELS[e.status],
      ENERGY_LABELS[e.energy],
      e.isUnplanned ? '是' : '否',
    ]
      .map(escapeCsv)
      .join(',');
  });

  // UTF-8 BOM ensures Excel on Mac/Windows displays Chinese cleanly
  return (
    '\uFEFF' +
    [
      headers.join(','),
      ...rows,
      '',
      escapeCsv(`${AUTHOR_ATTRIBUTION_TEXT} | ${COPYRIGHT_TEXT}`),
    ].join('\n')
  );
}

export function exportEntriesToCSV(entries: TimeEntry[], filenamePrefix = 'TimeFlow_时间记录') {
  const csvContent = buildEntriesCSVContent(entries);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function buildAllExcelWorkbook(data: AllTimeFlowData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const sortedEntries = [...data.entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );

  const entryRows = sortedEntries.map((e) => {
    const mins = getEntryDurationMinutes(e);
    return {
      日期: e.date,
      开始时间: e.startTime,
      结束时间: e.endTime,
      跨天: e.crossDay ? '是' : '否',
      '时长(分钟)': mins,
      活动分类: CATEGORY_MAP[e.category]?.label ?? e.category,
      业务内容: e.title,
      思考栏: e.thought,
      结果备注: e.resultNote,
      任务优先级: PRIORITY_LABELS[e.priority],
      完成状态: STATUS_LABELS[e.status],
      精力状态: ENERGY_LABELS[e.energy],
      计划外事项: e.isUnplanned ? '是' : '否',
    };
  });

  const diaryRows = [...data.diaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d: DailyDiary) => ({
      日期: d.date,
      '今日工作-完成': d.work.completed,
      '今日工作-成果': d.work.outcomes,
      '今日工作-未完成': d.work.unfinished,
      '今日学习-内容': d.learning.learned,
      '今日学习-新认知': d.learning.insights,
      '今日学习-沉淀': d.learning.knowledgeToSave,
      '今日思考-问题': d.thinking.problems,
      '今日思考-原因': d.thinking.causes,
      '今日思考-思路': d.thinking.solutions,
      '今日复盘-亮点': d.review.wentWell,
      '今日复盘-改善': d.review.toImprove,
      '今日复盘-时间评估': d.review.timeReasonable,
      '今日复盘-消耗': d.review.timeWasters,
      '明日三件大事': d.tomorrowPlan.topThree.filter(Boolean).join('；'),
    }));

  const reviewRows = [...data.reviews]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((r) => ({
      周期类型: r.periodType,
      周期标识: r.periodKey,
      开始日期: r.startDate,
      结束日期: r.endDate,
      重要成果: r.notes.importantAchievements,
      未完成事项: r.notes.unfinishedMatters,
      主要问题: r.notes.mainProblems,
      下一阶段改善方向: r.notes.nextDirection,
      学习与能力成长: r.notes.learningGrowth,
      长期目标对齐: r.notes.longTermAlignment,
      关键事件与教训: r.notes.keyEventsAndLessons,
    }));

  const wsEntries = XLSX.utils.json_to_sheet(
    entryRows.length > 0 ? entryRows : [{ 提示: '暂无时间记录' }],
  );
  const wsDiaries = XLSX.utils.json_to_sheet(
    diaryRows.length > 0 ? diaryRows : [{ 提示: '暂无日记记录' }],
  );
  const wsReviews = XLSX.utils.json_to_sheet(
    reviewRows.length > 0 ? reviewRows : [{ 提示: '暂无周期复盘' }],
  );

  // Append unified author attribution row after each sheet's records
  XLSX.utils.sheet_add_aoa(
    wsEntries,
    [[], [AUTHOR_ATTRIBUTION_TEXT, COPYRIGHT_TEXT]],
    { origin: -1 },
  );
  XLSX.utils.sheet_add_aoa(
    wsDiaries,
    [[], [AUTHOR_ATTRIBUTION_TEXT, COPYRIGHT_TEXT]],
    { origin: -1 },
  );
  XLSX.utils.sheet_add_aoa(
    wsReviews,
    [[], [AUTHOR_ATTRIBUTION_TEXT, COPYRIGHT_TEXT]],
    { origin: -1 },
  );

  XLSX.utils.book_append_sheet(wb, wsEntries, '时间记录');
  XLSX.utils.book_append_sheet(wb, wsDiaries, '每日日记');
  XLSX.utils.book_append_sheet(wb, wsReviews, '周期复盘');

  return wb;
}

export function exportAllToExcel(data: AllTimeFlowData) {
  const wb = buildAllExcelWorkbook(data);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `TimeFlow_完整数据_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportFullJSONBackup(data: AllTimeFlowData) {
  const payload: TimeFlowBackupPayload = {
    app: 'TimeFlow',
    version: 1,
    exportedAt: Date.now(),
    data: {
      entries: data.entries,
      tasks: data.tasks,
      diaries: data.diaries,
      reviews: data.reviews,
      aiReports: data.aiReports,
      settings: data.settings,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  triggerDownload(blob, `TimeFlow_备份_${new Date().toISOString().slice(0, 10)}.json`);
}
