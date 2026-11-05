import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { TailoredView } from '../tailoringTypes';
import { Button, Card, ErrorText } from './ui';

export function ApplicationResumeUpload({ applicationId, onSaved }: {
  applicationId: number; onSaved: (view: TailoredView) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const storageKey = `application-resume-import:${applicationId}`;
  const [importId, setImportId] = useState<number | null>(() => {
    try {
      const value = Number(localStorage.getItem(storageKey));
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    } catch { return null; }
  });
  const remember = (id: number | null) => {
    try {
      if (id === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(id));
    } catch { /* Upload still works when browser storage is unavailable. */ }
    setImportId(id);
  };
  const upload = useMutation({ mutationFn: api.uploadResume, onSuccess: result => remember(result.id) });
  const parsed = useQuery({
    queryKey: ['application-resume-import', importId],
    queryFn: () => api.getImport(importId!),
    enabled: importId !== null,
    refetchInterval: query => query.state.data?.status === 'analyzing' ? 1500 : false,
  });
  const save = useMutation({
    mutationFn: () => api.attachApplicationResume(applicationId, importId!),
    onSuccess: view => { remember(null); onSaved(view); },
  });
  useEffect(() => {
    if (parsed.data?.status === 'ready' && !save.isPending && !save.isError && !save.isSuccess) save.mutate();
  }, [parsed.data?.status, save.isPending, save.isError, save.isSuccess]);
  const busy = upload.isPending || parsed.isFetching || parsed.data?.status === 'analyzing' || save.isPending;
  const error = upload.error ?? parsed.error ?? save.error;
  return <Card title="Already applied? Upload the résumé you used">
    <p className="mb-3 text-sm text-slate-600">Upload a Word (.docx) résumé. We parse it, match its bullets to supporting stories in your work history, then save it to this application. Your template and work history stay as they are.</p>
      <input ref={fileInput} type="file" accept=".docx" disabled={busy} className="hidden" aria-label="Upload resume" onChange={e => {
        const file = e.target.files?.[0];
        if (file) { remember(null); save.reset(); upload.mutate(file); }
        e.target.value = '';
      }} />
    <Button variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>Upload resume</Button>
    {busy && <p role="status" className="mt-3 text-sm">{save.isPending ? 'Matching bullets to your existing stories and saving résumé… This can take a few minutes. You can switch tabs and return here.' : 'Uploading and parsing résumé… This can take a few minutes. You can switch tabs and return here.'}</p>}
    {save.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Résumé saved with supporting story matches. You can review the links below.</p>}
    {parsed.data?.status === 'failed' && <ErrorText>{parsed.data.error ?? 'Parsing failed. Choose the file again to retry.'}</ErrorText>}
    {parsed.data?.status === 'ready' && <div className="mt-3 space-y-3">
      <p className="text-sm">Parsed content · {parsed.data.filename}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{parsed.data.content && [
        ...parsed.data.content.summary,
        ...parsed.data.content.skills.map(s => [s.category, s.items.join(', ')].filter(Boolean).join(': ')),
        ...parsed.data.content.positions.flatMap(p => [p.organization, p.title, p.description, ...p.bullets].filter(Boolean)),
        ...parsed.data.content.education.map(e => [e.degree, e.school, e.location, e.dates, e.details].filter(Boolean).join(' · ')),
        ...parsed.data.content.certifications.map(c => [c.name, c.issuer, c.date].filter(Boolean).join(' · ')),
        ...parsed.data.content.entries.flatMap(e => [e.heading, ...e.items]),
      ].join('\n')}</pre>
      {parsed.data.notes.map((note, i) => <p className="text-sm text-slate-600" key={i}>{note}</p>)}
      {save.isError && <Button disabled={save.isPending} onClick={() => save.mutate()}>Retry saving résumé</Button>}
    </div>}
    {error && <ErrorText>{error.message}</ErrorText>}
    {importId !== null && !busy && (parsed.error || parsed.data?.status === 'failed') &&
      <Button onClick={() => { remember(null); upload.reset(); save.reset(); }}>Choose another résumé</Button>}
  </Card>;
}
