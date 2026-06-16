/** Small brand-styled UI primitives shared across feature views. */

import { useEffect, type ReactNode } from 'react';
import type { Priority, TestCaseStatus } from '../domain/types';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`esp-badge esp-prio-${priority}`}>{priority}</span>;
}

export function StatusBadge({ status }: { status: TestCaseStatus }) {
  return <span className={`esp-badge esp-status-${status}`}>{status}</span>;
}

export function Badge({ children, kind = 'soft' }: { children: ReactNode; kind?: 'soft' | 'vendor' }) {
  return <span className={`esp-badge esp-badge-${kind}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="esp-field">
      <label className="esp-label">{label}</label>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="esp-modal-overlay" onClick={onClose}>
      <div className="esp-modal" style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="esp-modal-head">
          <h3>{title}</h3>
          <button className="esp-btn esp-btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="esp-modal-body">{children}</div>
        {footer ? <div className="esp-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return <div className="esp-toast">{message}</div>;
}
