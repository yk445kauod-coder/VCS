import { newId } from '../core/ids.js';
import { createLogger } from '../core/logger.js';
import { makeDocument, buildChunks } from './knowledge.js';
import type { Embedder } from './embeddings.js';
import type { KnowledgeDocument, Tenant } from '../core/types.js';
import type { LLMProvider } from './provider.js';

const log = createLogger('brain');

export interface IngestResult {
  document: KnowledgeDocument;
  chunks: number;
  characters: number;
}

/** Turn a file buffer or raw text into a searchable knowledge document. */
export async function ingestText(input: {
  tenantId: string;
  title: string;
  content: string;
  source: KnowledgeDocument['source'];
  url?: string;
  embedder: Embedder;
  metadata?: Record<string, unknown>;
}): Promise<IngestResult> {
  const chunks = await buildChunks(input.content, input.embedder);
  const document = makeDocument({
    id: newId('doc'),
    tenantId: input.tenantId,
    title: input.title,
    source: input.source,
    content: input.content,
    url: input.url,
    chunks,
    metadata: input.metadata,
  });
  log.info(`ingested "${input.title}" (${input.source})`, {
    chunks: chunks.length,
    characters: input.content.length,
  });
  return { document, chunks: chunks.length, characters: input.content.length };
}

export function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const base = new URL(baseUrl);
  const regex = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], base);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (url.hostname !== base.hostname) continue;
      if (/\.(png|jpe?g|gif|svg|css|js|pdf|zip|mp4|webp|ico)$/i.test(url.pathname)) continue;
      url.hash = '';
      links.add(url.toString());
    } catch {
      /* ignore malformed links */
    }
  }
  return [...links];
}

export function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim().slice(0, 120) : fallback;
}

export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
}

/** Fetch a site and follow same-domain links, returning one merged document per page. */
export async function crawlWebsite(
  startUrl: string,
  options: CrawlOptions = {},
): Promise<Array<{ url: string; title: string; text: string }>> {
  const maxPages = options.maxPages ?? 8;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const pages: Array<{ url: string; title: string; text: string }> = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift() as string;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'DutyBot/1.0 (+https://duty.local)' },
      });
      clearTimeout(timer);
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('text/html')) continue;
      const html = await response.text();
      const text = extractReadableText(html);
      if (text.length > 200) {
        pages.push({ url, title: extractTitle(html, url), text });
      }
      for (const link of extractLinks(html, url)) {
        if (!visited.has(link) && queue.length + pages.length < maxPages * 3) queue.push(link);
      }
    } catch (error) {
      log.warn(`crawl failed for ${url}`, String(error));
    }
  }
  return pages;
}

export interface BusinessProfile {
  about: string;
  tone: string;
  offerings: string[];
  goals: string[];
  source: 'llm' | 'heuristic';
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'our', 'are', 'was', 'were',
  'will', 'can', 'all', 'any', 'has', 'have', 'not', 'but', 'they', 'their', 'them', 'about', 'into',
  'more', 'than', 'when', 'what', 'who', 'how', 'why', 'its', 'it', 'is', 'of', 'to', 'in', 'on',
]);

/** Heuristic keyword extraction used when no LLM is configured. */
export function topKeywords(text: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? []) {
    if (STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/** Build a business profile from ingested content, using the LLM when available. */
export async function deriveBusinessProfile(
  corpus: string,
  provider: LLMProvider | null,
  fallbackName = 'the business',
): Promise<BusinessProfile> {
  const excerpt = corpus.slice(0, 12_000);
  if (provider) {
    try {
      const result = await provider.complete({
        system:
          'You analyse a company\'s own website/files and produce a compact business profile. ' +
          'Answer with strict JSON only.',
        messages: [
          {
            role: 'user',
            content:
              `Here is the company's content:\n\n${excerpt}\n\n` +
              'Return JSON: {"about": string (2-4 sentences describing what they sell and to whom), ' +
              '"tone": string (how they should speak to customers), ' +
              '"offerings": string[] (up to 8 products/services found), ' +
              '"goals": string[] (up to 4 commercial goals that fit this business)}',
          },
        ],
        json: true,
        temperature: 0.2,
        maxTokens: 700,
      });
      const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
      return {
        about: String(parsed.about || '').slice(0, 1200),
        tone: String(parsed.tone || 'friendly, concise, helpful'),
        offerings: Array.isArray(parsed.offerings) ? parsed.offerings.map(String).slice(0, 8) : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals.map(String).slice(0, 4) : [],
        source: 'llm',
      };
    } catch (error) {
      log.warn('LLM profile derivation failed, using heuristic', String(error));
    }
  }
  const keywords = topKeywords(excerpt, 10);
  return {
    about:
      `Business knowledge base for ${fallbackName}. ` +
      `Key themes found in the ingested content: ${keywords.join(', ') || 'n/a'}.`,
    tone: 'friendly, concise, helpful',
    offerings: keywords.slice(0, 8),
    goals: ['increase revenue', 'answer customers fast', 'recover abandoned interest'],
    source: 'heuristic',
  };
}

export async function applyProfileToTenant(
  tenant: Tenant,
  profile: BusinessProfile,
): Promise<Tenant> {
  return {
    ...tenant,
    about: profile.about,
    tone: profile.tone,
    settings: {
      ...tenant.settings,
      goals: profile.goals.length ? profile.goals : tenant.settings.goals,
      profileSource: profile.source,
    },
    updatedAt: new Date().toISOString(),
  };
}
