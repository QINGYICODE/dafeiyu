import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CloudSpeech, cloudSpeechDefaults, cloudSpeechSettings } from '../cloud-speech.mjs';
import { Speech } from '../speech.mjs';
import { Voice, voiceDefaults } from '../voice.mjs';

function fixture(t, options = {}) {
  const values = new Map([['settings', {cloudSpeech:{...cloudSpeechDefaults(),ttsModel:'qwen-audio-3.1-tts-flash',voiceId:'qiaoxiaojiao_v3.1'}}]]);
  const store = { get:key=>values.get(key), set:(key,value)=>values.set(key,value) };
  const calls = [];
  const cloud = new CloudSpeech(store, {fetcher:async(url, init)=>{calls.push({url,init,body:init?.body ? JSON.parse(init.body) : null});return options.fetcher ? options.fetcher(url,init) : Response.json({choices:[{message:{content:'大肥鱼，今天去B站看看。'}}],id:'request-test'});}, ...options});
  cloud.key = ()=>'test-private-key';
  cloud.python = ()=>process.execPath; // normalize is mocked; no local audio runtime is required by these unit cases.
  cloud.normalize = async()=>({data:Buffer.from('unit-wave'),duration:18.9});
  t.after(()=>cloud.close());
  return {cloud, store, values, calls};
}
test('ASR sends normalized audio, vocabulary as typed context and a nonstreaming request',async t=>{
  const {cloud,calls}=fixture(t); const result=await cloud.transcribe('/private/recording.webm');
  assert.equal(result.transcript,'大肥鱼，今天去B站看看。');assert.equal(result.duration,18.9);
  assert.equal(calls[0].body.stream,false);assert.equal(calls[0].body.messages[0].content[0].type,'text');assert(calls[0].body.messages[0].content[0].text.includes('大肥鱼'));
  assert(calls[0].body.messages[1].content[0].input_audio.data.startsWith('data:audio/wav;base64,'));
  assert(!JSON.stringify(calls[0].body).includes('/private/'));assert(!('language' in calls[0].body.asr_options));
});
test('ASR empty, malformed and late cancelled results never become a transcript',async t=>{
  const {cloud}=fixture(t,{fetcher:async()=>Response.json({choices:[]})});await assert.rejects(cloud.transcribe('audio'),/没听清/);
  const controller=new AbortController();cloud.fetcher=async()=>{controller.abort();return Response.json({choices:[{message:{content:'late'}}]});};await assert.rejects(cloud.transcribe('audio',controller.signal),/取消/);
});
test('cloud credentials are absent from public status and provider errors',async t=>{
  const {cloud,store}=fixture(t,{fetcher:async()=>Response.json({error:{code:'InvalidApiKey',message:'secret=test-private-key data:audio/wav;base64,private'}},{status:401})});
  store.set('cloudSpeechTest',{ok:true,account:cloud.account(),at:'now',model:cloud.options().asrModel});
  const status=JSON.stringify(cloud.status());assert(!status.includes('test-private-key'));assert(!status.includes(cloud.account()));assert(cloud.status().connection.current);
  await assert.rejects(cloud.transcribe('audio'),error=>error.status===401&&!error.message.includes('test-private-key')&&!error.message.includes('base64'));
});
test('unconfigured cloud credentials fail explicitly without using a different provider',async t=>{
  const {cloud,calls}=fixture(t);cloud.key=()=>'';await assert.rejects(cloud.transcribe('audio'),/QWEN_API_KEY/);assert.equal(calls.length,0);
});
test('cloud models and workspace IDs cannot select arbitrary credential destinations',t=>{
  const {cloud,store}=fixture(t);assert.throws(()=>cloudSpeechSettings({workspaceId:'x.evil.example/'}));assert.throws(()=>cloudSpeechSettings({ttsModel:'qwen3-tts-flash'}));assert.throws(()=>cloudSpeechSettings({asrModel:'qwen3-asr-flash-filetrans'}));
  store.set('settings',{cloudSpeech:{...cloudSpeechDefaults(),workspaceId:'space123',region:'singapore'}});assert.equal(cloud.base(),'https://space123.ap-southeast-1.maas.aliyuncs.com');
});
test('TTS downloads full audio without forwarding the API key and validates its contents',async t=>{
  const calls=[];const {cloud}=fixture(t,{validateUrl:async value=>new URL(value),fetcher:async(url,init)=>{calls.push({url,init});return init?.method==='POST'?Response.json({output:{audio:{url:'https://cdn.example/voice.wav'}}}):new Response(Buffer.alloc(200));}});
  let decoded=false;cloud.normalize=async filename=>{decoded=filename.endsWith('voice');return {data:Buffer.from('decoded wav'),duration:2.5};};
  const result=await cloud.synthesize('你好呀',{rate:-8});assert(decoded);assert.equal(result.duration,2.5);assert.equal(result.data.length,200,'Keep the original synthesis quality after decode validation');assert.equal(calls[1].init.headers,undefined);
  const payload=JSON.parse(calls[0].init.body);assert.equal(payload.input.rate,.92);assert.equal(payload.input.format,'wav');assert.equal(payload.model,'qwen-audio-3.1-tts-flash');assert.equal(calls[0].init.headers['X-DashScope-SSE'],undefined);
});
test('audio downloads reject private addresses, hostile redirects and oversized results',async t=>{
  const {cloud}=fixture(t,{fetcher:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})});
  await assert.rejects(cloud.download('https://127.0.0.1/voice'),/内网|公开/);
  cloud.validateUrl=async value=>{const url=new URL(value);if(url.protocol!=='https:')throw new Error();return url;};await assert.rejects(cloud.download('https://cdn.example/voice'),/下载失败/);
  cloud.fetcher=async()=>new Response(Buffer.alloc(8*1024*1024+1));await assert.rejects(cloud.download('https://cdn.example/voice'),/大小/);
});
test('Bailian OSS result URLs are upgraded to HTTPS without changing signed queries',async t=>{
  const requested=[];const {cloud}=fixture(t,{validateUrl:async value=>new URL(value),fetcher:async url=>{requested.push(url);return new Response(Buffer.alloc(200));}});
  await cloud.download('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav?Signature=unit-signature');
  assert.equal(requested[0],'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav?Signature=unit-signature');
});
test('clone creation is not ready until queried, deduplicates requests, and binds the exact model',async t=>{
  const calls=[];const {cloud,store}=fixture(t,{fetcher:async(_url,init)=>{const request=JSON.parse(init.body);calls.push(request);return Response.json(request.input.action==='create_voice'?{output:{voice_id:'qwen-audio-3.1-tts-flash-dafeiyu-test'}}:{output:{status:'DEPLOYING'}});}});
  let result=await cloud.createClone({useReference:true});assert.equal(result.status,'DEPLOYING');assert.equal(calls[0].input.target_model,'qwen-audio-3.1-tts-flash');assert(calls[0].input.audio.startsWith('data:audio/wav;base64,'));
  await cloud.createClone({useReference:true});assert.equal(calls.filter(x=>x.input.action==='create_voice').length,1);
  store.set('settings',{cloudSpeech:{...cloud.options(),voiceId:result.voiceId,ttsEnabled:true}});await assert.rejects(cloud.synthesize('hello',{rate:0}),/尚未就绪/);
  cloud.fetcher=async()=>Response.json({output:{status:'OK'}});result=await cloud.queryClone();assert.equal(result.status,'OK');
  store.set('settings',{cloudSpeech:{...cloud.options(),ttsModel:'qwen-audio-3.1-tts-plus'}});assert(!cloud.status().clone.compatible);await assert.rejects(cloud.synthesize('hello',{rate:0}),/不匹配/);
});
test('rejected clones remain visibly unavailable and short recordings cannot create voices',async t=>{
  const {cloud,calls}=fixture(t);cloud.normalize=async()=>({duration:6,data:Buffer.alloc(50)});await assert.rejects(cloud.createClone({useReference:true}),/10 至 30/);assert.equal(calls.length,0);
  cloud.normalize=async()=>({duration:18,data:Buffer.alloc(100)});cloud.fetcher=async(_url,init)=>Response.json(JSON.parse(init.body).input.action==='create_voice'?{output:{voice_id:'test-voice'}}:{output:{status:'UNDEPLOYED'}});
  assert.equal((await cloud.createClone({useReference:true})).status,'UNDEPLOYED');
});
test('existing cloud voice IDs are verified against the provider and retain their true target model',async t=>{
  const {cloud}=fixture(t,{fetcher:async()=>Response.json({output:{status:'OK',target_model:'qwen-audio-3.1-tts-plus'}})});
  const clone=await cloud.queryClone('existing-cloud-voice');assert.equal(clone.status,'OK');assert.equal(clone.model,'qwen-audio-3.1-tts-plus');assert(!clone.compatible);
  cloud.fetcher=async()=>Response.json({output:{status:'OK'}});await assert.rejects(cloud.queryClone('unknown-model-voice'),/绑定的模型/);
});
test('a verified clone is synthesized without overriding its reference style with generic chat instructions',async t=>{
  const requests=[];const {cloud,store}=fixture(t,{validateUrl:async value=>new URL(value),fetcher:async(_url,init)=>{if(init?.method==='POST'){requests.push(JSON.parse(init.body));return Response.json({output:{audio:{url:'https://cdn.example/voice.wav'}}});}return new Response(Buffer.alloc(200));}});
  const options={...cloud.options(),voiceId:'cloned-voice'};store.set('settings',{cloudSpeech:options});store.set('cloudVoice',{voiceId:options.voiceId,model:options.ttsModel,status:'OK',account:cloud.account()});
  await cloud.synthesize('你好呀',{rate:0});assert(!('instruction' in requests[0].input));assert.equal(requests[0].input.voice,'cloned-voice');
});
test('speech and voice dispatch to configured cloud providers while preserving local voice preferences',async t=>{
  const {cloud,store}=fixture(t);store.set('settings',{cloudSpeech:{...cloudSpeechDefaults(),asrEnabled:true,ttsEnabled:true}});
  const speech=new Speech(cloud),voice=new Voice(cloud);t.after(()=>{speech.close();voice.close();});let spoken;
  cloud.synthesize=async value=>{spoken=value;return {data:Buffer.from('actual-wave'),duration:1};};
  assert.equal(speech.status().engine,'aliyun-bailian');assert.equal(voice.status().engine,'aliyun-bailian');await speech.transcribe('audio');
  await voice.synthesize('你好 😂',{...voiceDefaults(),speaker:'klee'});assert.equal(spoken,'你好');
  store.set('settings',{cloudSpeech:cloudSpeechDefaults()});assert.equal(speech.status().engine,'local-whisper');assert.notEqual(voice.status().engine,'aliyun-bailian');
});
test('actual audio preprocessing rejects corrupt data and preserves decoded duration',async t=>{
  const cloud=new CloudSpeech({get:()=>null});t.after(()=>cloud.close());if(!existsSync(cloud.python()))return t.skip('Audio runtime is not installed');
  const directory=await mkdtemp(path.join(os.tmpdir(),'cloud-audio-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));const filename=path.join(directory,'recording');
  await writeFile(filename,'RIFF this is not a valid recording');await assert.rejects(cloud.normalize(filename),/无法读取/);
  const wave=Buffer.alloc(44+32000);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(16000,24);wave.writeUInt32LE(32000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(32000,40);await writeFile(filename,wave);
  const result=await cloud.normalize(filename);assert.equal(result.duration,1);assert.equal(result.data.subarray(0,4).toString(),'RIFF');
});
