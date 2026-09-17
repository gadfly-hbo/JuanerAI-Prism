import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PLATFORM } from './api';

export function PrismMark({ size = 34 }: { size?: number }) {
  return (
    <div className="rounded-md bg-primary-ink grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path d="M10 4.5 L18.5 18.5 H1.5 Z" stroke="#fff" strokeWidth="1.5" fill="rgba(255,255,255,.08)" />
        <line x1="14" y1="12.5" x2="22.5" y2="9.5" stroke="#e0913c" strokeWidth="1.3" />
        <line x1="14.8" y1="14.5" x2="23" y2="14.5" stroke="#4fae62" strokeWidth="1.3" />
        <line x1="14" y1="16.3" x2="22.5" y2="19.3" stroke="#7b5ee3" strokeWidth="1.3" />
      </svg>
    </div>
  );
}

const NAV = [
  { group: '工作台' },
  { to: '/', label: '战略驾驶舱', end: true },
  { to: '/topics', label: '选题雷达' },
  { to: '/studio', label: '内容工作室' },
  { to: '/channels', label: '四平台适配' },
  { to: '/review', label: '审查中心' },
  { to: '/calendar', label: '日历与发布' },
  { group: '增长与学习' },
  { to: '/analytics', label: '增长分析' },
  { to: '/library', label: '假设与策略库' },
  { to: '/community', label: '评论与线索' },
];

const ICONS: Record<string, React.ReactNode> = {
  '/': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>,
  '/topics': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>,
  '/studio': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20 L20 4" /><path d="M14 4 h6 v6" /></svg>,
  '/channels': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="8" height="7" rx="1.5" /><rect x="13" y="4" width="8" height="7" rx="1.5" /><rect x="3" y="13" width="8" height="7" rx="1.5" /><rect x="13" y="13" width="8" height="7" rx="1.5" /></svg>,
  '/review': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 l7 3 v6 c0 4.5 -3 7.5 -7 9 c-4 -1.5 -7 -4.5 -7 -9 v-6 Z" /><path d="M9 12 l2 2 l4 -4" /></svg>,
  '/calendar': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  '/analytics': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20 V10" /><path d="M10 20 V4" /><path d="M16 20 v-7" /><path d="M22 20 H2" /></svg>,
  '/library': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4 h11 a3 3 0 0 1 3 3 v13 H8 a3 3 0 0 1 -3 -3 Z" /><path d="M5 17 a3 3 0 0 1 3 -3 h11" /></svg>,
  '/community': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12 a8 8 0 1 1 -3.2 -6.4 L21 5 l-1 3.4 A7.9 7.9 0 0 1 21 12 Z" /></svg>,
};

export function Layout({ badges = {} }: { badges?: Record<string, number> }) {
  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: '240px minmax(0,1fr)' }}>
      <aside className="sticky top-0 h-screen px-3.5 py-4 border-r border-line bg-surface flex flex-col gap-4">
        <div className="flex items-center gap-2.5 px-1.5">
          <PrismMark />
          <div>
            <div className="text-body font-semibold leading-tight">Prism · 棱镜</div>
            <div className="text-meta text-soft">JuanerAI 内容运营工作台</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n, i) =>
            'group' in n ? (
              <div key={i} className="text-meta text-soft px-2.5 pt-3 pb-1">{n.group}</div>
            ) : (
              <NavLink key={n.to} to={n.to!} end={(n as any).end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2.5 py-[7px] rounded-sm text-[13.5px] ${isActive ? 'bg-primary-soft text-primary-ink font-medium' : 'text-muted hover:bg-surface-3 hover:text-ink'}`}>
                <span className="opacity-80 flex-none">{ICONS[n.to!]}</span>
                {n.label}
                {badges[n.to!] ? (
                  <span className="ml-auto text-meta bg-surface-3 rounded-full px-1.5 leading-[18px] text-muted">{badges[n.to!]}</span>
                ) : null}
              </NavLink>
            ))}
        </nav>
        <div className="mt-auto border-t border-line pt-3 px-1.5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary text-white grid place-items-center text-small font-semibold">总</div>
          <div>
            <div className="text-small font-semibold">人类总编</div>
            <div className="text-meta text-soft">发布前必须经你批准</div>
          </div>
        </div>
      </aside>
      <main className="px-7 pt-6 pb-12 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHead({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 mb-2">
      <div>
        <h1 className="text-page-title">{title}</h1>
        <p className="text-[13px] text-muted mt-1.5 max-w-3xl">{desc}</p>
      </div>
      {children ? <div className="ml-auto flex gap-2 flex-none">{children}</div> : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-surface border border-line rounded-base ${className}`}>{children}</div>;
}

export function Btn({ children, onClick, kind = 'secondary', disabled = false, small = false }: {
  children: React.ReactNode; onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean;
}) {
  const base = `inline-flex items-center gap-1.5 rounded-sm border whitespace-nowrap ${small ? 'px-2.5 py-1 text-small' : 'px-3.5 py-1.5 text-[13px]'}`;
  const styles = {
    primary: 'bg-primary border-primary text-white hover:bg-primary-hover',
    secondary: 'bg-surface border-line-strong text-ink hover:bg-surface-2',
    ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-3 hover:text-ink',
    danger: 'text-red border-red bg-surface hover:bg-red-soft',
  }[kind];
  return <button onClick={onClick} disabled={disabled} className={`${base} ${styles} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>{children}</button>;
}

const BADGE_KIND = {
  green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red',
  teal: 'bg-teal-soft text-teal', blue: 'bg-primary-soft text-primary-ink', violet: 'bg-violet-soft text-violet',
  neutral: 'bg-surface-3 text-muted',
} as const;

export function Badge({ kind = 'neutral', dot = true, children }: { kind?: keyof typeof BADGE_KIND; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-small leading-none px-2 py-[3.5px] rounded-full whitespace-nowrap ${BADGE_KIND[kind]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'ok' | 'fail'; children: React.ReactNode }) {
  const border = kind === 'warn' ? 'border-l-amber bg-[#fffdf5]'
    : kind === 'ok' ? 'border-l-green'
    : kind === 'fail' ? 'border-l-red bg-red-soft/40'
    : 'border-l-primary';
  return (
    <div className={`flex gap-2 items-start border border-line border-l-[3px] ${border} bg-surface rounded-sm px-3.5 py-2.5 text-[13px] text-muted`}>
      {children}
    </div>
  );
}

export function Section({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-section-title">{title}</div>
        {sub && <div className="text-small text-soft mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Plat({ p, className = '' }: { p: string; className?: string }) {
  const meta = PLATFORM[p] ?? { name: p, color: '#8a96a6' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-small ${className}`}>
      <i className="w-2 h-2 rounded-[2.5px] inline-block" style={{ background: meta.color }} />
      {meta.name}
    </span>
  );
}

export function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
