// Real local inference. Uses synthetic evaluation text and never writes to the user's database.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {CharacterVoice} from '../server/character-voice.mjs';
import {Speech} from '../server/speech.mjs';
import path from 'node:path';
const output=path.resolve('../artifacts/web/klee-voice');await mkdir(output,{recursive:true});
const log=openSync('/tmp/dafeiyu-klee-inference.log','w');const voice=new CharacterVoice({configFile:path.resolve('.character-voice-runtime/config.json'),timeoutMs:180000,spawnChild:(python,args,options)=>spawn(python,args,{...options,stdio:['pipe','pipe',log]})});
const speech=new Speech(),report={checkedAt:new Date().toISOString(),engine:'gpt-sovits-v2',databaseUsed:false,samples:[]};
try{
 for(const [name,text] of [['klee-style-sample','你好呀，我是大肥鱼！今天有什么好玩的事情，快跟我说说吧。'],['klee-style-short','这个小表情好可爱，我也想把它收藏起来。']]){
  const started=Date.now();const audio=await voice.synthesize(text,{rate:0},AbortSignal.timeout(180000));const elapsedMs=Date.now()-started;const file=path.join(output,name+'.wav');await writeFile(file,audio.data);const recognized=await speech.transcribe(file,AbortSignal.timeout(60000));
  const sample={name,text,duration:audio.duration,bytes:audio.data.length,elapsedMs,recognized:recognized.transcript};report.samples.push(sample);console.log(JSON.stringify(sample));assert(!/玻璃球|托斯|巴巴/.test(recognized.transcript),'Reference text leaked instead of requested text');assert(recognized.transcript.length>5);
 }
 assert.equal(report.samples.length,2);report.success=true;
}catch(error){report.error=error.message;throw error;}finally{voice.close();speech.close();closeSync(log);await writeFile(path.join(output,'real-inference.json'),JSON.stringify(report,null,2));}
