/* ─── SUPABASE + NAVIGATION ─────────────────────────────────────────── */

const SUPABASE_URL  = 'https://dhspvajtdevuqybevnro.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_WeipaP6dX45jDnOlRRLAgQ_EO7_hL1X';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


let sbUser    = null;
let sbProfile = null;
let currentPage = 'home';

/* ── Page Navigation ──────────────────────────────────────────────── */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.bnav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );
  document.querySelector('.pages').scrollTop = 0;
  currentPage = page;
  if (page === 'leaderboard') loadLeaderboard();
  if (page === 'planner') {
    if (sbUser) showPlannerApp();
    else showPlannerLocked();
  }
  if (page === 'home')  updateHomeView();
  if (page === 'coach') initCoachPage();
  if (page === 'study') initStudyPage();
}

document.querySelectorAll('.bnav-btn').forEach(btn =>
  btn.addEventListener('click', () => navigateTo(btn.dataset.page))
);
document.querySelectorAll('.dash-quick-btn').forEach(btn =>
  btn.addEventListener('click', () => navigateTo(btn.dataset.page))
);

/* ── Auth State ───────────────────────────────────────────────────── */
sb.auth.onAuthStateChange(async (_event, session) => {
  sbUser = session?.user ?? null;
  if (sbUser) {
    await ensureProfile();
    updateTopBar();
    updateHomeView();
    if (currentPage === 'planner') showPlannerApp();
    loadChallengeState(); // fire-and-forget — restores done/streak state after login
    loadNotes();          // fire-and-forget — loads study notes into cache
  } else {
    sbProfile = null;
    updateTopBar();
    updateHomeView();
    if (currentPage === 'planner') showPlannerLocked();
  }
  if (currentPage === 'leaderboard') loadLeaderboard();
});

async function ensureProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', sbUser.id).single();
  if (data) { sbProfile = data; return; }
  // Derive a clean username from Google's full_name, falling back to email prefix
  const meta    = sbUser.user_metadata || {};
  const rawName = meta.full_name || meta.name || sbUser.email?.split('@')[0] || 'student';
  const username = rawName.replace(/\s+/g, '').replace(/[^a-z0-9_\-]/gi, '').slice(0, 20) || 'student';
  const { data: np } = await sb.from('profiles')
    .insert({ id: sbUser.id, username, xp: 0 }).select().single();
  if (np) sbProfile = np;
}

async function addXP(amount) {
  if (!sbUser || !sbProfile) return;
  const { error } = await sb.rpc('increment_xp', { uid: sbUser.id, amount });
  if (!error) {
    sbProfile.xp += amount;
    updateTopBar();
    updateDashXP();
    showToast(`+${amount} XP saved! 🌟`, 'study-toast');
    if (currentPage === 'leaderboard') loadLeaderboard();
  }
}

/* ── Avatar helper ────────────────────────────────────────────────── */
// Sets a circular avatar <div>: Google photo when available, initial letter otherwise.
function setAvatarEl(el) {
  const url = sbUser?.user_metadata?.avatar_url;
  if (url) {
    el.innerHTML = `<img src="${escHtml(url)}" alt="${escHtml(sbProfile.username[0].toUpperCase())}" class="avatar-img">`;
  } else {
    el.textContent = sbProfile.username[0].toUpperCase();
  }
}

/* ── Top Bar ──────────────────────────────────────────────────────── */
function updateTopBar() {
  const el = document.getElementById('top-user');
  if (sbProfile) {
    el.classList.remove('hidden');
    setAvatarEl(document.getElementById('top-avatar'));
    document.getElementById('top-username').textContent = sbProfile.username;
    document.getElementById('top-xp').textContent       = `${sbProfile.xp} XP`;
  } else {
    el.classList.add('hidden');
  }
}

/* ── Home View ────────────────────────────────────────────────────── */
function updateHomeView() {
  if (sbProfile) {
    document.getElementById('home-welcome').classList.add('hidden');
    document.getElementById('home-dashboard').classList.remove('hidden');
    updateDashboard();
  } else {
    document.getElementById('home-welcome').classList.remove('hidden');
    document.getElementById('home-dashboard').classList.add('hidden');
  }
}

function updateDashboard() {
  if (!sbProfile) return;
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-hello').textContent = `${g}, ${sbProfile.username}! 👋`;
  setAvatarEl(document.getElementById('dash-avatar'));
  updateDashXP();
  updateDashStats();
}

function updateDashXP() {
  if (!sbProfile) return;
  document.getElementById('dash-xp-value').textContent = sbProfile.xp;
  document.getElementById('dash-xp-bar').style.width = Math.min((sbProfile.xp % 100) / 100 * 100, 100) + '%';
  fetchRank();
}

async function fetchRank() {
  if (!sbProfile) return;
  const { count } = await sb.from('profiles')
    .select('*', { count: 'exact', head: true }).gt('xp', sbProfile.xp);
  const el = document.getElementById('dash-rank');
  if (el) el.textContent = `#${(count ?? 0) + 1} on the leaderboard`;
}

function updateDashStats() {
  const c = document.getElementById('dash-challenges');
  const t = document.getElementById('dash-tasks');
  const co = document.getElementById('dash-co2');
  if (c)  c.textContent  = challengesDone;
  if (t)  t.textContent  = tasksDone;
  if (co) co.textContent = co2Tracked;
}

// Google OAuth sign-in
document.getElementById('home-signin-btn').addEventListener('click', async () => {
  const btn   = document.getElementById('home-signin-btn');
  const errEl = document.getElementById('home-auth-error');
  const orig  = btn.innerHTML;
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Redirecting to Google…';
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
  // On success the browser navigates to Google — no further action needed here
});

document.getElementById('dash-signout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  showToast('👋 Signed out. See you next time!', '');
  navigateTo('home');
});

document.getElementById('planner-go-home-btn').addEventListener('click', () => navigateTo('home'));

/* ── Leaderboard ──────────────────────────────────────────────────── */
async function loadLeaderboard() {
  const el = document.getElementById('lb-list');
  el.innerHTML = '<div class="lb-loading">Loading rankings…</div>';

  // 5-second safety net — never hang on a slow/dead query
  let timer;
  const timeout = new Promise((_, rej) =>
    timer = setTimeout(() => rej(new Error('lb_timeout')), 5000)
  );

  try {
    const { data, error } = await Promise.race([
      sb.from('profiles')
        .select('id, username, xp')
        .order('xp', { ascending: false })
        .limit(20),
      timeout,
    ]);
    clearTimeout(timer);

    if (error) {
      console.error('[Leaderboard] Supabase error:', error);
      // Detect RLS / permission errors and print the fix
      if (error.code === '42501' || error.code === 'PGRST301' ||
          (error.message || '').toLowerCase().includes('polic')) {
        console.error(
          '[Leaderboard] Looks like an RLS policy is blocking the query.\n' +
          'Run this in your Supabase SQL Editor:\n\n' +
          '  drop policy if exists "profiles_select" on public.profiles;\n' +
          '  create policy "profiles_select" on public.profiles\n' +
          '    for select using (true);\n'
        );
      }
      el.innerHTML = '<p class="lb-empty">⚠️ Couldn\'t load rankings — check the console for details.</p>';
      return;
    }

    console.log('[Leaderboard] Loaded', (data || []).length, 'row(s)');
    renderLeaderboard(data || []);

  } catch (err) {
    clearTimeout(timer);
    if (err.message === 'lb_timeout') {
      console.error('[Leaderboard] Query timed out after 5 s. ' +
        'Check SUPABASE_URL / SUPABASE_KEY and your network connection.');
    } else {
      console.error('[Leaderboard] Unexpected error:', err);
    }
    el.innerHTML = '<p class="lb-empty">No rankings yet — be the first! 🏆</p>';
  }
}

function renderLeaderboard(rows) {
  const el = document.getElementById('lb-list');
  if (!rows.length) {
    el.innerHTML = '<p class="lb-empty">No players yet — complete a challenge to get on the board! 🏆</p>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const maxXp  = rows[0]?.xp || 1;
  el.innerHTML = rows.map((row, i) => {
    const isMe = sbProfile && sbProfile.id === row.id;
    const pct  = maxXp > 0 ? Math.round((row.xp / maxXp) * 100) : 0;
    return `
      <div class="lb-row${isMe ? ' lb-me' : ''}${i < 3 ? ' lb-top' : ''}">
        <div class="lb-rank">${medals[i] || `#${i + 1}`}</div>
        <div class="lb-avatar">${row.username[0].toUpperCase()}</div>
        <div class="lb-info">
          <div class="lb-name">${row.username}${isMe ? ' <span class="lb-you-badge">You</span>' : ''}</div>
          <div class="lb-bar-wrap"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="lb-xp">${row.xp} XP</div>
      </div>`;
  }).join('');
}

document.getElementById('lb-refresh-btn').addEventListener('click', loadLeaderboard);

/* ── AI Tutor FAB ─────────────────────────────────────────────────── */
document.getElementById('fab-tutor').addEventListener('click', () => {
  const prompt = encodeURIComponent(
    'You are a study and eco tutor for a student. ' +
    'Ask me what subject or topic I need help with, then guide me step by step ' +
    'with questions and explanations. Be friendly and engaging.'
  );
  window.open(`https://claude.ai/new?q=${prompt}`, '_blank', 'noopener');
});

/* ── Weekly Planner ──────────────────────────────────────────────── */
let plannerGoals     = [];
let selectedPlanDate = dateToStr(new Date());
const plannerCache   = {}; // 'YYYY-MM-DD' → { schedule, goals }

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekDates() {
  const today  = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // rewind to Mon
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function renderWeekStrip() {
  const strip = document.getElementById('week-strip');
  if (!strip) return;
  const todayStr = dateToStr(new Date());
  strip.innerHTML = getWeekDates().map((d, i) => {
    const ds      = dateToStr(d);
    const cached  = plannerCache[ds];
    const hasData = cached && (cached.schedule?.trim() || cached.goals?.length > 0);
    const cls = ['week-day-btn',
      ds === todayStr        ? 'is-today'    : '',
      ds === selectedPlanDate ? 'is-selected' : '',
      hasData                ? 'has-data'    : '',
    ].filter(Boolean).join(' ');
    return `<button class="${cls}" data-date="${ds}" aria-label="${WEEK_DAYS[i]} ${d.getDate()}">
      <span class="wday-name">${WEEK_DAYS[i]}</span>
      <span class="wday-num">${d.getDate()}</span>
    </button>`;
  }).join('');
  strip.querySelectorAll('.week-day-btn').forEach(btn =>
    btn.addEventListener('click', () => switchPlannerDay(btn.dataset.date))
  );
}

function updatePlannerDateHeader() {
  // Use noon to avoid any DST / timezone-offset date-shifting
  const d = new Date(selectedPlanDate + 'T12:00:00');
  document.getElementById('planner-date-label').textContent =
    d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function switchPlannerDay(dateStr) {
  if (dateStr === selectedPlanDate) return;
  if (sbUser) await savePlannerSilent(); // persist current day quietly
  selectedPlanDate = dateStr;
  renderWeekStrip();
  updatePlannerDateHeader();
  await loadPlannerData();
}

async function loadWeekData() {
  if (!sbUser) return;
  const weekDates = getWeekDates().map(dateToStr);
  const { data } = await sb.from('daily_plans')
    .select('date, schedule, goals').eq('user_id', sbUser.id).in('date', weekDates);
  // Seed cache with empties for all 7 days, then overwrite with DB rows
  weekDates.forEach(ds => { if (!plannerCache[ds]) plannerCache[ds] = { schedule: '', goals: [] }; });
  if (data) data.forEach(r => { plannerCache[r.date] = { schedule: r.schedule || '', goals: r.goals || [] }; });
  renderWeekStrip();
  updatePlannerDateHeader();
  await loadPlannerData();
}

function showPlannerApp() {
  document.getElementById('planner-locked').classList.add('hidden');
  document.getElementById('planner-app').classList.remove('hidden');
  selectedPlanDate = dateToStr(new Date()); // always land on today
  if (sbProfile) document.getElementById('planner-user-badge').textContent = `👤 ${sbProfile.username}`;
  // Always land on Planner tab when opening the page
  switchPlannerTab('planner');
  loadWeekData();
  loadReminders(); // fire-and-forget, runs in parallel
}
function showPlannerLocked() {
  document.getElementById('planner-locked').classList.remove('hidden');
  document.getElementById('planner-app').classList.add('hidden');
}

async function loadPlannerData() {
  if (!sbUser) return;
  // Serve from cache when available (avoids redundant Supabase calls when switching days)
  if (plannerCache[selectedPlanDate]) {
    const c = plannerCache[selectedPlanDate];
    document.getElementById('planner-schedule').value = c.schedule;
    plannerGoals = [...c.goals];
    renderGoals();
    return;
  }
  const { data } = await sb.from('daily_plans')
    .select('*').eq('user_id', sbUser.id).eq('date', selectedPlanDate).single();
  plannerCache[selectedPlanDate] = { schedule: data?.schedule || '', goals: data?.goals || [] };
  document.getElementById('planner-schedule').value = plannerCache[selectedPlanDate].schedule;
  plannerGoals = [...plannerCache[selectedPlanDate].goals];
  renderGoals();
}

// Adds a completed goal to TODAY's plan (called by challenge submissions)
// Never throws — all errors are caught and logged so callers are never blocked.
async function addGoalToPlanner(text) {
  if (!sbUser) return;
  try {
    const today = dateToStr(new Date());
    if (!plannerCache[today]) {
      const { data, error } = await sb.from('daily_plans')
        .select('*').eq('user_id', sbUser.id).eq('date', today).single();
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found (expected on first use), anything else is a real error
        console.error('addGoalToPlanner: fetch error', error);
      }
      plannerCache[today] = { schedule: data?.schedule || '', goals: data?.goals || [] };
    }
    plannerCache[today].goals.push({ text, done: true, id: Date.now() });
    // Update live UI only if the planner is open and showing today
    if (currentPage === 'planner' && selectedPlanDate === today) {
      plannerGoals = [...plannerCache[today].goals];
      renderGoals();
    }
    const { error: upsertErr } = await sb.from('daily_plans').upsert(
      { user_id: sbUser.id, date: today, schedule: plannerCache[today].schedule,
        goals: plannerCache[today].goals, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );
    if (upsertErr) console.error('addGoalToPlanner: upsert error', upsertErr);
    renderWeekStrip();
  } catch (err) {
    console.error('addGoalToPlanner: unexpected error', err);
  }
}

function renderGoals() {
  const list = document.getElementById('goal-list');
  list.innerHTML = plannerGoals.map((g, i) => `
    <li class="goal-item${g.done ? ' goal-done' : ''}">
      <input type="checkbox" class="hw-check" ${g.done ? 'checked' : ''} data-idx="${i}" />
      <span class="goal-text">${g.text}</span>
      <button class="hw-delete" data-idx="${i}">×</button>
    </li>`).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => { plannerGoals[+cb.dataset.idx].done = cb.checked; renderGoals(); autoSavePlanner(); });
  });
  list.querySelectorAll('.hw-delete').forEach(btn => {
    btn.addEventListener('click', () => { plannerGoals.splice(+btn.dataset.idx, 1); renderGoals(); autoSavePlanner(); });
  });
  const done = plannerGoals.filter(g => g.done).length, total = plannerGoals.length;
  document.getElementById('goal-progress-text').textContent = `${done} of ${total} goals done`;
  document.getElementById('goal-progress-fill').style.width = total ? `${done / total * 100}%` : '0%';
  if (total > 0 && done === total) showToast('🎯 All goals complete! Incredible!', 'study-toast');
}

document.getElementById('goal-add-btn').addEventListener('click', addGoal);
document.getElementById('goal-input').addEventListener('keydown', e => { if (e.key === 'Enter') addGoal(); });

function addGoal() {
  const input = document.getElementById('goal-input');
  const text = input.value.trim();
  if (!text) return;
  plannerGoals.push({ text, done: false, id: Date.now() });
  input.value = '';
  renderGoals(); autoSavePlanner();
}

async function savePlanner() {
  if (!sbUser) return;
  const schedule = document.getElementById('planner-schedule').value;
  const statusEl = document.getElementById('planner-save-status');
  statusEl.textContent = 'Saving…';
  plannerCache[selectedPlanDate] = { schedule, goals: [...plannerGoals] };
  const { error } = await sb.from('daily_plans').upsert(
    { user_id: sbUser.id, date: selectedPlanDate, schedule, goals: plannerGoals, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,date' }
  );
  statusEl.textContent = error ? '❌ Save failed' : '✅ Saved!';
  if (!error) {
    setTimeout(() => { statusEl.textContent = ''; }, 2500);
    renderWeekStrip(); // refresh has-content dots
  }
}

// Silent save used when switching days — no status message, just persists + updates dots
async function savePlannerSilent() {
  if (!sbUser) return;
  const schedule = document.getElementById('planner-schedule').value;
  plannerCache[selectedPlanDate] = { schedule, goals: [...plannerGoals] };
  await sb.from('daily_plans').upsert(
    { user_id: sbUser.id, date: selectedPlanDate, schedule, goals: plannerGoals, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,date' }
  );
  renderWeekStrip();
}

let _savePlannerTimer = null;
function autoSavePlanner() { clearTimeout(_savePlannerTimer); _savePlannerTimer = setTimeout(savePlanner, 1500); }
document.getElementById('planner-save-btn').addEventListener('click', savePlanner);
document.getElementById('planner-schedule').addEventListener('input', autoSavePlanner);

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

// Returns the same index for everyone on the same calendar day (UTC), changes at midnight
function getDailyIndex(arr) {
  return Math.floor(Date.now() / 86400000) % arr.length;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3200);
}

function updateHeroStats() {
  challengesDone; tasksDone; co2Tracked; // track in memory
  updateDashStats();
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

/* ─── CHALLENGE PERSISTENCE ──────────────────────────────────────────── */

// Save a completion to Supabase — fire-and-forget, never blocks the UI.
// challenge_id is 'study' or 'eco'. The unique constraint on (user_id, challenge_id, date)
// means duplicate saves on the same day are silently ignored (23505 = unique_violation).
async function saveChallengeCompletion(type) {
  if (!sbUser) return;
  const { error } = await sb.from('challenge_completions')
    .insert({ user_id: sbUser.id, challenge_id: type, date: dateToStr(new Date()) });
  if (error && error.code !== '23505') {
    console.error('[Challenges] saveChallengeCompletion error:', error);
  }
}

// Fetch the last 8 days of completions and restore done state + streaks.
// Called on every login / session restore — never resets already-set local flags.
async function loadChallengeState() {
  if (!sbUser) return;
  const today  = dateToStr(new Date());
  const cutoff = dateToStr(new Date(Date.now() - 8 * 86400000));

  const { data, error } = await sb.from('challenge_completions')
    .select('challenge_id, date')
    .eq('user_id', sbUser.id)
    .gte('date', cutoff);

  if (error) {
    console.error('[Challenges] loadChallengeState error:', error);
    return;
  }

  const rows = data || [];
  const studyDates = new Set(rows.filter(r => r.challenge_id === 'study').map(r => r.date));
  const ecoDates   = new Set(rows.filter(r => r.challenge_id === 'eco').map(r => r.date));

  // Restore done state for today
  if (studyDates.has(today) && !studyDone) {
    studyDone = true;
    applyStudyDoneUI();
  }
  if (ecoDates.has(today) && !ecoDone) {
    ecoDone = true;
    applyEcoDoneUI();
  }

  // Recompute streaks from DB history and update UI
  studyStreak = computeChallengeStreak(studyDates);
  ecoStreak   = computeChallengeStreak(ecoDates);
  renderStreakDots('study-streak-dots', studyStreak);
  renderStreakDots('eco-streak-dots', ecoStreak);
  document.getElementById('study-streak-count').textContent =
    `${studyStreak} day${studyStreak !== 1 ? 's' : ''}`;
  document.getElementById('eco-streak-count').textContent =
    `${ecoStreak} day${ecoStreak !== 1 ? 's' : ''}`;
}

// Count consecutive days of completions ending at today (or yesterday if today not done yet).
function computeChallengeStreak(datesSet) {
  const today = dateToStr(new Date());
  const startOffset = datesSet.has(today) ? 0 : 1;
  let streak = 0;
  const now = new Date();
  for (let i = startOffset; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    if (datesSet.has(dateToStr(d))) streak++;
    else break;
  }
  return streak;
}

// Apply the "done today" visual state — called both after a fresh submission
// and when restoring state from Supabase on login.
function applyStudyDoneUI() {
  document.getElementById('study-proof-form').classList.add('hidden');
  document.getElementById('study-proof-saved').classList.remove('hidden');
  // Only set the text if it hasn't been set by a fresh submission this session
  const txt = document.getElementById('study-proof-saved-text');
  if (!txt.textContent.trim()) txt.textContent = '✓ Already completed today — great work!';
  document.getElementById('study-daily-btn').classList.add('hidden');
}

function applyEcoDoneUI() {
  document.getElementById('eco-proof-form').classList.add('hidden');
  document.getElementById('eco-proof-saved').classList.remove('hidden');
  const txt = document.getElementById('eco-proof-saved-text');
  if (!txt.textContent.trim()) txt.textContent = '✓ Already completed today — the planet thanks you!';
  document.getElementById('eco-daily-btn').classList.add('hidden');
}

/* ─── STUDY CHALLENGE ────────────────────────────────────────────────── */

let studyDone = false;

function loadStudyChallenge(idx, isPreview = false) {
  const c = studyChallenges[idx];
  document.getElementById('study-challenge-emoji').textContent = c.emoji;
  document.getElementById('study-challenge-text').textContent  = c.text;
  document.getElementById('study-xp').textContent  = `+${c.xp} XP`;
  document.getElementById('study-diff').textContent = c.diff;
  document.getElementById('study-daily-btn').classList.toggle('hidden', !isPreview);
  if (!studyDone) {
    document.getElementById('study-proof-text').value = '';
    document.getElementById('study-proof-form').classList.remove('hidden');
    document.getElementById('study-proof-saved').classList.add('hidden');
    const btn = document.getElementById('study-submit-btn');
    btn.disabled = false;
    btn.textContent = '✅ Submit & Earn XP';
  }
}

document.getElementById('study-submit-btn').addEventListener('click', () => {
  const text = document.getElementById('study-proof-text').value.trim();
  if (!text) { showToast('✍️ Describe what you did first!', ''); return; }

  // ── Complete the challenge immediately (no awaiting network) ──────────
  studyDone = true;
  studyStreak = Math.min(studyStreak + 1, 7);
  challengesDone++;
  renderStreakDots('study-streak-dots', studyStreak);
  document.getElementById('study-streak-count').textContent =
    `${studyStreak} day${studyStreak !== 1 ? 's' : ''}`;
  updateHeroStats();

  document.getElementById('study-proof-form').classList.add('hidden');
  document.getElementById('study-proof-saved').classList.remove('hidden');
  document.getElementById('study-proof-saved-text').textContent = `"${text}"`;
  document.getElementById('study-daily-btn').classList.add('hidden');

  showToast('🔥 Study challenge complete! Keep it up!', 'study-toast');
  addXP(studyChallenges[currentStudyChal].xp);

  // ── Save to Supabase in the background — never blocks the UI ────────
  if (sbUser) {
    saveChallengeCompletion('study');
    addGoalToPlanner(`📚 ${text}`).catch(err =>
      console.error('study: background planner save failed', err)
    );
  } else {
    showToast('Sign in to earn XP & save to Planner! 🌟', '');
  }
});

// Browse previews the next challenge; does NOT change your actual daily challenge
document.getElementById('new-study-challenge-btn').addEventListener('click', () => {
  const next = (currentStudyChal + 1) % studyChallenges.length;
  currentStudyChal = next;
  loadStudyChallenge(next, true);
});

// Return to today's date-locked challenge
document.getElementById('study-daily-btn').addEventListener('click', () => {
  currentStudyChal = getDailyIndex(studyChallenges);
  loadStudyChallenge(currentStudyChal, false);
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

let ecoDone = false;

function loadEcoChallenge(idx, isPreview = false) {
  const c = ecoChallenges[idx];
  document.getElementById('eco-challenge-emoji').textContent = c.emoji;
  document.getElementById('eco-challenge-text').textContent  = c.text;
  document.getElementById('eco-xp').textContent  = `+${c.xp} XP`;
  document.getElementById('eco-diff').textContent = c.diff;
  document.getElementById('eco-daily-btn').classList.toggle('hidden', !isPreview);
  if (!ecoDone) {
    document.getElementById('eco-proof-text').value = '';
    document.getElementById('eco-proof-form').classList.remove('hidden');
    document.getElementById('eco-proof-saved').classList.add('hidden');
    const btn = document.getElementById('eco-submit-btn');
    btn.disabled = false;
    btn.textContent = '✅ Submit & Earn XP';
  }
}

document.getElementById('eco-submit-btn').addEventListener('click', () => {
  const text = document.getElementById('eco-proof-text').value.trim();
  if (!text) { showToast('✍️ Describe your eco action first!', ''); return; }

  // ── Complete the challenge immediately (no awaiting network) ──────────
  ecoDone = true;
  ecoStreak = Math.min(ecoStreak + 1, 7);
  challengesDone++;
  co2Tracked++;
  renderStreakDots('eco-streak-dots', ecoStreak);
  document.getElementById('eco-streak-count').textContent =
    `${ecoStreak} day${ecoStreak !== 1 ? 's' : ''}`;
  updateHeroStats();

  document.getElementById('eco-proof-form').classList.add('hidden');
  document.getElementById('eco-proof-saved').classList.remove('hidden');
  document.getElementById('eco-proof-saved-text').textContent = `"${text}"`;
  document.getElementById('eco-daily-btn').classList.add('hidden');

  showToast('🌱 Eco mission complete! The planet thanks you!', 'eco-toast');
  addXP(ecoChallenges[currentEcoChal].xp);

  // ── Save to Supabase in the background — never blocks the UI ────────
  if (sbUser) {
    saveChallengeCompletion('eco');
    addGoalToPlanner(`🌍 ${text}`).catch(err =>
      console.error('eco: background planner save failed', err)
    );
  } else {
    showToast('Sign in to earn XP & save to Planner! 🌟', '');
  }
});

document.getElementById('new-eco-challenge-btn').addEventListener('click', () => {
  const next = (currentEcoChal + 1) % ecoChallenges.length;
  currentEcoChal = next;
  loadEcoChallenge(next, true);
});

document.getElementById('eco-daily-btn').addEventListener('click', () => {
  currentEcoChal = getDailyIndex(ecoChallenges);
  loadEcoChallenge(currentEcoChal, false);
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


/* ─── INIT ───────────────────────────────────────────────────────────── */

(function init() {
  // Lock to today's date-based challenge; same for every user on the same day
  currentStudyChal = getDailyIndex(studyChallenges);
  currentEcoChal   = getDailyIndex(ecoChallenges);
  loadStudyChallenge(currentStudyChal);
  loadEcoChallenge(currentEcoChal);
  renderStreakDots('study-streak-dots', 0);
  renderStreakDots('eco-streak-dots', 0);
  renderTip();
  buildFactDots();
  showFact(0);
  renderHWList();

  // seed a couple of example homework tasks
  hwTasks = [
    { text: 'Read Chapter 5', subject: '📖', done: false },
    { text: 'Complete exercises p.34', subject: '📐', done: false },
  ];
  renderHWList();
  // NOTE: buildCoachPresets() is called at the END of the file,
  // after const COACH_PRESETS has been initialised.
})();

/* ─── REMINDERS ──────────────────────────────────────────────────────── */

const REMINDERS_FIXED = [
  { id: 'r_water',     emoji: '💧', text: 'Drink 8 glasses of water today' },
  { id: 'r_move',      emoji: '🏃', text: 'Move your body for at least 10 minutes' },
  { id: 'r_gratitude', emoji: '🙏', text: 'Write down 3 things you\'re grateful for' },
  { id: 'r_phone',     emoji: '📵', text: 'Take a 30-minute break from your phone' },
];

const REMINDERS_POOL = [
  { id: 'rp_read',    emoji: '📖', text: 'Read for 15 minutes' },
  { id: 'rp_tidy',    emoji: '🧹', text: 'Tidy your study space' },
  { id: 'rp_outside', emoji: '🌳', text: 'Spend 10 minutes outside' },
  { id: 'rp_stretch', emoji: '🧘', text: 'Do 5 minutes of stretching or yoga' },
  { id: 'rp_snack',   emoji: '🍎', text: 'Eat a healthy snack instead of junk food' },
  { id: 'rp_kind',    emoji: '💛', text: 'Do something kind for someone today' },
  { id: 'rp_reflect', emoji: '📝', text: 'Spend 5 minutes reflecting on your day' },
  { id: 'rp_breath',  emoji: '🌬️', text: 'Try a 2-minute deep breathing exercise' },
  { id: 'rp_posture', emoji: '🪑', text: 'Check and correct your posture right now' },
  { id: 'rp_goals',   emoji: '🎯', text: 'Review your goals for this week' },
];

let todayReminders   = [];       // { id, emoji, text, done }
let remindersDoneSet = new Set();// reminder_ids completed today
let reminderDateSet  = new Set();// dates that have ≥1 completion (for streak)
let remindersStreak  = 0;
let currentPlannerTab = 'planner';

// Seeded daily shuffle — same 4 random picks for everyone on the same calendar day
function getDailyReminders() {
  const seed = Math.floor(Date.now() / 86400000);
  const pool = [...REMINDERS_POOL];
  let s = seed;
  for (let i = pool.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    const j = Math.abs(s) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...REMINDERS_FIXED, ...pool.slice(0, 4)];
}

function computeReminderStreak(dateSet) {
  const today = dateToStr(new Date());
  // Start from today if done, otherwise from yesterday
  const startOffset = dateSet.has(today) ? 0 : 1;
  let streak = 0;
  const now = new Date();
  for (let i = startOffset; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    if (dateSet.has(dateToStr(d))) streak++;
    else break;
  }
  return streak;
}

async function loadReminders() {
  if (!sbUser) return;
  const cutoff = dateToStr(new Date(Date.now() - 14 * 86400000));
  const { data } = await sb.from('reminders')
    .select('reminder_id, date')
    .eq('user_id', sbUser.id)
    .gte('date', cutoff);

  const today = dateToStr(new Date());
  remindersDoneSet = new Set(
    (data || []).filter(r => r.date === today).map(r => r.reminder_id)
  );
  reminderDateSet = new Set((data || []).map(r => r.date));
  remindersStreak = computeReminderStreak(reminderDateSet);

  const allDefs = getDailyReminders();
  todayReminders = allDefs.map(r => ({ ...r, done: remindersDoneSet.has(r.id) }));

  renderReminders();
}

function renderReminders() {
  console.log('[renderReminders] called — todayReminders.length =', todayReminders.length);
  // If loadReminders hasn't run yet, seed from getDailyReminders so there's always something to show
  if (todayReminders.length === 0) {
    todayReminders = getDailyReminders().map(r => ({ ...r, done: false }));
  }
  // Not-done first, done last
  const sorted = [...todayReminders].sort((a, b) => a.done - b.done);
  const list = document.getElementById('reminders-list');
  if (!list) return;

  list.innerHTML = sorted.map(r => `
    <div class="reminder-item${r.done ? ' reminder-done' : ''}" id="rem-item-${r.id}">
      <button class="reminder-check-btn${r.done ? ' is-done' : ''}"
              data-id="${r.id}" ${r.done ? 'disabled' : ''} aria-label="${r.done ? 'Done' : 'Mark done'}">
        ${r.done ? '✓' : ''}
      </button>
      <span class="reminder-emoji">${r.emoji}</span>
      <span class="reminder-text">${r.text}</span>
      ${!r.done ? '<span class="reminder-xp">+5 XP</span>' : ''}
    </div>
  `).join('');

  list.querySelectorAll('.reminder-check-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => completeReminder(btn.dataset.id));
  });

  const done  = todayReminders.filter(r => r.done).length;
  const total = todayReminders.length;
  const pct   = total ? (done / total * 100) : 0;

  const progText = document.getElementById('reminders-progress-text');
  const progFill = document.getElementById('reminders-progress-fill');
  if (progText) progText.textContent = `${done} of ${total} done today`;
  if (progFill) progFill.style.width = `${pct}%`;

  const streakEl    = document.getElementById('reminders-streak');
  const streakCount = document.getElementById('reminders-streak-count');
  if (streakEl && streakCount) {
    streakCount.textContent = remindersStreak;
    streakEl.classList.toggle('hidden', remindersStreak < 2);
  }

  if (done === total && total > 0) showToast('🌟 All habits done today! Amazing!', 'study-toast');

  updateReminderBadge();
}

function updateReminderBadge() {
  const remaining = todayReminders.filter(r => !r.done).length;
  const badge = document.getElementById('reminder-tab-badge');
  if (!badge) return;
  badge.textContent = remaining;
  badge.classList.toggle('hidden', remaining === 0);
}

function completeReminder(id) {
  const rem = todayReminders.find(r => r.id === id);
  if (!rem || rem.done) return;

  // Update local state immediately
  rem.done = true;
  remindersDoneSet.add(id);
  const today = dateToStr(new Date());
  const wasFirstToday = !reminderDateSet.has(today);
  reminderDateSet.add(today);
  if (wasFirstToday) {
    // Recompute streak now that today has a completion
    remindersStreak = computeReminderStreak(reminderDateSet);
  }

  // Animate item then re-render
  const el = document.getElementById(`rem-item-${id}`);
  if (el) el.classList.add('reminder-completing');
  setTimeout(() => renderReminders(), 350);

  showToast('✅ Habit done! +5 XP 🔥', 'study-toast');
  addXP(5);

  // Save to Supabase fire-and-forget
  if (sbUser) {
    sb.from('reminders')
      .insert({ user_id: sbUser.id, date: today, reminder_id: id })
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          // 23505 = unique_violation (already saved — harmless duplicate click)
          console.error('reminders: save failed', error);
        }
      });
  }
}

// Tab switching
document.getElementById('tab-planner-btn').addEventListener('click', () => switchPlannerTab('planner'));
document.getElementById('tab-reminders-btn').addEventListener('click', () => switchPlannerTab('reminders'));

function switchPlannerTab(tab) {
  currentPlannerTab = tab;
  document.getElementById('tab-planner-btn').classList.toggle('active', tab === 'planner');
  document.getElementById('tab-reminders-btn').classList.toggle('active', tab === 'reminders');
  document.getElementById('tab-planner-panel').classList.toggle('hidden', tab !== 'planner');
  document.getElementById('tab-reminders-panel').classList.toggle('hidden', tab !== 'reminders');
  document.querySelector('.pages').scrollTop = 0;
  // When switching to Reminders: if Supabase data has loaded, just re-render;
  // if it hasn't (user clicked before async returned), kick off the full load.
  if (tab === 'reminders') {
    if (todayReminders.length > 0) {
      renderReminders();
    } else if (sbUser) {
      loadReminders();
    } else {
      // Not logged in — still show the unchecked list so the page isn't blank
      renderReminders();
    }
  }
}

/* ─── AI COACH ───────────────────────────────────────────────────────── */

const COACH_PRESETS = [
  { id: 'study',   label: '📚 Study more',       value: 'I want to study more effectively and consistently' },
  { id: 'eco',     label: '🌍 Be eco-friendly',   value: 'I want to live a more eco-friendly lifestyle' },
  { id: 'fitness', label: '💪 Improve fitness',   value: 'I want to improve my physical fitness and exercise regularly' },
  { id: 'sleep',   label: '😴 Sleep better',      value: 'I want to sleep earlier and improve my sleep quality' },
  { id: 'screen',  label: '📵 Less screen time',  value: 'I want to reduce my screen time and phone usage' },
  { id: 'read',    label: '📖 Read more',         value: 'I want to read more books and develop a daily reading habit' },
];

function buildCoachPresets() {
  const grid = document.getElementById('coach-preset-grid');
  if (!grid) return;
  grid.innerHTML = COACH_PRESETS.map(p => `
    <label class="coach-preset-item">
      <input type="checkbox" id="coach-preset-${p.id}" value="${p.value}" />
      <span class="coach-preset-label">${p.label}</span>
    </label>
  `).join('');
}

function initCoachPage() {
  // Start the Response AI chat on first visit; keep history on return visits
  if (raiHistory.length === 0) raiInit();
}

document.getElementById('coach-generate-btn').addEventListener('click', () => {
  const typed    = document.getElementById('coach-goal-text').value.trim();
  const selected = COACH_PRESETS
    .filter(p => document.getElementById(`coach-preset-${p.id}`)?.checked)
    .map(p => p.value);
  const allGoals = [typed, ...selected].filter(Boolean).join(', ');

  if (!allGoals) {
    showToast('✍️ Enter some goals or pick from the list first!', '');
    return;
  }

  const prompt =
    `You are my personal habit coach. I am a student and these are my goals: ${allGoals}. ` +
    `Please start by asking me 3-4 questions to better understand my routine, schedule and habits. ` +
    `Then based on my answers, create a personalised weekly plan with specific habits, study times ` +
    `and eco actions for each day of the week. Be friendly, direct and specific.`;

  window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener');
});

// Called here (not inside init()) so that const COACH_PRESETS is fully
// initialised before buildCoachPresets() tries to read it.
buildCoachPresets();

/* ─── RESPONSE AI CHAT ─────────────────────────────────────────────── */

const RAI_SYSTEM =
  'You are Response AI, a critical personal coach focused on responsibility, organization, and confidence. ' +
  'The user just answered 4 questions about their lifestyle. Analyze their answers and give a direct, ' +
  'personalized plan with specific daily habits, routine improvements, nutrition tips, and goals. ' +
  'Be honest, push them to improve, and reference exactly what they answered. ' +
  'Keep it structured with clear sections. End by asking if they want to go deeper on any area.';

const RAI_QUESTIONS = [
  {
    text: "Hey! I'm Response AI – your personal coach for responsibility, organization and confidence. Let's start by learning about you! 💪\n\nWhat are your main goals? Pick all that apply:",
    options: [
      'A) Get fit and build muscle 💪',
      'B) Improve my daily routine 📅',
      'C) Eat healthier / improve diet 🥗',
      'D) Be more organized and productive 📋',
      'E) Improve mental health and confidence 🧠',
    ],
  },
  {
    text: 'How active are you currently?',
    options: [
      'A) Very active — I train 5+ days a week',
      'B) Moderately active — 2 to 4 days a week',
      'C) A little active — once a week or less',
      'D) Not active at all',
    ],
  },
  {
    text: 'What time do you usually wake up?',
    options: [
      'A) Before 6:30am ⚡',
      'B) 6:30am to 7:30am',
      'C) 7:30am to 9am',
      'D) After 9am',
    ],
  },
  {
    text: 'What is your biggest challenge right now?',
    options: [
      'A) Lack of motivation',
      'B) Poor sleep 😴',
      'C) Bad eating habits 🍕',
      'D) No consistent routine',
      'E) Too much stress 😤',
    ],
  },
];

let raiStep    = 0;    // 0=uninit 1-4=on question N 5=typing before claude 6=followup
let raiAnswers = [];   // answers to Q1-Q4
let raiHistory = [];   // { role:'ai'|'user', text }
let raiTyping  = false;

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function raiInit() {
  raiStep = 1; raiAnswers = []; raiHistory = []; raiTyping = false;
  const inputRow = document.getElementById('rai-input-row');
  if (inputRow) inputRow.classList.add('hidden');
  raiHistory.push({ role: 'ai', text: RAI_QUESTIONS[0].text });
  raiRender();
}

function raiRender() {
  const el = document.getElementById('rai-messages');
  if (!el) return;

  let html = raiHistory.map(m =>
    m.role === 'ai'
      ? `<div class="rai-msg rai-msg-ai">
           <div class="rai-avatar">🤖</div>
           <div class="rai-bubble rai-bubble-ai">${escHtml(m.text)}</div>
         </div>`
      : `<div class="rai-msg rai-msg-user">
           <div class="rai-bubble rai-bubble-user">${escHtml(m.text)}</div>
         </div>`
  ).join('');

  if (raiTyping) {
    html += `<div class="rai-msg rai-msg-ai">
               <div class="rai-avatar">🤖</div>
               <div class="rai-typing-bubble">
                 <div class="rai-typing-dot"></div>
                 <div class="rai-typing-dot"></div>
                 <div class="rai-typing-dot"></div>
               </div>
             </div>`;
  }

  if (raiStep >= 1 && raiStep <= 4 && !raiTyping) {
    const opts = RAI_QUESTIONS[raiStep - 1].options;
    html += `<div class="rai-options">${
      opts.map(o => `<button class="rai-option-btn" data-opt="${escHtml(o)}">${escHtml(o)}</button>`).join('')
    }</div>`;
  }

  el.innerHTML = html;
  el.querySelectorAll('.rai-option-btn').forEach(btn =>
    btn.addEventListener('click', () => raiPickOption(btn.dataset.opt))
  );
  el.scrollTop = el.scrollHeight;
}

function raiPickOption(optText) {
  if (raiTyping || raiStep < 1 || raiStep > 4) return;
  raiAnswers.push(optText);
  raiHistory.push({ role: 'user', text: optText });
  raiTyping = true;
  raiRender();

  if (raiStep < 4) {
    setTimeout(() => {
      raiTyping = false;
      raiStep++;
      raiHistory.push({ role: 'ai', text: RAI_QUESTIONS[raiStep - 1].text });
      raiRender();
    }, 800);
  } else {
    raiStep = 5;
    setTimeout(() => {
      raiTyping = false;
      raiSendToClaudeAI();
    }, 1200);
  }
}

function raiSendToClaudeAI() {
  const summary =
    `Q1 – Goals: ${raiAnswers[0]}\n` +
    `Q2 – Activity level: ${raiAnswers[1]}\n` +
    `Q3 – Wake-up time: ${raiAnswers[2]}\n` +
    `Q4 – Biggest challenge: ${raiAnswers[3]}`;

  const prompt = `${RAI_SYSTEM}\n\nHere are the user's answers:\n${summary}\n\nNow give your full personalized analysis and plan.`;
  window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener');

  raiStep = 6;
  raiHistory.push({
    role: 'ai',
    text: '📊 Your personalized plan is ready in Claude AI — check that tab now!\n\nCome back here anytime to ask me follow-up questions.',
  });

  const inputRow = document.getElementById('rai-input-row');
  if (inputRow) inputRow.classList.remove('hidden');
  raiRender();
}

function raiSendFollowup() {
  const input = document.getElementById('rai-input');
  const text = input?.value.trim();
  if (!text || raiTyping || raiStep < 6) return;
  input.value = '';

  raiHistory.push({ role: 'user', text });
  raiTyping = true;
  raiRender();

  setTimeout(() => {
    raiTyping = false;

    const historyLines = raiHistory
      .map(m => `${m.role === 'ai' ? 'Response AI' : 'User'}: ${m.text}`)
      .join('\n\n');

    const prompt =
      `${RAI_SYSTEM}\n\n` +
      `User profile:\nQ1 – Goals: ${raiAnswers[0]}\nQ2 – Activity: ${raiAnswers[1]}\n` +
      `Q3 – Wake-up: ${raiAnswers[2]}\nQ4 – Challenge: ${raiAnswers[3]}\n\n` +
      `Conversation so far:\n${historyLines}\n\n` +
      `Continue as Response AI, answering the user's latest follow-up directly.`;

    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener');

    raiHistory.push({ role: 'ai', text: '↗ Response ready in Claude AI — check the new tab!' });
    raiRender();
  }, 1000);
}

document.getElementById('rai-send-btn').addEventListener('click', raiSendFollowup);
document.getElementById('rai-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') raiSendFollowup();
});

/* ─── QUIZ INTERATIVO ────────────────────────────────────────────────── */

// ── 200-question bank: 40 per subject, 5 picked randomly each attempt ──
const QUIZ_DATA = {
  math: {
    label: '📐 Math',
    questions: [
      // Algebra
      { q: 'Solve: x + 7 = 15. What is x?',                       opts: ['6','7','8','9'],              ans: 2 },
      { q: 'Simplify: 3x + 2x',                                    opts: ['5x²','5x','6x','x⁵'],        ans: 1 },
      { q: 'What is 2a + 3 when a = 4?',                           opts: ['9','10','11','14'],           ans: 2 },
      { q: 'Expand: 2(x + 5)',                                      opts: ['2x + 5','2x + 10','x + 10','2x + 7'], ans: 1 },
      { q: 'Solve: 3x = 21. What is x?',                           opts: ['5','6','7','8'],              ans: 2 },
      { q: 'Simplify: 4y − y',                                     opts: ['3y','4y','5y','3'],           ans: 0 },
      { q: 'If n = 3, what is 4n − 2?',                            opts: ['8','10','12','14'],           ans: 1 },
      { q: 'Expand: 3(2x − 1)',                                     opts: ['6x − 1','6x − 3','5x − 3','6x + 3'], ans: 1 },
      // Fractions & Percentages
      { q: 'What is 1/2 + 1/4?',                                   opts: ['1/3','3/4','2/3','3/8'],     ans: 1 },
      { q: 'Simplify 6/8 to its lowest terms.',                    opts: ['2/3','3/4','4/6','1/2'],     ans: 1 },
      { q: 'What is 20% of 150?',                                  opts: ['25','30','35','40'],          ans: 1 },
      { q: 'Convert 0.75 to a fraction.',                          opts: ['3/5','7/10','3/4','7/9'],    ans: 2 },
      { q: 'What is 3/4 of 48?',                                   opts: ['32','36','40','42'],          ans: 1 },
      { q: 'What percentage of 80 is 20?',                         opts: ['20%','25%','30%','15%'],      ans: 1 },
      { q: 'What is 2/3 + 1/6?',                                   opts: ['3/9','5/6','4/9','3/6'],     ans: 1 },
      { q: 'Increase 60 by 15%.',                                  opts: ['66','69','72','75'],          ans: 1 },
      // Geometry
      { q: 'Area of a rectangle: length 8 cm, width 5 cm?',       opts: ['30 cm²','40 cm²','45 cm²','26 cm²'], ans: 1 },
      { q: 'What do the angles of a triangle always add up to?',   opts: ['90°','180°','270°','360°'],   ans: 1 },
      { q: 'Perimeter of a square with sides of 6 cm?',           opts: ['18 cm','24 cm','36 cm','12 cm'], ans: 1 },
      { q: 'Area of a triangle: base 10 cm, height 6 cm?',        opts: ['30 cm²','60 cm²','16 cm²','45 cm²'], ans: 0 },
      { q: 'What is the longest side of a right-angled triangle called?', opts: ['Adjacent','Opposite','Hypotenuse','Tangent'], ans: 2 },
      { q: 'Volume of a cube with sides of 3 cm?',                opts: ['9 cm³','18 cm³','27 cm³','36 cm³'], ans: 2 },
      { q: 'Two angles of a triangle are 40° and 75°. What is the third?', opts: ['55°','60°','65°','70°'], ans: 2 },
      { q: 'Circumference of a circle with radius 7 cm? (π ≈ 3.14)', opts: ['22 cm','43.96 cm','49 cm','153.86 cm'], ans: 1 },
      // Numbers
      { q: 'Which of these is a prime number?',                    opts: ['9','15','17','21'],           ans: 2 },
      { q: 'What is 2⁴ (2 to the power of 4)?',                   opts: ['8','12','16','24'],           ans: 2 },
      { q: 'What is the HCF of 12 and 18?',                       opts: ['3','4','6','9'],              ans: 2 },
      { q: 'What is −3 × −4?',                                    opts: ['−12','−7','7','12'],          ans: 3 },
      { q: 'What is the LCM of 4 and 6?',                         opts: ['8','12','18','24'],           ans: 1 },
      { q: 'What is −8 + 5?',                                     opts: ['−13','−3','3','13'],          ans: 1 },
      { q: 'What is 3² + 4²?',                                    opts: ['14','24','25','49'],          ans: 2 },
      { q: 'How many factors does 24 have?',                       opts: ['6','7','8','9'],              ans: 2 },
      // Statistics
      { q: 'Find the mean of: 4, 7, 5, 8, 6',                     opts: ['5','6','7','8'],              ans: 1 },
      { q: 'Find the median of: 3, 7, 5, 1, 9',                   opts: ['3','5','7','9'],              ans: 1 },
      { q: 'Find the mode of: 2, 4, 4, 7, 3, 4, 2',               opts: ['2','3','4','7'],              ans: 2 },
      { q: 'Find the range of: 12, 5, 19, 3, 11',                 opts: ['14','15','16','17'],          ans: 2 },
      { q: 'A bag has 4 red and 6 blue marbles. P(red) = ?',       opts: ['1/4','2/5','3/5','1/2'],     ans: 1 },
      { q: '18 of 30 students prefer football. What fraction prefer tennis?', opts: ['1/5','2/5','3/5','3/10'], ans: 1 },
      { q: 'In a bar chart, the tallest bar represents the ___.',  opts: ['mean','median','mode','range'], ans: 2 },
      { q: 'Find the mean of: 10, 20, 30, 40, 50',                opts: ['25','30','35','40'],          ans: 1 },
    ],
  },

  english: {
    label: '📖 English',
    questions: [
      // Grammar & Punctuation
      { q: 'Which punctuation mark is used to introduce a list?',  opts: ['Comma','Semi-colon','Colon','Apostrophe'], ans: 2 },
      { q: 'In "It\'s raining", what does "it\'s" mean?',          opts: ['Belonging to it','It is','It has always been','In that case'], ans: 1 },
      { q: 'Which sentence is an interrogative (question)?',       opts: ['Close the door.','The door is closed.','Is the door closed?','What a door!'], ans: 2 },
      { q: 'Where does the apostrophe go in "the dog bone" (one dog)? ', opts: ["dog's bone","dogs' bone","dogs bone'","dog bone's"], ans: 0 },
      { q: 'Which uses a semicolon correctly?',                    opts: ['I like cats; dogs.','I like cats; and dogs.','I like cats; I also like dogs.','I; like cats.'], ans: 2 },
      { q: 'What type of sentence usually ends with an exclamation mark?', opts: ['Declarative','Interrogative','Exclamatory','Imperative'], ans: 2 },
      { q: 'Which word needs a capital letter?',                   opts: ['river','mountain','london','tree'], ans: 2 },
      { q: 'Which punctuation encloses extra information in a sentence?', opts: ['Colons','Dashes or brackets','Commas only','Speech marks'], ans: 1 },
      // Literary Devices
      { q: '"The moon is a silver coin." What device is this?',    opts: ['Simile','Metaphor','Personification','Alliteration'], ans: 1 },
      { q: '"Her smile was as bright as the sun." What device?',   opts: ['Metaphor','Simile','Alliteration','Oxymoron'], ans: 1 },
      { q: '"The wind whispered through the trees." What device?', opts: ['Alliteration','Oxymoron','Personification','Simile'], ans: 2 },
      { q: '"Peter Piper picked a peck of pickled peppers." What device?', opts: ['Alliteration','Onomatopoeia','Metaphor','Personification'], ans: 0 },
      { q: '"Deafening silence" is an example of:',               opts: ['Simile','Alliteration','Oxymoron','Hyperbole'], ans: 2 },
      { q: '"I\'ve told you a million times!" What device is this?', opts: ['Metaphor','Oxymoron','Alliteration','Hyperbole'], ans: 3 },
      { q: 'Buzz, hiss, crackle — words that sound like the noises they name are:', opts: ['Personification','Onomatopoeia','Simile','Alliteration'], ans: 1 },
      { q: 'Which is an example of alliteration?',                opts: ['The sun rose slowly','Sally sells seashells','Life is a dream','The angry waves'], ans: 1 },
      // Vocabulary
      { q: 'What is a synonym for "brave"?',                      opts: ['Cowardly','Fearful','Courageous','Nervous'], ans: 2 },
      { q: 'What is an antonym (opposite) of "ancient"?',         opts: ['Old','Modern','Historic','Antique'], ans: 1 },
      { q: 'The prefix "un-" usually means:',                     opts: ['Again','Not or opposite','Before','After'], ans: 1 },
      { q: 'What does the suffix "-ful" add to a word?',          opts: ['Without','Having a quality','Someone who does','Related to'], ans: 1 },
      { q: 'Which word means to speak quietly and privately?',    opts: ['Shout','Whisper','Lecture','Announce'], ans: 1 },
      { q: 'What is a synonym for "enormous"?',                   opts: ['Tiny','Huge','Narrow','Bright'], ans: 1 },
      { q: 'The prefix "mis-" means:',                            opts: ['Again','Before','Wrongly or badly','Under'], ans: 2 },
      { q: 'What does "benevolent" mean?',                        opts: ['Cruel and harsh','Kind and generous','Shy and quiet','Loud and confident'], ans: 1 },
      // Parts of Speech
      { q: 'In "The quick fox jumped", what type of word is "jumped"?', opts: ['Noun','Adjective','Verb','Adverb'], ans: 2 },
      { q: 'Which word is a proper noun?',                        opts: ['cat','city','Paris','building'], ans: 2 },
      { q: 'In "She ran quickly", what type of word is "quickly"?', opts: ['Adjective','Adverb','Verb','Noun'], ans: 1 },
      { q: 'Which word is a conjunction?',                        opts: ['Quickly','Blue','Because','Run'], ans: 2 },
      { q: 'In "The happy children played", what is the adjective?', opts: ['children','played','happy','The'], ans: 2 },
      { q: 'Which of these is a pronoun?',                        opts: ['Tree','Run','She','Quickly'], ans: 2 },
      { q: 'What type of noun is "happiness"?',                   opts: ['Proper noun','Common noun','Abstract noun','Collective noun'], ans: 2 },
      { q: 'Which word is a preposition?',                        opts: ['Run','Happy','Under','And'], ans: 2 },
      // Literature
      { q: 'Who wrote Romeo and Juliet?',                         opts: ['Charles Dickens','William Shakespeare','Jane Austen','Homer'], ans: 1 },
      { q: 'Who wrote the Harry Potter series?',                  opts: ['Roald Dahl','J.R.R. Tolkien','J.K. Rowling','C.S. Lewis'], ans: 2 },
      { q: 'A haiku is a poem with how many lines?',              opts: ['2','3','4','5'], ans: 1 },
      { q: 'Who wrote The Lion, the Witch and the Wardrobe?',     opts: ['J.K. Rowling','Roald Dahl','J.R.R. Tolkien','C.S. Lewis'], ans: 3 },
      { q: 'What is the literary term for the main character?',   opts: ['Antagonist','Narrator','Protagonist','Villain'], ans: 2 },
      { q: 'How many lines does a sonnet have?',                  opts: ['8','10','12','14'], ans: 3 },
      { q: 'Who wrote Charlie and the Chocolate Factory?',        opts: ['Dr. Seuss','Roald Dahl','C.S. Lewis','J.K. Rowling'], ans: 1 },
      { q: 'When a character speaks alone on stage, it is called a:', opts: ['Monologue','Dialogue','Soliloquy','Aside'], ans: 2 },
    ],
  },

  science: {
    label: '🔬 Science',
    questions: [
      // Biology
      { q: 'What is the "powerhouse of the cell"?',               opts: ['Nucleus','Mitochondria','Cell wall','Vacuole'], ans: 1 },
      { q: 'What do plants need for photosynthesis?',             opts: ['Water and oxygen','CO₂, water and light','Soil, air and rain','Nitrogen, water and sunlight'], ans: 1 },
      { q: 'How many chambers does a human heart have?',          opts: ['2','3','4','5'], ans: 2 },
      { q: 'Which organ filters waste products from the blood?',  opts: ['Liver','Lungs','Kidneys','Stomach'], ans: 2 },
      { q: 'Who is known as the father of evolution?',            opts: ['Isaac Newton','Albert Einstein','Charles Darwin','Gregor Mendel'], ans: 2 },
      { q: 'What is the process by which plants make food using sunlight?', opts: ['Respiration','Transpiration','Photosynthesis','Osmosis'], ans: 2 },
      { q: 'What part of a cell controls what enters and leaves it?', opts: ['Cell wall','Nucleus','Cell membrane','Cytoplasm'], ans: 2 },
      { q: 'Organisms passing traits to offspring is called:',    opts: ['Evolution','Heredity','Mutation','Adaptation'], ans: 1 },
      // Chemistry
      { q: 'What is the symbol for the element Gold?',            opts: ['Go','Gd','Au','Ag'], ans: 2 },
      { q: 'What is the chemical symbol for Iron?',               opts: ['Ir','In','Fe','Fo'], ans: 2 },
      { q: 'What is the most abundant gas in Earth\'s atmosphere?', opts: ['Oxygen','Carbon dioxide','Nitrogen','Hydrogen'], ans: 2 },
      { q: 'Which state of matter has a definite shape and volume?', opts: ['Gas','Liquid','Solid','Plasma'], ans: 2 },
      { q: 'At what temperature does water boil?',                opts: ['90°C','95°C','100°C','110°C'], ans: 2 },
      { q: 'What is the atomic number of Carbon?',                opts: ['4','6','8','12'], ans: 1 },
      { q: 'Which type of reaction releases heat energy?',        opts: ['Endothermic','Exothermic','Neutralisation','Decomposition'], ans: 1 },
      { q: 'How many elements are in the periodic table (approx)?', opts: ['78','98','118','138'], ans: 2 },
      // Physics
      { q: 'What is the unit of electric current?',               opts: ['Volt','Watt','Ampere','Ohm'], ans: 2 },
      { q: 'What force opposes motion between surfaces?',         opts: ['Gravity','Friction','Tension','Magnetism'], ans: 1 },
      { q: 'What is the approximate speed of light?',             opts: ['300,000 km/s','30,000 km/s','3,000 km/s','3,000,000 km/s'], ans: 0 },
      { q: 'What unit measures force?',                           opts: ['Joule','Watt','Newton','Pascal'], ans: 2 },
      { q: 'What energy is stored in a stretched elastic band?',  opts: ['Kinetic','Chemical','Elastic potential','Thermal'], ans: 2 },
      { q: 'When frequency increases, the pitch of a sound gets:', opts: ['Quieter','Lower','Higher','Disappears'], ans: 2 },
      { q: 'Every action has an equal and opposite reaction. Whose law?', opts: ["Newton's First","Newton's Second","Newton's Third","Ohm's Law"], ans: 2 },
      { q: 'What is the unit of electrical resistance?',          opts: ['Volt','Ampere','Watt','Ohm'], ans: 3 },
      // Space
      { q: 'How many planets are in our solar system?',           opts: ['7','8','9','10'], ans: 1 },
      { q: 'What is the closest star to Earth?',                  opts: ['Sirius','Betelgeuse','The Sun','Alpha Centauri'], ans: 2 },
      { q: 'Which planet is known as the Red Planet?',            opts: ['Venus','Jupiter','Mars','Saturn'], ans: 2 },
      { q: 'What causes day and night on Earth?',                 opts: ['Earth orbiting the Sun','The Moon\'s shadow','Earth\'s rotation on its axis','The Sun moving'], ans: 2 },
      { q: 'What is a light-year?',                              opts: ['Time for light to travel a year','Speed of light','Distance light travels in a year','Brightness unit'], ans: 2 },
      { q: 'Which is the largest planet in our solar system?',    opts: ['Saturn','Uranus','Neptune','Jupiter'], ans: 3 },
      { q: 'What keeps planets in orbit around the Sun?',         opts: ['Magnetism','Friction','Gravity','Wind'], ans: 2 },
      { q: 'How long does Earth take to orbit the Sun?',          opts: ['1 month','6 months','1 year','24 hours'], ans: 2 },
      // Environment
      { q: 'In a food chain, organisms that make their own food are:', opts: ['Consumers','Decomposers','Producers','Predators'], ans: 2 },
      { q: 'What is the main greenhouse gas from burning fossil fuels?', opts: ['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'], ans: 2 },
      { q: 'Animals that eat only plants are called:',            opts: ['Carnivores','Omnivores','Herbivores','Decomposers'], ans: 2 },
      { q: 'Biodiversity means:',                                 opts: ['A type of plant','The variety of life in an area','A food chain','Climate change'], ans: 1 },
      { q: 'Which is the world\'s largest ecosystem?',            opts: ['Amazon rainforest','Arctic tundra','The ocean','African savannah'], ans: 2 },
      { q: 'What is the process of forests being cleared by humans?', opts: ['Erosion','Deforestation','Pollution','Desertification'], ans: 1 },
      { q: 'An apex predator is one that:',                       opts: ['Is a producer','Is prey','Has no natural predators','Is a decomposer'], ans: 2 },
      { q: 'Rising global temperatures due to human activity is called:', opts: ['Global cooling','Global warming','The ozone effect','Acid rain'], ans: 1 },
    ],
  },

  geography: {
    label: '🌍 Geography',
    questions: [
      // World Knowledge
      { q: 'What is the capital of France?',                      opts: ['Lyon','Marseille','Paris','Nice'], ans: 2 },
      { q: 'Which is the largest continent by area?',             opts: ['Africa','North America','Europe','Asia'], ans: 3 },
      { q: 'How many continents are there on Earth?',             opts: ['5','6','7','8'], ans: 2 },
      { q: 'Which ocean lies between Europe and North America?',  opts: ['Pacific','Indian','Atlantic','Arctic'], ans: 2 },
      { q: 'What is the capital of Japan?',                       opts: ['Shanghai','Seoul','Beijing','Tokyo'], ans: 3 },
      { q: 'What is the capital of Brazil?',                      opts: ['Rio de Janeiro','São Paulo','Brasília','Buenos Aires'], ans: 2 },
      { q: 'Which is the largest ocean?',                         opts: ['Atlantic','Indian','Arctic','Pacific'], ans: 3 },
      { q: 'What is the longest river in the world?',             opts: ['Amazon','Yangtze','Nile','Mississippi'], ans: 2 },
      // Physical Geography
      { q: 'What is molten rock called when it reaches Earth\'s surface?', opts: ['Magma','Lava','Pumice','Granite'], ans: 1 },
      { q: 'What is the highest mountain in the world?',          opts: ['K2','Mont Blanc','Mount Everest','Kilimanjaro'], ans: 2 },
      { q: 'The Amazon River flows through which continent?',     opts: ['Africa','Asia','North America','South America'], ans: 3 },
      { q: 'Which type of rock is formed from cooled volcanic lava?', opts: ['Sedimentary','Metamorphic','Igneous','Limestone'], ans: 2 },
      { q: 'What was the name of the ancient supercontinent?',    opts: ['Atlantis','Pangaea','Gondwana','Laurasia'], ans: 1 },
      { q: 'Where do most earthquakes occur?',                    opts: ['In the ocean','Far from tectonic plates','At plate boundaries','At the poles'], ans: 2 },
      { q: 'A river delta is where a river:',                     opts: ['Starts its journey','Gets widest','Fans out as it meets the sea','Goes underground'], ans: 2 },
      { q: 'Which is the deepest point on Earth?',                opts: ['Java Trench','Puerto Rico Trench','Mariana Trench','Tonga Trench'], ans: 2 },
      // Climate
      { q: 'What climate type is found near the equator?',        opts: ['Polar','Temperate','Tropical','Desert'], ans: 2 },
      { q: 'What causes the seasons on Earth?',                   opts: ['Distance from the Sun','Earth\'s tilt on its axis','The Moon\'s gravity','Solar flares'], ans: 1 },
      { q: 'Which climate zone has very little rainfall?',        opts: ['Tropical','Desert','Temperate','Mediterranean'], ans: 1 },
      { q: 'El Niño is:',                                         opts: ['A type of hurricane','Unusual warming of the Pacific Ocean','A monsoon season','A drought in Africa'], ans: 1 },
      { q: 'Seasons are reversed compared to the UK in which hemisphere?', opts: ['Northern','Southern','Eastern','Western'], ans: 1 },
      { q: 'What is a rapidly rotating column of air called?',    opts: ['Tsunami','Earthquake','Tornado','Blizzard'], ans: 2 },
      { q: 'A huge wave caused by an undersea earthquake is called a:', opts: ['Hurricane','Tornado','Tsunami','Monsoon'], ans: 2 },
      { q: 'Which country experiences the most hurricanes?',      opts: ['UK','Australia','USA','Russia'], ans: 2 },
      // Human Geography
      { q: 'Urbanisation means:',                                 opts: ['Moving to rural areas','Growth of cities','Decline of industry','Building new farms'], ans: 1 },
      { q: 'Which is a "push factor" causing migration?',         opts: ['Better jobs','Family connections','War or conflict','Better climate'], ans: 2 },
      { q: 'Countries with high incomes and strong economies are called:', opts: ['LEDCs','MEDCs','Developing countries','Third World'], ans: 1 },
      { q: 'What is the world\'s largest city by population?',    opts: ['New York','London','Tokyo','Shanghai'], ans: 2 },
      { q: 'Moving from one country to another permanently is called:', opts: ['Tourism','Commuting','Migration','Urbanisation'], ans: 2 },
      { q: 'Which of these is a renewable energy source?',        opts: ['Coal','Oil','Wind power','Natural gas'], ans: 2 },
      { q: 'GDP stands for:',                                     opts: ['Gross Development Plan','Gross Domestic Product','Global Development Progress','Government Delivery Programme'], ans: 1 },
      { q: 'Which continent has the highest proportion of people in poverty?', opts: ['Asia','South America','Africa','Oceania'], ans: 2 },
      // Landmarks
      { q: 'In which country is the Eiffel Tower?',               opts: ['Italy','Spain','Germany','France'], ans: 3 },
      { q: 'In which country is the Taj Mahal?',                  opts: ['Pakistan','Bangladesh','India','Sri Lanka'], ans: 2 },
      { q: 'The Great Barrier Reef is off the coast of:',         opts: ['New Zealand','Australia','South Africa','Indonesia'], ans: 1 },
      { q: 'In which city is the Statue of Liberty?',             opts: ['Washington D.C.','Los Angeles','Chicago','New York City'], ans: 3 },
      { q: 'The pyramids of Giza are in which country?',          opts: ['Morocco','Sudan','Egypt','Libya'], ans: 2 },
      { q: 'Machu Picchu is an ancient site in:',                 opts: ['Brazil','Colombia','Peru','Bolivia'], ans: 2 },
      { q: 'The Great Wall of China was primarily built to:',     opts: ['Control trade routes','Protect against northern invasions','Mark territory','Act as a road'], ans: 1 },
      { q: 'In which country is the Colosseum?',                  opts: ['Greece','Spain','France','Italy'], ans: 3 },
    ],
  },

  art: {
    label: '🎨 Art',
    questions: [
      // Famous Artists
      { q: 'Who painted the Mona Lisa?',                          opts: ['Michelangelo','Raphael','Leonardo da Vinci','Donatello'], ans: 2 },
      { q: 'Which artist famously cut off part of his own ear?',  opts: ['Pablo Picasso','Vincent van Gogh','Salvador Dalí','Claude Monet'], ans: 1 },
      { q: 'Frida Kahlo was a famous artist from:',               opts: ['Spain','Brazil','Mexico','Argentina'], ans: 2 },
      { q: 'Which street artist is known for anonymous satirical work?', opts: ['Andy Warhol','Banksy','Keith Haring','Jean-Michel Basquiat'], ans: 1 },
      { q: 'Claude Monet was the leading figure in which movement?', opts: ['Cubism','Surrealism','Impressionism','Expressionism'], ans: 2 },
      { q: 'Salvador Dalí was known for which style?',            opts: ['Cubism','Impressionism','Realism','Surrealism'], ans: 3 },
      { q: 'Who painted the Sistine Chapel ceiling?',             opts: ['Leonardo da Vinci','Raphael','Michelangelo','Botticelli'], ans: 2 },
      { q: 'Andy Warhol was famous for which art movement?',      opts: ['Abstract Expressionism','Pop Art','Surrealism','Minimalism'], ans: 1 },
      // Art Movements
      { q: 'Which movement began in 14th-century Italy celebrating classical learning?', opts: ['Baroque','Renaissance','Romanticism','Impressionism'], ans: 1 },
      { q: 'Impressionists were known for painting:',             opts: ['Perfect geometry','Dark scenes','Light and everyday life with loose brushstrokes','Dreamlike images'], ans: 2 },
      { q: 'Which movement broke objects into geometric shapes?',  opts: ['Surrealism','Pop Art','Impressionism','Cubism'], ans: 3 },
      { q: 'Surrealism explored:',                                opts: ['Political protest','Dreams and the unconscious mind','Consumer culture','Ancient religious themes'], ans: 1 },
      { q: 'Pop Art celebrated:',                                 opts: ['Ancient myth','Mass media and popular culture','Natural landscapes','Personal suffering'], ans: 1 },
      { q: 'Baroque art (17th century) is known for being:',      opts: ['Simple and minimal','Dramatic, detailed and emotional','Abstract and unclear','Flat and colourless'], ans: 1 },
      { q: 'Which movement rejected tradition to express raw emotions?', opts: ['Realism','Classicism','Expressionism','Minimalism'], ans: 2 },
      { q: 'Abstract art is art that:',                           opts: ['Looks exactly like real life','Tells a clear story','Does not represent real objects','Uses only black and white'], ans: 2 },
      // Colour Theory
      { q: 'What are the three primary colours (traditional pigment)?', opts: ['Red, green, blue','Red, yellow, blue','Orange, purple, green','Cyan, magenta, yellow'], ans: 1 },
      { q: 'What do you get when you mix red and blue?',          opts: ['Orange','Green','Purple','Brown'], ans: 2 },
      { q: 'Which colours are called "warm" colours?',            opts: ['Blue, green, purple','Red, orange, yellow','Grey, white, black','Teal, cyan, indigo'], ans: 1 },
      { q: 'Complementary colours are:',                          opts: ['Similar colours','Opposite colours on the colour wheel','Shades of the same colour','Skin-tone colours'], ans: 1 },
      { q: 'What is the complementary colour of blue?',           opts: ['Purple','Green','Orange','Red'], ans: 2 },
      { q: 'Mixing all colours of light (RGB) together gives:',   opts: ['Black','Brown','Grey','White'], ans: 3 },
      { q: 'Secondary colours are:',                              opts: ['Red, yellow, blue','Made by mixing two primary colours','Very dark colours','Shades of grey'], ans: 1 },
      { q: 'Adding white to a colour creates a:',                 opts: ['Shade','Tint','Tone','Hue'], ans: 1 },
      // Techniques
      { q: 'In art, perspective is used to:',                     opts: ['Make colours brighter','Show depth and distance on a flat surface','Mix paints','Show texture'], ans: 1 },
      { q: 'Which technique shows where light and shadow fall?',  opts: ['Perspective','Composition','Shading','Stippling'], ans: 2 },
      { q: '"Composition" in art means:',                         opts: ['The colours used','The arrangement of elements','The type of paint','The size of the artwork'], ans: 1 },
      { q: 'Stippling is a technique using:',                     opts: ['Thick strokes','Small dots to build tone and texture','Cross-hatching lines','Smooth gradients'], ans: 1 },
      { q: 'Cross-hatching involves:',                            opts: ['Layering transparent paint','Lines in opposite directions to create tone','Blending with a finger','Pressing objects into clay'], ans: 1 },
      { q: 'The "rule of thirds" improves:',                      opts: ['Colour mixing','Composition','Three-point perspective','Print quality'], ans: 1 },
      { q: 'A vanishing point is used in:',                       opts: ['Colour theory','Linear perspective','Life drawing','Printmaking'], ans: 1 },
      { q: 'Proportion in art means:',                            opts: ['The speed of painting','The amount of paint','The correct size relationship between parts','The depth of shadow'], ans: 2 },
      // Famous Works
      { q: 'Who painted The Starry Night?',                       opts: ['Claude Monet','Vincent van Gogh','Pablo Picasso','Salvador Dalí'], ans: 1 },
      { q: 'The Persistence of Memory (melting clocks) was painted by:', opts: ['René Magritte','Pablo Picasso','Salvador Dalí','Max Ernst'], ans: 2 },
      { q: 'Girl with a Pearl Earring was painted by:',           opts: ['Rembrandt','Jan Vermeer','Rubens','Leonardo da Vinci'], ans: 1 },
      { q: 'Guernica, depicting the horrors of war, was created by:', opts: ['Henri Matisse','Salvador Dalí','Pablo Picasso','Claude Monet'], ans: 2 },
      { q: 'The Birth of Venus was painted by:',                  opts: ['Leonardo da Vinci','Michelangelo','Raphael','Sandro Botticelli'], ans: 3 },
      { q: 'The Last Supper depicts:',                            opts: ["Jesus's baptism","Jesus's final meal with his disciples","The crucifixion","The resurrection"], ans: 1 },
      { q: 'Monet\'s water lily paintings belong to which movement?', opts: ['Cubism','Surrealism','Impressionism','Expressionism'], ans: 2 },
      { q: 'The Scream was painted by which Expressionist artist?', opts: ['Vincent van Gogh','Edvard Munch','Emil Nolde','Ernst Kirchner'], ans: 1 },
    ],
  },
};

// Fisher-Yates shuffle — returns a new shuffled copy of the array
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUIZ_QUESTIONS_PER_ROUND = 5;

let quizSubject   = 'math';
let quizQuestions = [];    // the 5 randomly selected questions for this attempt
let quizQIndex    = 0;
let quizScore     = 0;
let quizAnswered  = false;
let quizDone      = false;

function initQuiz(subject) {
  quizSubject   = subject;
  quizQIndex    = 0;
  quizScore     = 0;
  quizAnswered  = false;
  quizDone      = false;
  // Pick QUIZ_QUESTIONS_PER_ROUND random questions from the full 40-question pool
  quizQuestions = shuffleArray(QUIZ_DATA[subject].questions).slice(0, QUIZ_QUESTIONS_PER_ROUND);
  renderQuiz();
}

function renderQuiz() {
  const body = document.getElementById('quiz-body');
  if (!body) return;

  if (quizDone) {
    const total = quizQuestions.length;
    const pct   = quizScore / total;
    const msg   = pct === 1   ? '🌟 Perfect score!'     :
                  pct >= .8   ? '🔥 Excellent!'          :
                  pct >= .6   ? '👍 Well done!'          :
                  pct >= .4   ? '📚 Keep practising!'    : '💪 Study harder!';
    body.innerHTML = `
      <div class="quiz-result">
        <div class="quiz-result-score">${quizScore}/${total}</div>
        <div class="quiz-result-label">correct answers</div>
        <div class="quiz-result-msg">${msg}</div>
        <div class="quiz-xp-earned">🌟 +10 XP earned!</div><br>
        <button class="btn btn-study btn-sm" id="quiz-retry-btn">🔄 New Questions</button>
      </div>`;
    document.getElementById('quiz-retry-btn').addEventListener('click', () => initQuiz(quizSubject));
    return;
  }

  const q   = quizQuestions[quizQIndex];
  const tot = quizQuestions.length;
  const pct = (quizQIndex / tot) * 100;

  body.innerHTML = `
    <div class="quiz-question-wrap">
      <div class="quiz-progress-row">
        <span class="quiz-progress-text">Q${quizQIndex + 1} of ${tot}</span>
        <div class="quiz-progress-track">
          <div class="quiz-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="quiz-q-text">${escHtml(q.q)}</div>
    </div>
    <div class="quiz-options">
      ${q.opts.map((opt, i) => `
        <button class="quiz-option-btn" data-idx="${i}">${escHtml(opt)}</button>
      `).join('')}
    </div>`;

  body.querySelectorAll('.quiz-option-btn').forEach(btn =>
    btn.addEventListener('click', () => answerQuiz(+btn.dataset.idx))
  );
}

function answerQuiz(idx) {
  if (quizAnswered) return;
  quizAnswered = true;

  const q       = quizQuestions[quizQIndex];
  const correct = q.ans === idx;
  if (correct) quizScore++;

  // Colour correct green, chosen-wrong red; disable all
  document.querySelectorAll('#quiz-body .quiz-option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.ans)             btn.classList.add('correct');
    else if (i === idx && !correct) btn.classList.add('wrong');
  });

  // Auto-advance after 1 second
  setTimeout(() => {
    quizQIndex++;
    quizAnswered = false;
    if (quizQIndex >= quizQuestions.length) {
      quizDone = true;
      updateSubjectProgress(quizSubject, quizScore);
      addXP(10);
    }
    renderQuiz();
  }, 1000);
}

document.getElementById('quiz-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.quiz-tab');
  if (!btn) return;
  document.querySelectorAll('.quiz-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  initQuiz(btn.dataset.subject);
});

/* ─── POMODORO TIMER ─────────────────────────────────────────────────── */

const POMO_STUDY_SECS    = 25 * 60;
const POMO_BREAK_SECS    = 5  * 60;
const POMO_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.73 for r=52

let pomoMode     = 'study';
let pomoTimeLeft = POMO_STUDY_SECS;
let pomoRunning  = false;
let pomoSessions = 0;
let pomoTimer    = null;
let pomoXPGiven  = false;

function renderPomodoro() {
  const total    = pomoMode === 'study' ? POMO_STUDY_SECS : POMO_BREAK_SECS;
  const progress = pomoTimeLeft / total; // 1 at start → 0 at end
  const offset   = POMO_CIRCUMFERENCE * (1 - progress);

  const mm = String(Math.floor(pomoTimeLeft / 60)).padStart(2, '0');
  const ss = String(pomoTimeLeft % 60).padStart(2, '0');

  document.getElementById('pomo-time').textContent        = `${mm}:${ss}`;
  document.getElementById('pomo-ring-fill').style.strokeDashoffset = offset;
  document.getElementById('pomo-ring-fill').classList.toggle('break-mode', pomoMode === 'break');
  document.getElementById('pomo-mode-label').textContent  = pomoMode === 'study' ? '📚 Study Time' : '☕ Break Time';
  document.getElementById('pomo-mode-label').classList.toggle('break-mode', pomoMode === 'break');
  document.getElementById('pomo-sessions').textContent    = pomoSessions;
  document.getElementById('pomo-start-btn').disabled      = pomoRunning;
  document.getElementById('pomo-pause-btn').disabled      = !pomoRunning;
}

function tickPomodoro() {
  if (!pomoRunning) return;
  pomoTimeLeft--;
  renderPomodoro();

  if (pomoTimeLeft > 0) return;

  // Session finished
  clearInterval(pomoTimer);
  pomoRunning = false;

  if (pomoMode === 'study') {
    // Complete study session — award XP once
    pomoSessions++;
    if (!pomoXPGiven) { addXP(20); pomoXPGiven = true; }
    document.getElementById('pomo-status').textContent = '🎉 Study session complete!';
    showToast('⏰ Time for a break! Well done! 🎉', 'study-toast');
    renderPomodoro();
    // Auto-start 5-min break after 1.5 s
    setTimeout(() => {
      pomoMode     = 'break';
      pomoTimeLeft = POMO_BREAK_SECS;
      pomoRunning  = true;
      pomoXPGiven  = false;
      document.getElementById('pomo-status').textContent = '';
      clearInterval(pomoTimer);
      pomoTimer = setInterval(tickPomodoro, 1000);
      renderPomodoro();
    }, 1500);

  } else {
    // Break finished
    pomoMode     = 'study';
    pomoTimeLeft = POMO_STUDY_SECS;
    document.getElementById('pomo-status').textContent = '💪 Ready for the next session!';
    showToast('☕ Break over — back to work! 💪', 'eco-toast');
    renderPomodoro();
  }
}

document.getElementById('pomo-start-btn').addEventListener('click', () => {
  if (pomoRunning) return;
  pomoRunning = true;
  pomoXPGiven = false;
  clearInterval(pomoTimer);
  pomoTimer = setInterval(tickPomodoro, 1000);
  renderPomodoro();
});

document.getElementById('pomo-pause-btn').addEventListener('click', () => {
  pomoRunning = false;
  clearInterval(pomoTimer);
  renderPomodoro();
});

document.getElementById('pomo-reset-btn').addEventListener('click', () => {
  clearInterval(pomoTimer);
  pomoRunning  = false;
  pomoMode     = 'study';
  pomoTimeLeft = POMO_STUDY_SECS;
  pomoXPGiven  = false;
  document.getElementById('pomo-status').textContent = '';
  renderPomodoro();
});

/* ─── NOTAS E RESUMOS ────────────────────────────────────────────────── */

let notesCache = [];

function noteSubjectEmoji(subject) {
  return { Math: '📐', English: '📖', Science: '🔬', Geography: '🌍', Art: '🎨', Other: '📋' }[subject] || '📋';
}

async function loadNotes() {
  if (!sbUser) { renderNotes(); return; }
  const { data, error } = await sb.from('study_notes')
    .select('*').eq('user_id', sbUser.id)
    .order('created_at', { ascending: false }).limit(30);
  if (!error) notesCache = data || [];
  renderNotes();
}

function renderNotes() {
  const list = document.getElementById('notes-list');
  const hint = document.getElementById('notes-login-hint');
  if (!list) return;
  if (hint) hint.classList.toggle('hidden', !!sbUser);

  if (!notesCache.length) {
    list.innerHTML = `<p class="notes-empty">${
      sbUser
        ? 'No notes yet — save your first one above! 📝'
        : 'Sign in to save and sync your notes.'
    }</p>`;
    return;
  }

  list.innerHTML = notesCache.map(n => `
    <div class="note-card">
      <div class="note-card-hdr">
        <div class="note-card-title">${escHtml(n.title || 'Untitled')}</div>
        <span class="note-card-subject">${noteSubjectEmoji(n.subject)} ${escHtml(n.subject)}</span>
      </div>
      <div class="note-card-content">${escHtml(n.content)}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <button class="note-delete-btn" data-id="${n.id}">🗑 Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.note-delete-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteNote(btn.dataset.id))
  );
}

async function saveNote() {
  if (!sbUser) { showToast('Sign in to save notes! 🔑', ''); return; }
  const subject = document.getElementById('notes-subject').value;
  const title   = document.getElementById('notes-title').value.trim();
  const content = document.getElementById('notes-content').value.trim();
  if (!content) { showToast('Write something in your note first! ✍️', ''); return; }

  const btn = document.getElementById('notes-save-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const { data, error } = await sb.from('study_notes').insert({
    user_id: sbUser.id, subject, title: title || 'Untitled', content,
  }).select().single();

  if (!error && data) {
    notesCache.unshift(data);
    document.getElementById('notes-title').value   = '';
    document.getElementById('notes-content').value = '';
    renderNotes();
    showToast('📝 Note saved!', 'study-toast');
  } else {
    showToast('Couldn\'t save note — check the console.', '');
    console.error('[Notes] save error:', error);
  }
  btn.disabled    = false;
  btn.textContent = '💾 Save Note';
}

async function deleteNote(id) {
  if (!sbUser) return;
  const { error } = await sb.from('study_notes').delete().eq('id', id).eq('user_id', sbUser.id);
  if (!error) {
    notesCache = notesCache.filter(n => n.id !== id);
    renderNotes();
    showToast('🗑 Note deleted', '');
  }
}

document.getElementById('notes-save-btn').addEventListener('click', saveNote);
document.getElementById('notes-content').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote();
});

/* ─── PROGRESSO POR DISCIPLINA ──────────────────────────────────────── */

const SUBJECT_META = [
  { key: 'math',      label: 'Math',      emoji: '📐' },
  { key: 'english',   label: 'English',   emoji: '📖' },
  { key: 'science',   label: 'Science',   emoji: '🔬' },
  { key: 'geography', label: 'Geography', emoji: '🌍' },
  { key: 'art',       label: 'Art',       emoji: '🎨' },
];

let subjectProgress = {};

function loadSubjectProgress() {
  try {
    const stored = localStorage.getItem('rh_subject_progress');
    if (stored) subjectProgress = JSON.parse(stored);
  } catch { /* ignore */ }
  // Ensure all subjects exist
  SUBJECT_META.forEach(s => {
    if (!subjectProgress[s.key])
      subjectProgress[s.key] = { quizzes: 0, totalScore: 0, bestScore: 0 };
  });
}

function saveSubjectProgressLocal() {
  try { localStorage.setItem('rh_subject_progress', JSON.stringify(subjectProgress)); } catch { /* ignore */ }
}

function updateSubjectProgress(subjectKey, score) {
  const p = subjectProgress[subjectKey];
  p.quizzes++;
  p.totalScore += score;
  if (score > p.bestScore) p.bestScore = score;
  saveSubjectProgressLocal();
  renderSubjectProgress();
}

function renderSubjectProgress() {
  const grid = document.getElementById('subject-progress-grid');
  if (!grid) return;
  const totalQ = 5; // questions per quiz
  grid.innerHTML = SUBJECT_META.map(s => {
    const p   = subjectProgress[s.key] || { quizzes: 0, bestScore: 0 };
    const pct = p.quizzes > 0 ? Math.round((p.bestScore / totalQ) * 100) : 0;
    return `
      <div class="subject-prog-item">
        <div class="subject-prog-emoji">${s.emoji}</div>
        <div class="subject-prog-name">${s.label}</div>
        <div class="subject-prog-bar-wrap">
          <div class="subject-prog-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="subject-prog-stats">
          ${p.quizzes} quiz${p.quizzes !== 1 ? 'zes' : ''}<br>
          Best: ${p.bestScore}/${totalQ}
        </div>
      </div>`;
  }).join('');
}

/* ─── STUDY PAGE INIT ────────────────────────────────────────────────── */

// Called by navigateTo('study') — only loads notes if not already in cache
function initStudyPage() {
  if (sbUser && notesCache.length === 0) loadNotes();
  else renderNotes();
  renderSubjectProgress();
}

// ── Boot new study components (runs once on page load) ───────────────
loadSubjectProgress();
renderSubjectProgress();
renderPomodoro();
initQuiz('math');
