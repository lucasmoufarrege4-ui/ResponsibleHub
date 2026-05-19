/* ─── DATA ──────────────────────────────────────────────────────────── */

const studyChallenges = [
  { emoji: '🍅', text: 'Do a 25-min Pomodoro session with zero phone distractions.', xp: 15, diff: 'Medium' },
  { emoji: '📓', text: 'Rewrite your notes from yesterday in your own words.', xp: 10, diff: 'Easy' },
  { emoji: '🗣️', text: 'Teach a classmate one concept you learned this week.', xp: 20, diff: 'Hard' },
  { emoji: '📅', text: 'Plan your whole week of study sessions in a calendar.', xp: 15, diff: 'Medium' },
  { emoji: '🔇', text: 'Study for 1 hour with no music or background noise.', xp: 20, diff: 'Hard' },
  { emoji: '✏️', text: 'Make flashcards for 10 key terms from any subject.', xp: 15, diff: 'Medium' },
  { emoji: '🌅', text: 'Wake up 30 min earlier and review your notes before school.', xp: 25, diff: 'Hard' },
  { emoji: '📊', text: 'Create a mind map for a topic you find tricky.', xp: 15, diff: 'Medium' },
  { emoji: '🎯', text: 'Set 3 specific study goals for today and tick them off.', xp: 10, diff: 'Easy' },
  { emoji: '💤', text: 'Get 8 hours of sleep tonight — a rested brain learns better!', xp: 10, diff: 'Easy' },
];

const ecoChallenges = [
  { emoji: '🚿', text: 'Take a shower under 5 minutes to save water today.', xp: 15, diff: 'Easy' },
  { emoji: '🥗', text: 'Eat a fully plant-based meal for lunch or dinner.', xp: 20, diff: 'Medium' },
  { emoji: '♻️', text: 'Sort all your household recycling correctly today.', xp: 15, diff: 'Easy' },
  { emoji: '🚴', text: 'Walk, cycle, or take the bus instead of getting a car ride.', xp: 20, diff: 'Medium' },
  { emoji: '💡', text: 'Turn off every light and device when leaving a room all day.', xp: 10, diff: 'Easy' },
  { emoji: '🛍️', text: 'Say no to single-use plastic at least 3 times today.', xp: 20, diff: 'Medium' },
  { emoji: '🌳', text: 'Pick up 5 pieces of litter in your local area.', xp: 25, diff: 'Hard' },
  { emoji: '🐝', text: 'Plant a seed, water a plant, or help a garden grow.', xp: 20, diff: 'Medium' },
  { emoji: '📢', text: 'Share a climate fact with a friend or family member.', xp: 15, diff: 'Easy' },
  { emoji: '🛁', text: 'Have a cold shower — it saves energy and is great for focus!', xp: 25, diff: 'Hard' },
];

const studyTips = [
  { emoji: '🧠', text: 'Spaced repetition beats cramming every time. Review material over several days.', cat: 'memory' },
  { emoji: '🍅', text: 'The Pomodoro method: 25 min focus → 5 min break. Repeat 4x, then a long break.', cat: 'focus' },
  { emoji: '😴', text: 'Sleep consolidates memories. Pulling an all-nighter actually hurts your recall.', cat: 'wellbeing' },
  { emoji: '✍️', text: 'Handwriting notes beats typing for long-term memory — your brain engages more.', cat: 'memory' },
  { emoji: '🏃', text: 'Exercise before studying boosts BDNF — a protein that literally grows your brain.', cat: 'wellbeing' },
  { emoji: '🎯', text: 'Eliminate one distraction before each study session. Phone in another room = +40% focus.', cat: 'focus' },
  { emoji: '🗣️', text: 'The Feynman Technique: explain a concept as if teaching a child. Gaps in your knowledge show up fast.', cat: 'memory' },
  { emoji: '🥤', text: 'Drink water! Even mild dehydration reduces cognitive performance by up to 10%.', cat: 'wellbeing' },
  { emoji: '🌿', text: 'Study near a window or with a plant nearby — natural light and greenery reduce stress.', cat: 'focus' },
  { emoji: '📋', text: 'Write your to-do list the night before. You\'ll sleep better and start the day with a plan.', cat: 'focus' },
];

const climateFacts = [
  { emoji: '🌊', text: 'Sea levels have risen over 20 cm since 1900 and are still rising due to melting ice caps.', impact: '💧 Threatens 1 billion coastal residents' },
  { emoji: '🌡️', text: 'The last decade (2011–2020) was the hottest on Earth ever recorded in human history.', impact: '🔥 Each year keeps breaking records' },
  { emoji: '🌲', text: 'Every second, a football-field-sized area of rainforest is destroyed around the world.', impact: '🐾 Home to 50% of all species on Earth' },
  { emoji: '🐄', text: 'Animal agriculture produces more greenhouse gases than all transport combined worldwide.', impact: '🥗 Going plant-based 1 day/week helps a lot' },
  { emoji: '♻️', text: 'Only 9% of all plastic ever produced has actually been recycled. The rest is landfill or ocean.', impact: '🌊 8M tonnes enter oceans every year' },
  { emoji: '☀️', text: 'Solar and wind are now the cheapest forms of new electricity generation in most of the world.', impact: '⚡ Clean energy is finally winning!' },
  { emoji: '🌍', text: 'If everyone lived like an average person in a high-income country, we\'d need 3.4 Earths.', impact: '🌱 Small habit changes multiply across billions' },
  { emoji: '🦋', text: '1 million plant and animal species face extinction — the fastest rate in 10 million years.', impact: '🐝 Biodiversity keeps ecosystems stable' },
  { emoji: '👦', text: 'Young people aged 15–24 are the largest generation in history — your choices shape the future.', impact: '📢 Collective youth action creates real change' },
  { emoji: '🌱', text: 'Planting trees, protecting oceans, and switching to clean energy could avoid 90% of predicted warming.', impact: '✅ Solutions already exist — we just need action!' },
];

const carbonTips = {
  transport: { 0: null, 1: '🚴 Great job! Staying active and green with your commute.', 3: '🚗 Try carpooling or hopping on public transit once a week.' },
  diet: { 0: null, 1: '🥗 Try swapping one meal a week to fully plant-based.', 4: '🥦 Reducing meat by even 1 day/week cuts your food footprint by 15%.' },
  energy: { 0: null, 1: '💡 Try unplugging chargers and devices when fully charged.', 3: '🔌 Power strips with switches make it easy to cut idle energy use.' },
  waste: { 0: null, 1: '♻️ Look up your local recycling rules — some items are often missed.', 3: '🛍️ Start with one simple swap: a reusable water bottle or bag.' },
};

/* ─── STATE ──────────────────────────────────────────────────────────── */

let studyStreak = 0, ecoStreak = 0;
let challengesDone = 0, tasksDone = 0, co2Tracked = 0;
let currentStudyChal = 0, currentEcoChal = 0;
let currentTipIndex = 0, currentTipCat = 'all';
let currentFactIndex = 0;
let hwTasks = [];
let filteredTips = [...studyTips];

/* ─── UTILS ──────────────────────────────────────────────────────────── */

function rand(arr) { return Math.floor(Math.random() * arr.length); }

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3200);
}

function updateHeroStats() {
  document.getElementById('challenges-done').textContent = challengesDone;
  document.getElementById('tasks-done').textContent = tasksDone;
  document.getElementById('co2-saved').textContent = co2Tracked;
}

function renderStreakDots(containerId, streak) {
  const c = document.getElementById(containerId);
  c.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = document.createElement('div');
    d.className = 'streak-dot' + (i < streak ? ' filled' : '');
    c.appendChild(d);
  }
}

/* ─── STUDY CHALLENGE ────────────────────────────────────────────────── */

function loadStudyChallenge(idx) {
  const c = studyChallenges[idx];
  document.getElementById('study-challenge-emoji').textContent = c.emoji;
  document.getElementById('study-challenge-text').textContent  = c.text;
  document.getElementById('study-xp').textContent  = `+${c.xp} XP`;
  document.getElementById('study-diff').textContent = c.diff;
  document.getElementById('complete-study-btn').disabled = false;
  document.getElementById('complete-study-btn').textContent = '✅ Mark Complete';
}

document.getElementById('complete-study-btn').addEventListener('click', () => {
  const btn = document.getElementById('complete-study-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '🎉 Done!';
  studyStreak = Math.min(studyStreak + 1, 7);
  challengesDone++;
  renderStreakDots('study-streak-dots', studyStreak);
  document.getElementById('study-streak-count').textContent = `${studyStreak} day${studyStreak !== 1 ? 's' : ''}`;
  updateHeroStats();
  showToast('🔥 Study challenge complete! Keep it up!', 'study-toast');
});

document.getElementById('new-study-challenge-btn').addEventListener('click', () => {
  let next;
  do { next = rand(studyChallenges); } while (next === currentStudyChal);
  currentStudyChal = next;
  loadStudyChallenge(next);
});

/* ─── HOMEWORK TRACKER ───────────────────────────────────────────────── */

function renderHWList() {
  const list = document.getElementById('hw-list');
  list.innerHTML = '';
  hwTasks.forEach((task, i) => {
    const li = document.createElement('li');
    li.className = 'hw-item' + (task.done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'hw-check';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleHW(i));

    const subj = document.createElement('span');
    subj.className = 'hw-subject';
    subj.textContent = task.subject;

    const label = document.createElement('span');
    label.className = 'hw-label';
    label.textContent = task.text;

    const del = document.createElement('button');
    del.className = 'hw-delete';
    del.title = 'Delete';
    del.textContent = '×';
    del.addEventListener('click', () => deleteHW(i));

    li.append(checkbox, subj, label, del);
    list.appendChild(li);
  });
  updateHWProgress();
}

function updateHWProgress() {
  const total = hwTasks.length;
  const done  = hwTasks.filter(t => t.done).length;
  const pct   = total === 0 ? 0 : (done / total) * 100;
  document.getElementById('hw-progress-text').textContent = `${done} of ${total} done`;
  document.getElementById('hw-progress-fill').style.width = pct + '%';

  const prev = tasksDone;
  tasksDone = done;
  if (tasksDone > prev) {
    co2Tracked = Math.max(0, co2Tracked);
    updateHeroStats();
  }

  if (total > 0 && done === total) showToast('🎓 All homework done! Amazing!', 'study-toast');
}

function toggleHW(i) {
  hwTasks[i].done = !hwTasks[i].done;
  renderHWList();
  updateHeroStats();
}

function deleteHW(i) {
  hwTasks.splice(i, 1);
  renderHWList();
}

document.getElementById('hw-add-btn').addEventListener('click', addHW);
document.getElementById('hw-input').addEventListener('keydown', e => { if (e.key === 'Enter') addHW(); });

function addHW() {
  const input = document.getElementById('hw-input');
  const select = document.getElementById('hw-subject');
  const text = input.value.trim();
  if (!text) return;
  hwTasks.push({ text, subject: select.value, done: false });
  input.value = '';
  renderHWList();
  showToast('📝 Task added!', 'study-toast');
}

/* ─── STUDY TIPS ─────────────────────────────────────────────────────── */

function filterTips(cat) {
  filteredTips = cat === 'all' ? [...studyTips] : studyTips.filter(t => t.cat === cat);
  currentTipIndex = 0;
  renderTip();
}

function renderTip() {
  if (!filteredTips.length) return;
  const tip = filteredTips[currentTipIndex];
  const card = document.getElementById('tip-card');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  document.getElementById('tip-emoji').textContent = tip.emoji;
  document.getElementById('tip-text').textContent  = tip.text;
  document.getElementById('tip-counter').textContent = `${currentTipIndex + 1} / ${filteredTips.length}`;
}

document.getElementById('next-tip-btn').addEventListener('click', () => {
  currentTipIndex = (currentTipIndex + 1) % filteredTips.length;
  renderTip();
});

document.getElementById('prev-tip-btn').addEventListener('click', () => {
  currentTipIndex = (currentTipIndex - 1 + filteredTips.length) % filteredTips.length;
  renderTip();
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    chip.classList.add('chip-active');
    filterTips(chip.dataset.cat);
  });
});

/* ─── ECO CHALLENGE ──────────────────────────────────────────────────── */

function loadEcoChallenge(idx) {
  const c = ecoChallenges[idx];
  document.getElementById('eco-challenge-emoji').textContent = c.emoji;
  document.getElementById('eco-challenge-text').textContent  = c.text;
  document.getElementById('eco-xp').textContent  = `+${c.xp} XP`;
  document.getElementById('eco-diff').textContent = c.diff;
  document.getElementById('complete-eco-btn').disabled = false;
  document.getElementById('complete-eco-btn').textContent = '✅ Mission Complete!';
}

document.getElementById('complete-eco-btn').addEventListener('click', () => {
  const btn = document.getElementById('complete-eco-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '🌍 Planet thanks you!';
  ecoStreak = Math.min(ecoStreak + 1, 7);
  challengesDone++;
  co2Tracked++;
  renderStreakDots('eco-streak-dots', ecoStreak);
  document.getElementById('eco-streak-count').textContent = `${ecoStreak} day${ecoStreak !== 1 ? 's' : ''}`;
  updateHeroStats();
  showToast('🌱 Eco mission complete! The planet thanks you!', 'eco-toast');
});

document.getElementById('new-eco-challenge-btn').addEventListener('click', () => {
  let next;
  do { next = rand(ecoChallenges); } while (next === currentEcoChal);
  currentEcoChal = next;
  loadEcoChallenge(next);
});

/* ─── CLIMATE FACTS ──────────────────────────────────────────────────── */

function buildFactDots() {
  const c = document.getElementById('fact-dots');
  c.innerHTML = '';
  climateFacts.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'fact-dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => showFact(i));
    c.appendChild(d);
  });
}

function showFact(idx) {
  currentFactIndex = idx;
  const f = climateFacts[idx];
  document.getElementById('fact-number').textContent = String(idx + 1).padStart(2, '0');
  document.getElementById('fact-emoji').textContent  = f.emoji;
  document.getElementById('fact-text').textContent   = f.text;
  document.getElementById('fact-impact').textContent = f.impact;
  document.querySelectorAll('.fact-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

document.getElementById('next-fact-btn').addEventListener('click', () =>
  showFact((currentFactIndex + 1) % climateFacts.length));

document.getElementById('prev-fact-btn').addEventListener('click', () =>
  showFact((currentFactIndex - 1 + climateFacts.length) % climateFacts.length));

document.getElementById('share-fact-btn').addEventListener('click', () => {
  const f = climateFacts[currentFactIndex];
  const text = `🌍 Did you know? ${f.text} ${f.impact} — via ResponsibleHub`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast('📋 Fact copied to clipboard!', 'eco-toast'));
  }
});

/* ─── CARBON TRACKER ─────────────────────────────────────────────────── */

document.getElementById('calc-carbon-btn').addEventListener('click', () => {
  const get = name => +document.querySelector(`input[name="${name}"]:checked`)?.value || 0;
  const scores = { transport: get('transport'), diet: get('diet'), energy: get('energy'), waste: get('waste') };
  const total = scores.transport + scores.diet + scores.energy + scores.waste;
  const score = Math.max(0, 10 - total);

  let grade, msg, colour;
  if (score >= 9)       { grade = '🌟 Eco Champion!';   msg = "You're an absolute eco star — keep leading the way!";          colour = '#16a34a'; }
  else if (score >= 7)  { grade = '🌿 Green Hero';      msg = "Awesome habits! A few tweaks and you could go champion.";       colour = '#22c55e'; }
  else if (score >= 5)  { grade = '🌱 Getting There';   msg = "Good effort! Small daily changes will stack up fast.";          colour = '#f59e0b'; }
  else if (score >= 3)  { grade = '🌍 Earth Learner';   msg = "Awareness is step one. Pick one tip below to start!";           colour = '#f97316'; }
  else                  { grade = '🚀 Room to Grow';    msg = "Every eco journey starts somewhere. Start with one easy swap!"; colour = '#ef4444'; }

  const tips = Object.entries(scores)
    .map(([k, v]) => carbonTips[k][v])
    .filter(Boolean);

  const pct = (score / 10) * 360;
  const arc = document.getElementById('gauge-arc');
  arc.style.background = `conic-gradient(${colour} ${pct}deg, var(--border) 0deg)`;

  document.getElementById('gauge-score').textContent = score;
  document.getElementById('carbon-grade').textContent = grade;
  document.getElementById('carbon-grade').style.color = colour;
  document.getElementById('carbon-msg').textContent = msg;

  const tipsList = document.getElementById('carbon-tips');
  tipsList.innerHTML = tips.length
    ? tips.map(t => `<li>${t}</li>`).join('')
    : '<li>🌟 Nothing to improve — you\'re already an eco champion!</li>';

  document.getElementById('carbon-form').classList.add('hidden');
  document.getElementById('carbon-result').classList.remove('hidden');

  co2Tracked = Math.max(co2Tracked, 1);
  updateHeroStats();
  showToast(`${grade} — carbon score: ${score}/10`, 'eco-toast');
});

document.getElementById('retake-carbon-btn').addEventListener('click', () => {
  document.getElementById('carbon-result').classList.add('hidden');
  document.getElementById('carbon-form').classList.remove('hidden');
});

/* ─── NAV SCROLL HIGHLIGHT ───────────────────────────────────────────── */

const sections  = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-links a');

const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${e.target.id}`));
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => observer.observe(s));

/* ─── MOBILE NAV ─────────────────────────────────────────────────────── */

document.querySelector('.nav-toggle').addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('open');
});

/* ─── NAVBAR SCROLL SHADOW ───────────────────────────────────────────── */

const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ─── SMOOTH SCROLL ──────────────────────────────────────────────────── */

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
    document.querySelector('.nav-links').classList.remove('open');
  });
});

/* ─── AI TUTOR ───────────────────────────────────────────────────────── */

let tutorSubject  = '';
let tutorTopic    = '';
let tutorQuestions = [];
let tutorCurrentQ  = 0;
let tutorResults   = [];
let tutorScore     = 0;

const screens = {
  setup:    document.getElementById('tutor-setup'),
  loading:  document.getElementById('tutor-loading'),
  question: document.getElementById('tutor-question'),
  feedback: document.getElementById('tutor-feedback'),
  summary:  document.getElementById('tutor-summary'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// SSE streaming helper
async function streamSSE(url, body, onText) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const payload = JSON.parse(line.slice(6));
        if (payload.error) throw new Error(payload.error);
        if (payload.text) onText(payload.text);
      } catch (e) {
        if (e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
  }
}

// Subject selection
document.querySelectorAll('.subject-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subject-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    tutorSubject = btn.dataset.subject;
    updateStartBtn();
  });
});

const tutorTopicInput = document.getElementById('tutor-topic-input');
const tutorStartBtn   = document.getElementById('tutor-start-btn');

function updateStartBtn() {
  tutorStartBtn.disabled = !(tutorSubject && tutorTopicInput.value.trim());
}

tutorTopicInput.addEventListener('input', updateStartBtn);

tutorStartBtn.addEventListener('click', async () => {
  tutorTopic = tutorTopicInput.value.trim();
  if (!tutorSubject || !tutorTopic) return;

  showScreen('loading');

  try {
    const data = await fetch('/api/tutor/questions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subject: tutorSubject, topic: tutorTopic }),
    }).then(r => r.json());

    if (data.error) throw new Error(data.error);
    tutorQuestions = data.questions;
    tutorCurrentQ  = 0;
    tutorResults   = [];
    tutorScore     = 0;
    showQuestion(0);
  } catch (err) {
    showScreen('setup');
    showToast(`❌ Couldn't load questions: ${err.message}`, 'study');
  }
});

function buildProgressDots(currentIdx) {
  const container = document.getElementById('progress-dots');
  container.innerHTML = '';
  tutorQuestions.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i < currentIdx) {
      const r = tutorResults[i];
      dot.classList.add(r?.result === '✅' ? 'correct' : r?.result === '⚡' ? 'partial' : 'wrong');
    } else if (i === currentIdx) {
      dot.classList.add('current');
    }
    container.appendChild(dot);
  });
}

function showQuestion(idx) {
  const q = tutorQuestions[idx];
  document.getElementById('quiz-subject-badge').textContent = tutorSubject;
  document.getElementById('quiz-topic-badge').textContent   = tutorTopic;
  document.getElementById('q-number').textContent = `Question ${idx + 1} of 5`;
  document.getElementById('q-text').textContent   = q.question;
  document.getElementById('tutor-answer-input').value = '';
  document.getElementById('hint-box').classList.add('hidden');
  document.getElementById('hint-box').textContent = '';
  document.getElementById('hint-btn').textContent = '💡 Show Hint';
  buildProgressDots(idx);
  showScreen('question');
  document.getElementById('tutor-answer-input').focus();
}

// Hint toggle
document.getElementById('hint-btn').addEventListener('click', () => {
  const box = document.getElementById('hint-box');
  const btn = document.getElementById('hint-btn');
  if (box.classList.contains('hidden')) {
    box.textContent = tutorQuestions[tutorCurrentQ].hint;
    box.classList.remove('hidden');
    btn.textContent = '🙈 Hide Hint';
  } else {
    box.classList.add('hidden');
    btn.textContent = '💡 Show Hint';
  }
});

// Submit answer
async function submitAnswer() {
  const answerInput = document.getElementById('tutor-answer-input');
  const answer = answerInput.value.trim();
  if (!answer) return;

  document.getElementById('tutor-submit-btn').disabled = true;
  answerInput.disabled = true;

  const q = tutorQuestions[tutorCurrentQ];
  const feedbackEl   = document.getElementById('feedback-text');
  const feedbackIcon = document.getElementById('feedback-icon');
  feedbackEl.textContent   = '';
  feedbackIcon.textContent = '⏳';
  feedbackIcon.className   = 'feedback-icon';
  showScreen('feedback');
  document.getElementById('tutor-next-btn').classList.add('hidden');

  let fullText = '';
  try {
    await streamSSE('/api/tutor/evaluate', {
      subject: tutorSubject, topic: tutorTopic,
      question: q.question, correctAnswer: q.answer,
      studentAnswer: answer,
    }, text => {
      fullText += text;
      feedbackEl.textContent = fullText;
    });
  } catch (err) {
    fullText = `⚠️ Error: ${err.message}`;
    feedbackEl.textContent = fullText;
  }

  // Detect result from first char
  const firstChar = fullText.trimStart()[0];
  let result = '❌';
  if (firstChar === '✅') result = '✅';
  else if (firstChar === '⚡') result = '⚡';

  feedbackIcon.textContent = result;
  feedbackIcon.className = `feedback-icon ${result === '✅' ? 'correct-icon' : result === '❌' ? 'wrong-icon' : ''}`;

  if (result === '✅') tutorScore++;
  tutorResults.push({ question: q.question, studentAnswer: answer, result });

  document.getElementById('tutor-next-btn').classList.remove('hidden');
  document.getElementById('tutor-submit-btn').disabled = false;
  answerInput.disabled = false;
}

document.getElementById('tutor-submit-btn').addEventListener('click', submitAnswer);
document.getElementById('tutor-answer-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
});

// Next question or summary
document.getElementById('tutor-next-btn').addEventListener('click', () => {
  tutorCurrentQ++;
  if (tutorCurrentQ < tutorQuestions.length) {
    showQuestion(tutorCurrentQ);
  } else {
    showSummary();
  }
});

async function showSummary() {
  showScreen('summary');

  // Score ring animation
  const ringFill  = document.getElementById('ring-fill');
  const circumference = 314;
  const offset = circumference - (tutorScore / 5) * circumference;
  document.getElementById('score-num').textContent = tutorScore;
  setTimeout(() => { ringFill.style.strokeDashoffset = offset; }, 100);

  // Result dots
  const resultDotsEl = document.getElementById('result-dots');
  resultDotsEl.innerHTML = '';
  tutorResults.forEach(r => {
    const dot = document.createElement('div');
    dot.className = `progress-dot ${r.result === '✅' ? 'correct' : r.result === '⚡' ? 'partial' : 'wrong'}`;
    resultDotsEl.appendChild(dot);
  });

  // Stream summary
  const summaryEl = document.getElementById('summary-text');
  summaryEl.textContent = '✨ Getting your personalised feedback…';
  let summaryText = '';
  try {
    await streamSSE('/api/tutor/summary', {
      subject: tutorSubject, topic: tutorTopic,
      score: tutorScore, results: tutorResults,
    }, text => {
      summaryText += text;
      summaryEl.textContent = summaryText;
    });
  } catch (err) {
    summaryEl.textContent = `⚠️ Could not load summary: ${err.message}`;
  }
}

// Restart
document.getElementById('tutor-restart-btn').addEventListener('click', () => {
  tutorSubject  = '';
  tutorTopic    = '';
  tutorQuestions = [];
  tutorCurrentQ  = 0;
  tutorResults   = [];
  tutorScore     = 0;
  document.querySelectorAll('.subject-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('tutor-topic-input').value = '';
  document.getElementById('ring-fill').style.strokeDashoffset = '314';
  updateStartBtn();
  showScreen('setup');
});

/* ─── INIT ───────────────────────────────────────────────────────────── */

(function init() {
  currentStudyChal = rand(studyChallenges);
  currentEcoChal   = rand(ecoChallenges);
  loadStudyChallenge(currentStudyChal);
  loadEcoChallenge(currentEcoChal);
  renderStreakDots('study-streak-dots', 0);
  renderStreakDots('eco-streak-dots', 0);
  renderTip();
  buildFactDots();
  showFact(0);
  renderHWList();
  updateHeroStats();

  // seed a couple of example homework tasks
  hwTasks = [
    { text: 'Read Chapter 5', subject: '📖', done: false },
    { text: 'Complete exercises p.34', subject: '📐', done: false },
  ];
  renderHWList();
})();
