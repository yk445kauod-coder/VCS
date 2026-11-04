import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessagesSquare,
  ShoppingBag,
  Package,
  Users,
  Brain,
  BarChart3,
  Terminal,
  Zap,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';
import { client, type RuntimeStatus } from './lib/api';
import { ToastProvider, Chip } from './components/ui';
import { OverviewView } from './views/Overview';
import { ConversationsView } from './views/Conversations';
import { OrdersView } from './views/Orders';
import { CatalogView } from './views/Catalog';
import { CustomersView } from './views/Customers';
import { BrainView } from './views/Brain';
import { AnalyticsView } from './views/Analytics';
import { PlaygroundView } from './views/Playground';
import { AutomationsView } from './views/Automations';
import { SettingsView } from './views/Settings';

type View =
  | 'overview'
  | 'conversations'
  | 'orders'
  | 'catalog'
  | 'customers'
  | 'brain'
  | 'analytics'
  | 'playground'
  | 'automations'
  | 'settings';

const NAV: Array<{ group: string; items: Array<{ id: View; label: string; icon: React.ReactNode }> }> = [
  {
    group: 'Revenue',
    items: [
      { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
      { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={15} /> },
      { id: 'orders', label: 'Orders', icon: <ShoppingBag size={15} /> },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'conversations', label: 'Conversations', icon: <MessagesSquare size={15} /> },
      { id: 'customers', label: 'Customers', icon: <Users size={15} /> },
      { id: 'catalog', label: 'Catalogue', icon: <Package size={15} /> },
      { id: 'automations', label: 'Automations', icon: <Zap size={15} /> },
    ],
  },
  {
    group: 'Duty brain',
    items: [
      { id: 'brain', label: 'Knowledge', icon: <Brain size={15} /> },
      { id: 'playground', label: 'Playground', icon: <Terminal size={15} /> },
      { id: 'settings', label: 'Settings', icon: <SettingsIcon size={15} /> },
    ],
  },
];

const TITLES: Record<View, { title: string; blurb: string }> = {
  overview: { title: 'Overview', blurb: 'The money, the pipeline, and what needs a human.' },
  analytics: { title: 'Analytics & reports', blurb: 'Revenue metrics, funnel and written briefings.' },
  orders: { title: 'Orders', blurb: 'Every cart Duty captured, with its win probability.' },
  conversations: { title: 'Conversations', blurb: 'Read the transcripts and step in when a human is needed.' },
  customers: { title: 'Customers', blurb: 'Everyone who talked to Duty, and what they are worth.' },
  catalog: { title: 'Catalogue', blurb: 'Products and the upsell rules that grow the cart.' },
  automations: { title: 'Automations', blurb: 'Cart recovery and the daily revenue brief.' },
  brain: { title: 'Business knowledge', blurb: 'Teach Duty your website, files, policies and FAQs.' },
  playground: { title: 'Playground', blurb: 'Talk to the live agent exactly as a customer would.' },
  settings: { title: 'Settings', blurb: 'Your infrastructure, channels, and webhooks.' },
};

export function App() {
  const [token, setToken] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    if (fromUrl) {
      localStorage.setItem('duty_token', fromUrl);
      // Drop the token from the address bar. It is kept in localStorage, and
      // leaving it in the URL would write it into browser history and any
      // referrer sent to third parties.
      window.history.replaceState({}, '', window.location.pathname);
      return fromUrl;
    }
    return localStorage.getItem('duty_token') ?? '';
  });
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>('overview');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    client.setToken(token);
    if (!token) {
      setChecking(false);
      return;
    }
    client
      .health()
      .then((result) => {
        setStatus(result);
        setAuthed(true);
      })
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, [token]);

  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(() => client.health().then(setStatus).catch(() => undefined), 30_000);
    return () => clearInterval(timer);
  }, [authed]);

  const signOut = () => {
    localStorage.removeItem('duty_token');
    setToken('');
    setAuthed(false);
  };

  if (checking) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div className="mono faint">connecting to duty…</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <TokenGate
        initial={token}
        onToken={(value) => {
          localStorage.setItem('duty_token', value);
          setToken(value);
        }}
      />
    );
  }

  const meta = TITLES[view];
  const openConversations = status?.channels.filter((channel) => channel.enabled).length ?? 0;

  return (
    <ToastProvider>
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            <div className="brand-mark">D</div>
            <div>
              <div className="brand-name">Duty</div>
              <div className="brand-sub">Revenue ops</div>
            </div>
          </div>

          <nav className="nav">
            {NAV.map((section) => (
              <React.Fragment key={section.group}>
                <div className="nav-label">{section.group}</div>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={`nav-item ${view === item.id ? 'active' : ''}`}
                    onClick={() => setView(item.id)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </nav>

          <div className="rail-foot">
            <div className="row between">
              <span className="eyebrow">Runtime</span>
              <span className="live">
                <i className="dot" /> live
              </span>
            </div>
            <div className="stack-sm" style={{ gap: 7 }}>
              <div className="row between">
                <span className="faint" style={{ fontSize: 11.5 }}>Storage</span>
                <Chip tone="sky">{status?.store.kind ?? '—'}</Chip>
              </div>
              <div className="row between">
                <span className="faint" style={{ fontSize: 11.5 }}>AI</span>
                <Chip tone={status?.ai.provider === 'local-brain' ? 'brass' : 'ember'}>
                  {status?.ai.provider ?? '—'}
                </Chip>
              </div>
              <div className="row between">
                <span className="faint" style={{ fontSize: 11.5 }}>Channels</span>
                <span className="numeric faint" style={{ fontSize: 11.5 }}>{openConversations} live</span>
              </div>
            </div>
            <button className="btn ghost tiny" onClick={signOut}>
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <h1>{meta.title}</h1>
              <p className="muted" style={{ fontSize: 13.5 }}>{meta.blurb}</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Chip tone="moss" dot>auto-reply on</Chip>
              <Chip>v{status?.version ?? '1.0.0'}</Chip>
            </div>
          </header>

          {view === 'overview' && (
            <OverviewView
              onOpenOrder={(id) => {
                setSelectedOrder(id);
                setView('orders');
              }}
              onOpenConversation={(id) => {
                setSelectedConversation(id);
                setView('conversations');
              }}
            />
          )}
          {view === 'conversations' && (
            <ConversationsView selectedId={selectedConversation} onSelect={setSelectedConversation} token={token} />
          )}
          {view === 'orders' && <OrdersView selectedId={selectedOrder} onSelect={setSelectedOrder} />}
          {view === 'catalog' && <CatalogView />}
          {view === 'customers' && <CustomersView />}
          {view === 'brain' && <BrainView />}
          {view === 'analytics' && <AnalyticsView />}
          {view === 'playground' && <PlaygroundView />}
          {view === 'automations' && <AutomationsView />}
          {view === 'settings' && <SettingsView token={token} />}
        </main>
      </div>
    </ToastProvider>
  );
}

function TokenGate({ initial, onToken }: { initial: string; onToken: (token: string) => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    client.setToken(value.trim());
    try {
      await client.health();
      onToken(value.trim());
    } catch {
      setError('That token was rejected. Check ADMIN_TOKEN in your .env file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="panel enter" style={{ width: 'min(420px, 100%)' }}>
        <div className="panel-body">
          <div className="row" style={{ gap: 11, marginBottom: 18 }}>
            <div className="brand-mark">D</div>
            <div>
              <div className="brand-name">Duty</div>
              <div className="brand-sub">Revenue operations</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
            Enter the admin token from your <span className="mono">.env</span> (ADMIN_TOKEN) to open the dashboard.
          </p>
          <div className="stack-sm">
            <input
              type="password"
              placeholder="ADMIN_TOKEN"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void submit()}
            />
            {error && <span style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</span>}
            <button className="btn primary" onClick={submit} disabled={busy || !value.trim()}>
              {busy ? 'Checking…' : 'Open dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
