const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 4173);
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const json = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
};

function readJSON(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 80_000) {
        reject(new Error('请求内容过长'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('请求格式无效')); }
    });
    request.on('error', reject);
  });
}

function detectRisk(question) {
  const text = String(question || '');
  const crisis = /(自杀|自残|不想活|结束生命|伤害自己|伤害他人|杀了|活不下去)/i;
  const professional = /(停药|药量|处方药|诊断|手术|律师|起诉|合同纠纷|借贷|贷款|高杠杆|全部积蓄|投资翻倍)/i;
  if (crisis.test(text)) return 'S4';
  if (professional.test(text)) return 'S3';
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
  if (!API_KEY) throw new Error('缺少 DEEPSEEK_API_KEY');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
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
    if (!response.ok) {
      const detail = payload?.error?.message || `DeepSeek 请求失败（${response.status}）`;
      throw new Error(detail);
    }
    return cleanJSONString(payload?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

const systemBoundary = `你是“岔路牌”的决策澄清助手。你不预测命运，不替用户决定，不输出无依据概率。
塔罗信息只用于反思，不能进入理性分析。用自然、温和、简洁的中文回答。
不得把未经用户确认的健康、营养、价格、热量、医学或关系判断写成事实；信息不足时用“可能、如果、需要确认”。
所有字段都必须贴合用户的原始问题，禁止复制示例内容。只返回合法 JSON，不要 Markdown。`;

async function analyzeDecision(input) {
  const question = String(input.question || '').trim().slice(0, 500);
  if (question.length < 2) throw new Error('请先写下你的问题');
  const localRisk = detectRisk(question);
  if (localRisk === 'S4') {
    return {
      risk_level: 'S4',
      safety_message: '听起来你现在可能正承受很大的痛苦。请优先联系身边可信任的人、当地急救或危机干预资源，并尽量不要独自承担。',
    };
  }
  if (localRisk === 'S3') {
    return {
      risk_level: 'S3',
      safety_message: '这个问题涉及专业或高风险判断。这里先不抽牌或给出行动结论，我可以帮你整理需要向专业人士确认的问题。',
    };
  }
  return callDeepSeek(
    `${systemBoundary}
任务：解析用户的纠结。即使问题很短，也要从“还是、或者、或、vs、要不要”等表达中识别选项。
返回结构：
{"risk_level":"S1或S2","question_summary":"一句话总结","options":[{"title":"简洁具体的选项","may_satisfy":["需求1","需求2","需求3"]},{"title":"选项2","may_satisfy":["需求1","需求2","需求3"]}],"criteria":["标准1","标准2","标准3"],"third_route":{"title":"第三条路短标题","description":"具体、低成本、可执行的折中或补信息策略"}}
options 保持 2-3 个；不要把选项写成抽象的“A方案”。may_satisfy 必须与各自选项不同，并描述主观需要，不能把低卡、健康、便宜等未确认信息写成事实。criteria 只给 3 个。`,
    `用户问题：${question}`,
    0.35,
  );
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
返回结构：
{"routes":[{"option":"原选项名称","scenarios":{"base":{"summary":"","premise":"","gain":"","cost":"","action":"","reversibility":""},"bright":{"summary":"","premise":"","gain":"","cost":"","action":"","reversibility":""},"risk":{"summary":"","premise":"","gain":"","cost":"","action":"","reversibility":""}}}],"unknowns":["未知项1","未知项2","未知项3"]}
每个字段 12-45 字；action 必须是下一步可验证动作；不输出概率或推荐结论。`,
    `用户问题：${question}\n选项：${JSON.stringify(options)}\n共同决策标准：${criteria.join('、')}`,
    0.45,
  );
}

async function handleAI(request, response) {
  try {
    const input = await readJSON(request);
    let result;
    if (input.action === 'analyze') result = await analyzeDecision(input);
    else if (input.action === 'tarot') result = await generateTarot(input);
    else if (input.action === 'scenarios') result = await generateScenarios(input);
    else return json(response, 400, { error: '未知的 AI 操作' });
    json(response, 200, { ok: true, data: result, model: MODEL });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'AI 响应超时，请稍后再试' : error.message;
    json(response, 502, { ok: false, error: message });
  }
}

function serveStatic(request, response) {
  const rawPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const pathname = rawPath === '/' ? '/index.html' : rawPath;
  const resolved = path.resolve(ROOT, `.${pathname}`);
  if (!resolved.startsWith(ROOT + path.sep) || path.basename(resolved).startsWith('.')) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.readFile(resolved, (error, data) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(resolved)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/health') {
    return json(response, 200, { ok: Boolean(API_KEY), provider: 'deepseek', model: MODEL });
  }
  if (request.method === 'POST' && request.url === '/api/ai') return handleAI(request, response);
  if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(request, response);
  response.writeHead(405); response.end('Method not allowed');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`岔路牌预览：http://127.0.0.1:${PORT}`);
  console.log(`AI：DeepSeek / ${MODEL}`);
});
