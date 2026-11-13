import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    );
    res.json({
      ok: true,
      aiConfigured: hasKey,
      timestamp: Date.now(),
    });
  });

  app.post('/api/ai/diary', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'AI 服务尚未配置环境变量 GEMINI_API_KEY，请在系统 Secrets 面板中配置后重试。',
        });
        return;
      }

      const { date, entries, tasks } = req.body as {
        date: string;
        entries: Array<{
          startTime: string;
          endTime: string;
          title: string;
          categoryLabel: string;
          thought: string;
          resultNote: string;
          statusLabel: string;
          energyLabel: string;
          isUnplanned: boolean;
        }>;
        tasks: Array<{ title: string; completed: boolean; isTopThree: boolean }>;
      };

      if (!Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({
          error: '当天暂无时间记录，请先记录至少一条时间投入再生成 AI 日记初稿。',
        });
        return;
      }

      const prompt = `
请根据以下用户在 ${date} 的真实时间记录与任务清单，生成一份理性、克制、结构化的中文个人日记初稿。

严格约束：
1. 只能依据提供的时间记录、思考栏、结果备注和任务清单进行总结，绝对禁止凭空编造未记录的工作成果、事件或感悟。
2. 如果某一栏缺乏对应记录（例如当天没有学习类记录或思考栏为空），请如实写明“今日暂无相关记录”并给出简短客观提示，不要虚构内容。
3. 语言风格贴近 Notion / 个人成长复盘笔记，简洁务实，避免空泛鸡汤。

【当日时间记录】
${JSON.stringify(entries, null, 2)}

【当日待办与三件大事】
${JSON.stringify(tasks ?? [], null, 2)}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            '你是用户的个人时间复盘助手。所有分析与总结必须严格忠实于输入的真实记录数据。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              work: {
                type: Type.OBJECT,
                properties: {
                  completed: { type: Type.STRING, description: '今天完成了哪些重要工作' },
                  outcomes: { type: Type.STRING, description: '有哪些具体成果' },
                  unfinished: { type: Type.STRING, description: '哪些事情没有完成' },
                },
                required: ['completed', 'outcomes', 'unfinished'],
              },
              learning: {
                type: Type.OBJECT,
                properties: {
                  learned: { type: Type.STRING, description: '学到了什么' },
                  insights: { type: Type.STRING, description: '有哪些新的认知' },
                  knowledgeToSave: { type: Type.STRING, description: '有什么值得沉淀的知识' },
                },
                required: ['learned', 'insights', 'knowledgeToSave'],
              },
              thinking: {
                type: Type.OBJECT,
                properties: {
                  problems: { type: Type.STRING, description: '今天遇到了什么问题' },
                  causes: { type: Type.STRING, description: '问题产生的原因是什么' },
                  solutions: { type: Type.STRING, description: '有没有新的解决思路' },
                },
                required: ['problems', 'causes', 'solutions'],
              },
              review: {
                type: Type.OBJECT,
                properties: {
                  wentWell: { type: Type.STRING, description: '今天做得好的事情' },
                  toImprove: { type: Type.STRING, description: '今天需要改善的事情' },
                  timeReasonable: { type: Type.STRING, description: '时间投入是否合理' },
                  timeWasters: { type: Type.STRING, description: '哪些事情消耗了不必要的时间' },
                },
                required: ['wentWell', 'toImprove', 'timeReasonable', 'timeWasters'],
              },
              tomorrowPlan: {
                type: Type.OBJECT,
                properties: {
                  topThree: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '明天最重要的三件事',
                  },
                  ongoingTasks: { type: Type.STRING, description: '需要持续跟进的任务' },
                  oneIssueToFix: { type: Type.STRING, description: '明天需要改善的一个问题' },
                },
                required: ['topThree', 'ongoingTasks', 'oneIssueToFix'],
              },
            },
            required: ['work', 'learning', 'thinking', 'review', 'tomorrowPlan'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({ draft: parsed });
    } catch (error) {
      console.error('AI diary error:', error);
      const message = error instanceof Error ? error.message : '生成 AI 日记时发生未知错误';
      res.status(500).json({ error: `AI 日记生成失败：${message}` });
    }
  });

  app.post('/api/ai/growth-analysis', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'AI 服务尚未配置环境变量 GEMINI_API_KEY，请在系统 Secrets 面板中配置后重试。',
        });
        return;
      }

      const { rangeLabel, summaryStats, categoryBreakdown, entrySamples, diarySamples, goals } =
        req.body as {
          rangeLabel: string;
          summaryStats: Record<string, unknown>;
          categoryBreakdown: Array<{ category: string; hours: number; percent: number }>;
          entrySamples: Array<Record<string, unknown>>;
          diarySamples: Array<Record<string, unknown>>;
          goals: string[];
        };

      if (!summaryStats || Number(summaryStats.totalEntries ?? 0) === 0) {
        res.status(400).json({
          error: '所选时间范围内没有真实时间记录，无法生成有效的成长分析。',
        });
        return;
      }

      const prompt = `
请作为个人时间管理与成长教练，基于以下真实时间统计与日志样本，对用户【${rangeLabel}】的时间投入进行深度诊断。

严格规则：
1. 绝对不能凭空编造个人经历、项目成果或未出现的数据。
2. 当记录天数或样本较少时，必须在“数据事实”和相关结论中明确指出“当前样本量有限，部分维度暂无法充分判断”，只围绕已有事实推导。
3. 必须覆盖以下 8 个核心分析维度：
   - 时间主要花在哪里？
   - 哪些事情投入时间多，但产出较低？
   - 哪些时间投入对长期成长更有价值？
   - 工作和学习时间是否合理？
   - 是否存在重复性低效行为？
   - 哪些事情持续做得不错？
   - 最近有哪些值得关注的变化趋势？
   - 当前最值得改善的三个问题是什么？
4. 休息时间是必要的恢复投入，不要把休息简单视为低效。

【周期汇总指标】
${JSON.stringify(summaryStats, null, 2)}

【时间分类分布】
${JSON.stringify(categoryBreakdown, null, 2)}

【用户长期目标】
${JSON.stringify(goals ?? [], null, 2)}

【时间记录样本（含思考与成果备注）】
${JSON.stringify(entrySamples ?? [], null, 2)}

【日记复盘摘录】
${JSON.stringify(diarySamples ?? [], null, 2)}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            '你是一位严谨、理性、注重事实证据的个人效能分析顾问。所有输出严格基于提供的 JSON 数据，不得杜撰经历。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dataSufficiencyNote: {
                type: Type.STRING,
                description: '数据样本充足度说明（若记录较少需明确指出）',
              },
              dataFacts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '基于真实统计的数据事实（含时间主要花在哪里、工作学习比例、近期变化）',
              },
              issuesFound: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '识别出的时间分配问题（含高投入低产出项、重复性低效行为、最值得改善的三个问题）',
              },
              rootCauses: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '结合日记与思考栏的深层原因分析',
              },
              strengthsAndHighlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '持续做得不错的事情与对长期成长最有价值的投入',
              },
              actionableSuggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    action: { type: Type.STRING },
                    expectedImpact: { type: Type.STRING },
                  },
                  required: ['title', 'action', 'expectedImpact'],
                },
                description: '具体可执行的改善建议',
              },
              nextPhaseGoals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    goal: { type: Type.STRING },
                    metric: { type: Type.STRING },
                    timeframe: { type: Type.STRING },
                  },
                  required: ['goal', 'metric', 'timeframe'],
                },
                description: '下一阶段可追踪的改善计划与量化目标',
              },
            },
            required: [
              'dataSufficiencyNote',
              'dataFacts',
              'issuesFound',
              'rootCauses',
              'strengthsAndHighlights',
              'actionableSuggestions',
              'nextPhaseGoals',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({ analysis: parsed });
    } catch (error) {
      console.error('AI growth analysis error:', error);
      const message = error instanceof Error ? error.message : '生成 AI 成长分析时发生未知错误';
      res.status(500).json({ error: `AI 分析失败：${message}` });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TimeFlow server listening on http://localhost:${PORT}`);
  });
}

startServer();
