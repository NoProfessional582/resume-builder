import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { ReviewView } from '../tailoringTypes';
import type { Position, Story } from '../profileTypes';
import { RefinePanel } from './RefinePanel';
import { AutoTextarea, Button, ErrorText } from './ui';

export function QualificationFollowUp({ versionId, view, disabled }: { versionId: number; view: ReviewView; disabled: boolean }) {
  const cache = useQueryClient();
  const positions = useQuery({ queryKey: ['positions'], queryFn: api.listPositions });
  const [gapIndex, setGapIndex] = useState(0);
  const [positionId, setPositionId] = useState('');
  const [storyId, setStoryId] = useState('');
  const [text, setText] = useState('');
  const [active, setActive] = useState<{ story: Story; position: Position; gapIndex: number } | null>(null);
  const position = positions.data?.find(p => p.id === Number(positionId));
  const start = useMutation({
    mutationFn: async () => {
      if (!position) throw new Error('Choose a work history role first.');
      const story = storyId ? position.stories.find(s => s.id === Number(storyId))! : await api.createStory(position.id, text);
      cache.invalidateQueries({ queryKey: ['positions'] });
      return { story, position, gapIndex };
    },
    onSuccess: setActive,
  });
  const gaps = view.review?.missingQualifications ?? [];
  if (!gaps.length) return null;
  return <section className="mt-6 space-y-3 border-t border-slate-200 pt-4">
    <h3 className="text-sm font-semibold">Build evidence from your experience</h3>
    <p className="text-sm text-slate-600">Work through each qualification with the agent. Expand an existing story or describe a real example to start a new one. Review and accept the draft to save it to Work history.</p>
    <label className="block text-sm">Qualification
      <select className="mt-1 block w-full rounded border border-slate-300 p-2" value={gapIndex} onChange={e => setGapIndex(Number(e.target.value))}>
        {gaps.map((g, i) => <option key={i} value={i}>{g.requirement}</option>)}
      </select>
    </label>
    <label className="block text-sm">Work history role
      <select className="mt-1 block w-full rounded border border-slate-300 p-2" value={positionId} onChange={e => { setPositionId(e.target.value); setStoryId(''); }}>
        <option value="">Choose a role…</option>
        {positions.data?.map(p => <option key={p.id} value={p.id}>{p.title} · {p.organization}</option>)}
      </select>
    </label>
    {position && <label className="block text-sm">Story
      <select className="mt-1 block w-full rounded border border-slate-300 p-2" value={storyId} onChange={e => setStoryId(e.target.value)}>
        <option value="">Start a new story</option>
        {position.stories.map(s => <option key={s.id} value={s.id}>{s.openSessionId ? 'Resume conversation · ' : ''}{s.text.slice(0, 100)}</option>)}
      </select>
    </label>}
    {position && !storyId && <AutoTextarea minRows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Describe a real example from this role. What happened, and what did you personally do?" />}
    <Button onClick={() => start.mutate()} disabled={disabled || !position || (!storyId && !text.trim()) || start.isPending}>{start.isPending ? 'Starting…' : 'Discuss this qualification'}</Button>
    {disabled && <p className="text-xs text-amber-800">Save your changes and score again to follow up on the current résumé.</p>}
    {positions.data?.length === 0 && <p className="text-sm text-slate-600">Add a role in Work history first.</p>}
    {(start.error || positions.error) && <ErrorText>{(start.error || positions.error)!.message}</ErrorText>}
    <p className="text-xs text-slate-500">New examples are saved as raw stories when you start. Closing keeps the conversation for later. After accepting, regenerate or revise the résumé with the updated work history and score again.</p>
    {active && <RefinePanel key={`${active.story.id}:${active.gapIndex}`} story={active.story} position={active.position} gap={{ versionId, gapIndex: active.gapIndex, reviewedAt: view.updatedAt }} onClose={() => setActive(null)} />}
  </section>;
}
