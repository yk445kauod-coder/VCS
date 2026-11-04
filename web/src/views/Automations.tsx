import React, { useState } from 'react';
import { Play, Mail, Clock, Zap } from 'lucide-react';
import { client } from '../lib/api';
import { money } from '../lib/format';
import { Panel, Chip, Field, useToast, Empty } from '../components/ui';

/**
 * The revenue-ops automations merchants actually run on a schedule. Each one maps
 * to a REST endpoint that the OpenHands automation plugin calls too, so the same
 * logic runs whether you press the button or a cron fires it.
 */
export function AutomationsView() {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ label: string; detail: string; tone: 'ok' | 'bad' | 'info' }>>([]);
  const [email, setEmail] = useState('');
  const toast = useToast();

  const run = async (label: string, action: () => Promise<string>) => {
    setBusy(label);
    try {
      const detail = await action();
      setResults((current) => [{ label, detail, tone: 'ok' }, ...current]);
      toast(detail, 'ok');
    } catch (error) {
      const detail = (error as Error).message;
      setResults((current) => [{ label, detail, tone: 'bad' }, ...current]);
      toast(detail, 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="grid cols-3">
        <Panel
          title={<span className="row" style={{ gap: 8 }}><Zap size={14} /> Recover abandoned carts</span>}
          delay={1}
        >
          <div className="stack-sm">
            <p className="muted" style={{ fontSize: 13 }}>
              Finds draft orders that went quiet and messages the customer with a nudge — plus the next best add-on.
              Run it on a schedule (hourly is typical).
            </p>
            <div className="btn-row">
              <button
                className="btn"
                disabled={busy === 'preview'}
                onClick={() =>
                  run('Preview follow-ups', async () => {
                    const result = await client.runFollowups(true);
                    return result.sent === 0
                      ? 'No abandoned carts need a nudge right now'
                      : `${result.sent} cart(s) would be recovered — worth ${money(
                          result.results.reduce((sum, row) => sum + Number((row as { expectedRevenue?: number }).expectedRevenue ?? 0), 0),
                        )}`;
                  })
                }
              >
                <Play size={12} /> Preview
              </button>
              <button
                className="btn primary"
                disabled={busy === 'send'}
                onClick={() =>
                  run('Send follow-ups', async () => {
                    const result = await client.runFollowups(false);
                    return `Sent ${result.sent} follow-up message(s)`;
                  })
                }
              >
                Send now
              </button>
            </div>
          </div>
        </Panel>

        <Panel title={<span className="row" style={{ gap: 8 }}><Mail size={14} /> Daily revenue brief</span>} delay={2}>
          <div className="stack-sm">
            <p className="muted" style={{ fontSize: 13 }}>
              Generates yesterday's numbers with a written briefing and the single best next action. Optionally emails it.
            </p>
            <Field label="Email (optional)" hint="Needs SMTP_URL configured on the server">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@your-shop.com" />
            </Field>
            <button
              className="btn primary"
              disabled={busy === 'brief'}
              onClick={() =>
                run('Daily brief', async () => {
                  const result = await client.sendDailyReport(email || undefined);
                  return result.delivered ? `Brief emailed to ${email}` : 'Brief generated';
                })
              }
            >
              <Mail size={12} /> Generate & send
            </button>
          </div>
        </Panel>

        <Panel title={<span className="row" style={{ gap: 8 }}><Clock size={14} /> Scheduling it</span>} delay={3}>
          <div className="stack-sm">
            <p className="muted" style={{ fontSize: 13 }}>
              Duty ships an OpenHands automation plugin that calls these endpoints on a cron. Deploy it once and the
              revenue ops run themselves.
            </p>
            <pre className="block">{`# hourly cart recovery
curl -X POST $DUTY_URL/api/automation/followups \\
  -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"dryRun": false}'

# daily brief at 07:00
curl -X POST $DUTY_URL/api/automation/daily-report \\
  -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"days": 1}'`}</pre>
          </div>
        </Panel>
      </div>

      <Panel title="Run history" tight>
        {results.length === 0 ? (
          <Empty>Nothing run in this session yet.</Empty>
        ) : (
          results.map((result, index) => (
            <div className="list-row" key={index}>
              <span className="cell-strong" style={{ fontSize: 13 }}>{result.label}</span>
              <div className="row" style={{ gap: 10 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>{result.detail}</span>
                <Chip tone={result.tone === 'ok' ? 'moss' : result.tone === 'bad' ? 'danger' : ''}>
                  {result.tone === 'ok' ? 'done' : 'failed'}
                </Chip>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
