import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Card, Empty, ErrorBox, Field, Page, Spinner, useFetch, useToast } from "../ui";

function PrefForm({ p, onDone }: { p: any; onDone: () => void }) {
  const toast = useToast(); const [rank, setRank] = useState(1), [statement, setStatement] = useState("");
  const go = async () => { try { await api(`/projects/${p.id}/preferences`, { method: "POST", body: { rank, statement } }); toast("Preference saved"); onDone(); } catch (e: any) { toast(e.message, "error"); } };
  return (
    <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
      <Field label="Rank"><select className="input" value={rank} onChange={e => setRank(+e.target.value)}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}{n === 1 ? " (top choice)" : ""}</option>)}</select></Field>
      <Field label="Statement of interest"><textarea className="input" value={statement} onChange={e => setStatement(e.target.value)} /></Field>
      <button className="btn btn-primary" onClick={go}>Save preference</button>
    </div>
  );
}

function NewProject({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", description: "", domain: "", prerequisites: "", capacity: 3, UG: true, PG: true });
  const go = async () => {
    const eligibleLevels = [f.UG && "UG", f.PG && "PG"].filter(Boolean);
    try { await api("/projects", { method: "POST", body: { title: f.title, description: f.description, domain: f.domain, prerequisites: f.prerequisites, capacity: Number(f.capacity), eligibleLevels } }); toast("Project created"); onDone(); } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <Card title="New research project"><div className="grid gap-3 md:grid-cols-2">
      <Field label="Title"><input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Research domain"><input className="input" value={f.domain} onChange={e => setF({ ...f, domain: e.target.value })} /></Field>
      <div className="md:col-span-2"><Field label="Description"><textarea className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field></div>
      <Field label="Prerequisites"><input className="input" value={f.prerequisites} onChange={e => setF({ ...f, prerequisites: e.target.value })} /></Field>
      <Field label="Capacity"><input className="input" type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /></Field>
      <div className="flex items-center gap-4 text-sm"><label className="flex items-center gap-1"><input type="checkbox" checked={f.UG} onChange={e => setF({ ...f, UG: e.target.checked })} />UG</label><label className="flex items-center gap-1"><input type="checkbox" checked={f.PG} onChange={e => setF({ ...f, PG: e.target.checked })} />PG</label></div>
      <div><button className="btn btn-primary" onClick={go}>Create project</button></div>
    </div></Card>
  );
}

export default function Projects() {
  const { user } = useAuth(); const toast = useToast();
  const [draft, setDraft] = useState(""), [q, setQ] = useState(""), [open, setOpen] = useState<string | null>(null), [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useFetch<any[]>(`/projects?q=${encodeURIComponent(q)}`);
  const prefs = useFetch<any[]>(user.role === "STUDENT" ? "/preferences" : null);
  const remove = async (id: string) => { try { await api(`/projects/${id}/preferences`, { method: "DELETE" }); toast("Preference removed"); prefs.reload(); } catch (e: any) { toast(e.message, "error"); } };
  return (
    <Page title="Research projects" subtitle="Browse projects, check seats and supervisors" actions={user.role === "FACULTY" && <button className="btn btn-primary" onClick={() => setCreating(c => !c)}>{creating ? "Close" : "New project"}</button>}>
      {creating && <NewProject onDone={() => { setCreating(false); reload(); }} />}
      {user.role === "STUDENT" && (
        <Card title="My preferences (max 3)">
          {!prefs.data?.length ? <p className="text-sm text-slate-500">No preferences yet. Choose "Rank this project" on a card below.</p> :
            <ul className="space-y-2 text-sm">{prefs.data.map(p => <li key={p.id} className="flex items-center justify-between gap-2"><span><b>#{p.rank}</b> {p.project.title}</span><button className="btn btn-ghost" onClick={() => remove(p.projectId)}>Remove</button></li>)}</ul>}
        </Card>
      )}
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQ(draft); }}><input className="input max-w-sm" placeholder="Search title or domain..." value={draft} onChange={e => setDraft(e.target.value)} /><button className="btn btn-ghost">Search</button></form>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : !data?.length ? <Empty text="No projects found" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-slate-900">{p.title}</h3><span className={`whitespace-nowrap text-xs font-medium ${p.seatsLeft > 0 ? "text-emerald-700" : "text-rose-700"}`}>{p.seatsLeft > 0 ? `${p.seatsLeft} seat${p.seatsLeft > 1 ? "s" : ""} left` : "Full"}</span></div>
              <div className="mt-1 text-xs text-slate-500">{p.supervisorName} · {p.domain}</div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">{p.eligibleLevels.split(",").map((l: string) => <Badge key={l} s={l} />)}<span className="text-xs text-slate-500">{p.taken}/{p.capacity} filled</span></div>
              {user.role === "STUDENT" && <button className="btn btn-ghost mt-3" onClick={() => setOpen(open === p.id ? null : p.id)}>Rank this project</button>}
              {open === p.id && <PrefForm p={p} onDone={() => { setOpen(null); prefs.reload(); }} />}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
