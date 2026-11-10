// Real uploads and fake microphone in an isolated service. Chat requests never reach a model.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const output=process.env.QING_E2E_OUTPUT||'../artifacts/web/qq-input';const service=process.env.QING_E2E_API_ORIGIN;
if(!service)throw new Error('Set QING_E2E_API_ORIGIN to an isolated service.');await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QING_BROWSER_EXECUTABLE,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const report={checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',permissions:['microphone']});page.on('pageerror',e=>report.errors.push(e.message));
 const submitted=[];let uploaded=0;
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/chat'&&route.request().method()==='POST'){submitted.push(route.request().postDataJSON());await route.fulfill({status:202,json:{id:'intercepted-chat'}});return;}if(u.pathname==='/api/media'&&route.request().method()==='POST')uploaded++;const response=await route.fetch({url:service+u.pathname+u.search});await route.fulfill({response});});
 await page.goto('http://127.0.0.1:5173/#chat');const draft=page.getByRole('textbox',{name:'想对大肥鱼说什么',exact:true});await draft.waitFor();
 for(const name of ['上传音频文件','分享平台链接'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
 assert.equal(await page.locator('input[aria-label="选择语音附件"]').count(),0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:width>720?1000:844});await page.getByRole('button',{name:'选择表情',exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(),0);const panel=page.getByRole('region',{name:'表情输入'});await panel.waitFor();
  const box=await panel.boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert(box.y+box.height<=(width>720?1000:844));
  await page.getByRole('button',{name:'插入表情 😂',exact:true}).click();await page.getByRole('button',{name:'插入表情 🥹',exact:true}).click();assert((await draft.inputValue()).endsWith('😂🥹'));assert(await panel.isVisible());
  if(width===390)await page.screenshot({path:output+'/emoji-390.png'});await page.getByRole('button',{name:'切换文字输入',exact:true}).click();await draft.fill('');
 }
 report.checks.push('Inline emoji input stays inside 320/390/768/1440 viewports, remains open after repeated choices, and creates no dialog. Audio-upload and link buttons are absent.');
 await page.setViewportSize({width:390,height:844});
 for(const message of ['我发现一个很有意思的视频，https://www.bilibili.com/video/BV1Qi421C7Xs','最近听到一首好听的歌，叫《晴天》']){await draft.fill(message);await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#message-draft').value==='');assert.equal(submitted.at(-1).text,message);assert.equal(submitted.at(-1).attachmentIds.length,0);}
 report.checks.push('Video links and song titles are submitted as normal text messages.');
 await page.locator('input[aria-label="选择图片附件"]').setInputFiles({name:'reaction.jpg',mimeType:'image/jpeg',buffer:await readFile('../artifacts/web/v05/source-sticker.jpg')});await page.locator('.pending-attachment img').waitFor();await draft.fill('配一句文字');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.pending-attachment'));assert.equal(submitted.at(-1).attachmentIds.length,1);
 await page.getByRole('button',{name:'选择表情',exact:true}).click();await page.getByRole('tab',{name:'收藏',exact:true}).click();const sticker=page.getByRole('button',{name:/选择表情：/}).first();if(await sticker.count()){await sticker.click();}else{await page.locator('input[aria-label="选择表情附件"]').setInputFiles({name:'reaction.gif',mimeType:'image/gif',buffer:await readFile('../artifacts/web/v05/source-sticker.gif')});}await page.locator('.pending-attachment img').waitFor();assert(await page.getByRole('region',{name:'表情输入'}).isVisible());await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.pending-attachment'));await page.getByRole('button',{name:'切换文字输入',exact:true}).click();
 report.checks.push('Real image and collected-sticker uploads remain sendable from the input area.');
 await page.getByRole('button',{name:'切换语音输入',exact:true}).click();const hold=page.getByRole('button',{name:'按住说话',exact:true});await hold.waitFor();assert.equal(await draft.count(),0);
 const down=async()=>{const box=await hold.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();return box;};
 const before={uploaded,chats:submitted.length};let box=await down();await page.locator('.voice-feedback').waitFor();await page.waitForTimeout(1000);await page.mouse.move(box.x+box.width/2,box.y-90);assert(await page.getByText('松开取消这段语音',{exact:true}).isVisible());await page.screenshot({path:output+'/voice-cancel-390.png'});await page.mouse.up();await page.waitForTimeout(200);assert.equal(uploaded,before.uploaded);assert.equal(submitted.length,before.chats);
 await down();await page.waitForFunction(()=>document.querySelector('.hold-to-talk.is-recording'));await page.waitForTimeout(1100);await page.screenshot({path:output+'/voice-recording-390.png'});await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.upload-status'),null,{timeout:20000});await page.waitForTimeout(400);assert.equal(uploaded,before.uploaded+1);assert.equal(submitted.length,before.chats+1);assert.equal(submitted.at(-1).text,'');assert.equal(submitted.at(-1).attachmentIds.length,1);assert.equal(await page.locator('.pending-audio').count(),0);
 report.checks.push('Hold-to-talk records real browser audio with a fake microphone: sliding up cancels without upload; release uploads and sends exactly one voice message.');
 const beforeDelayed=uploaded;
 await page.evaluate(()=>{window.__originalMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const stream=await window.__originalMic(c);window.__delayedStream=stream;await new Promise(resolve=>window.__allowMic=resolve);return stream;};});
 await down();await page.waitForFunction(()=>Boolean(window.__allowMic));await page.mouse.up();await page.evaluate(()=>window.__allowMic());await page.waitForTimeout(300);assert.equal(uploaded,beforeDelayed);assert(await page.evaluate(()=>window.__delayedStream.getTracks().every(t=>t.readyState==='ended')));await page.evaluate(()=>navigator.mediaDevices.getUserMedia=window.__originalMic);
 report.checks.push('Releasing before microphone permission resolves never starts recording or uploads audio, and closes the acquired stream.');
 await page.getByRole('button',{name:'切换文字输入',exact:true}).click();await draft.fill('还没发完的话');await page.getByRole('button',{name:'切换语音输入',exact:true}).click();await page.getByRole('button',{name:'选择表情',exact:true}).click();assert.equal(await draft.inputValue(),'还没发完的话');assert(await page.getByRole('region',{name:'表情输入'}).isVisible());await draft.focus();assert.equal(await page.getByRole('region',{name:'表情输入'}).count(),0);
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>480});visualViewport.dispatchEvent(new Event('resize'));});await page.waitForFunction(()=>document.documentElement.dataset.keyboard==='open');const composer=await page.locator('.qq-composer').boundingBox();assert(composer.y>=0&&composer.y+composer.height<=480);await page.screenshot({path:output+'/keyboard-390.png'});await page.evaluate(()=>{delete visualViewport.height;document.activeElement.blur();visualViewport.dispatchEvent(new Event('resize'));});
 report.checks.push('Text survives switching voice/emoji modes; focusing text returns to keyboard input and the composer stays inside a 480px visual viewport.');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;throw error;}finally{await writeFile(output+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
