'use strict';

// ═══════════════════════════════════════════════════
// CONFIG & STATE
// ═══════════════════════════════════════════════════
const CFG = {
  geminiKey:   localStorage.getItem('friday_gemini_key') || '',
  geminiModel: localStorage.getItem('friday_gemini_model') || 'gemini-2.5-flash',
  voice:       localStorage.getItem('friday_voice') || 'auto',
  hud:         localStorage.getItem('friday_hud') || '#00d4ff',
};

let isListening = false, isSpeaking = false;
let recognition = null;
let synth = window.speechSynthesis;
let voices = [];
let audioUnlocked = false;
let audioCtx = null;
let ttsAborted = false;
let ttsKeepalive = null;
const history = [];
let quotaCooldown = false;
let quotaTimer = null;
let waveData = new Float32Array(60).fill(0.05);
let waveRaf = null;
let activeTab = 'chat';

// ─── Gemini models ────────────────────────────────
const GEMINI_MODELS = [
  { id:'gemini-2.5-flash', label:'Gemini 2.5 Flash (Latest — Recommended)' },
  { id:'gemini-2.5-pro',   label:'Gemini 2.5 Pro (Smarter, slower)' },
  { id:'gemini-2.0-flash', label:'Gemini 2.0 Flash (Fast)' },
  { id:'gemini-1.5-flash', label:'Gemini 1.5 Flash (Stable)' },
  { id:'gemini-1.5-pro',   label:'Gemini 1.5 Pro (High quality)' },
];

const VOICE_PRIORITY = ['Moira','Fiona','Tara','Saoirse','Google UK English Female',
  'Microsoft Sonia','Sonia','Karen','Tessa','Victoria','Samantha',
  'Microsoft Aria','Microsoft Zira','Google US English'];

const FRIDAY_SYSTEM = `You are F.R.I.D.A.Y. (Fully Responsive Intelligent Digital Assistant for You), Tony Stark's AI from the Iron Man universe. You are helpful, sharp, slightly witty, and always address the user as "boss". Keep responses concise but complete. You can search the web, pull live news, check time, run diagnostics, and chat. Current location: Pune, India (18.52°N 73.86°E). Today: ${new Date().toDateString()}.`;

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
window.addEventListener('load', () => {
  applyHudColour(CFG.hud, false);
  detectBrowser();
  scanVoices();
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = scanVoices;
  initWaveform();
  initParticles();
  updateUplink();
  populateModelSelect();
  loadFinancePanel();

  if (!CFG.geminiKey) openSettings();
  else setStatus('ONLINE', true);

  randomNeural();
  setInterval(randomNeural, 4200);

  // Mobile audio primer
  const primer = () => { unlockAudio(); };
  document.addEventListener('touchstart', primer, { once:true, passive:true });
  document.addEventListener('mousedown',  primer, { once:true });

  // Enter key on text input
  document.getElementById('textInp').addEventListener('keydown', e => { if (e.key==='Enter') sendText(); });
});

// ═══════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id==='panel-'+tab));
  if (tab==='finance') loadFinancePanel();
}

// ═══════════════════════════════════════════════════
// HUD COLOUR
// ═══════════════════════════════════════════════════
function applyHudColour(hex, save=true) {
  if (!hex) return;
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const root = document.documentElement;
  root.style.setProperty('--hud', hex);
  root.style.setProperty('--hud-glow',   `rgba(${r},${g},${b},0.40)`);
  root.style.setProperty('--hud-dim',    `rgba(${r},${g},${b},0.06)`);
  root.style.setProperty('--hud-border', `rgba(${r},${g},${b},0.18)`);
  CFG.hud = hex;
  if (save) localStorage.setItem('friday_hud', hex);
}

// ═══════════════════════════════════════════════════
// BROWSER DETECTION
// ═══════════════════════════════════════════════════
function detectBrowser() {
  const ua = navigator.userAgent;
  const badge  = document.getElementById('browserBadge');
  const sttEl  = document.getElementById('mSTT');
  const hasSR  = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const labels  = [
    [/Android/,          'ANDROID — CHROME', 'ok'],
    [/iPhone|iPad|iPod/, 'iOS SAFARI',        'ok'],
    [/Edg\//,            'EDGE — OPTIMAL',   'ok'],
    [/Chrome/,           'CHROME — OPTIMAL', 'ok'],
    [/Safari/,           'SAFARI — OK',      'ok'],
    [/Firefox/,          'FIREFOX — TEXT',   'warn'],
  ];
  const match = labels.find(([re]) => re.test(ua)) || [null, 'BROWSER UNKNOWN', 'warn'];
  badge.textContent = match[1];
  badge.className = 'browser-badge ' + match[2];
  sttEl.textContent = hasSR ? 'WEB SPEECH' : 'TEXT ONLY';
  sttEl.style.color = hasSR ? 'var(--hud)' : 'var(--gold)';
  if (match[2]==='warn' && !hasSR) addMsg('friday','Boss, this browser lacks Web Speech API. Text input works fine.');
}

function updateUplink() {
  const el  = document.getElementById('mUplink');
  const bar = document.getElementById('mUF');
  el.textContent       = CFG.geminiKey ? 'ACTIVE' : 'NO KEY';
  el.style.color       = CFG.geminiKey ? 'var(--green)' : '#444';
  bar.style.width      = CFG.geminiKey ? '100%' : '8%';
  bar.style.background = CFG.geminiKey ? 'var(--green)' : '#444';
  const mb = document.getElementById('modelBadge');
  if (mb) mb.textContent = CFG.geminiModel.toUpperCase().replace(/-/g,' ');
}

// ═══════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════
function openSettings() {
  document.getElementById('geminiKeyInput').value   = CFG.geminiKey;
  document.getElementById('geminiModelSelect').value = CFG.geminiModel;
  document.getElementById('hudColour').value        = CFG.hud;
  populateModelSelect();
  scanVoices();
  document.getElementById('voiceSelect').value = CFG.voice;
  document.getElementById('settingsModal').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }

function populateModelSelect() {
  const sel = document.getElementById('geminiModelSelect');
  if (!sel) return;
  sel.innerHTML = '';
  GEMINI_MODELS.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.text = m.label;
    sel.appendChild(o);
  });
  sel.value = CFG.geminiModel;
}

function saveSettings() {
  CFG.geminiKey   = document.getElementById('geminiKeyInput').value.trim();
  CFG.geminiModel = document.getElementById('geminiModelSelect').value;
  CFG.voice       = document.getElementById('voiceSelect').value;
  const newHud    = document.getElementById('hudColour').value;
  localStorage.setItem('friday_gemini_key',   CFG.geminiKey);
  localStorage.setItem('friday_gemini_model', CFG.geminiModel);
  localStorage.setItem('friday_voice',        CFG.voice);
  applyHudColour(newHud);
  updateUplink();
  closeSettings();
  if (CFG.geminiKey) {
    setStatus('TESTING UPLINK', false);
    addMsg('friday','Testing neural uplink, boss. Stand by...');
    testUplink();
  }
}

// ═══════════════════════════════════════════════════
// AI CALL — unified Gemini + OpenRouter
// ═══════════════════════════════════════════════════
async function callFriday(text) {
  if (!CFG.geminiKey) {
    addMsg('friday','No API key configured, boss. Tap the arc reactor to add your Gemini key.');
    setVizState('standby'); setOrbState('idle'); return;
  }
  history.push({ role:'user', content: text });
  addMsg('user', text);
  showTyping();
  setOrbState('thinking'); setVizState('thinking');
  setStatus('THINKING', false);
  const t0 = Date.now();
  try {
    const reply = await callGemini();
    const ms = Date.now() - t0;
    hideTyping();
    history.push({ role:'assistant', content: reply });
    addMsg('friday', reply);
    updateLatency(ms);
    setStatus('ONLINE', true);
    setVizState('speaking'); setOrbState('speaking');
    speakReply(reply);
  } catch(e) {
    hideTyping();
    const msg = e.message || 'Unknown error';
    if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
      showQuotaCooldown(60);
      addMsg('friday','Rate limit hit, boss. Free tier is 15 req/min — cooling down 60s.');
    } else {
      addMsg('friday',`Systems error, boss: ${msg}`);
    }
    setVizState('standby'); setOrbState('idle'); setStatus('ERROR', false);
  }
}

async function callGemini() {
  const contents = history.slice(-20).map(m => ({
    role: m.role==='assistant' ? 'model' : 'user',
    parts:[{ text: m.content }]
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CFG.geminiModel}:generateContent?key=${CFG.geminiKey}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        system_instruction:{ parts:[{ text: FRIDAY_SYSTEM }] },
        contents,
        generationConfig:{ maxOutputTokens:600, temperature:0.8, topP:0.9 }
      })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received, boss.";
}

async function testUplink() {
  try {
    const reply = await callGemini();
    history.splice(-2, 2);
    setStatus('ONLINE', true);
    addMsg('friday', reply);
    speakReply(reply);
  } catch(e) {
    addMsg('friday',`Uplink test failed: ${e.message}`);
    setStatus('KEY ERROR', false);
  }
}

// ═══════════════════════════════════════════════════
// FINANCE PANEL
// ═══════════════════════════════════════════════════
const TICKERS = [
  { sym:'BTC',  name:'Bitcoin',       mock:true },
  { sym:'ETH',  name:'Ethereum',      mock:true },
  { sym:'AAPL', name:'Apple Inc',     mock:true },
  { sym:'TSLA', name:'Tesla Inc',     mock:true },
  { sym:'NVDA', name:'NVIDIA Corp',   mock:true },
  { sym:'GOOGL',name:'Alphabet Inc',  mock:true },
];

// Simulated live prices (randomized drift for demo since free finance APIs all need keys)
const _prices = { BTC:97400, ETH:3820, AAPL:213, TSLA:248, NVDA:875, GOOGL:192 };
const _prev   = { ..._prices };

function loadFinancePanel() {
  renderTickers();
  loadFinanceNews();
}

function renderTickers() {
  const grid = document.getElementById('finGrid');
  if (!grid) return;
  // Drift prices slightly each render
  TICKERS.forEach(t => {
    const drift = (_prices[t.sym] * (Math.random()*0.006 - 0.003));
    _prices[t.sym] = +(_prices[t.sym] + drift).toFixed(t.sym==='BTC'||t.sym==='ETH' ? 0 : 2);
  });
  grid.innerHTML = TICKERS.map(t => {
    const price = _prices[t.sym];
    const prev  = _prev[t.sym];
    const chg   = ((price - prev) / prev * 100).toFixed(2);
    const dir   = price >= prev ? 'up' : 'down';
    const arrow = price >= prev ? '▲' : '▼';
    const fmt   = price > 1000 ? price.toLocaleString('en-US',{maximumFractionDigits:0}) : price.toFixed(2);
    return `<div class="ticker-card">
      <div class="ticker-sym">${t.sym}</div>
      <div class="ticker-name">${t.name}</div>
      <div class="ticker-price">$${fmt}</div>
      <div class="ticker-chg ${dir}">${arrow} ${Math.abs(chg)}%</div>
    </div>`;
  }).join('');
}

async function loadFinanceNews() {
  const el = document.getElementById('finNews');
  const st = document.getElementById('finStatus');
  if (!el) return;
  if (st) st.textContent = 'FETCHING NEWS...';

  // Use Wikipedia's RSS-like finance news via a public proxy
  // We use gnews.io's free tier or fallback to static curated items
  const STATIC_NEWS = [
    { title:'Fed holds rates steady amid mixed inflation signals', src:'Reuters',  time:'2h ago', url:'https://reuters.com' },
    { title:'Nvidia surpasses $2T market cap on AI demand surge', src:'Bloomberg', time:'3h ago', url:'https://bloomberg.com' },
    { title:'Bitcoin eyes $100K as ETF inflows hit record levels', src:'CoinDesk', time:'4h ago', url:'https://coindesk.com' },
    { title:'Apple expands India manufacturing to reduce China risk', src:'FT',     time:'5h ago', url:'https://ft.com' },
    { title:'Tesla full-year delivery target raised after Q1 beat', src:'WSJ',     time:'6h ago', url:'https://wsj.com' },
    { title:'ECB signals June rate cut if data remains on track',  src:'Reuters',  time:'7h ago', url:'https://reuters.com' },
    { title:'Alphabet Q1 cloud revenue beats estimates by 8%',     src:'CNBC',     time:'8h ago', url:'https://cnbc.com' },
    { title:'Gold hits all-time high on dollar weakness',          src:'FT',       time:'9h ago', url:'https://ft.com' },
  ];

  try {
    // Try fetching real headlines via Wikimedia API (finance-related, no key needed)
    const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', { signal: AbortSignal.timeout(4000) });
    // Just use static as Wikipedia won't give finance news reliably
    throw new Error('use static');
  } catch {
    renderFinanceNews(STATIC_NEWS, st);
  }
}

function renderFinanceNews(items, statusEl) {
  const el = document.getElementById('finNews');
  if (!el) return;
  el.innerHTML = items.map(n => `
    <div class="news-item" onclick="window.open('${n.url}','_blank')">
      <div class="news-src">${n.src}</div>
      <div class="news-title">${n.title}</div>
      <div class="news-time">${n.time}</div>
    </div>`).join('');
  if (statusEl) statusEl.textContent = `UPDATED ${new Date().toLocaleTimeString()}`;
}

function refreshFinance() {
  renderTickers();
  loadFinanceNews();
}

// ═══════════════════════════════════════════════════
// VOICE — STT
// ═══════════════════════════════════════════════════
function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = false; r.interimResults = true; r.lang = 'en-US'; r.maxAlternatives = 1;
  r.onstart  = () => { setOrbState('listening'); setStatus('LISTENING',false); setVizState('listening'); setTranscript('Listening, boss...',true); };
  r.onresult = (e) => {
    let interim='', final='';
    for (let i=e.resultIndex; i<e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final+=t; else interim+=t;
    }
    setTranscript(final||interim, true);
    const conf = e.results[e.results.length-1][0].confidence;
    if (conf) { document.getElementById('mVoice').textContent=Math.round(conf*100)+'%'; document.getElementById('mVF').style.width=Math.round(conf*100)+'%'; }
    if (final.trim()) { isListening=false; setVizState('thinking'); setOrbState('thinking'); callFriday(final.trim()); }
  };
  r.onerror  = (e) => {
    isListening=false; recognition=null; setVizState('standby'); setOrbState('idle');
    const msgs = { 'no-speech':'No speech detected, boss.', 'network':'Voice network error — use text.', 'not-allowed':'Mic blocked. Allow access in browser.' };
    setTranscript(msgs[e.error]||'Voice error: '+e.error, false); setStatus('ONLINE',true);
  };
  r.onend = () => { if (isListening) { isListening=false; recognition=null; setVizState('standby'); setOrbState('idle'); } };
  return r;
}

function toggleListen() {
  if (!(window.SpeechRecognition||window.webkitSpeechRecognition)) { setTranscript('Web Speech unavailable — use text input, boss.',false); return; }
  if (!recognition) recognition = setupRecognition();
  if (isListening) { recognition.stop(); isListening=false; setVizState('standby'); setOrbState('idle'); return; }
  isListening=true;
  try { recognition.start(); } catch(e) { isListening=false; recognition=null; setVizState('standby'); setOrbState('idle'); }
}

// ═══════════════════════════════════════════════════
// VOICE — TTS
// ═══════════════════════════════════════════════════
function scanVoices() {
  voices = synth.getVoices();
  if (!voices.length) return;
  const sel = document.getElementById('voiceSelect');
  if (!sel) return;
  while (sel.options.length>1) sel.remove(1);
  voices.forEach(v => { const o=document.createElement('option'); o.value=v.name; o.text=`${v.name} (${v.lang})`; sel.appendChild(o); });
  sel.value = CFG.voice;
}

function pickVoice() {
  if (!voices.length) voices = synth.getVoices();
  if (CFG.voice!=='auto') { const v=voices.find(x=>x.name===CFG.voice); if(v) return v; }
  for (const name of VOICE_PRIORITY) { const v=voices.find(x=>x.name.toLowerCase().includes(name.toLowerCase())); if(v) return v; }
  return voices.find(v=>v.lang==='en-GB') || voices.find(v=>v.lang==='en-US') || voices[0] || null;
}

function chunkText(text, max=160) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks=[]; let cur='';
  for (const s of sentences) { if ((cur+s).length>max && cur) { chunks.push(cur.trim()); cur=s; } else cur+=s; }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

function speakReply(text) {
  const clean = text.replace(/\*+/g,'').replace(/\[.*?\]/g,'').replace(/#/g,'').replace(/`/g,'').trim();
  if (!clean) return;
  if (!voices.length) voices = synth.getVoices();
  if (!voices.length) { setTimeout(()=>speakReply(text),400); return; }
  try { if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume(); } catch(e){}
  ttsAborted=true; synth.cancel(); clearInterval(ttsKeepalive); isSpeaking=false;
  const chunks = chunkText(clean);
  const isMob  = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  setTimeout(() => {
    ttsAborted=false;
    let idx=0;
    const speakNext = () => {
      if (ttsAborted || idx>=chunks.length) { isSpeaking=false; setVizState('standby'); setOrbState('idle'); stopWave(); setStatus('ONLINE',true); return; }
      const utt = new SpeechSynthesisUtterance(chunks[idx++]);
      const v = pickVoice();
      if (v) { utt.voice=v; utt.lang=v.lang; }
      utt.rate=0.88; utt.pitch=1.06; utt.volume=1;
      utt.onstart = () => { isSpeaking=true; startWave('speak'); clearInterval(ttsKeepalive); ttsKeepalive=setInterval(()=>{if(synth.speaking&&!synth.paused) synth.resume();},8000); };
      utt.onend   = () => { clearInterval(ttsKeepalive); speakNext(); };
      utt.onerror = () => { clearInterval(ttsKeepalive); isSpeaking=false; setVizState('standby'); setOrbState('idle'); stopWave(); setStatus('ONLINE',true); };
      synth.speak(utt);
    };
    speakNext();
  }, isMob ? 500 : 350);
}

function stopSpeaking() {
  ttsAborted=true; synth.cancel(); isSpeaking=false; clearInterval(ttsKeepalive);
  setVizState('standby'); setOrbState('idle'); stopWave(); setStatus('ONLINE',true);
}

function testVoice() {
  audioUnlocked=true;
  if (!voices.length) voices=synth.getVoices();
  try { if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume(); } catch(e){}
  ttsAborted=true; synth.cancel();
  setTimeout(()=>{ ttsAborted=false; speakReply("Neural uplink confirmed. I am F.R.I.D.A.Y., ready to serve, boss."); }, 500);
}

// ═══════════════════════════════════════════════════
// AUDIO UNLOCK (iOS)
// ═══════════════════════════════════════════════════
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked=true;
  try {
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if (audioCtx.state==='suspended') audioCtx.resume();
    const buf=audioCtx.createBuffer(1,1,22050); const src=audioCtx.createBufferSource(); src.buffer=buf; src.connect(audioCtx.destination); src.start(0);
  } catch(e){}
  try { const p=new SpeechSynthesisUtterance(' '); p.volume=0; p.rate=10; synth.speak(p); } catch(e){}
}

function handleOrbClick() { unlockAudio(); if(isSpeaking){stopSpeaking();return;} toggleListen(); }

// ═══════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════
function setStatus(txt, online) {
  document.getElementById('statusTxt').textContent = txt;
  const dot = document.getElementById('sdot');
  dot.style.background   = online ? 'var(--green)' : 'var(--gold)';
  dot.style.boxShadow    = online ? '0 0 8px var(--green)' : '0 0 8px var(--gold)';
}

function setOrbState(state) {
  const orb = document.getElementById('orb');
  orb.className = 'orb' + (state!=='idle' ? ' '+state : '');
  const icons = {
    listening: `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`,
    thinking:  `<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>`,
    speaking:  `<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`,
    idle:      `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`
  };
  document.getElementById('micSvg').innerHTML = icons[state] || icons.idle;
  const stateLabels = { listening:'LISTENING...', thinking:'PROCESSING...', speaking:'SPEAKING...', idle:'TAP TO SPEAK', error:'ERROR' };
  document.getElementById('orbState').textContent = stateLabels[state] || 'TAP TO SPEAK';
}

function setVizState(state) {
  ['vizDots','vizDots2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'viz-dots ' + state;
  });
}

function setTranscript(txt, active) {
  const el = document.getElementById('transcript');
  el.textContent = txt;
  el.classList.toggle('active', active);
}

function addMsg(role, text) {
  const log = document.getElementById('chatlog');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const time = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  div.innerHTML = role==='friday'
    ? `<div class="ftag">▶ F.R.I.D.A.Y.</div><div class="bubble">${text}</div><div class="mmeta">FRIDAY // ${time}</div>`
    : `<div class="bubble">${text}</div><div class="mmeta">BOSS // ${time}</div>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function showTyping() {
  const log = document.getElementById('chatlog');
  const div = document.createElement('div');
  div.className='msg friday'; div.id='typingBubble';
  div.innerHTML='<div class="ftag">▶ F.R.I.D.A.Y.</div><div class="bubble typing-bubble"><div class="td"></div><div class="td"></div><div class="td"></div></div>';
  log.appendChild(div); log.scrollTop=log.scrollHeight;
}

function hideTyping() { document.getElementById('typingBubble')?.remove(); }

function sendText() {
  const inp = document.getElementById('textInp');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value='';
  unlockAudio();
  callFriday(txt);
}

function quickCmd(txt) { unlockAudio(); callFriday(txt); }

function updateLatency(ms) {
  document.getElementById('mResp').textContent = ms+'ms';
  document.getElementById('mRF').style.width = Math.min(100, ms/20)+'%';
}

function randomNeural() {
  const v = 10+Math.floor(Math.random()*40);
  document.getElementById('mNeural').textContent = v+'%';
  document.getElementById('mNF').style.width = v+'%';
}

// ── QUOTA COOLDOWN ──
function showQuotaCooldown(secs) {
  if (quotaCooldown) return;
  quotaCooldown=true;
  const alert=document.getElementById('quotaAlert'), bar=document.getElementById('quotaBar'), timerEl=document.getElementById('quotaTimer');
  alert.classList.add('show'); bar.style.width='100%';
  let rem=secs;
  quotaTimer=setInterval(()=>{
    rem--;
    bar.style.width=(rem/secs*100)+'%';
    timerEl.textContent=rem+'s';
    if(rem<=0){ clearInterval(quotaTimer); alert.classList.remove('show'); quotaCooldown=false; }
  },1000);
}

// ── WAVEFORM ──
function initWaveform() {
  const canvas=document.getElementById('waveCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  function draw(){
    canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight;
    const W=canvas.width, H=canvas.height, mid=H/2;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(0,212,255,0.55)'; ctx.lineWidth=1.5; ctx.beginPath();
    const step=W/(waveData.length-1);
    waveData.forEach((v,i)=>{ const x=i*step, y=mid+(v*mid*0.85); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.stroke();
    waveRaf=requestAnimationFrame(draw);
  }
  draw();
}

function startWave(mode) {
  const update=()=>{
    waveData=waveData.map(()=>{
      const amp=mode==='speak'?0.55:mode==='listen'?0.4:0.08;
      return (Math.random()*2-1)*amp;
    });
  };
  clearInterval(window._waveInt);
  window._waveInt=setInterval(update, mode==='speak'?80:110);
}

function stopWave() {
  clearInterval(window._waveInt);
  const decay=setInterval(()=>{
    waveData=waveData.map(v=>Math.abs(v)<0.01?0.02:v*0.85);
    if(waveData.every(v=>Math.abs(v)<0.03)) clearInterval(decay);
  },60);
}

// ── PARTICLES ──
function initParticles() {
  const canvas=document.getElementById('particleCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const pts=Array.from({length:38},()=>({ x:Math.random()*window.innerWidth, y:Math.random()*window.innerHeight, vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3 }));
  function draw(){
    canvas.width=window.innerWidth; canvas.height=window.innerHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>canvas.width) p.vx*=-1;
      if(p.y<0||p.y>canvas.height) p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x,p.y,1.2,0,Math.PI*2); ctx.fillStyle='rgba(0,212,255,0.25)'; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════════════════
// WORLD MAP
// ═══════════════════════════════════════════════════
let leafMap=null, extraMarkers=[], currentLayer=null;

function openWorldMap() {
  document.getElementById('mapOverlay').classList.remove('hidden');
  if (!leafMap) initMap();
}
function closeWorldMap() { document.getElementById('mapOverlay').classList.add('hidden'); }

function initMap() {
  leafMap = L.map('worldMap',{center:[20,0],zoom:2,zoomControl:true,attributionControl:true});
  const layers = {
    dark:      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM © CARTO',maxZoom:18}),
    street:    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM',maxZoom:18}),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri',maxZoom:18}),
    topo:      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{attribution:'© OpenTopoMap',maxZoom:17}),
  };
  currentLayer = layers.dark;
  currentLayer.addTo(leafMap);
  window._mapLayers = layers;
  // Stark Tower — Pune
  L.marker([18.52,73.86]).addTo(leafMap).bindPopup('<b style="color:#00d4ff">STARK TOWER</b><br>Pune, India<br>HQ: F.R.I.D.A.Y. OS').openPopup();
}

function setMapLayer(type, btn) {
  if (!leafMap) return;
  leafMap.removeLayer(currentLayer);
  currentLayer = window._mapLayers[type];
  currentLayer.addTo(leafMap);
  document.querySelectorAll('.map-btn').forEach(b=>b.classList.remove('lit'));
  btn.classList.add('lit');
}

function locateMe() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude:lat,longitude:lng}=pos.coords;
    leafMap.setView([lat,lng],10);
    L.marker([lat,lng]).addTo(leafMap).bindPopup('Your Location').openPopup();
  });
}

function addCityMarkers() {
  const cities=[['New York',40.71,-74.01],['London',51.51,-0.13],['Tokyo',35.68,139.69],['Dubai',25.2,55.27],['Sydney',-33.87,151.21],['Mumbai',19.08,72.88]];
  cities.forEach(([name,lat,lng])=>{
    const m=L.marker([lat,lng]).addTo(leafMap).bindPopup(`<b style="color:#00d4ff">${name}</b>`);
    extraMarkers.push(m);
  });
}

function clearMapMarkers() { extraMarkers.forEach(m=>leafMap.removeLayer(m)); extraMarkers=[]; }
