import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.ts";

const app = createApp();
const PW = "Demo@1234";
const tok: Record<string, string> = {};
const login = async (email: string) => (tok[email] ??= (await request(app).post("/api/auth/login").send({ email, password: PW })).body.data.token);
const as = async (email: string, method: "get" | "post" | "patch", url: string, body?: any) => {
  const t = await login(email); const q = (request(app) as any)[method](url).set("Authorization", `Bearer ${t}`);
  return body ? q.send(body) : q;
};
const S = "student1@eit.edu", F = "faculty1@eit.edu", H = "hod@eit.edu", C = "coordinator@eit.edu";

describe("auth", () => {
  it("logs in with valid credentials", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: S, password: PW });
    expect(r.status).toBe(200); expect(r.body.data.user.role).toBe("STUDENT");
  });
  it("rejects invalid credentials", async () => { expect((await request(app).post("/api/auth/login").send({ email: S, password: "nope" })).status).toBe(401); });
  it("requires authentication", async () => { expect((await request(app).get("/api/auth/me")).status).toBe(401); });
  it("health check works", async () => { expect((await request(app).get("/api/health")).status).toBe(200); });
});

describe("role-based authorization", () => {
  it("students cannot read audit logs or reports; HOD can", async () => {
    expect((await as(S, "get", "/api/audit-logs")).status).toBe(403);
    expect((await as(S, "get", "/api/reports/allocation")).status).toBe(403);
    expect((await as(H, "get", "/api/audit-logs")).status).toBe(200);
  });
  it("faculty cannot create activity requests", async () => { expect((await as(F, "post", "/api/activities", { title: "abc", description: "abc", typeId: "x" })).status).toBe(403); });
});

describe("activity workflow", () => {
  let hodType: any, plainType: any;
  beforeAll(async () => { const t = (await as(S, "get", "/api/activity-types")).body.data; hodType = t.find((x: any) => x.requiresHod); plainType = t.find((x: any) => !x.requiresHod); });
  const draft = async (typeId: string) => (await as(S, "post", "/api/activities", { title: "Test request", description: "Testing workflow", typeId })).body.data;

  it("submit -> faculty approve -> HOD approve; duplicate approval blocked", async () => {
    const a = await draft(hodType.id);
    expect((await as(S, "post", `/api/activities/${a.id}/submit`)).body.data.status).toBe("UNDER_FACULTY_REVIEW");
    expect((await as(S, "post", `/api/activities/${a.id}/approve`)).status).toBe(403); // student cannot approve
    expect((await as(F, "post", `/api/activities/${a.id}/approve`)).body.data.status).toBe("PENDING_HOD");
    expect((await as(H, "post", `/api/activities/${a.id}/approve`)).body.data.status).toBe("APPROVED");
    expect((await as(H, "post", `/api/activities/${a.id}/approve`)).status).toBe(409);
    expect((await as(S, "get", "/api/notifications")).body.meta.unread).toBeGreaterThan(0);
  });
  it("rejection needs a reason", async () => {
    const a = await draft(plainType.id); await as(S, "post", `/api/activities/${a.id}/submit`);
    expect((await as(F, "post", `/api/activities/${a.id}/reject`, {})).status).toBe(400);
    expect((await as(F, "post", `/api/activities/${a.id}/reject`, { remarks: "Not eligible" })).body.data.status).toBe("REJECTED");
  });
  it("return -> student edits and resubmits", async () => {
    const a = await draft(plainType.id); await as(S, "post", `/api/activities/${a.id}/submit`);
    expect((await as(F, "post", `/api/activities/${a.id}/return`, { remarks: "Add dates" })).body.data.status).toBe("RETURNED");
    expect((await as(S, "patch", `/api/activities/${a.id}`, { description: "Dates added" })).status).toBe(200);
    expect((await as(S, "post", `/api/activities/${a.id}/submit`)).body.data.status).toBe("UNDER_FACULTY_REVIEW");
  });
  it("invalid transitions are rejected", async () => {
    const a = await draft(plainType.id);
    expect((await as(F, "post", `/api/activities/${a.id}/approve`)).status).toBeGreaterThanOrEqual(403); // draft is not reviewable (and not assigned)
    await as(S, "post", `/api/activities/${a.id}/submit`);
    expect((await as(S, "post", `/api/activities/${a.id}/submit`)).status).toBe(409);
  });
});

describe("projects and allocation", () => {
  let projects: any[];
  beforeAll(async () => { projects = (await as(S, "get", "/api/projects")).body.data; });

  it("rejects preference for a PG-only project by a UG student", async () => {
    const pg = projects.find(p => p.eligibleLevels === "PG");
    expect((await as(S, "post", `/api/projects/${pg.id}/preferences`, { rank: 1 })).status).toBe(422);
  });
  it("blocks allocation beyond capacity and duplicate allocations", async () => {
    const rounds = (await as(C, "get", "/api/allocations/rounds")).body.data; const open = rounds.find((r: any) => r.status === "OPEN");
    const students = (await as(C, "get", "/api/students?level=UG&pageSize=100")).body.data;
    const full = projects.find(p => p.seatsLeft === 0 && p.eligibleLevels.includes("UG"));
    const free = students.find((s: any) => s.enrollmentNo === "EIT24UG001");
    expect((await as(C, "post", "/api/allocations/manual", { roundId: open.id, studentId: free.id, projectId: full.id, reason: "test" })).status).toBe(409);
    const allocated = students.find((s: any) => s.enrollmentNo === "EIT24UG055");
    const roomy = projects.find(p => p.seatsLeft > 0 && p.eligibleLevels.includes("UG"));
    expect((await as(C, "post", "/api/allocations/manual", { roundId: open.id, studentId: allocated.id, projectId: roomy.id, reason: "test" })).status).toBe(409);
  });
  it("only coordinator may preview/finalize; only HOD may approve; capacity holds after publish", async () => {
    const open = (await as(C, "get", "/api/allocations/rounds")).body.data.find((r: any) => r.status === "OPEN");
    expect((await as(S, "post", "/api/allocations/preview", { roundId: open.id })).status).toBe(403);
    expect((await as(C, "post", "/api/allocations/preview", { roundId: open.id })).status).toBe(200);
    expect((await as(C, "post", "/api/allocations/finalize", { roundId: open.id })).status).toBe(200);
    expect((await as(C, "post", `/api/allocations/${open.id}/approve`)).status).toBe(403);
    expect((await as(H, "post", `/api/allocations/${open.id}/approve`)).status).toBe(200);
    expect((await as(H, "post", `/api/allocations/${open.id}/approve`)).status).toBe(409);
    const after = (await as(C, "get", "/api/projects")).body.data;
    for (const p of after) expect(p.taken).toBeLessThanOrEqual(p.capacity);
    const all = (await as(C, "get", "/api/allocations?active=true")).body.data;
    const ids = all.map((a: any) => a.studentId); expect(new Set(ids).size).toBe(ids.length); // one active allocation per student
  });
});
