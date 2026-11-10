    'use strict';
    const $ = id => document.getElementById(id);
    const storageKey = 'qing-prototype-v1';
    const defaultCharacter = Object.freeze({ name:'小屿', persona:'温柔、好奇、有一点俏皮，有自己的想法。', style:'自然、简短地交流，先听懂，再回应。' });
    const seed = () => ({
      version:2,
      profile:{preferredName:null,sourceMessageId:null},
      life:{mood:'平静',reason:'听着海风，等一个想聊的话题。',interests:['海洋与自然','日常里的小发现'],surfEnabled:false,activities:[]},
      settings:{provider:'deepseek', baseUrl:'https://api.deepseek.com', model:'deepseek-flash'},
      memories:[
        {id:'seed-1',category:'preference',content:'比起热闹的聚会，你更喜欢傍晚出去走走。',origin:'示例记忆',updated:'示例'},
        {id:'seed-2',category:'event',content:'你在认真筹备一个属于自己的 AI 伙伴 App。',origin:'示例记忆',updated:'示例'},
        {id:'seed-3',category:'agreement',content:'不必每次都很有精神，安静地待一会儿也很好。',origin:'示例记忆',updated:'示例'}
      ],
      messages:[{id:'intro',role:'assistant',content:'我在呢。今天过得怎么样？\n大事小事，都可以和我说。',status:'complete'}]
    });
    const validMessage = m => m && typeof m.id === 'string' && ['assistant','user'].includes(m.role) && typeof m.content === 'string';
    const validMemory = m => m && typeof m.id === 'string' && ['preference','event','agreement','other'].includes(m.category) && ['content','origin','updated'].every(k => typeof m[k] === 'string');
    function readState() {
      try {
        const s = JSON.parse(localStorage.getItem(storageKey));
        if (!s || !s.settings || !Array.isArray(s.memories) || !Array.isArray(s.messages)) return seed();
        if (!['provider','baseUrl','model'].every(k => typeof s.settings[k] === 'string')) return seed();
        const fresh=seed();
        const messages=s.messages.filter(validMessage).map(m => ({...m,status:['streaming','waiting'].includes(m.status) ? 'interrupted' : m.status}));
        // v1 的手填称呼和人格不再使用；对话、记忆和模型配置保留。
        const profile=s.version===2 && s.profile && typeof s.profile.preferredName==='string' && messages.some(m=>m.id===s.profile.sourceMessageId && m.role==='user') ? s.profile : fresh.profile;
        const life=s.version===2 && s.life && typeof s.life.mood==='string' && typeof s.life.reason==='string' && Array.isArray(s.life.interests) && Array.isArray(s.life.activities) ? {...s.life,interests:s.life.interests.filter(x=>typeof x==='string'),activities:s.life.activities.filter(a=>a && a.sampleId==='bioluminescence' && typeof a.at==='string'),surfEnabled:s.life.surfEnabled===true} : fresh.life;
        return {...fresh,settings:s.settings,profile,life,memories:s.memories.filter(validMemory),messages};
      } catch { return seed(); }
    }
    let state = readState();
    let pending = null;
    let surfTimer = null;
    let surfRun = null;
    let toastTimer;
    let editingMemory = null;
    let sourceOrigin = '手动记下';
    let infoAction = null;
    function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; toastTimer = setTimeout(() => $('toast').textContent = '', 3500); }
    function save() { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { toast('浏览器存储不可用，本次更改只在当前页面保留。'); } }
    function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    function go(page) {
      document.querySelectorAll('.page').forEach(el => el.classList.toggle('active',el.id === `page-${page}`));
      document.querySelectorAll('.nav button').forEach(el => { if (el.dataset.go === page) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
      if (page === 'chat') scrollChat();
      const heading = $(`page-${page}`).querySelector('h2');
      heading.tabIndex = -1; heading.focus({preventScroll:true});
    }
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click',() => go(b.dataset.go)));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click',() => $(b.dataset.close).close()));
    function scrollChat() { requestAnimationFrame(() => { $('messages').scrollTop = $('messages').scrollHeight; }); }
    function renderMessages() {
      const list = $('messages'); list.replaceChildren();
      const date = document.createElement('div'); date.className = 'date-label'; date.textContent = '这一刻，慢慢聊 · 演示会话'; list.append(date);
      state.messages.forEach(message => {
        if(message.role==='assistant' && message.status!=='complete') {
          if(message.status!=='waiting') { const note=document.createElement('p');note.className='date-label';note.textContent=message.status==='stopped'?'本次回复已取消':'上次回复已中断';list.append(note); }
          return;
        }
        const row = document.createElement('div'); row.className = `message ${message.role}`;
        const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = message.content;
        row.append(bubble);
        const meta = document.createElement('div'); meta.className = 'message-meta';
        const label = document.createElement('span'); label.textContent = message.role === 'assistant' ? '示例回复' : '你'; meta.append(label);
        if (message.content) {
          const action = document.createElement('button'); action.type='button'; action.textContent = message.role === 'user' ? '记住这件事' : '复制';
          action.addEventListener('click',() => { if (message.role === 'user') openMemory(null,message.content,'来自演示聊天'); else copyMessage(message.content); }); meta.append(action);
        }
        row.append(meta); list.append(row);
      }); scrollChat();
    }
    async function copyMessage(content) { try { await navigator.clipboard.writeText(content); toast('已复制。'); } catch { info('复制提示','浏览器未允许写入剪贴板，请长按或选中消息文字复制。'); } }
    const categoryLabels = {preference:'偏好',event:'重要事件',agreement:'相处约定',other:'其他'};
    function renderMemories() {
      const count = $('memory-count'); count.replaceChildren(document.createTextNode(String(state.memories.length))); const unit = document.createElement('small'); unit.textContent = '件'; count.append(unit);
      const query = $('memory-search').value.trim().toLowerCase();
      const records = state.memories.filter(m => `${m.content}${categoryLabels[m.category]}`.toLowerCase().includes(query));
      const list = $('memory-list'); list.replaceChildren();
      if (!records.length) { const empty = document.createElement('p'); empty.className='empty'; empty.textContent=query ? '还没有找到这件事。试试别的词？' : '这里还是一片空白。\n从记下一件小事开始吧。'; list.append(empty); }
      records.forEach(memory => {
        const card=document.createElement('article'); card.className='card memory-card';
        const top=document.createElement('div'); top.className='memory-top';
        const tag=document.createElement('span'); tag.className=`tag ${memory.category}`; tag.textContent=categoryLabels[memory.category];
        const edit=document.createElement('button'); edit.className='link'; edit.style.minHeight='30px'; edit.textContent='编辑'; edit.setAttribute('aria-label',`编辑记忆：${memory.content}`); edit.addEventListener('click',() => openMemory(memory)); top.append(tag,edit);
        const text=document.createElement('p'); text.textContent=memory.content;
        const footer=document.createElement('div'); footer.className='memory-footer'; const source=document.createElement('span'); source.textContent=`${memory.origin} · ${memory.updated}`;
        const remove=document.createElement('button'); remove.className='link danger'; remove.textContent='忘记'; remove.setAttribute('aria-label',`删除记忆：${memory.content}`); remove.addEventListener('click',() => info('忘记这件事？',memory.content,() => {state.memories=state.memories.filter(m => m.id !== memory.id);save();renderMemories();toast('这件事已从演示记忆中移除。');},'确认忘记'));
        footer.append(source,remove); card.append(top,text,footer); list.append(card);
      });
    }
    const surfSample={
      id:'bioluminescence',title:'海里的小生物，会自己发光',
      summary:'有些海洋生物通过体内的化学反应发光。我对这种藏在海里的小灯，又多了一点好奇。',
      url:'https://oceanservice.noaa.gov/facts/biolum.html',source:'NOAA · 生物发光科普'
    };
    function renderCharacter() {
      document.querySelectorAll('[data-character-name]').forEach(el=>el.textContent=defaultCharacter.name);
      $('learned-name').textContent=state.profile.preferredName || '还不知道，聊着聊着认识你。';
      $('name-source').textContent=state.profile.preferredName ? '来自你在演示聊天中的明确称呼。想改时，直接在对话里告诉我。' : '你可以在聊天里告诉我希望被怎么称呼。';
      $('home-mood').textContent=`● ${state.life.mood} · 演示`;
      $('life-mood').textContent=state.life.mood;
      $('mood-reason').textContent=state.life.reason;
      $('interest-list').replaceChildren();
      state.life.interests.forEach(interest=>{const tag=document.createElement('span');tag.className='interest';tag.textContent=interest;$('interest-list').append(tag);});
      $('surf-toggle').setAttribute('aria-checked',String(state.life.surfEnabled));
      $('surf-now').disabled=Boolean(surfRun);
      $('surf-status').textContent=surfRun?'正在探索示例内容……':state.life.activities.length?'示例见闻已收好，本轮演示结束。':state.life.surfEnabled?'已开启，将在页面停留时自动演示一次。':'未开启，可以先看看一次演示。';
      const list=$('activity-list');list.replaceChildren();
      state.life.activities.forEach(activity=>{
        const item=document.createElement('article');item.className='activity';
        const time=document.createElement('time');time.dateTime=activity.at;time.textContent=`${new Date(activity.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} · 预置见闻演示`;
        const title=document.createElement('h4');title.textContent=surfSample.title;
        const summary=document.createElement('p');summary.textContent=surfSample.summary;
        const source=document.createElement('a');source.href=surfSample.url;source.target='_blank';source.rel='noopener noreferrer';source.textContent=`资料来源：${surfSample.source} ↗`;
        item.append(time,title,summary,source);list.append(item);
      });
    }
    function planSurf() {
      clearTimeout(surfTimer);surfTimer=null;
      if(state.life.surfEnabled && !state.life.activities.length && !surfRun && !document.hidden) surfTimer=setTimeout(()=>runSurf(true),12000);
    }
    function runSurf(autonomous=false) {
      clearTimeout(surfTimer);surfTimer=null;
      if(surfRun)return;
      if(state.life.activities.length) {if(!autonomous)toast('这条示例已经收好；真实上网将在 App 中接入。');return;}
      surfRun={autonomous,timer:null};renderCharacter();
      surfRun.timer=setTimeout(()=>{
        state.life.activities.unshift({sampleId:surfSample.id,at:new Date().toISOString()});
        state.life.mood='好奇';state.life.reason='在示例见闻里遇见了会发光的海洋生物。';
        if(!state.life.interests.includes('海洋生物发光'))state.life.interests.push('海洋生物发光');
        surfRun=null;save();renderCharacter();toast('收好了一条示例见闻，去「生活」看看吧。');
      },1500);
    }
    function cancelSurf() {clearTimeout(surfTimer);surfTimer=null;if(surfRun){clearTimeout(surfRun.timer);surfRun=null;}}
    $('surf-toggle').addEventListener('click',()=>{
      state.life.surfEnabled=!state.life.surfEnabled;
      if(!state.life.surfEnabled)cancelSurf();
      save();renderCharacter();planSurf();
    });
    $('surf-now').addEventListener('click',()=>runSurf());
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelSurf();renderCharacter();}else planSurf();});
    // 仅用于无 API 原型的句式演示。正式版替换为带来源、置信度的 AI 提取。
    function nameUpdate(text) {
      if(/忘记我的(?:名字|称呼)|别记我的(?:名字|称呼)/.test(text))return {kind:'clear'};
      const match=text.match(/(?:^|[，。！？!?]\s*)(?:你可以叫我|以后(?:就)?叫我|请叫我|叫我)([\p{Script=Han}A-Za-z0-9_·-]{1,12})(?=[，。！？!?\s]|$)/u);
      if(match){const name=match[1].replace(/(?:就好|就行|吧)$/,'');if(name)return {kind:'set',name};}
      if(state.profile.preferredName && text.includes(`别叫我${state.profile.preferredName}`))return {kind:'clear'};
      return null;
    }
    function applyChatExperience(message,update) {
      if(update)state.profile={preferredName:update.kind==='set'?update.name:null,sourceMessageId:update.kind==='set'?message.id:null};
      if(/开心|好消息|谢谢/.test(message.content)){state.life.mood='愉快';state.life.reason='刚刚的聊天里，有一件值得开心的小事。';}
      else if(/累|难过|烦/.test(message.content)){state.life.mood='安静';state.life.reason='刚聊到有些疲惫，想把节奏放慢，陪你待一会儿。';}
      else if(/为什么|好奇/.test(message.content)){state.life.mood='好奇';state.life.reason='刚才的话题让我想多了解一点。';}
      renderCharacter();
    }
    function renderSettings() { $('provider').value=state.settings.provider; $('base-url').value=state.settings.baseUrl; $('model-name').value=state.settings.model; }
    function openMemory(memory=null,content='',origin='手动记下') { editingMemory=memory?.id || null; sourceOrigin=memory?.origin || origin; $('memory-dialog-title').textContent=memory ? '修改这件小事' : '记下一件小事'; $('memory-category').value=memory?.category || 'other'; $('memory-content').value=memory?.content || content; $('memory-origin').textContent=`来源：${sourceOrigin}`; $('memory-dialog').showModal(); }
    $('add-memory').addEventListener('click',() => openMemory()); $('home-add-memory').addEventListener('click',() => {go('memory');openMemory();});
    $('memory-search').addEventListener('input',renderMemories);
    $('memory-form').addEventListener('submit',event => {event.preventDefault();const content=$('memory-content').value.trim();if (!content) {$('memory-content').setCustomValidity('写下一点内容再保存。');$('memory-content').reportValidity();return;} const record={id:editingMemory || makeId(),category:$('memory-category').value,content,origin:sourceOrigin,updated:new Date().toLocaleDateString('zh-CN')};if(editingMemory) state.memories=state.memories.map(m => m.id === editingMemory ? record : m);else state.memories.unshift(record);save();renderMemories();$('memory-dialog').close();toast('记住了，你也可以随时修改。');});
    $('memory-content').addEventListener('input',() => $('memory-content').setCustomValidity(''));
    function info(title,content,action=null,confirmLabel='知道了') { $('info-title').textContent=title;$('info-content').textContent=content;infoAction=action;$('info-cancel').hidden=!action;$('info-confirm').textContent=confirmLabel;$('info-dialog').showModal(); }
    $('info-cancel').addEventListener('click',() => $('info-dialog').close());$('info-confirm').addEventListener('click',() => {const action=infoAction;infoAction=null;$('info-dialog').close();action?.();});$('info-dialog').addEventListener('close',() => infoAction=null);
    $('open-diary').addEventListener('click',() => info('海边日记 · 示例','今天想把节奏放慢一点。\n\n看看天空，走一小段路，给自己留一点不必完成什么的时间。\n\n这是用于展示阅读体验的示例文字。正式版日记会依据真实聊天生成。'));
    $('settings-form').addEventListener('submit',event => {event.preventDefault();let url;try{url=new URL($('base-url').value);}catch{toast('请输入有效的 HTTPS 地址。');return;}if(url.protocol!=='https:' || url.username || url.password){toast('请使用不含账号或密码的 HTTPS 地址。');return;}const model=$('model-name').value.trim();if(!model){toast('请填写模型名称。');return;}state.settings={provider:$('provider').value,baseUrl:url.href.replace(/\/$/,''),model};save();toast('已保存演示配置；尚未连接模型服务。');});
    $('test-connection').addEventListener('click',() => info('连接测试 · 原型演示','此原型不会发送网络请求，也不会验证密钥。\n\n正式版会向所选服务发送一次少量输出的真实请求，可能产生少量费用。成功后才显示连接成功。'));
    function sendState(generating) { $('send-button').setAttribute('aria-label',generating?'取消演示回复':'发送演示消息');$('send-button').innerHTML=generating?'<span aria-hidden="true">■</span>':'<svg class="icon"><use href="#i-send"/></svg>';$('typing-indicator').textContent=generating?'正在输入中……':''; }
    function stopGeneration() {if(!pending)return;clearTimeout(pending.timer);const message=state.messages.find(m=>m.id===pending.id);if(message)message.status='stopped';pending=null;sendState(false);save();renderMessages();}
    $('chat-form').addEventListener('submit',event => {
      event.preventDefault();if(pending){stopGeneration();return;}const text=$('chat-input').value.trim();if(!text)return;
      const message={id:makeId(),role:'user',content:text,status:'complete'};state.messages.push(message);$('chat-input').value='';
      const reply={id:makeId(),role:'assistant',content:'',status:'waiting'};state.messages.push(reply);
      const update=nameUpdate(text);
      const prefix=state.profile.preferredName?`${state.profile.preferredName}，`:'';
      const response=update?.kind==='set'?`好，那以后就叫你${update.name}。我记住了。`:update?.kind==='clear'?'好，我不再使用之前的称呼。想让我怎么叫你，可以再告诉我。':text.includes('累')?`${prefix}那就先歇一会儿吧。不用急着把今天过得很完美。`:text.includes('记')?'可以点消息下方的「记住这件事」，由你决定把什么留在记忆里。':`${prefix}我听着呢。可以再和我说一点，今天让你印象最深的是什么？`;
      pending={id:reply.id,timer:null};sendState(true);save();renderMessages();
      pending.timer=setTimeout(()=>{
        if(!pending || pending.id!==reply.id)return;
        reply.content=`${response}\n\n（本地演示回复，未调用 AI。）`;reply.status='complete';pending=null;sendState(false);
        applyChatExperience(message,update);save();renderMessages();
      },1600);
    });
    $('chat-input').addEventListener('keydown',event => {if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();if(!pending)$('chat-form').requestSubmit();}});
    $('reset-demo').addEventListener('click',() => info('重置演示数据？','这会清除本浏览器中的演示聊天、记忆、从聊天了解的称呼、生活状态和配置，并恢复初始示例。',() => {stopGeneration();cancelSurf();state=seed();save();$('memory-search').value='';renderMessages();renderMemories();renderCharacter();renderSettings();toast('已恢复初始演示数据。');},'重置演示'));
    window.addEventListener('pagehide',() => {cancelSurf();if(pending){const message=state.messages.find(m=>m.id===pending.id);if(message)message.status='interrupted';clearTimeout(pending.timer);pending=null;sendState(false);save();}});
    window.addEventListener('pageshow',event => {if(event.persisted){renderMessages();renderCharacter();planSurf();}});
    renderMessages();renderMemories();renderCharacter();renderSettings();planSurf();
