import React, { useEffect, useState } from 'react';
import { FileBarChart, Send, RefreshCw } from 'lucide-react';
import { client, type Overview, type Report } from '../lib/api';
import { money, pct, relative } from '../lib/format';
import { Panel, Chip, Loading, Empty, Sparkline, Field, useToast } from '../components/ui';

export function AnalyticsView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const toast = useToast();

  const load = () => {
    Promise.all([client.overview(30), client.reports()])
      .then(([data, reportList]) => {
        setOverview(data);
        setReports(reportList.items);
        setOpen(reportList.items[0] ?? null);
      })
      .catch((error) => toast(error.message, 'bad'));
  };

  useEffect(load, []);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await client.generateReport(30, 'markdown');
      toast('Report generated', 'ok');
      setOpen(result.report);
      load();
    } catch (error) {
      toast((error as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const mail = async () => {
    setBusy(true);
    try {
      const result = await client.sendDailyReport(email || undefined);
      toast(result.delivered ? `Report emailed to ${email}` : 'Report generated (set SMTP_URL to email it)', result.delivered ? 'ok' : 'bad');
    } catch (error) {
      toast((error as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (!overview) return <Loading label="Crunching numbers" />;
  const { metrics } = overview;
  const currency = overview.currency;

  return (
    <div className="stack">
      <div className="grid cols-4">
        <div className="stat enter">
          <div className="stat-label">Gross revenue · 30d</div>
          <div className="stat-value numeric small">{money(metrics.grossRevenue, currency)}</div>
        </div>
        <div className="stat enter enter-1">
          <div className="stat-label">Pipeline value</div>
          <div className="stat-value numeric small" style={{ color: 'var(--ember-soft)' }}>
            {money(metrics.pipelineValue, currency)}
          </div>
        </div>
        <div className="stat enter enter-2">
          <div className="stat-label">Upsell lift</div>
          <div className="stat-value numeric small" style={{ color: 'var(--moss)' }}>
            {money(metrics.upsellRevenue, currency)}
          </div>
          <div className="stat-foot">{pct(metrics.upsellAcceptanceRate)} acceptance</div>
        </div>
        <div className="stat enter enter-3">
          <div className="stat-label">AOV</div>
          <div className="stat-value numeric small">{money(metrics.averageOrderValue, currency)}</div>
        </div>
      </div>

      <Panel
        title="Generate a report"
        action={
          <div className="btn-row">
            <button className="btn tiny" onClick={generate} disabled={busy}>
              <RefreshCw size={12} /> {busy ? 'Working…' : 'Generate 30-day report'}
            </button>
          </div>
        }
      >
        <div className="grid cols-2">
          <div className="stack-sm">
            <div className="eyebrow">Revenue by day</div>
            <Sparkline points={overview.series.map((point) => point.revenue)} height={78} />
          </div>
          <div className="stack-sm">
            <div className="eyebrow">Email the daily brief</div>
            <Field label="Recipient" hint="Requires SMTP_URL. Leave blank to just generate.">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@your-shop.com" />
            </Field>
            <button className="btn primary" onClick={mail} disabled={busy}>
              <Send size={13} /> Send daily report
            </button>
          </div>
        </div>
      </Panel>

      <div className="grid split">
        <Panel title="Funnel" delay={1}>
          <div className="stack-sm">
            {[
              ['Conversations', overview.counts.conversations],
              ['Orders captured', metrics.orders],
              ['Paid orders', metrics.paidOrders],
              ['Upsell offers', metrics.upsellOffers],
              ['Upsell accepted', metrics.upsellAccepts],
            ].map(([label, value]) => {
              const max = Math.max(1, overview.counts.conversations, metrics.orders);
              return (
                <div key={String(label)} className="stack-sm" style={{ gap: 5 }}>
                  <div className="row between">
                    <span className="muted" style={{ fontSize: 12.5 }}>{label}</span>
                    <span className="numeric" style={{ fontSize: 12.5 }}>{value}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(2, (Number(value) / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Reports" delay={2} tight>
          {reports.length === 0 ? (
            <Empty>No reports yet — generate one above.</Empty>
          ) : (
            <>
              {reports.map((report) => (
                <button
                  key={report.id}
                  className="list-row"
                  style={{
                    width: '100%',
                    background: report.id === open?.id ? 'var(--ink-3)' : 'transparent',
                    border: 0,
                    borderBottom: '1px solid var(--line-soft)',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                  onClick={() => setOpen(report)}
                >
                  <div className="stack-sm" style={{ gap: 3 }}>
                    <span className="cell-strong row" style={{ gap: 7 }}>
                      <FileBarChart size={13} /> {report.title}
                    </span>
                    <span className="faint" style={{ fontSize: 11.5 }}>{relative(report.createdAt)}</span>
                  </div>
                  <Chip tone="ember">{report.kind}</Chip>
                </button>
              ))}
            </>
          )}
        </Panel>
      </div>

      {open && (
        <Panel title={open.title}>
          <p style={{ fontSize: 14, lineHeight: 1.7 }}>{open.narrative}</p>
          <div className="divider" />
          <div className="grid cols-4" style={{ gap: 12 }}>
            {Object.entries(open.metrics)
              .filter(([key]) => !['orders', 'paidOrders'].includes(key))
              .slice(0, 8)
              .map(([key, value]) => (
                <div key={key}>
                  <div className="eyebrow">{key}</div>
                  <div className="numeric" style={{ fontSize: 16 }}>
                    {/revenue|value|aov|discount|average/i.test(key) ? money(value, currency) : pct(value, 1)}
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
