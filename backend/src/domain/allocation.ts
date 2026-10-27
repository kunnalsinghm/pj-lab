// Deterministic preference-based allocation. Pure function; the API layer wraps it in a DB transaction.
export interface Student { id: string; enrollmentNo: string; level: "UG" | "PG"; cgpa: number }
export interface Project { id: string; capacity: number; eligibleLevels: ("UG" | "PG")[]; open: boolean }
export interface Pref { studentId: string; projectId: string; rank: number } // rank 1..3
export interface Result { allocations: { studentId: string; projectId: string; rank: number }[]; unallocated: string[] }

export function isEligible(s: Student, p: Project): boolean {
  return p.open && p.eligibleLevels.includes(s.level);
}

export function validatePrefs(prefs: Pref[]): string | null {
  if (prefs.length > 3) return "At most 3 preferences";
  if (new Set(prefs.map(p => p.rank)).size !== prefs.length) return "Duplicate rank";
  if (new Set(prefs.map(p => p.projectId)).size !== prefs.length) return "Duplicate project";
  if (prefs.some(p => p.rank < 1 || p.rank > 3)) return "Rank must be 1-3";
  return null;
}

// Tie-break: higher CGPA first, then lower enrollment number (lexicographic). Students already
// allocated (existing) are skipped; remaining capacity accounts for existing allocations.
export function allocate(students: Student[], projects: Project[], prefs: Pref[], existing: { studentId: string; projectId: string }[] = []): Result {
  const left = new Map(projects.map(p => [p.id, p.capacity - existing.filter(e => e.projectId === p.id).length]));
  const done = new Set(existing.map(e => e.studentId));
  const pById = new Map(projects.map(p => [p.id, p]));
  const order = [...students].sort((a, b) => b.cgpa - a.cgpa || a.enrollmentNo.localeCompare(b.enrollmentNo));
  const allocations: Result["allocations"] = [];
  const unallocated: string[] = [];
  for (const s of order) {
    if (done.has(s.id)) continue;
    const mine = prefs.filter(p => p.studentId === s.id).sort((a, b) => a.rank - b.rank);
    const hit = mine.find(p => { const pr = pById.get(p.projectId); return pr && isEligible(s, pr) && (left.get(p.projectId) ?? 0) > 0; });
    if (hit) { left.set(hit.projectId, left.get(hit.projectId)! - 1); allocations.push({ studentId: s.id, projectId: hit.projectId, rank: hit.rank }); }
    else unallocated.push(s.id);
  }
  return { allocations, unallocated };
}
