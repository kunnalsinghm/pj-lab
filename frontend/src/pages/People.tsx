import { useState } from "react";
import { Badge, Card, DataTable, ErrorBox, Page, Pager, Spinner, useFetch } from "../ui";

export function Students() {
  const [page, setPage] = useState(1), [level, setLevel] = useState(""), [draft, setDraft] = useState(""), [q, setQ] = useState("");
  const qs = new URLSearchParams({ page: String(page), pageSize: "15" }); if (level) qs.set("level", level); if (q) qs.set("q", q);
  const { data, meta, loading, error } = useFetch<any[]>(`/students?${qs}`);
  return (
    <Page title="Students" subtitle="Enrolled UG and PG students">
      <Card pad={false}>
        <form className="flex flex-wrap gap-3 border-b border-slate-200 p-4" onSubmit={e => { e.preventDefault(); setPage(1); setQ(draft); }}>
          <input className="input max-w-xs" placeholder="Search name or enrollment no..." value={draft} onChange={e => setDraft(e.target.value)} />
          <select className="input max-w-[10rem]" value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}><option value="">UG and PG</option><option value="UG">UG</option><option value="PG">PG</option></select>
          <button className="btn btn-ghost">Search</button>
        </form>
        {loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : <DataTable rows={data} cols={[
          { h: "Enrollment", r: s => s.enrollmentNo }, { h: "Name", r: s => s.user.name }, { h: "Level", r: s => <Badge s={s.level} /> }, { h: "Program", r: s => s.program.name },
          { h: "Sem", r: s => s.semester }, { h: "Batch", r: s => s.batch }, { h: "Advisor", r: s => s.advisor?.user?.name ?? "-" }, { h: "Status", r: s => s.status },
        ]} />}
        {meta && <Pager page={page} total={meta.total} size={15} onPage={setPage} />}
      </Card>
    </Page>
  );
}

export function FacultyList() {
  const { data, loading, error } = useFetch<any[]>("/faculty");
  return (
    <Page title="Faculty" subtitle="Faculty members, advisees and projects">
      <Card pad={false}>{loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : <DataTable rows={data} cols={[
        { h: "Employee ID", r: f => f.employeeId }, { h: "Name", r: f => f.user.name }, { h: "Email", r: f => f.user.email }, { h: "Designation", r: f => f.designation },
        { h: "Research interests", r: f => f.researchInterests }, { h: "Advisees", r: f => f._count.advisees }, { h: "Projects", r: f => f._count.projects },
      ]} />}</Card>
    </Page>
  );
}
