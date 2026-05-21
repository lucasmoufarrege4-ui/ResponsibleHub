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

/* ── Top Bar ──────────────────────────────────────────────────────── */
function updateTopBar() {
  const el = document.getElementById('top-user');
  if (sbProfile) {
    el.classList.remove('hidden');
    document.getElementById('top-avatar').textContent   = sbProfile.username[0].toUpperCase();
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
  document.getElementById('dash-avatar').textContent = sbProfile.username[0].toUpperCase();
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
