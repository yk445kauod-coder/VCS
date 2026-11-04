import { assertPublicHttpUrl } from '../core/net.js';
import { createLogger } from '../core/logger.js';
import { newId, nowIso } from '../core/ids.js';
import { bus } from '../core/events.js';
import type { AppConfig } from '../core/config.js';
import type { Store } from '../storage/index.js';
import type { KnowledgeDocument } from '../core/types.js';
import type { Embedder } from '../ai/embeddings.js';
import type { LLMProvider } from '../ai/provider.js';
import {
  applyProfileToTenant,
  crawlWebsite,
  deriveBusinessProfile,
  ingestText,
  type IngestResult,
} from '../ai/brain.js';

const log = createLogger('ingest');

export interface IngestionDeps {
  store: Store;
  embedder: Embedder;
  provider: LLMProvider | null;
  config: AppConfig;
}

export interface WebsiteIngestOptions {
  maxPages?: number;
  /** When true, derive and store a business profile from what we crawled. */
  deriveProfile?: boolean;
}

/**
 * "Learn the business" service. Merchants point Duty at their website or drop
 * in files; everything becomes searchable knowledge the agent cites when it
 * answers customers.
 */
export class IngestionService {
  constructor(private readonly deps: IngestionDeps) {}

  async ingestFile(input: {
    tenantId: string;
    filename: string;
    content: string;
    mimeType?: string;
  }): Promise<IngestResult> {
    const title = input.filename.replace(/\.[a-z0-9]+$/i, '');
    const result = await ingestText({
      tenantId: input.tenantId,
      title,
      content: input.content,
      source: 'file',
      embedder: this.deps.embedder,
      metadata: { filename: input.filename, mimeType: input.mimeType },
    });
    await this.deps.store.knowledge.put(result.document);
    bus.emit('knowledge.ingested', {
      tenantId: input.tenantId,
      documentId: result.document.id,
      source: 'file',
    });
    return result;
  }

  async ingestText(input: { tenantId: string; title: string; content: string }): Promise<IngestResult> {
    const result = await ingestText({
      tenantId: input.tenantId,
      title: input.title,
      content: input.content,
      source: 'text',
      embedder: this.deps.embedder,
    });
    await this.deps.store.knowledge.put(result.document);
    bus.emit('knowledge.ingested', {
      tenantId: input.tenantId,
      documentId: result.document.id,
      source: 'text',
    });
    return result;
  }

  async ingestWebsite(
    tenantId: string,
    url: string,
    options: WebsiteIngestOptions = {},
  ): Promise<{ documents: KnowledgeDocument[]; profileApplied: boolean; pages: number }> {
    // Validate up front: a blocked target should explain itself, not look like
    // an empty site. `crawlWebsite` re-checks every redirect hop as well.
    await assertPublicHttpUrl(url);
    const pages = await crawlWebsite(url, { maxPages: options.maxPages ?? 8 });
    const documents: KnowledgeDocument[] = [];
    for (const page of pages) {
      const result = await ingestText({
        tenantId,
        title: page.title,
        content: page.text,
        source: 'website',
        url: page.url,
        embedder: this.deps.embedder,
      });
      documents.push(await this.deps.store.knowledge.put(result.document));
      bus.emit('knowledge.ingested', { tenantId, documentId: result.document.id, source: 'website' });
    }

    let profileApplied = false;
    if (options.deriveProfile !== false && pages.length) {
      const tenant = await this.deps.store.tenants.get(tenantId);
      if (tenant) {
        const corpus = pages.map((page) => `${page.title}\n${page.text}`).join('\n\n');
        const profile = await deriveBusinessProfile(corpus, this.deps.provider, tenant.name);
        const updated = await applyProfileToTenant(
          { ...tenant, websiteUrl: url },
          profile,
        );
        await this.deps.store.tenants.put({ ...updated, updatedAt: nowIso() });
        profileApplied = true;
        log.info(`derived business profile for ${tenant.name} (${profile.source})`);
      }
    }

    return { documents, profileApplied, pages: pages.length };
  }

  /** Re-derive the business profile from everything already ingested. */
  async refreshProfile(tenantId: string): Promise<{ applied: boolean; source: string }> {
    const tenant = await this.deps.store.tenants.get(tenantId);
    if (!tenant) return { applied: false, source: 'none' };
    const documents = await this.deps.store.knowledge.list({ where: { tenantId }, limit: 200 });
    const corpus = documents.map((document) => document.content).join('\n\n').slice(0, 20_000);
    if (!corpus.trim()) return { applied: false, source: 'none' };
    const profile = await deriveBusinessProfile(corpus, this.deps.provider, tenant.name);
    const updated = await applyProfileToTenant(tenant, profile);
    await this.deps.store.tenants.put({ ...updated, updatedAt: nowIso() });
    return { applied: true, source: profile.source };
  }

  async listDocuments(tenantId: string): Promise<KnowledgeDocument[]> {
    return this.deps.store.knowledge.list({ where: { tenantId }, limit: 200, orderBy: 'createdAt', order: 'desc' });
  }

  async removeDocument(tenantId: string, documentId: string): Promise<boolean> {
    const document = await this.deps.store.knowledge.get(documentId);
    if (!document || document.tenantId !== tenantId) return false;
    return this.deps.store.knowledge.delete(documentId);
  }

  async seedFaq(tenantId: string, entries: Array<{ question: string; answer: string }>): Promise<IngestResult> {
    const content = entries.map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`).join('\n\n');
    const result = await ingestText({
      tenantId,
      title: `FAQ ${newId('faq').slice(-6)}`,
      content,
      source: 'faq',
      embedder: this.deps.embedder,
    });
    await this.deps.store.knowledge.put(result.document);
    return result;
  }
}
