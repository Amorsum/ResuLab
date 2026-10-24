const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(pdf={}) {
  const file=path.join(__dirname,'../src/utils/resumeFile.ts');
  const source=fs.readFileSync(file,'utf8').replace('import.meta.env.BASE_URL',JSON.stringify('/'));
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('require','exports',code)(name=>name.endsWith('?url')?{default:'worker-test'}:name==='pdfjs-dist'?pdf:require(name),module.exports);
  return module.exports;
}
const file=(name,value)=>new File([value],name);
const read=(api,f,signal=new AbortController().signal)=>api.readResumeFile(f,signal,()=>{});

test('text import supports UTF-8 and rejects empty, oversized and unsupported files',async()=>{
  const api=load(); const value='合成同学：参与校园课程项目，使用 React 实现页面，提交报告。';
  assert.equal((await read(api,file('简历.txt',value))).text,value);
  await assert.rejects(read(api,file('old.doc','binary')),/另存为 .docx/);
  await assert.rejects(read(api,file('empty.txt','')),/为空/);
  await assert.rejects(read(api,file('big.txt',new Uint8Array(api.MAX_RESUME_FILE_BYTES+1))),/10 MB/);
  await assert.rejects(read(api,file('brief.txt','short')),/不足/);
  const abort=new AbortController();abort.abort(); await assert.rejects(read(api,file('resume.txt',value),abort.signal),/停止/);
});

test('actual Word export round-trips to plain text without rendering document markup',async()=>{
  const {Document,Paragraph,Packer}=require('docx');
  const api=load(),bytes=await Packer.toBuffer(new Document({sections:[{children:[
    new Paragraph('合成大学，计算机专业；参与校园二手交易平台课程项目，负责页面开发并提交报告。'),
  ]}]}));
  const result=await read(api,file('resume.docx',bytes));
  assert.match(result.text,/合成大学/);assert.match(result.text,/校园二手交易平台/);
  const bomb=Uint8Array.from(bytes);const view=new DataView(bomb.buffer);
  for(let i=0;i<bomb.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,100*1024*1024,true);break;}
  await assert.rejects(read(api,file('too-large.docx',bomb)),/解压后的内容过大/);
  await assert.rejects(read(api,file('corrupt.docx','broken document')),/格式无效/);
});

test('PDF parsing reads every page, reports partial scans and always cleans up',async()=>{
  let destroyed=0;
  const api=load({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async n=>({getTextContent:async()=>({items:n===1?[{str:'合成同学参与课程项目，使用 React 完成页面并提交课程报告。',hasEOL:true}]:[]}),cleanup(){}})}),destroy:async()=>{destroyed++;}})});
  const result=await read(api,file('resume.pdf','%PDF-synthetic'));
  assert.match(result.text,/React/);assert.match(result.warning,/第 2 页/);assert.equal(destroyed,1);
});

test('PDF encrypted, scanned and excessive-page inputs fail with actionable errors',async()=>{
  for(const [pdf,pattern] of [[{numPages:21},/20 页/],[{numPages:1,getPage:async()=>({getTextContent:async()=>({items:[]}),cleanup(){}})},/文字识别/]]) {
    let destroyed=false;
    const api=load({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(pdf),destroy:async()=>{destroyed=true;}})});
    await assert.rejects(read(api,file('file.pdf','synthetic')),pattern);assert.equal(destroyed,true);
  }
  const api=load({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.reject(Object.assign(new Error('private details'),{name:'PasswordException'})),destroy:async()=>{}})});
  await assert.rejects(read(api,file('locked.pdf','synthetic')),/解除密码/);
});

test('PDF line grouping and text limits do not silently lose paragraphs',()=>{
  const api=load();
  assert.equal(api.pdfPageText([{str:'姓名',transform:[1,0,0,1,10,100]},{str:'项目',transform:[1,0,0,1,10,70],hasEOL:true}]),'姓名 \n项目');
  assert.throws(()=>api.normalizeResumeText('x'.repeat(api.MAX_RESUME_TEXT+1)),/60000/);
});
