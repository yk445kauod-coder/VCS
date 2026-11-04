import React, { useEffect, useState } from 'react';
import { Copy, Save, Server, Webhook, Bot, Database } from 'lucide-react';
import { client, type RuntimeStatus, type Tenant } from '../lib/api';
import { Panel, Chip, Loading, Field, useToast, KeyValue } from '../components/ui';

export function SettingsView({ token }: { token: string }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [runtime, setRuntime] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    about: '',
    tone: '',
    currency: '',
    websiteUrl: '',
    timezone: '',
    businessHours: '',
    goals: '',
    escalationThreshold: 0.35,
    outboundWebhookUrl: '',
  });
  const toast = useToast();

  const load = () => {
    Promise.all([client.settings(), client.health()])
      .then(([settings, health]) => {
        setTenant(settings.tenant);
        setRuntime(settings.runtime);
        setStatus(health);
        setForm({
          name: settings.tenant.name ?? '',
          about: settings.tenant.about ?? '',
          tone: settings.tenant.tone ?? '',
          currency: settings.tenant.currency ?? 'USD',
          websiteUrl: settings.tenant.websiteUrl ?? '',
          timezone: String(settings.tenant.settings?.timezone ?? 'UTC'),
          businessHours: String(settings.tenant.settings?.businessHours ?? ''),
          goals: ((settings.tenant.settings?.goals as string[]) ?? []).join(', '),
          escalationThreshold: Number(settings.tenant.settings?.escalationThreshold ?? 0.35),
          outboundWebhookUrl: String(settings.tenant.settings?.outboundWebhookUrl ?? ''),
        });
      })
      .catch((error) => toast(error.message, 'bad'));
  };

  useEffect(load, []);

  const save = async () => {
    setBusy(true);
    try {
      await client.patchSettings({
        ...form,
        goals: form.goals ? form.goals.split(',').map((goal) => goal.trim()).filter(Boolean) : [],
        websiteUrl: form.websiteUrl || undefined,
        outboundWebhookUrl: form.outboundWebhookUrl || undefined,
      });
      toast('Settings saved', 'ok');
      load();
    } catch (error) {
      toast((error as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast('Copied to clipboard', 'ok');
  };

  if (!tenant) return <Loading label="Loading settings" />;
  const base = String((runtime?.publicUrl as string) ?? window.location.origin);
  const embed = `<script src="${base}/widget/duty-widget.js" data-duty-key="YOUR_PUBLIC_KEY" async></script>`;

  return (
    <div className="stack">
      <div className="grid split">
        <Panel
          title="Business profile"
          action={
            <button className="btn primary tiny" onClick={save} disabled={busy}>
              <Save size={12} /> {busy ? 'Saving…' : 'Save'}
            </button>
          }
        >
          <div className="stack-sm">
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label="Business name">
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Currency">
                <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
              </Field>
            </div>
            <Field label="What the business does" hint="Injected into every agent prompt.">
              <textarea value={form.about} onChange={(event) => setForm({ ...form, about: event.target.value })} />
            </Field>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label="Tone of voice">
                <input value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} />
              </Field>
              <Field label="Website">
                <input value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} />
              </Field>
              <Field label="Timezone">
                <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} />
              </Field>
              <Field label="Business hours">
                <input value={form.businessHours} onChange={(event) => setForm({ ...form, businessHours: event.target.value })} placeholder="09:00-18:00" />
              </Field>
            </div>
            <Field label="Commercial goals" hint="Comma separated. The agent optimises for these.">
              <input value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} />
            </Field>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label={`Escalate below confidence: ${form.escalationThreshold.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.escalationThreshold}
                  onChange={(event) => setForm({ ...form, escalationThreshold: Number(event.target.value) })}
                />
              </Field>
              <Field label="Mirror replies to your own webhook" hint="Zapier, n8n, your CRM…">
                <input value={form.outboundWebhookUrl} onChange={(event) => setForm({ ...form, outboundWebhookUrl: event.target.value })} placeholder="https://hooks.zapier.com/…" />
              </Field>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Runtime">
            {status ? (
              <KeyValue
                items={[
                  ['Status', <Chip key="s" tone={status.status === 'ok' ? 'moss' : 'danger'} dot>{status.status}</Chip>],
                  ['Storage', <Chip key="db" tone="sky"><Database size={10} /> {status.store.kind}</Chip>],
                  ['AI', <Chip key="ai" tone={status.ai.provider === 'local-brain' ? 'brass' : 'ember'}><Bot size={10} /> {status.ai.provider}</Chip>],
                  ['Model', status.ai.model ?? 'deterministic rules'],
                  ['Version', status.version],
                ]}
              />
            ) : (
              <Loading />
            )}
            <div className="divider" />
            <div className="stack-sm">
              {status?.channels.map((channel) => (
                <div className="row between" key={channel.kind}>
                  <span className="muted" style={{ fontSize: 12.5 }}>{channel.kind}</span>
                  <Chip tone={channel.enabled ? 'moss' : ''} dot>{channel.enabled ? 'connected' : 'not configured'}</Chip>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={<span className="row" style={{ gap: 8 }}><Server size={14} /> Bring your own infrastructure</span>}>
            <div className="stack-sm">
              <p className="muted" style={{ fontSize: 12.5 }}>
                Duty reads its database and AI provider from environment variables, so each deployment can use its own
                Postgres, Supabase, Firebase or local SQLite, and its own model key.
              </p>
              <pre className="block">{`DUTY_DB=${status?.store.kind ?? 'sqlite'}
DATABASE_URL=postgres://…        # Neon / Supabase / RDS
SUPABASE_URL=…                   # or Supabase REST
FIREBASE_DATABASE_URL=…          # or Firebase RTDB
AI_PROVIDER=openai|anthropic|gemini|openrouter|ollama
AI_API_KEY=…                     # your key, never ours`}</pre>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid cols-3">
        <Panel title={<span className="row" style={{ gap: 8 }}><Webhook size={14} /> Webhooks</span>} delay={1}>
          <div className="stack-sm">
            {[
              ['WhatsApp', `${base}/webhooks/whatsapp`],
              ['Generic inbound', `${base}/webhooks/inbound`],
              ['Live events (SSE)', `${base}/api/events?token=${token}`],
            ].map(([label, value]) => (
              <div key={label} className="stack-sm" style={{ gap: 4 }}>
                <span className="eyebrow">{label}</span>
                <div className="row" style={{ gap: 6 }}>
                  <code className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{value}</code>
                  <button className="btn ghost tiny" onClick={() => copy(value)}>
                    <Copy size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Website widget" delay={2}>
          <div className="stack-sm">
            <p className="muted" style={{ fontSize: 12.5 }}>
              Paste this before <span className="mono">&lt;/body&gt;</span> on any site to add a Duty chat bubble.
            </p>
            <pre className="block">{embed}</pre>
            <button className="btn tiny" onClick={() => copy(embed)}>
              <Copy size={11} /> Copy snippet
            </button>
          </div>
        </Panel>

        <Panel title="MCP & API" delay={3}>
          <div className="stack-sm">
            <span className="eyebrow">MCP (stdio)</span>
            <pre className="block">{`{
  "mcpServers": {
    "duty": {
      "command": "node",
      "args": ["--import","tsx","src/mcp/stdio.ts"],
      "env": { "ADMIN_TOKEN": "…" }
    }
  }
}`}</pre>
            <span className="eyebrow">REST</span>
            <pre className="block">{`curl -H "x-admin-token: ${token}" \\
  ${base}/api/overview`}</pre>
          </div>
        </Panel>
      </div>
    </div>
  );
}
