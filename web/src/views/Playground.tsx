import React, { useRef, useState } from 'react';
import { Send, Sparkles, RotateCcw, Terminal } from 'lucide-react';
import { client, type AgentTurn, type ChannelKind } from '../lib/api';
import { pct, clock } from '../lib/format';
import { Panel, Chip, Field, useToast } from '../components/ui';

interface Bubble {
  id: number;
  role: 'customer' | 'agent';
  text: string;
  turn?: AgentTurn;
  at: string;
}

const CHANNELS: ChannelKind[] = ['webchat', 'whatsapp', 'api', 'mcp'];

const SUGGESTIONS = [
  'Hi! What do you sell?',
  'How much is the Ethiopia Yirgacheffe?',
  'I want to order two bags of Ethiopian beans',
  'confirm',
  'Where is my order DTY-20260101-0000?',
  'This is late and I want a refund',
];

/**
 * Playground — talk to the live agent exactly as a customer would, and watch the
 * structured decisions it makes (intent, confidence, orders, upsell offers).
 */
export function PlaygroundView() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [channel, setChannel] = useState<ChannelKind>('webchat');
  const [externalId, setExternalId] = useState('playground-1');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const counter = useRef(0);

  const send = async (text: string) => {
    if (!text.trim()) return;
    const at = new Date().toISOString();
    setBubbles((current) => [...current, { id: ++counter.current, role: 'customer', text, at }]);
    setDraft('');
    setSending(true);
    try {
      const turn = await client.agentMessage(text, `${channel}:${externalId}`);
      setBubbles((current) => [
        ...current,
        { id: ++counter.current, role: 'agent', text: turn.reply, turn, at: new Date().toISOString() },
      ]);
    } catch (error) {
      toast((error as Error).message, 'bad');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid split">
      <Panel
        title={
          <span className="row" style={{ gap: 8 }}>
            <Terminal size={14} /> Live agent
          </span>
        }
        action={
          <button className="btn tiny ghost" onClick={() => setBubbles([])}>
            <RotateCcw size={12} /> Clear
          </button>
        }
        tight
      >
        <div className="thread" style={{ minHeight: 420, maxHeight: 520, overflowY: 'auto' }}>
          {bubbles.length === 0 && (
            <div className="empty">
              Say something to Duty. Everything below runs the real agent — same code path as WhatsApp.
            </div>
          )}
          {bubbles.map((bubble) => (
            <div key={bubble.id} className={`msg ${bubble.role === 'agent' ? 'out' : ''}`}>
              <div className="msg-meta">
                {bubble.role} · {clock(bubble.at)}
              </div>
              {bubble.text}
              {bubble.turn && bubble.turn.actions.length > 0 && (
                <div className="msg-actions">
                  {bubble.turn.actions.map((action, index) => (
                    <Chip
                      key={index}
                      tone={action.kind === 'offer_upsell' ? 'ember' : action.kind === 'escalate' ? 'danger' : 'sky'}
                    >
                      <Sparkles size={9} /> {action.label}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid var(--line-soft)' }}>
          <div className="row" style={{ gap: 8 }}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) void send(draft);
              }}
              placeholder="Message Duty…"
            />
            <button className="btn primary" disabled={sending || !draft.trim()} onClick={() => send(draft)}>
              <Send size={13} /> Send
            </button>
          </div>
        </div>
      </Panel>

      <div className="stack">
        <Panel title="Session">
          <div className="grid cols-2" style={{ gap: 12 }}>
            <Field label="Channel">
              <select value={channel} onChange={(event) => setChannel(event.target.value as ChannelKind)}>
                {CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer id" hint="Change it to start a new customer thread">
              <input value={externalId} onChange={(event) => setExternalId(event.target.value)} />
            </Field>
          </div>
        </Panel>

        <Panel title="Try these">
          <div className="btn-row">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} className="btn tiny ghost" onClick={() => send(suggestion)} disabled={sending}>
                {suggestion}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Last decision">
          {(() => {
            const last = [...bubbles].reverse().find((bubble) => bubble.turn)?.turn;
            if (!last) return <div className="empty">No turn yet.</div>;
            return (
              <div className="stack-sm">
                <div className="row" style={{ gap: 8 }}>
                  <Chip tone="ember">intent: {last.intent}</Chip>
                  <Chip tone={last.escalated ? 'danger' : 'moss'}>{last.escalated ? 'escalated' : 'handled'}</Chip>
                </div>
                <div className="stack-sm" style={{ gap: 5 }}>
                  <div className="row between">
                    <span className="eyebrow">Confidence</span>
                    <span className="numeric">{pct(last.confidence, 0)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${last.confidence * 100}%` }} />
                  </div>
                </div>
                <div className="kv">
                  <dt>Sentiment</dt>
                  <dd className="numeric">{last.sentiment.toFixed(2)}</dd>
                  <dt>Conversation</dt>
                  <dd className="mono" style={{ fontSize: 11 }}>{last.conversationId}</dd>
                  <dt>Orders</dt>
                  <dd className="mono" style={{ fontSize: 11 }}>{last.orderIds.join(', ') || 'none'}</dd>
                </div>
              </div>
            );
          })()}
        </Panel>
      </div>
    </div>
  );
}
