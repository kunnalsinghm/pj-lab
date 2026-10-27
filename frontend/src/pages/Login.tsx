import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

const DEMO = [["Student", "student1@eit.edu"], ["Faculty", "faculty1@eit.edu"], ["Coordinator", "coordinator@eit.edu"], ["HOD", "hod@eit.edu"]];
export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await login(email, password); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-navy-950 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-500 text-lg font-bold text-white">D</div>
          <div><div className="text-lg font-semibold text-slate-900">DeptFlow</div><div className="text-xs text-slate-500">Eastern Institute of Technology · Dept. of CSE</div></div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">Email</span><input className="input" type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">Password</span><input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          {err && <div role="alert" className="rounded-md bg-rose-50 p-2 text-sm text-rose-700">{err}</div>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        </form>
        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="mb-2 text-xs font-medium text-slate-500">Demo accounts (development only, password Demo@1234)</div>
          <div className="grid grid-cols-2 gap-2">{DEMO.map(([r, e]) => <button key={e} type="button" className="btn btn-ghost" onClick={() => { setEmail(e); setPassword("Demo@1234"); }}>{r}</button>)}</div>
        </div>
      </div>
    </div>
  );
}
