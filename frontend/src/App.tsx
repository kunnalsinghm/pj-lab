import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Spinner, ToastProvider, ErrorBox } from "./ui";
import Layout from "./Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { Activities, ActivityNew, ActivityDetail } from "./pages/Activities";
import Projects from "./pages/Projects";
import Allocations from "./pages/Allocations";
import { Students, FacultyList } from "./pages/People";
import { Notifications, Reports, Audit, Announcements } from "./pages/Misc";
import { ReactNode } from "react";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
// UI-level guard only; the backend enforces the real permissions.
function Gate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? <>{children}</> : <ErrorBox msg="You do not have access to this page." />;
}
const STAFF = ["COORDINATOR", "HOD"];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="activities" element={<Activities />} />
              <Route path="activities/new" element={<Gate roles={["STUDENT"]}><ActivityNew /></Gate>} />
              <Route path="activities/:id" element={<ActivityDetail />} />
              <Route path="projects" element={<Projects />} />
              <Route path="allocations" element={<Allocations />} />
              <Route path="students" element={<Gate roles={["FACULTY", ...STAFF]}><Students /></Gate>} />
              <Route path="faculty" element={<Gate roles={STAFF}><FacultyList /></Gate>} />
              <Route path="reports" element={<Gate roles={STAFF}><Reports /></Gate>} />
              <Route path="audit" element={<Gate roles={STAFF}><Audit /></Gate>} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
