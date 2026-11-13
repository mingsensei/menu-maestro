import test from 'node:test';
import assert from 'node:assert/strict';
import { createAI } from '../src/ai.js';

const config = { geminiKey: 'secret-key', geminiModel: 'gemini-2.5-flash' };
test('Groq is preferred when both keys are configured and uses an available default model', async () => {
  const calls = [];
  const ai = createAI({ ...config, groqKey: ' groq-secret ', groqModel: 'openai/gpt-oss-20b' }, async (url, options) => {
    calls.push({ url, ...options });
    return Response.json({ choices: [{ message: { content: '{"reply":"Hello"}' } }] });
  });
  assert.deepEqual(await ai.json('system', { message: 'Hi' }, { type: 'object' }, 400), { reply: 'Hello' });
  assert.equal(ai.provider, 'groq');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer groq-secret');
  const body = JSON.parse(calls[0].body);
  assert.equal(body.model, 'openai/gpt-oss-20b');
  assert.equal(body.max_completion_tokens, 400);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.messages[0].content, 'system');
});
test('Groq failures fall back to Gemini, including invalid JSON responses', async () => {
  for (const failure of [new Response('provider error', { status: 429 }), Response.json({ choices: [{ message: { content: '{incomplete' } }] })]) {
    const calls = [];
    const ai = createAI({ ...config, groqKey: 'groq-secret', groqModel: 'openai/gpt-oss-20b' }, async url => {
      calls.push(url);
      return calls.length === 1 ? failure : Response.json({ candidates: [{ content: { parts: [{ text: '{"reply":"Fallback"}' }] } }] });
    });
    assert.deepEqual(await ai.json('system', {}, {}), { reply: 'Fallback' });
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes('generativelanguage.googleapis.com'));
  }
});
test('Groq-only errors are sanitized and custom model settings are honored', async () => {
  const ai = createAI({ groqKey: 'groq-secret', groqModel: 'custom-model' }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, 'custom-model');
    return new Response('groq-secret provider details', { status: 429 });
  });
  await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 429 && !error.message.includes('groq-secret'));
});
test('Gemini request keeps the API key in the server header and caps output', async () => {
  let captured;
  const ai = createAI(config, async (url, options) => {
    captured = { url, ...options };
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"reply":"Hello"}' }] } }] });
  });
  assert.deepEqual(await ai.json('system', { message: 'Hi' }, { type: 'object' }, 400), { reply: 'Hello' });
  assert.equal(captured.headers['x-goog-api-key'], 'secret-key');
  assert.ok(!captured.url.includes('secret-key'));
  assert.equal(JSON.parse(captured.body).generationConfig.maxOutputTokens, 400);
});
test('provider errors never expose provider responses or credentials', async () => {
  const ai = createAI(config, async () => new Response('secret-key provider error', { status: 429 }));
  await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 429 && !error.message.includes('secret-key'));
});
test('incomplete translation batches fail rather than saving empty translations', async () => {
  const ai = createAI(config, async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"items":[{}]}' }] } }] }));
  await assert.rejects(() => ai.translate(['A salad']), /Incomplete translations/);
});

test('Groq needs only an API key: discovers a compatible model once and reuses it', async () => {
  const calls = [];
  const ai = createAI({ groqKey: 'groq-secret' }, async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'whisper-large-v3', active: true }, { id: 'llama-3.3-70b-versatile', active: true }, { id: 'openai/gpt-oss-20b', active: false }] });
    assert.equal(JSON.parse(options.body).model, 'llama-3.3-70b-versatile');
    return Response.json({ choices: [{ message: { content: '{"reply":"Hello"}' } }] });
  });
  await Promise.all([ai.json('system', {}, {}), ai.json('system', {}, {})]);
  assert.equal(calls.filter(call => call.url.endsWith('/models')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/completions')).length, 2);
  assert.ok(calls.every(call => !call.url.includes('groq-secret')));
});

test('Groq can still answer if the model-list endpoint is unavailable', async () => {
  const ai = createAI({ groqKey: 'groq-secret' }, async (url, options) => {
    if (url.endsWith('/models')) return new Response('not available', { status: 503 });
    assert.equal(JSON.parse(options.body).model, 'openai/gpt-oss-20b');
    return Response.json({ choices: [{ message: { content: '{"reply":"Hello"}' } }] });
  });
  assert.deepEqual(await ai.json('system', {}, {}), { reply: 'Hello' });
});

const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const available = () => Response.json({ data: [...models, 'llama-3.1-8b-instant'].map(id => ({ id, active: true })) });
const answer = reply => Response.json({ choices: [{ message: { content: JSON.stringify({ reply }) } }], usage: { prompt_tokens: 2000, completion_tokens: 300 } });
const limited = (seconds = 30) => Response.json({ error: { code: 'rate_limit_exceeded' } }, { status: 429, headers: { 'retry-after': String(seconds) } });

test('auto mode recovers model quota failures and skips the exhausted model until its cooldown expires', async () => {
  let time = 0;
  const calls = [], diagnostics = [];
  const ai = createAI({ groqKey: 'secret' }, async (url, options) => {
    if (url.endsWith('/models')) return available();
    const model = JSON.parse(options.body).model;
    calls.push(model);
    return model === models[0] && time < 10000 ? limited(10) : answer(model);
  }, { now: () => time, onDiagnostic: entry => diagnostics.push(entry) });
  assert.equal((await ai.json('system', {}, {})).reply, models[1]);
  assert.equal((await ai.json('system', {}, {})).reply, models[1]);
  assert.deepEqual(calls, [models[0], models[1], models[1]]);
  time = 10001;
  assert.equal((await ai.json('system', {}, {})).reply, models[0]);
  assert.ok(!calls.includes('llama-3.1-8b-instant'));
  assert.equal(diagnostics[0].outcome, 'rate_limited');
  assert.equal(diagnostics[1].promptTokens, 2000);
});

test('successive chat requests do not repeatedly hit every provider while all quotas are cooling down', async () => {
  const calls = [];
  const ai = createAI({ ...config, groqKey: 'secret' }, async (url, options) => {
    if (url.endsWith('/models')) return available();
    calls.push(url.includes('groq') ? JSON.parse(options.body).model : 'gemini');
    return limited(30);
  });
  for (let turn = 0; turn < 3; turn++) await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 429);
  assert.deepEqual(calls, [...models, 'gemini']);
});

test('a short Retry-After is honored once before recovering, without an immediate retry loop', async () => {
  let time = 0, calls = 0;
  const waits = [];
  const ai = createAI({ groqKey: 'secret', groqModel: 'pinned' }, async () => ++calls === 1 ? limited(2) : answer('recovered'), {
    now: () => time, sleep: async ms => { waits.push(ms); time += ms; },
  });
  assert.equal((await ai.json('system', {}, {})).reply, 'recovered');
  assert.deepEqual(waits, [2000]);
  assert.equal(calls, 2);
});

test('a persistent short quota failure gets only two bounded recovery retries', async () => {
  let time = 0, calls = 0;
  const waits = [];
  const ai = createAI({ groqKey: 'secret', groqModel: 'pinned' }, async () => { calls++; return limited(1); }, {
    now: () => time, sleep: async ms => { waits.push(ms); time += ms; },
  });
  await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 429);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 1000]);
});

test('quota cooldown honors daily request reset rather than retrying a daily-exhausted model each second', async () => {
  let time = 0, calls = 0;
  const ai = createAI({ groqKey: 'secret', groqModel: 'pinned' }, async () => {
    calls++;
    return new Response('busy', { status: 429, headers: { 'retry-after': '1', 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '1h2m' } });
  }, { now: () => time });
  await assert.rejects(() => ai.json('system', {}, {}), error => error.retryAfterMs === 3720000);
  time = 60000;
  await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 429);
  assert.equal(calls, 1);
});

test('Gemini retry details are honored when its rate-limit response has no Retry-After header', async () => {
  let time = 0, calls = 0;
  const waits = [];
  const ai = createAI(config, async () => {
    calls++;
    return Response.json({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '20s' }] } }, { status: 429 });
  }, { now: () => time, sleep: async ms => { waits.push(ms); time += ms; } });
  await assert.rejects(() => ai.json('system', {}, {}), error => error.retryAfterMs === 20000);
  time = 10000;
  await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 429);
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test('invalid JSON and invalid intent schemas can recover through another available model', async () => {
  for (const bad of ['{incomplete', '{"wrong":"shape"}']) {
    const calls = [];
    const ai = createAI({ groqKey: 'secret' }, async (url, options) => {
      if (url.endsWith('/models')) return available();
      calls.push(JSON.parse(options.body).model);
      return calls.length === 1 ? Response.json({ choices: [{ message: { content: bad } }] }) : answer('valid');
    });
    const result = await ai.json('system', {}, {}, 1000, { validate: value => { if (!value.reply) throw new Error('private schema detail'); } });
    assert.equal(result.reply, 'valid');
    assert.deepEqual(calls, models);
  }
});

test('network failures and provider JSON-validation errors fail over with sanitized diagnostics', async () => {
  for (const fail of [() => { throw Error('secret-key connection detail'); }, () => Response.json({ error: { code: 'json_validate_failed', failed_generation: 'private guest content' } }, { status: 400 })]) {
    const diagnostics = [];
    let calls = 0;
    const ai = createAI({ groqKey: 'secret-key' }, async url => {
      if (url.endsWith('/models')) return available();
      return ++calls === 1 ? fail() : answer('recovered');
    }, { onDiagnostic: entry => diagnostics.push(entry) });
    assert.equal((await ai.json('private system', { guest: 'private guest content' }, {})).reply, 'recovered');
    assert.doesNotMatch(JSON.stringify(diagnostics), /secret-key|private|connection detail|failed_generation/);
  }
});

test('fallback attempts share a deadline instead of each receiving a fresh 25-second timeout', async () => {
  let time = 0;
  const timeouts = [];
  const ai = createAI({ ...config, groqKey: 'secret' }, async (url, options) => {
    if (url.endsWith('/models')) return available();
    assert.ok(options.signal);
    timeouts.push(time);
    time += 13000;
    throw Error('network unavailable');
  }, { now: () => time });
  await assert.rejects(() => ai.json('system', {}, {}), error => error.status === 503);
  assert.deepEqual(timeouts, [0, 13000]);
});


test('GPT-OSS receives closed required schemas recursively without mutating the caller schema', async () => {
  const schema = { type: 'object', properties: { terms: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, scope: { type: 'string', enum: ['request', 'session'] } }, required: ['value'] } } }, required: ['terms'] };
  const original = structuredClone(schema);
  const ai = createAI({ groqKey: 'secret', groqModel: models[0] }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.reasoning_effort, 'low');
    const compiled = body.response_format.json_schema.schema;
    assert.equal(compiled.additionalProperties, false);
    assert.equal(compiled.properties.terms.items.additionalProperties, false);
    assert.deepEqual(compiled.properties.terms.items.required, ['value', 'scope']);
    assert.equal(body.messages[0].content, 'system');
    return answer('valid');
  });
  await ai.json('system', {}, schema, 1400);
  assert.deepEqual(schema, original);
});

test('custom models keep compatible JSON mode without GPT-OSS-specific reasoning or schema settings', async () => {
  const ai = createAI({ groqKey: 'secret', groqModel: 'custom-model' }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.reasoning_effort, undefined);
    assert.match(body.messages[0].content, /conforming to this schema/);
    return answer('valid');
  });
  await ai.json('system', {}, {});
});


test('a malformed output does not globally disable a model for the next independent question', async () => {
  const calls = [];
  const ai = createAI({ groqKey: 'secret' }, async (url, options) => {
    if (url.endsWith('/models')) return available();
    const model = JSON.parse(options.body).model;
    calls.push(model);
    return calls.length === 1 ? Response.json({ choices: [{ message: { content: '{broken' } }] }) : answer('valid');
  });
  await ai.json('system', {}, {});
  await ai.json('system', {}, {});
  assert.deepEqual(calls, [models[0], models[1], models[0]]);
});
