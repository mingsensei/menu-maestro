import { randomBytes } from 'node:crypto';

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Configure SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env');
  if (production && (env.SESSION_SECRET?.length ?? 0) < 32) throw new Error('Production requires SESSION_SECRET with at least 32 characters');
  return {
    port: Number(env.PORT || 3001), production,
    origins: (env.FRONTEND_ORIGIN || 'http://localhost:8080').split(',').map(value => value.trim()),
    supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_ANON_KEY,
    sessionSecret: env.SESSION_SECRET || randomBytes(32).toString('hex'),
    groqKey: env.GROQ_API_KEY || '', groqModel: env.GROQ_MODEL?.trim() || 'auto',
    geminiKey: env.GEMINI_API_KEY || '', geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    trustProxy: env.TRUST_PROXY === 'true', dailyLimit: Number(env.AI_DAILY_LIMIT || 500),
    knowledgePath: env.KNOWLEDGE_BASE_PATH || undefined,
  };
}
