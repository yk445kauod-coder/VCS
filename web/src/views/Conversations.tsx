import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, UserCheck, RotateCcw, Bot, Sparkles } from 'lucide-react';
import {
  client,
  subscribeToEvents,
  type Conversation,
  type Customer,
  type Message,
  type Order,
} from '../lib/api';
import { money, relative, statusTone, channelTone, clock, initials } from '../lib/format';
import { Panel, Chip, Loading, Empty, Search, useToast } from '../components/ui';

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  token: string;
}

export function ConversationsView({ selectedId, onSelect, token }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'escalated' | 'closed'>('all');
  const [term, setTerm] = useState('');
  const [thread, setThread] = useState<{
    conversation: Conversation;
    messages: Message[];
    customer: Customer;
    orders: Order[];
  } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const threadEnd = useRef<HTMLDivElement>(null);

  const loadList = () => {
    const query = filter === 'all' ? '' : `?status=${filter}`;
    client
      .conversations(query)
      .then((result) => setConversations(result.items))
      .catch((error) => toast(error.message, 'bad'));
  };

  useEffect(loadList, [filter]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    client
      .conversation(selectedId)
      .then(setThread)
      .catch((error) => toast(error.message, 'bad'));
  }, [selectedId, toast]);

  // Live updates: reload the list, and the open thread, as events arrive.
  useEffect(() => {
    return subscribeToEvents((event, payload) => {
      if (event.startsWith('message.') || event === 'conversation.escalated' || event.startsWith('order.')) {
        loadList();
        const conversationId = (payload as { conversationId?: string })?.conversationId;
        if (selectedId && (!conversationId || conversationId === selectedId)) {
          client.conversation(selectedId).then(setThread).catch(() => undefined);
        }
      }
    }, token);
  }, [selectedId, token]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread?.messages.length]);

  const visible = useMemo(() => {
    if (!term) return conversations;
    const needle = term.toLowerCase();
    return conversations.filter((conversation) =>
      `${conversation.customerName} ${conversation.subject} ${conversation.intent} ${conversation.summary}`
        .toLowerCase()
        .includes(needle),
    );
  }, [conversations, term]);

  const send = async () => {
    if (!thread || !draft.trim()) return;
    setSending(true);
    try {
      await client.reply(thread.conversation.id, draft.trim());
      setDraft('');
      setThread(await client.conversation(thread.conversation.id));
      toast('Reply sent to the customer', 'ok');
    } catch (error) {
      toast((error as Error).message, 'bad');
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!thread) return;
    try {
      await client.setConversationStatus(thread.conversation.id, status);
      setThread(await client.conversation(thread.conversation.id));
      loadList();
      toast(`Conversation marked ${status}`, 'ok');
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  };

  return (
    <div className="grid split-left" style={{ alignItems: 'start' }}>
      <Panel
        title="Conversations"
        tight
        action={
          <div className="btn-row">
            {(['all', 'open', 'escalated', 'closed'] as const).map((value) => (
              <button
                key={value}
                className={`btn tiny ${filter === value ? 'primary' : 'ghost'}`}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>
        }
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <div className="search">
            <Search size={14} />
            <input placeholder="Search customers, intents…" value={term} onChange={(event) => setTerm(event.target.value)} />
          </div>
        </div>
        {visible.length === 0 ? (
          <Empty>No conversations yet. Send a test message from Playground to see Duty work.</Empty>
        ) : (
          visible.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: conversation.id === selectedId ? 'var(--ink-3)' : 'transparent',
                border: 0,
                borderBottom: '1px solid var(--line-soft)',
                borderLeft: conversation.id === selectedId ? '2px solid var(--ember)' : '2px solid transparent',
                color: 'inherit',
                padding: '13px 16px',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <div className="row between" style={{ marginBottom: 5 }}>
                <span className="cell-strong" style={{ fontSize: 13.5 }}>
                  {conversation.customerName ?? conversation.customerId}
                </span>
                <span className="faint" style={{ fontSize: 11 }}>{relative(conversation.updatedAt)}</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 7 }}>
                {(conversation.summary ?? conversation.subject ?? 'No messages yet').slice(0, 90)}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Chip tone={channelTone(conversation.channel)}>{conversation.channel}</Chip>
                <Chip tone={statusTone(conversation.status)}>{conversation.status}</Chip>
                {conversation.intent && <Chip>{conversation.intent}</Chip>}
              </div>
            </button>
          ))
        )}
      </Panel>

      {!thread ? (
        <Panel title="Thread">
          <Empty>Pick a conversation on the left to read the full transcript and reply as a human.</Empty>
        </Panel>
      ) : (
        <div className="stack">
          <Panel
            title={
              <span className="row" style={{ gap: 10 }}>
                <span className="brand-mark" style={{ width: 26, height: 26, fontSize: 13 }}>
                  {initials(thread.customer.name)}
                </span>
                {thread.customer.name ?? thread.customer.externalId}
              </span>
            }
            action={
              <div className="btn-row">
                <Chip tone={statusTone(thread.conversation.status)} dot>{thread.conversation.status}</Chip>
                <button className="btn tiny" onClick={() => setStatus('open')}>
                  <RotateCcw size={12} /> Reopen
                </button>
                <button className="btn tiny" onClick={() => setStatus('closed')}>
                  <UserCheck size={12} /> Close
                </button>
              </div>
            }
          >
            <div className="row" style={{ gap: 8 }}>
              <Chip tone={channelTone(thread.conversation.channel)}>{thread.conversation.channel}</Chip>
              {thread.conversation.intent && <Chip tone="ember">{thread.conversation.intent}</Chip>}
              {typeof thread.conversation.sentiment === 'number' && (
                <Chip tone={thread.conversation.sentiment > 0.55 ? 'moss' : 'danger'}>
                  sentiment {thread.conversation.sentiment.toFixed(2)}
                </Chip>
              )}
              <span className="faint mono" style={{ fontSize: 11 }}>
                {thread.customer.externalId}
              </span>
            </div>
          </Panel>

          <Panel tight>
            <div className="thread" style={{ maxHeight: 460, overflowY: 'auto' }}>
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={`msg ${
                    message.role === 'agent' ? 'out' : message.role === 'human' ? 'human' : message.role === 'system' ? 'system' : ''
                  }`}
                >
                  <div className="msg-meta">
                    {message.role === 'agent' ? <Bot size={11} /> : message.role === 'human' ? <UserCheck size={11} /> : null}
                    {message.role} · {clock(message.createdAt)}
                  </div>
                  {message.content}
                  {message.actions && message.actions.length > 0 && (
                    <div className="msg-actions">
                      {message.actions.map((action, index) => (
                        <Chip key={index} tone={action.kind === 'offer_upsell' ? 'ember' : action.kind === 'escalate' ? 'danger' : 'sky'}>
                          <Sparkles size={9} /> {action.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={threadEnd} />
            </div>
          </Panel>

          {thread.orders.length > 0 && (
            <Panel title="Orders in this conversation" tight>
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {thread.orders.map((order) => (
                    <tr key={order.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{order.number}</td>
                      <td><Chip tone={statusTone(order.status)}>{order.status}</Chip></td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(', ')}
                      </td>
                      <td className="numeric" style={{ textAlign: 'right' }}>{money(order.total, order.currency)}</td>
                      <td className="numeric" style={{ textAlign: 'right', color: 'var(--ember-soft)' }}>
                        {Math.round(order.purchaseProbability * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel title="Reply as a human">
            <div className="stack-sm">
              <textarea
                placeholder="Type a reply — it goes out on the same channel the customer used."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send();
                }}
              />
              <div className="row between">
                <span className="faint" style={{ fontSize: 11.5 }}>⌘/Ctrl + Enter to send</span>
                <button className="btn primary" disabled={sending || !draft.trim()} onClick={send}>
                  <Send size={13} /> {sending ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
