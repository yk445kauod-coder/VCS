import React, { useEffect, useState } from 'react';
import { Mail, Phone, Tag } from 'lucide-react';
import { client, type Customer, type Conversation, type Order } from '../lib/api';
import { money, relative, statusTone, channelTone, initials } from '../lib/format';
import { Panel, Chip, Loading, Empty, Search, Modal, useToast } from '../components/ui';

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    client
      .customers(term ? `?search=${encodeURIComponent(term)}` : '')
      .then((result) => setCustomers(result.items))
      .catch((error) => toast(error.message, 'bad'))
      .finally(() => setLoading(false));
  }, [term, toast]);

  return (
    <div className="stack">
      <Panel
        title="Customers"
        tight
        action={<Chip tone="moss">{customers.filter((customer) => customer.tags.includes('buyer')).length} buyers</Chip>}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <div className="search">
            <Search size={14} />
            <input placeholder="Search by name, phone or email…" value={term} onChange={(event) => setTerm(event.target.value)} />
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : customers.length === 0 ? (
          <Empty>No customers yet. They appear the first time someone messages a connected channel.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Channel</th>
                <th>Contact</th>
                <th>Tags</th>
                <th style={{ textAlign: 'right' }}>Lifetime value</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="clickable" onClick={() => setSelected(customer.id)}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="brand-mark" style={{ width: 26, height: 26, fontSize: 12 }}>
                        {initials(customer.name)}
                      </span>
                      <span className="cell-strong">{customer.name ?? 'Unknown'}</span>
                    </div>
                  </td>
                  <td><Chip tone={channelTone(customer.channel)}>{customer.channel}</Chip></td>
                  <td className="mono faint" style={{ fontSize: 11.5 }}>{customer.phone ?? customer.email ?? customer.externalId}</td>
                  <td>
                    {customer.tags.length ? (
                      <div className="row" style={{ gap: 5 }}>
                        {customer.tags.map((tag) => (
                          <Chip key={tag} tone={tag === 'buyer' ? 'moss' : ''}>
                            <Tag size={9} /> {tag}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="numeric cell-strong" style={{ textAlign: 'right' }}>{money(customer.ltv)}</td>
                  <td className="faint" style={{ fontSize: 12 }}>{relative(customer.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {selected && <CustomerDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ customer: Customer; conversations: Conversation[]; orders: Order[] } | null>(null);
  const toast = useToast();

  useEffect(() => {
    client.customer(id).then(setData).catch((error) => toast(error.message, 'bad'));
  }, [id, toast]);

  if (!data) return null;
  const { customer } = data;

  return (
    <Modal
      title={
        <span className="row" style={{ gap: 10 }}>
          <span className="brand-mark" style={{ width: 24, height: 24, fontSize: 11 }}>{initials(customer.name)}</span>
          {customer.name ?? customer.externalId}
        </span>
      }
      onClose={onClose}
    >
      <div className="row" style={{ gap: 8 }}>
        <Chip tone={channelTone(customer.channel)}>{customer.channel}</Chip>
        <Chip tone="ember">LTV {money(customer.ltv)}</Chip>
        {customer.tags.map((tag) => (
          <Chip key={tag} tone={tag === 'buyer' ? 'moss' : ''}>{tag}</Chip>
        ))}
      </div>

      <div className="row" style={{ gap: 16 }}>
        {customer.phone && (
          <span className="row muted" style={{ gap: 6, fontSize: 12.5 }}>
            <Phone size={12} /> {customer.phone}
          </span>
        )}
        {customer.email && (
          <span className="row muted" style={{ gap: 6, fontSize: 12.5 }}>
            <Mail size={12} /> {customer.email}
          </span>
        )}
      </div>

      <div className="stack-sm">
        <div className="eyebrow">Orders ({data.orders.length})</div>
        {data.orders.length === 0 ? (
          <span className="faint" style={{ fontSize: 12.5 }}>No orders yet.</span>
        ) : (
          data.orders.map((order) => (
            <div key={order.id} className="list-row" style={{ padding: '9px 0' }}>
              <div className="stack-sm" style={{ gap: 2 }}>
                <span className="mono" style={{ fontSize: 12 }}>{order.number}</span>
                <span className="faint" style={{ fontSize: 11.5 }}>
                  {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(', ')}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="numeric">{money(order.total, order.currency)}</div>
                <Chip tone={statusTone(order.status)}>{order.status}</Chip>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="stack-sm">
        <div className="eyebrow">Conversations ({data.conversations.length})</div>
        {data.conversations.map((conversation) => (
          <div key={conversation.id} className="list-row" style={{ padding: '9px 0' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{conversation.subject ?? conversation.id}</span>
            <Chip tone={statusTone(conversation.status)}>{conversation.status}</Chip>
          </div>
        ))}
      </div>
    </Modal>
  );
}
