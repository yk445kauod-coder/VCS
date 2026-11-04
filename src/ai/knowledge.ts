import { createHash } from 'node:crypto';
import type { KnowledgeChunk, KnowledgeDocument } from '../core/types.js';
import { newId, nowIso } from '../core/ids.js';
import { createLogger } from '../core/logger.js';
import { cosine } from './embeddings.js';
import type { Embedder } from './embeddings.js';

const log = createLogger('knowledge');

export interface ChunkOptions {
  /** Target characters per chunk. */
  size?: number;
  overlap?: number;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const size = options.size ?? 900;
  const overlap = options.overlap ?? 120;
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).length > size && buffer) {
      chunks.push(buffer.trim());
      buffer = buffer.slice(Math.max(0, buffer.length - overlap));
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    while (buffer.length > size * 1.6) {
      chunks.push(buffer.slice(0, size).trim());
      buffer = buffer.slice(size - overlap);
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.filter(Boolean);
}

export async function buildChunks(text: string, embedder: Embedder, options?: ChunkOptions): Promise<KnowledgeChunk[]> {
  const pieces = chunkText(text, options);
  if (!pieces.length) return [];
  const embeddings = await embedder.embed(pieces);
  return pieces.map((piece, index) => ({
    id: createHash('sha1').update(`${index}:${piece}`).digest('hex').slice(0, 16),
    text: piece,
    embedding: embeddings[index],
  }));
}

export interface RetrievedChunk {
  documentId: string;
  documentTitle: string;
  text: string;
  score: number;
  url?: string;
}

/** Cosine-similarity retrieval over all knowledge chunks for a tenant. */
export async function retrieve(
  documents: KnowledgeDocument[],
  query: string,
  embedder: Embedder,
  topK = 4,
): Promise<RetrievedChunk[]> {
  if (!documents.length) return [];
  const [queryVector] = await embedder.embed([query]);
  const scored: RetrievedChunk[] = [];
  for (const document of documents) {
    for (const chunk of document.chunks) {
      if (!chunk.embedding) continue;
      scored.push({
        documentId: document.id,
        documentTitle: document.title,
        text: chunk.text,
        url: document.url,
        score: cosine(queryVector, chunk.embedding),
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  // Hash embeddings produce small non-zero scores for unrelated text, so a low
  // floor admits noise. 0.18 keeps retrieval precise; unrelated queries then
  // fall through to the catalogue-driven reply instead of a random policy dump.
  const results = scored.slice(0, topK).filter((chunk) => chunk.score >= 0.18);
  log.debug(`retrieved ${results.length} chunks for "${query.slice(0, 60)}"`);
  return results;
}

export function makeDocument(input: {
  id: string;
  tenantId: string;
  title: string;
  source: KnowledgeDocument['source'];
  content: string;
  url?: string;
  chunks: KnowledgeChunk[];
  metadata?: Record<string, unknown>;
}): KnowledgeDocument {
  const now = nowIso();
  return {
    id: input.id,
    tenantId: input.tenantId,
    title: input.title,
    source: input.source,
    url: input.url,
    content: input.content,
    chunks: input.chunks,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
