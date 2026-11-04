import React, { useEffect, useState } from 'react';
import { MessageSquare, ShoppingBag, DollarSign, TrendingUp, ArrowRight, AlertTriangle } from 'lucide-react';
import { client, type Overview as OverviewData } from '../lib/api';
import { money, pct, relative, statusTone, channelTone } from '../lib/format';
import { Panel, Stat, Chip, Loading, Empty, Sparkline, useToast } from '../components/ui';

export function OverviewView({ onOpenOrder, onOpenConversation }: {
  onOpenOrder: (id: string) => void;
  onOpenConversation: (id: string) => void;
}) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [days, setDays] = useState(30);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    client
      .overview(days)
      .then((result) => alive && setData(result))
      .catch((error) => toast(error.message, 'bad'));
    return () => {
      alive = false;
    };
  }, [days, toast]);

  if (!data) return <Loading label="Reading the ledger" />;

  const { metrics, counts } = data;
  const currency = data.currency;
  const revenueSeries = data.series.map((point) => point.revenue);
  const orderSeries = data.series.map((point) => point.orders);
  const half = Math.floor(revenueSeries.length / 2) || 1;
  const firstHalf = revenueSeries.slice(0, half).reduce((sum, value) => sum + value, 0);
  const secondHalf = revenueSeries.slice(half).reduce((sum, value) => sum + value, 0);
  const delta = firstHalf === 0 ? (secondHalf > 0 ? 100 : 0) : ((secondHalf - firstHalf) / firstHalf) * 100;

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Stat
          delay={1}
          label="Gross revenue"
          value={money(metrics.grossRevenue, currency)}
          delta={{ value: `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`, up: delta >= 0 }}
          foot={`${metrics.paidOrders} paid orders`}
        />
        <Stat
          delay={2}
          label="Pipeline"
          value={money(metrics.pipelineValue, currency)}
          foot={`${metrics.orders - metrics.paidOrders} open orders`}
        />
        <Stat
          delay={3}
          label="Upsell revenue"
          value={money(metrics.upsellRevenue, currency)}
          foot={`${pct(metrics.upsellAcceptanceRate)} accepted · ${metrics.upsellOffers} offers`}
        />
        <Stat
          delay={4}
          label="Conversion"
          value={pct(metrics.conversionRate, 1)}
          foot={`AOV ${money(metrics.averageOrderValue, currency)}`}
        />
      </div>

      <div className="grid split">
        <Panel
          title="Revenue · last 14 days"
          delay={1}
          action={
            <div className="btn-row">
              {[7, 30, 90].map((value) => (
                <button
                  key={value}
                  className={`btn tiny ${days === value ? 'primary' : 'ghost'}`}
                  onClick={() => setDays(value)}
                >
                  {value}d
                </button>
              ))}
            </div>
          }
        >
          <Sparkline points={revenueSeries} height={92} />
          <div className="row between" style={{ marginTop: 14 }}>
            <div>
              <div className="eyebrow">Net (after discounts)</div>
              <div className="numeric" style={{ fontSize: 20 }}>{money(metrics.netRevenue, currency)}</div>
            </div>
            <div>
              <div className="eyebrow">Discounts given</div>
              <div className="numeric" style={{ fontSize: 20 }}>{money(metrics.discounts, currency)}</div>
            </div>
            <div>
              <div className="eyebrow">Orders / day</div>
              <div className="numeric" style={{ fontSize: 20 }}>
                {(orderSeries.reduce((sum, value) => sum + value, 0) / Math.max(1, orderSeries.length)).toFixed(1)}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Where the money comes from" delay={2}>
          {Object.keys(metrics.byChannel).length === 0 ? (
            <Empty>No paid orders yet.</Empty>
          ) : (
            <div className="stack-sm">
              {Object.entries(metrics.byChannel)
                .sort((a, b) => b[1] - a[1])
                .map(([channel, value]) => {
                  const share = metrics.grossRevenue ? value / metrics.grossRevenue : 0;
                  return (
                    <div key={channel} className="stack-sm" style={{ gap: 5 }}>
                      <div className="row between">
                        <Chip tone={channelTone(channel)}>{channel}</Chip>
                        <span className="numeric" style={{ fontSize: 13 }}>{money(value, currency)}</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(2, share * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          <div className="divider" />
          <div className="grid cols-2" style={{ gap: 10 }}>
            <div>
              <div className="eyebrow">Conversations</div>
              <div className="numeric" style={{ fontSize: 18 }}>{counts.conversations}</div>
            </div>
            <div>
              <div className="eyebrow">Customers</div>
              <div className="numeric" style={{ fontSize: 18 }}>{counts.customers}</div>
            </div>
            <div>
              <div className="eyebrow">Catalogue</div>
              <div className="numeric" style={{ fontSize: 18 }}>{counts.products}</div>
            </div>
            <div>
              <div className="eyebrow">Knowledge docs</div>
              <div className="numeric" style={{ fontSize: 18 }}>{counts.knowledgeDocuments}</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid split">
        <Panel
          title="Needs a human"
          delay={1}
          tight
          action={counts.escalated > 0 ? <Chip tone="danger" dot>{counts.escalated} escalated</Chip> : <Chip tone="moss">all clear</Chip>}
        >
          {data.escalatedConversations.length === 0 ? (
            <Empty>
              <AlertTriangle size={16} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 6 }}>Nothing escalated. Duty is handling everything.</div>
            </Empty>
          ) : (
            data.escalatedConversations.map((conversation) => (
              <button
                key={conversation.id}
                className="list-row clickable"
                style={{ width: '100%', background: 'transparent', border: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => onOpenConversation(conversation.id)}
              >
                <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
                  <span className="cell-strong">{conversation.customerName ?? conversation.customerId}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {(conversation.summary ?? conversation.subject ?? 'No summary').slice(0, 110)}
                  </span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Chip tone="danger">{conversation.intent ?? 'escalated'}</Chip>
                  <ArrowRight size={14} style={{ opacity: 0.5 }} />
                </div>
              </button>
            ))
          )}
        </Panel>

        <Panel title="Latest orders" delay={2} tight>
          {data.recentOrders.length === 0 ? (
            <Empty>No orders captured yet. Point a channel at Duty and they will appear here.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Win&nbsp;%</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="clickable" onClick={() => onOpenOrder(order.id)}>
                    <td>
                      <div className="cell-strong mono" style={{ fontSize: 12 }}>{order.number}</div>
                      <div className="faint" style={{ fontSize: 11.5 }}>{relative(order.createdAt)}</div>
                    </td>
                    <td><Chip tone={channelTone(order.channel)}>{order.channel}</Chip></td>
                    <td><Chip tone={statusTone(order.status)}>{order.status}</Chip></td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{money(order.total, order.currency)}</td>
                    <td className="numeric" style={{ textAlign: 'right', color: 'var(--ember-soft)' }}>
                      {pct(order.purchaseProbability)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid cols-3">
        <Panel title="Top products by revenue" delay={1} tight>
          {metrics.topProducts.length === 0 ? (
            <Empty>No sales yet.</Empty>
          ) : (
            metrics.topProducts.slice(0, 5).map((product) => (
              <div className="list-row" key={product.sku}>
                <div className="stack-sm" style={{ gap: 2 }}>
                  <span className="cell-strong">{product.name}</span>
                  <span className="faint mono" style={{ fontSize: 11 }}>{product.sku}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="numeric">{money(product.revenue, currency)}</div>
                  <div className="faint" style={{ fontSize: 11 }}>{product.quantity} sold</div>
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Duty activity" delay={2}>
          <div className="stack-sm">
            <Row icon={<MessageSquare size={14} />} label="Conversations handled" value={String(counts.conversations)} />
            <Row icon={<ShoppingBag size={14} />} label="Orders captured" value={String(metrics.orders)} />
            <Row icon={<DollarSign size={14} />} label="Upsells accepted" value={String(metrics.upsellAccepts)} />
            <Row icon={<TrendingUp size={14} />} label="Upsell acceptance" value={pct(metrics.upsellAcceptanceRate)} />
          </div>
          <div className="divider" />
          <div className="stack-sm">
            {data.channels.map((channel) => (
              <div className="row between" key={channel.kind}>
                <Chip tone={channelTone(channel.kind)}>{channel.kind}</Chip>
                <Chip tone={channel.enabled ? 'moss' : ''} dot>{channel.enabled ? 'live' : 'off'}</Chip>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Open conversations" delay={3} tight>
          {data.counts.openConversations === 0 ? (
            <Empty>No open conversations.</Empty>
          ) : (
            <div className="panel-body" style={{ paddingTop: 16 }}>
              <div className="stat-value numeric">{counts.openConversations}</div>
              <div className="stat-foot">being handled by Duty right now</div>
              <div className="divider" />
              <div className="stat-foot">
                <span className="moss" style={{ color: 'var(--moss)' }}>
                  {counts.conversations - counts.escalated}
                </span>{' '}
                resolved without a human
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="row between">
      <span className="row muted" style={{ gap: 8 }}>
        {icon} {label}
      </span>
      <span className="numeric cell-strong">{value}</span>
    </div>
  );
}
