import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Loader2, Inbox, AlertTriangle } from "lucide-react";
import { api } from "./api";

export function useFetch<T = any>(path: string | null) {
  const [s, set] = useState<{ data: T | null; meta: any; error: string | null; loading: boolean }>({ data: null, meta: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    set(p => ({ ...p, loading: true, error: null }));
    api<T>(path).then(r => live && set({ data: r.data, meta: r.meta ?? null, error: null, loading: false })).catch(e => live && set({ data: null, meta: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [path, tick]);
  return { ...s, reload: () => setTick(t => t + 1) };
}

const ToastCtx = createContext<(m: string, k?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ m: string; k: string } | null>(null);
  const show = (m: string, k: "ok" | "error" = "ok") => { setT({ m, k }); setTimeout(() => setT(null), 3500); };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div role="status" className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-md px-4 py-3 text-sm text-white shadow-lg ${t.k === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>{t.m}</div>}
    </ToastCtx.Provider>
  );
}

const TONES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700", SUBMITTED: "bg-blue-100 text-blue-700", UNDER_FACULTY_REVIEW: "bg-amber-100 text-amber-800",
  RETURNED: "bg-orange-100 text-orange-800", PENDING_HOD: "bg-indigo-100 text-indigo-700", APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700", CANCELLED: "bg-slate-200 text-slate-600", OPEN: "bg-teal-100 text-teal-700",
  PREVIEWED: "bg-sky-100 text-sky-700", PUBLISHED: "bg-emerald-100 text-emerald-700", UG: "bg-sky-100 text-sky-700", PG: "bg-violet-100 text-violet-700",
};
export const label = (s: string) => String(s ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
export const Badge = ({ s }: { s: string }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[s] ?? "bg-slate-100 text-slate-700"}`}>{label(s)}</span>;
export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");
export const fmtT = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");

export const Spinner = () => <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>;
export const Empty = ({ text = "Nothing here yet" }: { text?: string }) => <div className="flex flex-col items-center gap-2 p-10 text-sm text-slate-500"><Inbox className="h-6 w-6" />{text}</div>;
export const ErrorBox = ({ msg }: { msg?: string | null }) => <div className="m-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle className="h-4 w-4" />{msg || "Something went wrong"}</div>;

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold text-slate-900">{title}</h1>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}
export const Card = ({ title, actions, children, pad = true }: { title?: string; actions?: ReactNode; children: ReactNode; pad?: boolean }) => (
  <section className="card">
    {title && <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">{title}</h2>{actions}</div>}
    <div className={pad ? "p-4" : ""}>{children}</div>
  </section>
);
export const Stat = ({ label: l, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <div className="card p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</div><div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>{hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}</div>
);
export const Field = ({ label: l, children }: { label: string; children: ReactNode }) => <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">{l}</span>{children}</label>;

export function DataTable({ cols, rows, empty }: { cols: { h: string; r: (x: any) => ReactNode }[]; rows: any[] | null; empty?: string }) {
  if (!rows?.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{cols.map(c => <th key={c.h} className="px-4 py-2 font-medium">{c.h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={r.id ?? i} className="hover:bg-slate-50">{cols.map(c => <td key={c.h} className="px-4 py-2.5 align-top">{c.r(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
      <span>{total} total</span>
      <div className="flex items-center gap-2"><button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button><span>Page {page} / {pages}</span><button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div>
    </div>
  );
}
