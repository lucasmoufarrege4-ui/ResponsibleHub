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
  if (page === 'eco')   initEcoPage();
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

/* ─── ECO TIPS (personalised) ────────────────────────────────────────── */
// trigger: 'general' shows for everyone; other triggers show when user's
// carbon calculator answers match (stored in localStorage 'rh_carbon_answers').
const ECO_TIPS = [
  { emoji: '🌱', text: 'Plant a seed — even a windowsill herb counts as a step toward a greener world.', impact: '🌍 Small green spaces cool cities and clean air', trigger: 'general' },
  { emoji: '💧', text: 'Turn off the tap while brushing your teeth — you\'ll save up to 6 litres per minute.', impact: '💧 One habit change saves 4,000+ litres/year', trigger: 'general' },
  { emoji: '🛍️', text: 'Swap one single-use item this week for a reusable alternative.', impact: '♻️ 8M tonnes of plastic enter oceans every year', trigger: 'general' },
  { emoji: '🌙', text: 'Unplug chargers and devices at night — idle electronics still drain power.', impact: '⚡ Standby power = 10% of home electricity use', trigger: 'general' },
  { emoji: '☀️', text: 'Choose products with minimal packaging next time you shop.', impact: '🏭 Packaging is 30% of landfill waste globally', trigger: 'general' },
  { emoji: '🚶', text: 'Walk or cycle for any trip under 2 km instead of taking a car.', impact: '🌫️ Short car trips produce the most emissions per km', trigger: 'transport-car' },
  { emoji: '🚌', text: 'One bus trip replaces ~45 solo car journeys in emissions. You\'re already winning!', impact: '✅ Public transit users emit 45% less CO₂', trigger: 'transport-public' },
  { emoji: '🚴', text: 'If you cycle to school, you\'re avoiding roughly 150 g CO₂ per km — great work!', impact: '🏅 Cycling is truly zero-emission transport', trigger: 'transport-public' },
  { emoji: '🥦', text: 'Try one fully plant-based meal today — it\'s easier and tastier than you think.', impact: '🌿 A plant-based meal uses 10× less land & water', trigger: 'meat-heavy' },
  { emoji: '🥗', text: 'Swap your beef burger for chicken or fish — it cuts the carbon footprint by 70%.', impact: '🐄 Beef = 27 kg CO₂/kg vs chicken = 6 kg CO₂/kg', trigger: 'meat-heavy' },
  { emoji: '🌿', text: 'Add one more meat-free day per week — you\'re already doing better than most!', impact: '💚 Each meat-free day saves ~1.5 kg CO₂', trigger: 'meat-moderate' },
  { emoji: '✈️', text: 'A single long-haul flight emits more CO₂ than a month of driving. Consider trains!', impact: '🛤️ EU trains emit 6× less than planes per km', trigger: 'flights-many' },
  { emoji: '🌍', text: 'Offset your flight emissions by donating to a verified reforestation project.', impact: '🌲 Gold Standard projects guarantee real impact', trigger: 'flights-many' },
  { emoji: '🚿', text: 'Cut your shower by 2 minutes — saves 18 litres and the energy to heat it.', impact: '🔥 Hot water = 20% of home energy use', trigger: 'shower-long' },
  { emoji: '❄️', text: 'Set your AC 2°C warmer — you\'ll barely notice and cut its energy use by 10%.', impact: '⚡ AC is one of the fastest-growing energy loads', trigger: 'ac-heavy' },
  { emoji: '🌬️', text: 'Use fans before AC — a ceiling fan cools a room with 75% less energy.', impact: '💨 Fans + open windows work down to ~26°C outdoors', trigger: 'ac-heavy' },
  { emoji: '🌊', text: 'Sea levels have risen 20 cm since 1900. Every fraction of a degree matters.', impact: '🏠 1 billion people live in low-elevation coastal zones', trigger: 'general' },
  { emoji: '🐝', text: 'Plant bee-friendly flowers like lavender or sunflowers to support pollinators.', impact: '🍎 Bees pollinate 70% of the food we eat', trigger: 'general' },
  { emoji: '📵', text: 'Stream less video — video streaming accounts for 1% of global electricity use.', impact: '📺 Reducing 4K to HD saves 86% of streaming energy', trigger: 'general' },
  { emoji: '🍽️', text: 'Plan your meals to cut food waste — 30% of all food is thrown away globally.', impact: '🗑️ Food waste = 8% of global greenhouse emissions', trigger: 'general' },
];


/* ─── STATE ──────────────────────────────────────────────────────────── */

let studyStreak = 0, ecoStreak = 0;
let challengesDone = 0, tasksDone = 0, co2Tracked = 0;
let currentStudyChal = 0, currentEcoChal = 0;
let currentTipIndex = 0, currentTipCat = 'all';
let currentFactIndex = 0;
let ecoPageInited = false;
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

  // Update tree immediately with new count
  renderVirtualTree(co2Tracked);

  // ── Save to Supabase in the background — never blocks the UI ────────
  if (sbUser) {
    saveChallengeCompletion('eco');
    addGoalToPlanner(`🌍 ${text}`).catch(err =>
      console.error('eco: background planner save failed', err)
    );
    // Check for newly earned badges (fire-and-forget)
    checkAndAwardBadges({ proofText: text });
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

/* ─── PERSONALISED ECO TIPS ──────────────────────────────────────────── */

function getPersonalisedTips() {
  let answers = null;
  try { answers = JSON.parse(localStorage.getItem('rh_carbon_answers') || 'null'); } catch (_) {}

  // Build a set of active triggers based on saved kg CO₂ values (numeric HTML radio values)
  const triggers = new Set(['general']);
  if (answers) {
    // transport: 0=walk/bike, 250=bus/train, 900=car
    if (answers.transport >= 800)  triggers.add('transport-car');
    if (answers.transport > 0 && answers.transport < 800) triggers.add('transport-public');
    // meat: 200=never, 700=sometimes, 1300=most days, 1900=every day
    if (answers.meat >= 1500)      triggers.add('meat-heavy');
    if (answers.meat >= 600 && answers.meat < 1500) triggers.add('meat-moderate');
    // flights: 0=never, 900=1-2, 2200=3-5, 4500=5+
    if (answers.flights >= 900)    triggers.add('flights-many');
    // shower: 50=<5min, 130=5-10min, 300=10-20min, 600=20+min
    if (answers.shower >= 300)     triggers.add('shower-long');
    // ac: 100=rarely, 450=sometimes, 1100=most of the time
    if (answers.ac >= 1000)        triggers.add('ac-heavy');
  }

  return ECO_TIPS.filter(t => triggers.has(t.trigger));
}

let activeTips = [...ECO_TIPS]; // default: all tips; updated by refreshEcoTips()

function buildTipDots() {
  const c = document.getElementById('fact-dots');
  if (!c) return;
  c.innerHTML = '';
  activeTips.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'fact-dot' + (i === currentFactIndex ? ' active' : '');
    d.addEventListener('click', () => showTip(i));
    c.appendChild(d);
  });
}

function showTip(idx) {
  if (!activeTips.length) return;
  currentFactIndex = idx;
  const t = activeTips[idx];
  const numEl = document.getElementById('fact-number');
  const emojiEl = document.getElementById('fact-emoji');
  const textEl = document.getElementById('fact-text');
  const impactEl = document.getElementById('fact-impact');
  if (numEl)   numEl.textContent   = String(idx + 1).padStart(2, '0');
  if (emojiEl) emojiEl.textContent = t.emoji;
  if (textEl)  textEl.textContent  = t.text;
  if (impactEl) impactEl.textContent = t.impact;
  document.querySelectorAll('.fact-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

function refreshEcoTips() {
  activeTips = getPersonalisedTips();
  // If no personalised tips match, fall back to all general tips
  if (!activeTips.length) activeTips = ECO_TIPS.filter(t => t.trigger === 'general');

  const banner = document.getElementById('eco-tips-banner');
  const answers = localStorage.getItem('rh_carbon_answers');
  if (banner) banner.classList.toggle('hidden', !answers);

  currentFactIndex = 0;
  buildTipDots();
  showTip(0);
}

document.getElementById('next-fact-btn')?.addEventListener('click', () =>
  showTip((currentFactIndex + 1) % activeTips.length));

document.getElementById('prev-fact-btn')?.addEventListener('click', () =>
  showTip((currentFactIndex - 1 + activeTips.length) % activeTips.length));

document.getElementById('share-fact-btn')?.addEventListener('click', () => {
  if (!activeTips.length) return;
  const t = activeTips[currentFactIndex];
  const text = `🌍 Eco tip: ${t.text} ${t.impact} — via ResponsibleHub`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast('📋 Tip copied to clipboard!', 'eco-toast'));
  }
});

/* ─── CARBON CALCULATOR ──────────────────────────────────────────────── */

document.getElementById('calc-carbon-btn')?.addEventListener('click', () => {
  // Radio values in the HTML are already kg CO₂/year for each category
  const getKg = name => +(document.querySelector(`input[name="${name}"]:checked`)?.value) || 0;
  const flightsKg   = getKg('c_flights');
  const showerKg    = getKg('c_shower');
  const meatKg      = getKg('c_meat');
  const transportKg = getKg('c_transport');
  const acKg        = getKg('c_ac');

  const totalKg = flightsKg + showerKg + meatKg + transportKg + acKg;

  // Save raw kg values to localStorage for personalised tips
  const answers = {
    flights:   flightsKg,
    shower:    showerKg,
    meat:      meatKg,
    transport: transportKg,
    ac:        acKg,
  };
  localStorage.setItem('rh_carbon_answers', JSON.stringify(answers));

  // SVG gauge — arc length 251.3, max scale = 8000 kg
  const pct = Math.min(totalKg / 8000, 1);
  const dashoffset = Math.round(251.3 * (1 - pct));
  let arcColour;
  if      (totalKg < 1500) arcColour = '#16a34a';
  else if (totalKg < 3000) arcColour = '#84cc16';
  else if (totalKg < 5000) arcColour = '#f59e0b';
  else                     arcColour = '#ef4444';

  const gaugeArc = document.getElementById('gauge-arc');
  if (gaugeArc) {
    gaugeArc.style.strokeDashoffset = dashoffset;
    gaugeArc.style.stroke = arcColour;
  }
  const scoreEl = document.getElementById('gauge-score');
  if (scoreEl) scoreEl.textContent = totalKg.toLocaleString();

  let grade, msg;
  if      (totalKg < 1000) { grade = '🌟 Eco Champion!';  msg = "Incredible — you\'re among the lowest-impact people on the planet!"; }
  else if (totalKg < 2000) { grade = '🌿 Green Hero';     msg = "Great work! A couple of tweaks and you could hit champion level."; }
  else if (totalKg < 3500) { grade = '🌱 Getting There';  msg = "Decent habits! Tackling your biggest category will make a real dent."; }
  else if (totalKg < 5500) { grade = '🌍 Earth Learner';  msg = "Awareness is step one. Pick the tip below that feels most doable."; }
  else                     { grade = '🚀 Room to Grow';   msg = "Every eco journey starts somewhere — one small swap changes the story!"; }

  document.getElementById('carbon-grade').textContent = grade;
  document.getElementById('carbon-grade').style.color = arcColour;
  document.getElementById('carbon-msg').textContent = msg;

  // Show personalised tips now that answers are saved
  const tipsList = document.getElementById('carbon-tips');
  const personalisedTips = getPersonalisedTips().slice(0, 3);
  if (tipsList) {
    tipsList.innerHTML = personalisedTips.length
      ? personalisedTips.map(t => `<li>${t.emoji} ${t.text}</li>`).join('')
      : '<li>🌟 Keep up the great habits — you\'re already an eco champion!</li>';
  }

  document.getElementById('carbon-form').classList.add('hidden');
  document.getElementById('carbon-result').classList.remove('hidden');

  co2Tracked = Math.max(co2Tracked, 1);
  updateHeroStats();
  showToast(`${grade} — ${totalKg.toLocaleString()} kg CO₂/yr`, 'eco-toast');

  // Show real impact numbers
  renderRealImpact(totalKg, ecoStreak);

  // Refresh tips carousel with personalised content
  refreshEcoTips();

  // Award Carbon Counter badge
  checkAndAwardBadges();
});

document.getElementById('retake-carbon-btn')?.addEventListener('click', () => {
  document.getElementById('carbon-result').classList.add('hidden');
  document.getElementById('carbon-form').classList.remove('hidden');
});

/* ─── ECO PROGRESS CALENDAR ──────────────────────────────────────────── */

async function loadEcoProgress() {
  const grid = document.getElementById('eco-calendar-grid');
  if (!grid) return;

  if (!sbUser) {
    grid.innerHTML = '<p class="eco-cal-loading">Sign in to see your eco history 🌿</p>';
    return;
  }

  const DAYS = 35;
  const cutoff = new Date(Date.now() - (DAYS - 1) * 86400000);
  const cutoffStr = dateToStr(cutoff);

  const { data, error } = await sb.from('challenge_completions')
    .select('date')
    .eq('user_id', sbUser.id)
    .eq('challenge_id', 'eco')
    .gte('date', cutoffStr);

  if (error) {
    console.error('[EcoProgress] load error:', error);
    grid.innerHTML = '<p class="eco-cal-loading">Could not load history.</p>';
    return;
  }

  const completedSet = new Set((data || []).map(r => r.date));
  renderEcoCalendar(completedSet, DAYS);

  const count = completedSet.size;
  const countEl = document.getElementById('eco-cal-count');
  if (countEl) countEl.textContent = count ? `${count} days ✅` : '';
}

function renderEcoCalendar(completedSet, days = 35) {
  const grid = document.getElementById('eco-calendar-grid');
  if (!grid) return;

  const today = dateToStr(new Date());
  const cols = 7, rows = Math.ceil(days / cols);

  // Build day labels header
  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const todayDow = new Date().getDay(); // 0=Sun

  // We want the grid columns to align so that today falls in the last row's correct DOW column.
  // Pad empty cells at the start so the first cell in the grid lines up with the right DOW.
  const totalCells = rows * cols;
  const startPad = totalCells - days; // cells before our first real day

  let html = `<div class="eco-cal-grid" style="--eco-cal-cols:${cols}">`;

  // Day-of-week labels
  for (let d = 0; d < cols; d++) {
    // Rotate labels so first column = DOW of (today - (days-1) days)
    const firstDayDow = new Date(Date.now() - (days - 1) * 86400000).getDay();
    const label = dayLabels[(firstDayDow + d) % 7];
    html += `<div class="eco-cal-label">${label}</div>`;
  }

  // Padding cells
  for (let p = 0; p < startPad; p++) {
    html += `<div class="eco-cal-cell eco-cal-empty"></div>`;
  }

  // Real day cells
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000);
    const ds = dateToStr(d);
    const done = completedSet.has(ds);
    const isToday = ds === today;
    let cls = 'eco-cal-cell';
    if (done)    cls += ' eco-cal-done';
    if (isToday) cls += ' eco-cal-today';
    const title = `${ds}${done ? ' ✅' : ''}`;
    html += `<div class="${cls}" title="${title}"></div>`;
  }

  html += '</div>';

  // Legend
  html += `<div class="eco-cal-legend">
    <span class="eco-cal-cell eco-cal-done eco-cal-legend-swatch"></span><span>Eco challenge done</span>
    <span class="eco-cal-cell eco-cal-legend-swatch"></span><span>Not done</span>
  </div>`;

  grid.innerHTML = html;
}


/* ─── ECO BADGE SYSTEM ───────────────────────────────────────────────── */

const ECO_BADGES = [
  {
    id: 'first_step',
    emoji: '🌱', name: 'First Step',
    desc: 'Complete your first eco challenge',
    check: ({ ecoCompletions }) => ecoCompletions >= 1,
  },
  {
    id: 'on_fire',
    emoji: '🔥', name: 'On Fire',
    desc: '3-day eco streak',
    check: ({ streak }) => streak >= 3,
  },
  {
    id: 'earth_guardian',
    emoji: '🌍', name: 'Earth Guardian',
    desc: '7-day eco streak',
    check: ({ streak }) => streak >= 7,
  },
  {
    id: 'recycler',
    emoji: '♻️', name: 'Recycler',
    desc: 'Submit proof mentioning recycling',
    check: ({ recycleProof }) => recycleProof === true,
  },
  {
    id: 'carbon_counter',
    emoji: '🧮', name: 'Carbon Counter',
    desc: 'Complete the carbon calculator',
    check: ({ carbonDone }) => carbonDone === true,
  },
  {
    id: 'tree_hugger',
    emoji: '🌳', name: 'Tree Hugger',
    desc: '14-day eco streak',
    check: ({ streak }) => streak >= 14,
  },
];

// In-memory set of earned badge IDs (loaded from Supabase + checked locally)
let earnedBadgeIds = new Set();

async function loadBadges() {
  if (!sbUser) { renderBadgeGallery(); return; }
  const { data, error } = await sb
    .from('eco_badges')
    .select('badge_id')
    .eq('user_id', sbUser.id);
  if (!error && data) {
    data.forEach(r => earnedBadgeIds.add(r.badge_id));
  }
  renderBadgeGallery();
}

async function awardBadge(badgeId) {
  if (earnedBadgeIds.has(badgeId)) return; // already earned
  earnedBadgeIds.add(badgeId);
  renderBadgeGallery();
  const badge = ECO_BADGES.find(b => b.id === badgeId);
  if (badge) showToast(`${badge.emoji} Badge unlocked: ${badge.name}!`, 'eco-toast');
  if (!sbUser) return;
  await sb.from('eco_badges').upsert(
    { user_id: sbUser.id, badge_id: badgeId, earned_at: new Date().toISOString() },
    { onConflict: 'user_id,badge_id', ignoreDuplicates: true }
  );
}

// Evaluate all badges given current context and award newly earned ones
async function checkAndAwardBadges({ proofText = '' } = {}) {
  // Build current context
  const carbonDone = !!localStorage.getItem('rh_carbon_answers');
  const recycleProof = /recycl/i.test(proofText);
  const ctx = {
    ecoCompletions: co2Tracked,    // co2Tracked counts eco completions
    streak: ecoStreak,
    carbonDone,
    recycleProof,
  };
  for (const badge of ECO_BADGES) {
    if (!earnedBadgeIds.has(badge.id) && badge.check(ctx)) {
      await awardBadge(badge.id);
    }
  }
}

function renderBadgeGallery() {
  const gallery = document.getElementById('badge-gallery');
  if (!gallery) return;
  if (!sbUser) {
    gallery.innerHTML = '<p class="eco-cal-loading">Sign in to earn badges 🌿</p>';
    return;
  }
  gallery.innerHTML = ECO_BADGES.map(b => {
    const earned = earnedBadgeIds.has(b.id);
    return `<div class="badge-item ${earned ? 'badge-earned' : 'badge-locked'}" title="${b.desc}">
      <div class="badge-emoji">${b.emoji}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
      ${earned ? '<div class="badge-tick">✓</div>' : ''}
    </div>`;
  }).join('');
}

/* ─── VIRTUAL TREE ───────────────────────────────────────────────────── */

// Returns SVG string for the tree at the given stage (0-4)
function buildTreeSVG(stage) {
  // stage: 0=seed, 1=sprout, 2=small tree, 3=big tree, 4=forest
  const svgs = {
    0: /* seed 🌱 */ `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="200" height="200" fill="none"/>
        <!-- soil -->
        <ellipse cx="100" cy="175" rx="60" ry="12" fill="#92400e" opacity=".35"/>
        <!-- seed -->
        <ellipse cx="100" cy="162" rx="14" ry="10" fill="#78350f"/>
        <!-- tiny sprout -->
        <line x1="100" y1="162" x2="100" y2="140" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="100" cy="135" rx="10" ry="7" fill="#4ade80" transform="rotate(-20,100,135)"/>
      </svg>`,
    1: /* sprout */ `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="100" cy="180" rx="65" ry="14" fill="#92400e" opacity=".3"/>
        <!-- stem -->
        <path d="M100,175 Q95,145 100,115" stroke="#4ade80" stroke-width="4" fill="none" stroke-linecap="round"/>
        <!-- left leaf -->
        <path d="M100,145 Q75,130 78,110 Q95,120 100,145Z" fill="#22c55e"/>
        <!-- right leaf -->
        <path d="M100,135 Q125,115 128,95 Q110,110 100,135Z" fill="#16a34a"/>
        <!-- top bud -->
        <circle cx="100" cy="110" r="10" fill="#4ade80"/>
      </svg>`,
    2: /* small tree */ `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <!-- ground -->
        <ellipse cx="100" cy="182" rx="55" ry="11" fill="#78350f" opacity=".3"/>
        <!-- trunk -->
        <rect x="92" y="130" width="16" height="52" rx="6" fill="#92400e"/>
        <!-- canopy layers -->
        <polygon points="100,42 55,115 145,115" fill="#16a34a"/>
        <polygon points="100,68 60,130 140,130" fill="#22c55e"/>
        <!-- highlight -->
        <circle cx="88" cy="72" r="12" fill="#4ade80" opacity=".4"/>
      </svg>`,
    3: /* big tree */ `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <!-- ground -->
        <ellipse cx="100" cy="185" rx="70" ry="13" fill="#78350f" opacity=".3"/>
        <!-- trunk with roots -->
        <path d="M88,185 Q80,170 85,145 L115,145 Q120,170 112,185Z" fill="#92400e"/>
        <path d="M88,175 Q70,178 65,185" stroke="#92400e" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M112,175 Q130,178 135,185" stroke="#92400e" stroke-width="6" fill="none" stroke-linecap="round"/>
        <!-- main canopy -->
        <circle cx="100" cy="90" r="62" fill="#15803d"/>
        <!-- mid canopy -->
        <circle cx="72" cy="110" r="35" fill="#16a34a"/>
        <circle cx="128" cy="108" r="38" fill="#16a34a"/>
        <!-- top highlight -->
        <circle cx="100" cy="62" r="30" fill="#22c55e"/>
        <circle cx="84" cy="68" r="14" fill="#4ade80" opacity=".45"/>
      </svg>`,
    4: /* forest */ `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <!-- ground -->
        <rect x="0" y="172" width="200" height="28" rx="8" fill="#78350f" opacity=".2"/>
        <!-- back left tree -->
        <rect x="22" y="112" width="10" height="62" rx="4" fill="#92400e" opacity=".7"/>
        <circle cx="27" cy="95" r="28" fill="#14532d" opacity=".85"/>
        <!-- back right tree -->
        <rect x="162" y="108" width="12" height="66" rx="4" fill="#92400e" opacity=".7"/>
        <circle cx="168" cy="88" r="32" fill="#14532d" opacity=".85"/>
        <!-- main centre tree trunk -->
        <path d="M90,185 Q82,165 88,135 L112,135 Q118,165 110,185Z" fill="#92400e"/>
        <path d="M90,175 Q72,176 68,185" stroke="#92400e" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M110,175 Q128,176 132,185" stroke="#92400e" stroke-width="6" fill="none" stroke-linecap="round"/>
        <!-- main canopy layers -->
        <circle cx="100" cy="88" r="68" fill="#15803d"/>
        <circle cx="75" cy="108" r="36" fill="#16a34a"/>
        <circle cx="125" cy="106" r="40" fill="#16a34a"/>
        <circle cx="100" cy="58" r="35" fill="#22c55e"/>
        <!-- highlights -->
        <circle cx="84" cy="65" r="16" fill="#4ade80" opacity=".45"/>
        <circle cx="110" cy="75" r="10" fill="#4ade80" opacity=".3"/>
        <!-- birds -->
        <path d="M40,50 Q44,45 48,50" stroke="#374151" stroke-width="1.5" fill="none"/>
        <path d="M155,40 Q159,35 163,40" stroke="#374151" stroke-width="1.5" fill="none"/>
      </svg>`,
  };
  return svgs[stage] ?? svgs[0];
}

function renderVirtualTree(count) {
  let stage, stageName;
  if      (count === 0)    { stage = 0; stageName = 'Plant your first seed 🌱'; }
  else if (count <= 2)     { stage = 0; stageName = 'A seed is sprouting…'; }
  else if (count <= 5)     { stage = 1; stageName = 'Your sprout is growing!'; }
  else if (count <= 10)    { stage = 2; stageName = 'A little tree is taking shape!'; }
  else if (count <= 20)    { stage = 3; stageName = 'Look at your mighty tree!'; }
  else                     { stage = 4; stageName = 'You\'ve grown a whole forest! 🌳'; }

  const wrap = document.getElementById('virtual-tree-svg');
  const label = document.getElementById('tree-stage-label');
  const countEl = document.getElementById('tree-action-count');
  if (wrap)    wrap.innerHTML = buildTreeSVG(stage);
  if (label)   label.textContent = stageName;
  if (countEl) countEl.textContent = `${count} eco action${count !== 1 ? 's' : ''} completed`;
}

async function loadVirtualTree() {
  // Use co2Tracked (eco completions count) for the tree stage; also fetch total from DB
  if (!sbUser) { renderVirtualTree(co2Tracked); return; }

  const cutoff = dateToStr(new Date(Date.now() - 365 * 86400000)); // last year
  const { data } = await sb.from('challenge_completions')
    .select('date', { count: 'exact' })
    .eq('user_id', sbUser.id)
    .eq('challenge_id', 'eco')
    .gte('date', cutoff);

  const total = data ? data.length : co2Tracked;
  renderVirtualTree(total);
}

/* ─── REAL IMPACT NUMBERS ────────────────────────────────────────────── */

function renderRealImpact(totalKg, streak) {
  const grid = document.getElementById('real-impact-grid');
  if (!grid) return;

  // Per-challenge averages: each eco challenge ≈ 2 kg CO₂ avoided (mix of actions)
  const kgPerAction = 2;
  const actionsCount = Math.max(co2Tracked, 1);
  const savedKg = Math.round(actionsCount * kgPerAction + streak * 0.5);

  // 1 average car trip ≈ 0.21 kg CO₂/km → km avoided
  const kmAvoided = Math.round(savedKg / 0.21);

  // An average tree absorbs ~21 kg CO₂/year → equivalent trees
  const treesEq = (savedKg / 21).toFixed(1);

  // Energy saved: avg home uses ~4,000 kWh/yr at ~0.233 kg CO₂/kWh
  const kwhSaved = Math.round(savedKg / 0.233);

  grid.innerHTML = `
    <div class="impact-stat">
      <div class="impact-stat-icon">🚗</div>
      <div class="impact-stat-val">${kmAvoided.toLocaleString()} km</div>
      <div class="impact-stat-label">of car travel avoided</div>
    </div>
    <div class="impact-stat">
      <div class="impact-stat-icon">💨</div>
      <div class="impact-stat-val">${savedKg.toLocaleString()} kg</div>
      <div class="impact-stat-label">CO₂ saved this year</div>
    </div>
    <div class="impact-stat">
      <div class="impact-stat-icon">🌲</div>
      <div class="impact-stat-val">${treesEq}</div>
      <div class="impact-stat-label">trees worth of carbon</div>
    </div>
    <div class="impact-stat">
      <div class="impact-stat-icon">⚡</div>
      <div class="impact-stat-val">${kwhSaved.toLocaleString()} kWh</div>
      <div class="impact-stat-label">of energy equivalent</div>
    </div>
  `;
}

/* ─── ECO PAGE INIT ──────────────────────────────────────────────────── */

async function initEcoPage() {
  // Render static/sync parts immediately
  refreshEcoTips();
  renderVirtualTree(co2Tracked);    // quick render with in-memory count
  renderBadgeGallery();             // quick render with cached badge set
  // Async: load from Supabase
  await Promise.all([
    loadEcoProgress(),
    loadBadges(),
    loadVirtualTree(),
  ]);
}


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
  refreshEcoTips();
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

// ── Question bank: 8 topics per subject × 5 Qs each = 200 questions ──
const QUIZ_BANK = {
  math: {
    'Algebra': [
      { q: 'Solve: 2x + 5 = 13. What is x?',                   opts: ['3','4','5','6'],                         ans: 1 },
      { q: 'Expand: 3(x + 4)',                                  opts: ['3x + 4','3x + 7','3x + 12','x + 12'],   ans: 2 },
      { q: 'Simplify: 5x − 2x + 3',                            opts: ['3x + 3','7x + 3','3x − 3','10x'],       ans: 0 },
      { q: 'Solve: x / 3 = 7. What is x?',                     opts: ['10','21','4','3'],                       ans: 1 },
      { q: 'Factorise: x² + 5x + 6',                           opts: ['(x+1)(x+6)','(x+2)(x+3)','(x+3)(x+2)','(x+5)(x+1)'], ans: 1 },
    ],
    'Fractions': [
      { q: 'What is 1/3 + 1/4?',                               opts: ['2/7','7/12','5/12','1/6'],              ans: 1 },
      { q: 'Simplify 12/18 to its lowest terms.',              opts: ['6/9','3/4','2/3','4/6'],                 ans: 2 },
      { q: 'What is 3/4 × 8?',                                 opts: ['5','6','7','8'],                         ans: 1 },
      { q: 'What is 2/5 ÷ 1/2?',                               opts: ['1/5','2/10','4/5','5/2'],                ans: 2 },
      { q: 'What is 1/2 − 1/6?',                               opts: ['1/3','2/6','1/4','3/8'],                 ans: 0 },
    ],
    'Decimals': [
      { q: 'What is 0.4 + 0.75?',                              opts: ['1.05','1.10','1.15','1.25'],             ans: 2 },
      { q: 'What is 3.6 × 4?',                                 opts: ['12.4','14.4','16.4','13.6'],             ans: 1 },
      { q: 'What is 7.5 ÷ 0.5?',                               opts: ['1.5','3.75','15','75'],                  ans: 2 },
      { q: 'What is 0.3²?',                                    opts: ['0.6','0.9','0.09','0.009'],              ans: 2 },
      { q: 'Convert 3/8 to a decimal.',                        opts: ['0.25','0.35','0.375','0.38'],            ans: 2 },
    ],
    'Percentages': [
      { q: 'What is 20% of 85?',                               opts: ['14','15','16','17'],                     ans: 3 },
      { q: 'Increase 50 by 30%.',                              opts: ['55','60','65','70'],                     ans: 2 },
      { q: '45 is what percentage of 180?',                    opts: ['20%','25%','30%','35%'],                 ans: 1 },
      { q: 'Decrease £120 by 15%.',                            opts: ['£96','£99','£102','£105'],               ans: 2 },
      { q: 'A price rises from £40 to £50. What is the % increase?', opts: ['10%','15%','20%','25%'],           ans: 3 },
    ],
    'Geometry': [
      { q: 'Area of a circle with radius 7 cm (π ≈ 3.14)?',   opts: ['43.96 cm²','153.86 cm²','21.98 cm²','78 cm²'], ans: 1 },
      { q: 'Sum of interior angles of a hexagon?',             opts: ['540°','600°','720°','900°'],             ans: 2 },
      { q: 'Volume of a cuboid 5 × 4 × 3 cm?',                opts: ['47 cm³','55 cm³','60 cm³','72 cm³'],     ans: 2 },
      { q: 'A right triangle has legs 6 cm and 8 cm. Hypotenuse?', opts: ['9 cm','10 cm','11 cm','12 cm'],      ans: 1 },
      { q: 'Area of a trapezium with parallel sides 8 & 12, height 5?', opts: ['40 cm²','45 cm²','50 cm²','60 cm²'], ans: 2 },
    ],
    'Statistics': [
      { q: 'Mean of 3, 7, 5, 9, 6?',                          opts: ['5','6','7','8'],                         ans: 1 },
      { q: 'Median of 2, 5, 7, 9, 12?',                       opts: ['5','6','7','9'],                         ans: 2 },
      { q: 'Mode of 3, 3, 5, 7, 5, 3, 8?',                    opts: ['3','5','7','8'],                         ans: 0 },
      { q: 'Range of 14, 7, 23, 5, 18?',                      opts: ['14','16','18','20'],                     ans: 2 },
      { q: 'P(even number) when rolling a fair die?',          opts: ['1/3','1/2','2/3','1/6'],                 ans: 1 },
    ],
    'Probability': [
      { q: 'Probability of a fair coin landing heads?',        opts: ['1/4','1/3','1/2','2/3'],                 ans: 2 },
      { q: 'P(7) when rolling a standard die?',                opts: ['0','1/7','1/6','1/12'],                  ans: 0 },
      { q: 'Bag has 3 red, 2 blue, 5 green. P(not red)?',      opts: ['3/10','7/10','1/2','3/5'],               ans: 1 },
      { q: 'Two fair coins tossed. P(two heads)?',             opts: ['1/2','1/3','1/4','3/4'],                 ans: 2 },
      { q: 'P(vowel) chosen from letters A, B, C, D, E?',      opts: ['1/5','2/5','3/5','4/5'],                 ans: 1 },
    ],
    'Ratio & Proportion': [
      { q: 'Simplify the ratio 15 : 25.',                      opts: ['3:4','3:5','5:3','5:8'],                 ans: 1 },
      { q: 'Share £60 in ratio 2 : 3. What is the larger share?', opts: ['£24','£30','£36','£40'],              ans: 2 },
      { q: '5 books cost £15. Cost of 8 books?',               opts: ['£20','£22','£24','£25'],                 ans: 2 },
      { q: 'Map scale 1 : 50 000. Distance of 4 cm on map = ?', opts: ['1 km','2 km','4 km','5 km'],            ans: 1 },
      { q: 'Ratio 3 : 4. If the first quantity is 21, what is the second?', opts: ['24','26','28','30'],         ans: 2 },
    ],
  },

  english: {
    'Shakespeare': [
      { q: 'How many plays did Shakespeare write?',             opts: ['27','32','37','42'],                     ans: 2 },
      { q: 'What type of play is A Midsummer Night\'s Dream?',  opts: ['Tragedy','History','Comedy','Romance'],  ans: 2 },
      { q: 'Which play features Iago as the villain?',          opts: ['Hamlet','Macbeth','Othello','King Lear'], ans: 2 },
      { q: 'In which city is Romeo and Juliet set?',            opts: ['Florence','Venice','Milan','Verona'],    ans: 3 },
      { q: 'Which Shakespeare play features a ghost of a murdered king?', opts: ['Macbeth','Hamlet','Othello','The Tempest'], ans: 1 },
    ],
    'Grammar': [
      { q: 'Which is grammatically correct?',                  opts: ['She don\'t like it','She doesn\'t like it','Her doesn\'t like it','She not like it'], ans: 1 },
      { q: '"Although it was raining" is what type of clause?', opts: ['Main clause','Relative clause','Subordinate clause','Noun clause'], ans: 2 },
      { q: 'In "The children played happily", what word class is "happily"?', opts: ['Adjective','Adverb','Verb','Noun'], ans: 1 },
      { q: 'Which sentence uses the passive voice?',            opts: ['She ate the cake','The cake was eaten','They bake cakes','He eats quickly'], ans: 1 },
      { q: '"Neither of them ___ ready." Which verb is correct?', opts: ['were','are','was','have been'],        ans: 2 },
    ],
    'Punctuation': [
      { q: 'Where does the apostrophe go in "the shoes of the boys"?', opts: ["boy's shoes","boys' shoes","boys shoes'","boys shoes"], ans: 1 },
      { q: 'Which punctuation mark is used to introduce a list?', opts: ['Semicolon','Comma','Colon','Dash'],   ans: 2 },
      { q: 'Which sentence uses a semicolon correctly?',        opts: ['I like coffee; and tea.','I like coffee; she prefers tea.','I; like coffee.','Coffee; is nice.'], ans: 1 },
      { q: 'An ellipsis (…) is used to indicate:',              opts: ['A new paragraph','A pause or omission','A list','A question'], ans: 1 },
      { q: 'Which is more formal for adding extra information — dashes or parentheses?', opts: ['Dashes','Parentheses','Both equal','Neither'], ans: 1 },
    ],
    'Poetry': [
      { q: 'A haiku has how many syllables in total?',          opts: ['14','15','17','21'],                     ans: 2 },
      { q: 'What is iambic pentameter?',                       opts: ['5 rhyming lines','10 syllables per line with 5 iambs','A type of sonnet','14 lines of verse'], ans: 1 },
      { q: 'What is a "volta" in a sonnet?',                    opts: ['The rhyme scheme','A turn or shift in argument','The first quatrain','A refrain'], ans: 1 },
      { q: '"I wandered lonely as a cloud" is an example of:', opts: ['Metaphor','Personification','Simile','Alliteration'], ans: 2 },
      { q: 'Which rhyme scheme is used in a Shakespearean sonnet?', opts: ['ABBA ABBA','AABB CCDD','ABAB CDCD EFEF GG','ABCABC'], ans: 2 },
    ],
    'Literary Devices': [
      { q: '"The classroom was a zoo" is an example of:',       opts: ['Simile','Metaphor','Personification','Hyperbole'], ans: 1 },
      { q: '"Crash, bang, wallop" illustrates:',                opts: ['Alliteration','Simile','Onomatopoeia','Assonance'], ans: 2 },
      { q: 'Repetition of initial consonant sounds is called:', opts: ['Assonance','Onomatopoeia','Alliteration','Sibilance'], ans: 2 },
      { q: 'Dramatic irony occurs when:',                       opts: ['A character lies','The audience knows something characters don\'t','Two characters argue','The plot twists'], ans: 1 },
      { q: 'A story within a story is called:',                opts: ['A subplot','A frame narrative','An epilogue','A soliloquy'], ans: 1 },
    ],
    'Vocabulary': [
      { q: 'What does "ephemeral" mean?',                       opts: ['Everlasting','Lasting only a short time','Very important','Deeply emotional'], ans: 1 },
      { q: 'What does "ambiguous" mean?',                       opts: ['Clearly wrong','Having more than one meaning','Very determined','Completely certain'], ans: 1 },
      { q: 'A synonym for "melancholy" is:',                    opts: ['Joyful','Angry','Sad','Anxious'],        ans: 2 },
      { q: 'What does "loquacious" mean?',                      opts: ['Silent','Very talkative','Extremely clever','Deeply loyal'], ans: 1 },
      { q: 'What does "ubiquitous" mean?',                      opts: ['Rare and precious','Present everywhere','Unknown and hidden','Surprisingly large'], ans: 1 },
    ],
    'Macbeth': [
      { q: 'What are the Three Witches also called?',           opts: ['The Fates','The Furies','The Weird Sisters','The Dark Trio'], ans: 2 },
      { q: 'What does Lady Macbeth urge Macbeth to do?',        opts: ['Flee Scotland','Kill King Duncan','Marry another woman','Betray Banquo'], ans: 1 },
      { q: '"Out, damned spot!" — which character says this?',  opts: ['Macbeth','Lady Macbeth','The First Witch','Ross'], ans: 1 },
      { q: 'Who becomes King of Scotland at the end of the play?', opts: ['Macduff','Ross','Banquo\'s son','Malcolm'], ans: 3 },
      { q: 'What do the witches tell Macbeth about Birnam Wood?', opts: ['It is cursed','He will burn it','He is safe until it moves to Dunsinane','It hides his enemies'], ans: 2 },
    ],
    'Romeo and Juliet': [
      { q: 'Which two families are at war in Romeo and Juliet?', opts: ['Montague and Capulet','Verona and Mantua','Benvolio and Tybalt','Lorenzo and Paris'], ans: 0 },
      { q: 'Who performs the secret marriage ceremony?',         opts: ['The Prince','Benvolio','Friar Lawrence','The Nurse'], ans: 2 },
      { q: 'How does Romeo die?',                               opts: ['Stabbed by Tybalt','Drinks poison','Drowns','Shot by an arrow'], ans: 1 },
      { q: 'What is the role of the Prologue?',                 opts: ['To introduce Juliet','To foreshadow the tragedy and reveal the ending','To explain Verona\'s history','To describe Romeo\'s character'], ans: 1 },
      { q: 'Who kills Tybalt?',                                 opts: ['Benvolio','Paris','Romeo','Mercutio'], ans: 2 },
    ],
  },

  science: {
    'Photosynthesis': [
      { q: 'What gas do plants absorb during photosynthesis?',  opts: ['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'], ans: 2 },
      { q: 'Where does photosynthesis mainly occur?',           opts: ['Roots','Stem','Leaves','Flowers'],       ans: 2 },
      { q: 'Which pigment absorbs light for photosynthesis?',   opts: ['Haemoglobin','Carotene','Chlorophyll','Melanin'], ans: 2 },
      { q: 'What sugar is produced during photosynthesis?',     opts: ['Sucrose','Fructose','Galactose','Glucose'], ans: 3 },
      { q: 'What is the role of stomata?',                      opts: ['Absorb water','Produce glucose','Allow gas exchange','Store sunlight'], ans: 2 },
    ],
    'The Human Body': [
      { q: 'How many bones are in the adult human body?',       opts: ['196','200','206','212'],                 ans: 2 },
      { q: 'What is the largest organ of the body?',            opts: ['Liver','Lungs','Brain','Skin'],          ans: 3 },
      { q: 'Which organ produces insulin?',                     opts: ['Liver','Kidney','Pancreas','Spleen'],    ans: 2 },
      { q: 'What is the main function of white blood cells?',   opts: ['Carry oxygen','Clot blood','Fight infection','Digest food'], ans: 2 },
      { q: 'How many chambers does the human heart have?',      opts: ['2','3','4','5'],                         ans: 2 },
    ],
    'Atoms & Elements': [
      { q: 'What is the atomic number of carbon?',              opts: ['4','6','8','12'],                        ans: 1 },
      { q: 'Atoms of the same element with different neutrons are called:', opts: ['Ions','Isotopes','Allotropes','Molecules'], ans: 1 },
      { q: 'Who organised the first modern periodic table?',    opts: ['John Dalton','Ernest Rutherford','Dmitri Mendeleev','Niels Bohr'], ans: 2 },
      { q: 'What is the charge of a neutron?',                  opts: ['+1','−1','0','Variable'],                ans: 2 },
      { q: 'How many electrons can the first electron shell hold?', opts: ['2','4','8','18'],                    ans: 0 },
    ],
    'Forces & Motion': [
      { q: 'Newton\'s second law states: Force =',              opts: ['mass ÷ acceleration','mass + velocity','mass × acceleration','mass × velocity'], ans: 2 },
      { q: 'What is the unit of force?',                        opts: ['Joule','Watt','Newton','Pascal'],        ans: 2 },
      { q: 'What force opposes motion between surfaces?',       opts: ['Gravity','Tension','Friction','Magnetism'], ans: 2 },
      { q: 'If mass doubles but force stays the same, acceleration:', opts: ['Doubles','Halves','Stays the same','Triples'], ans: 1 },
      { q: 'Which of Newton\'s laws states every action has an equal and opposite reaction?', opts: ['First','Second','Third','Fourth'], ans: 2 },
    ],
    'Electricity': [
      { q: 'What is the unit of electrical resistance?',        opts: ['Volt','Ampere','Watt','Ohm'],            ans: 3 },
      { q: 'Ohm\'s Law states: Voltage =',                      opts: ['Current + Resistance','Current × Resistance','Current ÷ Resistance','Resistance ÷ Current'], ans: 1 },
      { q: 'In a series circuit, current:',                     opts: ['Varies at each component','Is the same at every point','Is zero','Splits at junctions'], ans: 1 },
      { q: 'What does an ammeter measure?',                     opts: ['Voltage','Resistance','Current','Power'], ans: 2 },
      { q: 'Which material is a good electrical conductor?',    opts: ['Rubber','Plastic','Wood','Copper'],      ans: 3 },
    ],
    'Evolution': [
      { q: 'Who proposed the theory of evolution by natural selection?', opts: ['Gregor Mendel','Isaac Newton','Charles Darwin','Alfred Wallace'], ans: 2 },
      { q: 'What was the name of Darwin\'s ship?',              opts: ['HMS Victory','HMS Endeavour','HMS Beagle','HMS Discovery'], ans: 2 },
      { q: 'What are the "units of inheritance" called?',       opts: ['Chromosomes','Cells','Genes','Proteins'], ans: 2 },
      { q: 'Speciation is the process by which:',               opts: ['Species become extinct','New species form from existing ones','Animals migrate','Organisms reproduce'], ans: 1 },
      { q: '"Survival of the fittest" means:',                  opts: ['The fastest organisms survive','The strongest always win','Organisms best adapted to their environment reproduce more','The largest species dominate'], ans: 2 },
    ],
    'The Solar System': [
      { q: 'Which is the largest planet in our solar system?',  opts: ['Saturn','Neptune','Uranus','Jupiter'],   ans: 3 },
      { q: 'How long does light take to travel from the Sun to Earth?', opts: ['3 minutes','8 minutes','15 minutes','1 hour'], ans: 1 },
      { q: 'What is a light-year?',                             opts: ['How long light lasts','How fast light travels','Distance light travels in one year','Brightness of a star'], ans: 2 },
      { q: 'Which planet has the most moons?',                  opts: ['Jupiter','Saturn','Uranus','Neptune'],   ans: 1 },
      { q: 'What is the correct order of the first four planets from the Sun?', opts: ['Venus, Mercury, Earth, Mars','Mercury, Venus, Earth, Mars','Earth, Venus, Mercury, Mars','Mercury, Earth, Venus, Mars'], ans: 1 },
    ],
    'Chemical Reactions': [
      { q: 'A reaction that absorbs heat from surroundings is called:', opts: ['Exothermic','Neutralisation','Endothermic','Combustion'], ans: 2 },
      { q: 'What is the chemical formula for water?',           opts: ['HO','H₂O','H₂O₂','HO₂'],               ans: 1 },
      { q: 'When an acid and a base react, the products are:',  opts: ['Two acids','Gas and water','Salt and water','A new element'], ans: 2 },
      { q: 'A catalyst:',                                       opts: ['Is used up in the reaction','Slows the reaction','Speeds up the reaction without being consumed','Changes the products formed'], ans: 2 },
      { q: 'Combustion requires fuel, heat, and:',              opts: ['Water','Nitrogen','Oxygen','Carbon dioxide'], ans: 2 },
    ],
  },

  geography: {
    'Climate Change': [
      { q: 'Which gas is the main driver of human-caused climate change?', opts: ['Oxygen','Nitrogen','Carbon dioxide','Methane'], ans: 2 },
      { q: 'What does "carbon neutral" mean?',                  opts: ['Producing no carbon','Net zero CO₂ emissions','Using no fossil fuels','Planting one tree per tonne'], ans: 1 },
      { q: 'What was the Paris Agreement (2015)?',              opts: ['A trade deal','A treaty to limit global warming to 1.5–2 °C','A ban on coal','An agreement to stop deforestation'], ans: 1 },
      { q: 'How does deforestation worsen climate change?',     opts: ['Trees produce CO₂','Removing trees reduces CO₂ absorption','Deforestation cools the planet','Trees block sunlight'], ans: 1 },
      { q: 'Which of these is a renewable energy source?',      opts: ['Coal','Natural gas','Nuclear (sometimes)','Wind power'], ans: 3 },
    ],
    'World Capitals': [
      { q: 'Capital of Australia?',                             opts: ['Sydney','Melbourne','Canberra','Brisbane'], ans: 2 },
      { q: 'Capital of Canada?',                                opts: ['Toronto','Vancouver','Montreal','Ottawa'], ans: 3 },
      { q: 'Capital of Brazil?',                                opts: ['Rio de Janeiro','São Paulo','Brasília','Salvador'], ans: 2 },
      { q: 'Capital of Japan?',                                 opts: ['Osaka','Kyoto','Hiroshima','Tokyo'],     ans: 3 },
      { q: 'Capital of South Africa (executive)?',              opts: ['Cape Town','Johannesburg','Pretoria','Durban'], ans: 2 },
    ],
    'Natural Disasters': [
      { q: 'What most commonly causes a tsunami?',              opts: ['Volcanic eruption on land','Undersea earthquake','Hurricane','Landslide'], ans: 1 },
      { q: 'What does each whole-number increase on the Richter scale represent?', opts: ['10× stronger','100× stronger','5× stronger','2× stronger'], ans: 0 },
      { q: 'Where do most earthquakes occur?',                  opts: ['In the middle of continents','Near the poles','At tectonic plate boundaries','In deep oceans only'], ans: 2 },
      { q: 'What is the calm, low-pressure centre of a hurricane called?', opts: ['The edge','The wall','The eye','The base'], ans: 2 },
      { q: 'A pyroclastic flow is:',                            opts: ['A slow lava stream','A cloud of ash and dust','A fast current of hot gas and volcanic debris','A type of earthquake'], ans: 2 },
    ],
    'Plate Tectonics': [
      { q: 'Approximately how many major tectonic plates are there?', opts: ['4–5','7–8','12–15','20+'],         ans: 1 },
      { q: 'Which type of boundary forms mountain ranges?',     opts: ['Divergent','Transform','Convergent','Subduction only'], ans: 2 },
      { q: 'What is the Ring of Fire?',                         opts: ['A volcanic region in Africa','A zone of earthquakes and volcanoes around the Pacific','A ring of coral reefs','A desert zone'], ans: 1 },
      { q: 'Who first proposed the theory of continental drift?', opts: ['Charles Lyell','Alfred Wegener','Harry Hess','James Hutton'], ans: 1 },
      { q: 'At a mid-ocean ridge, tectonic plates are:',        opts: ['Colliding','Sliding past each other','Moving apart','Subducting'], ans: 2 },
    ],
    'Rivers & Mountains': [
      { q: 'What is the longest river in the world?',           opts: ['Amazon','Congo','Yangtze','Nile'],       ans: 3 },
      { q: 'What is the highest mountain in the world?',        opts: ['K2','Kangchenjunga','Mount Everest','Lhotse'], ans: 2 },
      { q: 'A meander is a feature of which stage of a river?', opts: ['Upper course','Source','Middle/lower course','Estuary only'], ans: 2 },
      { q: 'What is a watershed?',                              opts: ['A river delta','High land dividing drainage basins','Where a river meets the sea','The deepest part of a river'], ans: 1 },
      { q: 'Which process involves rock being worn away by water, wind or ice?', opts: ['Deposition','Transportation','Erosion','Weathering'], ans: 2 },
    ],
    'Biomes': [
      { q: 'Which biome has the greatest biodiversity?',        opts: ['Savannah','Temperate forest','Tundra','Tropical rainforest'], ans: 3 },
      { q: 'What characterises the tundra biome?',              opts: ['Dense forests','Hot and dry conditions','Permafrost and very low temperatures','High rainfall'], ans: 2 },
      { q: 'What is the boreal forest (taiga) biome also called?', opts: ['Savannah','Chaparral','Coniferous forest','Mangrove'], ans: 2 },
      { q: 'Which biome receives less than 250 mm of rain per year?', opts: ['Temperate grassland','Desert','Mediterranean','Tropical rainforest'], ans: 1 },
      { q: 'The Amazon rainforest is located in which biome?',  opts: ['Temperate deciduous forest','Tropical rainforest','Savannah','Mangrove swamp'], ans: 1 },
    ],
    'Africa': [
      { q: 'What is the largest country in Africa by area?',    opts: ['Sudan','Democratic Republic of Congo','Libya','Algeria'], ans: 3 },
      { q: 'What is the longest river in Africa?',              opts: ['Congo','Niger','Zambezi','Nile'],        ans: 3 },
      { q: 'How many countries are in Africa?',                 opts: ['48','52','54','57'],                     ans: 2 },
      { q: 'What is the Sahara?',                               opts: ['The world\'s largest rainforest','The world\'s largest hot desert','A major river system','A mountain range'], ans: 1 },
      { q: 'The Great Rift Valley runs through which part of Africa?', opts: ['West Africa','North Africa','Central Africa','East Africa'], ans: 3 },
    ],
    'World Oceans': [
      { q: 'Which is the largest ocean?',                       opts: ['Atlantic','Indian','Arctic','Pacific'],  ans: 3 },
      { q: 'What is the deepest point on Earth?',               opts: ['Java Trench','Puerto Rico Trench','Mariana Trench','Tonga Trench'], ans: 2 },
      { q: 'Approximately what percentage of Earth\'s surface is ocean?', opts: ['51%','61%','71%','81%'],       ans: 2 },
      { q: 'What primarily causes ocean tides?',                opts: ['Wind','Earth\'s rotation','Gravitational pull of the Moon','Ocean currents'], ans: 2 },
      { q: 'What is thermohaline circulation also known as?',   opts: ['The trade winds','The jet stream','The ocean conveyor belt','El Niño'], ans: 2 },
    ],
  },

  art: {
    'Impressionism': [
      { q: 'Who was the leading figure of Impressionism?',      opts: ['Edgar Degas','Pierre-Auguste Renoir','Claude Monet','Paul Cézanne'], ans: 2 },
      { q: 'Where did Impressionism originate?',                opts: ['England','Germany','Italy','France'],   ans: 3 },
      { q: 'What does "en plein air" mean?',                    opts: ['In a studio','At night','Outdoors','With natural light only'], ans: 2 },
      { q: 'Which painting gave Impressionism its name?',       opts: ['Water Lilies','The Luncheon on the Grass','Impression, Sunrise','Starry Night'], ans: 2 },
      { q: 'What was innovative about Impressionist brushwork?', opts: ['Perfect smooth blending','Short, visible strokes capturing light','Very dark palette','Highly detailed realism'], ans: 1 },
    ],
    'Renaissance': [
      { q: 'What does "Renaissance" mean?',                     opts: ['Revolution','Reformation','Rebirth','Renewal'], ans: 2 },
      { q: 'Where did the Renaissance begin?',                  opts: ['France','Spain','England','Italy'],     ans: 3 },
      { q: 'Who painted the ceiling of the Sistine Chapel?',    opts: ['Leonardo da Vinci','Raphael','Donatello','Michelangelo'], ans: 3 },
      { q: 'Which technique creates strong contrast between light and dark?', opts: ['Impasto','Sfumato','Chiaroscuro','Fresco'], ans: 2 },
      { q: 'Who is considered the ultimate "Renaissance man"?', opts: ['Raphael','Michelangelo','Leonardo da Vinci','Botticelli'], ans: 2 },
    ],
    'Colour Theory': [
      { q: 'What are the three traditional primary pigment colours?', opts: ['Red, green, blue','Red, yellow, blue','Cyan, magenta, yellow','Orange, purple, green'], ans: 1 },
      { q: 'Complementary colours are:',                        opts: ['Similar shades','Adjacent on the wheel','Opposite on the colour wheel','Always warm colours'], ans: 2 },
      { q: 'What is a "tint"?',                                 opts: ['A colour mixed with black','A colour mixed with white','A dark shade','A muted tone'], ans: 1 },
      { q: 'Mixing two primary colours creates a:',             opts: ['Tertiary colour','Tint','Secondary colour','Shade'], ans: 2 },
      { q: 'What is the complementary colour of red?',          opts: ['Blue','Orange','Purple','Green'],       ans: 3 },
    ],
    'Cubism': [
      { q: 'Who co-founded Cubism?',                            opts: ['Dalí and Miró','Monet and Renoir','Picasso and Braque','Matisse and Duchamp'], ans: 2 },
      { q: 'What is the key feature of Cubist paintings?',      opts: ['Dreamlike imagery','Bright naturalistic colours','Multiple perspectives shown simultaneously','Smooth precise lines'], ans: 2 },
      { q: 'Which Picasso painting is considered a Cubist landmark?', opts: ['Guernica','The Weeping Woman','Les Demoiselles d\'Avignon','Three Musicians'], ans: 2 },
      { q: 'In which decade did Cubism emerge?',                opts: ['1880s','1890s','1900s','1920s'],        ans: 2 },
      { q: 'Analytic Cubism is known for its:',                 opts: ['Bright primary colours','Monochromatic palette and fragmented forms','Use of collage','Dreamlike subjects'], ans: 1 },
    ],
    'Surrealism': [
      { q: 'Who wrote the Surrealist Manifesto?',               opts: ['Salvador Dalí','Max Ernst','René Magritte','André Breton'], ans: 3 },
      { q: 'Who painted "The Persistence of Memory" (melting clocks)?', opts: ['René Magritte','Max Ernst','Salvador Dalí','Joan Miró'], ans: 2 },
      { q: 'What did Surrealism seek to explore?',              opts: ['Political protest','Classical beauty','The unconscious mind and dreams','Industrial society'], ans: 2 },
      { q: 'Which Surrealist technique involved rubbing over textures?', opts: ['Decalcomania','Automatism','Frottage','Collage'], ans: 2 },
      { q: 'Which artist is known for self-portraits featuring Mexican culture?', opts: ['Georgia O\'Keeffe','Frida Kahlo','Tamara de Lempicka','Lee Krasner'], ans: 1 },
    ],
    'Street Art': [
      { q: 'Which anonymous British artist is globally famous for street art?', opts: ['Shepard Fairey','Invader','Banksy','Os Gemeos'], ans: 2 },
      { q: 'Where did modern graffiti art originate in the 1970s?', opts: ['Los Angeles','Chicago','New York City','London'], ans: 2 },
      { q: 'What technique do many street artists use for repeated designs?', opts: ['Fresco','Impasto','Stencilling','Pointillism'], ans: 2 },
      { q: 'Jean-Michel Basquiat is known for which iconic motif?', opts: ['A smiley face','A peace sign','The radiant child and crown','A barcode'], ans: 2 },
      { q: 'What is "wheat-pasting"?',                          opts: ['A painting method','Sticking large paper prints to walls using flour paste','A type of spray paint','Painting on food'], ans: 1 },
    ],
    'Famous Paintings': [
      { q: 'Who painted "The Starry Night"?',                   opts: ['Claude Monet','Paul Gauguin','Vincent van Gogh','Paul Cézanne'], ans: 2 },
      { q: 'Where is the "Mona Lisa" displayed?',               opts: ['The Uffizi, Florence','The Prado, Madrid','The Louvre, Paris','The Met, New York'], ans: 2 },
      { q: 'Who painted "Girl with a Pearl Earring"?',          opts: ['Rembrandt','Peter Paul Rubens','Johannes Vermeer','Jan Steen'], ans: 2 },
      { q: 'Who painted "The Scream"?',                         opts: ['Vincent van Gogh','Edvard Munch','Franz Marc','Ernst Kirchner'], ans: 1 },
      { q: 'Picasso\'s "Guernica" depicts the suffering caused by:', opts: ['World War I','A Spanish bullfight','The bombing of a Basque town','The French Revolution'], ans: 2 },
    ],
    'Art Techniques': [
      { q: 'What is "impasto"?',                                opts: ['Painting on wet plaster','Applying thick paint to canvas','A glazing technique','Scratching through paint'], ans: 1 },
      { q: 'What is fresco?',                                   opts: ['Painting on dry plaster','Painting on canvas','Painting on wet plaster','A printing technique'], ans: 2 },
      { q: 'What is the "vanishing point" in linear perspective?', opts: ['Where paint runs out','The focal point of colour','Where parallel lines appear to meet','The centre of the canvas'], ans: 2 },
      { q: 'Hatching in drawing means:',                        opts: ['Filling with flat colour','Drawing closely spaced parallel lines to create tone','Blending with a finger','Using only three colours'], ans: 1 },
      { q: 'The "rule of thirds" relates to:',                  opts: ['Using three colours only','Dividing a composition into a 3×3 grid to guide placement','Applying three layers of paint','Using three light sources'], ans: 1 },
    ],
  },
};

let quizSubject   = 'math';
let quizTopic     = '';
let quizQuestions = [];
let quizQIndex    = 0;
let quizScore     = 0;
let quizAnswered  = false;
let quizDone      = false;
let quizLoading   = false;

function initQuiz(subject) {
  quizSubject   = subject;
  quizTopic     = '';
  quizQuestions = [];
  quizQIndex    = 0;
  quizScore     = 0;
  quizAnswered  = false;
  quizDone      = false;
  quizLoading   = false;
  renderQuiz();
}

function generateQuiz() {
  const topicInput = document.getElementById('quiz-topic-input');
  const typed = topicInput ? topicInput.value.trim() : '';
  if (!typed) { showToast('Please enter a topic first!', ''); return; }

  const bank = QUIZ_BANK[quizSubject] || {};

  // 1. Exact case-insensitive match
  let key = Object.keys(bank).find(k => k.toLowerCase() === typed.toLowerCase());
  // 2. Partial match fallback
  if (!key) key = Object.keys(bank).find(
    k => k.toLowerCase().includes(typed.toLowerCase()) ||
         typed.toLowerCase().includes(k.toLowerCase())
  );

  if (!key) {
    renderQuizNotFound(typed);
    return;
  }

  quizTopic     = key;
  quizQuestions = [...bank[key]];
  quizQIndex    = 0;
  quizScore     = 0;
  quizAnswered  = false;
  quizDone      = false;
  renderQuiz();
}

function renderQuizNotFound(typed) {
  const body = document.getElementById('quiz-body');
  if (!body) return;
  const available = Object.keys(QUIZ_BANK[quizSubject] || {}).map(
    t => `<button class="quiz-chip-btn" data-topic="${escHtml(t)}">${escHtml(t)}</button>`
  ).join('');
  body.innerHTML = `
    <div class="quiz-not-found">
      <div class="quiz-not-found-icon">🔍</div>
      <p class="quiz-not-found-msg">
        <strong>"${escHtml(typed)}"</strong> isn't in the question bank yet.
      </p>
      <p class="quiz-chips-label">Available topics for this subject:</p>
      <div class="quiz-chips">${available}</div>
    </div>`;
  body.querySelectorAll('.quiz-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById('quiz-topic-input');
      if (inp) { inp.value = btn.dataset.topic; generateQuiz(); }
    });
  });
}

function renderQuiz() {
  const body = document.getElementById('quiz-body');
  if (!body) return;

  /* ── Topic input ── */
  if (!quizQuestions.length && !quizDone) {
    const chips = Object.keys(QUIZ_BANK[quizSubject] || {}).map(
      t => `<button class="quiz-chip-btn" data-topic="${escHtml(t)}">${escHtml(t)}</button>`
    ).join('');
    body.innerHTML = `
      <div class="quiz-topic-form">
        <label class="quiz-topic-label">What topic do you want to study?</label>
        <div class="quiz-topic-row">
          <input id="quiz-topic-input" class="quiz-topic-input" type="text"
            placeholder="e.g. Algebra, Macbeth, Photosynthesis…" maxlength="80" autocomplete="off">
          <button class="btn btn-study btn-sm" id="quiz-generate-btn">▶ Start Quiz</button>
        </div>
        <p class="quiz-chips-label">Available topics:</p>
        <div class="quiz-chips">${chips}</div>
      </div>`;
    const inp = document.getElementById('quiz-topic-input');
    document.getElementById('quiz-generate-btn').addEventListener('click', generateQuiz);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') generateQuiz(); });
    body.querySelectorAll('.quiz-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => { inp.value = btn.dataset.topic; generateQuiz(); });
    });
    return;
  }

  /* ── Result ── */
  if (quizDone) {
    const total = quizQuestions.length;
    const pct   = quizScore / total;
    const msg   = pct === 1 ? '🌟 Perfect score!'  :
                  pct >= .8 ? '🔥 Excellent!'       :
                  pct >= .6 ? '👍 Well done!'       :
                  pct >= .4 ? '📚 Keep practising!' : '💪 Study harder!';
    body.innerHTML = `
      <div class="quiz-result">
        <div class="quiz-result-topic">📖 ${escHtml(quizTopic)}</div>
        <div class="quiz-result-score">${quizScore}/${total}</div>
        <div class="quiz-result-label">correct answers</div>
        <div class="quiz-result-msg">${msg}</div>
        <div class="quiz-xp-earned">🌟 +10 XP earned!</div><br>
        <button class="btn btn-study btn-sm" id="quiz-retry-btn">🔄 Try Another Topic</button>
      </div>`;
    document.getElementById('quiz-retry-btn').addEventListener('click', () => initQuiz(quizSubject));
    return;
  }

  /* ── Active question ── */
  const q   = quizQuestions[quizQIndex];
  const tot = quizQuestions.length;
  const bar = (quizQIndex / tot) * 100;

  body.innerHTML = `
    <div class="quiz-question-wrap">
      <div class="quiz-topic-chip">📖 ${escHtml(quizTopic)}</div>
      <div class="quiz-progress-row">
        <span class="quiz-progress-text">Q${quizQIndex + 1} of ${tot}</span>
        <div class="quiz-progress-track">
          <div class="quiz-progress-fill" style="width:${bar}%"></div>
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

  document.querySelectorAll('#quiz-body .quiz-option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.ans)                btn.classList.add('correct');
    else if (i === idx && !correct) btn.classList.add('wrong');
  });

  setTimeout(() => {
    quizQIndex++;
    quizAnswered = false;
    if (quizQIndex >= quizQuestions.length) {
      quizDone = true;
      updateSubjectProgress(quizSubject, quizScore, quizQuestions.length);
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

function updateSubjectProgress(subjectKey, score, total) {
  const p = subjectProgress[subjectKey];
  p.quizzes++;
  p.totalScore += score;
  if (score > p.bestScore) {
    p.bestScore = score;
    p.bestTotal = total;
  }
  saveSubjectProgressLocal();
  renderSubjectProgress();
}

function renderSubjectProgress() {
  const grid = document.getElementById('subject-progress-grid');
  if (!grid) return;
  grid.innerHTML = SUBJECT_META.map(s => {
    const p   = subjectProgress[s.key] || { quizzes: 0, bestScore: 0, bestTotal: 5 };
    const tot = p.bestTotal || 5;
    const pct = p.quizzes > 0 ? Math.round((p.bestScore / tot) * 100) : 0;
    return `
      <div class="subject-prog-item">
        <div class="subject-prog-emoji">${s.emoji}</div>
        <div class="subject-prog-name">${s.label}</div>
        <div class="subject-prog-bar-wrap">
          <div class="subject-prog-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="subject-prog-stats">
          ${p.quizzes} quiz${p.quizzes !== 1 ? 'zes' : ''}<br>
          Best: ${p.bestScore}/${tot}
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
