import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { ListEditor } from '../components/ListEditor';
import { AutoTextarea, Badge, Button, Card, ErrorText, Field, inputClass, LinkButton, PageHeader } from '../components/ui';
import {
  KIND_LABELS,
  type CertificationItem,
  type EducationItem,
  type EntryItem,
  type ProfileSection,
  type ProfileSectionKind,
  type SkillGroup,
  type SummaryItem,
} from '../profileTypes';

export function SectionsPage() {
  const sections = useQuery({ queryKey: ['sections'], queryFn: api.listSections });
  const [adding, setAdding] = useState(false);

  if (sections.error) return <ErrorText>{sections.error.message}</ErrorText>;
  if (!sections.data) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Other Sections"
        description="Everything on your resume besides work history and the page header."
        actions={!adding && <Button variant="primary" onClick={() => setAdding(true)}>Add section</Button>}
      />
      <div className="space-y-6">
        {adding && <NewSection onDone={() => setAdding(false)} />}
        {sections.data.length === 0 && !adding && (
          <Card><p className="text-sm text-slate-600">No sections yet.</p></Card>
        )}
        {sections.data.map((s) => <SectionCard key={s.id} section={s} />)}
      </div>
    </>
  );
}

const sectionTitle = (s: { kind: ProfileSectionKind; heading: string | null }) => s.heading || KIND_LABELS[s.kind];

function NewSection({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ProfileSectionKind>('entries');
  const [heading, setHeading] = useState('');
  const create = useMutation({
    mutationFn: () => api.createSection(kind, heading.trim() || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      onDone();
    },
  });
  return (
    <Card title="New section">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as ProfileSectionKind)}>
            {(Object.keys(KIND_LABELS) as ProfileSectionKind[]).map((k) => (
              <option key={k} value={k}>{k === 'entries' ? 'List (awards, volunteer work, …)' : KIND_LABELS[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Heading" hint={kind === 'entries' ? 'List sections are matched to your template by heading.' : undefined}>
          <input className={inputClass} value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="e.g. VOLUNTEER WORK" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>Add section</Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
      {create.error && <div className="mt-3"><ErrorText>{create.error.message}</ErrorText></div>}
    </Card>
  );
}

function SectionCard({ section }: { section: ProfileSection }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteSection(section.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sections'] }),
  });

  return (
    <Card
      title={sectionTitle(section)}
      actions={
        <div className="flex items-center gap-2">
          <Badge>{KIND_LABELS[section.kind]}</Badge>
          {!section.inTemplate && (
            <span title="Your template has no matching section, so this won't appear in generated resumes.">
              <Badge tone="amber">Not in template</Badge>
            </span>
          )}
          {!editing && <LinkButton onClick={() => setEditing(true)}>Edit</LinkButton>}
          <LinkButton
            danger
            onClick={() => window.confirm(`Delete the "${sectionTitle(section)}" section?`) && remove.mutate()}
          >
            Delete
          </LinkButton>
        </div>
      }
    >
      {editing ? <SectionEditor section={section} onDone={() => setEditing(false)} /> : <SectionView section={section} />}
      {remove.error && <div className="mt-3"><ErrorText>{remove.error.message}</ErrorText></div>}
    </Card>
  );
}

// ------------------------------------------------------------------- Viewing

function SectionView({ section }: { section: ProfileSection }) {
  if (section.items.length === 0) return <p className="text-sm text-slate-400 italic">Empty. It won't appear on resumes.</p>;
  switch (section.kind) {
    case 'summary':
      return (
        <div className="space-y-2">
          {(section.items as SummaryItem[]).map((s, i) => <p key={i} className="text-sm leading-relaxed">{s.text}</p>)}
        </div>
      );
    case 'skills':
      return (
        <div className="space-y-2">
          {(section.items as SkillGroup[]).map((g, i) => (
            <div key={i}>
              {g.category && <div className="mb-1 text-xs font-semibold text-slate-500">{g.category}</div>}
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((s, j) => <span key={j} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs">{s}</span>)}
              </div>
            </div>
          ))}
        </div>
      );
    case 'education':
      return (
        <ul className="space-y-1 text-sm">
          {(section.items as EducationItem[]).map((e, i) => (
            <li key={i}>
              <span className="font-medium">{e.degree}</span>
              {[e.school, e.location].filter(Boolean).map((x) => `, ${x}`)}
              {e.details && <span className="text-slate-500"> ({e.details})</span>}
              {e.dates && <span className="text-slate-500"> · {e.dates}</span>}
            </li>
          ))}
        </ul>
      );
    case 'certifications':
      return (
        <ul className="space-y-1 text-sm">
          {(section.items as CertificationItem[]).map((c, i) => (
            <li key={i}>
              <span className="font-medium">{c.name}</span>
              {c.issuer && <>, {c.issuer}</>}
              {c.date && <span className="text-slate-500"> · {c.date}</span>}
            </li>
          ))}
        </ul>
      );
    case 'entries':
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {(section.items as EntryItem[]).map((e, i) => <li key={i}>{e.text}</li>)}
        </ul>
      );
  }
}

// ------------------------------------------------------------------- Editing

function SectionEditor({ section, onDone }: { section: ProfileSection; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [heading, setHeading] = useState(section.heading ?? '');
  const [items, setItems] = useState<unknown[]>(() => structuredClone(section.items));
  const save = useMutation({
    mutationFn: () => api.saveSection(section.id, heading.trim() || null, cleanItems(section.kind, items)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      onDone();
    },
  });

  return (
    <div className="space-y-4">
      {(section.kind === 'entries' || section.heading) && (
        <Field
          label="Heading"
          hint={
            section.kind === 'entries'
              ? "Keep it matching your template's heading, or the section won't print."
              : 'The printed heading comes from your template.'
          }
        >
          <input className={inputClass} value={heading} onChange={(e) => setHeading(e.target.value)} />
        </Field>
      )}
      {section.kind === 'summary' && <SummaryEditor items={items as SummaryItem[]} onChange={setItems} />}
      {section.kind === 'skills' && <SkillsEditor items={items as SkillGroup[]} onChange={setItems} />}
      {section.kind === 'education' && <EducationEditor items={items as EducationItem[]} onChange={setItems} />}
      {section.kind === 'certifications' && <CertificationsEditor items={items as CertificationItem[]} onChange={setItems} />}
      {section.kind === 'entries' && <EntriesEditor items={items as EntryItem[]} onChange={setItems} />}
      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save section'}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
      {save.error && <ErrorText>{save.error.message}</ErrorText>}
    </div>
  );
}

/** Drops blank rows so a half-filled "add" row doesn't block saving. */
function cleanItems(kind: ProfileSectionKind, items: unknown[]): unknown[] {
  switch (kind) {
    case 'summary':
    case 'entries':
      return (items as { text: string }[]).filter((i) => i.text.trim());
    case 'skills':
      return (items as SkillGroup[])
        .map((g) => ({ ...g, items: g.items.map((s) => s.trim()).filter(Boolean) }))
        .filter((g) => g.items.length);
    case 'education':
      return (items as EducationItem[]).filter((e) => Object.values(e).some((v) => v?.trim()));
    case 'certifications':
      return (items as CertificationItem[]).filter((c) => Object.values(c).some((v) => v?.trim()));
  }
}

function SummaryEditor({ items, onChange }: { items: SummaryItem[]; onChange: (items: SummaryItem[]) => void }) {
  // Edited as one text box; a blank line starts a new paragraph.
  const [text, setText] = useState(items.map((i) => i.text).join('\n\n'));
  return (
    <Field label="Summary" hint="Separate paragraphs with a blank line.">
      <AutoTextarea
        minRows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split(/\n\s*\n/).map((t) => ({ text: t.trim() })).filter((p) => p.text));
        }}
      />
    </Field>
  );
}

function SkillsEditor({ items, onChange }: { items: SkillGroup[]; onChange: (items: SkillGroup[]) => void }) {
  return (
    <>
      <p className="text-xs text-slate-500">
        One skill per line. Categories are optional; a skills table in your template prints all skills without them.
      </p>
      <ListEditor
        items={items}
        onChange={onChange}
        blank={() => ({ category: null, items: [] })}
        addLabel="Add skill group"
        renderItem={(g, update) => <SkillGroupEditor group={g} update={update} />}
      />
    </>
  );
}

const skillLines = (s: string[]) => s.map((x) => x.trim()).filter(Boolean).join('\n');

function SkillGroupEditor({ group, update }: { group: SkillGroup; update: (patch: Partial<SkillGroup>) => void }) {
  const [text, setText] = useState(group.items.join('\n'));
  // Rows are keyed by position, so after a reorder this box may hold another group's text.
  useEffect(() => {
    if (skillLines(text.split('\n')) !== skillLines(group.items)) setText(group.items.join('\n'));
  }, [group.items]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2">
      <input
        className={inputClass}
        placeholder="Category (optional)"
        value={group.category ?? ''}
        onChange={(e) => update({ category: e.target.value || null })}
      />
      <AutoTextarea
        minRows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          update({ items: e.target.value.split('\n') });
        }}
      />
    </div>
  );
}

function EducationEditor({ items, onChange }: { items: EducationItem[]; onChange: (items: EducationItem[]) => void }) {
  return (
    <ListEditor
      items={items}
      onChange={onChange}
      blank={() => ({ degree: '', school: null, location: null, dates: null, details: null })}
      addLabel="Add education"
      renderItem={(e, update) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputClass} placeholder="Degree or program" value={e.degree} onChange={(ev) => update({ degree: ev.target.value })} />
          <input className={inputClass} placeholder="School" value={e.school ?? ''} onChange={(ev) => update({ school: ev.target.value })} />
          <input className={inputClass} placeholder="Location (optional)" value={e.location ?? ''} onChange={(ev) => update({ location: ev.target.value })} />
          <input className={inputClass} placeholder="Dates (optional)" value={e.dates ?? ''} onChange={(ev) => update({ dates: ev.target.value })} />
          <input
            className={`${inputClass} sm:col-span-2`}
            placeholder="Details, e.g. summa cum laude (optional)"
            value={e.details ?? ''}
            onChange={(ev) => update({ details: ev.target.value })}
          />
        </div>
      )}
    />
  );
}

function CertificationsEditor({ items, onChange }: { items: CertificationItem[]; onChange: (items: CertificationItem[]) => void }) {
  return (
    <ListEditor
      items={items}
      onChange={onChange}
      blank={() => ({ name: '', issuer: null, date: null })}
      addLabel="Add certification"
      renderItem={(c, update) => (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={`${inputClass} sm:col-span-3`} placeholder="Name" value={c.name} onChange={(e) => update({ name: e.target.value })} />
          <input className={`${inputClass} sm:col-span-2`} placeholder="Issuer (optional)" value={c.issuer ?? ''} onChange={(e) => update({ issuer: e.target.value })} />
          <input className={inputClass} placeholder="Date (optional)" value={c.date ?? ''} onChange={(e) => update({ date: e.target.value })} />
        </div>
      )}
    />
  );
}

function EntriesEditor({ items, onChange }: { items: EntryItem[]; onChange: (items: EntryItem[]) => void }) {
  return (
    <ListEditor
      items={items}
      onChange={onChange}
      blank={() => ({ text: '' })}
      addLabel="Add item"
      renderItem={(e, update) => <AutoTextarea minRows={2} value={e.text} onChange={(ev) => update({ text: ev.target.value })} />}
    />
  );
}
