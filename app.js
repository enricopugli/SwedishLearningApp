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

const VERB_FNS = { 'sv-en': qSvEn, 'en-sv': qEnSv, 'conjugate': qConjugate, 'fill-blank': qFillBlankVerb };

// ─── Fill-in-the-blank helpers ────────────────────────────────────────────────
function blankOut(sentence, word) {
  // Strip parentheticals like "(sig)" when searching
  const cleanWord = word.replace(/\s*\([^)]*\)/g, '').trim();
  if (!cleanWord) return sentence;
  const idx = sentence.toLowerCase().indexOf(cleanWord.toLowerCase());
  if (idx === -1) return sentence;
  return sentence.substring(0, idx) + '____' + sentence.substring(idx + cleanWord.length);
}

function qFillBlankVerb(verb) {
  const sentence = verb['Example'] || '';
  const targetWord = verb['Presens'] || primaryForm(verb);
  const cleanTarget = targetWord.replace(/\s*\([^)]*\)/g, '').trim();
  return {
    label: 'Fill in the blank',
    question: sentence ? blankOut(sentence, targetWord) : `Fyll i luckan: ${primaryForm(verb)}`,
    fullSentence: sentence,
    word: primaryForm(verb),
    accepted: cleanTarget,
    display: cleanTarget,
    getDisplay: v => {
      const p = v['Presens'] || primaryForm(v);
      return p.replace(/\s*\([^)]*\)/g, '').trim();
    },
    isFillBlank: true,
  };
}

function qFillBlankVocab(word) {
  const sentence = word['Example'] || '';
  const targetWord = word['Swedish'];
  return {
    label: 'Fill in the blank',
    question: sentence ? blankOut(sentence, targetWord) : `Fyll i luckan: ${targetWord}`,
    fullSentence: sentence,
    word: targetWord,
    accepted: targetWord,
    display: targetWord,
    getDisplay: w => w['Swedish'],
    isFillBlank: true,
  };
}

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

const VOCAB_FNS = { 'sv-en': qVocabSvEn, 'en-sv': qVocabEnSv, 'fill-blank': qFillBlankVocab };

// ─── App state ────────────────────────────────────────────────────────────────
let allVerbs = [], allVocab = [], allCategories = [];
let verbProgress = {}, vocabProgress = {};
let numQ = parseInt(localStorage.getItem('svNumQ') || '10');
let numMatch = parseInt(localStorage.getItem('svNumMatch') || '12');
let multipleChoice = false;
let selectedCategories = new Set();
let verbFilter = 'all';   // 'all' | 'starred'
let vocabFilter = 'all';  // 'all' | 'category' | 'starred'
let starredIds = new Set(JSON.parse(localStorage.getItem('svStarred') || '[]'));
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
  localStorage.setItem('svNumQ', numQ);
  document.querySelectorAll('.num-q-display').forEach(el => el.textContent = numQ);
}

function changeNumMatch(delta) {
  numMatch = Math.max(6, Math.min(30, numMatch + delta));
  localStorage.setItem('svNumMatch', numMatch);
  document.querySelectorAll('.num-match-display').forEach(el => el.textContent = numMatch);
}

function setMultipleChoice(val) {
  multipleChoice = val;
}

function getFilteredVerbs() {
  if (verbFilter === 'starred') return allVerbs.filter(v => starredIds.has(String(v._id)));
  return allVerbs;
}

function getFilteredVocab() {
  if (vocabFilter === 'starred') return allVocab.filter(w => starredIds.has(String(w._id)));
  if (vocabFilter === 'category' && selectedCategories.size > 0)
    return allVocab.filter(w => selectedCategories.has(w['Category']));
  return allVocab;
}

function setVerbFilter(mode) {
  verbFilter = mode;
  document.getElementById('verb-filter-all-btn').classList.toggle('active', mode === 'all');
  document.getElementById('verb-filter-starred-btn').classList.toggle('active', mode === 'starred');
  updateVerbStats();
}

function setVocabFilter(mode) {
  vocabFilter = mode;
  document.getElementById('cat-filter-all-btn').classList.toggle('active', mode === 'all');
  document.getElementById('cat-filter-pick-btn').classList.toggle('active', mode === 'category');
  document.getElementById('cat-filter-starred-btn').classList.toggle('active', mode === 'starred');
  document.getElementById('category-chips-wrap').style.display = mode === 'category' ? '' : 'none';
  if (mode !== 'category') selectedCategories.clear();
  updateVocabStats();
}

function toggleStar() {
  if (!session) return;
  const id = String(session.questions[session.index]._id);
  if (starredIds.has(id)) starredIds.delete(id);
  else starredIds.add(id);
  localStorage.setItem('svStarred', JSON.stringify([...starredIds]));
  updateStarBtn();
}

function updateStarBtn() {
  if (!session) return;
  const id = String(session.questions[session.index]._id);
  const starred = starredIds.has(id);
  const btn = document.getElementById('star-btn');
  if (!btn) return;
  btn.textContent = starred ? '\u2605' : '\u2606';
  btn.classList.toggle('starred', starred);
}

function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  container.innerHTML = allCategories.map(cat => {
    const active = selectedCategories.has(cat);
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `<button class="chip ${active ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
  }).join('');
}

function updateVerbStats() {
  const seen = allVerbs.filter(v => v._attempts > 0).length;
  const totalA = allVerbs.reduce((s, v) => s + v._attempts, 0);
  const totalC = allVerbs.reduce((s, v) => s + v._correct, 0);
  const pct = totalA > 0 ? Math.round(totalC / totalA * 100) : 0;
  const starCount = allVerbs.filter(v => starredIds.has(String(v._id))).length;
  const suffix = verbFilter === 'starred' ? ` \u00b7 \u2605 ${starCount} starred` : '';
  document.getElementById('menu-stats').textContent =
    `${seen}/${allVerbs.length} verbs seen \u00b7 ${pct}% accuracy${suffix}`;
}

function updateVocabStats() {
  const filtered = getFilteredVocab();
  const seen = filtered.filter(v => v._attempts > 0).length;
  const totalA = filtered.reduce((s, v) => s + v._attempts, 0);
  const totalC = filtered.reduce((s, v) => s + v._correct, 0);
  const pct = totalA > 0 ? Math.round(totalC / totalA * 100) : 0;
  const suffix = vocabFilter !== 'all' ? ` (${filtered.length} filtered)` : '';
  document.getElementById('vocab-stats').textContent =
    `${seen}/${filtered.length} words seen \u00b7 ${pct}% accuracy${suffix}`;
}

// ─── Session ──────────────────────────────────────────────────────────────────
function startSession(mode) {
  const pool = getFilteredVerbs();
  if (!pool.length) { alert('No starred verbs yet. Star words during an exercise first!'); return; }
  lastMode = mode;
  lastSessionType = 'verbs';
  session = {
    questions: weightedSample(pool, numQ),
    pool,
    index: 0, score: 0, missed: [],
    questionFn: VERB_FNS[mode],
    progressKey: 'svVerbProgress',
    progressMap: verbProgress,
    answered: false,
  };
  showScreen('quiz');
  renderQuestion();
}

function startFillBlankSession(type) {
  const prev = multipleChoice;
  multipleChoice = true; // renderQuestion checks this; restored after session starts
  if (type === 'verbs') {
    startSession('fill-blank');
  } else {
    startVocabSession('fill-blank');
  }
  multipleChoice = prev;
  if (session) session.forceMC = true;
}

function startVocabSession(mode) {
  const filtered = getFilteredVocab();
  if (!filtered.length) { alert('No starred words yet. Star words during an exercise first!'); return; }
  lastVocabMode = mode;
  lastSessionType = 'vocab';
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

function startHardSession(type, mode) {
  const src = type === 'verbs' ? getFilteredVerbs() : getFilteredVocab();
  const attempted = src.filter(v => v._attempts > 0);
  if (!attempted.length) {
    alert('No attempted words yet. Complete some exercises first!');
    return;
  }
  const pool = shuffle(
    [...attempted].sort((a, b) => (a._correct / a._attempts) - (b._correct / b._attempts))
                  .slice(0, numQ)
  );
  if (type === 'verbs') {
    lastMode = mode;
    lastSessionType = 'verbs';
    session = {
      questions: pool, pool,
      distractorPool: allVerbs,
      index: 0, score: 0, missed: [],
      questionFn: VERB_FNS[mode],
      progressKey: 'svVerbProgress',
      progressMap: verbProgress,
      answered: false,
    };
  } else {
    lastVocabMode = mode;
    lastSessionType = 'vocab';
    session = {
      questions: pool, pool,
      distractorPool: allVocab,
      index: 0, score: 0, missed: [],
      questionFn: VOCAB_FNS[mode],
      progressKey: 'svVocabProgress',
      progressMap: vocabProgress,
      answered: false,
    };
  }
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
  updateStarBtn();

  const input = document.getElementById('answer-input');
  const mcDiv = document.getElementById('mc-options');
  const submitBtn = document.getElementById('submit-btn');

  if (multipleChoice || session.forceMC) {
    input.style.display = 'none';
    mcDiv.style.display = 'grid';
    submitBtn.style.display = 'none';
    const options = generateOptions(q.display, session.distractorPool || session.pool, q.getDisplay, item._id);
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
  document.querySelectorAll('.browse-starred-btn').forEach(el => el.classList.remove('active'));
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
  document.querySelectorAll('.browse-starred-btn').forEach(el => el.classList.toggle('active', type === 'starred'));
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

  if (browseType === 'starred') {
    const svocab = allVocab.filter(w => starredIds.has(String(w._id)));
    const sverbs = allVerbs.filter(v => starredIds.has(String(v._id)));
    let pool = [
      ...svocab.map(w => ({ sv: w.Swedish, en: w.English.split('|')[0], tag: w['Category'] || 'vocab' })),
      ...sverbs.map(v => ({ sv: primaryForm(v), en: v['Engelsk översättning'], tag: 'verb' })),
    ].filter(x => !query || norm(x.sv).includes(query) || norm(x.en).includes(query))
     .sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
    document.getElementById('browse-count').textContent = `${pool.length} starred`;
    html = pool.map(x =>
      `<div class="browse-item">
        <div class="browse-item-row">
          <span class="browse-sv">\u2605 ${escapeHtml(x.sv)}</span>
          <span class="browse-en">${escapeHtml(x.en)}</span>
          <span class="browse-cat">${escapeHtml(x.tag)}</span>
        </div>
      </div>`
    ).join('');
  } else if (browseType === 'vocab') {
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

// ─── Match mode ───────────────────────────────────────────────────────────
const MATCH_BATCH = 6;
let matchState = null;

function startMatchSession(type) {
  lastSessionType = type === 'verbs' ? 'verbs' : 'vocab';
  const src = type === 'verbs' ? getFilteredVerbs() : getFilteredVocab();
  if (!src.length) { alert('No starred words yet. Star words during an exercise first!'); return; }
  const pool = weightedSample(src, numMatch);

  matchState = {
    type,
    pool,
    batchIndex: 0,
    totalMatched: 0,
    totalPairs: pool.length,
    score: 0,
    missed: [],
    wrongIds: new Set(),
    selectedSv: null,
    selectedEn: null,
    locked: false,
  };

  showScreen('match');
  renderMatchBatch();
}

function renderMatchBatch() {
  const { pool, batchIndex, totalMatched } = matchState;
  const start = batchIndex * MATCH_BATCH;
  const batch = pool.slice(start, start + MATCH_BATCH);
  if (!batch.length) { showMatchScore(); return; }

  matchState.currentBatch = batch;
  matchState.remaining = batch.length;
  matchState.wrongIds = new Set();
  matchState.selectedSv = null;
  matchState.selectedEn = null;
  matchState.locked = false;

  const totalBatches = Math.ceil(pool.length / MATCH_BATCH);
  const currentBatch = batchIndex + 1;
  document.getElementById('match-progress-text').textContent = `Batch ${currentBatch}/${totalBatches}`;
  document.getElementById('match-progress-fill').style.width = `${(batchIndex / totalBatches) * 100}%`;
  document.getElementById('match-pair-text').textContent = `Match ${batch.length} pairs`;

  const svWords = shuffle(batch.map((item, i) => ({ id: i, text: matchState.type === 'verbs' ? primaryForm(item) : item.Swedish })));
  const enWords = shuffle(batch.map((item, i) => ({ id: i, text: matchState.type === 'verbs' ? item['Engelsk översättning'] : item.English.split('|')[0] })));

  document.getElementById('match-col-sv').innerHTML = svWords.map(w =>
    `<button class="match-btn" data-id="${w.id}" data-side="sv" onclick="selectMatchItem(this)">${escapeHtml(w.text)}</button>`
  ).join('');
  document.getElementById('match-col-en').innerHTML = enWords.map(w =>
    `<button class="match-btn" data-id="${w.id}" data-side="en" onclick="selectMatchItem(this)">${escapeHtml(w.text)}</button>`
  ).join('');
}

function selectMatchItem(btn) {
  if (matchState.locked || btn.classList.contains('matched')) return;
  const side = btn.dataset.side;
  const id = parseInt(btn.dataset.id);

  // Deselect previous selection on same side
  const prevKey = side === 'sv' ? 'selectedSv' : 'selectedEn';
  if (matchState[prevKey] !== null) {
    const col = side === 'sv' ? 'match-col-sv' : 'match-col-en';
    document.querySelectorAll(`#${col} .match-btn`).forEach(b => b.classList.remove('selected'));
  }

  btn.classList.add('selected');
  matchState[prevKey] = { id, btn };

  if (matchState.selectedSv && matchState.selectedEn) {
    checkMatchPair();
  }
}

function checkMatchPair() {
  matchState.locked = true;
  const { selectedSv, selectedEn } = matchState;
  const correct = selectedSv.id === selectedEn.id;

  if (correct) {
    selectedSv.btn.classList.remove('selected');
    selectedEn.btn.classList.remove('selected');
    selectedSv.btn.classList.add('correct');
    selectedEn.btn.classList.add('correct');
    matchState.totalMatched++;
    matchState.remaining--;

    // Record progress
    const item = matchState.currentBatch[selectedSv.id];
    const firstTry = !matchState.wrongIds.has(selectedSv.id);
    const progressKey = matchState.type === 'verbs' ? 'svVerbProgress' : 'svVocabProgress';
    const progressMap = matchState.type === 'verbs' ? verbProgress : vocabProgress;
    item._attempts++;
    if (firstTry) {
      item._correct++;
      matchState.score++;
    } else {
      const svText = matchState.type === 'verbs' ? primaryForm(item) : item.Swedish;
      const enText = matchState.type === 'verbs' ? item['Engelsk översättning'] : item.English.split('|')[0];
      matchState.missed.push({ word: svText, answer: enText });
    }
    progressMap[item._id] = { attempts: item._attempts, correct: item._correct };
    saveProgress(progressKey, progressMap);

    setTimeout(() => {
      selectedSv.btn.classList.add('matched');
      selectedEn.btn.classList.add('matched');
      matchState.selectedSv = null;
      matchState.selectedEn = null;
      matchState.locked = false;

      if (matchState.remaining === 0) {
        matchState.batchIndex++;
        setTimeout(renderMatchBatch, 300);
      }
    }, 500);
  } else {
    matchState.wrongIds.add(selectedSv.id);
    selectedSv.btn.classList.add('wrong');
    selectedEn.btn.classList.add('wrong');

    setTimeout(() => {
      selectedSv.btn.classList.remove('selected', 'wrong');
      selectedEn.btn.classList.remove('selected', 'wrong');
      matchState.selectedSv = null;
      matchState.selectedEn = null;
      matchState.locked = false;
    }, 600);
  }
}

function showMatchScore() {
  const total = matchState.totalPairs;
  const score = matchState.score;
  const pct = Math.round(score / total * 100);
  const msg = pct >= 80 ? 'Bra jobbat!' : pct >= 50 ? 'Fortsätt öva!' : 'Öva mer!';

  document.getElementById('score-fraction').textContent = `${score}/${total}`;
  document.getElementById('score-pct').textContent = `${pct}% — ${msg}`;

  const missedSection = document.getElementById('missed-section');
  const missedList = document.getElementById('missed-list');
  if (matchState.missed.length > 0) {
    missedSection.style.display = 'block';
    missedList.innerHTML = matchState.missed.map(m =>
      `<div class="missed-item">
        <span class="missed-word">${escapeHtml(m.word)}</span>
        <span class="missed-arrow">→</span>
        <span class="missed-answer">${escapeHtml(m.answer)}</span>
      </div>`
    ).join('');
  } else {
    missedSection.style.display = 'none';
  }

  if (matchState.type === 'verbs') updateVerbStats();
  else updateVocabStats();

  showScreen('score');
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
  document.querySelectorAll('.num-q-display').forEach(el => el.textContent = numQ);
  document.querySelectorAll('.num-match-display').forEach(el => el.textContent = numMatch);

  document.getElementById('mc-options').addEventListener('click', e => {
    const btn = e.target.closest('.mc-btn');
    if (btn && !btn.disabled) selectOption(btn.dataset.value, btn);
  });

  document.getElementById('category-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const cat = chip.dataset.cat;
    selectedCategories.has(cat) ? selectedCategories.delete(cat) : selectedCategories.add(cat);
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
