import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Card, DataTable, Empty, ErrorBox, Field, Page, Pager, Spinner, fmt, fmtT, label, useFetch, useToast } from "../ui";

export function Notifications() {
  const nav = useNavigate(); const toast = useToast();
  const { data, loading, error, reload } = useFetch<any[]>("/notifications?pageSize=50");
  const open = async (n: any) => { try { if (!n.read) await api(`/notifications/${n.id}/read`, { method: "PATCH" }); } catch {} reload(); if (n.link) nav(n.link); };
  const all = async () => { try { await api("/notifications/read-all", { method: "POST" }); toast("All marked as read"); reload(); } catch (e: any) { toast(e.message, "error"); } };
  return (
    <Page title="Notifications" actions={<button className="btn btn-ghost" onClick={all}>Mark all as read</button>}>
      <Card pad={false}>{loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : !data?.length ? <Empty text="No notifications" /> :
        <ul className="divide-y divide-slate-100">{data.map(n => (
          <li key={n.id}><button className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? "" : "bg-teal-50/50"}`} onClick={() => open(n)}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-300" : "bg-teal-600"}`} /><span className="flex-1 text-sm">{n.message}<span className="block text-xs text-slate-500">{fmtT(n.at)}</span></span>
          </button></li>))}</ul>}
      </Card>
    </Page>
  );
}

const REPORTS: [string, string][] = [["request-status", "Request status"], ["allocation", "Allocation and capacity"], ["unallocated", "Unallocated students"], ["faculty-workload", "Faculty workload"], ["rejected", "Rejected requests"]];
export function Reports() {
  const [sel, setSel] = useState(REPORTS[0][0]);
  const { data, loading, error } = useFetch<any[]>(`/reports/${sel}`);
  const keys = data?.length ? Object.keys(data[0]) : [];
  return (
    <Page title="Reports" subtitle="Generated from live database records" actions={<a className="btn btn-primary" href={`/api/reports/${sel}?format=csv`}>Download CSV</a>}>
      <div className="flex flex-wrap gap-2">{REPORTS.map(([k, l]) => <button key={k} className={`btn ${sel === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setSel(k)}>{l}</button>)}</div>
      <Card pad={false}>{loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : <DataTable rows={data} cols={keys.map(k => ({ h: label(k), r: (x: any) => String(x[k] ?? "") }))} />}</Card>
    </Page>
  );
}

export function Audit() {
  const [page, setPage] = useState(1);
  const { data, meta, loading, error } = useFetch<any[]>(`/audit-logs?page=${page}&pageSize=20`);
  return (
    <Page title="Audit logs" subtitle="Recorded system and workflow actions">
      <Card pad={false}>{loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : <DataTable rows={data} cols={[{ h: "When", r: x => fmtT(x.at) }, { h: "Action", r: x => label(x.action) }, { h: "Entity", r: x => x.entity }, { h: "Detail", r: x => x.detail ?? "" }]} />}
        {meta && <Pager page={page} total={meta.total} size={20} onPage={setPage} />}</Card>
    </Page>
  );
}

export function Announcements() {
  const { user } = useAuth(); const toast = useToast();
  const { data, loading, error, reload } = useFetch<any[]>("/announcements");
  const [f, setF] = useState({ title: "", body: "" });
  const post = async (e: FormEvent) => { e.preventDefault(); try { await api("/announcements", { method: "POST", body: f }); toast("Announcement published"); setF({ title: "", body: "" }); reload(); } catch (x: any) { toast(x.message, "error"); } };
  return (
    <Page title="Announcements">
      {user.role === "HOD" && <Card title="Publish announcement"><form className="max-w-xl space-y-3" onSubmit={post}>
        <Field label="Title"><input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><textarea className="input min-h-20" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></Field>
        <button className="btn btn-primary" disabled={f.title.length < 3 || f.body.length < 3}>Publish</button></form></Card>}
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : !data?.length ? <Empty text="No announcements" /> :
        <div className="space-y-3">{data.map(a => <Card key={a.id}><div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold">{a.title}</h3><span className="text-xs text-slate-500">{fmt(a.publishedAt)}</span></div><p className="mt-1 text-sm text-slate-600">{a.body}</p></Card>)}</div>}
    </Page>
  );
}
