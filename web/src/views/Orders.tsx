import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Package, Filter } from 'lucide-react';
import { client, type Order, type OrderStatus } from '../lib/api';
import { money, pct, relative, statusTone, channelTone } from '../lib/format';
import { Panel, Chip, Loading, Empty, Search, Modal, useToast, Bar } from '../components/ui';

const STATUSES: Array<OrderStatus | 'all'> = [
  'all',
  'draft',
  'pending',
  'confirmed',
  'paid',
  'fulfilled',
  'cancelled',
];

export function OrdersView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    const query = status === 'all' ? '' : `?status=${status}`;
    client
      .orders(query)
      .then((result) => setOrders(result.items))
      .catch((error) => toast(error.message, 'bad'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const visible = useMemo(() => {
    if (!term) return orders;
    const needle = term.toLowerCase();
    return orders.filter((order) =>
      `${order.number} ${order.status} ${order.lines.map((line) => line.name).join(' ')}`
        .toLowerCase()
        .includes(needle),
    );
  }, [orders, term]);

  const totals = useMemo(
    () => ({
      count: visible.length,
      value: visible.reduce((sum, order) => sum + order.total, 0),
      pipeline: visible
        .filter((order) => !['paid', 'fulfilled', 'cancelled', 'refunded'].includes(order.status))
        .reduce((sum, order) => sum + Math.round(order.total * order.purchaseProbability), 0),
    }),
    [visible],
  );

  return (
    <div className="stack">
      <div className="grid cols-3">
        <div className="stat enter">
          <div className="stat-label">Orders in view</div>
          <div className="stat-value numeric">{totals.count}</div>
        </div>
        <div className="stat enter enter-1">
          <div className="stat-label">Value in view</div>
          <div className="stat-value numeric small">{money(totals.value)}</div>
        </div>
        <div className="stat enter enter-2">
          <div className="stat-label">Weighted pipeline</div>
          <div className="stat-value numeric small" style={{ color: 'var(--ember-soft)' }}>
            {money(totals.pipeline)}
          </div>
        </div>
      </div>

      <Panel
        title={
          <span className="row" style={{ gap: 8 }}>
            <Filter size={13} /> Orders
          </span>
        }
        tight
        action={
          <div className="btn-row">
            {STATUSES.map((value) => (
              <button
                key={value}
                className={`btn tiny ${status === value ? 'primary' : 'ghost'}`}
                onClick={() => setStatus(value)}
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
            <input placeholder="Search order number or product…" value={term} onChange={(event) => setTerm(event.target.value)} />
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Empty>No orders match this filter yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Items</th>
                <th style={{ width: 130 }}>Win probability</th>
                <th>Upsell</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id} className="clickable" onClick={() => onSelect(order.id)}>
                  <td>
                    <div className="cell-strong mono" style={{ fontSize: 12 }}>{order.number}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>{relative(order.createdAt)}</div>
                  </td>
                  <td><Chip tone={channelTone(order.channel)}>{order.channel}</Chip></td>
                  <td><Chip tone={statusTone(order.status)}>{order.status}</Chip></td>
                  <td className="muted" style={{ fontSize: 12.5, maxWidth: 240 }}>
                    {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(', ')}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Bar value={order.purchaseProbability} />
                      </div>
                      <span className="numeric" style={{ fontSize: 11.5, width: 32 }}>
                        {Math.round(order.purchaseProbability * 100)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    {order.upsellOffered ? (
                      <Chip tone={order.upsellAccepted ? 'moss' : 'brass'}>
                        {order.upsellAccepted ? 'accepted' : 'offered'} · {order.upsellOffered}
                      </Chip>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="numeric cell-strong" style={{ textAlign: 'right' }}>
                    {money(order.total, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {selectedId && <OrderDetail id={selectedId} onClose={() => onSelect(null)} onChanged={load} />}
    </div>
  );
}

function OrderDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ order: Order; customer?: { name?: string; externalId: string } } | null>(null);
  const [upsells, setUpsells] = useState<Array<{ name: string; price: string; strategy: string; probability: number; expectedRevenue: string; reason: string }>>([]);
  const toast = useToast();

  const load = () => {
    client.order(id).then(setData).catch((error) => toast(error.message, 'bad'));
    client.orderUpsells(id).then((result) => setUpsells(result.items)).catch(() => setUpsells([]));
  };

  useEffect(load, [id]);

  const advance = async (status: OrderStatus) => {
    try {
      await client.setOrderStatus(id, status);
      toast(`Order marked ${status}`, 'ok');
      load();
      onChanged();
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  };

  if (!data) return null;
  const { order } = data;

  return (
    <Modal
      title={
        <span className="row" style={{ gap: 10 }}>
          <Package size={15} /> Order {order.number}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={() => advance('paid')} disabled={order.status === 'paid'}>
            Mark paid
          </button>
          <button className="btn" onClick={() => advance('fulfilled')}>
            Fulfilled
          </button>
          <button className="btn" onClick={() => advance('confirmed')}>
            Confirmed
          </button>
          <button className="btn ghost" onClick={() => advance('cancelled')}>
            Cancel
          </button>
        </>
      }
    >
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <Chip tone={statusTone(order.status)} dot>{order.status}</Chip>
          <Chip tone={channelTone(order.channel)}>{order.channel}</Chip>
        </div>
        <div className="numeric" style={{ fontSize: 22 }}>{money(order.total, order.currency)}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Unit</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.sku}>
              <td>
                <div className="cell-strong">{line.name}</div>
                <div className="faint mono" style={{ fontSize: 11 }}>{line.sku}</div>
              </td>
              <td className="numeric" style={{ textAlign: 'right' }}>{line.quantity}</td>
              <td className="numeric" style={{ textAlign: 'right' }}>{money(line.unitPrice, order.currency)}</td>
              <td className="numeric" style={{ textAlign: 'right' }}>{money(line.total, order.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row between">
        <span className="eyebrow">Win probability</span>
        <span className="numeric" style={{ color: 'var(--ember-soft)' }}>{pct(order.purchaseProbability)}</span>
      </div>

      {upsells.length > 0 && (
        <div className="stack-sm">
          <div className="eyebrow">Next best offers Duty found</div>
          {upsells.map((upsell) => (
            <div key={upsell.name} className="list-row" style={{ padding: '10px 12px', border: '1px solid var(--line-soft)', borderRadius: 4 }}>
              <div className="stack-sm" style={{ gap: 3 }}>
                <span className="cell-strong row" style={{ gap: 7 }}>
                  <ArrowUpRight size={13} style={{ color: 'var(--ember)' }} /> {upsell.name}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{upsell.reason}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="numeric" style={{ color: 'var(--moss)' }}>{upsell.expectedRevenue}</div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {upsell.strategy} · {pct(upsell.probability)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
