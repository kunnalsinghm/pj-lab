import jwt from "jsonwebtoken";
import { prisma } from "./db.ts";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be set (16+ characters) in backend/.env");
  return s;
};
export const signToken = (u: any) => jwt.sign({ sub: u.id, role: u.role }, secret(), { expiresIn: "8h" });
const deny = (res: any, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });

export async function auth(req: any, res: any, next: any) {
  const h = req.headers.authorization;
  const token = req.cookies?.token || (h?.startsWith("Bearer ") ? h.slice(7) : null);
  if (!token) return deny(res, 401, "UNAUTHENTICATED", "Login required");
  try {
    const p: any = jwt.verify(token, secret());
    const u = await prisma.user.findUnique({ where: { id: p.sub } });
    if (!u || !u.active) return deny(res, 401, "UNAUTHENTICATED", "Account unavailable");
    req.user = { id: u.id, role: u.role, name: u.name, email: u.email }; // role always read fresh from DB
    next();
  } catch { return deny(res, 401, "UNAUTHENTICATED", "Invalid or expired session"); }
}
export const requireRole = (...roles: string[]) => (req: any, res: any, next: any) =>
  roles.includes(req.user?.role) ? next() : deny(res, 403, "FORBIDDEN", "You do not have permission for this action");
