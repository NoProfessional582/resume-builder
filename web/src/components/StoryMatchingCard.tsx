import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type StoryMatch } from '../api';
import type { TailoredView } from '../tailoringTypes';
import { Button, Card, ErrorText, inputClass } from './ui';
import { displayRange } from '../lib/dates';

export function StoryMatchingCard({ view, dirty, onSaved }: {
  view: TailoredView; dirty: boolean; onSaved: (view: TailoredView) => void;
}) {
  const content = view.content!;
  const roles = useQuery({ queryKey: ['positions'], queryFn: api.listPositions });
  const [matches, setMatches] = useState<StoryMatch[]>(() => content.positions.map((p, index) => ({
    index, positionId: p.positionId > 0 ? p.positionId : null,
    bullets: p.bullets.map((b, index) => ({ index, storyIds: b.sourceStoryIds, reason: '' })),
  })));
  const [expectedContent, setExpectedContent] = useState(JSON.stringify(content));
  const [open, setOpen] = useState(content.positions.some(p => p.positionId < 0));
  const suggest = useMutation({
    mutationFn: () => api.suggestStoryMatches(view.id),
    onSuccess: result => { setMatches(result.matches); setExpectedContent(result.expectedContent); setOpen(true); },
  });
  const save = useMutation({
    mutationFn: () => api.saveStoryMatches(view.id, matches, expectedContent),
    onSuccess: result => { setExpectedContent(JSON.stringify(result.content)); onSaved(result); setOpen(false); },
  });
  const busy = dirty || suggest.isPending || save.isPending;
  const count = content.positions.flatMap(p => p.bullets).filter(b => b.sourceStoryIds.length).length;
  const change = (index: number, patch: Partial<StoryMatch>) => setMatches(matches.map(m => m.index === index ? { ...m, ...patch } : m));
  return <Card title="Match uploaded bullets to your stories">
    <p className="mb-3 text-sm text-slate-600">{count} of {content.positions.reduce((n, p) => n + p.bullets.length, 0)} bullets linked. Match each uploaded role to your work history, then confirm the stories that support its bullets. Résumé wording stays unchanged.</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !roles.data?.some(p => p.stories.length)} onClick={() => suggest.mutate()}>{suggest.isPending ? 'Finding matches…' : 'Suggest story matches'}</Button>
      <Button disabled={busy} onClick={() => setOpen(!open)}>{open ? 'Hide matches' : 'Review story matches'}</Button>
    </div>
    {suggest.isPending && <p role="status" className="mt-3 text-sm">Comparing accomplishments with your existing stories. Suggestions need your review.</p>}
    {dirty && <p className="mt-3 text-sm text-amber-800">Save or discard résumé edits before matching stories.</p>}
    {roles.data && !roles.data.some(p => p.stories.length) && <p className="mt-3 text-sm">Add stories in Work History to match them here. You can leave bullets unmatched.</p>}
    {open && <fieldset disabled={busy || !roles.data} className="mt-4 space-y-5">
      {content.positions.map((position, index) => {
        const match = matches.find(m => m.index === index)!;
        const role = roles.data?.find(p => p.id === match.positionId);
        return <section key={index} className="space-y-3 rounded border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">{position.title} · {position.organization}</h3>
          <p className="text-xs text-slate-500">{displayRange(position.start, position.end)}</p>
          <label className="block text-sm">Existing role
            <select className={`${inputClass} mt-1`} value={match.positionId ?? ''} onChange={e => change(index, {
              positionId: e.target.value ? Number(e.target.value) : null,
              bullets: match.bullets.map(b => ({ ...b, storyIds: [], reason: '' })),
            })}>
              <option value="">No matching role</option>
              {roles.data?.map(p => <option key={p.id} value={p.id}>{p.title} · {p.organization} · {displayRange(p.start, p.end)}</option>)}
            </select>
          </label>
          {position.bullets.map((bullet, bi) => {
            const bm = match.bullets.find(b => b.index === bi)!;
            return <div key={bi} className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-sm font-medium">{bullet.text}</p>
              {bm.reason && <p className="text-xs text-slate-600">Suggestion: {bm.reason}</p>}
              <p className="text-xs text-slate-500">{bm.storyIds.length ? `${bm.storyIds.length} supporting stories selected` : 'Unmatched · no supporting story selected'}</p>
              {role?.stories.map(story => <label key={story.id} className="flex items-start gap-2 rounded bg-slate-50 p-2 text-sm">
                <input type="checkbox" className="mt-1 shrink-0" checked={bm.storyIds.includes(story.id)} onChange={e => change(index, {
                  bullets: match.bullets.map(b => b.index !== bi ? b : { ...b, storyIds: e.target.checked ? [...b.storyIds, story.id] : b.storyIds.filter(id => id !== story.id) }),
                })} />
                <span>S{story.id} · {story.text}</span>
              </label>)}
              {role && !role.stories.length && <p className="text-xs text-slate-500">This role has no stories yet.</p>}
            </div>;
          })}
        </section>;
      })}
      <Button variant="primary" onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Confirm story matches'}</Button>
    </fieldset>}
    {(roles.error ?? suggest.error ?? save.error) && <ErrorText>{(roles.error ?? suggest.error ?? save.error)!.message}</ErrorText>}
    {save.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Story matches saved.</p>}
  </Card>;
}
