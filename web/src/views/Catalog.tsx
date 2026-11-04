import React, { useEffect, useState } from 'react';
import { Plus, Upload, Trash2, Pencil, Zap } from 'lucide-react';
import { client, type Product, type UpsellRule } from '../lib/api';
import { money, pct } from '../lib/format';
import { Panel, Chip, Loading, Empty, Search, Modal, Field, useToast } from '../components/ui';

const STRATEGIES: UpsellRule['strategy'][] = ['bundle', 'cross_sell', 'upgrade', 'quantity', 'renewal', 'win_back'];

const emptyDraft = {
  name: '',
  sku: '',
  description: '',
  price: '',
  category: '',
  tags: '',
  aliases: '',
};

export function CatalogView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [csv, setCsv] = useState('sku,name,price,category,tags\n');
  const toast = useToast();

  const load = () => {
    setLoading(true);
    client
      .products(term ? `?search=${encodeURIComponent(term)}` : '')
      .then((result) => setProducts(result.items))
      .catch((error) => toast(error.message, 'bad'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [term]);

  const submit = async () => {
    try {
      if (!draft.name || !draft.price) throw new Error('Name and price are required');
      const body = {
        name: draft.name,
        sku: draft.sku || undefined,
        description: draft.description || undefined,
        price: Math.round(Number(draft.price) * 100),
        category: draft.category || undefined,
        tags: draft.tags ? draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        aliases: draft.aliases ? draft.aliases.split(',').map((alias) => alias.trim()).filter(Boolean) : [],
      };
      if (editing) {
        await client.updateProduct(editing.id, body);
        toast('Product updated', 'ok');
      } else {
        await client.createProduct(body);
        toast('Product added to the catalogue', 'ok');
      }
      setEditing(null);
      setCreating(false);
      setDraft({ ...emptyDraft });
      load();
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  };

  const remove = async (product: Product) => {
    try {
      await client.deleteProduct(product.id);
      toast(`${product.name} removed`, 'ok');
      load();
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  };

  const runImport = async () => {
    try {
      const result = await client.importProducts(csv);
      toast(`Imported ${result.imported} products`, 'ok');
      setImporting(false);
      load();
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  };

  const withUpsells = products.filter((product) => product.upsells?.length).length;

  return (
    <div className="stack">
      <div className="grid cols-3">
        <div className="stat enter">
          <div className="stat-label">Products</div>
          <div className="stat-value numeric">{products.length}</div>
        </div>
        <div className="stat enter enter-1">
          <div className="stat-label">With upsell rules</div>
          <div className="stat-value numeric" style={{ color: 'var(--ember-soft)' }}>{withUpsells}</div>
          <div className="stat-foot">rules are what turn chats into bigger carts</div>
        </div>
        <div className="stat enter enter-2">
          <div className="stat-label">Average price</div>
          <div className="stat-value numeric small">
            {money(products.length ? products.reduce((sum, product) => sum + product.price, 0) / products.length : 0)}
          </div>
        </div>
      </div>

      <Panel
        title="Catalogue"
        tight
        action={
          <div className="btn-row">
            <button className="btn tiny" onClick={() => setImporting(true)}>
              <Upload size={12} /> Import CSV
            </button>
            <button
              className="btn primary tiny"
              onClick={() => {
                setDraft({ ...emptyDraft });
                setEditing(null);
                setCreating(true);
              }}
            >
              <Plus size={12} /> New product
            </button>
          </div>
        }
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <div className="search">
            <Search size={14} />
            <input placeholder="Search the catalogue…" value={term} onChange={(event) => setTerm(event.target.value)} />
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : products.length === 0 ? (
          <Empty>
            No products yet. Add them one by one, import a CSV, or let Duty learn them from your website in the Brain tab.
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th>Upsell rules</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="cell-strong">{product.name}</div>
                    <div className="faint mono" style={{ fontSize: 11 }}>{product.sku}</div>
                    {product.description && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 3, maxWidth: 380 }}>
                        {product.description.slice(0, 110)}
                      </div>
                    )}
                    {product.aliases?.length ? (
                      <div className="faint mono" style={{ fontSize: 10.5, marginTop: 4 }}>
                        aka {product.aliases.join(' · ')}
                      </div>
                    ) : null}
                  </td>
                  <td>{product.category ? <Chip>{product.category}</Chip> : <span className="faint">—</span>}</td>
                  <td className="numeric" style={{ textAlign: 'right' }}>{money(product.price, product.currency)}</td>
                  <td>
                    {product.upsells?.length ? (
                      <div className="row" style={{ gap: 5 }}>
                        {product.upsells.map((rule, index) => (
                          <Chip key={index} tone="ember">
                            <Zap size={9} /> {rule.strategy} → {rule.targetSku}
                            {rule.discountPercent ? ` −${rule.discountPercent}%` : ''}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="faint" style={{ fontSize: 12 }}>none</span>
                    )}
                  </td>
                  <td>
                    <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="btn ghost tiny"
                        onClick={() => {
                          setEditing(product);
                          setDraft({
                            name: product.name,
                            sku: product.sku,
                            description: product.description ?? '',
                            price: (product.price / 100).toString(),
                            category: product.category ?? '',
                            tags: product.tags.join(', '),
                            aliases: (product.aliases ?? []).join(', '),
                          });
                          setCreating(true);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button className="btn ghost tiny" onClick={() => remove(product)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {creating && (
        <Modal
          title={editing ? `Edit ${editing.name}` : 'New product'}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          footer={
            <>
              <button className="btn primary" onClick={submit}>
                {editing ? 'Save changes' : 'Add product'}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </button>
            </>
          }
        >
          <div className="grid cols-2">
            <Field label="Name">
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ethiopia Yirgacheffe 250g" />
            </Field>
            <Field label="SKU" hint="Leave blank to generate one">
              <input value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} placeholder="BEANS-ETH" />
            </Field>
            <Field label="Price (major units)" hint="e.g. 18.00">
              <input value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="18.00" />
            </Field>
            <Field label="Category">
              <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Beans" />
            </Field>
          </div>
          <Field label="Description" hint="Duty quotes this verbatim when customers ask — keep it accurate.">
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="single-origin, filter" />
          </Field>
          <Field
            label="Aliases"
            hint="Comma separated synonyms and other-language names. Customers can order using these, so “طاحونة” finds the grinder."
          >
            <input
              value={draft.aliases}
              onChange={(event) => setDraft({ ...draft, aliases: event.target.value })}
              placeholder="grinder, mill, طاحونة"
            />
          </Field>
        </Modal>
      )}

      {importing && (
        <Modal
          title="Import products from CSV"
          onClose={() => setImporting(false)}
          footer={
            <>
              <button className="btn primary" onClick={runImport}>
                Import
              </button>
              <button className="btn ghost" onClick={() => setImporting(false)}>
                Cancel
              </button>
            </>
          }
        >
          <p className="muted" style={{ fontSize: 13 }}>
            Header row is optional. Prices are in major units; tags are separated with <span className="mono">|</span>.
          </p>
          <textarea style={{ minHeight: 200 }} value={csv} onChange={(event) => setCsv(event.target.value)} />
        </Modal>
      )}
    </div>
  );
}
