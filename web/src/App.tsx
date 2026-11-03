import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ComingSoon } from './pages/ComingSoon';
import { RunDetailPage } from './pages/RunDetailPage';
import { RunsPage } from './pages/RunsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/settings" replace />} />
          <Route
            path="template"
            element={
              <ComingSoon
                title="Template"
                milestone="M1"
                description="Upload your current resume (.docx). The app imports your positions and bullets, and turns the file into a template so tailored resumes keep your formatting."
              />
            }
          />
          <Route
            path="history"
            element={
              <ComingSoon
                title="Work History"
                milestone="M2–M3"
                description="Positions and the stories under each one, with an AI chat that tightens each story and asks about metrics, impact, results and lessons learned."
              />
            }
          />
          <Route
            path="sections"
            element={
              <ComingSoon
                title="Other Sections"
                milestone="M2"
                description="Summary, skills, education, certifications and other sections."
              />
            }
          />
          <Route
            path="applications"
            element={
              <ComingSoon
                title="Applications"
                milestone="M4–M5"
                description="Paste a job posting, review the keywords the agent pulls out, then generate a tailored .docx resume."
              />
            }
          />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:id" element={<RunDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
