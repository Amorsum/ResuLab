import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(path.join(root,'server/package.json'));
const parse=require('dotenv').parse;
const publicConfig={};
for (const file of ['.env','.env.local','.env.production','.env.production.local']) if(existsSync(path.join(root,file))) Object.assign(publicConfig,parse(readFileSync(path.join(root,file))));
const env={...publicConfig,...process.env, VITE_AI_API_BASE:process.env.VITE_AI_API_BASE||'https://api.amorsum.top',VITE_AGENT_API_BASE:process.env.VITE_AGENT_API_BASE||publicConfig.VITE_AGENT_API_BASE,VITE_AGENT_MOCK:'false'};
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY']) if(!env[key]||/your-project|your-anon/.test(env[key])) throw new Error('Missing public production configuration: '+key);
for(const key of ['VITE_AI_API_BASE','VITE_AGENT_API_BASE']) if(!env[key]||new URL(env[key]).protocol!=='https:') throw new Error('Expected existing public HTTPS service: '+key);
const cli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
// npm_execpath is portable when invoked by npm; fallback resolves the installed CLI.
const npm=process.env.npm_execpath||cli;
for(const args of [['run','build'],['--prefix','server','run','build']]) {
 const result=spawnSync(process.execPath,[npm,...args],{cwd:root,env,stdio:'inherit',windowsHide:true});
 if(result.status!==0) process.exit(result.status||1);
}
const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
writeFileSync(path.join(root,'dist/version.json'),JSON.stringify({commit,builtAt:new Date().toISOString(),apiMode:'split-services',extension:JSON.parse(readFileSync(path.join(root,'public/downloads/extension.json'),'utf8')).version})+'\n');
console.log('Production build complete: GitHub Pages frontend, existing Cloudflare AI Worker and server Agent; DNS unchanged.');
