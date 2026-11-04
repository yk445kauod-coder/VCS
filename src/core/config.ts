import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type DbKind = 'sqlite' | 'postgres' | 'supabase' | 'firebase' | 'memory';
export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama' | 'custom';

export interface AppConfig {
  port: number;
  host: string;
  publicUrl: string;
  corsOrigin: string;
  adminToken: string;
  sessionSecret: string;
  db: DbKind;
  sqlitePath: string;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  firebaseDatabaseUrl: string;
  firebaseServiceAccountJson: string;
  ai: {
    provider: AiProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
    embeddings: string;
  };
  whatsapp: {
    token: string;
    phoneNumberId: string;
    verifyToken: string;
    webhookSecret: string;
  };
  smtpUrl: string;
  emailFrom: string;
  currency: string;
  autoreply: boolean;
  escalationThreshold: number;
  dataDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(process.cwd(), env.DUTY_DATA_DIR || 'data');
  const sqlitePath = env.SQLITE_PATH || path.join(dataDir, 'duty.sqlite');

  return {
    port: num(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    publicUrl: (env.PUBLIC_URL || `http://localhost:${num(env.PORT, 8787)}`).replace(/\/$/, ''),
    corsOrigin: env.CORS_ORIGIN || '*',
    adminToken: env.ADMIN_TOKEN || 'change-me-admin-token',
    sessionSecret: env.SESSION_SECRET || 'change-me-session-secret',
    db: (env.DUTY_DB as DbKind) || 'sqlite',
    sqlitePath,
    databaseUrl: env.DATABASE_URL || '',
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    firebaseDatabaseUrl: env.FIREBASE_DATABASE_URL || '',
    firebaseServiceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    ai: {
      provider: (env.AI_PROVIDER as AiProvider) || 'openai',
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL || '',
      baseUrl: env.AI_BASE_URL || '',
      embeddings: env.EMBEDDINGS_PROVIDER || 'auto',
    },
    whatsapp: {
      token: env.WHATSAPP_TOKEN || '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || 'duty-verify',
      webhookSecret: env.WHATSAPP_WEBHOOK_SECRET || '',
    },
    smtpUrl: env.SMTP_URL || '',
    emailFrom: env.EMAIL_FROM || 'Duty <hello@duty.local>',
    currency: env.DUTY_CURRENCY || 'USD',
    autoreply: bool(env.AUTOREPLY, true),
    escalationThreshold: num(env.ESCALATION_THRESHOLD, 0.35),
    dataDir,
  };
}

export function defaultModelFor(provider: AiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-3-5-sonnet-latest';
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'ollama':
      return 'llama3.1';
    default:
      return 'gpt-4o-mini';
  }
}

export function defaultBaseUrlFor(provider: AiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

export function resolveModel(config: AppConfig): string {
  return config.ai.model || defaultModelFor(config.ai.provider);
}

export function resolveBaseUrl(config: AppConfig): string {
  return (config.ai.baseUrl || defaultBaseUrlFor(config.ai.provider)).replace(/\/$/, '');
}

export function ensureDataDir(config: AppConfig): void {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
}

export const isAiConfigured = (config: AppConfig): boolean =>
  Boolean(config.ai.apiKey) || config.ai.provider === 'ollama';
