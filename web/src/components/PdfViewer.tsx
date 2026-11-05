import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from './ui';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Render PDFs ourselves so previews also work in hosts without a native PDF reader. */
export function PdfViewer({ src, title }: { src: string; title: string }) {
  // Remount on rebuild so the previous document and page cannot leak into the new preview.
  return <PdfReader key={src} src={src} title={title} />;
}

function PdfReader({ src, title }: { src: string; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current!;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setError('');
    setBusy(true);
    const task = getDocument({ url: src });
    task.promise.then((document) => {
      if (active) setPdf(document);
    }).catch(() => {
      if (active) { setError('Unable to load this PDF. Try again or download the file.'); setBusy(false); }
    });
    return () => { active = false; void task.destroy(); };
  }, [src, attempt]);

  useEffect(() => {
    if (!pdf || !width) return;
    let active = true;
    let render: RenderTask | undefined;
    // Each render owns its canvas, including during rapid page/zoom changes.
    const canvas = document.createElement('canvas');
    setBusy(true);
    setError('');
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: zoom ?? width / natural.width });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.className = 'block bg-white shadow';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${title}, page ${page} of ${pdf.numPages}`);
      render = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (active) { surface.current?.replaceChildren(canvas); setBusy(false); }
    })().catch(() => {
      if (active) { setError('Unable to display this page. Try again or download the file.'); setBusy(false); }
    });
    return () => { active = false; render?.cancel(); canvas.remove(); };
  }, [pdf, page, zoom, width, title]);

  return (
    <section aria-label={title} className="overflow-hidden rounded-md border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2 text-sm">
        <Button disabled={!pdf || page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">Previous</Button>
        <span aria-live="polite">Page {page} of {pdf?.numPages ?? '…'}</span>
        <Button disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(page + 1)} aria-label="Next page">Next</Button>
        <label className="ml-auto flex items-center gap-2">
          Zoom
          <select className="rounded border border-slate-300 p-1" value={zoom ?? 'fit'} onChange={(e) => setZoom(e.target.value === 'fit' ? null : Number(e.target.value))}>
            <option value="fit">Fit width</option>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((scale) => <option key={scale} value={scale}>{scale * 100}%</option>)}
          </select>
        </label>
        <a href={src} download className="px-2 text-indigo-700 hover:underline">Download PDF</a>
      </div>
      <div ref={container} className="h-[75vh] overflow-auto bg-slate-200 p-4" aria-busy={busy}>
        {busy && <p role="status" className="mb-3 text-sm text-slate-600">Loading PDF…</p>}
        {error && <div role="alert" className="mb-3 text-sm text-red-700">{error} <Button onClick={() => { setPdf(null); setAttempt(attempt + 1); }}>Try again</Button></div>}
        <div ref={surface} className="mx-auto w-max" />
      </div>
    </section>
  );
}
