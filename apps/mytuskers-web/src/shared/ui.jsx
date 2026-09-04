import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetUrl } from '../api.js';

export function ScreenShell({ children, nav = false }) {
  return (
    <div className="app-bg">
      <main className={`phone-shell ${nav ? 'has-nav' : ''}`}>{children}</main>
    </div>
  );
}

export function LoadingBlock({ title }) {
  return (
    <div className="center-stack">
      <img className="brand-logo" src="/wt_logo.png" alt="MyTuskers" />
      <h1>{title}</h1>
    </div>
  );
}

export function UserAvatar({ initials = 'MT', photoUrl = '', className = '' }) {
  return (
    <span className={`avatar ${photoUrl ? 'has-photo' : ''} ${className}`.trim()}>
      {photoUrl ? <img src={assetUrl(photoUrl)} alt="" /> : initials}
    </span>
  );
}

export function ActionModal({ title, children, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = modalRef.current?.querySelector('[data-autofocus], input, select, textarea, button:not(.modal-close), a[href]');
    focusable?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="action-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="action-modal" ref={modalRef}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  );
}

export function BackHeader({ title, back = true }) {
  const navigate = useNavigate();
  return (
    <>
      <header className="page-header">
        {back && <button onClick={() => navigate(-1)}>‹</button>}
        <h1>{title}</h1>
      </header>
    </>
  );
}

export function SectionHeading({ title, action }) {
  return <div className="section-heading"><h2>{title}</h2><button>{action}</button></div>;
}

export function SkeletonCards() {
  return (
    <section className="stack">
      <div className="skeleton card-size" />
      <div className="skeleton small-size" />
    </section>
  );
}

export function MetricCard({ title, value, sub }) {
  return (
    <div className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      {sub && <p>{sub}</p>}
    </div>
  );
}

export function ToolPanel({ title, children, headerAction }) {
  return (
    <div className="tool-panel">
      <div className="tool-panel-header">
        <h2>{title}</h2>
        {headerAction}
      </div>
      <div className="tool-panel-body">{children}</div>
    </div>
  );
}

export function ActionRow({ title, detail, action, onAction }) {
  return (
    <div className="action-row">
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
