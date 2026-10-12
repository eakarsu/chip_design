/** @jest-environment node */
process.env.CHIP_DB_PATH=':memory:';
process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED='false';
import {getRawDb} from '@/lib/db/connection';
import {all} from '@/lib/commercial/database';
import {createWorkspaceProject,saveDecisionBrief} from '@/lib/commercial/store';
import type {EdaIdentity} from '@/lib/eda/identity';
import type {DecisionBrief} from '@/lib/commercial/types';
const identity:EdaIdentity={tenantId:'isolated-cancel-tenant',userId:'saved-engineer',role:'admin'};
let fixtureNumber=0;
async function request(){const project=await createWorkspaceProject(identity,{name:'Actual fixture project '+(++fixtureNumber),description:'Isolated transaction fixture',repositoryUrl:'https://example.test/retained-repo',defaultBranch:'main',topModule:'top',pdkRef:'retained-pdk',status:'active'},'fixture-project');return{projectId:project.id,feature:'timing',headline:'Retained evidence review',executiveSummary:'Review the supplied measured evidence.',risk:'low',confidence:40,verdict:'hold',signoffPosition:'Human review required',reviewMode:'single-pass',promptVersion:'fixture',evidenceQuality:{grade:'C',score:40,rationale:'Only supplied fixtures'},findings:[],cornerCoverage:{covered:[],missing:['measured corners'],assessment:'Incomplete evidence'},metrics:[],sections:[],tradeoffs:[],recommendedExperiments:[],stopConditions:[],dataGaps:['Measured evidence is incomplete'],actions:['Human review'],evidence:[],assumptions:[],humanReviewGates:['Independent review'],humanStatus:'pending',provider:'openrouter',model:'fixture/model'} as Omit<DecisionBrief,'id'|'createdAt'>;}
test('accepted Cancel after a real native SQLite AI review INSERT rolls back the result and its audit',async()=>{
 const brief=await request(),controller=new AbortController(),raw=getRawDb(),prepare=raw.prepare.bind(raw);let inserted=false;
 const observed=jest.spyOn(raw,'prepare').mockImplementation(sql=>{const statement=prepare(sql);return new Proxy(statement,{get(target,key){if(key==='run')return(...values:unknown[])=>{const result=target.run(...values);if(sql.includes('INSERT INTO commercial_ai_reviews')){inserted=true;controller.abort();}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
 try{await expect(saveDecisionBrief(identity,brief,'cancelled-request',controller.signal)).rejects.toHaveProperty('name','AbortError');expect(inserted).toBe(true);}finally{observed.mockRestore();}
 expect(await all('SELECT id FROM commercial_ai_reviews WHERE tenant_id = ? AND project_id = ?',[identity.tenantId,brief.projectId])).toHaveLength(0);
 expect(await all("SELECT id FROM commercial_audit_events WHERE tenant_id = ? AND resource = 'ai_review' AND request_id = ?",[identity.tenantId,'cancelled-request'])).toHaveLength(0);
});
test('a normal native save keeps actual actor and human review gates; pre-aborted saves write nothing',async()=>{
 const brief=await request(),saved=await saveDecisionBrief(identity,brief,'actual-request');expect(saved.requestedBy).toBe(identity.userId);expect(saved.humanStatus).toBe('pending');const controller=new AbortController();controller.abort();await expect(saveDecisionBrief(identity,brief,'aborted-before-save',controller.signal)).rejects.toHaveProperty('name','AbortError');expect(await all('SELECT id FROM commercial_ai_reviews WHERE tenant_id = ? AND project_id = ?',[identity.tenantId,brief.projectId])).toHaveLength(1);
});
