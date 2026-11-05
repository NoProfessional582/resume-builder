import { PdfViewer } from '../components/PdfViewer';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { UploadResume } from '../components/UploadResume';
import { Button, Card, ErrorText, PageHeader } from '../components/ui';
import { formatTime } from '../lib/format';
import { ROLE_LABELS, SECTION_LABELS } from '../resumeTypes';

export function TemplatePage() {
  const summary = useQuery({ queryKey: ['template'], queryFn: api.getTemplate });
  const [previewKey, setPreviewKey] = useState<number | null>(null);
  const preview = useMutation({ mutationFn: api.previewProfile, onSuccess: () => setPreviewKey(Date.now()) });

  if (summary.error) return <ErrorText>{summary.error.message}</ErrorText>;
  if (!summary.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const { template, profile } = summary.data;

  if (!template) {
    return (
      <>
        <PageHeader
          title="Template"
          description="Upload your current resume. The app imports your work history and uses the file's formatting for every tailored resume."
        />
        <UploadResume />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Template" description="Tailored resumes are built from this file's formatting." />
      <div className="space-y-6">
        <Card title="Current template">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">File</dt>
            <dd>{template.filename}</dd>
            <dt className="text-slate-500">Uploaded</dt>
            <dd>
              {formatTime(template.createdAt)}
              {template.importId && (
                <Link to={`/template/import/${template.importId}`} className="ml-3 text-xs text-indigo-700 hover:underline">
                  View import
                </Link>
              )}
            </dd>
            <dt className="text-slate-500">Dates</dt>
            <dd>
              {template.dates.style}, “{template.dates.separator.trim()}” between, “{template.dates.presentLabel}” for current roles
            </dd>
            <dt className="text-slate-500">Profile</dt>
            <dd>
              {profile.positions} positions, {profile.stories} stories, {profile.sections} other sections
            </dd>
          </dl>
          <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Sections, in order</h3>
          <ol className="space-y-1 text-sm">
            {template.sections.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{s.heading ?? SECTION_LABELS[s.kind]}</span>
                <span className="text-xs text-slate-500">
                  {SECTION_LABELS[s.kind]} · {s.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="Preview with your profile"
          actions={
            <Button variant="primary" onClick={() => preview.mutate()} disabled={preview.isPending}>
              {preview.isPending ? 'Building… (about 10 s)' : previewKey ? 'Rebuild preview' : 'Build preview'}
            </Button>
          }
        >
          <p className="text-sm text-slate-600">
            Builds a resume from everything in your profile using this template, then converts it with Word.
          </p>
          {preview.error && <div className="mt-3"><ErrorText>{preview.error.message}</ErrorText></div>}
          {previewKey && preview.data && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-4 text-sm">
                <span>{preview.data.pages} page{preview.data.pages === 1 ? '' : 's'}</span>
                <a className="text-indigo-700 hover:underline" href={`/api/template/preview/profile-preview.docx?t=${previewKey}`}>
                  Download .docx
                </a>
              </div>
              <PdfViewer title="Profile preview" src={`/api/template/preview/profile-preview.pdf?t=${previewKey}`} />
            </div>
          )}
        </Card>

        <Card title="Replace template">
          <p className="mb-4 text-sm text-slate-600">
            Upload a new version of your resume. You'll choose whether to also replace your profile content before anything changes.
          </p>
          <UploadResume label="Upload new resume (.docx)" />
        </Card>
      </div>
    </>
  );
}
