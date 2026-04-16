'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseCSV(raw) {
  const lines = raw.replace(/\r/g, '').replace(/^\uFEFF/, '').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map((line, i) => {
    const vals = line.split(',');
    const obj = { _id: i };
    headers.forEach((h, j) => { obj[h] = (vals[j] || '').trim(); });
    return obj;
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Progress ─────────────────────────────────────────────────────────────────
function loadProgress(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function saveProgress(key, p) { localStorage.setItem(key, JSON.stringify(p)); }

// ─── Weighting & sampling ─────────────────────────────────────────────────────
function itemWeight(v) {
  const a = v._attempts, c = v._correct;
  return a === 0 ? 1.1 : (1.0 - c / a) + 0.1;
}

function weightedSample(items, k) {
  const pool = items.map(v => ({ w: itemWeight(v), v }));
  const result = [];
  for (let i = 0; i < Math.min(k, pool.length); i++) {
    const total = pool.reduce((s, r) => s + r.w, 0);
    let r = Math.random() * total;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].w;
      if (r <= 0) { result.push(pool[j].v); pool.splice(j, 1); break; }
    }
  }
  return result;
}

// ─── Answer checking ──────────────────────────────────────────────────────────
function isDash(s) { return /^[\u002D\u2013\u2014]$/.test(s.trim()); }
function norm(s) { return s.trim().toLowerCase().replace(/\s+/g, ' '); }
function checkAnswer(input, accepted) {
  return accepted.split('|').map(norm).filter(Boolean).includes(norm(input));
}

// ─── Multiple choice option generation ───────────────────────────────────────
function generateOptions(correctDisplay, pool, getDisplay, currentId) {
  const wrong = [];
  const candidates = shuffle(pool.filter(item => item._id !== currentId));
  for (const item of candidates) {
    if (wrong.length >= 3) break;
    const d = getDisplay(item);
    if (d && !isDash(d) && norm(d) !== norm(correctDisplay) &&
        !wrong.some(w => norm(w) === norm(d))) {
      wrong.push(d);
    }
  }
  while (wrong.length < 3) wrong.push('?');
  return shuffle([correctDisplay, ...wrong]);
}

// ─── Verb question generators ─────────────────────────────────────────────────
const CONJ_FORMS = ['Imperativ', 'Presens', 'Preteritum', 'Supinum'];

function primaryForm(verb) {
  const inf = verb['Infinitiv'];
  return (!inf || isDash(inf)) ? verb['Presens'] : inf;
}

function qSvEn(verb) {
  return {
    label: 'Swedish \u2192 English',
    question: `What does "${primaryForm(verb)}" mean in English?`,
    word: primaryForm(verb),
    accepted: verb['Acceptable answers'],
    display: verb['Engelsk \u00f6vers\u00e4ttning'],
    getDisplay: v => v['Engelsk \u00f6vers\u00e4ttning'],
  };
}

function qEnSv(verb) {
  const answer = primaryForm(verb);
  return {
    label: 'English \u2192 Swedish',
    question: `Swedish infinitive for: ${verb['Engelsk \u00f6vers\u00e4ttning']}`,
    word: verb['Engelsk \u00f6vers\u00e4ttning'],
    accepted: answer,
    display: answer,
    getDisplay: v => primaryForm(v),
  };
}

function qConjugate(verb) {
  const valid = CONJ_FORMS.filter(f => verb[f] && !isDash(verb[f]));
  const form = valid.length ? valid[Math.floor(Math.random() * valid.length)] : 'Presens';
  return {
    label: 'Conjugation',
    question: `"${primaryForm(verb)}" (${verb['Engelsk \u00f6vers\u00e4ttning']}) \u2014 give the ${form}`,
    word: primaryForm(verb),
    accepted: verb[form],
    display: verb[form],
    getDisplay: v => (v[form] && !isDash(v[form])) ? v[form] : null,
  };
}

const VERB_FNS = { 'sv-en': qSvEn, 'en-sv': qEnSv, 'conjugate': qConjugate };

// ─── Vocab question generators ────────────────────────────────────────────────
function qVocabSvEn(word) {
  return {
    label: 'Swedish \u2192 English',
    question: `What does "${word.Swedish}" mean in English?`,
    word: word.Swedish,
    accepted: word.English,
    display: word.English,
    getDisplay: w => w.English,
  };
}

function qVocabEnSv(word) {
  return {
    label: 'English \u2192 Swedish',
    question: `Swedish word for: ${word.English}`,
    word: word.English,
    accepted: word.Swedish,
    display: word.Swedish,
    getDisplay: w => w.Swedish,
  };
}

const VOCAB_FNS = { 'sv-en': qVocabSvEn, 'en-sv': qVocabEnSv };

// ─── App state ────────────────────────────────────────────────────────────────
let allVerbs = [], allVocab = [], allCategories = [];
let verbProgress = {}, vocabProgress = {};
let numQ = 10;
let multipleChoice = false;
let selectedCategories = new Set();
let lastMode = 'sv-en', lastVocabMode = 'sv-en', lastSessionType = 'verbs';
let session = null;

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

function changeNumQ(delta) {
  numQ = Math.max(5, Math.min(50, numQ + delta));
  document.querySelectorAll('.num-q-display').forEach(el => el.textContent = numQ);
}

function setMultipleChoice(val) {
  multipleChoice = val;
  document.querySelectorAll('.toggle-type').forEach(el => el.classList.toggle('active', !val));
  document.querySelectorAll('.toggle-mc').forEach(el => el.classList.toggle('active', val));
}

function getFilteredVocab() {
  if (selectedCategories.size === 0) return allVocab;
  return allVocab.filter(w => selectedCategories.has(w['Category']));
}

function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  const noneSelected = selectedCategories.size === 0;
  let html = `<button class="chip ${noneSelected ? 'active' : ''}" data-cat="__all__">All</button>`;
  html += allCategories.map(cat => {
    const active = selectedCategories.has(cat);
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `<button class="chip ${active ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
  }).join('');
  container.innerHTML = html;
}

function updateVerbStats() {
  const seen = allVerbs.filter(v => v._attempts > 0).length;
  const totalA = allVerbs.reduce((s, v) => s + v._attempts, 0);
  const totalC = allVerbs.reduce((s, v) => s + v._correct, 0);
  const pct = totalA > 0 ? Math.round(totalC / totalA * 100) : 0;
  document.getElementById('menu-stats').textContent =
    `${seen}/${allVerbs.length} verbs seen \u00b7 ${pct}% accuracy`;
}

function updateVocabStats() {
  const filtered = getFilteredVocab();
  const seen = filtered.filter(v => v._attempts > 0).length;
  const totalA = filtered.reduce((s, v) => s + v._attempts, 0);
  const totalC = filtered.reduce((s, v) => s + v._correct, 0);
  const pct = totalA > 0 ? Math.round(totalC / totalA * 100) : 0;
  const suffix = selectedCategories.size > 0 ? ` (${filtered.length} filtered)` : '';
  document.getElementById('vocab-stats').textContent =
    `${seen}/${filtered.length} words seen \u00b7 ${pct}% accuracy${suffix}`;
}

// ─── Session ──────────────────────────────────────────────────────────────────
function startSession(mode) {
  lastMode = mode;
  lastSessionType = 'verbs';
  session = {
    questions: weightedSample(allVerbs, numQ),
    pool: allVerbs,
    index: 0, score: 0, missed: [],
    questionFn: VERB_FNS[mode],
    progressKey: 'svVerbProgress',
    progressMap: verbProgress,
    answered: false,
  };
  showScreen('quiz');
  renderQuestion();
}

function startVocabSession(mode) {
  lastVocabMode = mode;
  lastSessionType = 'vocab';
  const filtered = getFilteredVocab();
  session = {
    questions: weightedSample(filtered, numQ),
    pool: filtered,
    index: 0, score: 0, missed: [],
    questionFn: VOCAB_FNS[mode],
    progressKey: 'svVocabProgress',
    progressMap: vocabProgress,
    answered: false,
  };
  showScreen('quiz');
  renderQuestion();
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────
function renderQuestion() {
  const item = session.questions[session.index];
  const q = session.questionFn(item);
  const total = session.questions.length;

  document.getElementById('mode-label').textContent = q.label;
  document.getElementById('question-text').textContent = q.question;
  document.getElementById('progress-text').textContent = `Question ${session.index + 1}/${total}`;
  document.getElementById('progress-fill').style.width = `${(session.index / total) * 100}%`;
  document.getElementById('feedback').className = 'feedback';
  document.getElementById('feedback').textContent = '';

  session._q = q;
  session.answered = false;

  const input = document.getElementById('answer-input');
  const mcDiv = document.getElementById('mc-options');
  const submitBtn = document.getElementById('submit-btn');

  if (multipleChoice) {
    input.style.display = 'none';
    mcDiv.style.display = 'grid';
    submitBtn.style.display = 'none';
    const options = generateOptions(q.display, session.pool, q.getDisplay, item._id);
    mcDiv.innerHTML = options.map(opt =>
      `<button class="mc-btn" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
    ).join('');
  } else {
    input.style.display = '';
    input.value = '';
    input.className = 'answer-input';
    input.disabled = false;
    input.focus();
    mcDiv.style.display = 'none';
    submitBtn.style.display = '';
    submitBtn.textContent = 'Check';
  }
}

function advance() {
  session.index++;
  session.index >= session.questions.length ? showScore() : renderQuestion();
}

function recordAnswer(item, correct, display, word) {
  item._attempts++;
  if (correct) { item._correct++; session.score++; }
  else { session.missed.push({ word, answer: display }); }
  session.progressMap[item._id] = { attempts: item._attempts, correct: item._correct };
  saveProgress(session.progressKey, session.progressMap);
}

function selectOption(value, btn) {
  if (session.answered) return;
  const item = session.questions[session.index];
  const { accepted, display, word } = session._q;
  const correct = norm(value) === norm(display);

  recordAnswer(item, correct, display, word);

  document.querySelectorAll('.mc-btn').forEach(b => {
    b.disabled = true;
    if (norm(b.dataset.value) === norm(display)) b.classList.add('correct');
    else if (b === btn && !correct) b.classList.add('wrong');
  });

  const isLast = session.index === session.questions.length - 1;
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.style.display = '';
  submitBtn.textContent = isLast ? 'See Score' : 'Next \u2192';
  session.answered = true;
}

function submitAnswer() {
  if (session.answered) { advance(); return; }

  const input = document.getElementById('answer-input');
  const userAnswer = input.value.trim();
  if (!userAnswer) return;

  const item = session.questions[session.index];
  const { accepted, display, word } = session._q;
  const correct = checkAnswer(userAnswer, accepted);

  recordAnswer(item, correct, display, word);

  input.disabled = true;
  input.className = 'answer-input ' + (correct ? 'correct' : 'wrong');

  const fb = document.getElementById('feedback');
  fb.className = 'feedback ' + (correct ? 'correct' : 'wrong') + ' show';
  fb.textContent = correct ? '\u2713 Correct!' : `\u2717 Correct answer: ${display}`;

  const isLast = session.index === session.questions.length - 1;
  document.getElementById('submit-btn').textContent = isLast ? 'See Score' : 'Next \u2192';
  session.answered = true;
}

// ─── Score ────────────────────────────────────────────────────────────────────
function showScore() {
  const { score, questions, missed } = session;
  const total = questions.length;
  const pct = Math.round(score / total * 100);
  const msg = pct >= 80 ? 'Bra jobbat!' : pct >= 50 ? 'Forts\u00e4tt \u00f6va!' : '\u00d6va mer!';

  document.getElementById('score-fraction').textContent = `${score}/${total}`;
  document.getElementById('score-pct').textContent = `${pct}% \u2014 ${msg}`;

  const missedSection = document.getElementById('missed-section');
  const missedList = document.getElementById('missed-list');
  if (missed.length > 0) {
    missedSection.style.display = 'block';
    missedList.innerHTML = missed.map(m =>
      `<div class="missed-item">
        <span class="missed-word">${escapeHtml(m.word)}</span>
        <span class="missed-arrow">\u2192</span>
        <span class="missed-answer">${escapeHtml(m.answer)}</span>
      </div>`
    ).join('');
  } else {
    missedSection.style.display = 'none';
  }

  updateVerbStats();
  updateVocabStats();
  showScreen('score');
}

function playAgain() {
  lastSessionType === 'vocab' ? startVocabSession(lastVocabMode) : startSession(lastMode);
}

function backToMenu() {
  showScreen(lastSessionType === 'vocab' ? 'vocab' : 'menu');
}

// ─── Resources ────────────────────────────────────────────────────────────────
const RESOURCES = [
  {
    icon: '🎙️',
    title: 'Svenska med Oskar',
    desc: 'Podcast in easy Swedish — great for beginners and intermediate learners',
    url: 'https://creators.spotify.com/pod/profile/lattsvenskamedoskar/',
  },
  {
    icon: '📺',
    title: 'SVT Nyheter på lätt svenska',
    desc: 'Daily Swedish news written and read in simple language',
    url: 'https://www.svtplay.se/nyheter-pa-latt-svenska',
  },
];

(function renderResources() {
  const list = document.getElementById('resources-list');
  if (!list) return;
  list.innerHTML = RESOURCES.map(r => `
    <a class="resource-card" href="${r.url}" target="_blank" rel="noopener noreferrer">
      <div class="resource-icon">${r.icon}</div>
      <div class="resource-info">
        <div class="resource-title">${escapeHtml(r.title)}</div>
        <div class="resource-desc">${escapeHtml(r.desc)}</div>
      </div>
      <div class="resource-arrow">&#x2192;</div>
    </a>
  `).join('');
})();

// ─── Grammar ──────────────────────────────────────────────────────────────────
let grammarLoaded = false;

async function showGrammar() {
  showScreen('grammar');
  if (grammarLoaded) return;
  try {
    const html = await fetch('./grammar.html').then(r => r.text());
    const body = document.getElementById('grammar-body');
    body.innerHTML = html;
    postProcessGrammar(body);
    grammarLoaded = true;
  } catch {
    document.getElementById('grammar-body').innerHTML =
      '<p style="color:var(--sub);padding:2rem 0;text-align:center">Could not load grammar notes.</p>';
  }
}

function postProcessGrammar(root) {
  // 1. Wrap every <table> in a scrollable div
  root.querySelectorAll('table').forEach(t => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });

  // 2. Mark rule paragraphs (contain ✓ or ✗) and [to do] paragraphs
  root.querySelectorAll('p').forEach(p => {
    const text = p.textContent;
    if (text.includes('[to do]')) p.classList.add('grammar-todo');
    else if (text.includes('✓') || text.includes('✗') || text.includes('→')) {
      p.classList.add('grammar-rule');
    }
  });

  // 3. Build jump nav from h2 headings and prepend it
  const headings = root.querySelectorAll('h2');
  if (headings.length) {
    const nav = document.createElement('nav');
    nav.className = 'grammar-nav';
    headings.forEach(h => {
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = h.textContent;
      a.addEventListener('click', e => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(a);
    });
    root.prepend(nav);
  }
}

// ─── Browse ───────────────────────────────────────────────────────────────────
let browseType = 'vocab';
let browseCategories = new Set();

function showBrowse() {
  browseType = 'vocab';
  browseCategories.clear();
  document.getElementById('browse-search').value = '';
  document.querySelectorAll('.browse-vocab-btn').forEach(el => el.classList.add('active'));
  document.querySelectorAll('.browse-verbs-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('browse-chips').style.display = '';
  renderBrowseCategories();
  renderBrowseList();
  showScreen('browse');
}

function setBrowseType(type) {
  browseType = type;
  browseCategories.clear();
  document.getElementById('browse-search').value = '';
  document.querySelectorAll('.browse-vocab-btn').forEach(el => el.classList.toggle('active', type === 'vocab'));
  document.querySelectorAll('.browse-verbs-btn').forEach(el => el.classList.toggle('active', type === 'verbs'));
  document.getElementById('browse-chips').style.display = type === 'vocab' ? '' : 'none';
  renderBrowseCategories();
  renderBrowseList();
}

function renderBrowseCategories() {
  const container = document.getElementById('browse-chips');
  const noneSelected = browseCategories.size === 0;
  let html = `<button class="chip ${noneSelected ? 'active' : ''}" data-bcat="__all__">All</button>`;
  html += allCategories.map(cat => {
    const active = browseCategories.has(cat);
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `<button class="chip ${active ? 'active' : ''}" data-bcat="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
  }).join('');
  container.innerHTML = html;
}

function renderBrowseList() {
  const query = norm(document.getElementById('browse-search').value);
  let html = '';

  if (browseType === 'vocab') {
    let pool = browseCategories.size > 0
      ? allVocab.filter(w => browseCategories.has(w['Category']))
      : allVocab;
    if (query) pool = pool.filter(w =>
      norm(w.Swedish).includes(query) || norm(w.English).includes(query)
    );
    pool = [...pool].sort((a, b) => a.Swedish.localeCompare(b.Swedish, 'sv'));
    document.getElementById('browse-count').textContent = `${pool.length} word${pool.length !== 1 ? 's' : ''}`;
    html = pool.map(w =>
      `<div class="browse-item">
        <div class="browse-item-row">
          <span class="browse-sv">${escapeHtml(w.Swedish)}</span>
          <span class="browse-en">${escapeHtml(w.English)}</span>
          <span class="browse-cat">${escapeHtml(w['Category'] || '')}</span>
        </div>
      </div>`
    ).join('');
  } else {
    let pool = allVerbs;
    if (query) pool = pool.filter(v =>
      norm(primaryForm(v)).includes(query) ||
      norm(v['Engelsk \u00f6vers\u00e4ttning'] || '').includes(query)
    );
    pool = [...pool].sort((a, b) => primaryForm(a).localeCompare(primaryForm(b), 'sv'));
    document.getElementById('browse-count').textContent = `${pool.length} verb${pool.length !== 1 ? 's' : ''}`;
    html = pool.map(v => {
      const forms = CONJ_FORMS.map(f => v[f]).filter(f => f && !isDash(f)).join(' \u00b7 ');
      return `<div class="browse-item">
        <div class="browse-item-row">
          <span class="browse-sv">${escapeHtml(primaryForm(v))}</span>
          <span class="browse-en">${escapeHtml(v['Engelsk \u00f6vers\u00e4ttning'] || '')}</span>
        </div>
        ${forms ? `<div class="browse-forms">${escapeHtml(forms)}</div>` : ''}
      </div>`;
    }).join('');
  }

  document.getElementById('browse-list').innerHTML = html ||
    '<p class="browse-empty">No results found</p>';
}

// ─── User-added words ─────────────────────────────────────────────────────────
function loadUserWords(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function saveUserWords(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }

let addModalType = 'vocab';

function showAddModal() {
  addModalType = browseType === 'verbs' ? 'verb' : 'vocab';
  document.getElementById('add-modal-title').textContent =
    addModalType === 'verb' ? 'Add Verb' : 'Add Word';
  document.getElementById('add-form-vocab').style.display = addModalType === 'vocab' ? '' : 'none';
  document.getElementById('add-form-verb').style.display  = addModalType === 'verb'  ? '' : 'none';

  // Populate category suggestions
  const dl = document.getElementById('cat-suggestions');
  dl.innerHTML = allCategories.map(c => `<option value="${escapeHtml(c)}">`).join('');

  // Clear fields
  ['add-sv','add-en','add-cat','add-inf','add-verb-en','add-verb-accepted',
   'add-presens','add-preteritum','add-supinum','add-imperativ'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => {
    const first = addModalType === 'vocab'
      ? document.getElementById('add-sv')
      : document.getElementById('add-inf');
    first.focus();
  }, 50);
}

function closeAddModal(e) {
  if (e && e.target !== document.getElementById('add-modal')) return;
  document.getElementById('add-modal').classList.remove('open');
}

function submitAddForm() {
  if (addModalType === 'vocab') {
    const sv  = document.getElementById('add-sv').value.trim();
    const en  = document.getElementById('add-en').value.trim();
    const cat = document.getElementById('add-cat').value.trim();
    if (!sv || !en) { alert('Swedish and English fields are required.'); return; }

    const userVocab = loadUserWords('svUserVocab');
    const newWord = {
      _id: 'u_' + Date.now(),
      Swedish: sv, English: en, Category: cat,
      _attempts: 0, _correct: 0, _user: true,
    };
    userVocab.push(newWord);
    saveUserWords('svUserVocab', userVocab);
    allVocab.push(newWord);
    if (cat && !allCategories.includes(cat)) {
      allCategories = [...allCategories, cat].sort();
      renderCategoryChips();
    }
    updateVocabStats();
  } else {
    const inf      = document.getElementById('add-inf').value.trim();
    const en       = document.getElementById('add-verb-en').value.trim();
    const accepted = document.getElementById('add-verb-accepted').value.trim() || en;
    if (!inf || !en) { alert('Infinitive and English fields are required.'); return; }

    const userVerbs = loadUserWords('svUserVerbs');
    const newVerb = {
      _id: 'u_' + Date.now(),
      'Infinitiv':              inf,
      'Presens':                document.getElementById('add-presens').value.trim()    || '-',
      'Preteritum':             document.getElementById('add-preteritum').value.trim() || '-',
      'Supinum':                document.getElementById('add-supinum').value.trim()    || '-',
      'Imperativ':              document.getElementById('add-imperativ').value.trim()  || '-',
      'Engelsk översättning':   en,
      'Acceptable answers':     accepted,
      _attempts: 0, _correct: 0, _user: true,
    };
    userVerbs.push(newVerb);
    saveUserWords('svUserVerbs', userVerbs);
    allVerbs.push(newVerb);
    updateVerbStats();
  }

  document.getElementById('add-modal').classList.remove('open');
  renderBrowseList();
}

// ─── Pronunciation ────────────────────────────────────────────────────────
function speak(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'sv-SE';
  utt.rate = 0.9;

  // Try to find a Swedish voice; fall back to default
  const voices = window.speechSynthesis.getVoices();
  const svVoice = voices.find(v => v.lang.startsWith('sv'));
  if (svVoice) utt.voice = svVoice;

  window.speechSynthesis.speak(utt);
}

function speakCurrent() {
  if (!session) return;
  const item = session.questions[session.index];
  const q = session._q;
  // Always speak the Swedish word/form
  speak(q.word);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const [verbText, vocabText] = await Promise.all([
      fetch('./verbs.csv').then(r => r.text()),
      fetch('./vocabulary.csv').then(r => r.text()),
    ]);

    verbProgress  = loadProgress('svVerbProgress');
    vocabProgress = loadProgress('svVocabProgress');

    allVerbs = parseCSV(verbText).map(v => ({
      ...v,
      _attempts: verbProgress[v._id]?.attempts || 0,
      _correct:  verbProgress[v._id]?.correct  || 0,
    }));

    allVocab = parseCSV(vocabText).map(v => ({
      ...v,
      _attempts: vocabProgress[v._id]?.attempts || 0,
      _correct:  vocabProgress[v._id]?.correct  || 0,
    }));

    // Merge user-added words
    const userVocab = loadUserWords('svUserVocab');
    userVocab.forEach(w => {
      allVocab.push({
        ...w,
        _attempts: vocabProgress[w._id]?.attempts || w._attempts || 0,
        _correct:  vocabProgress[w._id]?.correct  || w._correct  || 0,
      });
    });

    const userVerbs = loadUserWords('svUserVerbs');
    userVerbs.forEach(v => {
      allVerbs.push({
        ...v,
        _attempts: verbProgress[v._id]?.attempts || v._attempts || 0,
        _correct:  verbProgress[v._id]?.correct  || v._correct  || 0,
      });
    });

    allCategories = [...new Set(allVocab.map(w => w['Category']).filter(Boolean))].sort();

    updateVerbStats();
    updateVocabStats();
    renderCategoryChips();
    showScreen('home');
  } catch (e) {
    document.body.innerHTML =
      '<p style="color:#fff;padding:2rem;font-family:sans-serif">' +
      'Could not load data files. Make sure verbs.csv and vocabulary.csv are in the same folder as index.html.</p>';
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data === 'sw-updated') window.location.reload();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mc-options').addEventListener('click', e => {
    const btn = e.target.closest('.mc-btn');
    if (btn && !btn.disabled) selectOption(btn.dataset.value, btn);
  });

  document.getElementById('category-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const cat = chip.dataset.cat;
    if (cat === '__all__') selectedCategories.clear();
    else selectedCategories.has(cat) ? selectedCategories.delete(cat) : selectedCategories.add(cat);
    renderCategoryChips();
    updateVocabStats();
  });

  document.getElementById('browse-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const cat = chip.dataset.bcat;
    if (cat === '__all__') browseCategories.clear();
    else browseCategories.has(cat) ? browseCategories.delete(cat) : browseCategories.add(cat);
    renderBrowseCategories();
    renderBrowseList();
  });

  init();
});
