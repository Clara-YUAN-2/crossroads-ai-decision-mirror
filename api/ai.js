const { dispatchAI, MODEL } = require('../lib/decision-ai');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const input = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const data = await dispatchAI(input);
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({ ok: true, data, model: MODEL });
  } catch (error) {
    const status = error.statusCode || 502;
    const message = error.name === 'AbortError' ? 'AI 响应超时，请稍后再试' : error.message;
    return response.status(status).json({ ok: false, error: message });
  }
};

