import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Companion } from '../companion.mjs';
import { Store } from '../store.mjs';
import { publicUrl, platformFor, isPrivateAddress } from '../network.mjs';
import { decodeModelContent } from '../model.mjs';

function fixture(t, model) {
 const directory=mkdtempSync(path.join(os.tmpdir(),'qing-test-'));const store=new Store(directory);store.setKey('fixture-key');
 const reader={close:async()=>{},checkPlatform:p=>{if(!store.get('settings').platforms[p]?.enabled)throw new Error('disabled');}};
 const service=new Companion({ voice: { status: () => ({ available: false }), close() {} },store,model:model||{call:async()=>({result:{reply:'你好呀。',memories:[]}})},reader});
 t.after(async()=>{await service.close();rmSync(directory,{recursive:true,force:true});});return service;
}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};

test('cancelled whole-message generation never commits a partial reply, nickname or memory',async t=>{
 let resolve;const model={call:()=>new Promise(r=>resolve=r)};const c=fixture(t,model);
 const job=c.startChat({text:'以后叫我小林',requestId:'once'});
 assert.equal(c.state().messages.at(-1).content,'');assert.equal(c.state().messages.at(-1).status,'waiting');
 assert.equal(c.startChat({text:'以后叫我小林',requestId:'once'}).id,job.id);
 await settle();c.cancel(job.id);resolve({result:{reply:'小林你好',nickname:{action:'set',name:'小林',evidence:'以后叫我小林'},memories:[]}});await settle();
 assert.equal(c.state().messages.at(-1).status,'stopped');assert.equal(c.state().messages.at(-1).content,'');assert.equal(c.state().personality.preferredName,null);
});
test('autonomous memory requires real source evidence and forgetting suppresses older context',t=>{
 const c=fixture(t);c.applyExperience({nickname:{action:'set',name:'小林',evidence:'叫我小林'},memories:[{action:'remember',content:'喜欢乌龙茶',category:'preference',confidence:.95,importance:.8,evidence:'喜欢乌龙茶'},{action:'remember',content:'从未说过的事实',category:'event',confidence:.99,evidence:'不存在的原话'}]}, {kind:'conversation',sourceId:'user-1',sequence:1,evidence:'叫我小林，我喜欢乌龙茶'});
 assert.equal(c.state().personality.preferredName,'小林');assert.equal(c.state().memories.length,1);
 const memory=c.state().memories[0];c.applyExperience({memories:[{action:'forget',id:memory.id}]},{kind:'conversation',sourceId:'user-2',sequence:2,evidence:'忘记我的饮品偏好'});
 assert.equal(c.state().memories.length,0);assert.equal(c.store.get('personality').contextAfter,2);
});
test('reading cannot set user identity and cannot replace user preference memories',t=>{
 const c=fixture(t);c.applyExperience({nickname:{action:'set',name:'网页名字',evidence:'网页名字'},memories:[{action:'remember',content:'网页作者说用户住上海',category:'identity',confidence:1}]},{kind:'reading',sourceId:'page-1'});
 assert.equal(c.state().personality.preferredName,null);assert.equal(c.state().memories.length,0);
});
test('personality changes slowly only after multiple actual experiences',t=>{
 const c=fixture(t);const before=c.state().personality.traits.curiosity;
 for(let i=1;i<=3;i++)c.applyExperience({growth:{summary:'更好奇一点',reason:'新见闻',deltas:{curiosity:10}}},{kind:'reading',sourceId:`p${i}`});
 assert.equal(c.state().personality.traits.curiosity,before);
 c.applyExperience({growth:{summary:'更好奇一点',reason:'积累了新见闻',deltas:{curiosity:10}}},{kind:'reading',sourceId:'p4'});
 assert.equal(c.state().personality.growthVersion,2);assert(Math.abs(c.state().personality.traits.curiosity-before-.02)<.00001);assert.equal(c.state().growth.length,1);
});
test('disabled platforms and private or disguised targets are rejected',async t=>{
 const c=fixture(t);assert.throws(()=>c.startExplore({url:'https://www.douyin.com/video/123'}),/没有开启/);
 assert.equal(platformFor('https://www.bilibili.com.evil.invalid/video/BV1'),null);
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:7f00:1','fe90::1'])assert(isPrivateAddress(address));
 await assert.rejects(publicUrl('https://127.0.0.1/'));await assert.rejects(publicUrl('https://[::ffff:127.0.0.1]/'));await assert.rejects(publicUrl('http://www.bilibili.com/'));
});
test('backup omits credentials; invalid imports leave existing records intact',t=>{
 const c=fixture(t);c.applyExperience({memories:[{action:'remember',content:'喜欢茶',evidence:'喜欢茶',category:'preference',confidence:.9}]},{kind:'conversation',sourceId:'u1',sequence:1,evidence:'喜欢茶'});
 const backup=c.exportBackup();assert(!JSON.stringify(backup).includes('fixture-key'));assert(!JSON.stringify(c.state()).includes('fixture-key'));
 assert.throws(()=>c.importBackup({...backup,data:{...backup.data,messages:[{id:'bad',role:'user',content:'x',conversationId:'missing'}]}}));assert.equal(c.state().memories.length,1);
});
test('encrypted local key survives restart while interrupted requests are repaired',t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'qing-vault-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const a=new Store(directory);a.setKey('local-key-test-123');a.put('messages',{id:'pending',status:'waiting',content:'',role:'assistant'});a.close();
 assert(!readFileSync(path.join(directory,'qing.sqlite')).includes(Buffer.from('local-key-test-123')));
 const b=new Store(directory);assert.equal(b.decrypt(b.get('modelKey')),'local-key-test-123');assert.equal(b.one('messages','pending').status,'interrupted');b.close();
});
test('a failed model call is shown as failure without fake text',async t=>{
 const c=fixture(t,{call:async()=>{throw new Error('provider internal detail');}});c.startChat({text:'你好'});await settle();assert.equal(c.state().messages.at(-1).status,'failed');assert.equal(c.state().messages.at(-1).content,'');assert(!JSON.stringify(c.state()).includes('provider internal detail'));
});
test('real sticker bytes are archived once and selected by valid library ID',async t=>{
 const c=fixture(t,{call:async()=>({result:{is_sticker:true,meaning:'开心的猫',tags:['开心'],avoid:[]}})});
 c.reader.image=async()=>({data:Buffer.from('fixture-bytes'),mime:'image/png',hash:'abc123',perceptualHash:'0123',width:200,height:200});
 const {job,controller}=c.createJob('explore',{platform:'bilibili'});const reading={platform:'bilibili',displayUrl:'https://www.bilibili.com/read/cv1/',title:'猫表情',images:[{url:'https://i0.hdslb.com/example.png'}]};
 await c.collectStickers(reading,job,controller.signal);await c.collectStickers(reading,job,controller.signal);
 assert.equal(c.state().stickers.length,1);assert.equal(c.eligibleStickers('开心')[0].id,c.state().stickers[0].id);
});
test('complete provider messages tolerate formatting wrappers but never truncated JSON',()=>{
 assert.equal(decodeModelContent('\n```json\n{"reply":"你好"}\n```\n').result.reply,'你好');
 assert.equal(decodeModelContent('结果：{"reply":"你好"}').result.reply,'你好');
 assert.equal(decodeModelContent('我记得，你喜欢乌龙茶。',true).structured,false);
 assert.throws(()=>decodeModelContent('{"reply":"未完成',true));
 assert.throws(()=>decodeModelContent('null',false));
});
test('failed memory analysis cannot falsely claim a requested forgetting succeeded',async t=>{
 const c=fixture(t,{call:async(_messages,options)=>{if(options.responseMode==='text')return {result:{reply:'我已经忘记了。'}};throw new Error('state failure');}});
 for(const text of ['忘记我的饮品偏好','忘記我的飲品偏好']){c.startChat({text});await settle();assert.equal(c.state().messages.at(-1).status,'failed');assert.equal(c.state().messages.at(-1).content,'');}
});
test('deleting a conversation clears sourced memories and keeps other conversations',async t=>{
 const c=fixture(t);const first=c.store.get('activeConversation');
 c.store.put('messages',{id:'source-user',conversationId:first,role:'user',content:'喜欢茶',status:'complete',sequence:1});
 c.applyExperience({memories:[{action:'remember',content:'喜欢茶',category:'preference',evidence:'喜欢茶',confidence:.9}]},{kind:'conversation',sourceId:'source-user',sequence:1,evidence:'喜欢茶'});
 const second=c.store.newConversation();c.deleteConversation(first);assert.equal(c.state().memories.length,0);assert.equal(c.state().conversations.length,1);assert.equal(c.state().activeConversation,second.id);
});
test('autonomous exploration requires an allowed platform and settings remain atomic',async t=>{
 const c=fixture(t);await assert.rejects(c.settings({autonomy:{enabled:true},platforms:Object.fromEntries(Object.keys(c.state().settings.platforms).map(key=>[key,{enabled:false}]))}),/至少一个平台/);assert.equal(c.state().settings.autonomy.enabled,false);assert.equal(c.state().settings.platforms.bilibili.enabled,true);
});
test('daily exploration budget is reserved by existing jobs before new work starts',t=>{
 const c=fixture(t);const settings=c.store.get('settings');settings.autonomy.maxRunsPerDay=1;c.store.set('settings',settings);
 c.store.put('jobs',{id:'used',kind:'explore',status:'failed',createdAt:new Date().toISOString()});
 assert.throws(()=>c.startExplore({}),/探索次数用完/);assert.equal(c.state().jobs.length,1);
});
test('scheduler respects quiet hours and minimum intervals without calling the model',t=>{
 const c=fixture(t);let attempts=0;c.startExplore=()=>{attempts++;};
 const settings=c.store.get('settings');settings.autonomy.enabled=true;settings.autonomy.quietStart='00:00';settings.autonomy.quietEnd='23:59';c.store.set('settings',settings);c.tick();assert.equal(attempts,0);
 settings.autonomy.quietStart=settings.autonomy.quietEnd='00:00';c.store.set('settings',settings);
 c.store.put('jobs',{id:'recent',kind:'explore',status:'completed',createdAt:new Date().toISOString()});c.tick();assert.equal(attempts,0);
 c.store.delete('jobs','recent');c.tick();assert.equal(attempts,1);
});
