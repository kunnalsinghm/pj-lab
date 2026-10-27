import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Card, DataTable, ErrorBox, Field, Page, Pager, Spinner, fmt, fmtT, label, useFetch, useToast } from "../ui";

const STATUSES = ["DRAFT", "UNDER_FACULTY_REVIEW", "RETURNED", "PENDING_HOD", "APPROVED", "REJECTED", "CANCELLED"];

export function Activities() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "", status = sp.get("status") ?? "", page = +(sp.get("page") ?? 1);
  const qs = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (q) qs.set("q", q); if (status) qs.set("status", status);
  const { data, meta, loading, error } = useFetch<any[]>(`/activities?${qs}`);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); setSp(n); };
  const title = user.role === "STUDENT" ? "My requests" : user.role === "FACULTY" ? "Review queue" : "All requests";
  return (
    <Page title={title} actions={user.role === "STUDENT" && <Link to="/activities/new" className="btn btn-primary">New request</Link>}>
      <Card pad={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <input className="input max-w-xs" placeholder="Search by title..." defaultValue={q} onKeyDown={e => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} />
          <select className="input max-w-[14rem]" value={status} onChange={e => set("status", e.target.value)}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
        </div>
        {loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : (
          <DataTable rows={data} empty="No requests match your filters" cols={[
            { h: "ID", r: x => <Link className="font-medium text-teal-700 hover:underline" to={`/activities/${x.id}`}>{x.code}</Link> },
            { h: "Title", r: x => x.title }, { h: "Category", r: x => x.type.name }, { h: "Applicant", r: x => x.applicantName },
            { h: "Status", r: x => <Badge s={x.status} /> }, { h: "Submitted", r: x => fmt(x.submittedAt) },
          ]} />
        )}
        {meta && <Pager page={page} total={meta.total} size={10} onPage={p => set("page", String(p))} />}
      </Card>
    </Page>
  );
}

export function ActivityNew() {
  const nav = useNavigate(); const toast = useToast();
  const { data: types } = useFetch<any[]>("/activity-types");
  const [f, setF] = useState({ typeId: "", title: "", description: "" }), [busy, setBusy] = useState(false);
  const go = async (submit: boolean) => {
    if (!f.typeId || f.title.trim().length < 3 || f.description.trim().length < 3) return toast("Choose a category and fill in title and description (min 3 characters).", "error");
    setBusy(true);
    try {
      const r = await api("/activities", { method: "POST", body: f });
      if (submit) await api(`/activities/${r.data.id}/submit`, { method: "POST", body: {} });
      toast(submit ? "Request submitted" : "Draft saved"); nav(`/activities/${r.data.id}`);
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <Page title="New request" subtitle="Save as a draft or submit straight to your faculty reviewer">
      <Card><form className="max-w-2xl space-y-4" onSubmit={(e: FormEvent) => e.preventDefault()}>
        <Field label="Category"><select className="input" value={f.typeId} onChange={e => setF({ ...f, typeId: e.target.value })}><option value="">Select...</option>{types?.map(t => <option key={t.id} value={t.id}>{t.name}{t.requiresHod ? " (needs HOD approval)" : ""}</option>)}</select></Field>
        <Field label="Title"><input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input min-h-28" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex gap-2"><button className="btn btn-ghost" disabled={busy} onClick={() => go(false)}>Save draft</button><button className="btn btn-primary" disabled={busy} onClick={() => go(true)}>Save and submit</button></div>
      </form></Card>
    </Page>
  );
}

export function ActivityDetail() {
  const { id } = useParams(); const { user } = useAuth(); const toast = useToast();
  const { data: a, loading, error, reload } = useFetch<any>(`/activities/${id}`);
  const [remarks, setRemarks] = useState(""), [busy, setBusy] = useState(false), [edit, setEdit] = useState<any>(null);
  if (loading) return <Spinner />; if (error || !a) return <ErrorBox msg={error} />;
  const isStudent = user.role === "STUDENT";
  const canEdit = isStudent && ["DRAFT", "RETURNED"].includes(a.status);
  const canReview = (user.role === "FACULTY" && a.status === "UNDER_FACULTY_REVIEW") || (user.role === "HOD" && a.status === "PENDING_HOD");
  const act = async (action: string, msg: string, needReason = false) => {
    if (needReason && !remarks.trim()) return toast("Enter remarks / a reason first.", "error");
    if (!confirm(msg)) return;
    setBusy(true);
    try { await api(`/activities/${id}/${action}`, { method: "POST", body: { remarks } }); toast("Done"); setRemarks(""); reload(); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const save = async () => { try { await api(`/activities/${id}`, { method: "PATCH", body: { title: edit.title, description: edit.description } }); toast("Saved"); setEdit(null); reload(); } catch (e: any) { toast(e.message, "error"); } };
  return (
    <Page title={a.title} subtitle={`${a.code} · ${a.type.name}`} actions={<Badge s={a.status} />}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Details" actions={canEdit && !edit && <button className="btn btn-ghost" onClick={() => setEdit({ title: a.title, description: a.description })}>Edit</button>}>
            {edit ? (
              <div className="space-y-3"><Field label="Title"><input className="input" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field><Field label="Description"><textarea className="input min-h-24" value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field><div className="flex gap-2"><button className="btn btn-primary" onClick={save}>Save</button><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div></div>
            ) : (<div className="space-y-2 text-sm"><p className="whitespace-pre-wrap">{a.description}</p>{a.remarks && <p className="rounded-md bg-amber-50 p-2 text-amber-900"><b>Latest remarks:</b> {a.remarks}</p>}
              <dl className="grid grid-cols-2 gap-2 pt-2 text-slate-600"><dt>Reviewer</dt><dd>{a.reviewer?.user?.name ?? "Not assigned yet"}</dd><dt>Submitted</dt><dd>{fmt(a.submittedAt)}</dd><dt>Requires HOD</dt><dd>{a.type.requiresHod ? "Yes" : "No"}</dd></dl></div>)}
          </Card>
          {(isStudent || canReview) && (
            <Card title="Actions"><div className="space-y-3">
              {canReview && <textarea className="input min-h-20" placeholder="Remarks (required to reject or return)" value={remarks} onChange={e => setRemarks(e.target.value)} />}
              <div className="flex flex-wrap gap-2">
                {isStudent && ["DRAFT", "RETURNED"].includes(a.status) && <button className="btn btn-primary" disabled={busy} onClick={() => act("submit", "Submit this request for review?")}>{a.status === "RETURNED" ? "Resubmit" : "Submit"}</button>}
                {isStudent && !["APPROVED", "REJECTED", "CANCELLED"].includes(a.status) && <button className="btn btn-ghost" disabled={busy} onClick={() => act("cancel", "Cancel this request? This cannot be undone.")}>Cancel request</button>}
                {canReview && <><button className="btn btn-primary" disabled={busy} onClick={() => act("approve", "Approve this request?")}>Approve</button><button className="btn btn-ghost" disabled={busy} onClick={() => act("return", "Return for correction?", true)}>Return</button><button className="btn btn-danger" disabled={busy} onClick={() => act("reject", "Reject this request?", true)}>Reject</button></>}
              </div>
              {!canEdit && !canReview && isStudent && <p className="text-xs text-slate-500">No further action is available at this stage.</p>}
            </div></Card>
          )}
        </div>
        <Card title="Approval history">
          {a.actions.length === 0 ? <p className="text-sm text-slate-500">No actions yet.</p> : <ol className="space-y-3 border-l-2 border-slate-200 pl-4">{a.actions.map((h: any) => <li key={h.id} className="text-sm"><div className="font-medium">{label(h.action)} <span className="font-normal text-slate-500">→ {label(h.toStatus)}</span></div><div className="text-xs text-slate-500">{fmtT(h.at)}</div>{h.remarks && <div className="mt-1 rounded bg-slate-50 p-2 text-xs">{h.remarks}</div>}</li>)}</ol>}
        </Card>
      </div>
    </Page>
  );
}
