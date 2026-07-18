const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

function detectRisk(question) {
  const text = String(question || '');
  if (/(自杀|自残|不想活|结束生命|伤害自己|伤害他人|杀了|活不下去)/i.test(text)) return 'S4';
  if (/(停药|药量|处方药|诊断|手术|律师|起诉|合同纠纷|借贷|贷款|高杠杆|全部积蓄|投资翻倍)/i.test(text)) return 'S3';
  return 'S1';
}

function cleanJSONString(content) {
  const stripped = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('AI 没有返回可解析的数据');
  return JSON.parse(stripped.slice(first, last + 1));
}

async function callDeepSeek(system, user, temperature = 0.55) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek 请求失败（${response.status}）`);
    return cleanJSONString(payload?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

const systemBoundary = `你是“岔路牌”的决策澄清助手。你不预测命运，不替用户决定，不输出无依据概率。
塔罗信息只用于反思，不能进入理性分析。用自然、温和、简洁的中文回答。
不得把未经用户确认的健康、营养、价格、热量、医学或关系判断写成事实；信息不足时用“可能、如果、需要确认”。
所有字段都必须贴合用户的原始问题，禁止复制示例内容。只返回合法 JSON，不要 Markdown。`;

function normalizeClarification(input) {
  const raw = input && typeof input.clarification === 'object' ? input.clarification : {};
  const question = String(raw.question || '').trim().slice(0, 160);
  const answer = String(raw.answer || '').trim().slice(0, 500);
  return question && answer ? { question, answer } : null;
}

function hasUsableAnalysis(value) {
  const analysis = value?.analysis || value;
  return Boolean(analysis && Array.isArray(analysis.options) && analysis.options.length >= 2);
}

async function analyzeDecision(input) {
  const question = String(input.question || '').trim().slice(0, 500);
  if (question.length < 2) throw new Error('请先写下你的问题');
  const localRisk = detectRisk(question);
  if (localRisk === 'S4') {
    return { risk_level: 'S4', safety_message: '听起来你现在可能正承受很大的痛苦。请优先联系身边可信任的人、当地急救或危机干预资源，并尽量不要独自承担。' };
  }
  if (localRisk === 'S3') {
    return { risk_level: 'S3', safety_message: '这个问题涉及专业或高风险判断。这里先不抽牌或给出行动结论，我可以帮你整理需要向专业人士确认的问题。' };
  }

  const clarification = normalizeClarification(input);
  const mustProceed = Boolean(clarification) || Number(input.clarification_round || 0) >= 1;
  const result = await callDeepSeek(
    `${systemBoundary}
任务：先判断现有信息是否足以澄清这次日常决策，再选择唯一的下一步动作。

动作 ask：只有缺少一个会实质改变选项、标准或最小行动的关键事实时才使用。
动作 proceed：信息已经够用，或问题本身简单，直接完成决策拆解。

严格规则：
1. 优先 proceed，不为追问而追问；情绪偏好可以作为标准，不必全部量化。
2. ask 最多提出一个问题，必须具体、容易回答、40 字以内，不能包含多个子问题。
3. 如果用户已经给过补充回答，本轮必须 proceed，不得继续追问。
4. 不替用户做决定，不输出无依据概率，不把未确认信息写成事实。

返回结构只能二选一：
追问：{"next_action":"ask","clarification":{"question":"一个关键问题","missing_information":"缺少的信息类型"}}
继续：{"next_action":"proceed","analysis":{"risk_level":"S1或S2","question_summary":"一句话总结","options":[{"title":"简洁具体的选项","may_satisfy":["需求1","需求2","需求3"]},{"title":"选项2","may_satisfy":["需求1","需求2","需求3"]}],"criteria":["标准1","标准2","标准3"],"third_route":{"title":"第三条路短标题","description":"具体、低成本、可执行的折中或补信息策略"}}}
options 保持 2-3 个；may_satisfy 描述主观需要；criteria 只给 3 个。`,
    `用户原始问题：${question}\n${clarification ? `已补充问题：${clarification.question}\n用户回答：${clarification.answer}` : '尚无补充回答'}\n本轮要求：${mustProceed ? '必须 proceed，结合补充回答完成分析。' : '可以 ask 或 proceed，但只在关键事实确实缺失时 ask。'}`,
    0.3,
  );

  if (result?.next_action === 'ask' && !mustProceed) {
    const request = result.clarification || {};
    const clarificationQuestion = String(request.question || '').trim().slice(0, 80);
    if (!clarificationQuestion) throw new Error('AI 没有返回有效的澄清问题');
    return {
      next_action: 'ask',
      clarification: {
        question: clarificationQuestion,
        missing_information: String(request.missing_information || '关键背景').trim().slice(0, 40),
      },
    };
  }

  if (!hasUsableAnalysis(result)) throw new Error('AI 没有返回完整的决策分析');
  return { next_action: 'proceed', analysis: result.analysis || result };
}
async function generateTarot(input) {
  const question = String(input.question || '').trim().slice(0, 500);
  const card = input.card || {};
  const options = Array.isArray(input.options) ? input.options.slice(0, 3) : [];
  return callDeepSeek(
    `${systemBoundary}
任务：结合用户问题和抽到的塔罗牌，写“这张牌想告诉你什么”。牌义只能打开反思角度，不能预测结果。
返回结构：{"message":"60-100字的温柔解读","reflection_questions":["具体问题1","具体问题2"]}
问题必须直接关联用户的选项、隐藏需求或假设，避免万能鸡汤。`,
    `用户问题：${question}\n选项：${JSON.stringify(options)}\n抽到的牌：${card.name}（${card.orientation}），关键词：${(card.keywords || []).join('、')}`,
    0.65,
  );
}

async function generateScenarios(input) {
  const question = String(input.question || '').trim().slice(0, 500);
  const options = Array.isArray(input.options) ? input.options.slice(0, 3) : [];
  const criteria = Array.isArray(input.criteria) ? input.criteria.slice(0, 5) : [];
  return callDeepSeek(
    `${systemBoundary}
任务：为每个用户确认的选项生成基准、乐观、风险三类情景。所有选项使用同一组标准，保持中立。
返回结构：{"routes":[{"option":"原选项名称","scenarios":{"base":{"summary":"","premise":"","gain":"","cost":"","action":"","reversibility":""},"bright":{"summary":"","premise":"","gain":"","cost":"","action":"","reversibility":""},"risk":{"summary":"","premise":"","gain":"","cost":"","action":"","reversibility":""}}}],"unknowns":["未知项1","未知项2","未知项3"]}
每个字段 12-45 字；action 必须是下一步可验证动作；不输出概率或推荐结论。`,
    `用户问题：${question}\n选项：${JSON.stringify(options)}\n共同决策标准：${criteria.join('、')}`,
    0.45,
  );
}

async function dispatchAI(input) {
  if (input.action === 'analyze') return analyzeDecision(input);
  if (input.action === 'tarot') return generateTarot(input);
  if (input.action === 'scenarios') return generateScenarios(input);
  const error = new Error('未知的 AI 操作');
  error.statusCode = 400;
  throw error;
}

module.exports = {
  MODEL,
  dispatchAI,
  hasAPIKey: () => Boolean(process.env.DEEPSEEK_API_KEY),
};


