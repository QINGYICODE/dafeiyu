import { AppError, publicUrl, text, boundedBody } from './network.mjs';
import { id, now } from './store.mjs';

export class Model {
  constructor(store) { this.store = store; }
  async call(messages, { signal, vision = false, maxTokens = 2600, allowPlain = false, responseMode = 'json', purpose = '' } = {}) {
    const key = this.store.getKey(); if (!key) throw new AppError('先在设置中连接大模型，再和大肥鱼聊天。', 409, 'MODEL_NOT_CONFIGURED');
    const settings = this.store.get('settings').model;
    const base = await publicUrl(settings.baseUrl);
    if (process.env.DEEPSEEK_KEY && base.hostname !== 'api.deepseek.com' && !this.store.get('modelKey')) throw new AppError('环境变量中的 DeepSeek 密钥只用于官方接口；自定义服务请单独填写密钥。');
    const url = `${base.href.replace(/\/$/, '')}/chat/completions`;
    const request = { model: vision ? settings.visionName || settings.name : settings.name, messages, stream: false, max_tokens: maxTokens, ...(settings.jsonMode && responseMode === 'json' ? { response_format: { type: 'json_object' } } : {}) };
    if (base.hostname === 'api.deepseek.com') request.thinking = { type: 'disabled' };
    let response;
    try { response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${base.hostname === 'api.deepseek.com' && process.env.DEEPSEEK_KEY ? process.env.DEEPSEEK_KEY : this.store.decrypt(this.store.get('modelKey'))}` }, body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]) }); }
    catch (error) { if (signal?.aborted) throw error; throw new AppError('模型服务暂时无法连接，请检查地址或网络后重试。', 502, 'MODEL_NETWORK_ERROR'); }
    if (!response.ok) {
      const messages = { 401: 'API Key 无效，请检查后重新连接。', 402: '模型账户余额不足。', 403: '当前密钥没有使用此模型的权限。', 404: '模型名称或接口地址不存在。', 429: '模型请求达到限额，请稍后再试。' };
      await response.body?.cancel(); throw new AppError(messages[response.status] || '模型服务返回异常，请稍后重试。', 502, `MODEL_HTTP_${response.status}`);
    }
    let data; try { data = JSON.parse((await boundedBody(response, 3 * 1024 * 1024)).toString('utf8')); } catch { throw new AppError('模型返回内容不完整，请重试。', 502, 'MODEL_INVALID_RESPONSE'); }
    this.store.put('usage', { id: id(), createdAt: now(), purpose: text(purpose, 60), input: Number(data.usage?.prompt_tokens || 0), output: Number(data.usage?.completion_tokens || 0), known: Boolean(data.usage), model: data.model || settings.name, finishReason: data.choices?.[0]?.finish_reason, contentLength: typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content.length : null, reasoningLength: typeof data.choices?.[0]?.message?.reasoning_content === 'string' ? data.choices[0].message.reasoning_content.length : null });
    const content = data.choices?.[0]?.message?.content;
    if (!text(content, 50000)) throw new AppError('模型没有返回完整回答，请重试。', 502, 'MODEL_EMPTY_RESPONSE');
    if (data.choices[0].finish_reason === 'length') throw new AppError('模型回答达到长度上限，请缩短问题后重试。', 502, 'MODEL_TRUNCATED');
    const decoded = responseMode === 'text' ? { result: { reply: content.trim() }, structured: false } : decodeModelContent(content, allowPlain);
    return { ...decoded, usage: { input: Number(data.usage?.prompt_tokens || 0), output: Number(data.usage?.completion_tokens || 0), model: data.model || settings.name } };
  }
  async test() {
    const { result } = await this.call([{ role: 'system', content: 'Return a json object {"ok":true}. Only json.' }, { role: 'user', content: '连接测试，输出 json。' }], { maxTokens: 100 });
    if (result.ok !== true) throw new AppError('服务已响应，但没有通过结构化输出检查。', 502);
    this.store.set('connection', { ok: true, at: new Date().toISOString() });
    return { ok: true, message: '连接成功，可以开始聊天了。' };
  }
}

export function decodeModelContent(content, allowPlain = false) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let result;
  try { result = JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) { try { result = JSON.parse(cleaned.slice(start, end + 1)); } catch {} }
    if (!result && allowPlain && !/^[{\[]/.test(cleaned) && cleaned && !cleaned.startsWith('```')) return { result: { reply: cleaned }, structured: false };
  }
  if (!result || Array.isArray(result) || typeof result !== 'object') throw new AppError('模型未返回约定的完整消息格式。请开启 JSON 模式或更换兼容模型。', 502, 'MODEL_INVALID_JSON');
  return { result, structured: true };
}
