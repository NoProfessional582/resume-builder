import {db} from '../db.ts';
import {getRun,isFinal,runner} from '../agent/runner.ts';
import {interviewPlanSchema,planInterviewTask} from '../agent/tasks/planInterview.ts';
import {getApplication} from './applications.ts';
import {listPositions} from './positions.ts';
import {ConflictError} from './refine.ts';
function input(id:number) {
 const a=getApplication(id);
 const resume=db.prepare("SELECT content FROM tailored_resume WHERE application_id=? AND status='ready' ORDER BY id DESC LIMIT 1").get(id)?.content;
 return {posting:{company:a.company,title:a.roleTitle,description:a.jobDescription,required:a.requiredExperience,preferred:a.preferredExperience},analysis:a.analysis?.data??null,resume:resume?JSON.parse(resume as string):null,
 stories:listPositions().flatMap(p=>p.stories.map(s=>({id:s.id,text:s.text,lessons:s.lessons,title:p.title,organization:p.organization})))};
}
type PlanRow={input_snapshot:string;data_snapshot:string|null;data:string|null;run_id:number|null;error:string|null};
export function getInterviewPlan(id:number) {
 const current=input(id);
 let r=db.prepare('SELECT * FROM interview_plan WHERE application_id=?').get(id) as PlanRow|undefined;
 if(r?.run_id!=null) {
  const run=getRun(r.run_id);
  if(!run||isFinal(run.status)) {
   let data:string|null=null;let error:string|null=run?.error??'Interview planning was interrupted. Try again.';
   if(run?.status==='succeeded') {
    const parsed=interviewPlanSchema.safeParse(run.output);
    const ids=new Set(JSON.parse(r.input_snapshot).stories.map((s:{id:number})=>s.id));
    if(parsed.success && [...parsed.data.recommendations,...parsed.data.additionalStories].every(s=>ids.has(s.storyId))){data=JSON.stringify(parsed.data);error=null as string|null;}
    else error='The plan referenced an unavailable story or had invalid content. Try again.';
   }
   db.prepare('UPDATE interview_plan SET data=COALESCE(?,data),data_snapshot=CASE WHEN ? IS NOT NULL THEN input_snapshot ELSE data_snapshot END,run_id=NULL,error=?,updated_at=? WHERE application_id=?').run(data,data,error,Date.now(),id);
   r=db.prepare('SELECT * FROM interview_plan WHERE application_id=?').get(id) as PlanRow;
  }
 }
 return {data:r?.data?interviewPlanSchema.parse(JSON.parse(r.data)):null,runId:r?.run_id??null,error:r?.error??null,stale:r?.data?JSON.stringify(current)!==r.data_snapshot:false,expectedQuestions:current.analysis?.expectedQuestions??[]};
}
export function generateInterviewPlan(id:number) {
 const plan=getInterviewPlan(id);if(plan.runId!=null)throw new ConflictError('Interview planning is already running.');
 const snapshot=input(id);const runId=runner.enqueue(planInterviewTask,snapshot);
 db.prepare(`INSERT INTO interview_plan(application_id,input_snapshot,run_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET input_snapshot=excluded.input_snapshot,run_id=excluded.run_id,error=NULL,updated_at=excluded.updated_at`).run(id,JSON.stringify(snapshot),runId,Date.now());
 return getInterviewPlan(id);
}
