// One bounded request per action. Provider errors never become fabricated answers.
export class AIUnavailable extends Error {
  constructor(message = 'AI is temporarily unavailable. Please try again.', status = 503, code = 'AI_UNAVAILABLE', retryAfter = 0) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function generateText(prompt, config = {}) {
  if (!process.env.GEMINI_API_KEY) throw new AIUnavailable('AI is not configured on this server.');
  const { timeoutMs = 10000, model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', mediaParts = [], signal, ...generationConfig } = config;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...mediaParts] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1400, ...(model.includes('lite') ? {} : { thinkingConfig: { thinkingBudget: 0 } }), ...generationConfig } })
    });
    if (!response.ok) {
      let details = {};
      try { details = await response.json(); } catch { /* Non-JSON provider error. */ }
      const daily = JSON.stringify(details.error?.details || []).includes('PerDay');
      const retry = Number.parseInt(details.error?.details?.find(d => d.retryDelay)?.retryDelay || response.headers?.get('retry-after') || '60');
      const overloaded = [500, 502, 503, 504].includes(response.status);
      throw new AIUnavailable(response.status === 429 ? daily ? 'The AI provider\'s daily quota is exhausted. Other classroom features still work. The server owner must choose a model with quota or enable billing.' : 'AI usage limit reached. Please wait before retrying.' : overloaded ? 'The AI service is busy. Please retry shortly.' : 'The AI provider could not complete this request. Please retry.', response.status === 429 ? 429 : 503, daily ? 'AI_DAILY_QUOTA' : response.status === 429 ? 'AI_RATE_LIMIT' : overloaded ? 'AI_OVERLOADED' : 'AI_UNAVAILABLE', response.status === 429 ? Math.max(1, retry || 60) : 0);
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new AIUnavailable('AI could not produce a complete response. Please retry.');
    const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('').trim();
    if (!text) throw new AIUnavailable();
    return text;
  } catch (error) {
    if (error instanceof AIUnavailable) throw error;
    throw new AIUnavailable(error.name === 'TimeoutError' ? 'AI took too long. Please try again.' : undefined);
  }
}

// Vault answers and PDF transcription may recover from overload once, within one total deadline.
// Quota, invalid requests and incomplete output never trigger hidden retries.
export async function generateTextWithFallback(prompt, config = {}) {
  const { timeoutMs = 35000, ...options } = config;
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const primary = options.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  try { return await generateText(prompt, { ...options, model: primary, signal, timeoutMs }); }
  catch (error) {
    if (error.code !== 'AI_OVERLOADED' || signal.aborted) throw error;
    await new Promise(resolve => setTimeout(resolve, 350));
    signal.throwIfAborted();
    return generateText(prompt, { ...options, model: process.env.GEMINI_RAG_FALLBACK_MODEL || 'gemini-3.5-flash-lite', signal, timeoutMs });
  }
}

export function parseAIJson(text) {
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new AIUnavailable('AI returned an incomplete result. Please retry.'); }
}

export function sendAIError(res, error) {
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  return res.status(error.status || 503).json({ error: error.status ? error.message : 'Could not complete the AI request. Please retry.', code: error.code || 'AI_UNAVAILABLE', retry_after: error.retryAfter || 0, ...(error.evidence ? { evidence: error.evidence, sources: error.sources } : {}) });
}
