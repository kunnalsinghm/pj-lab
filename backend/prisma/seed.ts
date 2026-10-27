// DEVELOPMENT DEMO DATA ONLY. Wipes the database. Never run against production.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "Demo@1234";
const pad = (n: number, w = 3) => String(n).padStart(w, "0");
const FIRST = ["Aarav", "Vihaan", "Ishita", "Ananya", "Rohan", "Meera", "Kabir", "Diya", "Arjun", "Saanvi", "Nikhil", "Tara", "Yash", "Riya", "Dev", "Navya", "Karan", "Pooja", "Aditya", "Sneha"];
const LAST = ["Sharma", "Verma", "Iyer", "Nair", "Banerjee", "Mukherjee", "Reddy", "Patel", "Das", "Singh", "Gupta", "Mehta", "Bose", "Kulkarni", "Chatterjee"];
const nameOf = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
const DOMAINS = ["Machine Learning", "Computer Networks", "Databases", "Cybersecurity", "Software Engineering", "Embedded Systems", "Cloud Computing", "HCI"];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "yes") throw new Error("Refusing to seed demo data in production.");
  for (const m of ["auditLog", "notification", "announcement", "progressReport", "projectMilestone", "projectAllocation", "allocationRound", "projectPreference", "project", "approvalAction", "attachment", "activityRequest", "activityType", "workflowStage", "workflowDefinition", "studentProfile", "facultyProfile", "user", "program", "academicTerm", "department", "departmentSetting"])
    await (prisma as any)[m].deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const dept = await prisma.department.create({ data: { name: "Department of Computer Science and Engineering", institution: "Eastern Institute of Technology" } });
  const ug = await prisma.program.create({ data: { name: "B.Tech CSE", level: "UG", departmentId: dept.id } });
  const pg = await prisma.program.create({ data: { name: "M.Tech CSE", level: "PG", departmentId: dept.id } });
  const term = await prisma.academicTerm.create({ data: { year: "2026-27", semester: 1, current: true } });
  const wf = await prisma.workflowDefinition.create({ data: { name: "Default", stages: { create: [{ position: 1, role: "FACULTY", name: "Faculty Review" }, { position: 2, role: "HOD", name: "HOD Approval" }] } } });
  await prisma.departmentSetting.createMany({ data: [{ key: "allocation.deadline", value: "2026-11-30" }, { key: "department.name", value: dept.name }] });

  const hod = await prisma.user.create({ data: { email: "hod@eit.edu", passwordHash: hash, name: "Prof. Sunita Rao", role: "HOD", departmentId: dept.id } });
  await prisma.user.create({ data: { email: "coordinator@eit.edu", passwordHash: hash, name: "Mr. Anil Menon", role: "COORDINATOR", departmentId: dept.id } });

  const DESIG = ["Professor", "Associate Professor", "Assistant Professor"];
  const fac: any[] = [];
  for (let n = 1; n <= 10; n++) {
    const u = await prisma.user.create({ data: { email: `faculty${n}@eit.edu`, passwordHash: hash, name: `Dr. ${nameOf(n + 30)}`, role: "FACULTY", departmentId: dept.id, faculty: { create: { employeeId: `EMP${pad(n)}`, designation: DESIG[n % 3], researchInterests: `${DOMAINS[n % 8]}, ${DOMAINS[(n + 3) % 8]}` } } }, include: { faculty: true } });
    fac.push(u.faculty);
  }
  const stu: any[] = [];
  for (let n = 1; n <= 90; n++) {
    const isUG = n <= 60; const k = isUG ? n : n - 60;
    const u = await prisma.user.create({ data: { email: `student${n}@eit.edu`, passwordHash: hash, name: nameOf(n), role: "STUDENT", departmentId: dept.id,
      student: { create: { enrollmentNo: `${isUG ? "EIT24UG" : "EIT25PG"}${pad(k)}`, level: isUG ? "UG" : "PG", semester: isUG ? 5 : 1, batch: isUG ? "2024" : "2025", cgpa: 6 + ((n * 37) % 40) / 10, programId: isUG ? ug.id : pg.id, advisorId: fac[(n - 1) % 10].id } } }, include: { student: true } });
    stu.push(u.student);
  }

  // Projects: index%3==2 are PG-only; index 1 has a single seat (filled below).
  const proj: any[] = [];
  for (let i = 0; i < 15; i++) {
    proj.push(await prisma.project.create({ data: { title: `${DOMAINS[i % 8]} Research Project ${i + 1}`, description: `Investigates open problems in ${DOMAINS[i % 8].toLowerCase()} with a focus on practical evaluation.`, domain: DOMAINS[i % 8], prerequisites: "Data structures; programming in Python or C++", capacity: i === 1 ? 1 : 3 + (i % 2), eligibleLevels: i % 3 === 2 ? "PG" : "UG,PG", open: true, supervisorId: fac[i % 10].id } }));
    for (const [j, t] of ["Literature review", "Prototype demo"].entries())
      await prisma.projectMilestone.create({ data: { projectId: proj[i].id, title: t, dueDate: new Date(Date.UTC(2026, 10 + j, 15)) } });
  }

  const r1 = await prisma.allocationRound.create({ data: { name: "2026 Round 1", status: "PUBLISHED" } });
  await prisma.allocationRound.create({ data: { name: "2026 Round 2", status: "OPEN", deadline: new Date(Date.UTC(2026, 10, 30)) } });
  const give = async (s: any, p: any, rank: number) => prisma.projectAllocation.create({ data: { roundId: r1.id, studentId: s.id, projectId: p.id, rank, active: true } });
  await give(stu[59], proj[1], 1);
  const ugProjs = [0, 3, 6, 9, 12];
  for (let n = 51; n <= 59; n++) await give(stu[n - 1], proj[ugProjs[Math.floor((n - 51) / 2)]], 1);
  const pgProjs = [2, 5, 8, 11, 14];
  for (let n = 61; n <= 70; n++) await give(stu[n - 1], proj[pgProjs[Math.floor((n - 61) / 2)]], 1);

  // Preferences for students still awaiting allocation (UG 1-40, PG 71-90).
  const eligibleFor = (level: string) => proj.filter(p => p.eligibleLevels.includes(level));
  for (const n of [...Array.from({ length: 40 }, (_, i) => i + 1), ...Array.from({ length: 20 }, (_, i) => i + 71)]) {
    const el = eligibleFor(stu[n - 1].level);
    for (let rk = 1; rk <= 3; rk++) await prisma.projectPreference.create({ data: { studentId: stu[n - 1].id, projectId: el[(n * rk + rk) % el.length].id, rank: rk, statement: "Interested because of prior coursework and a related mini-project." } }).catch(() => {});
  }

  // Activity requests in varied states.
  const types: any[] = [];
  for (const [name, hodReq] of [["Seminar Registration", false], ["Workshop Participation", false], ["Industrial Visit", true], ["Internship Application", true], ["Laboratory Access", false], ["Academic Leave", true], ["Bonafide Certificate", false], ["NOC Application", true], ["Project Proposal", false], ["Department Event", false]] as const)
    types.push(await prisma.activityType.create({ data: { name, requiresHod: hodReq, workflowId: wf.id } }));
  const hodTypes = types.filter(t => t.requiresHod);
  const STATES = ["DRAFT", "UNDER_FACULTY_REVIEW", "PENDING_HOD", "APPROVED", "REJECTED", "RETURNED", "UNDER_FACULTY_REVIEW"];
  for (let i = 0; i < 25; i++) {
    const s = stu[i]; const u = await prisma.user.findUnique({ where: { id: s.userId } }); const st = STATES[i % 7];
    const type = st === "PENDING_HOD" || st === "APPROVED" ? hodTypes[i % hodTypes.length] : types[i % 10];
    const req = await prisma.activityRequest.create({ data: { code: `REQ-2026-${pad(i + 1, 4)}`, title: `${type.name} - ${u!.name}`, description: "Request submitted for the current semester.", status: st, applicantId: s.userId, typeId: type.id, termId: term.id, reviewerId: st === "DRAFT" ? null : s.advisorId, submittedAt: st === "DRAFT" ? null : new Date(), remarks: st === "REJECTED" ? "Schedule conflicts with exams." : st === "RETURNED" ? "Please attach supporting details." : null } });
    const steps: [string, string, string][] = [];
    if (st !== "DRAFT") steps.push(["SUBMIT", "DRAFT", "UNDER_FACULTY_REVIEW"]);
    if (st === "PENDING_HOD" || st === "APPROVED") steps.push(["APPROVE", "UNDER_FACULTY_REVIEW", "PENDING_HOD"]);
    if (st === "APPROVED") steps.push(["APPROVE", "PENDING_HOD", "APPROVED"]);
    if (st === "REJECTED") steps.push(["REJECT", "UNDER_FACULTY_REVIEW", "REJECTED"]);
    if (st === "RETURNED") steps.push(["RETURN", "UNDER_FACULTY_REVIEW", "RETURNED"]);
    for (const [action, fromStatus, toStatus] of steps) await prisma.approvalAction.create({ data: { requestId: req.id, actorId: action === "SUBMIT" ? s.userId : hod.id, action, fromStatus, toStatus } });
    if (st !== "DRAFT") await prisma.notification.create({ data: { userId: s.userId, message: `Your request ${req.code} is now ${st.replace(/_/g, " ").toLowerCase()}`, link: `/activities/${req.id}` } });
    await prisma.auditLog.create({ data: { actorId: s.userId, action: "REQUEST_CREATED", entity: "ActivityRequest", entityId: req.id, detail: req.code } });
  }
  for (const [t, b] of [["Project allocation Round 2 is open", "Submit up to three ranked preferences before 30 November."], ["Guest lecture on secure software", "Open to all UG and PG students."], ["Lab maintenance notice", "Laboratories remain closed this Saturday."]])
    await prisma.announcement.create({ data: { title: t, body: b, departmentId: dept.id } });
  await prisma.auditLog.create({ data: { actorId: hod.id, action: "ROUND_PUBLISHED", entity: "AllocationRound", entityId: r1.id, detail: "20 allocations" } });

  console.log("Seeded. Demo password for ALL accounts (dev only): " + PASSWORD);
  console.log("hod@eit.edu | coordinator@eit.edu | faculty1@eit.edu | student1@eit.edu");
}
main().finally(() => prisma.$disconnect());
