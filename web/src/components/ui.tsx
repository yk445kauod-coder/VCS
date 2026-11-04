import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react';

/* --------------------------------------------------------------------- icons */
export { Search, X, TrendingUp, TrendingDown };

/* -------------------------------------------------------------------- panel */
export function Panel({
  title,
  action,
  children,
  tight,
  className = '',
  delay,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  tight?: boolean;
  className?: string;
  delay?: 1 | 2 | 3 | 4;
}) {
  return (
    <section className={`panel enter ${delay ? `enter-${delay}` : ''} ${className}`}>
      {title !== undefined && (
        <header className="panel-head">
          <h3>{title}</h3>
          {action}
        </header>
      )}
      <div className={tight ? 'panel-body tight' : 'panel-body'}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------------- stat */
export function Stat({
  label,
  value,
  foot,
  delta,
  small,
  delay,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  delta?: { value: string; up?: boolean };
  small?: boolean;
  delay?: 1 | 2 | 3 | 4;
}) {
  return (
    <div className={`stat enter ${delay ? `enter-${delay}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={small ? 'stat-value small numeric' : 'stat-value numeric'}>{value}</div>
      {(foot || delta) && (
        <div className="stat-foot">
          {delta && (
            <span className={`delta ${delta.up ? 'up' : 'down'}`}>
              {delta.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {delta.value}
            </span>
          )}
          {foot}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- chip */
export function Chip({
  children,
  tone = '',
  dot,
}: {
  children: React.ReactNode;
  tone?: 'ember' | 'moss' | 'sky' | 'danger' | 'brass' | '';
  dot?: boolean;
}) {
  return (
    <span className={`chip ${tone}`}>
      {dot && <i className="dot" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ spinner */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="empty mono">{label}…</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ---------------------------------------------------------------- sparkline */
export function Sparkline({
  points,
  height = 62,
  tone = 'var(--ember)',
  fill = true,
}: {
  points: number[];
  height?: number;
  tone?: string;
  fill?: boolean;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return { line: '', area: '' };
    const max = Math.max(...points, 1);
    const step = 100 / (points.length - 1);
    const coords = points.map((value, index) => {
      const x = index * step;
      const y = 100 - (value / max) * 92 - 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return {
      line: `M ${coords.join(' L ')}`,
      area: `M 0,100 L ${coords.join(' L ')} L 100,100 Z`,
    };
  }, [points]);

  if (!path.line) return <div className="empty">No activity yet</div>;

  return (
    <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.34" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={path.area} fill="url(#spark-fill)" />}
      <path d={path.line} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* -------------------------------------------------------------------- modal */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost tiny" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && (
          <div className="modal-body" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
            <div className="btn-row">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- toast */
type Toast = { id: number; text: string; tone: 'ok' | 'bad' | 'info' };
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------------------------- field */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="faint" style={{ fontSize: 11.5 }}>{hint}</span>}
    </div>
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }} />
    </div>
  );
}

export function KeyValue({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
