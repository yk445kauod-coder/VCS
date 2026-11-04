import React, { useEffect, useRef, useState } from 'react';
import { Globe, FileText, Trash2, RefreshCw, Upload, HelpCircle, Brain } from 'lucide-react';
import { client, type KnowledgeSummary, type Tenant } from '../lib/api';
import { relative } from '../lib/format';
import { Panel, Chip, Loading, Empty, Field, useToast, KeyValue } from '../components/ui';

export function BrainView() {
  const [documents, setDocuments] = useState<KnowledgeSummary[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [faq, setFaq] = useState('What are your shipping times? | Standard delivery is 3-5 business days.\n');
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([client.knowledge(), client.settings()])
      .then(([knowledge, settings]) => {
        setDocuments(knowledge.items);
        setTenant(settings.tenant);
      })
      .catch((error) => toast(error.message, 'bad'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const guard = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await action();
      load();
    } catch (error) {
      toast((error as Error).message, 'bad');
    } finally {
      setBusy(null);
    }
  };

  const ingestWebsite = () =>
    guard('website', async () => {
      if (!url) throw new Error('Enter a website URL first');
      const result = await client.ingestWebsite(url, 10);
      toast(`Read ${result.pages} pages, created ${result.documents} documents`, 'ok');
      setUrl('');
    });

  const ingestText = () =>
    guard('text', async () => {
      if (!title || !text) throw new Error('Give the document a title and some content');
      await client.ingestText(title, text);
      toast('Knowledge added', 'ok');
      setTitle('');
      setText('');
    });

  const ingestFaq = () =>
    guard('faq', async () => {
      const entries = faq
        .split('\n')
        .map((line) => line.split('|'))
        .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
        .map((parts) => ({ question: parts[0].trim(), answer: parts[1].trim() }));
      if (!entries.length) throw new Error('Use one "question | answer" per line');
      await client.ingestFaq(entries);
      toast(`Added ${entries.length} FAQ entries`, 'ok');
    });

  const upload = (file: File) =>
    guard('upload', async () => {
      const result = await client.uploadKnowledge(file);
      toast(`Indexed ${file.name} into ${result.chunks} chunks`, 'ok');
    });

  return (
    <div className="stack">
      <Panel
        title={
          <span className="row" style={{ gap: 8 }}>
            <Brain size={14} /> What Duty knows about the business
          </span>
        }
        action={
          <button
            className="btn tiny"
            disabled={busy === 'profile'}
            onClick={() => guard('profile', async () => {
              const result = await client.refreshProfile();
              toast(result.applied ? `Profile rebuilt (${result.source})` : 'Nothing to learn from yet', result.applied ? 'ok' : 'bad');
            })}
          >
            <RefreshCw size={12} /> Rebuild profile
          </button>
        }
      >
        {tenant ? (
          <div className="grid cols-2">
            <div className="stack-sm">
              <div className="eyebrow">Business summary Duty uses in every reply</div>
              <p style={{ fontSize: 13.5 }}>{tenant.about ?? 'No profile yet — ingest your website and Duty will write one.'}</p>
              <div className="row" style={{ gap: 6 }}>
                <Chip tone="ember">tone: {tenant.tone ?? 'friendly'}</Chip>
                <Chip>{tenant.currency}</Chip>
                {tenant.websiteUrl && <Chip tone="sky">{tenant.websiteUrl}</Chip>}
              </div>
            </div>
            <KeyValue
              items={[
                ['Documents', String(documents.length)],
                ['Chunks indexed', String(documents.reduce((sum, document) => sum + document.chunks, 0))],
                ['Characters', documents.reduce((sum, document) => sum + document.characters, 0).toLocaleString()],
                ['Profile source', String((tenant.settings as Record<string, unknown>)?.profileSource ?? 'n/a')],
                ['Goals', ((tenant.settings?.goals as string[]) ?? []).join(', ') || 'none set'],
              ]}
            />
          </div>
        ) : (
          <Loading />
        )}
      </Panel>

      <div className="grid cols-3">
        <Panel title="Learn from a website" delay={1}>
          <div className="stack-sm">
            <Field label="Website URL" hint="Duty crawls same-domain pages and writes a business profile.">
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-shop.com" />
            </Field>
            <button className="btn primary" onClick={ingestWebsite} disabled={busy === 'website'}>
              <Globe size={13} /> {busy === 'website' ? 'Crawling…' : 'Crawl & learn'}
            </button>
          </div>
        </Panel>

        <Panel title="Upload files" delay={2}>
          <div className="stack-sm">
            <p className="muted" style={{ fontSize: 13 }}>
              Drop in policies, price lists, product sheets or scripts (.txt, .md, .csv, .json).
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.csv,.json,.html,.xml"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
            <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy === 'upload'}>
              <Upload size={13} /> {busy === 'upload' ? 'Indexing…' : 'Choose a file'}
            </button>
          </div>
        </Panel>

        <Panel title="Paste knowledge or FAQs" delay={3}>
          <div className="stack-sm">
            <Field label="Title">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Shipping policy" />
            </Field>
            <textarea
              style={{ minHeight: 78 }}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste any text Duty should know…"
            />
            <button className="btn" onClick={ingestText} disabled={busy === 'text'}>
              <FileText size={13} /> Add knowledge
            </button>
            <div className="divider" />
            <Field label="FAQ" hint="One “question | answer” per line">
              <textarea style={{ minHeight: 66 }} value={faq} onChange={(event) => setFaq(event.target.value)} />
            </Field>
            <button className="btn ghost" onClick={ingestFaq} disabled={busy === 'faq'}>
              <HelpCircle size={13} /> Add FAQs
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="Knowledge base" tight>
        {loading ? (
          <Loading />
        ) : documents.length === 0 ? (
          <Empty>Nothing ingested yet. Duty answers from your catalogue and general courtesy until you teach it more.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Chunks</th>
                <th style={{ textAlign: 'right' }}>Size</th>
                <th>Added</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <div className="cell-strong">{document.title}</div>
                    {document.url && (
                      <a className="faint mono" style={{ fontSize: 11 }} href={document.url} target="_blank" rel="noreferrer">
                        {document.url}
                      </a>
                    )}
                  </td>
                  <td><Chip tone={document.source === 'website' ? 'sky' : document.source === 'faq' ? 'brass' : ''}>{document.source}</Chip></td>
                  <td className="numeric" style={{ textAlign: 'right' }}>{document.chunks}</td>
                  <td className="numeric" style={{ textAlign: 'right' }}>{document.characters.toLocaleString()}</td>
                  <td className="faint" style={{ fontSize: 12 }}>{relative(document.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn ghost tiny"
                      onClick={() => guard('delete', async () => {
                        await client.removeKnowledge(document.id);
                        toast('Document removed', 'ok');
                      })}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
