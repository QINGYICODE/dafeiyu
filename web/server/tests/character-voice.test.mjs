import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterVoice } from '../character-voice.mjs';
import { Voice } from '../voice.mjs';

function fixture(t, { respond = true, timeoutMs = 2000, idleMs = 2000 } = {}) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'character-voice-test-'));const weights={};
  for(const name of ['bert_base_path','cnhuhbert_base_path']){const folder=path.join(directory,name);mkdirSync(folder);writeFileSync(path.join(folder,'config.json'),'{}');writeFileSync(path.join(folder,'pytorch_model.bin'),'fixture');weights[name]=folder;}
  for(const name of ['t2s_weights_path','vits_weights_path']){weights[name]=path.join(directory,name);writeFileSync(weights[name],'fixture');}
  const reference=path.join(directory,'reference.wav');writeFileSync(reference,'fixture');const configFile=path.join(directory,'ready.json');writeFileSync(configFile,JSON.stringify({engine:'gpt-sovits-v2',python:process.execPath,referenceAudio:reference,referenceText:'参考原文',repository:directory,weights}));
  const children=[],requests=[];
  const spawnChild=(_python,_args,options)=>{
    assert.equal(options.env.HF_HUB_OFFLINE,'1');assert(!Object.hasOwn(options.env,'DEEPSEEK_KEY'));
    const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.killed=false;
    child.kill=()=>{if(!child.killed){child.killed=true;child.emit('exit',0);}};
    child.stdin.on('data',data=>{const request=JSON.parse(data.toString());requests.push(request);if(respond){const wave=Buffer.alloc(1044);wave.write('RIFF',0);wave.writeUInt32LE(wave.length-8,4);wave.write('WAVE',8);writeFileSync(request.output,wave);queueMicrotask(()=>child.stdout.write(JSON.stringify({id:request.id,ok:true,duration:1})+'\n'));}});
    children.push(child);return child;
  };
  const voice=new CharacterVoice({configFile,spawnChild,timeoutMs,idleMs});t.after(()=>{voice.close();rmSync(directory,{recursive:true,force:true});});return {voice,children,requests,configFile};
}
test('reference synthesis reuses its local worker and sends only reply text, output path and rate',async t=>{
  const {voice,children,requests}=fixture(t);assert(voice.available());const first=await voice.synthesize('你好，我是大肥鱼。',{rate:0});const second=await voice.synthesize('今天想聊什么？',{rate:5});assert.equal(children.length,1);assert.equal(first.engine,'gpt-sovits-v2');assert.equal(second.duration,1);assert.deepEqual(Object.keys(requests[0]).sort(),['id','output','rate','text']);assert.equal(requests[0].text,'你好，我是大肥鱼。');
});
test('cancellation kills active inference and rejects instead of returning late audio',async t=>{
  const {voice,children,requests}=fixture(t,{respond:false});const controller=new AbortController();const work=voice.synthesize('你好。',{rate:0},controller.signal);const checked=assert.rejects(work,/取消/);while(!requests.length)await new Promise(resolve=>setImmediate(resolve));controller.abort();await checked;assert(children[0].killed);assert.equal(voice.pending.size,0);
});
test('slow inference times out, releases the worker, and does not return a file',async t=>{
  const {voice,children}=fixture(t,{respond:false,timeoutMs:20});await assert.rejects(voice.synthesize('你好。',{rate:0}),/超时/);assert(children[0].killed);assert.equal(voice.pending.size,0);
});
test('idle inference workers release model resources automatically',async t=>{
  const {voice,children}=fixture(t,{idleMs:15});await voice.synthesize('你好。',{rate:0});await new Promise(resolve=>setTimeout(resolve,30));assert(children[0].killed);assert.equal(voice.child,null);
});
test('missing weights keep the reference voice unavailable, and long text never starts inference',async t=>{
  const {voice,children,configFile}=fixture(t);await assert.rejects(voice.synthesize('字'.repeat(201),{rate:0}),/较长|比较长/);assert.equal(children.length,0);const config=JSON.parse(readFileSync(configFile));rmSync(config.weights.t2s_weights_path);assert(!voice.available());await assert.rejects(voice.synthesize('你好。',{rate:0}),/准备好/);
});
test('the selected reference voice uses its local engine rather than an ordinary Edge voice',async()=>{
  const voice=new Voice();let called=false;voice.character={available:()=>true,close(){},synthesize:async(text,preferences)=>{called=true;assert.equal(text,'你好');assert.equal(preferences.speaker,'klee');return{engine:'gpt-sovits-v2',duration:1,data:Buffer.from('reference')};}};
  try{assert(voice.status().voices.some(item=>item.id==='klee'));const audio=await voice.synthesize('你好',{speaker:'klee',rate:0});assert(called);assert.equal(audio.engine,'gpt-sovits-v2');assert.equal(voice.children.size,0);}finally{voice.close();}
});
test('an unavailable reference model fails explicitly instead of silently substituting another speaker',async()=>{
  const voice=new Voice();voice.status=()=>({available:true});voice.character={available:()=>false,close(){},synthesize:async()=>{throw new Error('reference unavailable');}};
  try{await assert.rejects(voice.synthesize('你好',{speaker:'klee',rate:0}),/reference unavailable/);assert.equal(voice.children.size,0);}finally{voice.close();}
});
