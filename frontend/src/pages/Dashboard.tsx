import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useAuth } from "../auth";
import { Badge, Card, DataTable, ErrorBox, Page, Spinner, Stat, fmt, fmtT, label, useFetch } from "../ui";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, loading, error } = useFetch<any>("/dashboard");
  if (loading) return <Spinner />;
  if (error || !d) return <ErrorBox msg={error} />;
  const first = user.name.split(" ")[0];

  if (user.role === "STUDENT") return (
    <Page title={`Welcome, ${first}`} subtitle="Your requests, project preferences and allocation" actions={<Link to="/activities/new" className="btn btn-primary">New request</Link>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="My requests" value={d.myRequests} /><Stat label="Pending approval" value={d.pendingApprovals} />
        <Stat label="Returned for correction" value={d.returned} hint={d.returned ? "Needs your attention" : undefined} /><Stat label="Project preferences" value={`${d.preferences ?? 0} / 3`} />
      </div>
      <Card title="My project allocation">
        {d.allocation ? (
          <div><div className="text-base font-semibold">{d.allocation.project.title}</div><div className="text-sm text-slate-500">Supervisor: {d.allocation.project.supervisor.user.name} · {d.allocation.project.domain}</div></div>
        ) : <div className="text-sm text-slate-500">No allocation yet. <Link className="text-teal-700 underline" to="/projects">Browse projects and rank up to three preferences.</Link></div>}
      </Card>
    </Page>
  );

  if (user.role === "FACULTY") return (
    <Page title={`Welcome, ${user.name}`} subtitle="Reviews, projects and deadlines">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Assigned students" value={d.assignedStudents} /><Stat label="Pending reviews" value={d.pendingReviews} /><Stat label="Active projects" value={d.activeProjects} />
      </div>
      <Card title="Upcoming project deadlines" pad={false}>
        <DataTable rows={d.upcomingDeadlines} empty="No upcoming deadlines" cols={[{ h: "Milestone", r: x => x.title }, { h: "Project", r: x => x.project.title }, { h: "Due", r: x => fmt(x.dueDate) }]} />
      </Card>
      <Link to="/activities" className="btn btn-primary w-fit">Open review queue</Link>
    </Page>
  );

  const COLORS = ["#0d9488", "#6366f1"];
  return (
    <Page title={user.role === "HOD" ? "Head of Department dashboard" : "Coordinator dashboard"} subtitle="Department of Computer Science and Engineering">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="UG students" value={d.ugStudents} /><Stat label="PG students" value={d.pgStudents} /><Stat label="Faculty" value={d.faculty} /><Stat label="Pending approvals" value={d.pendingApprovals} />
        <Stat label="Active projects" value={d.activeProjects} /><Stat label="Awaiting allocation" value={d.unallocatedStudents} /><Stat label="Available seats" value={d.availableSeats} />
        <Stat label="Allocation rounds" value={d.allocationRounds.length} hint={d.allocationRounds.map((r: any) => `${r.name}: ${label(r.status)}`).join(" · ")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><Card title="Requests by status">
          <ResponsiveContainer width="100%" height={240}><BarChart data={d.requestsByStatus}><XAxis dataKey="status" tickFormatter={label} fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip labelFormatter={label} /><Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </Card></div>
        <Card title="UG / PG distribution">
          <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={[{ name: "UG", value: d.ugStudents }, { name: "PG", value: d.pgStudents }]} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>{COLORS.map(c => <Cell key={c} fill={c} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {user.role === "HOD" && <Card title="Pending HOD decisions" pad={false}>
          <DataTable rows={d.pendingHodDecisions} empty="Nothing awaiting your decision" cols={[{ h: "Request", r: x => <Link className="text-teal-700 hover:underline" to={`/activities/${x.id}`}>{x.code}</Link> }, { h: "Title", r: x => x.title }, { h: "Type", r: x => x.type.name }]} />
        </Card>}
        <Card title="Recent activity" pad={false}>
          <DataTable rows={d.recentActivity} cols={[{ h: "When", r: x => fmtT(x.at) }, { h: "Action", r: x => label(x.action) }, { h: "Detail", r: x => x.detail ?? "" }]} />
        </Card>
      </div>
    </Page>
  );
}
