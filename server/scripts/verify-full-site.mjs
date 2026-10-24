// Real deployed HTTP/auth/model verification. Only disposable synthetic data.
// node verify-full-site.mjs <releaseRoot> <serverEnv> <httpsOrigin> <reportFile>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const [root,envFile,base,reportFile]=process.argv.slice(2);
if(!root||!envFile||!base?.startsWith('https://')||!reportFile) throw new Error('Expected release, private config, HTTPS base, report');
const require=createRequire(path.resolve(root,'server/package.json'));
const env=require('dotenv').parse(fs.readFileSync(envFile));
const {createClient}=require('@supabase/supabase-js');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const login=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const report={at:new Date().toISOString(),origin:new URL(base).origin,syntheticOnly:true,checks:[],success:false,cleanup:null};
let owner,token,stage='static';
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
const check=(name,ok,details={})=>{report.checks.push({name,ok,...details});save();console.log(JSON.stringify({check:name,ok}));if(!ok)throw new Error('CHECK_FAILED');};
async function request(route,body){
 stage=route;
 const response=await fetch(new URL(route,base),{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(240000)});
 const result=await response.json().catch(()=>({}));return {response,result};
}
try {
 const index=await fetch(new URL('/',base));check('frontend',index.ok&&/assets\/index-/.test(await index.text()));
 const metadata=await(await fetch(new URL('/downloads/extension.json',base))).json();
 const zip=new Uint8Array(await(await fetch(new URL(metadata.url,base))).arrayBuffer());
 check('extension-download',createHash('sha256').update(zip).digest('hex')===metadata.sha256,{version:metadata.version,bytes:zip.length});
 for(const route of ['/api/ai/job-match','/api/ai/tailor','/api/account/delete','/api/agent/runs']) check('auth-guard:'+route,(await request(route,{})).response.status===401);
 stage='synthetic-sign-in';
 const password=crypto.randomUUID()+'Aa!9',email=`full-site-${crypto.randomUUID()}@example.invalid`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw new Error('CREATE_USER_FAILED');owner=created.data.user.id;
 const signed=await login.auth.signInWithPassword({email,password});check('password-sign-in',!signed.error&&Boolean(signed.data.session));token=signed.data.session.access_token;
 const data={personalInfo:{fullName:'合成验收用户'},projects:[]};
 const inserted=await login.from('resumes').insert({user_id:owner,title:'合成上线验收',data}).select('id').single();check('cloud-save',!inserted.error);
 const read=await login.from('resumes').select('data').eq('id',inserted.data.id).single();check('cloud-read',!read.error&&read.data.data.personalInfo.fullName==='合成验收用户');
 const removed=await login.from('resumes').delete().eq('id',inserted.data.id);check('cloud-delete-own-fixture',!removed.error);
 const extracted=await request('/api/ai/generate',{purpose:'resume-import',rawText:'这是合成部署验收简历：姓名为合成验收用户。2025年1月至2025年6月，在合成电商团队担任开发实习生。使用TypeScript开发订单查询接口，实现筛选条件和分页逻辑，与前端核对接口字段。只参与实现，方案由同事确定。'});
 check('resume-extraction',extracted.response.ok&&Boolean(extracted.result.workExperience?.length),{http:extracted.response.status,error:extracted.result.error});
 const facts=[{id:'synthetic-work',section:'workExperience',sourceTitle:'合成开发经历',doNotClaim:'只参与实现，不能写成主导架构，不能编造指标',data:{id:'synthetic-work',companyName:'合成电商团队',position:'开发实习生',startDate:'2025-01',endDate:'2025-06',isCurrent:false,city:'',description:'每天整理发版说明，使用TypeScript开发订单查询接口，负责筛选条件和分页逻辑，与前端核对接口字段，协助查看日志定位接口报错。只参与实现，接口方案由同事确定。',highlights:['参与实现订单查询接口']}}];
 const input={jdText:'后端开发：使用TypeScript开发业务接口，实现筛选条件和分页逻辑，与前端协作核对字段。',facts};
 const matched=await request('/api/ai/job-match',input);check('job-match',matched.response.ok&&Boolean(matched.result.plan?.requirements?.length),{http:matched.response.status,error:matched.result.error});
 const tailored=await request('/api/ai/tailor',input);check('career-tailor',tailored.response.ok&&tailored.result.plan?.selected?.some(item=>item.factId==='synthetic-work')&&Boolean(tailored.result.snapshot),{http:tailored.response.status,error:tailored.result.error,calls:tailored.result.modelCalls});
 const deleted=await request('/api/account/delete',{confirmation:'确认注销'});check('delete-own-account',deleted.response.ok&&deleted.result.deleted===true);
 const user=await admin.auth.admin.getUserById(owner);check('deleted-account-absent',Boolean(user.error));
 report.cleanup={userDeleted:true};owner=null;report.success=true;
} catch(error){report.failure={stage,code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'VERIFICATION_FAILED'};process.exitCode=1;}
finally{
 if(owner){const deleted=await admin.auth.admin.deleteUser(owner);report.cleanup={userDeleted:!deleted.error};if(deleted.error)process.exitCode=1;}
 save();console.log(JSON.stringify({success:report.success,failure:report.failure,cleanup:report.cleanup}));
}
