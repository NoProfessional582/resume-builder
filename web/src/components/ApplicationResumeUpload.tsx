import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { TailoredView } from '../tailoringTypes';
import { Button, Card, ErrorText } from './ui';

export function ApplicationResumeUpload({ applicationId, onSaved }: {
  applicationId: number; onSaved: (view: TailoredView) => void;
}) {
  const [importId, setImportId] = useState<number | null>(null);
  const upload = useMutation({ mutationFn: api.uploadResume, onSuccess: result => setImportId(result.id) });
  const parsed = useQuery({
    queryKey: ['application-resume-import', importId],
    queryFn: () => api.getImport(importId!),
    enabled: importId !== null,
    refetchInterval: query => query.state.data?.status === 'analyzing' ? 1500 : false,
  });
  const save = useMutation({
    mutationFn: () => api.attachApplicationResume(applicationId, importId!),
    onSuccess: view => { setImportId(null); onSaved(view); },
  });
  const busy = upload.isPending || parsed.isFetching || parsed.data?.status === 'analyzing' || save.isPending;
  const error = upload.error ?? parsed.error ?? save.error;
  return <Card title="Already applied? Upload the résumé you used">
    <p className="mb-3 text-sm text-slate-600">Upload a Word (.docx) résumé to save it as a version for this application and score it against the job. Your template and work history stay as they are.</p>
    <label className="block text-sm font-medium">Choose résumé (.docx)
      <input type="file" accept=".docx" disabled={busy} className="mt-2 block text-sm" onChange={e => {
        const file = e.target.files?.[0];
        if (file) { setImportId(null); save.reset(); upload.mutate(file); }
        e.target.value = '';
      }} />
    </label>
    {busy && <p role="status" className="mt-3 text-sm">{save.isPending ? 'Saving résumé…' : 'Uploading and parsing résumé…'}</p>}
    {parsed.data?.status === 'failed' && <ErrorText>{parsed.data.error ?? 'Parsing failed. Choose the file again to retry.'}</ErrorText>}
    {parsed.data?.status === 'ready' && <div className="mt-3 space-y-3">
      <p className="text-sm">Review the parsed content, then save. You can edit this version and choose “Score résumé” after saving.</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{parsed.data.content && [
        ...parsed.data.content.summary,
        ...parsed.data.content.skills.map(s => [s.category, s.items.join(', ')].filter(Boolean).join(': ')),
        ...parsed.data.content.positions.flatMap(p => [p.organization, p.title, p.description, ...p.bullets].filter(Boolean)),
        ...parsed.data.content.education.map(e => [e.degree, e.school, e.location, e.dates, e.details].filter(Boolean).join(' · ')),
        ...parsed.data.content.certifications.map(c => [c.name, c.issuer, c.date].filter(Boolean).join(' · ')),
        ...parsed.data.content.entries.flatMap(e => [e.heading, ...e.items]),
      ].join('\n')}</pre>
      {parsed.data.notes.map((note, i) => <p className="text-sm text-slate-600" key={i}>{note}</p>)}
      <Button disabled={save.isPending} onClick={() => save.mutate()}>Save résumé to application</Button>
    </div>}
    {error && <ErrorText>{error.message}</ErrorText>}
  </Card>;
}
