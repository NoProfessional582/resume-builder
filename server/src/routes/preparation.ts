import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { starAnswer } from '../agent/tasks/prepareInterview.ts';
import {getInterviewPlan,generateInterviewPlan} from '../resume/interviewPlan.ts';
import { createPreparation, evaluatePreparation, getPreparation, getSourceRecommendation, recommendSourceUpdate, listPreparation, preparationAction, savePreparation, startPreparationTurn, suggestStories, writeBackSource } from '../resume/preparation.ts';
const params=z.object({id:z.coerce.number().int().positive()});
export async function preparationRoutes(app:FastifyInstance) {
 app.get('/applications/:id/interview-plan',req=>getInterviewPlan(params.parse(req.params).id));
 app.post('/applications/:id/interview-plan',req=>generateInterviewPlan(params.parse(req.params).id));
 app.get('/applications/:id/preparation',req=>listPreparation(params.parse(req.params).id));
 app.get('/applications/:id/preparation/stories',req=>suggestStories(params.parse(req.params).id));
 app.post('/applications/:id/preparation',req=>{const b=z.object({storyId:z.number().int().positive(),question:z.string().trim().min(1).max(2000)}).parse(req.body); return createPreparation(params.parse(req.params).id,b.storyId,b.question);});
 app.get('/preparation/:id',req=>getPreparation(params.parse(req.params).id));
 app.post('/preparation/:id/evaluate',req=>evaluatePreparation(params.parse(req.params).id));
 app.get('/preparation/:id/source-recommendation',req=>getSourceRecommendation(params.parse(req.params).id));
 app.post('/preparation/:id/source-recommendation',req=>recommendSourceUpdate(params.parse(req.params).id));
 app.put('/preparation/:id',req=>{const b=z.object({answer:starAnswer,practiceNotes:z.string().max(20000)}).parse(req.body);return savePreparation(params.parse(req.params).id,b.answer,b.practiceNotes);});
 app.post('/preparation/:id/turn',req=>{const b=z.object({content:z.string().trim().min(1).max(20000)}).parse(req.body);return startPreparationTurn(params.parse(req.params).id,b.content);});
 for(const action of ['retry','cancel','accept','reopen','discard']) app.post(`/preparation/:id/${action}`,req=>preparationAction(params.parse(req.params).id,action));
 app.post('/preparation/:id/source',req=>{const b=z.object({text:z.string().trim().min(1).max(20000),expectedSource:z.string().max(100000),lessons:z.string().max(10000).optional(),recommendationId:z.number().int().positive().optional()}).parse(req.body);return writeBackSource(params.parse(req.params).id,b.text,b.expectedSource,b.lessons,b.recommendationId);});
}
