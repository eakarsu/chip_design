import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import CommercialFeaturePage, {type CommercialFeature} from '@/components/commercial/CommercialFeaturePage';
const router={replace:jest.fn()};
jest.mock('next/navigation',()=>({useRouter:()=>router,usePathname:()=>'/commercial/fixture'}));
jest.mock('@/lib/auth/context',()=>({useAuth:()=>({user:{id:'actual-actor'},isAuthenticated:true,isLoading:false})}));
jest.mock('@/components/commercial/DecisionBriefView',()=>({__esModule:true,default:({brief}:{brief:{title:string}})=><div>{brief.title}</div>}));
const originalFetch=global.fetch;
describe('native commercial feature controls',()=>{
 afterEach(()=>{global.fetch=originalFetch;jest.restoreAllMocks();});
 it.each([
  ['ppa','Score & save commit'],['rtl-impact','Analyze & save impact'],['spice-regression','Save regression result'],['co-design','Create review session'],['library-marketplace','Register library release'],
 ] as [CommercialFeature,string][])('%s fills all engineering/optional fields, keeps the actual project, and aborts only the explicit provider review',async(feature,saveLabel)=>{
  const calls:{signal?:AbortSignal;body:string;resolve:(value:unknown)=>void}[]=[];
  global.fetch=jest.fn(async(url,options)=>{
   if(url==='/api/workspace/bootstrap')return{ok:true,json:async()=>({workspace:{projects:[{id:'actual-saved-project',name:'Retained project',pdkRef:'actual-pdk'}]}})};
   if(url==='/api/workspace/ai-review')return new Promise<Response>(resolve=>calls.push({signal:options?.signal??undefined,body:String(options?.body||''),resolve:value=>resolve({ok:true,json:async()=>value} as Response)}));
   return{ok:true,json:async()=>({record:{id:'actual-saved-evidence'},snapshot:{id:'actual-saved-evidence'},impact:{id:'actual-saved-evidence'}})};
  }) as typeof fetch;
  const view=render(<CommercialFeaturePage feature={feature}/>);
  await screen.findByRole('button',{name:'Fill reference case'});
  for(const name of ['Fill reference case','Fill optimization case','Fill signoff challenge','Fill critical exception']){
   fireEvent.click(screen.getByRole('button',{name}));
   for(const field of [...screen.getAllByRole('textbox'),...screen.queryAllByRole('spinbutton')])expect(field).not.toHaveValue('');
  }
  expect(calls).toHaveLength(0);expect(screen.getAllByRole('button',{name:'Generate with OpenRouter'})).toHaveLength(1);expect(screen.getByRole('button',{name:'Generate with OpenRouter'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:saveLabel}));await waitFor(()=>expect(screen.getByRole('button',{name:'Generate with OpenRouter'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Generate with OpenRouter'}));await screen.findByRole('button',{name:'Cancel request'});
  const input=JSON.parse(calls[0].body);expect(input.projectId).toBe('actual-saved-project');expect(input.context.id).toBe('actual-saved-evidence');expect(input.reviewRequest.objective).toBeTruthy();expect(input.reviewRequest.decisionQuestion).toBeTruthy();expect(input.reviewRequest.assumptions.length).toBeGreaterThan(0);expect(input.reviewRequest.acceptanceCriteria.length).toBeGreaterThan(0);expect(input.reviewRequest.reviewerContext).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Cancel request'}));expect(calls[0].signal?.aborted).toBe(true);calls[0].resolve({brief:{title:'LATE AI REVIEW'}});await waitFor(()=>expect(screen.queryByText('LATE AI REVIEW')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Generate with OpenRouter'}));await waitFor(()=>expect(calls).toHaveLength(2));view.unmount();expect(calls[1].signal?.aborted).toBe(true);
 });
});
