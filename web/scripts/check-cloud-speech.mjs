// Real vendor UI checks must use an isolated companion database.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const api=process.env.QING_E2E_API_ORIGIN;
if(!api||api==='http://127.0.0.1:3101')throw new Error('Use an isolated service, never the daily conversation database.');
const output=process.env.QING_E2E_OUTPUT||'../artifacts/web/bailian/settings';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QING_BROWSER_EXECUTABLE,args:['--no-sandbox']});const report={at:new Date().toISOString(),checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.on('pageerror',error=>report.errors.push(error.message));
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:api+url.pathname+url.search});await route.fulfill({response});});
 await page.goto('http://127.0.0.1:5173/#settings');const panel=page.locator('.cloud-speech-settings');await panel.getByRole('heading',{name:'百炼语音服务',exact:true}).waitFor();
 assert(await panel.getByText('已读取环境变量 QWEN_API_KEY',{exact:true}).isVisible());
 assert.equal(await panel.getByRole('switch',{name:'使用百炼语音识别',exact:true}).getAttribute('aria-checked'),'true');
 assert.equal(await panel.getByRole('switch',{name:'使用百炼语音合成',exact:true}).getAttribute('aria-checked'),'true');
 const words=panel.getByRole('textbox',{name:/常用词提示/});await words.fill(`大肥鱼、可莉、乌龙茶、DeepSeek、B站、测试词${Date.now()}`);assert(await panel.getByRole('button',{name:'测试真实识别',exact:true}).isDisabled());
 await page.getByRole('button',{name:'保存连接与偏好',exact:true}).click();await panel.getByRole('button',{name:'测试真实识别',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.cloud-speech-settings button')].some(button=>button.textContent.includes('测试真实识别')&&!button.disabled));
 const saved=await fetch(api+'/api/state').then(r=>r.json());assert(saved.settings.cloudSpeech.hotwords.includes('乌龙茶'));report.checks.push('Cloud ASR/TTS configuration and vocabulary hints save through the real settings API.');
 await panel.locator('input[type=file]').first().setInputFiles('../中文语音可莉.wav');await panel.getByRole('button',{name:'测试真实识别',exact:true}).click();await panel.locator('.cloud-transcript').waitFor({timeout:90000});assert((await panel.locator('.cloud-transcript').innerText()).includes('可莉'));report.checks.push('A selected WAV uploads and returns an actual Bailian transcript in the settings panel.');
 await panel.locator('summary').click();await panel.getByRole('button',{name:'更新音色状态',exact:true}).click();await page.waitForTimeout(600);assert((await panel.locator('.cloud-clone-status').innerText()).includes('音色已就绪'));report.checks.push('Existing clone status is queried from the provider without creating a duplicate voice.');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:width>720?1000:844});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`Overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await panel.getByRole('heading',{name:'百炼语音服务',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:output+'/cloud-settings-390.png'});await panel.locator('summary').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/cloud-clone-390.png'});report.checks.push('Expanded cloud settings, file controls, transcript and voice ID fit 320/390/768/1440 widths.');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;throw error;}finally{await writeFile(output+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
