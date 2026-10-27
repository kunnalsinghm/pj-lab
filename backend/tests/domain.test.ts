import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, WorkflowError } from "../src/domain/workflow.ts";
import { allocate, validatePrefs, isEligible } from "../src/domain/allocation.ts";

const stu = { id: "s1", role: "STUDENT" as const }, fac = { id: "f1", role: "FACULTY" as const }, hod = { id: "h1", role: "HOD" as const };
const base = { applicantId: "s1", reviewerId: "f1", requiresHod: true };

test("submit routes to faculty review", () => assert.equal(applyAction({ ...base, status: "DRAFT" }, "SUBMIT", stu).status, "UNDER_FACULTY_REVIEW"));
test("faculty approve escalates to HOD when required", () => assert.equal(applyAction({ ...base, status: "UNDER_FACULTY_REVIEW" }, "APPROVE", fac).status, "PENDING_HOD"));
test("faculty approve is final when HOD not required", () => assert.equal(applyAction({ ...base, requiresHod: false, status: "UNDER_FACULTY_REVIEW" }, "APPROVE", fac).status, "APPROVED"));
test("HOD final approval", () => assert.equal(applyAction({ ...base, status: "PENDING_HOD" }, "APPROVE", hod).status, "APPROVED"));
test("reject requires reason", () => assert.throws(() => applyAction({ ...base, status: "UNDER_FACULTY_REVIEW" }, "REJECT", fac), (e: any) => e.code === "REASON_REQUIRED"));
test("return then resubmit", () => {
  const r = applyAction({ ...base, status: "UNDER_FACULTY_REVIEW" }, "RETURN", fac, "fix dates");
  assert.equal(r.status, "RETURNED");
  assert.equal(applyAction({ ...base, status: r.status }, "SUBMIT", stu).status, "UNDER_FACULTY_REVIEW");
});
test("duplicate approval prevented", () => assert.throws(() => applyAction({ ...base, status: "APPROVED" }, "APPROVE", hod), WorkflowError));
test("student cannot approve", () => assert.throws(() => applyAction({ ...base, status: "UNDER_FACULTY_REVIEW" }, "APPROVE", stu), (e: any) => e.code === "FORBIDDEN"));
test("wrong faculty cannot approve", () => assert.throws(() => applyAction({ ...base, status: "UNDER_FACULTY_REVIEW" }, "APPROVE", { id: "f2", role: "FACULTY" }), (e: any) => e.code === "FORBIDDEN"));
test("faculty cannot act at HOD stage", () => assert.throws(() => applyAction({ ...base, status: "PENDING_HOD" }, "APPROVE", fac), (e: any) => e.code === "FORBIDDEN"));
test("invalid transition: submit from approved/under review", () => {
  assert.throws(() => applyAction({ ...base, status: "UNDER_FACULTY_REVIEW" }, "SUBMIT", stu), (e: any) => e.code === "INVALID_TRANSITION");
});

const S = (id: string, level: "UG" | "PG", cgpa: number) => ({ id, enrollmentNo: id, level, cgpa });
const P = (id: string, capacity: number, lv: ("UG" | "PG")[] = ["UG", "PG"], open = true) => ({ id, capacity, eligibleLevels: lv, open });

test("eligibility by level and open status", () => {
  assert.equal(isEligible(S("a", "UG", 8), P("p", 1, ["PG"])), false);
  assert.equal(isEligible(S("a", "UG", 8), P("p", 1, ["UG"], false)), false);
});
test("capacity never exceeded; higher CGPA wins, tie -> enrollment order", () => {
  const r = allocate([S("a", "UG", 8), S("b", "UG", 9), S("c", "UG", 8)], [P("p1", 1), P("p2", 5)],
    [{ studentId: "a", projectId: "p1", rank: 1 }, { studentId: "b", projectId: "p1", rank: 1 }, { studentId: "c", projectId: "p1", rank: 1 }, { studentId: "a", projectId: "p2", rank: 2 }]);
  assert.deepEqual(r.allocations.find(x => x.projectId === "p1")?.studentId, "b");
  assert.equal(r.allocations.filter(x => x.projectId === "p1").length, 1);
  assert.deepEqual(r.allocations.find(x => x.studentId === "a"), { studentId: "a", projectId: "p2", rank: 2 });
  assert.deepEqual(r.unallocated, ["c"]);
});
test("ineligible student not allocated", () => assert.deepEqual(allocate([S("a", "UG", 8)], [P("p", 3, ["PG"])], [{ studentId: "a", projectId: "p", rank: 1 }]).unallocated, ["a"]));
test("no duplicate allocation and existing seats counted", () => {
  const r = allocate([S("a", "UG", 8), S("b", "UG", 7)], [P("p", 1)], [{ studentId: "a", projectId: "p", rank: 1 }, { studentId: "b", projectId: "p", rank: 1 }], [{ studentId: "a", projectId: "p" }]);
  assert.deepEqual(r.allocations, []); assert.deepEqual(r.unallocated, ["b"]);
});
test("deterministic across input order", () => {
  const st = [S("a", "UG", 8), S("b", "UG", 8)], pr = [{ studentId: "a", projectId: "p", rank: 1 }, { studentId: "b", projectId: "p", rank: 1 }];
  assert.deepEqual(allocate(st, [P("p", 1)], pr), allocate([...st].reverse(), [P("p", 1)], pr));
});
test("preference validation", () => {
  assert.equal(validatePrefs([1, 2, 3, 4].map(i => ({ studentId: "a", projectId: "p" + i, rank: i }))), "At most 3 preferences");
  assert.equal(validatePrefs([{ studentId: "a", projectId: "x", rank: 1 }, { studentId: "a", projectId: "y", rank: 1 }]), "Duplicate rank");
  assert.equal(validatePrefs([{ studentId: "a", projectId: "x", rank: 1 }]), null);
});
