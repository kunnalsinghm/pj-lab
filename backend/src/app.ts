import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db.ts";
import { auth, requireRole, signToken } from "./auth.ts";
import { applyAction, WorkflowError } from "./domain/workflow.ts";
import { allocate, validatePrefs, isEligible } from "./domain/allocation.ts";

class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
const wrap = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
const page = (q: any) => { const p = Math.max(1, +q.page || 1), s = Math.min(100, Math.max(1, +q.pageSize || 20)); return { skip: (p - 1) * s, take: s, p, s }; };
const audit = (c: any, actorId: string | null, action: string, entity: string, entityId?: string, detail?: string) => c.auditLog.create({ data: { actorId, action, entity, entityId, detail } });
const notify = (c: any, userId: string, message: string, link?: string) => c.notification.create({ data: { userId, message, link } });
const levels = (s: string) => s.split(",");
const pub = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
const studentOf = (userId: string) => prisma.studentProfile.findUnique({ where: { userId } });
const facultyOf = (userId: string) => prisma.facultyProfile.findUnique({ where: { userId } });
const csv = (rows: any[]) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: any) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
};
const STUDENT = requireRole("STUDENT"), FACULTY = requireRole("FACULTY"), COORD = requireRole("COORDINATOR"), HOD = requireRole("HOD");

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  const r = express.Router();
  app.use("/api", r);

  r.get("/health", (_q, res) => res.json({ data: { status: "ok", time: new Date().toISOString() } }));

  // ---------- Auth ----------
  r.post("/auth/login", wrap(async (req: any, res: any) => {
    const b = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
    const ok = u && u.active && (await bcrypt.compare(b.password, u.passwordHash));
    if (!ok) throw new HttpError(401, "Invalid email or password");
    const token = signToken(u);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 3600e3 });
    res.json({ data: { token, user: pub(u) } });
  }));
  r.post("/auth/logout", (_q, res) => { res.clearCookie("token"); res.json({ data: { ok: true } }); });
  r.get("/auth/me", auth, (req: any, res) => res.json({ data: pub(req.user) }));
  r.patch("/auth/me", auth, wrap(async (req: any, res: any) => {
    const b = z.object({ name: z.string().min(2).optional(), password: z.string().min(8).optional(), currentPassword: z.string().optional() }).parse(req.body);
    const data: any = {};
    if (b.name) data.name = b.name;
    if (b.password) {
      const u: any = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!b.currentPassword || !(await bcrypt.compare(b.currentPassword, u.passwordHash))) throw new HttpError(400, "Current password is incorrect");
      data.passwordHash = await bcrypt.hash(b.password, 10);
    }
    res.json({ data: pub(await prisma.user.update({ where: { id: req.user.id }, data })) });
  }));

  // ---------- Dashboard ----------
  r.get("/dashboard", auth, wrap(async (req: any, res: any) => {
    const u = req.user; const d: any = { role: u.role };
    const cnt = (m: string, where: any = {}) => (prisma as any)[m].count({ where });
    d.unreadNotifications = await cnt("notification", { userId: u.id, read: false });
    if (u.role === "STUDENT") {
      const sp = await studentOf(u.id);
      d.myRequests = await cnt("activityRequest", { applicantId: u.id });
      d.pendingApprovals = await cnt("activityRequest", { applicantId: u.id, status: { in: ["UNDER_FACULTY_REVIEW", "PENDING_HOD"] } });
      d.returned = await cnt("activityRequest", { applicantId: u.id, status: "RETURNED" });
      if (sp) {
        d.preferences = await cnt("projectPreference", { studentId: sp.id });
        d.allocation = await prisma.projectAllocation.findFirst({ where: { studentId: sp.id, active: true }, include: { project: { include: { supervisor: { include: { user: true } } } } } });
      }
    } else if (u.role === "FACULTY") {
      const f: any = await facultyOf(u.id);
      d.assignedStudents = await cnt("studentProfile", { advisorId: f.id });
      d.pendingReviews = await cnt("activityRequest", { reviewerId: f.id, status: "UNDER_FACULTY_REVIEW" });
      d.activeProjects = await cnt("project", { supervisorId: f.id, open: true });
      d.upcomingDeadlines = await prisma.projectMilestone.findMany({ where: { project: { supervisorId: f.id }, dueDate: { gte: new Date() } }, orderBy: { dueDate: "asc" }, take: 5, include: { project: true } });
    } else {
      d.ugStudents = await cnt("studentProfile", { level: "UG" });
      d.pgStudents = await cnt("studentProfile", { level: "PG" });
      d.faculty = await cnt("facultyProfile");
      d.pendingApprovals = await cnt("activityRequest", { status: u.role === "HOD" ? "PENDING_HOD" : { in: ["UNDER_FACULTY_REVIEW", "PENDING_HOD"] } });
      d.activeProjects = await cnt("project", { open: true });
      const allocated = await cnt("projectAllocation", { active: true });
      d.unallocatedStudents = d.ugStudents + d.pgStudents - allocated;
      const open = await prisma.project.findMany({ where: { open: true } });
      d.availableSeats = open.reduce((a, p) => a + p.capacity, 0) - allocated;
      d.requestsByStatus = (await prisma.activityRequest.groupBy({ by: ["status"], _count: true })).map(x => ({ status: x.status, count: x._count }));
      d.allocationRounds = await prisma.allocationRound.findMany({ orderBy: { id: "asc" } });
      d.recentActivity = await prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 10 });
      if (u.role === "HOD") d.pendingHodDecisions = await prisma.activityRequest.findMany({ where: { status: "PENDING_HOD" }, take: 10, include: { type: true } });
    }
    res.json({ data: d });
  }));

  // ---------- Activities ----------
  r.get("/activity-types", auth, wrap(async (_q: any, res: any) => res.json({ data: await prisma.activityType.findMany({ where: { active: true }, orderBy: { name: "asc" } }) })));

  r.get("/activities", auth, wrap(async (req: any, res: any) => {
    const { skip, take, p } = page(req.query); const where: any = {};
    if (req.user.role === "STUDENT") where.applicantId = req.user.id;
    if (req.user.role === "FACULTY") where.reviewerId = ((await facultyOf(req.user.id)) as any)?.id ?? "none";
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.q) where.title = { contains: String(req.query.q) };
    const [total, rows] = await Promise.all([prisma.activityRequest.count({ where }), prisma.activityRequest.findMany({ where, skip, take, include: { type: true }, orderBy: { createdAt: "desc" } })]);
    const users = await prisma.user.findMany({ where: { id: { in: rows.map(x => x.applicantId) } }, select: { id: true, name: true } });
    const nm = new Map(users.map(x => [x.id, x.name]));
    res.json({ data: rows.map(x => ({ ...x, applicantName: nm.get(x.applicantId) })), meta: { page: p, total } });
  }));

  r.post("/activities", auth, STUDENT, wrap(async (req: any, res: any) => {
    const b = z.object({ title: z.string().min(3), description: z.string().min(3), typeId: z.string() }).parse(req.body);
    const term = await prisma.academicTerm.findFirst({ where: { current: true } });
    if (!term) throw new HttpError(500, "No current academic term configured");
    if (!(await prisma.activityType.findFirst({ where: { id: b.typeId, active: true } }))) throw new HttpError(400, "Unknown activity type");
    const code = `REQ-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const row = await prisma.$transaction(async (tx: any) => {
      const c = await tx.activityRequest.create({ data: { ...b, code, applicantId: req.user.id, termId: term.id, status: "DRAFT" } });
      await audit(tx, req.user.id, "REQUEST_CREATED", "ActivityRequest", c.id, code);
      return c;
    });
    res.status(201).json({ data: row });
  }));

  async function loadRequest(req: any) {
    const row: any = await prisma.activityRequest.findUnique({ where: { id: req.params.id }, include: { type: true, reviewer: { include: { user: true } }, actions: { orderBy: { at: "asc" } } } });
    if (!row) throw new HttpError(404, "Request not found");
    const role = req.user.role;
    if (role === "STUDENT" && row.applicantId !== req.user.id) throw new HttpError(403, "Not your request");
    if (role === "FACULTY" && row.reviewer?.userId !== req.user.id) throw new HttpError(403, "Not assigned to you");
    return row;
  }
  r.get("/activities/:id", auth, wrap(async (req: any, res: any) => res.json({ data: await loadRequest(req) })));

  r.patch("/activities/:id", auth, STUDENT, wrap(async (req: any, res: any) => {
    const row = await loadRequest(req);
    if (!["DRAFT", "RETURNED"].includes(row.status)) throw new HttpError(409, "Only drafts or returned requests can be edited");
    const b = z.object({ title: z.string().min(3).optional(), description: z.string().min(3).optional(), typeId: z.string().optional() }).parse(req.body);
    res.json({ data: await prisma.activityRequest.update({ where: { id: row.id }, data: b }) });
  }));

  const transition = (action: "SUBMIT" | "APPROVE" | "REJECT" | "RETURN" | "CANCEL") => wrap(async (req: any, res: any) => {
    const remarks = typeof req.body?.remarks === "string" ? req.body.remarks.trim() : undefined;
    const out = await prisma.$transaction(async (tx: any) => {
      const row = await tx.activityRequest.findUnique({ where: { id: req.params.id }, include: { type: true, reviewer: true } });
      if (!row) throw new HttpError(404, "Request not found");
      const { status: to } = applyAction({ status: row.status, applicantId: row.applicantId, reviewerId: row.reviewer?.userId ?? null, requiresHod: row.type.requiresHod }, action, { id: req.user.id, role: req.user.role }, remarks);
      const data: any = { status: to };
      if (remarks) data.remarks = remarks;
      if (action === "SUBMIT") {
        data.submittedAt = new Date();
        if (!row.reviewerId) {
          const sp = await tx.studentProfile.findUnique({ where: { userId: row.applicantId } });
          const fac = sp?.advisorId ? { id: sp.advisorId } : await tx.facultyProfile.findFirst({ orderBy: { employeeId: "asc" } });
          if (!fac) throw new HttpError(409, "No faculty reviewer available");
          data.reviewerId = fac.id;
        }
      }
      const upd = await tx.activityRequest.updateMany({ where: { id: row.id, status: row.status }, data }); // optimistic lock: blocks double actions
      if (upd.count === 0) throw new HttpError(409, "Request was changed by someone else; reload and retry");
      await tx.approvalAction.create({ data: { requestId: row.id, actorId: req.user.id, action, fromStatus: row.status, toStatus: to, remarks } });
      await audit(tx, req.user.id, `REQUEST_${action}`, "ActivityRequest", row.id, `${row.status} -> ${to}`);
      const link = `/activities/${row.id}`;
      if (req.user.id !== row.applicantId) await notify(tx, row.applicantId, `Your request ${row.code} is now ${to.replace(/_/g, " ").toLowerCase()}`, link);
      if (action === "SUBMIT") { const rv = await tx.facultyProfile.findUnique({ where: { id: data.reviewerId ?? row.reviewerId } }); if (rv) await notify(tx, rv.userId, `New request ${row.code} awaits your review`, link); }
      if (to === "PENDING_HOD") for (const h of await tx.user.findMany({ where: { role: "HOD" } })) await notify(tx, h.id, `Request ${row.code} awaits HOD approval`, link);
      return tx.activityRequest.findUnique({ where: { id: row.id } });
    });
    res.json({ data: out });
  });
  r.post("/activities/:id/submit", auth, STUDENT, transition("SUBMIT"));
  r.post("/activities/:id/cancel", auth, STUDENT, transition("CANCEL"));
  r.post("/activities/:id/approve", auth, requireRole("FACULTY", "HOD"), transition("APPROVE"));
  r.post("/activities/:id/reject", auth, requireRole("FACULTY", "HOD"), transition("REJECT"));
  r.post("/activities/:id/return", auth, requireRole("FACULTY", "HOD"), transition("RETURN"));

  // ---------- Projects ----------
  const taken = async () => new Map((await prisma.projectAllocation.groupBy({ by: ["projectId"], where: { active: true }, _count: true })).map(x => [x.projectId, x._count]));
  const shape = (p: any, t: Map<string, number>) => ({ ...p, supervisorName: p.supervisor?.user?.name, taken: t.get(p.id) ?? 0, seatsLeft: p.capacity - (t.get(p.id) ?? 0) });

  r.get("/projects", auth, wrap(async (req: any, res: any) => {
    const where: any = {};
    if (req.query.q) where.OR = [{ title: { contains: String(req.query.q) } }, { domain: { contains: String(req.query.q) } }];
    if (req.query.domain) where.domain = String(req.query.domain);
    if (req.query.open !== undefined) where.open = req.query.open === "true";
    if (req.query.level) where.eligibleLevels = { contains: String(req.query.level) };
    const [rows, t] = await Promise.all([prisma.project.findMany({ where, include: { supervisor: { include: { user: true } } }, orderBy: { title: "asc" } }), taken()]);
    res.json({ data: rows.map(p => shape(p, t)) });
  }));
  const projectBody = z.object({ title: z.string().min(3), description: z.string().min(3), domain: z.string().min(2), prerequisites: z.string().optional(), capacity: z.number().int().min(1).max(50), eligibleLevels: z.array(z.enum(["UG", "PG"])).min(1), open: z.boolean().optional() });
  r.post("/projects", auth, FACULTY, wrap(async (req: any, res: any) => {
    const b = projectBody.parse(req.body); const f: any = await facultyOf(req.user.id);
    const row = await prisma.$transaction(async (tx: any) => {
      const p = await tx.project.create({ data: { ...b, eligibleLevels: b.eligibleLevels.join(","), supervisorId: f.id } });
      await audit(tx, req.user.id, "PROJECT_CREATED", "Project", p.id, p.title); return p;
    });
    res.status(201).json({ data: row });
  }));
  async function ownProject(req: any) {
    const p: any = await prisma.project.findUnique({ where: { id: req.params.id }, include: { supervisor: { include: { user: true } } } });
    if (!p) throw new HttpError(404, "Project not found");
    return p;
  }
  r.get("/projects/:id", auth, wrap(async (req: any, res: any) => {
    const p = await ownProject(req);
    res.json({ data: { ...shape(p, await taken()), milestones: await prisma.projectMilestone.findMany({ where: { projectId: p.id }, orderBy: { dueDate: "asc" } }) } });
  }));
  r.patch("/projects/:id", auth, requireRole("FACULTY", "COORDINATOR"), wrap(async (req: any, res: any) => {
    const p = await ownProject(req);
    if (req.user.role === "FACULTY" && p.supervisor.userId !== req.user.id) throw new HttpError(403, "Only the supervisor can edit this project");
    const b: any = projectBody.partial().parse(req.body);
    if (b.capacity !== undefined && b.capacity < (await taken()).get(p.id)!) throw new HttpError(409, "Capacity cannot be below current allocations");
    if (b.eligibleLevels) b.eligibleLevels = b.eligibleLevels.join(",");
    const row = await prisma.$transaction(async (tx: any) => { const u = await tx.project.update({ where: { id: p.id }, data: b }); await audit(tx, req.user.id, "PROJECT_UPDATED", "Project", p.id); return u; });
    res.json({ data: row });
  }));
  r.post("/projects/:id/milestones", auth, FACULTY, wrap(async (req: any, res: any) => {
    const p = await ownProject(req);
    if (p.supervisor.userId !== req.user.id) throw new HttpError(403, "Only the supervisor can add milestones");
    const b = z.object({ title: z.string().min(2), dueDate: z.coerce.date() }).parse(req.body);
    res.status(201).json({ data: await prisma.projectMilestone.create({ data: { ...b, projectId: p.id } }) });
  }));
  r.post("/milestones/:id/reports", auth, STUDENT, wrap(async (req: any, res: any) => {
    const b = z.object({ summary: z.string().min(3) }).parse(req.body);
    const m: any = await prisma.projectMilestone.findUnique({ where: { id: req.params.id } });
    const sp: any = await studentOf(req.user.id);
    if (!m || !(await prisma.projectAllocation.findFirst({ where: { studentId: sp.id, projectId: m.projectId, active: true } }))) throw new HttpError(403, "You are not allocated to this project");
    res.status(201).json({ data: await prisma.progressReport.create({ data: { milestoneId: m.id, studentId: sp.id, summary: b.summary } }) });
  }));
  r.patch("/reports/:id/feedback", auth, FACULTY, wrap(async (req: any, res: any) => {
    const b = z.object({ feedback: z.string().min(1), status: z.enum(["ACCEPTED", "NEEDS_REVISION"]) }).parse(req.body);
    const rep: any = await prisma.progressReport.findUnique({ where: { id: req.params.id }, include: { milestone: { include: { project: { include: { supervisor: true } } } } } });
    if (!rep || rep.milestone.project.supervisor.userId !== req.user.id) throw new HttpError(403, "Not your project");
    res.json({ data: await prisma.progressReport.update({ where: { id: rep.id }, data: b }) });
  }));

  // ---------- Preferences ----------
  r.get("/preferences", auth, wrap(async (req: any, res: any) => {
    const where: any = req.user.role === "STUDENT" ? { studentId: ((await studentOf(req.user.id)) as any).id } : {};
    res.json({ data: await prisma.projectPreference.findMany({ where, include: { project: true, student: { include: { user: true } } }, orderBy: [{ studentId: "asc" }, { rank: "asc" }] }) });
  }));
  r.post("/projects/:id/preferences", auth, STUDENT, wrap(async (req: any, res: any) => {
    const b = z.object({ rank: z.number().int().min(1).max(3), statement: z.string().max(1000).optional() }).parse(req.body);
    const sp: any = await studentOf(req.user.id); const p: any = await ownProject(req);
    if (!isEligible({ id: sp.id, enrollmentNo: sp.enrollmentNo, level: sp.level, cgpa: sp.cgpa }, { id: p.id, capacity: p.capacity, eligibleLevels: levels(p.eligibleLevels), open: p.open })) throw new HttpError(422, "You are not eligible for this project (level mismatch or project closed)");
    const row = await prisma.$transaction(async (tx: any) => {
      await tx.projectPreference.deleteMany({ where: { studentId: sp.id, OR: [{ projectId: p.id }, { rank: b.rank }] } });
      const mine = await tx.projectPreference.findMany({ where: { studentId: sp.id } });
      const err = validatePrefs([...mine, { studentId: sp.id, projectId: p.id, rank: b.rank }]);
      if (err) throw new HttpError(422, err);
      return tx.projectPreference.create({ data: { studentId: sp.id, projectId: p.id, rank: b.rank, statement: b.statement ?? "" } });
    });
    res.status(201).json({ data: row });
  }));
  r.delete("/projects/:id/preferences", auth, STUDENT, wrap(async (req: any, res: any) => {
    const sp: any = await studentOf(req.user.id);
    await prisma.projectPreference.deleteMany({ where: { studentId: sp.id, projectId: req.params.id } });
    res.json({ data: { ok: true } });
  }));

  // ---------- Allocation ----------
  r.get("/allocations/rounds", auth, requireRole("COORDINATOR", "HOD", "FACULTY"), wrap(async (_q: any, res: any) => res.json({ data: await prisma.allocationRound.findMany({ orderBy: { id: "asc" } }) })));
  r.post("/allocations/rounds", auth, COORD, wrap(async (req: any, res: any) => {
    const b = z.object({ name: z.string().min(3), deadline: z.coerce.date().optional() }).parse(req.body);
    const row = await prisma.$transaction(async (tx: any) => { const x = await tx.allocationRound.create({ data: b }); await audit(tx, req.user.id, "ROUND_CREATED", "AllocationRound", x.id, x.name); return x; });
    res.status(201).json({ data: row });
  }));
  r.get("/allocations", auth, wrap(async (req: any, res: any) => {
    const where: any = {};
    if (req.query.roundId) where.roundId = String(req.query.roundId);
    if (req.user.role === "STUDENT") { where.studentId = ((await studentOf(req.user.id)) as any).id; where.active = true; }
    else if (req.query.active !== undefined) where.active = req.query.active === "true";
    res.json({ data: await prisma.projectAllocation.findMany({ where, include: { project: { include: { supervisor: { include: { user: true } } } }, student: { include: { user: true } } }, orderBy: { createdAt: "desc" } }) });
  }));

  async function plan(c: any, roundId: string) {
    const round = await c.allocationRound.findUnique({ where: { id: roundId } });
    if (!round) throw new HttpError(404, "Round not found");
    if (!["OPEN", "PREVIEWED"].includes(round.status)) throw new HttpError(409, `Round is ${round.status}`);
    const [students, projects, prefs, active, manual] = await Promise.all([
      c.studentProfile.findMany({ where: { status: "ACTIVE" } }), c.project.findMany({ where: { open: true } }), c.projectPreference.findMany(),
      c.projectAllocation.findMany({ where: { active: true } }), c.projectAllocation.findMany({ where: { roundId, active: false } })]);
    const busy = new Set([...active, ...manual].map((a: any) => a.studentId));
    const result = allocate(
      students.filter((s: any) => !busy.has(s.id)).map((s: any) => ({ id: s.id, enrollmentNo: s.enrollmentNo, level: s.level, cgpa: s.cgpa })),
      projects.map((p: any) => ({ id: p.id, capacity: p.capacity, eligibleLevels: levels(p.eligibleLevels), open: p.open })),
      prefs.map((p: any) => ({ studentId: p.studentId, projectId: p.projectId, rank: p.rank })),
      [...active, ...manual].map((a: any) => ({ studentId: a.studentId, projectId: a.projectId })));
    return { round, result };
  }
  r.post("/allocations/preview", auth, COORD, wrap(async (req: any, res: any) => {
    const { roundId } = z.object({ roundId: z.string() }).parse(req.body);
    const { result } = await plan(prisma, roundId);
    await prisma.allocationRound.update({ where: { id: roundId }, data: { status: "PREVIEWED" } });
    res.json({ data: result });
  }));
  r.post("/allocations/manual", auth, COORD, wrap(async (req: any, res: any) => {
    const b = z.object({ roundId: z.string(), studentId: z.string(), projectId: z.string(), reason: z.string().min(3) }).parse(req.body);
    const row = await prisma.$transaction(async (tx: any) => {
      const round = await tx.allocationRound.findUnique({ where: { id: b.roundId } });
      if (!round || !["OPEN", "PREVIEWED"].includes(round.status)) throw new HttpError(409, "Round is not open for changes");
      const s = await tx.studentProfile.findUnique({ where: { id: b.studentId } }); const p = await tx.project.findUnique({ where: { id: b.projectId } });
      if (!s || !p) throw new HttpError(404, "Student or project not found");
      if (!isEligible({ id: s.id, enrollmentNo: s.enrollmentNo, level: s.level, cgpa: s.cgpa }, { id: p.id, capacity: p.capacity, eligibleLevels: levels(p.eligibleLevels), open: p.open })) throw new HttpError(422, "Student is not eligible for this project");
      if (await tx.projectAllocation.findFirst({ where: { studentId: s.id, OR: [{ active: true }, { roundId: b.roundId }] } })) throw new HttpError(409, "Student already has an allocation");
      const used = await tx.projectAllocation.count({ where: { projectId: p.id, OR: [{ active: true }, { roundId: b.roundId }] } });
      if (used >= p.capacity) throw new HttpError(409, "Project is at full capacity");
      const a = await tx.projectAllocation.create({ data: { roundId: b.roundId, studentId: s.id, projectId: p.id, active: false, reason: b.reason } });
      await audit(tx, req.user.id, "ALLOCATION_MANUAL", "ProjectAllocation", a.id, b.reason); return a;
    });
    res.status(201).json({ data: row });
  }));
  r.post("/allocations/finalize", auth, COORD, wrap(async (req: any, res: any) => {
    const { roundId } = z.object({ roundId: z.string() }).parse(req.body);
    const out = await prisma.$transaction(async (tx: any) => {
      const { result } = await plan(tx, roundId);
      for (const a of result.allocations) await tx.projectAllocation.create({ data: { roundId, studentId: a.studentId, projectId: a.projectId, rank: a.rank, active: false } });
      await tx.allocationRound.update({ where: { id: roundId }, data: { status: "PENDING_HOD" } });
      await audit(tx, req.user.id, "ROUND_SUBMITTED_FOR_APPROVAL", "AllocationRound", roundId, `${result.allocations.length} proposed`);
      for (const h of await tx.user.findMany({ where: { role: "HOD" } })) await notify(tx, h.id, "An allocation batch awaits your approval", "/allocations");
      return result;
    });
    res.json({ data: out });
  }));
  r.post("/allocations/:id/approve", auth, HOD, wrap(async (req: any, res: any) => {
    await prisma.$transaction(async (tx: any) => {
      const round = await tx.allocationRound.findUnique({ where: { id: req.params.id } });
      if (!round) throw new HttpError(404, "Round not found");
      if (round.status !== "PENDING_HOD") throw new HttpError(409, `Round is ${round.status}, not awaiting approval`);
      const pending = await tx.projectAllocation.findMany({ where: { roundId: round.id, active: false } });
      const active = await tx.projectAllocation.findMany({ where: { active: true } });
      const busy = new Set(active.map((a: any) => a.studentId)); const used = new Map<string, number>();
      for (const a of active) used.set(a.projectId, (used.get(a.projectId) ?? 0) + 1);
      for (const a of pending) {
        const p = await tx.project.findUnique({ where: { id: a.projectId } }); const s = await tx.studentProfile.findUnique({ where: { id: a.studentId } });
        if (busy.has(a.studentId)) throw new HttpError(409, "Student already actively allocated; batch needs correction");
        if (!p.open || !levels(p.eligibleLevels).includes(s.level)) throw new HttpError(409, "A proposed allocation is no longer eligible");
        const n = (used.get(a.projectId) ?? 0) + 1; if (n > p.capacity) throw new HttpError(409, "Capacity would be exceeded; batch needs correction");
        used.set(a.projectId, n); busy.add(a.studentId);
      }
      await tx.projectAllocation.updateMany({ where: { roundId: round.id, active: false }, data: { active: true } });
      await tx.allocationRound.update({ where: { id: round.id }, data: { status: "PUBLISHED" } });
      await audit(tx, req.user.id, "ROUND_PUBLISHED", "AllocationRound", round.id, `${pending.length} allocations`);
      for (const a of pending) { const s = await tx.studentProfile.findUnique({ where: { id: a.studentId } }); await notify(tx, s.userId, "Your project allocation has been published", "/allocations"); }
    });
    res.json({ data: { ok: true } });
  }));
  r.post("/allocations/:id/reject", auth, HOD, wrap(async (req: any, res: any) => {
    const { remarks } = z.object({ remarks: z.string().min(3) }).parse(req.body);
    await prisma.$transaction(async (tx: any) => {
      const round = await tx.allocationRound.findUnique({ where: { id: req.params.id } });
      if (!round || round.status !== "PENDING_HOD") throw new HttpError(409, "Round is not awaiting approval");
      await tx.allocationRound.update({ where: { id: round.id }, data: { status: "REJECTED" } });
      await audit(tx, req.user.id, "ROUND_REJECTED", "AllocationRound", round.id, remarks);
      for (const c of await tx.user.findMany({ where: { role: "COORDINATOR" } })) await notify(tx, c.id, `Allocation batch rejected: ${remarks}`, "/allocations");
    });
    res.json({ data: { ok: true } });
  }));

  // ---------- People ----------
  r.get("/students", auth, requireRole("COORDINATOR", "HOD", "FACULTY"), wrap(async (req: any, res: any) => {
    const { skip, take, p } = page(req.query); const where: any = {};
    if (req.query.level) where.level = String(req.query.level);
    if (req.query.q) where.OR = [{ enrollmentNo: { contains: String(req.query.q) } }, { user: { name: { contains: String(req.query.q) } } }];
    const [total, rows] = await Promise.all([prisma.studentProfile.count({ where }), prisma.studentProfile.findMany({ where, skip, take, include: { user: { select: { name: true, email: true } }, program: true, advisor: { include: { user: { select: { name: true } } } } }, orderBy: { enrollmentNo: "asc" } })]);
    res.json({ data: rows, meta: { page: p, total } });
  }));
  r.get("/faculty", auth, requireRole("COORDINATOR", "HOD"), wrap(async (_q: any, res: any) => {
    const rows = await prisma.facultyProfile.findMany({ include: { user: { select: { name: true, email: true } }, _count: { select: { advisees: true, projects: true } } }, orderBy: { employeeId: "asc" } });
    res.json({ data: rows });
  }));

  // ---------- Notifications / announcements ----------
  r.get("/notifications", auth, wrap(async (req: any, res: any) => {
    const { skip, take } = page(req.query);
    const [rows, unread] = await Promise.all([prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { at: "desc" }, skip, take }), prisma.notification.count({ where: { userId: req.user.id, read: false } })]);
    res.json({ data: rows, meta: { unread } });
  }));
  r.post("/notifications/read-all", auth, wrap(async (req: any, res: any) => { await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } }); res.json({ data: { ok: true } }); }));
  r.patch("/notifications/:id/read", auth, wrap(async (req: any, res: any) => {
    const n = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
    if (!n.count) throw new HttpError(404, "Notification not found"); res.json({ data: { ok: true } });
  }));
  r.get("/announcements", auth, wrap(async (_q: any, res: any) => res.json({ data: await prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 20 }) })));
  r.post("/announcements", auth, HOD, wrap(async (req: any, res: any) => {
    const b = z.object({ title: z.string().min(3), body: z.string().min(3) }).parse(req.body);
    const dep: any = await prisma.department.findFirst();
    const row = await prisma.$transaction(async (tx: any) => { const a = await tx.announcement.create({ data: { ...b, departmentId: dep.id } }); await audit(tx, req.user.id, "ANNOUNCEMENT_PUBLISHED", "Announcement", a.id, b.title); return a; });
    res.status(201).json({ data: row });
  }));

  // ---------- Reports & audit ----------
  r.get("/reports/:type", auth, requireRole("COORDINATOR", "HOD"), wrap(async (req: any, res: any) => {
    let rows: any[] = [];
    switch (req.params.type) {
      case "request-status": rows = (await prisma.activityRequest.groupBy({ by: ["status"], _count: true })).map(x => ({ status: x.status, count: x._count })); break;
      case "allocation": { const t = await taken(); rows = (await prisma.project.findMany()).map(p => ({ project: p.title, capacity: p.capacity, allocated: t.get(p.id) ?? 0, utilization_pct: Math.round(((t.get(p.id) ?? 0) / p.capacity) * 100) })); break; }
      case "unallocated": { const ids = (await prisma.projectAllocation.findMany({ where: { active: true } })).map(a => a.studentId); rows = (await prisma.studentProfile.findMany({ where: { id: { notIn: ids } }, include: { user: true }, orderBy: { enrollmentNo: "asc" } })).map(s => ({ enrollmentNo: s.enrollmentNo, name: s.user.name, level: s.level })); break; }
      case "faculty-workload": rows = await Promise.all((await prisma.facultyProfile.findMany({ include: { user: true, _count: { select: { advisees: true, projects: true } } } })).map(async f => ({ employeeId: f.employeeId, name: f.user.name, advisees: f._count.advisees, projects: f._count.projects, pendingReviews: await prisma.activityRequest.count({ where: { reviewerId: f.id, status: "UNDER_FACULTY_REVIEW" } }) }))); break;
      case "rejected": rows = (await prisma.activityRequest.findMany({ where: { status: "REJECTED" } })).map(x => ({ code: x.code, title: x.title, remarks: x.remarks })); break;
      default: throw new HttpError(404, "Unknown report");
    }
    if (req.query.format === "csv") { res.type("text/csv").set("Content-Disposition", `attachment; filename="${req.params.type}.csv"`).send(csv(rows)); return; }
    res.json({ data: rows });
  }));
  r.get("/audit-logs", auth, requireRole("HOD", "COORDINATOR"), wrap(async (req: any, res: any) => {
    const { skip, take, p } = page(req.query);
    const [total, rows] = await Promise.all([prisma.auditLog.count(), prisma.auditLog.findMany({ orderBy: { at: "desc" }, skip, take })]);
    res.json({ data: rows, meta: { page: p, total } });
  }));

  r.use((_q, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid input", details: err.flatten() } });
    if (err instanceof WorkflowError) return res.status(err.code === "FORBIDDEN" ? 403 : err.code === "REASON_REQUIRED" ? 400 : 409).json({ error: { code: err.code, message: err.message } });
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: "ERROR", message: err.message } });
    console.error(err); res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });
  return app;
}
