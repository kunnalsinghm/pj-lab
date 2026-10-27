// Pure workflow engine: no dependencies, fully unit-tested.
export type Role = "STUDENT" | "FACULTY" | "COORDINATOR" | "HOD";
export type Status = "DRAFT" | "SUBMITTED" | "UNDER_FACULTY_REVIEW" | "RETURNED" | "PENDING_HOD" | "APPROVED" | "REJECTED" | "CANCELLED";
export type Action = "SUBMIT" | "APPROVE" | "REJECT" | "RETURN" | "CANCEL";

export interface Actor { id: string; role: Role }
export interface Req { status: Status; applicantId: string; reviewerId?: string | null; requiresHod: boolean }
export class WorkflowError extends Error {
  code: "INVALID_TRANSITION" | "FORBIDDEN" | "REASON_REQUIRED";
  constructor(code: "INVALID_TRANSITION" | "FORBIDDEN" | "REASON_REQUIRED", msg: string) { super(msg); this.code = code; }
}

const TERMINAL: Status[] = ["APPROVED", "REJECTED", "CANCELLED"];

export function applyAction(req: Req, action: Action, actor: Actor, reason?: string): { status: Status } {
  const { status } = req;
  if (TERMINAL.includes(status)) throw new WorkflowError("INVALID_TRANSITION", `Request already ${status}`);
  const isApplicant = actor.id === req.applicantId;

  if (action === "SUBMIT") {
    if (!(status === "DRAFT" || status === "RETURNED")) throw new WorkflowError("INVALID_TRANSITION", `Cannot submit from ${status}`);
    if (!isApplicant) throw new WorkflowError("FORBIDDEN", "Only the applicant can submit");
    return { status: "UNDER_FACULTY_REVIEW" }; // Submitted -> Faculty Review is automatic routing
  }
  if (action === "CANCEL") {
    if (!isApplicant) throw new WorkflowError("FORBIDDEN", "Only the applicant can cancel");
    return { status: "CANCELLED" };
  }
  // Review actions
  const stageRole: Role | null = status === "UNDER_FACULTY_REVIEW" ? "FACULTY" : status === "PENDING_HOD" ? "HOD" : null;
  if (!stageRole) throw new WorkflowError("INVALID_TRANSITION", `Cannot ${action} from ${status}`);
  if (actor.role !== stageRole) throw new WorkflowError("FORBIDDEN", `${stageRole} review required`);
  if (stageRole === "FACULTY" && req.reviewerId && req.reviewerId !== actor.id)
    throw new WorkflowError("FORBIDDEN", "Not the assigned reviewer");
  if ((action === "REJECT" || action === "RETURN") && !reason?.trim())
    throw new WorkflowError("REASON_REQUIRED", "A reason is required");
  if (action === "REJECT") return { status: "REJECTED" };
  if (action === "RETURN") return { status: "RETURNED" };
  if (action === "APPROVE") return { status: stageRole === "FACULTY" && req.requiresHod ? "PENDING_HOD" : "APPROVED" };
  throw new WorkflowError("INVALID_TRANSITION", "Unknown action");
}
