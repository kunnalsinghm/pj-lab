import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Card, DataTable, ErrorBox, Field, Page, Spinner, label, useFetch, useToast } from "../ui";

const allocCols = [
  { h: "Student", r: (a: any) => `${a.student.user.name} (${a.student.enrollmentNo})` },
  { h: "Project", r: (a: any) => a.project.title },
  { h: "Supervisor", r: (a: any) => a.project.supervisor.user.name },
  { h: "Rank", r: (a: any) => a.rank ?? (a.reason ? "Manual" : "-") },
];

function StudentAlloc() {
  const { data, loading, error } = useFetch<any[]>("/allocations");
  if (loading) return <Spinner />; if (error) return <ErrorBox msg={error} />;
  return (
    <Page title="My allocation" subtitle="Published project allocations appear here">
      <Card pad={false}><DataTable rows={data} empty="No allocation published for you yet" cols={allocCols.slice(1)} /></Card>
    </Page>
  );
}

function PendingRound({ round, onChange }: { round: any; onChange: () => void }) {
  const toast = useToast();
  const { data, loading } = useFetch<any[]>(`/allocations?roundId=${round.id}&active=false`);
  const decide = async (kind: "approve" | "reject") => {
    let body: any = {};
    if (kind === "reject") { const r = prompt("Reason for rejecting this batch (required):"); if (!r || r.trim().length < 3) return; body = { remarks: r }; }
    else if (!confirm(`Approve and publish ${data?.length ?? 0} allocations?`)) return;
    try { await api(`/allocations/${round.id}/${kind}`, { method: "POST", body }); toast(kind === "approve" ? "Allocations published" : "Batch rejected"); onChange(); } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <Card title={`${round.name}: proposed allocations`} actions={<div className="flex gap-2"><button className="btn btn-primary" onClick={() => decide("approve")}>Approve and publish</button><button className="btn btn-danger" onClick={() => decide("reject")}>Reject</button></div>} pad={false}>
      {loading ? <Spinner /> : <DataTable rows={data} cols={allocCols} />}
    </Card>
  );
}

function StaffAlloc() {
  const { user } = useAuth(); const toast = useToast();
  const isC = user.role === "COORDINATOR", isH = user.role === "HOD";
  const rounds = useFetch<any[]>("/allocations/rounds");
  const pub = useFetch<any[]>("/allocations?active=true");
  const studs = useFetch<any[]>(isC ? "/students?pageSize=100" : null);
  const projs = useFetch<any[]>("/projects");
  const [name, setName] = useState(""), [sel, setSel] = useState(""), [preview, setPreview] = useState<any>(null), [busy, setBusy] = useState(false);
  const [man, setMan] = useState({ studentId: "", projectId: "", reason: "" });
  const refresh = () => { rounds.reload(); pub.reload(); projs.reload(); };
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); toast(ok); refresh(); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); } };
  const sName = (id: string) => { const s = studs.data?.find(x => x.id === id); return s ? `${s.user.name} (${s.enrollmentNo})` : id; };
  const pName = (id: string) => projs.data?.find(x => x.id === id)?.title ?? id;
  const openRounds = rounds.data?.filter(r => ["OPEN", "PREVIEWED"].includes(r.status)) ?? [];
  const pending = rounds.data?.filter(r => r.status === "PENDING_HOD") ?? [];
  if (rounds.loading) return <Spinner />; if (rounds.error) return <ErrorBox msg={rounds.error} />;

  return (
    <Page title="Project allocation" subtitle={isC ? "Preview, adjust and submit allocation batches for HOD approval" : "Review proposed batches and published allocations"}>
      <Card title="Allocation rounds" pad={false}>
        <DataTable rows={rounds.data} cols={[{ h: "Round", r: r => r.name }, { h: "Status", r: r => <Badge s={r.status} /> }]} />
        {isC && <form className="flex gap-2 border-t border-slate-200 p-4" onSubmit={e => { e.preventDefault(); run(async () => { await api("/allocations/rounds", { method: "POST", body: { name } }); setName(""); }, "Round created"); }}>
          <input className="input max-w-xs" placeholder="New round name" value={name} onChange={e => setName(e.target.value)} /><button className="btn btn-ghost" disabled={busy || name.length < 3}>Create round</button></form>}
      </Card>

      {isC && openRounds.length > 0 && (
        <Card title="Run allocation"><div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Round"><select className="input" value={sel} onChange={e => { setSel(e.target.value); setPreview(null); }}><option value="">Select round...</option>{openRounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <button className="btn btn-ghost" disabled={!sel || busy} onClick={() => run(async () => setPreview((await api("/allocations/preview", { method: "POST", body: { roundId: sel } })).data), "Preview ready")}>Preview allocation</button>
            <button className="btn btn-primary" disabled={!sel || busy} onClick={() => { if (confirm("Submit this allocation for HOD approval? Manual additions for this round are included.")) run(async () => { await api("/allocations/finalize", { method: "POST", body: { roundId: sel } }); setPreview(null); setSel(""); }, "Submitted to HOD"); }}>Finalize and send to HOD</button>
          </div>
          {preview && <div className="space-y-2">
            <p className="text-sm text-slate-600"><b>{preview.allocations.length}</b> students would be allocated, <b>{preview.unallocated.length}</b> remain unallocated.</p>
            <DataTable rows={preview.allocations.map((a: any) => ({ ...a, id: a.studentId }))} cols={[{ h: "Student", r: a => sName(a.studentId) }, { h: "Project", r: a => pName(a.projectId) }, { h: "Preference rank", r: a => a.rank }]} />
          </div>}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold">Manual allocation (added to the selected round)</h3>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Student"><select className="input" value={man.studentId} onChange={e => setMan({ ...man, studentId: e.target.value })}><option value="">Select...</option>{studs.data?.map(s => <option key={s.id} value={s.id}>{s.enrollmentNo} · {s.user.name}</option>)}</select></Field>
              <Field label="Project"><select className="input" value={man.projectId} onChange={e => setMan({ ...man, projectId: e.target.value })}><option value="">Select...</option>{projs.data?.map(p => <option key={p.id} value={p.id}>{p.title} ({p.seatsLeft} left)</option>)}</select></Field>
              <Field label="Reason"><input className="input" value={man.reason} onChange={e => setMan({ ...man, reason: e.target.value })} /></Field>
              <div className="flex items-end"><button className="btn btn-ghost" disabled={busy || !sel || !man.studentId || !man.projectId || man.reason.length < 3} onClick={() => run(async () => { await api("/allocations/manual", { method: "POST", body: { roundId: sel, ...man } }); setMan({ studentId: "", projectId: "", reason: "" }); }, "Manual allocation added")}>Add</button></div>
            </div>
          </div>
        </div></Card>
      )}

      {isH && pending.map(r => <PendingRound key={r.id} round={r} onChange={refresh} />)}
      {isH && pending.length === 0 && <Card><p className="text-sm text-slate-500">No allocation batches are waiting for your approval.</p></Card>}

      <Card title="Published allocations" pad={false}>{pub.loading ? <Spinner /> : <DataTable rows={pub.data} empty="No allocations published yet" cols={allocCols} />}</Card>
    </Page>
  );
}

export default function Allocations() {
  const { user } = useAuth();
  return user.role === "STUDENT" ? <StudentAlloc /> : <StaffAlloc />;
}
