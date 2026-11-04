import type { LLMProvider } from './provider.js';

const DIM = 256;

/**
 * Deterministic local embedding via feature hashing. Not semantic, but good
 * enough for keyword-ish retrieval and it guarantees Duty works with no API key
 * and no extra model download.
 */
export function hashEmbed(text: string, dim = DIM): number[] {
  const vector = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const h = fnv1a(token);
    const index = h % dim;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    vector[index] += sign * (1 + Math.log(1 + token.length));
  }
  return normalize(vector);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i += 1) dot += a[i] * b[i];
  return dot;
}

export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const hashEmbedder: Embedder = {
  name: 'hash',
  async embed(texts) {
    return texts.map((text) => hashEmbed(text));
  },
};

/** Use the provider's embeddings when available, otherwise fall back to hashing. */
export function createEmbedder(provider: LLMProvider | null, preference = 'auto'): Embedder {
  if (preference === 'hash' || !provider) return hashEmbedder;
  if (preference === 'auto' && provider.name === 'anthropic') return hashEmbedder;
  return {
    name: `${provider.name}-embeddings`,
    async embed(texts) {
      try {
        const vectors = await provider.embed(texts);
        return vectors.map((vector) => normalize(vector));
      } catch {
        return texts.map((text) => hashEmbed(text));
      }
    },
  };
}
