import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Badge, Button, Card, ErrorText, LinkButton, StatusBadge } from '../components/ui';
import { useRunStream } from '../hooks/useRunStream';
import { describeEvent, formatTime } from '../lib/format';
import { REVIEW_CATEGORY_LABELS, type Recommendation, type ReviewView, type ResumeReview } from '../tailoringTypes';

const RECOMMENDATION: Record<Recommendation, { label: string; className: string }> = {
  advance: { label: 'Advance to interview', className: 'bg-emerald-100 text-emerald-800' },
  phone_screen: { label: 'Phone screen', className: 'bg-indigo-100 text-indigo-800' },
  hold: { label: 'Hold', className: 'bg-amber-100 text-amber-800' },
  reject: { label: 'Reject', className: 'bg-red-100 text-red-800' },
};

const SEVERITY_CLASS = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

const GAP_STATUS_LABEL = { missing: 'Not shown', partial: 'Partly shown', unclear: 'Unclear' };

/** Text and bar colors for a score out of 100. */
function scoreTone(score: number) {
  if (score >= 80) return { text: 'text-emerald-700', bar: 'bg-emerald-500', ring: 'ring-emerald-200 bg-emerald-50' };
  if (score >= 65) return { text: 'text-indigo-700', bar: 'bg-indigo-500', ring: 'ring-indigo-200 bg-indigo-50' };
  if (score >= 50) return { text: 'text-amber-700', bar: 'bg-amber-500', ring: 'ring-amber-200 bg-amber-50' };
  return { text: 'text-red-700', bar: 'bg-red-500', ring: 'ring-red-200 bg-red-50' };
}

/**
 * Scores one résumé version against the job posting, as a senior recruiter and the hiring manager
 * would: overall score, strengths, deficiencies and missing qualifications.
 */
export function ReviewCard({ versionId, dirty }: { versionId: number; dirty: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['review', versionId],
    queryFn: () => api.getReview(versionId),
    refetchInterval: (q) => (q.state.data?.status === 'reviewing' ? 3000 : false),
  });
  const r = query.data;
  const stream = useRunStream(r?.status === 'reviewing' ? r.runId : null);
  const start = useMutation({
    mutationFn: () => api.startReview(versionId),
    onSuccess: (v) => queryClient.setQueryData(['review', versionId], v),
  });
  const [open, setOpen] = useState(true);

  const scoreButton = (label: string, primary = false) => (
    <Button variant={primary ? 'primary' : 'secondary'} onClick={() => start.mutate()} disabled={dirty || start.isPending}>
      {start.isPending ? 'Starting…' : label}
    </Button>
  );
  const footer = (
    <>
      {dirty && <p className="mt-2 text-xs text-slate-500">Save your changes first; the review reads the saved version.</p>}
      {start.error && <div className="mt-3"><ErrorText>{start.error.message}</ErrorText></div>}
    </>
  );

  if (query.error) return <ErrorText>{query.error.message}</ErrorText>;
  if (query.isPending) return null;

  if (!r) {
    return (
      <Card title="Recruiter review">
        <p className="mb-3 text-sm text-slate-600">
          A senior recruiter and the hiring manager for this role read the original posting (downloaded again from its link) and
          score this version: what works, what's weak, and which qualifications the résumé doesn't show. About 1–2 minutes.
        </p>
        {scoreButton('Score this résumé', true)}
        {footer}
      </Card>
    );
  }

  if (r.status === 'reviewing') {
    return (
      <Card title="Recruiter review">
        <div className="flex items-center gap-3 text-sm">
          <StatusBadge status="running" />
          <span className="text-slate-700">{r.progress ?? 'Scoring…'}</span>
        </div>
        {stream.run?.status === 'running' && stream.events.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">Agent: {describeEvent(stream.events.at(-1)!.event)}</p>
        )}
      </Card>
    );
  }

  if (r.status === 'failed' || !r.review) {
    return (
      <Card title="Recruiter review">
        <ErrorText>{r.error ?? 'The review failed.'}</ErrorText>
        <div className="mt-3">{scoreButton('Try again', true)}</div>
        {footer}
      </Card>
    );
  }

  return (
    <Card
      title="Recruiter review"
      actions={<LinkButton onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Show details'}</LinkButton>}
    >
      <ReviewSummary view={r} review={r.review} />
      {open && <ReviewDetails review={r.review} />}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {scoreButton('Score again')}
        <span className="text-xs text-slate-500">
          Scored {formatTime(r.updatedAt)} against {r.postingSource === 'live' ? 'the live posting' : 'the saved posting'}.
        </span>
      </div>
      {r.postingNote && <p className="mt-2 text-xs text-amber-800">{r.postingNote}</p>}
      {footer}
    </Card>
  );
}

function ReviewSummary({ view, review }: { view: ReviewView; review: ResumeReview }) {
  const tone = scoreTone(review.overallScore);
  const rec = RECOMMENDATION[review.recommendation];
  const required = review.missingQualifications.filter((m) => m.importance === 'required').length;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className={`flex size-20 shrink-0 flex-col items-center justify-center rounded-full ring-4 ${tone.ring}`}>
          <span className={`text-3xl leading-none font-semibold ${tone.text}`}>{review.overallScore}</span>
          <span className="text-[10px] text-slate-500">/ 100</span>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${rec.className}`}>{rec.label}</span>
            {required > 0 && (
              <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200">
                {required} required qualification{required === 1 ? '' : 's'} not clearly shown
              </span>
            )}
            {view.stale && <Badge tone="amber">edited since scored</Badge>}
          </div>
          <p className="text-sm font-medium text-slate-900">{review.headline}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Take who="Recruiter screen" text={review.recruiterTake} />
        <Take who="Hiring manager" text={review.hiringManagerTake} />
      </div>
    </div>
  );
}

function Take({ who, text }: { who: string; text: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{who}</div>
      <p className="text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function ReviewDetails({ review }: { review: ResumeReview }) {
  return (
    <div className="mt-6 space-y-6">
      <Section title="Scorecard">
        <ul className="space-y-2.5">
          {review.categories.map((c) => {
            const tone = scoreTone(c.score * 10);
            return (
              <li key={c.category}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 text-slate-700">{REVIEW_CATEGORY_LABELS[c.category]}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${c.score * 10}%` }} />
                  </div>
                  <span className={`w-10 shrink-0 text-right text-xs font-semibold ${tone.text}`}>{c.score}/10</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{c.comment}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      {review.missingQualifications.length > 0 && (
        <Section title={`Missing or unclear qualifications · ${review.missingQualifications.length}`}>
          <ul className="space-y-2">
            {[...review.missingQualifications]
              .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'required' ? -1 : 1))
              .map((m, i) => (
                <li
                  key={i}
                  className={`rounded-md border-l-4 px-3 py-2 text-sm ${m.importance === 'required' ? 'border-red-400 bg-red-50/50' : 'border-amber-300 bg-amber-50/40'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{m.requirement}</span>
                    <span className="text-xs text-slate-500">{m.importance === 'required' ? 'Required' : 'Preferred'}</span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {GAP_STATUS_LABEL[m.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{m.note}</p>
                </li>
              ))}
          </ul>
        </Section>
      )}

      <Section title={`Strengths · ${review.strengths.length}`}>
        <ul className="space-y-2">
          {review.strengths.map((s, i) => (
            <li key={i} className="rounded-md border-l-4 border-emerald-400 bg-emerald-50/40 px-3 py-2 text-sm">
              <div className="font-medium text-slate-900">{s.point}</div>
              {s.evidence && <p className="mt-0.5 text-xs text-slate-600 italic">“{s.evidence}”</p>}
              {s.matches && <p className="mt-0.5 text-xs text-emerald-800">Answers: {s.matches}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Deficiencies · ${review.deficiencies.length}`}>
        <ul className="space-y-2">
          {review.deficiencies.map((d, i) => (
            <li key={i} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[d.severity]}`}>
                  {d.severity}
                </span>
                <span className="font-medium text-slate-900">{d.point}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{d.whyItMatters}</p>
              <p className="mt-1 text-xs text-indigo-800">
                <span className="font-semibold">Fix:</span> {d.fix}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {review.interviewProbes.length > 0 && (
        <Section title="What they'd probe in a screen">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {review.interviewProbes.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}
