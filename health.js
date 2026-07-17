const { MODEL, hasAPIKey } = require('../lib/decision-ai');

module.exports = function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ ok: hasAPIKey(), provider: 'deepseek', model: MODEL });
};

