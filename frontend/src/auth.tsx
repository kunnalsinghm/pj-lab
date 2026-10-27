import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

const Ctx = createContext<any>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api("/auth/me").then(r => setUser(r.data)).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  const login = async (email: string, password: string) => { const r = await api("/auth/login", { method: "POST", body: { email, password } }); setUser(r.data.user); };
  const logout = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); setUser(null); };
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
