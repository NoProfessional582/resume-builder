import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, inputClass, PageHeader } from '../components/ui';
import { workspaceRequest as request, type Workspace } from '../workspace';
import { wallTime, toInstant } from '../eventTime';
import { api } from '../api';

export interface EventItem {
 id:number; application_id:number; title:string; type:string; dateOnly:boolean; start:string; end:string|null; timezone:string; location:string; notes:string; state:string;
 company:string; role_title:string; stage:string|null; offer_outcome:string|null;
 participants:{id:number;name:string}[]; history:{id:number;summary:string;recorded_at:number}[];
}
const types = ['screening','interview','assessment','deadline','follow_up','response'];
const label = (v:string)=>v.replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase());
const zone = ()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
export function EventForm({id,event,onDone,defaultTimezone}:{id:number;event?:EventItem;onDone:()=>void;defaultTimezone:string}) {
 const qc=useQueryClient();
 const [title,setTitle]=useState(event?.title??'');
 const [type,setType]=useState(event?.type??'interview');
 const [dateOnly,setDateOnly]=useState(event?.dateOnly??false);
 const [timezone,setTimezone]=useState(event?.timezone??defaultTimezone);
 const [start,setStart]=useState(event ? (event.dateOnly ? event.start : wallTime(event.start,event.timezone)) : '');
 const [end,setEnd]=useState(event?.end ? (event.dateOnly ? event.end : wallTime(event.end,event.timezone)) : '');
 const [participants,setParticipants]=useState(event?.participants.map(p=>p.id)??[]);
 const [location,setLocation]=useState(event?.location??'');
 const [notes,setNotes]=useState(event?.notes??'');
 const [state,setState]=useState(event?.state??'scheduled');
 const contacts=useQuery({queryKey:['workspace',id],queryFn:()=>request<Workspace>('GET',`/applications/${id}/workspace`)});
 const instant = (value:string, original:string|null|undefined) => original && event?.timezone===timezone && wallTime(original,timezone)===value ? original : toInstant(value,timezone,'earlier');
 const save=useMutation({mutationFn:()=>request(event?'PUT':'POST',`/applications/${id}/events${event?'/'+event.id:''}`,{
 title,type,dateOnly,timezone,start:dateOnly?start:instant(start,event?.start),end:end?(dateOnly?end:instant(end,event?.end)):null,participants,location,notes,state,
 }),onSuccess:()=>{qc.invalidateQueries({queryKey:['events']});onDone();}});
 return <form className="space-y-3" onSubmit={e=>{e.preventDefault();save.mutate();}}>
 <Field label="Title"><input required className={inputClass} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
 <Field label="Type"><select className={inputClass} value={type} onChange={e=>setType(e.target.value)}>{types.map(t=><option key={t} value={t}>{label(t)}</option>)}</select></Field>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={dateOnly} onChange={e=>{setDateOnly(e.target.checked);setStart('');setEnd('');}}/>Date only</label>
 <Field label="Time Zone" hint="IANA name, for example America/Los_Angeles. Changing this keeps the entered local time."><input required className={inputClass} value={timezone} onChange={e=>setTimezone(e.target.value)}/></Field>
 <div className="grid gap-3 sm:grid-cols-2"><Field label="Start"><input required type={dateOnly?'date':'datetime-local'} className={inputClass} value={start} onChange={e=>setStart(e.target.value)}/></Field>
 <Field label="End (Optional)"><input type={dateOnly?'date':'datetime-local'} className={inputClass} value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>
 <fieldset><legend className="text-sm font-medium">Participants</legend>{contacts.data?.contacts.map(c=><label key={c.id} className="flex gap-2 text-sm"><input type="checkbox" checked={participants.includes(c.id)} onChange={e=>setParticipants(e.target.checked?[...participants,c.id]:participants.filter(i=>i!==c.id))}/>{c.name}</label>)}{!contacts.data?.contacts.length&&<p className="text-sm text-slate-500">Link contacts in the workspace to add participants.</p>}{contacts.error&&<ErrorText>{contacts.error.message}</ErrorText>}</fieldset>
 <Field label="Location or Meeting Link"><input className={inputClass} value={location} onChange={e=>setLocation(e.target.value)}/></Field>
 <Field label="Notes"><textarea className={inputClass} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
 <Field label="State"><select className={inputClass} value={state} onChange={e=>setState(e.target.value)}>{['scheduled','completed','cancelled'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></Field>
 {save.error&&<ErrorText>{save.error.message}</ErrorText>}
 <div className="flex gap-2"><Button variant="primary" disabled={save.isPending}>Save event</Button><Button type="button" disabled={save.isPending} onClick={onDone}>Cancel</Button></div>
 </form>;
}
export function EventsPanel({applicationId}:{applicationId?:number}) {
 const [editing,setEditing]=useState<EventItem|null|undefined>(undefined);
 const settings=useQuery({queryKey:['settings'],queryFn:api.getSettings});
 const timezone=settings.data?.displayTimezone??zone();
 const [showHistory,setShowHistory]=useState(false);
 const events=useQuery({queryKey:['events',applicationId],queryFn:()=>request<EventItem[]>('GET',applicationId?`/applications/${applicationId}/events`:'/events'),refetchInterval:60000});
 const now=Date.now();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const due=(e:EventItem)=>e.dateOnly?e.start<today:Date.parse(e.end??e.start)<now;
 const inactive=(e:EventItem)=>e.stage==='closed'||e.offer_outcome==='accepted';
 const display=(e:EventItem,t:string)=>e.dateOnly?t:new Intl.DateTimeFormat(undefined,{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(t));
 const rows=[...(events.data??[])].filter(e=>showHistory||e.state==='scheduled').sort((a,b)=>{
 const key=(e:EventItem)=>e.dateOnly?e.start+'T00:00':wallTime(e.start,timezone);
 return key(a).localeCompare(key(b))||a.id-b.id;
 });
 return <Card title={applicationId?'Events & next actions':'Agenda'} actions={applicationId?<Button onClick={()=>setEditing(null)}>Add event / follow-up</Button>:undefined}>
 <div className="space-y-4">
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)}/>Show Completed and Cancelled</label>
 {settings.error&&<ErrorText>{settings.error.message}</ErrorText>}
 {editing!==undefined&&<EventForm key={editing?.id??'new'} id={applicationId??editing!.application_id} event={editing??undefined} defaultTimezone={timezone} onDone={()=>setEditing(undefined)}/>}
 {events.isPending&&<p>Loading events…</p>}{events.error&&<ErrorText>{events.error.message}</ErrorText>}
 {!events.isPending&&!events.error&&!rows.length&&<p className="text-sm text-slate-500">No scheduled events. Add an event or next-action date from an application workspace.</p>}
 {rows.map(e=><article key={e.id} className="space-y-2 rounded-md border border-slate-200 p-4">
 <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-medium">{e.title}</h3><p className="text-sm">{label(e.type)} · {label(e.state)}{e.state==='scheduled'&&due(e)?' · Overdue':''}</p></div><Button onClick={()=>setEditing(e)}>Edit / change state</Button></div>
 <p className="text-sm">{display(e,e.start)}{e.end?' – '+display(e,e.end):''}{e.dateOnly?' · Date only':' · '+timezone}</p>
 {!applicationId&&<Link className="text-sm text-indigo-700 underline" to={`/applications/${e.application_id}`}>{e.company} · {e.role_title}</Link>}
 {inactive(e)&&e.state==='scheduled'&&<p className="text-sm text-amber-800">Application closed or offer accepted. Reminders suppressed; this commitment is retained. Review and cancel it if no longer needed.</p>}
 {e.location&&<p className="break-words text-sm">{e.location} {/^https?:\/\//i.test(e.location)&&<a className="text-indigo-700 underline" href={e.location} target="_blank" rel="noreferrer">Open meeting</a>}</p>}
 {e.participants.length>0&&<p className="text-sm">With: {e.participants.map(p=>p.name).join(', ')}</p>}
 {e.notes&&<p className="text-sm whitespace-pre-wrap">{e.notes}</p>}
 <details className="text-xs text-slate-500"><summary>Event history</summary>{e.history.map(h=><p key={h.id}>{new Date(h.recorded_at).toLocaleString()} · {h.summary}</p>)}</details>
 </article>)}
 </div></Card>;
}
export function AgendaPage(){return <><PageHeader title="Agenda" description="Upcoming commitments and overdue next actions across applications."/><EventsPanel/></>;}
