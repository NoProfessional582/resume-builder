import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ApplicationPage } from './pages/ApplicationPage';
import { ApplicationsPage, NewApplicationPage } from './pages/ApplicationsPage';
import { ImportPage } from './pages/ImportPage';
import { TemplatePage } from './pages/TemplatePage';
import { RunDetailPage } from './pages/RunDetailPage';
import { RunsPage } from './pages/RunsPage';
import { SectionsPage } from './pages/SectionsPage';
import { WorkHistoryPage } from './pages/WorkHistoryPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/template" replace />} />
          <Route path="template" element={<TemplatePage />} />
          <Route path="template/import/:id" element={<ImportPage />} />
          <Route path="history" element={<WorkHistoryPage />} />
          <Route path="sections" element={<SectionsPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="applications/new" element={<NewApplicationPage />} />
          <Route path="applications/:id" element={<ApplicationPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:id" element={<RunDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
