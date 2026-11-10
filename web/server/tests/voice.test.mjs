import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../store.mjs';
import { Companion } from '../companion.mjs';
import { Voice, voiceDefaults, voiceIntent, spokenText } from '../voice.mjs';

const sample = () => ({ data: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(512)]), duration: 2.1 });
function fixture(t, { synthesize, plan = { reply_mode: 'voice' } } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dafeiyu-voice-test-')); const store = new Store(directory); store.setKey('unit-only');
  const calls=[];
  const voice={ status:()=>({available:true,voices:[]}),close(){},synthesize:async(...args)=>{calls.push(args);return synthesize?await synthesize(...args):sample();} };
  const c=new Companion({store,voice,reader:{close:async()=>{},checkPlatform(){}},model:{call:async(_messages,options)=>({result:options.purpose==='chat-plan'?plan:options.responseMode==='text'?{reply:'今天就歇一会儿吧。'}:{memories:[]}})}});
  t.after(async()=>{await c.close();rmSync(directory,{recursive:true,force:true});});return {c,calls};
}
async function finish(c, job) {for(let i=0;i<100;i++){if(c.store.one('jobs',job.id).status!=='running')return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('chat did not finish');}

test('existing settings gain gentle voice defaults without replacing saved preferences', t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'voice-migration-'));let store=new Store(directory);const settings=store.get('settings');delete settings.voice;settings.autonomy.intervalMinutes=333;store.set('settings',settings);store.close();store=new Store(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  assert.deepEqual(store.get('settings').voice,voiceDefaults());assert.equal(store.get('settings').autonomy.intervalMinutes,333);
});
test('voice replies contain actual audio metadata and synthesize only the final reply',async t=>{
  const {c,calls}=fixture(t);const job=c.startChat({text:'想听你说话'});await finish(c,job);const message=c.state().messages.at(-1);
  assert.equal(message.replyMode,'voice');assert.equal(message.attachments.length,1);assert.equal(message.attachments[0].duration,2.1);assert.equal(message.attachments[0].transcript,message.content);assert(message.attachments[0].available);assert.equal(calls[0][0],message.content);assert.equal(calls[0][1].speaker,'xiaoxiao');assert.equal(calls[0][1].rate,-8);
});
test('later replies receive the actual voice delivery record in conversation history',async t=>{
  const {c}=fixture(t);await finish(c,c.startChat({text:'想听你说话'}));const original=c.model.call;let found=false;
  c.model.call=async(messages,options)=>{if(options.purpose==='reply')found=messages.some(message=>message.role==='assistant'&&message.content.includes('当时已附真实语音'));return original(messages,options);};
  await finish(c,c.startChat({text:'刚才那句挺好听的'}));assert(found);
});
test('requests for text override model-selected voice, and disabling voice prevents synthesis',async t=>{
  const {c,calls}=fixture(t);await finish(c,c.startChat({text:'我不方便听，只发文字'}));assert.equal(calls.length,0);assert.equal(c.state().messages.at(-1).replyMode,'text');
  await c.settings({voice:{enabled:false}});await finish(c,c.startChat({text:'发语音给我'}));assert.equal(calls.length,0);
});
test('TTS failures keep a completed, readable reply without fake audio attachments',async t=>{
  const {c}=fixture(t,{synthesize:async()=>{throw new Error('offline');}});const job=c.startChat({text:'用语音跟我说'});await finish(c,job);const message=c.state().messages.at(-1);
  assert.equal(c.store.one('jobs',job.id).status,'completed');assert.equal(message.content,'今天就歇一会儿吧。');assert.equal(message.replyMode,'text');assert.equal(message.attachments.length,0);assert(message.voiceNote);
});
test('cancelling during synthesis cannot save a late reply or audio file',async t=>{
  let release;const {c}=fixture(t,{synthesize:()=>new Promise(resolve=>{release=resolve;})});const job=c.startChat({text:'发语音给我'});while(!release)await new Promise(resolve=>setImmediate(resolve));c.cancel(job.id);release(sample());await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.store.one('messages',job.messageId).status,'stopped');assert.equal(c.store.list('media').length,0);
});
test('manual text-to-voice conversion deduplicates concurrent requests and reuses saved audio',async t=>{
  let release;const {c,calls}=fixture(t,{plan:{},synthesize:()=>new Promise(resolve=>{release=resolve;})});const job=c.startChat({text:'今天累了'});await finish(c,job);const first=c.speak(job.messageId),second=c.speak(job.messageId);while(!release)await new Promise(resolve=>setImmediate(resolve));release(sample());const [a,b]=await Promise.all([first,second]);assert.equal(a.id,b.id);assert.equal(calls.length,1);assert.equal((await c.speak(job.messageId)).id,a.id);assert.equal(calls.length,1);
  const file=c.media.get(a.id).filename;c.deleteConversation(c.store.one('messages',job.messageId).conversationId);assert(!existsSync(path.join(c.media.directory,file)));
});
test('deleting a conversation while manual synthesis runs prevents an orphan audio attachment',async t=>{
  let release;const {c}=fixture(t,{plan:{},synthesize:()=>new Promise(resolve=>{release=resolve;})});const job=c.startChat({text:'你好'});await finish(c,job);const work=c.speak(job.messageId);const checked=assert.rejects(work);while(!release)await new Promise(resolve=>setImmediate(resolve));c.deleteConversation(c.store.one('messages',job.messageId).conversationId);release(sample());await checked;assert.equal(c.store.list('media').length,0);
});
test('disabling voice during synthesis leaves text and no generated attachment',async t=>{
  let release;const {c}=fixture(t,{synthesize:()=>new Promise(resolve=>{release=resolve;})});const job=c.startChat({text:'发语音给我'});while(!release)await new Promise(resolve=>setImmediate(resolve));await c.settings({voice:{enabled:false}});release(sample());await finish(c,job);assert.equal(c.state().messages.at(-1).replyMode,'text');assert.equal(c.store.list('media').length,0);
});
test('voice requests and speech text stay bounded and do not read URLs or emoji aloud',async()=>{
  assert(voiceIntent('说一句话给我听',{},voiceDefaults(),true).requested);assert(!voiceIntent('不想听语音',{reply_mode:'voice'},voiceDefaults(),true).requested);assert.equal(spokenText('你好 😂 https://example.com'),'你好 这个链接');
  const voice=new Voice();voice.status=()=>({available:true});await assert.rejects(voice.synthesize('字'.repeat(361),voiceDefaults()),/较长/);await assert.rejects(voice.synthesize('```js\nconst x=1;\n```',voiceDefaults()),/较长/);
});
