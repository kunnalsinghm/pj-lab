import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, FolderKanban, Shuffle, GraduationCap, Users, BarChart3, ScrollText, Megaphone, Bell, Search, Menu, LogOut, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAuth } from "./auth";
import { useFetch } from "./ui";

const ALL = ["STUDENT", "FACULTY", "COORDINATOR", "HOD"], STAFF = ["COORDINATOR", "HOD"];
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { to: "/activities", label: "Requests", icon: FileText, roles: ALL },
  { to: "/projects", label: "Projects", icon: FolderKanban, roles: ALL },
  { to: "/allocations", label: "Allocation", icon: Shuffle, roles: ALL },
  { to: "/students", label: "Students", icon: GraduationCap, roles: ["FACULTY", ...STAFF] },
  { to: "/faculty", label: "Faculty", icon: Users, roles: STAFF },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: STAFF },
  { to: "/audit", label: "Audit logs", icon: ScrollText, roles: STAFF },
  { to: "/announcements", label: "Announcements", icon: Megaphone, roles: ALL },
];
const CRUMB: Record<string, string> = { activities: "Requests", new: "New", projects: "Projects", allocations: "Allocation", students: "Students", faculty: "Faculty", reports: "Reports", audit: "Audit logs", announcements: "Announcements", notifications: "Notifications" };

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false), [mobile, setMobile] = useState(false), [menu, setMenu] = useState(false), [q, setQ] = useState("");
  const { meta } = useFetch<any[]>(`/notifications?pageSize=1&n=${loc.pathname}`);
  const unread = meta?.unread ?? 0;
  const crumbs = loc.pathname.split("/").filter(Boolean);

  return (
    <div className="flex min-h-screen">
      {mobile && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMobile(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-navy-900 text-slate-300 transition-transform md:static md:translate-x-0 ${mobile ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-16" : "md:w-60"} w-60`}>
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-teal-500 text-sm font-bold text-white">D</div>
          {!collapsed && <div className="leading-tight"><div className="text-sm font-semibold text-white">DeptFlow</div><div className="text-[10px] text-slate-400">Eastern Institute of Technology</div></div>}
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.filter(n => n.roles.includes(user.role)).map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setMobile(false)} title={n.label}
              className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? "bg-teal-600 text-white" : "hover:bg-white/10"}`}>
              <n.icon className="h-4 w-4 shrink-0" />{!collapsed && n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-2 md:block"><button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10" onClick={() => setCollapsed(c => !c)}>{collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}</button></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button className="md:hidden" aria-label="Open menu" onClick={() => setMobile(true)}><Menu className="h-5 w-5" /></button>
          <div className="hidden text-sm text-slate-500 sm:block"><Link to="/" className="hover:text-slate-800">Home</Link>{crumbs.map((c, i) => <span key={i}> / <span className={i === crumbs.length - 1 ? "text-slate-800" : ""}>{CRUMB[c] ?? "Details"}</span></span>)}</div>
          <form className="ml-auto hidden max-w-xs flex-1 md:block" onSubmit={e => { e.preventDefault(); nav(`/activities?q=${encodeURIComponent(q)}`); }}>
            <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="Search requests..." value={q} onChange={e => setQ(e.target.value)} /></div>
          </form>
          <Link to="/notifications" className="relative ml-auto rounded-md p-2 hover:bg-slate-100 md:ml-0" aria-label="Notifications">
            <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
          </Link>
          <div className="relative">
            <button className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100" onClick={() => setMenu(m => !m)}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{user.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</span>
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                <div className="border-b border-slate-100 px-2 pb-2"><div className="text-sm font-medium">{user.name}</div><div className="text-xs text-slate-500">{user.email}</div><div className="mt-1 text-[10px] font-semibold uppercase text-teal-700">{user.role}</div></div>
                <button className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100" onClick={logout}><LogOut className="h-4 w-4" />Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
