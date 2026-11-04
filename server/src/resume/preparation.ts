import { db, transaction } from '../db.ts';
import { getRun, isFinal, runner } from '../agent/runner.ts';
import { emptyAnswer, prepareInterviewTask, starAnswer, type StarAnswer } from '../agent/tasks/prepareInterview.ts';
import { NotFoundError, updateStoryText, updateStoryLessons } from './positions.ts';
import { ConflictError } from './refine.ts';
import {recommendStoryUpdateTask,storyUpdateRecommendation} from '../agent/tasks/recommendStoryUpdate.ts';

interface Row { id:number; application_id:number; story_id:number|null; source_id:number; source_snapshot:string; analysis_snapshot:string|null; question:string; status:string; answer:string; practice_notes:string; run_id:number|null; error:string|null; }
function row(id:number):Row {
 const r=db.prepare('SELECT * FROM preparation WHERE id=?').get(id) as unknown as Row|undefined;
 if(!r) throw new NotFoundError('Preparation not found'); return r;
}
function source(id:number) {
 const s=db.prepare(`SELECT s.id,s.current_text AS text,s.lessons,s.position_id AS positionId,p.title,p.organization,
 (SELECT MAX(id) FROM story_version WHERE story_id=s.id) AS versionId FROM story s JOIN position p ON p.id=s.position_id WHERE s.id=?`).get(id);
 return s ? JSON.stringify(s) : null;
}
function analysis(id:number):string|null { return (db.prepare('SELECT data FROM job_analysis WHERE application_id=?').get(id)?.data as string|null)??null; }
function requireApplication(id:number) { if(!db.prepare('SELECT 1 FROM application WHERE id=?').get(id)) throw new NotFoundError('Application not found'); }
function settle(r:Row):Row {
 if(r.run_id==null) return r;
 const run=getRun(r.run_id); if(run && !isFinal(run.status)) return r;
 transaction(()=>{
  if(run?.status==='succeeded') {
   const out=starAnswer.parse(run.output);
   db.prepare(`INSERT OR IGNORE INTO preparation_message(preparation_id,role,content,answer,run_id,created_at) VALUES(?,'agent',?,?,?,?)`).run(r.id,out.questions.join('\n'),JSON.stringify(out),run.id,Date.now());
   db.prepare('UPDATE preparation SET answer=?,run_id=NULL,error=NULL,updated_at=? WHERE id=?').run(JSON.stringify(out),Date.now(),r.id);
  } else db.prepare('UPDATE preparation SET run_id=NULL,error=?,updated_at=? WHERE id=?').run(run?.error??'Preparation was interrupted. Retry to continue.',Date.now(),r.id);
 }); return row(r.id);
}
export function getPreparation(id:number) {
 const r=settle(row(id)); const currentSource=r.story_id==null?null:source(r.story_id);
 return {id:r.id,applicationId:r.application_id,sourceId:r.source_id,source:JSON.parse(r.source_snapshot),currentSource:currentSource?JSON.parse(currentSource):null,
 sourceChanged:currentSource!==r.source_snapshot,sourceMissing:currentSource==null,analysisChanged:analysis(r.application_id)!==r.analysis_snapshot,
 question:r.question,status:r.status,answer:{...emptyAnswer,...JSON.parse(r.answer)} as StarAnswer,practiceNotes:r.practice_notes,runId:r.run_id,error:r.error,sourceRecommendation:getSourceRecommendation(id),
 messages:db.prepare('SELECT id,role,content,answer,created_at FROM preparation_message WHERE preparation_id=? ORDER BY id').all(id).map(m=>({...m,role:String(m.role),answer:m.answer?JSON.parse(m.answer as string):null}))};
}
function evidence(r:Row) {
 return JSON.stringify({answer:r.answer,status:r.status,messages:db.prepare('SELECT role,content FROM preparation_message WHERE preparation_id=? ORDER BY id').all(r.id)});
}
type RecommendationRow={id:number;source_snapshot:string;evidence_snapshot:string;run_id:number|null;data:string|null;error:string|null};
export function getSourceRecommendation(id:number) {
 const r=row(id);
 let rec=db.prepare('SELECT * FROM preparation_source_recommendation WHERE preparation_id=? ORDER BY id DESC LIMIT 1').get(id) as RecommendationRow|undefined;
 if(!rec)return null;
 if(rec.run_id!=null) {
  const run=getRun(rec.run_id);
  if(!run||isFinal(run.status)) {
   const parsed=run?.status==='succeeded'?storyUpdateRecommendation.safeParse(run.output):null;
   if(parsed?.success&&!parsed.data.hasChanges) {
    const baseline=JSON.parse(rec.source_snapshot);
    parsed.data.text=baseline.text;parsed.data.lessons=baseline.lessons??'';parsed.data.changes=[];
   }
   const data=parsed?.success?JSON.stringify(parsed.data):null;
   const error=data?null:run?.error??'The story recommendation was interrupted or invalid. Generate it again.';
   db.prepare('UPDATE preparation_source_recommendation SET run_id=NULL,data=?,error=? WHERE id=?').run(data,error,rec.id);
   rec={...rec,run_id:null,data,error};
  }
 }
 return {id:rec.id,runId:rec.run_id,data:rec.data?storyUpdateRecommendation.parse(JSON.parse(rec.data)):null,error:rec.error,
  currentSource:JSON.parse(rec.source_snapshot),expectedSource:rec.source_snapshot,stale:(r.story_id==null?null:source(r.story_id))!==rec.source_snapshot||evidence(r)!==rec.evidence_snapshot};
}
export function recommendSourceUpdate(id:number) {
 const r=idle(id,false);
 if(r.story_id==null)throw new ConflictError('The source story has been deleted.');
 if(r.status==='discarded')throw new ConflictError('Reopen this preparation first.');
 const existing=getSourceRecommendation(id);if(existing?.runId!=null)return getPreparation(id);
 const snapshot=source(r.story_id)!;
 const userReplies=db.prepare("SELECT content FROM preparation_message WHERE preparation_id=? AND role='user' ORDER BY id").all(id).map(m=>m.content);
 const runId=runner.enqueue(recommendStoryUpdateTask,{currentStory:JSON.parse(snapshot),userReplies,interviewDraft:JSON.parse(r.answer),draftAccepted:r.status==='accepted'});
 db.prepare('INSERT INTO preparation_source_recommendation(preparation_id,source_snapshot,evidence_snapshot,run_id,created_at) VALUES(?,?,?,?,?)').run(id,snapshot,evidence(r),runId,Date.now());
 return getPreparation(id);
}
export function listPreparation(applicationId:number) { requireApplication(applicationId); return (db.prepare('SELECT id FROM preparation WHERE application_id=? ORDER BY id DESC').all(applicationId) as {id:number}[]).map(r=>getPreparation(r.id)); }
export function suggestStories(applicationId:number) {
 requireApplication(applicationId);
 const data=JSON.parse(analysis(applicationId)??'{}') as {keywords?:{term:string}[]};
 return (db.prepare('SELECT id FROM story ORDER BY id').all() as {id:number}[]).map(r=>{
  const s=JSON.parse(source(r.id)!); const text=(s.text+' '+s.lessons+' '+s.title).toLowerCase();
  const matches=(data.keywords??[]).map(k=>k.term).filter(k=>k.length>1 && text.includes(k.toLowerCase()));
  return {...s,matches,reason:matches.length?`Matches analyzed keywords: ${matches.join(', ')}`:'No direct keyword match; review this story for transferable experience.'};
 }).sort((a,b)=>b.matches.length-a.matches.length || a.id-b.id);
}
export function createPreparation(applicationId:number,storyId:number,question:string) {
 requireApplication(applicationId); const snapshot=source(storyId); if(!snapshot) throw new NotFoundError('Story not found');
 const id=Number(db.prepare(`INSERT INTO preparation(application_id,story_id,source_id,source_snapshot,analysis_snapshot,question,answer,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(applicationId,storyId,storyId,snapshot,analysis(applicationId),question,JSON.stringify(emptyAnswer),Date.now(),Date.now()).lastInsertRowid);
 return getPreparation(id);
}
function idle(id:number, draftOnly=true) { const r=settle(row(id)); if(r.run_id!=null) throw new ConflictError('Wait for or cancel the current turn.'); if(draftOnly && r.status!=='draft') throw new ConflictError('Reopen this preparation before editing.'); return r; }
export function savePreparation(id:number,answer:StarAnswer,practiceNotes:string) { idle(id); db.prepare('UPDATE preparation SET answer=?,practice_notes=?,updated_at=? WHERE id=?').run(JSON.stringify(starAnswer.parse(answer)),practiceNotes,Date.now(),id); return getPreparation(id); }
export function startPreparationTurn(id:number,content?:string) {
 const r=idle(id);
 if(content) db.prepare(`INSERT INTO preparation_message(preparation_id,role,content,created_at) VALUES(?,'user',?,?)`).run(id,content,Date.now());
 const application=db.prepare('SELECT company,role_title,job_description,required_experience,preferred_experience FROM application WHERE id=?').get(r.application_id);
 const resume=db.prepare("SELECT content FROM tailored_resume WHERE application_id=? AND status='ready' ORDER BY id DESC LIMIT 1").get(r.application_id)?.content;
 const transcript=getPreparation(id).messages;
 const runId=runner.enqueue(prepareInterviewTask,{phase:transcript.some(m=>m.role==='agent')?'develop':'evaluate',application,resume:resume?JSON.parse(resume as string):null,question:r.question,source:JSON.parse(r.source_snapshot),currentSource:r.story_id?JSON.parse(source(r.story_id)??'null'):null,analysis:JSON.parse(r.analysis_snapshot??'null'),currentDraft:JSON.parse(r.answer),transcript});
 db.prepare('UPDATE preparation SET run_id=?,error=NULL WHERE id=?').run(runId,id);
 return getPreparation(id);
}
/** Safe to call again when reopening a modal; never duplicates the opening turn. */
export function evaluatePreparation(id:number) {
 const s=getPreparation(id);
 if(s.runId!=null || s.messages.length || s.status!=='draft')return s;
 try {return startPreparationTurn(id);} catch(e) {
  db.prepare('UPDATE preparation SET error=? WHERE id=?').run((e as Error).message,id);
  return getPreparation(id);
 }
}
export function preparationAction(id:number,action:string) {
 if(action==='cancel' || action==='discard') {
  const r=row(id); if(r.run_id!=null) runner.cancel(r.run_id);
  db.prepare('UPDATE preparation SET run_id=NULL,error=?,status=?,updated_at=? WHERE id=?').run(action==='cancel'?'Turn cancelled. Saved edits were retained.':null,action==='discard'?'discarded':r.status,Date.now(),id);
 } else {
  const r=idle(id,false);
  if(action==='retry') { if(!r.error) throw new ConflictError('There is no failed turn to retry.'); return startPreparationTurn(id); }
  if(action==='accept' && r.status!=='draft') throw new ConflictError('Reopen first.');
  db.prepare('UPDATE preparation SET status=?,updated_at=? WHERE id=?').run(action==='accept'?'accepted':'draft',Date.now(),id);
 } return getPreparation(id);
}
export function writeBackSource(id:number,text:string,expectedSource:string,lessons?:string,recommendationId?:number) {
 const r=idle(id,false);
 return transaction(()=>{
  if(recommendationId!==undefined) {
   const rec=getSourceRecommendation(id);
   if(!rec||rec.id!==recommendationId||!rec.data||rec.runId!=null||rec.error||rec.stale||rec.expectedSource!==expectedSource)throw new ConflictError('The recommendation is out of date. Generate a new recommendation before saving.');
  }
  if(r.story_id==null) throw new ConflictError('The source story has been deleted.');
  if(source(r.story_id)!==expectedSource) throw new ConflictError('Work history changed. Reload and review the current story before saving.');
  const before=source(r.story_id)!;
  updateStoryText(r.story_id,text,'user');
  if(lessons!==undefined) updateStoryLessons(r.story_id,lessons);
  if(JSON.parse(before).text===text && lessons!==undefined && (JSON.parse(before).lessons??'')!==lessons.trim()) {
   db.prepare("INSERT INTO story_version(story_id,text,source,created_at) VALUES(?,?,'user',?)").run(r.story_id,text,Date.now());
  }
  const after=source(r.story_id)!;
  if(before!==after) db.prepare(`INSERT INTO preparation_source_update(preparation_id,story_version_id,before_snapshot,after_snapshot,created_at) VALUES(?,?,?,?,?)`).run(id,JSON.parse(after).versionId,before,after,Date.now());
  return getPreparation(id);
 });
}
