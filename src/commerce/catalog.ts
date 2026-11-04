import type { Store } from '../storage/index.js';
import type { Product } from '../core/types.js';
import { newId, nowIso, slugify } from '../core/ids.js';
import { badRequest } from '../core/errors.js';

export interface ProductInput {
  tenantId: string;
  sku?: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  tags?: string[];
  aliases?: string[];
  stock?: number;
  active?: boolean;
  upsells?: Product['upsells'];
  metadata?: Record<string, unknown>;
}

export class CatalogService {
  constructor(
    private readonly store: Store,
    private readonly defaultCurrency = 'USD',
  ) {}

  async list(tenantId: string, options: { search?: string; limit?: number } = {}): Promise<Product[]> {
    return this.store.products.list({
      where: { tenantId },
      search: options.search
        ? { fields: ['name', 'description', 'sku', 'category', 'tags'], term: options.search }
        : undefined,
      limit: options.limit ?? 200,
      orderBy: 'createdAt',
      order: 'desc',
    });
  }

  async get(tenantId: string, id: string): Promise<Product | null> {
    const product = await this.store.products.get(id);
    if (!product || product.tenantId !== tenantId) return null;
    return product;
  }

  async findBySku(tenantId: string, sku: string): Promise<Product | null> {
    const matches = await this.store.products.list({ where: { tenantId, sku }, limit: 1 });
    return matches[0] ?? null;
  }

  async findByName(tenantId: string, name: string): Promise<Product | null> {
    const matches = await this.store.products.list({
      where: { tenantId },
      search: { fields: ['name'], term: name },
      limit: 1,
    });
    return matches[0] ?? null;
  }

  async create(input: ProductInput): Promise<Product> {
    if (!input.name?.trim()) throw badRequest('Product name is required');
    if (!Number.isFinite(input.price) || input.price < 0) throw badRequest('price must be >= 0');
    const now = nowIso();
    const sku = input.sku?.trim() || slugify(input.name).toUpperCase().slice(0, 16);
    const product: Product = {
      id: newId('prd'),
      tenantId: input.tenantId,
      sku,
      name: input.name.trim(),
      description: input.description,
      price: Math.round(input.price),
      currency: input.currency || this.defaultCurrency,
      category: input.category,
      tags: input.tags ?? [],
      aliases: input.aliases ?? [],
      upsells: input.upsells ?? [],
      stock: input.stock,
      active: input.active ?? true,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    return this.store.products.put(product);
  }

  async update(tenantId: string, id: string, patch: Partial<ProductInput>): Promise<Product | null> {
    const existing = await this.get(tenantId, id);
    if (!existing) return null;
    const updated: Product = {
      ...existing,
      ...patch,
      tags: patch.tags ?? existing.tags,
      aliases: patch.aliases ?? existing.aliases ?? [],
      upsells: patch.upsells ?? existing.upsells,
      price: patch.price !== undefined ? Math.round(patch.price) : existing.price,
      id: existing.id,
      tenantId: existing.tenantId,
      updatedAt: nowIso(),
    };
    return this.store.products.put(updated);
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const existing = await this.get(tenantId, id);
    if (!existing) return false;
    return this.store.products.delete(id);
  }

  /**
   * Bulk import from a simple CSV. Columns:
   * `sku,name,price[,category,tags|][,aliases|]`
   *
   * Prices are given in major units (18.00 → 1800) because that is what a
   * merchant has in their spreadsheet; the `|` separator keeps commas free to
   * delimit columns.
   */
  async importCsv(tenantId: string, csv: string, currency?: string): Promise<Product[]> {
    const lines = csv.split(/\r?\n/).filter((line) => line.trim());
    const created: Product[] = [];
    const startIndex = /sku/i.test(lines[0] ?? '') ? 1 : 0;
    for (const line of lines.slice(startIndex)) {
      const [sku, name, price, category, tags, aliases] = line.split(',').map((cell) => cell.trim());
      if (!name || !price) continue;
      created.push(
        await this.create({
          tenantId,
          sku,
          name,
          price: Math.round(Number(price) * 100),
          currency,
          category: category || undefined,
          tags: tags ? tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
          aliases: aliases ? aliases.split('|').map((alias) => alias.trim()).filter(Boolean) : [],
        }),
      );
    }
    return created;
  }
}
