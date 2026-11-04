import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AutoTextarea, Button, Card, ErrorText, Field, inputClass } from '../components/ui';
import { useRunStream } from '../hooks/useRunStream';
import { describeEvent } from '../lib/format';

type Answer={assessment:string;situation:string;task:string;action:string;result:string;lessons:string;sourceText:string;sourceLessons:string;speakingNotes:string;questions:string[];followUps:string[];gaps:string[]};
type Source={id:number;text:string;lessons:string|null;title:string;organization:string;versionId:number|null};
type SourceRecommendation={id:number;runId:number|null;data:{text:string;lessons:string;summary:string;changes:string[];excludedDetails:string[];hasChanges:boolean}|null;currentSource:Source;expectedSource:string;stale:boolean;error:string|null};
type Session={sourceRecommendation:SourceRecommendation|null;id:number;question:string;status:string;source:Source;currentSource:Source|null;sourceChanged:boolean;sourceMissing:boolean;analysisChanged:boolean;answer:Answer;practiceNotes:string;runId:number|null;error:string|null;messages:{id:number;role:string;content:string;answer:Answer|null}[]};
async function call<T>(path:string,method='GET',body?:unknown):Promise<T> {
 const r=await fetch('/api'+path,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json(); if(!r.ok) throw new Error(data.issues?.map((i:{message:string})=>i.message).join('; ')??data.error??'Request failed');return data;
}
export function PreparationTab({id}:{id:number}) {
 const qc=useQueryClient(); const [selected,setSelected]=useState<number|null>(null); const [story,setStory]=useState(''); const [question,setQuestion]=useState('Tell me about a challenging project and your contribution.'); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const sessions=useQuery({queryKey:['preparation',id],queryFn:()=>call<Session[]>(`/applications/${id}/preparation`),refetchInterval:3000});
 const stories=useQuery({queryKey:['preparation-stories',id],queryFn:()=>call<(Source&{reason:string;matches:string[]})[]>(`/applications/${id}/preparation/stories`)});
 const s=sessions.data?.find(s=>s.id===selected);
 // Keep one current session per story/question; discarded attempts never replace a saved answer.
 const currentSessions=(sessions.data??[]).filter(s=>s.status!=='discarded').sort((a,b)=>Number(hasPreparedAnswer(b))-Number(hasPreparedAnswer(a))||b.id-a.id).filter((s,i,all)=>all.findIndex(other=>other.source.id===s.source.id&&other.question===s.question)===i);
 async function refresh(){await Promise.all([qc.invalidateQueries({queryKey:['preparation',id]}),qc.invalidateQueries({queryKey:['preparation-stories',id]})]);}
 function openSession(session:Session){setSelected(session.id);void call(`/preparation/${session.id}/evaluate`,'POST',{}).then(refresh).catch(e=>setError(e.message));}

 async function create(storyId=Number(story),selectedQuestion=question) {
  setBusy(true);setError('');try {
   const existing=sessions.data?.find(s=>s.source.id===storyId&&s.question===selectedQuestion&&s.status!=='discarded');
   const r=existing??await call<Session>(`/applications/${id}/preparation`,'POST',{storyId,question:selectedQuestion});
   qc.setQueryData<Session[]>(['preparation',id],old=>[r,...(old??[]).filter(s=>s.id!==r.id)]);setSelected(r.id);
   await call(`/preparation/${r.id}/evaluate`,'POST',{});
   await qc.invalidateQueries({queryKey:['preparation',id]});
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
  <InterviewPlan id={id} stories={stories.data??[]} sessions={currentSessions} openSession={openSession} busy={busy} choose={(sid,q)=>{setStory(String(sid));setQuestion(q);void create(sid,q);}}/>
  <Card title="Prepare another experience"><p className="mb-4 text-sm text-slate-600">Choose an experience and question. Your coach will assess it first, then guide you through developing the story. Save new factual details back to work history after review.</p>
   <div className="space-y-3"><Field label="Source story"><select className={inputClass} value={story} onChange={e=>setStory(e.target.value)}><option value="">Choose a story</option>{stories.data?.map(s=><option key={s.id} value={s.id}>{s.organization} · {s.title} — {s.text.slice(0,100)}</option>)}</select></Field>
   {stories.isPending && <p>Loading stories…</p>}{stories.error && <ErrorText>{stories.error.message}</ErrorText>}
   {stories.data?.length===0 && <p className="text-sm text-slate-500">Add a story in Work History to begin.</p>}
   {stories.data?.filter(s=>String(s.id)===story).map(s=><div key={s.id} className="text-sm"><p className="whitespace-pre-wrap">{s.text}</p></div>)}
   <Field label="Interview question or competency"><input className={inputClass} value={question} onChange={e=>setQuestion(e.target.value)}/></Field><Button variant="primary" disabled={!story||!question.trim()||busy} onClick={()=>void create()}>Start preparation</Button></div>
  </Card>
  {(error||sessions.error) && <ErrorText>{error||sessions.error?.message}</ErrorText>}

  {s && <PreparationEditor key={s.id} session={s} starting={busy} onClose={()=>setSelected(null)} refresh={refresh}/>}
 </div>;
}
const STARL_FIELDS=['situation','task','action','result','lessons'] as const;
const STARL_LABELS={situation:'Situation',task:'Task',action:'Action',result:'Result',lessons:'Lessons learned'};
function hasPreparedAnswer(session:Session){return STARL_FIELDS.some(k=>session.answer[k]?.trim());}
function PreparedAnswerPreview({session:s}:{session:Session}){
 return <div className="mt-3 space-y-3">
  <p className="text-xs font-medium text-indigo-700">{s.status==='accepted'?'Accepted S.T.A.R.L answer':'Saved S.T.A.R.L draft'}</p>
  {STARL_FIELDS.map(k=>s.answer[k]?.trim()?<section key={k}><h4 className="font-medium">{STARL_LABELS[k]}</h4><p className="whitespace-pre-wrap">{s.answer[k]}</p></section>:null)}
  {(s.answer.speakingNotes||s.practiceNotes)&&<details><summary className="cursor-pointer text-indigo-700">Speaking & practice notes</summary>{s.answer.speakingNotes&&<p className="mt-2 whitespace-pre-wrap">{s.answer.speakingNotes}</p>}{s.practiceNotes&&<p className="mt-2 whitespace-pre-wrap">{s.practiceNotes}</p>}</details>}
 </div>;
}

type ExpectedQuestion={question:string;competency:string;rationale:string;evidence:string};
type Recommendation={storyId:number;question:string;reason:string;focus:string};
type Plan={data:{expectedQuestions:ExpectedQuestion[];recommendations:Recommendation[];additionalStories:Recommendation[];gaps:string[]}|null;expectedQuestions:ExpectedQuestion[];runId:number|null;error:string|null;stale:boolean};
function InterviewPlan({id,stories,sessions,openSession,busy,choose}:{id:number;stories:Source[];sessions:Session[];openSession:(session:Session)=>void;busy:boolean;choose:(storyId:number,question:string)=>void}) {
 const qc=useQueryClient();const [pending,setPending]=useState(false);const [error,setError]=useState('');
 const plan=useQuery({queryKey:['interview-plan',id],queryFn:()=>call<Plan>(`/applications/${id}/interview-plan`),refetchInterval:3000});
 const {events}=useRunStream(plan.data?.runId??null);
 const questions=plan.data?.expectedQuestions.length?plan.data.expectedQuestions:(plan.data?.data?.expectedQuestions??[]);
 async function generate(){setPending(true);setError('');try{await call(`/applications/${id}/interview-plan`,'POST',{});await qc.invalidateQueries({queryKey:['interview-plan',id]});}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 function recommendation(r:Recommendation,i:number){
  const source=stories.find(s=>s.id===r.storyId);
  const prepared=sessions.find(s=>s.source.id===r.storyId&&s.question===r.question);
  return <div key={i} className="rounded border border-slate-200 p-3 text-sm">
   <p className="font-medium">{source?`${source.organization} · ${source.title}`:prepared?`${prepared.source.organization} · ${prepared.source.title}`:'Source story unavailable'}</p>
   {prepared&&hasPreparedAnswer(prepared)?<PreparedAnswerPreview session={prepared}/>:source&&<p className="mt-1 text-slate-600">{source.text.slice(0,240)}</p>}
   <p className="mt-2">{r.reason}</p>
   {(!prepared||!hasPreparedAnswer(prepared))&&<p className="mt-1 text-slate-500">Develop: {r.focus}</p>}
   <div className="mt-3"><Button disabled={(!source&&!prepared)||busy} onClick={()=>prepared?openSession(prepared):choose(r.storyId,r.question)}>{prepared?'Continue preparing':'Prepare this story'}</Button></div>
  </div>;
 }
 const matched=[...(plan.data?.data?.recommendations??[]),...(plan.data?.data?.additionalStories??[])];
 const otherAnswers=sessions.filter(s=>hasPreparedAnswer(s)&&!matched.some(r=>r.storyId===s.source.id&&r.question===s.question));

 return <div className="space-y-5">
  <Card title="Expected interview questions" actions={<Button variant="primary" disabled={pending||plan.data?.runId!=null} onClick={()=>void generate()}>{plan.data?.data?'Refresh questions & story matches':'Generate questions & story matches'}</Button>}>
   <p className="mb-4 text-sm text-slate-600">Questions inferred from the posting, with experiences matched by the agent using your analysis, résumé and full work history. These are preparation suggestions; the employer may ask different questions.</p>
   {plan.isPending&&<p className="text-sm">Loading interview plan…</p>}
   {plan.data?.runId!=null&&<p className="mb-3 text-sm" aria-live="polite">Matching experiences… {events.length?describeEvent(events.at(-1)!.event):'Queued'}</p>}
   {plan.data?.stale&&<p className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Your posting, analysis, résumé or work history changed. Refresh the plan to update suggestions. Existing answers are retained.</p>}
   {(error||plan.error||plan.data?.error)&&<ErrorText>{error||plan.error?.message||plan.data?.error}</ErrorText>}
   {!questions.length&&!plan.isPending&&<p className="text-sm text-slate-500">Generate a plan for this existing application, or run job analysis to include expected questions in its analysis.</p>}
   <div className="space-y-4">{questions.map((q,i)=><section key={i} className="space-y-2 border-t border-slate-100 pt-4"><h3 className="font-medium">{i+1}. {q.question}</h3><p className="text-sm text-indigo-700">{q.competency}</p><p className="text-sm">{q.rationale}</p>{q.evidence&&<p className="text-xs text-slate-500">Posting evidence: “{q.evidence}”</p>}{plan.data?.data?.recommendations.filter(r=>r.question===q.question).map(recommendation)}{plan.data?.data&&!plan.data.data.recommendations.some(r=>r.question===q.question)&&<p className="text-sm text-slate-500">No source story matched yet. Choose a genuine experience below to prepare this question.</p>}</section>)}</div>
   {plan.data?.data?.recommendations.filter(r=>!questions.some(q=>q.question===r.question)).map(recommendation)}
  </Card>
  {!!plan.data?.data?.additionalStories.length&&<Card title="Other stories worth preparing"><div className="space-y-3">{plan.data.data.additionalStories.map(r=><div key={`${r.storyId}-${r.question}`}><p className="mb-2 text-sm font-medium">{r.question}</p>{recommendation(r,r.storyId)}</div>)}</div></Card>}
  {!!otherAnswers.length&&<Card title="Other prepared answers"><div className="space-y-4">{otherAnswers.map(s=><section key={s.id} className="rounded border border-slate-200 p-3 text-sm"><h3 className="font-medium">{s.question}</h3><p className="mt-1 text-slate-500">{s.source.organization} · {s.source.title}</p><PreparedAnswerPreview session={s}/><div className="mt-3"><Button onClick={()=>openSession(s)} disabled={busy}>Continue preparing</Button></div></section>)}</div></Card>}
  {!!plan.data?.data?.gaps.length&&<Card title="Experience gaps to explore"><ul className="list-disc space-y-2 pl-5 text-sm">{plan.data.data.gaps.map((g,i)=><li key={i}>{g}</li>)}</ul><p className="mt-3 text-xs text-slate-500">If you have an example, add it to Work History and refresh this plan.</p></Card>}
 </div>;
}
function SourceUpdateRecommendation({session:s,disabled,refresh,onEditing}:{session:Session;disabled:boolean;refresh:()=>Promise<unknown>;onEditing:(editing:boolean)=>void}) {
 const rec=s.sourceRecommendation;const data=rec?.data;
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);
 const [editing,setEditing]=useState(false);const [text,setText]=useState('');const [lessons,setLessons]=useState('');
 const {events}=useRunStream(rec?.runId??null);
 function edit(value:boolean){setEditing(value);onEditing(value);if(value&&data){setText(data.text);setLessons(data.lessons);}}
 async function generate(){setBusy(true);setError('');setSaved(false);try{await call(`/preparation/${s.id}/source-recommendation`,'POST',{});edit(false);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(){if(!rec||!data)return;setBusy(true);setError('');try{await call(`/preparation/${s.id}/source`,'POST',{text:editing?text:data.text,lessons:editing?lessons:data.lessons,expectedSource:rec.expectedSource,recommendationId:rec.id});edit(false);setSaved(true);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Card title="Recommend a work-history update">
  <p className="mb-3 text-sm text-slate-600">The agent will compare your current experience with confirmed details from this conversation and recommend one cohesive work-history story, keeping lessons separate. Review the recommendation before saving.</p>
  <Button disabled={disabled||busy||rec?.runId!=null||s.status==='discarded'} onClick={()=>void generate()}>{data?'Generate a new recommendation':'Recommend story update'}</Button>
  {disabled&&<p className="mt-2 text-xs text-slate-500">Finish the current turn and save any manual draft edits before requesting a recommendation.</p>}
  {rec?.runId!=null&&<p className="mt-3 text-sm" aria-live="polite">Reviewing applicable details and revising the original experience… {events.length?describeEvent(events.at(-1)!.event):'Queued'}</p>}
  {(error||rec?.error)&&<div className="mt-3"><ErrorText>{error||rec?.error}</ErrorText></div>}
  {data&&<div className="mt-4 space-y-4 text-sm">
   <div className="rounded bg-indigo-50 p-3"><h3 className="font-medium">Agent recommendation</h3><p className="mt-1 whitespace-pre-wrap">{data.summary}</p></div>
   {!!data.changes.length&&<section><h3 className="font-medium">Applicable details integrated</h3><ul className="list-disc pl-5">{data.changes.map((c,i)=><li key={i}>{c}</li>)}</ul></section>}
   {!!data.excludedDetails.length&&<details><summary className="cursor-pointer font-medium">Details left out</summary><ul className="list-disc pl-5">{data.excludedDetails.map((c,i)=><li key={i}>{c}</li>)}</ul></details>}
   <details><summary className="cursor-pointer font-medium">Current story used for this recommendation</summary><p className="mt-2 whitespace-pre-wrap">{rec.currentSource.text}</p><p className="mt-2 whitespace-pre-wrap">Lessons: {rec.currentSource.lessons||'None recorded'}</p></details>
   {editing?<><Field label="Recommended work-history story"><AutoTextarea aria-label="Recommended work-history story" minRows={6} value={text} onChange={e=>setText(e.target.value)}/></Field><Field label="Recommended lessons"><AutoTextarea aria-label="Recommended lessons" minRows={3} value={lessons} onChange={e=>setLessons(e.target.value)}/></Field></>:<><section><h3 className="font-medium">Recommended cohesive story</h3><p className="mt-2 whitespace-pre-wrap">{data.text}</p></section><section><h3 className="font-medium">Lessons learned</h3><p className="mt-2 whitespace-pre-wrap">{data.lessons||'None recorded'}</p></section></>}
   {rec.stale&&!saved&&<p className="rounded bg-amber-50 p-3 text-amber-900">The source story or preparation changed. Generate a new recommendation before saving.</p>}
   {!data.hasChanges&&<p>No applicable new details to save.</p>}
   {data.hasChanges&&!saved&&<div className="flex flex-wrap gap-2"><Button variant="primary" disabled={disabled||busy||rec.stale||rec.runId!=null||(editing&&!text.trim())} onClick={()=>void save()}>Save recommended update</Button><Button disabled={disabled||busy||rec.stale} onClick={()=>edit(!editing)}>{editing?'Discard review edits':'Edit recommendation (optional)'}</Button></div>}
  </div>}
  {saved&&<p role="status" className="mt-3 text-sm text-emerald-700">Cohesive story and lessons saved to Work History.</p>}
 </Card>;
}
function PreparationEditor({session:s,refresh,onClose,starting}:{session:Session;refresh:()=>Promise<unknown>;onClose:()=>void;starting:boolean}) {
 const [answer,setAnswer]=useState(s.answer); const [notes,setNotes]=useState(s.practiceNotes); const [content,setContent]=useState(''); const [dirty,setDirty]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [review,setReview]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);const [manual,setManual]=useState(false);
 useEffect(()=>{const element=dialog.current;const focused=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element?.showModal();return()=>{element?.close();document.body.style.overflow=overflow;focused?.focus();};},[]);
 function close(){if((dirty||content.trim()||review)&&!window.confirm('Close without saving your unsaved edits? Saved conversation and agent progress will remain available.'))return;onClose();}
 const {events}=useRunStream(s.runId);

 // A new completed turn replaces only a clean editor. Local changes are never replaced by polling.
 const [serverAnswer,setServerAnswer]=useState(JSON.stringify(s.answer));
 if(serverAnswer!==JSON.stringify(s.answer)) {setServerAnswer(JSON.stringify(s.answer));if(!dirty){setAnswer(s.answer);setNotes(s.practiceNotes);}}
 const running=s.runId!=null||starting; const editable=s.status==='draft'&&!running&&!busy;
 async function act(action:string) {
  setBusy(true);setError('');try {
   if(['save','turn','accept','retry'].includes(action)) {await call(`/preparation/${s.id}`,'PUT',{answer,practiceNotes:notes});setDirty(false);}
   if(action!=='save') await call(`/preparation/${s.id}/${action}`,'POST',action==='turn'?{content:content.trim()||'Evaluate my existing experience against this question and ask focused questions to develop the full S.T.A.R.L story.'}:{});
   if(action==='turn') setContent('');await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return createPortal(<dialog ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-labelledby="preparation-modal-title" className="m-auto max-h-[90dvh] w-[min(60rem,calc(100vw-2rem))] max-w-none rounded-xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40">
  <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4"><div><h2 id="preparation-modal-title" className="text-lg font-semibold">Prepare your story</h2><p className="mt-1 text-sm">{s.question}</p><p className="mt-1 text-xs text-slate-500">{s.source.organization} · {s.source.title} · Saved progress stays available when you close.</p></div><Button onClick={close} aria-label="Close story preparation">Close</Button></header>
 <div className="min-w-0 space-y-5 p-5 [overflow-wrap:anywhere]">
  {(s.sourceChanged||s.analysisChanged) && <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">{s.sourceMissing?'Source story deleted. Your saved snapshot remains available.':s.sourceChanged?'Work history changed since this preparation began. Review the source before relying on this answer.':''} {s.analysisChanged?'Job analysis changed. This answer still uses the original analysis.':''}</div>}
  <Card title="Your story coach">
   <p className="mb-3 text-sm text-slate-600">First, we’ll assess your existing experience against this question. Then answer the coach’s questions in your own words; the coach will build the S.T.A.R.L story with you.</p>
   {s.messages.filter((m,i)=>m.role!=='agent'||i!==s.messages.length-1).map(m=><div key={m.id} className="mb-3 border-l-2 border-slate-200 pl-3 text-sm"><strong>{m.role==='user'?'You':'Preparation assistant'}</strong><p className="whitespace-pre-wrap">{[m.answer?.assessment,m.content].filter(Boolean).join('\n\n')||'Draft updated.'}</p>{m.answer&&<details><summary className="cursor-pointer text-slate-500">Draft from this turn</summary><p className="whitespace-pre-wrap">{[m.answer.situation,m.answer.task,m.answer.action,m.answer.result,m.answer.lessons].filter(Boolean).join('\n\n')}</p></details>}</div>)}
   {answer.assessment&&<div className="mb-4 rounded bg-indigo-50 p-4 text-sm"><h3 className="mb-2 font-semibold">{s.messages.filter(m=>m.role==='agent').length<=1?'How your experience fits':'Coach’s assessment'}</h3><p className="whitespace-pre-wrap">{answer.assessment}</p></div>}
   {answer.questions.length>0&&<div className="mb-3 rounded bg-indigo-50 p-3 text-sm"><strong>Questions to develop your S.T.A.R.L story</strong><ul className="list-disc pl-5">{answer.questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
   {answer.gaps.length>0&&<details className="mb-3 text-sm text-amber-800"><summary className="cursor-pointer font-medium">Missing evidence</summary><ul className="list-disc pl-5">{answer.gaps.map((q,i)=><li key={i}>{q}</li>)}</ul></details>}
   {answer.followUps.length>0&&<details className="mb-3 text-sm"><summary className="cursor-pointer font-medium">Likely follow-up questions</summary><ul className="list-disc pl-5">{answer.followUps.map((q,i)=><li key={i}>{q}</li>)}</ul></details>}
   {running?<div className="text-sm"><p aria-live="polite">{s.messages.some(m=>m.role==='agent')?'Developing your story…':'Evaluating your existing story…'} {events.length?describeEvent(events.at(-1)!.event):'Queued'}</p><Button disabled={busy||starting} onClick={()=>void act('cancel')}>Cancel turn</Button></div>:s.status==='draft'&&<div className="space-y-3"><Field label="Your reply"><AutoTextarea minRows={3} value={content} disabled={!editable} onChange={e=>setContent(e.target.value)} aria-label="Reply to your story coach" placeholder="Answer the coach’s questions, add a detail, or say what you don’t remember."/></Field><Button variant="primary" disabled={!editable||(!content.trim()&&s.messages.length>0)} onClick={()=>void act('turn')}>{s.messages.length?'Send reply':'Evaluate my story'}</Button></div>}
   {s.error&&<div className="mt-3"><ErrorText>{s.error}</ErrorText><Button disabled={!editable} onClick={()=>void act('retry')}>Try again</Button></div>}
  </Card>
  <Card title="Your S.T.A.R.L draft" actions={<Button disabled={running||busy} onClick={()=>setManual(!manual)}>{manual?'Hide manual editor':'Edit manually (optional)'}</Button>}>
   <details className="mb-4 text-sm"><summary className="cursor-pointer text-indigo-700">Source used · {s.source.organization} · {s.source.title}</summary><p className="mt-2 whitespace-pre-wrap">{s.source.text}</p>{s.source.lessons&&<p className="mt-2 whitespace-pre-wrap">Lessons: {s.source.lessons}</p>}{s.sourceChanged&&s.currentSource&&<p className="mt-3 whitespace-pre-wrap">Current story: {s.currentSource.text}</p>}</details>
   <div className="mb-4 flex flex-wrap gap-2 text-xs">{(['situation','task','action','result','lessons'] as const).map(k=><span key={k} className={answer[k]?.trim()?'rounded bg-indigo-50 px-2 py-1 text-indigo-800':'rounded bg-amber-50 px-2 py-1 text-amber-900'}>{k[0].toUpperCase()+k.slice(1)}: {answer[k]?.trim()?'Drafted — review facts':'Needs detail'}</span>)}</div>
   {!manual&&<div className="space-y-3 text-sm">{(['situation','task','action','result','lessons','speakingNotes'] as const).map(k=>answer[k]?.trim()?<section key={k}><h3 className="font-medium">{{situation:'Situation',task:'Task',action:'Action',result:'Result',lessons:'Lessons learned',speakingNotes:'Speaking notes'}[k]}</h3><p className="whitespace-pre-wrap">{answer[k]}</p></section>:null)}{!answer.situation&&!answer.action&&<p className="text-slate-500">Your coach will build this draft from the existing experience and your replies.</p>}</div>}
   {manual&&<div className="space-y-4">{(['situation','task','action','result','lessons','speakingNotes'] as const).map(k=><Field key={k} label={{situation:'Situation',task:'Task',action:'Action — your contribution',result:'Result — individual and team outcomes',lessons:'Lessons learned — what changed in your approach',speakingNotes:'Speaking notes'}[k]}><AutoTextarea aria-label={k} minRows={3} value={answer[k]} disabled={!editable} onChange={e=>{setAnswer({...answer,[k]:e.target.value,sourceText:'',...(k==='lessons'?{sourceLessons:e.target.value}:{})});setDirty(true);}}/></Field>)}
    <Field label="Practice notes"><AutoTextarea minRows={3} value={notes} disabled={!editable} onChange={e=>{setNotes(e.target.value);setDirty(true);}}/></Field>
   </div>}
   <div className="mt-4 flex flex-wrap gap-2">{s.status==='draft'?<><Button disabled={!editable} onClick={()=>void act('save')}>Save draft{dirty?' *':''}</Button><Button disabled={!editable || ![answer.situation,answer.task,answer.action,answer.result].some(v=>v.trim())} onClick={()=>void act('accept')}>Accept answer</Button><Button disabled={busy} onClick={()=>{if(window.confirm('Discard this preparation? Its snapshot and transcript will remain available.'))void act('discard');}}>Discard</Button></>:<Button disabled={busy} onClick={()=>void act('reopen')}>Reopen for editing</Button>}</div>
  </Card>
  {!s.sourceMissing&&<SourceUpdateRecommendation session={s} disabled={running||busy||dirty} refresh={refresh} onEditing={setReview}/>}
  {error&&<ErrorText>{error}</ErrorText>}
 </div>
 </dialog>,document.body);
}
