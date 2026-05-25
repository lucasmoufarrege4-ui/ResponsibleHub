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
  if (page === 'home')  { updateHomeView(); updateCountdown(); }
  if (page === 'profile') initProfilePage();
  if (page === 'coach') initCoachPage();
  if (page === 'style') initStylePage();
  if (page === 'study') initStudyPage();
  if (page === 'eco')   initEcoPage();
}

document.querySelectorAll('.bnav-btn').forEach(btn =>
  btn.addEventListener('click', () => navigateTo(btn.dataset.page))
);
document.querySelectorAll('.dash-row-btn').forEach(btn =>
  btn.addEventListener('click', () => navigateTo(btn.dataset.page))
);

/* ── Theme Toggle ────────────────────────────────────────────────── */
(function initTheme() {
  if (localStorage.getItem('rh_theme') === 'light') {
    document.body.classList.add('light-mode');
    document.getElementById('theme-toggle').textContent = '☀️';
  }
})();
document.getElementById('theme-toggle').addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-mode');
  document.getElementById('theme-toggle').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('rh_theme', isLight ? 'light' : 'dark');
});

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
    // Load user data on sign-in / session restore.
    // Also allow TOKEN_REFRESHED to trigger a load when the array is still
    // empty — this covers the case where INITIAL_SESSION fires with a null
    // session (expired token) and TOKEN_REFRESHED carries the real session.
    // When the array is already populated we block TOKEN_REFRESHED so a
    // background token refresh can't wipe cards that are mid-save.
    if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION' || flashcards.length === 0) {
      loadFlashcards();
      loadQuizHistory();
      checkWeeklyEcoCompletion();
    }
  } else {
    sbProfile = null;
    flashcards = []; // reset so the empty-array guard re-triggers on next login
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
  if (!sbUser || !sbProfile) {
    console.warn('[XP] addXP called but sbUser/sbProfile not ready. sbUser:', !!sbUser, 'sbProfile:', !!sbProfile);
    return;
  }
  const levelBefore = getLevelInfo(sbProfile.xp).name;
  const { error } = await sb.rpc('increment_xp', { uid: sbUser.id, amount });
  if (error) {
    console.error('[XP] increment_xp RPC error:', error);
  } else {
    sbProfile.xp += amount;
    updateTopBar();
    updateDashXP();
    showToast(`+${amount} XP saved! 🌟`, 'study-toast');
    if (currentPage === 'leaderboard') loadLeaderboard();
    const levelAfter = getLevelInfo(sbProfile.xp).name;
    if (levelBefore !== levelAfter) showLevelUpCelebration(levelAfter);
  }
}

function showLevelUpCelebration(levelName) {
  const ov = document.getElementById('levelup-overlay');
  if (!ov) return;
  document.getElementById('levelup-name').textContent = levelName;
  ov.classList.remove('hidden');
  _spawnConfetti();
}

function _spawnConfetti() {
  const container = document.getElementById('levelup-sparks');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#52b788','#f6d860','#e88c30','#74c0fc','#f783ac','#a9e34b','#ff6b6b'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = [
      `left:${Math.random()*100}%`,
      `background:${colors[i % colors.length]}`,
      `animation-delay:${(Math.random()*1.2).toFixed(2)}s`,
      `animation-duration:${(1.4 + Math.random()*1.4).toFixed(2)}s`,
      `width:${Math.round(6 + Math.random()*7)}px`,
      `height:${Math.round(6 + Math.random()*7)}px`,
      `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
    ].join(';');
    container.appendChild(el);
  }
}

document.getElementById('levelup-close-btn').addEventListener('click', () => {
  document.getElementById('levelup-overlay').classList.add('hidden');
  document.getElementById('levelup-sparks').innerHTML = '';
});

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
  // Extract first name from Google full_name, or from username
  const meta = sbUser?.user_metadata || {};
  const fullName = meta.full_name || meta.name || sbProfile.username;
  const firstName = fullName.split(/[\s_\-]+/)[0] || sbProfile.username;
  const greetEl = document.getElementById('dash-time-greeting');
  const nameEl  = document.getElementById('dash-first-name');
  if (greetEl) greetEl.textContent = g;
  if (nameEl)  nameEl.textContent  = `${firstName}! 👋`;
  setAvatarEl(document.getElementById('dash-avatar'));
  updateDashXP();
  updateDashStats();
  updateTodayActivity();
  checkLoginStreak();
}

const LEVELS = [
  { min: 0,   name: '🌱 Seedling',  next: 100 },
  { min: 100, name: '🌿 Explorer',  next: 300 },
  { min: 300, name: '🌳 Guardian',  next: 600 },
  { min: 600, name: '🌍 Champion',  next: null },
];

function getLevelInfo(xp) {
  const lvl = [...LEVELS].reverse().find(l => xp >= l.min) || LEVELS[0];
  let pct = 0, toNext = '';
  if (lvl.next !== null) {
    pct    = Math.min(((xp - lvl.min) / (lvl.next - lvl.min)) * 100, 100);
    toNext = `${lvl.next - xp} XP to next level`;
  } else {
    pct    = 100;
    toNext = 'Max level reached! 🏆';
  }
  return { name: lvl.name, pct, toNext };
}

function updateDashXP() {
  if (!sbProfile) return;
  const xp = sbProfile.xp;
  const { name, pct, toNext } = getLevelInfo(xp);
  const badgeEl = document.getElementById('xp-level-badge');
  const valEl   = document.getElementById('dash-xp-value');
  const barEl   = document.getElementById('dash-xp-bar');
  const nextEl  = document.getElementById('xp-to-next');
  if (badgeEl) badgeEl.textContent = name;
  if (valEl)   valEl.textContent   = xp;
  if (barEl)   barEl.style.width   = pct + '%';
  if (nextEl)  nextEl.textContent  = toNext;
  fetchRank();
}

async function fetchRank() {
  if (!sbProfile) return;
  const { count } = await sb.from('profiles')
    .select('*', { count: 'exact', head: true }).gt('xp', sbProfile.xp);
  const el = document.getElementById('dash-rank');
  if (el) el.textContent = `#${(count ?? 0) + 1} on the leaderboard`;
}

async function checkLoginStreak() {
  if (!sbUser || !sbProfile) return;
  const today = dateToStr(new Date());
  const lastLogin = sbProfile.last_login_date;
  let streak = sbProfile.login_streak || 0;

  if (lastLogin === today) { updateStreakDisplay(streak); return; }

  const yest = dateToStr(new Date(Date.now() - 86400000));
  streak = (lastLogin === yest) ? streak + 1 : 1;

  try {
    const { error } = await sb.from('profiles')
      .update({ login_streak: streak, last_login_date: today })
      .eq('id', sbUser.id);
    if (!error) { sbProfile.login_streak = streak; sbProfile.last_login_date = today; }
  } catch(e) { console.warn('[Streak] update error:', e); }

  updateStreakDisplay(streak);
}

function updateStreakDisplay(streak) {
  const el   = document.getElementById('streak-hero');
  const cnt  = document.getElementById('streak-count');
  const desc = document.getElementById('streak-desc');
  if (!el) return;
  if (streak > 0) el.classList.remove('hidden'); else { el.classList.add('hidden'); return; }
  if (cnt)  cnt.textContent  = streak;
  if (desc) desc.textContent =
    streak >= 30 ? '🏆 Legendary!' :
    streak >= 14 ? '🔥 On fire!'   :
    streak >=  7 ? '💪 Great week!' :
    streak >=  3 ? '⭐ Keep it up!' : '🌱 Just started!';
}

async function updateDashStats() {
  if (!sbProfile) return;

  // Challenges: total completions from Supabase
  let chalCount = '–';
  try {
    const { data, error } = await sb.from('challenge_completions')
      .select('id', { count: 'exact', head: false })
      .eq('user_id', sbProfile.id);
    if (!error) chalCount = (data || []).length;
  } catch (e) { /* silent */ }

  // Tasks Done: count done items from in-memory hwTasks array
  const taskCount = hwTasks.filter(t => t.done).length;

  // Eco Actions: eco completions from Supabase
  let ecoCount = '–';
  try {
    const { data, error } = await sb.from('challenge_completions')
      .select('id', { count: 'exact', head: false })
      .eq('user_id', sbProfile.id).eq('challenge_id', 'eco');
    if (!error) ecoCount = (data || []).length;
  } catch (e) {
    // fallback: if carbon answers exist, count as 1
    try {
      const ans = JSON.parse(localStorage.getItem('rh_carbon_answers') || 'null');
      ecoCount = (ans && Object.values(ans).some(v => v > 0)) ? 1 : 0;
    } catch (e2) { ecoCount = 0; }
  }

  const c  = document.getElementById('dash-challenges');
  const t  = document.getElementById('dash-tasks');
  const co = document.getElementById('dash-co2');
  if (c)  c.textContent  = chalCount;
  if (t)  t.textContent  = taskCount;
  if (co) co.textContent = ecoCount;
}

function updateTodayActivity() {
  const el = document.getElementById('today-activity');
  if (!el) return;
  const items = [];
  if (studyDone) items.push({ icon: '📚', text: 'Study challenge completed', cls: 'study' });
  if (ecoDone)   items.push({ icon: '🌍', text: 'Eco mission completed',     cls: 'eco'   });
  // Show up to 2 completed planner goals for today
  const todayGoals = (plannerCache[dateToStr(new Date())]?.goals || []).filter(g => g.done);
  todayGoals.slice(0, 2).forEach(g =>
    items.push({ icon: '✅', text: g.text, cls: 'task' })
  );
  if (!items.length) {
    el.innerHTML = '<p class="today-empty">No activity yet — complete a challenge to start! 🌟</p>';
  } else {
    el.innerHTML = items.map(item =>
      `<div class="today-item today-item-${item.cls}">
        <span class="today-item-icon">${item.icon}</span>
        <span class="today-item-text">${escHtml(item.text)}</span>
      </div>`
    ).join('');
  }
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
let lbFilter = 'alltime';

async function loadLeaderboard() {
  if (lbFilter !== 'alltime') return loadLeaderboardPeriod(lbFilter);
  const el = document.getElementById('lb-list');
  el.innerHTML = '<div class="lb-loading">Loading rankings…</div>';

  // Show "Your Rank" card if signed in
  const yrCard = document.getElementById('lb-your-rank');
  if (yrCard && sbProfile) yrCard.classList.remove('hidden');
  else if (yrCard)         yrCard.classList.add('hidden');

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

    let rows = data || [];
    if (error) {
      console.error('[Leaderboard] Supabase error:', error);
      rows = [];
    }
    // Always show at least the current user on error or empty
    if (!rows.length && sbProfile) {
      rows = [{ id: sbProfile.id, username: sbProfile.username, xp: sbProfile.xp }];
    }
    console.log('[Leaderboard] Rendering', rows.length, 'row(s)');
    renderLeaderboard(rows);

  } catch (err) {
    clearTimeout(timer);
    console.error('[Leaderboard] Error:', err);
    // Fallback: show current user if signed in, otherwise empty state
    const rows = sbProfile
      ? [{ id: sbProfile.id, username: sbProfile.username, xp: sbProfile.xp }]
      : [];
    renderLeaderboard(rows);
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

  // Update "Your Rank" summary card
  if (sbProfile) {
    const myIdx  = rows.findIndex(r => r.id === sbProfile.id);
    const yrRank = document.getElementById('lb-yr-rank');
    const yrXp   = document.getElementById('lb-yr-xp');
    if (yrRank) yrRank.textContent = myIdx >= 0 ? `#${myIdx + 1}` : '–';
    if (yrXp)   yrXp.textContent   = `${sbProfile.xp} XP`;
  }

  el.innerHTML = rows.map((row, i) => {
    const isMe    = sbProfile && sbProfile.id === row.id;
    const pct     = maxXp > 0 ? Math.round((row.xp / maxXp) * 100) : 0;
    const medal   = medals[i] ? `<span class="lb-medal-emoji">${medals[i]}</span>`
                               : `<span class="lb-rank-num">#${i + 1}</span>`;
    const initial = (row.username || '?')[0].toUpperCase();
    const { name: lvlName } = getLevelInfo(row.xp);
    return `
      <div class="lb-row${isMe ? ' lb-me' : ''}${i < 3 ? ' lb-top' : ''}">
        <div class="lb-medal">${medal}</div>
        <div class="lb-avatar">${initial}</div>
        <div class="lb-info">
          <div class="lb-name">${escHtml(row.username)}${isMe ? ' <span class="lb-you-badge">You</span>' : ''}</div>
          <div class="lb-lvl">${lvlName}</div>
          <div class="lb-bar-wrap"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="lb-xp-badge">${row.xp} <span class="lb-xp-unit">XP</span></div>
      </div>`;
  }).join('');
}

document.getElementById('lb-refresh-btn').addEventListener('click', loadLeaderboard);

document.getElementById('lb-filter-tabs').querySelectorAll('.lb-filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('lb-filter-tabs').querySelectorAll('.lb-filter-tab')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lbFilter = btn.dataset.filter;
    loadLeaderboard();
  });
});

async function loadLeaderboardPeriod(period) {
  const el = document.getElementById('lb-list');
  el.innerHTML = '<div class="lb-loading">Loading rankings…</div>';
  const yrCard = document.getElementById('lb-your-rank');
  if (yrCard && sbProfile) yrCard.classList.remove('hidden');
  else if (yrCard) yrCard.classList.add('hidden');

  try {
    const now = new Date();
    let cutoff;
    if (period === 'week') {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      monday.setHours(0,0,0,0);
      cutoff = monday.toISOString();
    } else {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }

    const { data: completions } = await sb.from('challenge_completions')
      .select('user_id, challenge_id')
      .gte('completed_at', cutoff);

    const XP_PER = { study: 15, eco: 20, eco_weekly: 50 };
    const xpMap = {};
    (completions || []).forEach(c => {
      xpMap[c.user_id] = (xpMap[c.user_id] || 0) + (XP_PER[c.challenge_id] || 15);
    });

    const userIds = Object.keys(xpMap);
    let rows = [];
    if (userIds.length) {
      const { data: profiles } = await sb.from('profiles')
        .select('id, username, xp').in('id', userIds);
      rows = (profiles || [])
        .map(p => ({ id: p.id, username: p.username, xp: xpMap[p.id] || 0 }))
        .sort((a, b) => b.xp - a.xp).slice(0, 20);
    }
    if (sbProfile && !rows.find(r => r.id === sbProfile.id)) {
      rows.push({ id: sbProfile.id, username: sbProfile.username, xp: xpMap[sbProfile.id] || 0 });
    }
    if (!rows.length && sbProfile) {
      rows = [{ id: sbProfile.id, username: sbProfile.username, xp: 0 }];
    }
    renderLeaderboard(rows);
  } catch(err) {
    console.error('[Leaderboard] period error:', err);
    renderLeaderboard(sbProfile ? [{ id: sbProfile.id, username: sbProfile.username, xp: 0 }] : []);
  }
}

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
  // Seed cache with empties for all 7 days, then overwrite with DB rows.
  // _loaded marks an entry as having been authoritative-fetched from Supabase so
  // loadPlannerData() knows it can trust the cache (even if the value is empty).
  weekDates.forEach(ds => {
    if (!plannerCache[ds]?._loaded) plannerCache[ds] = { schedule: '', goals: [], _loaded: true };
  });
  if (data) data.forEach(r => {
    plannerCache[r.date] = { schedule: r.schedule || '', goals: r.goals || [], _loaded: true };
  });
  renderWeekStrip();
  updatePlannerDateHeader();
  await loadPlannerData();
  renderWeekSummary();
}

function showPlannerApp() {
  DayBuilder.init(); // idempotent — safe to call every time, only wires once
  document.getElementById('planner-locked').classList.add('hidden');
  document.getElementById('planner-app').classList.remove('hidden');
  selectedPlanDate = dateToStr(new Date()); // always land on today
  if (sbProfile) document.getElementById('planner-user-badge').textContent = `👤 ${sbProfile.username}`;
  // Always land on Planner tab when opening the page
  switchPlannerTab('planner');
  loadWeekData();
  loadReminders(); // fire-and-forget, runs in parallel
  initNotifToggle();
}
function showPlannerLocked() {
  document.getElementById('planner-locked').classList.remove('hidden');
  document.getElementById('planner-app').classList.add('hidden');
}

async function loadPlannerData() {
  if (!sbUser) return;
  // Serve from cache only when the entry was actually loaded from Supabase (_loaded flag).
  // Entries without _loaded were never fetched, so always go to the DB.
  if (plannerCache[selectedPlanDate]?._loaded) {
    const c = plannerCache[selectedPlanDate];
    document.getElementById('planner-schedule').value = c.schedule;
    plannerGoals = [...c.goals];
    renderGoals();
    DayBuilder.showState(c.schedule?.trim() ? 'schedule' : 'idle');
    return;
  }
  const { data } = await sb.from('daily_plans')
    .select('*').eq('user_id', sbUser.id).eq('date', selectedPlanDate).single();
  plannerCache[selectedPlanDate] = { schedule: data?.schedule || '', goals: data?.goals || [] };
  document.getElementById('planner-schedule').value = plannerCache[selectedPlanDate].schedule;
  plannerGoals = [...plannerCache[selectedPlanDate].goals];
  renderGoals();
  DayBuilder.showState(plannerCache[selectedPlanDate].schedule?.trim() ? 'schedule' : 'idle');
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
      plannerCache[today] = { schedule: data?.schedule || '', goals: data?.goals || [], _loaded: true };
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
      <button class="goal-check-btn${g.done ? ' goal-check-done' : ''}" data-idx="${i}" aria-label="${g.done ? 'Mark incomplete' : 'Mark complete'}">
        ${g.done ? '✓' : ''}
      </button>
      <span class="goal-text">${escHtml(g.text)}</span>
      <button class="hw-delete" data-idx="${i}">×</button>
    </li>`).join('');
  list.querySelectorAll('.goal-check-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      plannerGoals[+btn.dataset.idx].done = !plannerGoals[+btn.dataset.idx].done;
      renderGoals(); autoSavePlanner();
    });
  });
  list.querySelectorAll('.hw-delete').forEach(btn => {
    btn.addEventListener('click', () => { plannerGoals.splice(+btn.dataset.idx, 1); renderGoals(); autoSavePlanner(); });
  });
  const done = plannerGoals.filter(g => g.done).length, total = plannerGoals.length;
  updateGoalsRing(done, total);
  renderWeekSummary();
  if (total > 0 && done === total) showToast('🎯 All goals complete! Incredible!', 'study-toast');
}

function updateGoalsRing(done, total) {
  const r = 50, circum = 2 * Math.PI * r; // ≈ 314.16
  const fgEl   = document.getElementById('goals-ring-fg');
  const doneEl = document.getElementById('goals-ring-done');
  const totEl  = document.getElementById('goals-ring-total');
  if (fgEl) {
    const offset = total > 0 ? circum * (1 - done / total) : circum;
    fgEl.style.strokeDashoffset = offset;
  }
  if (doneEl) doneEl.textContent = done;
  if (totEl)  totEl.textContent  = total;
}

function renderWeekSummary() {
  let totalGoals = 0, doneGoals = 0, activeDays = 0;
  getWeekDates().forEach(d => {
    const ds     = dateToStr(d);
    const cached = plannerCache[ds];
    if (!cached) return;
    const goals = cached.goals || [];
    if (cached.schedule?.trim() || goals.length) activeDays++;
    totalGoals += goals.length;
    doneGoals  += goals.filter(g => g.done).length;
  });
  const pct = totalGoals > 0 ? Math.round(doneGoals / totalGoals * 100) : 0;
  const set  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ws-goals-total', totalGoals);
  set('ws-goals-done',  doneGoals);
  set('ws-days-active', activeDays);
  set('ws-bar-label',   `${pct}% of week goals done`);
  const bar = document.getElementById('ws-bar-fill');
  if (bar) bar.style.width = pct + '%';
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

// Called by DayBuilder after schedule generation — injects the day's goal into Goals list
function injectDayBuilderGoal(rawText) {
  if (!rawText || !rawText.trim()) {
    console.log('[DayBuilder] injectDayBuilderGoal: no goal text, skipping');
    return;
  }
  const goalText = rawText.trim();
  console.log('[DayBuilder] injectDayBuilderGoal called with:', goalText,
              '| selectedPlanDate:', selectedPlanDate,
              '| plannerGoals.length before:', plannerGoals.length);
  const alreadyExists = plannerGoals.some(g => g.text === goalText);
  if (alreadyExists) {
    console.log('[DayBuilder] goal already in list, skipping');
    return;
  }
  plannerGoals.push({ text: goalText, done: false, id: Date.now() });
  if (plannerCache[selectedPlanDate]) {
    plannerCache[selectedPlanDate].goals = [...plannerGoals];
  }
  renderGoals();
  autoSavePlanner();
  console.log('[DayBuilder] goal injected successfully, plannerGoals.length now:', plannerGoals.length);
}

async function savePlanner() {
  if (!sbUser) return;
  const schedule = document.getElementById('planner-schedule').value;
  const statusEl = document.getElementById('planner-save-status');
  statusEl.textContent = 'Saving…';
  plannerCache[selectedPlanDate] = { schedule, goals: [...plannerGoals], _loaded: true };
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
  plannerCache[selectedPlanDate] = { schedule, goals: [...plannerGoals], _loaded: true };
  await sb.from('daily_plans').upsert(
    { user_id: sbUser.id, date: selectedPlanDate, schedule, goals: plannerGoals, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,date' }
  );
  renderWeekStrip();
}

let _savePlannerTimer = null;
function autoSavePlanner() { clearTimeout(_savePlannerTimer); _savePlannerTimer = setTimeout(savePlanner, 1000); }
document.getElementById('planner-save-btn').addEventListener('click', savePlanner);
document.getElementById('planner-schedule').addEventListener('input', autoSavePlanner);

/* ─── DAY BUILDER ────────────────────────────────────────────────────── */
const DayBuilder = (() => {

  const BASE_QUESTIONS = [
    { id: 'wakeup',    emoji: '⏰', text: 'What time did you wake up today?',                  type: 'time',  defaultVal: '07:00', follow: null },
    { id: 'breakfast', emoji: '🍳', text: 'Did you have breakfast?',                           type: 'yesno', defaultVal: null,    follow: null },
    { id: 'school',    emoji: '🏫', text: 'What time does school start today?',                type: 'time',  defaultVal: '08:00', follow: null },
    { id: 'activity',  emoji: '⚽', text: 'Do you have any sports or activities today?',        type: 'yesno', defaultVal: null,
      follow: { id: 'activities', emoji: '⚽', text: 'Great! Add your activities below — name and time for each one.', type: 'activity_list', defaultVal: null, follow: null }
    },
    { id: 'homework',  emoji: '📚', text: 'Do you have homework or studying to do?',            type: 'yesno', defaultVal: null,
      follow: { id: 'homework_detail', emoji: '📚', text: 'Which subjects?',                  type: 'text',  defaultVal: null, follow: null }
    },
    { id: 'sleep',     emoji: '😴', text: 'What time do you want to sleep tonight?',            type: 'time',  defaultVal: '22:00', follow: null },
    { id: 'goal',      emoji: '🎯', text: "What's one goal you want to achieve today?",        type: 'text',  defaultVal: null, follow: null },
  ];

  let queue = [];
  let answers = {};
  let currentIdx = 0;

  /* ── state switcher ── */
  function showState(state) {
    const textarea = document.getElementById('planner-schedule');
    const idle     = document.getElementById('sched-idle');
    const chat     = document.getElementById('sched-chat');
    const result   = document.getElementById('sched-result');
    if (!idle || !chat || !result) return; // guard if planner not yet rendered

    if (state === 'idle') {
      idle.classList.remove('hidden');
      chat.classList.add('hidden');
      textarea.classList.add('sched-textarea-hidden');
      result.classList.add('hidden');
    } else if (state === 'chat') {
      idle.classList.add('hidden');
      chat.classList.remove('hidden');
      textarea.classList.add('sched-textarea-hidden');
      result.classList.add('hidden');
    } else { // 'schedule' — textarea + result buttons visible
      idle.classList.add('hidden');
      chat.classList.add('hidden');
      textarea.classList.remove('sched-textarea-hidden');
      result.classList.remove('hidden');
    }
  }

  /* ── start / reset ── */
  function start() {
    queue = [...BASE_QUESTIONS];
    answers = {};
    currentIdx = 0;
    document.getElementById('sched-chat-log').innerHTML = '';
    document.getElementById('sched-chat-answer').innerHTML = '';
    showState('chat');
    askNext();
  }

  /* ── progress ── */
  function updateProgress() {
    const pct = queue.length ? (currentIdx / queue.length) * 100 : 0;
    document.getElementById('sched-prog-fill').style.width = pct + '%';
    document.getElementById('sched-prog-lbl').textContent =
      `Question ${Math.min(currentIdx + 1, queue.length)} of ${queue.length}`;
  }

  /* ── question bubble ── */
  function addQuestionBubble(q) {
    const log = document.getElementById('sched-chat-log');
    const div = document.createElement('div');
    div.className = 'chat-bubble chat-q-bubble';
    div.innerHTML = `<span class="chat-bbl-emoji">${q.emoji}</span><span class="chat-bbl-txt">${q.text}</span>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  /* ── answer bubble ── */
  function addAnswerBubble(text) {
    const log = document.getElementById('sched-chat-log');
    const div = document.createElement('div');
    div.className = 'chat-bubble chat-a-bubble';
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  /* ── render answer input ── */
  function renderAnswerArea(q) {
    const area = document.getElementById('sched-chat-answer');
    area.innerHTML = '';

    if (q.type === 'yesno') {
      area.innerHTML = `
        <div class="chat-yesno-row">
          <button type="button" class="chat-yn-btn chat-yn-yes" data-val="yes">👍 Yes</button>
          <button type="button" class="chat-yn-btn chat-yn-no"  data-val="no">👎 No</button>
        </div>`;
      area.querySelectorAll('.chat-yn-btn').forEach(btn =>
        btn.addEventListener('click', () =>
          submitAnswer(q, btn.dataset.val, btn.dataset.val === 'yes' ? 'Yes ✅' : 'No ✗')
        )
      );

    } else if (q.type === 'time') {
      area.innerHTML = `
        <div class="chat-field-row">
          <input type="time" class="chat-field" id="chat-field" value="${q.defaultVal || ''}"/>
          <button type="button" class="chat-next-btn" id="chat-next-btn">Next →</button>
        </div>`;
      const f = area.querySelector('#chat-field');
      const b = area.querySelector('#chat-next-btn');
      b.addEventListener('click', () => { if (f.value) submitAnswer(q, f.value, f.value); });
      f.addEventListener('keydown', e => { if (e.key === 'Enter' && f.value) submitAnswer(q, f.value, f.value); });
      setTimeout(() => f.focus(), 80);

    } else if (q.type === 'activity_list' || q.id === 'activities') {
      renderActivityListArea(q);

    } else { // text
      area.innerHTML = `
        <div class="chat-field-row">
          <input type="text" class="chat-field" id="chat-field" placeholder="Type here…" maxlength="120"/>
          <button type="button" class="chat-next-btn" id="chat-next-btn">Next →</button>
        </div>`;
      const f = area.querySelector('#chat-field');
      const b = area.querySelector('#chat-next-btn');
      const go = () => { const v = f.value.trim(); if (v) submitAnswer(q, v, v); };
      b.addEventListener('click', go);
      f.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      setTimeout(() => f.focus(), 80);
    }
  }

  /* ── activity-list answer area (multi-activity, up to 4) ── */
  function renderActivityListArea(q) {
    const area = document.getElementById('sched-chat-answer');
    area.innerHTML = '';

    // actList is the local source of truth; each entry = { name, time }
    const actList = [{ name: '', time: '' }];

    function rebuild() {
      area.innerHTML = '';

      const listDiv = document.createElement('div');
      listDiv.className = 'chat-act-list';

      actList.forEach((act, idx) => {
        const row = document.createElement('div');
        row.className = 'chat-act-row';
        row.innerHTML = `
          <input type="text"  class="chat-field chat-act-name" placeholder="Activity name…" maxlength="60"/>
          <input type="time"  class="chat-field chat-act-time"/>
          ${actList.length > 1 ? `<button type="button" class="chat-act-del" title="Remove">✕</button>` : ''}
        `;

        const nameIn = row.querySelector('.chat-act-name');
        const timeIn = row.querySelector('.chat-act-time');
        nameIn.value = act.name;
        timeIn.value = act.time;
        nameIn.addEventListener('input', e => { actList[idx].name = e.target.value; });
        timeIn.addEventListener('input', e => { actList[idx].time = e.target.value; });

        if (actList.length > 1) {
          row.querySelector('.chat-act-del').addEventListener('click', () => {
            actList.splice(idx, 1);
            rebuild();
          });
        }

        listDiv.appendChild(row);
      });

      area.appendChild(listDiv);

      const btnRow = document.createElement('div');
      btnRow.className = 'chat-act-btn-row';

      if (actList.length < 4) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'chat-act-add-btn';
        addBtn.textContent = '+ Add another activity';
        addBtn.addEventListener('click', () => {
          actList.push({ name: '', time: '' });
          rebuild();
          // focus new row's name field
          const rows = area.querySelectorAll('.chat-act-name');
          const last = rows[rows.length - 1];
          if (last) setTimeout(() => last.focus(), 80);
        });
        btnRow.appendChild(addBtn);
      }

      const doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'chat-next-btn';
      doneBtn.textContent = 'Done →';
      doneBtn.addEventListener('click', () => {
        const filled = actList.filter(a => a.name.trim());
        if (!filled.length) return;
        const display = filled.map(a =>
          a.time ? `${a.name.trim()} @ ${a.time}` : a.name.trim()
        ).join(', ');
        submitAnswer(q, filled, display);
      });
      btnRow.appendChild(doneBtn);

      area.appendChild(btnRow);

      // focus first name field on initial render
      const first = area.querySelector('.chat-act-name');
      if (first && !first.value) setTimeout(() => first.focus(), 80);
    }

    rebuild();
  }

  /* ── submit an answer ── */
  function submitAnswer(q, value, display) {
    answers[q.id] = value;
    addAnswerBubble(display);
    document.getElementById('sched-chat-answer').innerHTML = '';

    // Insert conditional follow-up into queue right after current position
    if (q.follow && value === 'yes') {
      queue.splice(currentIdx + 1, 0, q.follow);
    }

    currentIdx++;
    setTimeout(askNext, 320);
  }

  /* ── ask next question or finish ── */
  function askNext() {
    if (currentIdx >= queue.length) { finish(); return; }
    updateProgress();
    addQuestionBubble(queue[currentIdx]);
    renderAnswerArea(queue[currentIdx]);
  }

  /* ── generate schedule string ── */
  function toMin(t)   { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m; }
  function toHHMM(m)  { return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }

  function generateSchedule(ans) {
    const entries = [];
    const wake   = toMin(ans.wakeup) ?? 7*60;
    const school = toMin(ans.school);
    const sleep  = toMin(ans.sleep)  ?? 22*60;

    entries.push({ t: wake,       label: '🌅 Wake up & morning routine' });
    if (ans.breakfast === 'yes')
      entries.push({ t: wake + 30, label: '🍳 Breakfast' });

    if (school) {
      entries.push({ t: Math.max(wake + 60, school - 20), label: '🚌 Travel to school' });
      entries.push({ t: school, label: '🏫 School starts' });
      const schoolEnd = school + 7*60;
      if (12*60 > school && 12*60 < schoolEnd)
        entries.push({ t: 12*60, label: '🥗 Lunch break' });
      entries.push({ t: schoolEnd, label: '🏠 Arrived home' });
    }

    if (ans.activity === 'yes' && Array.isArray(ans.activities) && ans.activities.length) {
      ans.activities.forEach(act => {
        const name = act.name ? act.name.trim() : 'Activity';
        const displayName = name.charAt(0).toUpperCase() + name.slice(1);
        let actTime = school ? school + 7*60 + 30 : 16*60;
        if (act.time) {
          const [h, m] = act.time.split(':').map(Number);
          actTime = h * 60 + m;
        }
        entries.push({ t: actTime, label: `⚽ ${displayName}` });
      });
    }

    if (ans.homework === 'yes') {
      const hwTime = school ? school + 8*60 : 17*60;
      const subj   = ans.homework_detail ? ` — ${ans.homework_detail}` : '';
      entries.push({ t: hwTime, label: `📚 Homework & studying${subj}` });
    }

    const windDown = sleep - 30;
    entries.push({ t: Math.max(wake+120, windDown - 90), label: '🎮 Free time / relax' });
    entries.push({ t: windDown, label: '🌙 Wind down & prepare for sleep' });
    entries.push({ t: sleep,    label: '😴 Sleep' });

    // Deduplicate times, sort
    const seen = new Set();
    const sorted = entries
      .filter(e => { if (seen.has(e.t)) return false; seen.add(e.t); return true; })
      .sort((a, b) => a.t - b.t);

    let lines = sorted.map(e => `${toHHMM(e.t)} — ${e.label}`);
    if (ans.goal) lines.push(`\n🎯 Today's goal: ${ans.goal}`);
    return lines.join('\n');
  }

  /* ── finish: put schedule in textarea ── */
  function finish() {
    // Show a brief "generating" message in chat
    const log = document.getElementById('sched-chat-log');
    const gen = document.createElement('div');
    gen.className = 'chat-bubble chat-q-bubble chat-generating';
    gen.innerHTML = '<span class="chat-bbl-emoji">✨</span><span class="chat-bbl-txt">Building your schedule…</span>';
    log.appendChild(gen);
    log.scrollTop = log.scrollHeight;

    setTimeout(() => {
      const schedule = generateSchedule(answers);
      document.getElementById('planner-schedule').value = schedule;
      showState('schedule');
      // Inject the daily goal into the Goals list via module-level function
      injectDayBuilderGoal(answers.goal);
      autoSavePlanner();
    }, 600);
  }

  /* ── wire up buttons via event delegation (most robust approach) ── */
  let _inited = false;
  function init() {
    if (_inited) return;
    _inited = true;

    // Event delegation on document catches clicks regardless of element
    // display state, creation timing, or any other DOM quirk.
    document.addEventListener('click', function(e) {
      // Walk up to nearest button (handles clicks on child elements like emoji spans)
      const btn = e.target.closest('button') || e.target;
      const id  = btn && btn.id;
      if (!id) return;

      switch (id) {
        case 'build-day-btn':
        case 'regen-sched-btn':
          e.preventDefault();
          start();
          break;
        case 'sched-type-btn':
          e.preventDefault();
          showState('schedule');
          setTimeout(() => { const ta = document.getElementById('planner-schedule'); if (ta) { ta.classList.remove('sched-textarea-hidden'); ta.focus(); } }, 50);
          break;
        case 'edit-sched-btn':
          e.preventDefault();
          showState('schedule');
          setTimeout(() => { const ta = document.getElementById('planner-schedule'); if (ta) ta.focus(); }, 50);
          break;
        case 'sched-cancel-btn':
          e.preventDefault();
          {
            const ta = document.getElementById('planner-schedule');
            showState(ta && ta.value.trim() ? 'schedule' : 'idle');
          }
          break;
      }
    });

    console.log('[DayBuilder] event delegation attached');
  }

  return { showState, init };
})();

// Attach at module load time
DayBuilder.init();

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
// Table columns: id, user_id, challenge_id, completed_at, proof_text.
async function saveChallengeCompletion(type, proofText = '') {
  if (!sbUser) return;
  const { error } = await sb.from('challenge_completions')
    .insert({
      user_id:      sbUser.id,
      challenge_id: type,
      completed_at: new Date().toISOString(),
      proof_text:   proofText,
    });
  if (error) {
    console.error('[Challenges] saveChallengeCompletion error:', error);
  }
}

// Fetch the last 8 days of completions and restore done state + streaks.
// Called on every login / session restore — never resets already-set local flags.
async function loadChallengeState() {
  if (!sbUser) return;
  const today  = dateToStr(new Date());
  const cutoff = new Date(Date.now() - 8 * 86400000).toISOString();

  const { data, error } = await sb.from('challenge_completions')
    .select('challenge_id, completed_at')
    .eq('user_id', sbUser.id)
    .gte('completed_at', cutoff);

  if (error) {
    console.error('[Challenges] loadChallengeState error:', error);
    return;
  }

  // Extract local date string (YYYY-MM-DD) from each ISO timestamp
  const toDate = r => r.completed_at.slice(0, 10);
  const rows = data || [];
  const studyDates = new Set(rows.filter(r => r.challenge_id === 'study').map(toDate));
  const ecoDates   = new Set(rows.filter(r => r.challenge_id === 'eco').map(toDate));

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

/* ─── FLASHCARDS ─────────────────────────────────────────────────────── */
let flashcards = [];
const _FC_LS_KEY = 'rh_flashcards';

function _fcLsLoad()      { try { return JSON.parse(localStorage.getItem(_FC_LS_KEY) || '[]'); } catch { return []; } }
function _fcLsSave(arr)   { try { localStorage.setItem(_FC_LS_KEY, JSON.stringify(arr)); } catch {} }
function _fcLocalCard(subject, front, back) {
  return { id: 'local_' + Date.now(), subject, front, back,
           created_at: new Date().toISOString(), _local: true };
}

async function loadFlashcards() {
  const local = _fcLsLoad();
  console.log('[Flashcards] loadFlashcards called. sbUser:', !!sbUser, '| localStorage cards:', local.length);

  if (!sbUser) {
    // Not logged in — show whatever is in localStorage
    flashcards = local;
    console.log('[Flashcards] no user, showing', flashcards.length, 'local card(s)');
    renderFlashcards();
    return;
  }

  console.log('[Flashcards] fetching from Supabase for user:', sbUser.id);
  const { data, error } = await sb.from('flashcards')
    .select('*').eq('user_id', sbUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Flashcards] Supabase fetch error (table may not exist):', error);
    // Fall back to localStorage so cards still appear
    flashcards = local;
    renderFlashcards();
    return;
  }

  console.log('[Flashcards] Supabase returned', data?.length ?? 0, 'card(s)');
  flashcards = data || [];

  // Sync any cards created while logged out
  const unsynced = local.filter(c => c._local);
  if (unsynced.length) {
    console.log('[Flashcards] syncing', unsynced.length, 'offline card(s) to Supabase');
    for (const c of unsynced) {
      const { data: saved, error: se } = await sb.from('flashcards')
        .insert({ user_id: sbUser.id, subject: c.subject, front: c.front, back: c.back })
        .select().single();
      if (!se && saved) {
        flashcards.unshift(saved);
        console.log('[Flashcards] synced offline card:', saved.id);
      } else {
        console.warn('[Flashcards] offline sync failed, keeping local copy:', se);
        flashcards.push(c);
      }
    }
    _fcLsSave([]); // clear synced local cards
  }

  console.log('[Flashcards] rendering', flashcards.length, 'card(s)');
  renderFlashcards();
}

async function saveFlashcard(subject, front, back) {
  // ── Step 1: show card immediately (optimistic) ───────────────────────
  // A temp card is pushed into the array and rendered BEFORE any async
  // work, so the card is always visible regardless of network timing.
  const tempId = 'tmp_' + Date.now();
  const tempCard = { id: tempId, subject, front, back,
                     created_at: new Date().toISOString(), _local: !sbUser };
  flashcards.unshift(tempCard);
  renderFlashcards();
  console.log('[Flashcards] optimistic card shown. array length:', flashcards.length);

  // ── Step 2a: not logged in — make temp card permanent in localStorage ─
  if (!sbUser) {
    const permCard = { ..._fcLocalCard(subject, front, back), _local: true };
    flashcards = flashcards.map(f => f.id === tempId ? permCard : f);
    const ls = _fcLsLoad(); ls.unshift(permCard); _fcLsSave(ls);
    renderFlashcards();
    showToast('🃏 Card saved locally — sign in to sync!', '');
    return;
  }

  // ── Step 2b: logged in — persist to Supabase in background ───────────
  console.log('[Flashcards] inserting to Supabase…');
  const { data, error } = await sb.from('flashcards')
    .insert({ user_id: sbUser.id, subject, front, back })
    .select().single();

  if (error) {
    // Supabase failed — convert temp card to a permanent local card
    console.error('[Flashcards] Supabase insert error:', error);
    const permCard = { ..._fcLocalCard(subject, front, back), _local: true };
    flashcards = flashcards.map(f => f.id === tempId ? permCard : f);
    const ls = _fcLsLoad(); ls.unshift(permCard); _fcLsSave(ls);
    renderFlashcards();
    showToast('⚠️ Saved locally (Supabase unavailable)', '');
    return;
  }

  // ── Step 3: swap temp ID for real server row (silent update) ─────────
  console.log('[Flashcards] Supabase insert OK, real id:', data?.id,
              '| array length before swap:', flashcards.length);
  const tempIdx = flashcards.findIndex(f => f.id === tempId);
  if (tempIdx !== -1) {
    // Normal path: replace temp card with real server row
    flashcards[tempIdx] = data;
  } else {
    // Temp was cleared by a concurrent loadFlashcards() — push real card directly
    console.warn('[Flashcards] temp card was cleared before swap; pushing real card');
    flashcards.unshift(data);
  }
  renderFlashcards();
  console.log('[Flashcards] render after id-swap, array length:', flashcards.length);
  showToast('🃏 Flashcard created!', 'study-toast');
}

async function deleteFlashcard(id) {
  // Optimistic removal — remove from array and re-render immediately
  flashcards = flashcards.filter(f => String(f.id) !== String(id));
  renderFlashcards();

  // Remove from localStorage (covers local-only cards)
  const local = _fcLsLoad();
  const trimmed = local.filter(c => String(c.id) !== String(id));
  if (trimmed.length !== local.length) _fcLsSave(trimmed);

  // Remove from Supabase (only for server-saved cards)
  if (sbUser && !String(id).startsWith('local_')) {
    const { error } = await sb.from('flashcards').delete().eq('id', id).eq('user_id', sbUser.id);
    if (error) console.error('[Flashcards] delete error:', error);
  }
}

const FC_SUBJECT_EMOJIS = { Math: '📐', English: '📖', Science: '🔬', Geography: '🌍', Art: '🎨', Other: '📋' };

function renderFlashcards() {
  const list = document.getElementById('fc-list');
  if (!list) { console.warn('[Flashcards] renderFlashcards: #fc-list not found'); return; }
  console.log('[Flashcards] renderFlashcards called, count:', flashcards.length,
              '| items:', flashcards.map(f => f.id));
  if (!flashcards.length) {
    list.innerHTML = '<p class="fc-empty">No flashcards yet — create your first one above!</p>';
    const reviewBtn = document.getElementById('fc-start-review-btn');
    if (reviewBtn) reviewBtn.classList.add('hidden');
    return;
  }
  const groups = {};
  flashcards.forEach(f => {
    if (!groups[f.subject]) groups[f.subject] = [];
    groups[f.subject].push(f);
  });
  list.innerHTML = Object.entries(groups).map(([subj, cards]) => `
    <div class="fc-group">
      <div class="fc-group-hdr">${FC_SUBJECT_EMOJIS[subj] || '📋'} ${escHtml(subj)} <span class="fc-group-count">${cards.length}</span></div>
      <div class="fc-grid">
        ${cards.map(c => `
          <div class="fc-card" id="fcard-${escHtml(String(c.id))}" tabindex="0" role="button" aria-label="Flashcard flip">
            <div class="fc-inner">
              <div class="fc-face fc-front">
                <span class="fc-face-label">Q</span>
                <p class="fc-face-text">${escHtml(c.front)}</p>
              </div>
              <div class="fc-face fc-back">
                <span class="fc-face-label">A</span>
                <p class="fc-face-text">${escHtml(c.back)}</p>
                <button type="button" class="fc-del-btn" data-id="${escHtml(String(c.id))}" title="Delete card">🗑️</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.fc-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.fc-del-btn')) return;
      card.classList.toggle('flipped');
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('flipped'); }
    });
  });

  list.querySelectorAll('.fc-del-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); deleteFlashcard(btn.dataset.id); })
  );
  const reviewBtn = document.getElementById('fc-start-review-btn');
  if (reviewBtn) reviewBtn.classList.toggle('hidden', flashcards.length === 0);
}

/* ── Flashcard Review Mode ─────────────────────────────────────────── */
let _reviewQueue   = [];
let _reviewIdx     = 0;
let _reviewGot     = [];
let _reviewMissed  = [];
let _reviewFlipped = false;

function startFlashcardReview(cards) {
  if (!cards || !cards.length) { showToast('No flashcards to review!', ''); return; }
  _reviewQueue  = [...cards].sort(() => Math.random() - 0.5);
  _reviewIdx    = 0;
  _reviewGot    = [];
  _reviewMissed = [];
  const ov    = document.getElementById('fc-review-overlay');
  const rs    = document.getElementById('fc-review-results');
  const stage = document.querySelector('.fc-review-stage');
  if (rs)    rs.classList.add('hidden');
  if (stage) stage.classList.remove('hidden');
  ov.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  _showReviewCard();
}

function _showReviewCard() {
  const card = _reviewQueue[_reviewIdx];
  document.getElementById('fc-review-q').textContent = card.front;
  document.getElementById('fc-review-a').textContent = card.back;
  document.getElementById('fc-review-progress').textContent = `${_reviewIdx + 1} / ${_reviewQueue.length}`;
  const hint = document.getElementById('fc-review-hint');
  const btns = document.getElementById('fc-review-btns');
  hint.textContent = 'Tap card to reveal answer';
  hint.classList.remove('hidden');
  btns.classList.add('hidden');
  document.getElementById('fc-review-inner').classList.remove('flipped');
  _reviewFlipped = false;
}

function _reviewFlip() {
  if (_reviewFlipped) return;
  _reviewFlipped = true;
  document.getElementById('fc-review-inner').classList.add('flipped');
  document.getElementById('fc-review-hint').classList.add('hidden');
  document.getElementById('fc-review-btns').classList.remove('hidden');
}

function _reviewAnswer(got) {
  if (got) _reviewGot.push(_reviewQueue[_reviewIdx]);
  else     _reviewMissed.push(_reviewQueue[_reviewIdx]);
  _reviewIdx++;
  if (_reviewIdx < _reviewQueue.length) _showReviewCard();
  else _showReviewResults();
}

function _showReviewResults() {
  document.querySelector('.fc-review-stage').classList.add('hidden');
  document.getElementById('fc-review-results').classList.remove('hidden');
  const total = _reviewQueue.length;
  const got   = _reviewGot.length;
  const pct   = Math.round(got / total * 100);
  document.getElementById('fc-review-score').textContent = `${got} / ${total}`;
  document.getElementById('fc-review-pct').textContent   = `${pct}%`;
  document.getElementById('fc-review-results-emoji').textContent =
    pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📖';
  const againBtn = document.getElementById('fc-review-again-btn');
  if (againBtn) againBtn.classList.toggle('hidden', _reviewMissed.length === 0);
}

function _exitReview() {
  document.getElementById('fc-review-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('fc-review-card').addEventListener('click', _reviewFlip);
document.getElementById('fc-review-got-btn').addEventListener('click', () => _reviewAnswer(true));
document.getElementById('fc-review-miss-btn').addEventListener('click', () => _reviewAnswer(false));
document.getElementById('fc-review-exit-btn').addEventListener('click', _exitReview);
document.getElementById('fc-review-done-btn').addEventListener('click', _exitReview);
document.getElementById('fc-review-again-btn').addEventListener('click', () => {
  if (_reviewMissed.length) startFlashcardReview(_reviewMissed);
});
document.getElementById('fc-start-review-btn').addEventListener('click', () => {
  startFlashcardReview(flashcards);
});

document.getElementById('fc-add-btn').addEventListener('click', () => {
  const subject = document.getElementById('fc-subject').value;
  const front   = document.getElementById('fc-front').value.trim();
  const back    = document.getElementById('fc-back').value.trim();
  if (!front || !back) { showToast('✍️ Fill in both sides of the card!', ''); return; }
  document.getElementById('fc-front').value = '';
  document.getElementById('fc-back').value  = '';
  saveFlashcard(subject, front, back);
});

/* ─── QUIZ HISTORY ───────────────────────────────────────────────────── */
async function saveQuizResult(subject, topic, score, total) {
  if (!sbUser) {
    console.log('[Quiz] saveQuizResult: no user, skipping');
    return;
  }
  console.log('[Quiz] saving result:', subject, topic, score, '/', total);
  const { error } = await sb.from('quiz_results').insert({
    user_id: sbUser.id, subject, topic, score, total,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[Quiz] saveQuizResult error (table may not exist):', error);
  } else {
    console.log('[Quiz] result saved OK');
  }
}

async function loadQuizHistory() {
  const el = document.getElementById('qh-list');
  if (!el) return;
  if (!sbUser) {
    el.innerHTML = '<p class="qh-empty">Sign in to see your quiz history.</p>';
    return;
  }
  const { data, error } = await sb.from('quiz_results')
    .select('*').eq('user_id', sbUser.id)
    .order('created_at', { ascending: false }).limit(10);
  if (error || !data?.length) {
    el.innerHTML = '<p class="qh-empty">No quizzes completed yet — try one above! 🧠</p>';
    return;
  }
  const SE = { math: '📐', english: '📖', science: '🔬', geography: '🌍', art: '🎨' };
  el.innerHTML = data.map(r => {
    const pct = r.score / r.total;
    const cls = pct >= 0.8 ? 'qh-badge-green' : pct >= 0.6 ? 'qh-badge-yellow' : 'qh-badge-red';
    const dt  = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `
      <div class="qh-item">
        <span class="qh-emoji">${SE[r.subject] || '📋'}</span>
        <div class="qh-info">
          <span class="qh-topic">${escHtml(r.topic)}</span>
          <span class="qh-subject">${escHtml(r.subject)}</span>
        </div>
        <span class="qh-score ${cls}">${r.score}/${r.total}</span>
        <span class="qh-date">${dt}</span>
      </div>`;
  }).join('');
}

/* ─── WEEKLY ECO CHALLENGE ───────────────────────────────────────────── */
const WEEKLY_ECO_CHALLENGES = [
  { emoji: '🚫🚗', text: 'Go car-free for the entire week — walk, cycle, or use public transport for every single trip.', diff: 'Hard' },
  { emoji: '🌱',   text: 'Start a container garden: plant at least 3 seeds or seedlings and care for them all week.', diff: 'Medium' },
  { emoji: '🍱',   text: 'Prep all your meals at home this week — zero takeaway containers or single-use packaging.', diff: 'Medium' },
  { emoji: '♻️',   text: 'Audit your household waste: sort every single item into the correct recycling bin all week.', diff: 'Hard' },
  { emoji: '💧',   text: 'Limit every shower to 4 minutes or under for all 7 days this week.', diff: 'Medium' },
  { emoji: '🛒',   text: 'Shop exclusively with reusable bags and refuse every piece of single-use plastic this week.', diff: 'Easy' },
  { emoji: '🥦',   text: 'Eat 100% plant-based for at least 5 consecutive days this week.', diff: 'Hard' },
  { emoji: '⚡',   text: 'Reduce your electricity usage: unplug all idle devices and avoid AC/heating all week.', diff: 'Medium' },
  { emoji: '📣',   text: 'Spread eco-awareness: share a climate fact with at least 5 different people this week.', diff: 'Easy' },
  { emoji: '🧹',   text: 'Organise a community litter-pick in your street, park, or school grounds this week.', diff: 'Hard' },
];

let weeklyEcoDone = false;

function getISOWeekNumber() {
  const d = new Date();
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = d - startOfWeek1;
  return 1 + Math.floor(diff / (7 * 86400000));
}

function getWeekMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().slice(0, 10);
}

function loadWeeklyEcoChallenge() {
  const c = WEEKLY_ECO_CHALLENGES[getISOWeekNumber() % WEEKLY_ECO_CHALLENGES.length];
  document.getElementById('eco-weekly-emoji').textContent = c.emoji;
  document.getElementById('eco-weekly-text').textContent  = c.text;
  document.getElementById('eco-weekly-diff').textContent  = c.diff;
}

async function checkWeeklyEcoCompletion() {
  if (!sbUser) return;
  const monday = getWeekMonday();
  const { data } = await sb.from('challenge_completions')
    .select('id, proof_text')
    .eq('user_id', sbUser.id)
    .eq('challenge_id', 'eco_weekly')
    .gte('completed_at', monday + 'T00:00:00.000Z')
    .limit(1);
  if (data?.length) {
    weeklyEcoDone = true;
    document.getElementById('eco-weekly-proof-form').classList.add('hidden');
    document.getElementById('eco-weekly-proof-saved').classList.remove('hidden');
    const t = document.getElementById('eco-weekly-saved-text');
    if (t) t.textContent = data[0].proof_text ? `"${data[0].proof_text}"` : 'Weekly challenge already completed this week! 🏆';
  }
}

document.getElementById('eco-weekly-submit-btn').addEventListener('click', () => {
  if (weeklyEcoDone) return;
  const text = document.getElementById('eco-weekly-proof-text').value.trim();
  if (!text) { showToast('✍️ Describe how you completed this challenge!', ''); return; }

  weeklyEcoDone = true;
  document.getElementById('eco-weekly-proof-form').classList.add('hidden');
  document.getElementById('eco-weekly-proof-saved').classList.remove('hidden');
  document.getElementById('eco-weekly-saved-text').textContent = `"${text}"`;

  addXP(50);
  showToast('🏆 Weekly eco challenge complete! +50 XP!', 'eco-toast');

  if (sbUser) {
    saveChallengeCompletion('eco_weekly', text);
  } else {
    showToast('Sign in to save your XP! 🌟', '');
  }
});

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

document.getElementById('eco-submit-btn').addEventListener('click', async () => {
  const text = document.getElementById('eco-proof-text').value.trim();
  if (!text) { showToast('✍️ Describe your eco action first!', ''); return; }

  // ── Update UI immediately ─────────────────────────────────────────────
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
  renderVirtualTree(co2Tracked);
  showToast('🌱 Eco mission complete! The planet thanks you!', 'eco-toast');

  // ── XP: apply optimistically then persist ────────────────────────────
  const xpAmount = ecoChallenges[currentEcoChal].xp;
  console.log('[Eco] submit: xpAmount =', xpAmount,
              '| sbUser:', !!sbUser, '| sbProfile:', !!sbProfile);

  if (sbUser && sbProfile) {
    // Show updated XP in top bar immediately — don't wait for the RPC
    sbProfile.xp += xpAmount;
    updateTopBar();
    updateDashXP();
    console.log('[Eco] optimistic XP applied, top bar updated. Calling RPC…');

    const { error: xpErr } = await sb.rpc('increment_xp', { uid: sbUser.id, amount: xpAmount });
    if (xpErr) {
      console.error('[Eco] increment_xp RPC failed:', xpErr);
    } else {
      console.log('[Eco] XP persisted OK. sbProfile.xp now:', sbProfile.xp);
      showToast(`+${xpAmount} XP saved! 🌟`, 'study-toast');
      if (currentPage === 'leaderboard') loadLeaderboard();
    }

    // ── Save completion + planner + badges in background ───────────────
    saveChallengeCompletion('eco', text);
    addGoalToPlanner(`🌍 ${text}`).catch(err =>
      console.error('[Eco] background planner save failed:', err)
    );
    checkAndAwardBadges({ proofText: text });
  } else {
    console.warn('[Eco] XP not saved — sbUser:', !!sbUser, 'sbProfile:', !!sbProfile);
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

/* ─── ECO PROGRESS CALENDAR — removed ───────────────────────────────── */
// Calendar removed per user request (4 Dec 2024).


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
  // Fallback: ecoStreak is already populated from DB by loadChallengeState()
  const fallback = Math.max(co2Tracked, ecoStreak);
  if (!sbUser) { renderVirtualTree(fallback); return; }

  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString(); // last year
  const { data, error } = await sb.from('challenge_completions')
    .select('completed_at')
    .eq('user_id', sbUser.id)
    .eq('challenge_id', 'eco')
    .gte('completed_at', cutoff);

  if (error) {
    console.warn('[VirtualTree] DB load failed, using local fallback:', error);
  }
  const total = (data && data.length > 0) ? data.length : fallback;
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
  loadWeeklyEcoChallenge();
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

// 30 rotating daily reminders — 3 shown per day, cycling through all 30 over 10 days
const ALL_REMINDERS = [
  { id: 'r01', emoji: '💧', title: 'Stay Hydrated',          desc: 'Drink 8 glasses of water throughout the day.' },
  { id: 'r02', emoji: '😴', title: 'Sleep 8 Hours',           desc: 'Go to bed on time — your brain recharges while you sleep.' },
  { id: 'r03', emoji: '🧘', title: 'Screen Break',            desc: 'Step away from your screen for 5 minutes right now.' },
  { id: 'r04', emoji: '🥗', title: 'Eat Well',               desc: 'Include fruit or vegetables in your next meal.' },
  { id: 'r05', emoji: '🏃', title: 'Move Your Body',          desc: 'Get at least 15 minutes of physical activity today.' },
  { id: 'r06', emoji: '📚', title: 'Pomodoro Study',          desc: 'Study in 25-min blocks with 5-min breaks between them.' },
  { id: 'r07', emoji: '🌱', title: 'Eco Action',              desc: 'Unplug chargers you\'re not using to save energy.' },
  { id: 'r08', emoji: '🙏', title: 'Gratitude',               desc: 'Write down 3 things you\'re grateful for today.' },
  { id: 'r09', emoji: '👥', title: 'Stay Connected',           desc: 'Send a kind message to a friend or family member.' },
  { id: 'r10', emoji: '🎯', title: 'Deep Focus',              desc: 'Turn off notifications and focus for the next 30 minutes.' },
  { id: 'r11', emoji: '🪑', title: 'Fix Your Posture',         desc: 'Sit up straight, roll your shoulders back, and breathe.' },
  { id: 'r12', emoji: '📵', title: 'Digital Detox',            desc: 'Take a 30-minute break from social media.' },
  { id: 'r13', emoji: '🌬️', title: 'Breathe Deeply',          desc: 'Take 5 slow, deep breaths to calm and reset your mind.' },
  { id: 'r14', emoji: '📖', title: 'Read for Fun',             desc: 'Spend 15 minutes reading something you genuinely enjoy.' },
  { id: 'r15', emoji: '🌳', title: 'Go Outside',              desc: 'Get 10 minutes of fresh air and natural sunlight.' },
  { id: 'r16', emoji: '🧹', title: 'Tidy Your Space',          desc: 'A clear desk = a clear mind. Spend 5 minutes tidying up.' },
  { id: 'r17', emoji: '🍎', title: 'Healthy Snack',            desc: 'Choose fruit or nuts instead of processed snacks.' },
  { id: 'r18', emoji: '💛', title: 'Act of Kindness',          desc: 'Do one small kind thing for someone around you today.' },
  { id: 'r19', emoji: '📝', title: 'Reflect on Your Day',      desc: 'Write 3 sentences about your wins and challenges.' },
  { id: 'r20', emoji: '🎵', title: 'Mood Boost',               desc: 'Listen to your favourite uplifting song right now.' },
  { id: 'r21', emoji: '👁️', title: '20-20-20 Eye Rest',        desc: 'Look 20 metres away for 20 seconds to rest your eyes.' },
  { id: 'r22', emoji: '🌙', title: 'Wind Down Early',          desc: 'Dim your screen an hour before bed for better sleep.' },
  { id: 'r23', emoji: '🧠', title: 'Brain Break',              desc: 'Doodle, sketch, or let your mind wander for 5 minutes.' },
  { id: 'r24', emoji: '🤝', title: 'Show Appreciation',        desc: 'Thank someone who has helped or inspired you recently.' },
  { id: 'r25', emoji: '♻️', title: 'Reduce Waste',             desc: 'Recycle or avoid single-use plastic at least once today.' },
  { id: 'r26', emoji: '💪', title: 'Mini Workout',             desc: 'Do 20 jumping jacks or 10 push-ups right now.' },
  { id: 'r27', emoji: '🌊', title: 'Mindful Moment',           desc: 'Notice 5 things you can see, 4 you hear, 3 you can feel.' },
  { id: 'r28', emoji: '📅', title: 'Plan Tomorrow',            desc: 'Write down your top 3 priorities for tomorrow now.' },
  { id: 'r29', emoji: '🚰', title: 'Skip the Caffeine',        desc: 'Swap your next coffee for herbal tea or sparkling water.' },
  { id: 'r30', emoji: '🎓', title: 'Learn Something New',      desc: 'Watch a 5-min educational video or read an interesting article.' },
];

let todayReminders   = [];       // { id, emoji, text, done }
let remindersDoneSet = new Set();// reminder_ids completed today
let reminderDateSet  = new Set();// dates that have ≥1 completion (for streak)
let remindersStreak  = 0;
let currentPlannerTab = 'planner';

// 3 different reminders per day — rotates through all 30 over 10 days,
// then repeats. Same 3 for everyone on the same calendar date.
function getDailyReminders() {
  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  const base = (daysSinceEpoch * 3) % ALL_REMINDERS.length;
  return [
    ALL_REMINDERS[base],
    ALL_REMINDERS[(base + 1) % ALL_REMINDERS.length],
    ALL_REMINDERS[(base + 2) % ALL_REMINDERS.length],
  ];
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
      <button type="button" class="reminder-check-btn${r.done ? ' is-done' : ''}"
              data-id="${r.id}" ${r.done ? 'disabled' : ''} aria-label="${r.done ? 'Done' : 'Mark done'}">
        ${r.done ? '✓' : ''}
      </button>
      <span class="reminder-emoji">${r.emoji}</span>
      <div class="reminder-body">
        <span class="reminder-title">${r.title}</span>
        <span class="reminder-desc">${r.desc}</span>
      </div>
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
  // If already initialised in memory (tab switch, not a refresh), just re-render.
  if (raiHistory.length > 0) { raiRender(); return; }

  // Try to restore a previous session from localStorage.
  if (raiLoadState()) {
    raiTyping = false; // never restore a mid-animation state
    const inputRow = document.getElementById('rai-input-row');
    if (inputRow) inputRow.classList.toggle('hidden', raiStep < 6);
    raiRender();
    return;
  }

  // Nothing saved — start fresh.
  raiInit();
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

const RAI_LS_KEY = 'rh_rai_state';

/** Persist current coach state to localStorage after every meaningful change. */
function raiSaveState() {
  try {
    localStorage.setItem(RAI_LS_KEY, JSON.stringify({
      step: raiStep,
      answers: raiAnswers,
      history: raiHistory,
    }));
  } catch (e) { /* storage quota — non-fatal */ }
}

/** Restore coach state from localStorage. Returns true if valid state was found. */
function raiLoadState() {
  try {
    const raw = localStorage.getItem(RAI_LS_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.history) || s.history.length === 0) return false;
    raiStep    = s.step    ?? 0;
    raiAnswers = s.answers ?? [];
    raiHistory = s.history;
    return true;
  } catch { return false; }
}

// Generate a specific, actionable suggested planner goal from the user's quiz answers.
// raiAnswers[0]=goals, [1]=activity, [2]=wake time, [3]=biggest challenge
function raiSuggestGoal() {
  console.log('[Coach] raiSuggestGoal called. raiAnswers:', JSON.stringify(raiAnswers));

  if (raiAnswers.length < 4) {
    console.warn('[Coach] raiSuggestGoal: raiAnswers has only', raiAnswers.length, 'item(s) — returning empty');
    return '';
  }

  const goal      = (raiAnswers[0] || '').charAt(0).toUpperCase(); // A-E
  const challenge = (raiAnswers[3] || '').charAt(0).toUpperCase(); // A-E
  const wakeKey   = (raiAnswers[2] || '').charAt(0).toUpperCase(); // A-D

  console.log('[Coach] raiSuggestGoal: goal letter =', goal, '| challenge letter =', challenge, '| wakeKey =', wakeKey);

  const wakeTime = { A: '6:00am', B: '7:00am', C: '7:30am', D: '8:00am' }[wakeKey] || '7:00am';

  // 25 combinations: goal (A-E) × biggest challenge (A-E)
  const table = {
    'A-A': `Wake up at ${wakeTime} and do 20 push-ups and 20 squats before getting dressed`,
    'A-B': `Go to bed by 10pm and wake up at ${wakeTime} to fit in a 15-minute morning workout`,
    'A-C': `Swap your afternoon snack for a protein-rich option and work out 3 times this week`,
    'A-D': `Schedule 3 training sessions this week at fixed times and stick to every one`,
    'A-E': `Do 10 minutes of stretching at ${wakeTime} every morning to energise and de-stress`,
    'B-A': `Wake up at ${wakeTime} and spend the first 10 minutes planning your day — every single day`,
    'B-B': `Set a 10pm phone-off rule and wake up at ${wakeTime} — keep it for 5 days straight`,
    'B-C': `Prep your clothes and bag the night before so your morning runs smoothly at ${wakeTime}`,
    'B-D': `Write down your 3 top tasks each night, then act on them from ${wakeTime} every morning`,
    'B-E': `Start every morning at ${wakeTime} with 5 minutes of calm journaling before anything else`,
    'C-A': `Cook one healthy meal from scratch this week and replace one takeaway with home food`,
    'C-B': `Stop eating 2 hours before bed and cut screen time after 9pm to sleep better`,
    'C-C': `Replace 3 unhealthy meals this week with a home-cooked alternative — start tonight`,
    'C-D': `Meal-prep on Sunday: 5 healthy lunches ready to go for the whole week`,
    'C-E': `Drink 2 litres of water daily and eat a proper breakfast at ${wakeTime} — no skipping`,
    'D-A': `Study for 45 minutes with your phone in another room before checking any messages`,
    'D-B': `Complete your hardest task first at ${wakeTime} before your energy drops`,
    'D-C': `Replace 30 minutes of phone scrolling with a focused study block every evening`,
    'D-D': `Follow the same study schedule every day this week — same subject, same time, same place`,
    'D-E': `Break your work into 25-minute focus blocks with 5-minute breaks — aim for 4 blocks today`,
    'E-A': `Wake up at ${wakeTime}, take 5 deep breaths, and write down one thing you will accomplish today`,
    'E-B': `Set a hard 10pm screen-off rule every night this week and track how your mood changes`,
    'E-C': `Eat a proper breakfast and drink a full glass of water before checking your phone each morning`,
    'E-D': `Write down 3 things you will do tomorrow every night before bed — make it a daily non-negotiable`,
    'E-E': `Do 10 minutes of box breathing or mindfulness at ${wakeTime} every day for the next 7 days`,
  };

  const key = `${goal}-${challenge}`;
  const result = table[key] || {
    A: `Wake up at ${wakeTime} and complete a 20-minute workout before school every day`,
    B: `Wake up at ${wakeTime} and spend 10 minutes planning your day before anything else`,
    C: `Swap one unhealthy snack for fruit or veg and drink 2 litres of water every day this week`,
    D: `Study for 45 minutes with no phone before dinner every day this week`,
    E: `Spend 10 minutes journaling or meditating each morning at ${wakeTime}`,
  }[goal] || 'Complete one focused 30-minute study session today with zero distractions';

  console.log('[Coach] raiSuggestGoal: key =', key, '| result =', result);
  return result;
}

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
  localStorage.removeItem(RAI_LS_KEY);
  const inputRow = document.getElementById('rai-input-row');
  if (inputRow) inputRow.classList.add('hidden');
  raiHistory.push({ role: 'ai', text: RAI_QUESTIONS[0].text });
  raiSaveState();
  raiRender();
}

function raiRender() {
  const el = document.getElementById('rai-messages');
  if (!el) return;

  let html = raiHistory.map((m, i) =>
    m.role === 'ai'
      ? `<div class="rai-msg rai-msg-ai">
           <div class="rai-avatar">🤖</div>
           <div class="rai-bubble rai-bubble-ai">${escHtml(m.text)}</div>
         </div>
         ${m.plannerBtn
           ? m.plannerAdded
             ? `<div class="rai-planner-capture">
                  <span class="rai-plan-added">✅ Added to your Planner!</span>
                </div>`
             : `<div class="rai-planner-capture" data-idx="${i}">
                  <button class="rai-add-plan-btn" data-idx="${i}">📋 + Add to Planner</button>
                  <div class="rai-plan-form" id="rpf-${i}">
                    <input type="text" class="rai-plan-input" id="rpi-${i}"
                           placeholder="What goal or tip do you want to add?" maxlength="120"/>
                    <button class="btn btn-green btn-sm rai-plan-confirm" data-idx="${i}">✅ Add</button>
                  </div>
                </div>`
           : ''}`
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
  _addRaiPlannerListeners(el);
  el.scrollTop = el.scrollHeight;
}

function _addRaiPlannerListeners(el) {
  // Pre-fill suggestion directly as a JS property (reliable; avoids HTML-attribute parsing)
  const suggestion = raiSuggestGoal();
  console.log('[Coach] _addRaiPlannerListeners: suggestion =', suggestion || '(empty — answers not ready yet)');
  el.querySelectorAll('.rai-plan-input').forEach(input => {
    if (suggestion) {
      input.value = suggestion;
      console.log('[Coach] pre-filled input', input.id, '→', input.value);
    }
  });

  el.querySelectorAll('.rai-add-plan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      const form = document.getElementById(`rpf-${idx}`);
      if (!form) return;
      const opening = form.classList.contains('hidden');
      form.classList.toggle('hidden');
      if (opening) document.getElementById(`rpi-${idx}`)?.focus();
    });
  });

  el.querySelectorAll('.rai-plan-confirm').forEach(btn => {
    btn.addEventListener('click', () => _raiConfirmAdd(btn.dataset.idx));
  });

  el.querySelectorAll('.rai-plan-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const idx = input.id.replace('rpi-', '');
      _raiConfirmAdd(idx);
    });
  });
}

async function _raiConfirmAdd(idx) {
  const input = document.getElementById(`rpi-${idx}`);
  const text  = input?.value.trim();
  if (!text) { showToast('✍️ Type a goal or tip first!', ''); return; }

  const confirmBtn = document.querySelector(`.rai-plan-confirm[data-idx="${idx}"]`);
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '…'; }

  await addGoalToPlanner(text);

  // Swap the capture block for a success label in-place (no full re-render)
  const capture = document.querySelector(`.rai-planner-capture[data-idx="${idx}"]`);
  if (capture) {
    capture.removeAttribute('data-idx');
    capture.innerHTML = `<span class="rai-plan-added">✅ Added to your Planner!</span>`;
  }

  // Persist the "done" state so re-renders keep the success label
  const histIdx = parseInt(idx, 10);
  if (raiHistory[histIdx]) raiHistory[histIdx].plannerAdded = true;
  raiSaveState();

  showToast('✅ Added to your Planner!', 'study-toast');
}

function raiPickOption(optText) {
  if (raiTyping || raiStep < 1 || raiStep > 4) return;
  raiAnswers.push(optText);
  raiHistory.push({ role: 'user', text: optText });
  raiTyping = true;
  raiSaveState();
  raiRender();

  if (raiStep < 4) {
    setTimeout(() => {
      raiTyping = false;
      raiStep++;
      raiHistory.push({ role: 'ai', text: RAI_QUESTIONS[raiStep - 1].text });
      raiSaveState();
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
    plannerBtn: true,
  });
  raiSaveState();

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
  raiSaveState();
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

    raiHistory.push({ role: 'ai', text: '↗ Response ready in Claude AI — check the new tab!', plannerBtn: true });
    raiSaveState();
    raiRender();
  }, 1000);
}

document.getElementById('rai-send-btn').addEventListener('click', raiSendFollowup);
document.getElementById('rai-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') raiSendFollowup();
});
document.getElementById('rai-reset-btn').addEventListener('click', () => {
  if (!confirm('Reset the coach and start the questionnaire again?')) return;
  raiInit();
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

  setTimeout(async () => {
    quizQIndex++;
    quizAnswered = false;
    if (quizQIndex >= quizQuestions.length) {
      quizDone = true;
      updateSubjectProgress(quizSubject, quizScore, quizQuestions.length);
      addXP(10);
      // Await the insert so the row exists before loadQuizHistory() SELECTs
      await saveQuizResult(quizSubject, quizTopic, quizScore, quizQuestions.length);
      loadQuizHistory();
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

/* ── My Notes (per-subject, auto-save) ───────────────────────────── */
let _mnSubject = 'Math';
let _mnNoteIds = {};
let _mnTimer   = null;
let _mnLoading = false;
let _mnInited  = false;

function mnInit() {
  if (_mnInited) return;
  _mnInited = true;

  document.getElementById('mn-tabs').querySelectorAll('.mn-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('mn-tabs').querySelectorAll('.mn-tab')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mnSubject = btn.dataset.subj;
      mnLoadSubject(_mnSubject);
    });
  });

  document.getElementById('my-notes-card').querySelectorAll('.mn-fmt-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      document.getElementById('mn-editor').focus();
    });
  });

  document.getElementById('mn-editor').addEventListener('input', () => {
    if (_mnLoading) return;
    clearTimeout(_mnTimer);
    const ind = document.getElementById('mn-saving-indicator');
    if (ind) ind.textContent = 'Saving…';
    _mnTimer = setTimeout(mnSave, 1500);
  });

  mnLoadSubject(_mnSubject);
}

async function mnLoadSubject(subj) {
  // Cancel any debounced save that hasn't fired yet — it belongs to the previous subject.
  clearTimeout(_mnTimer);
  _mnTimer = null;

  const editor = document.getElementById('mn-editor');
  const ts     = document.getElementById('mn-saved-ts');
  const ind    = document.getElementById('mn-saving-indicator');

  // Always reset the indicator before loading so it can never be left in "Saving…"
  if (ind) { ind.textContent = ''; ind.style.color = ''; }

  if (!sbUser) {
    editor.innerHTML = '';
    if (ts) ts.textContent = 'Sign in to save notes.';
    return;
  }

  _mnLoading = true;
  editor.contentEditable = 'false';
  if (ind) ind.textContent = 'Loading…';

  const { data } = await sb.from('study_notes')
    .select('id, content, created_at')
    .eq('user_id', sbUser.id)
    .eq('subject', subj)
    .order('created_at', { ascending: false })
    .limit(1);

  const note = data && data[0];
  _mnNoteIds[subj] = note ? note.id : null;
  editor.innerHTML = note ? (note.content || '') : '';

  if (note && ts) {
    const d = new Date(note.created_at);
    ts.textContent = `Last saved: ${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} ${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
  } else if (ts) {
    ts.textContent = 'No notes yet for this subject.';
  }
  if (ind) ind.textContent = '';
  editor.contentEditable = 'true';
  _mnLoading = false;
}

async function mnSave() {
  const ind = document.getElementById('mn-saving-indicator');
  const ts  = document.getElementById('mn-saved-ts');

  // Early-return cases: always clear the indicator so it never stays on "Saving…"
  if (!sbUser || _mnLoading) {
    if (ind) { ind.textContent = ''; ind.style.color = ''; }
    return;
  }

  const content = document.getElementById('mn-editor').innerHTML;
  const subj    = _mnSubject;
  const existId = _mnNoteIds[subj];

  try {
    let error;
    if (existId) {
      ({ error } = await sb.from('study_notes')
        .update({ content, title: subj + ' Notes' })
        .eq('id', existId).eq('user_id', sbUser.id));
    } else {
      const { data, error: ie } = await sb.from('study_notes')
        .insert({ user_id: sbUser.id, subject: subj, title: subj + ' Notes', content })
        .select('id, created_at').single();
      error = ie;
      if (!ie && data) _mnNoteIds[subj] = data.id;
    }

    if (error) {
      console.error('[MyNotes] save error:', error);
      if (ind) { ind.textContent = '❌ Save failed'; ind.style.color = '#e53e3e'; }
    } else {
      const now = new Date();
      if (ts)  ts.textContent = `Last saved: ${now.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} ${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
      if (ind) { ind.textContent = ''; ind.style.color = ''; }
    }
  } catch (e) {
    console.error('[MyNotes] unexpected save error:', e);
    if (ind) { ind.textContent = '❌ Save failed'; ind.style.color = '#e53e3e'; }
  }
}

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
  mnInit();
}

// ── Boot new study components (runs once on page load) ───────────────
loadSubjectProgress();
renderSubjectProgress();
renderPomodoro();
initQuiz('math');

/* ── Weather Widget ──────────────────────────────────────────────── */
const WMO = {
  0:  { label:'Clear sky',     emoji:'☀️',  eco:'Perfect day to air-dry clothes instead of using the dryer!' },
  1:  { label:'Mainly clear',  emoji:'🌤️',  eco:'Great day for a walk or bike ride — skip the car today!' },
  2:  { label:'Partly cloudy', emoji:'⛅',   eco:'Comfortable weather — ideal for cycling to school!' },
  3:  { label:'Overcast',      emoji:'☁️',  eco:'Take the bus today — every trip replaces ~45 car journeys.' },
  45: { label:'Foggy',         emoji:'🌫️',  eco:'Stay in and audit your home energy usage today!' },
  48: { label:'Icy fog',       emoji:'🌫️',  eco:'Layer up instead of cranking the heating — saves energy!' },
  51: { label:'Light drizzle', emoji:'🌦️',  eco:'Collect rainwater from your roof for watering plants!' },
  53: { label:'Drizzle',       emoji:'🌦️',  eco:'Rainy days are perfect for planning your weekly eco goals.' },
  55: { label:'Heavy drizzle', emoji:'🌧️',  eco:'Turn off sprinklers — nature is handling watering today!' },
  61: { label:'Light rain',    emoji:'🌧️',  eco:'Capture rainwater today — it\'s free water for your garden!' },
  63: { label:'Rain',          emoji:'🌧️',  eco:'Great day to audit which devices you can unplug.' },
  65: { label:'Heavy rain',    emoji:'🌧️',  eco:'Heavy rain = free garden watering! Turn off irrigation.' },
  80: { label:'Showers',       emoji:'🌧️',  eco:'Check your home\'s water efficiency on a rainy day like this.' },
  95: { label:'Thunderstorm',  emoji:'⛈️',  eco:'Unplug electronics during the storm to save standby power.' },
};
function wmoInfo(code) {
  if (WMO[code]) return WMO[code];
  if (code >= 1 && code <= 3) return WMO[code] || WMO[3];
  if (code === 48) return WMO[48];
  if (code >= 51 && code <= 55) return WMO[51];
  if (code >= 61 && code <= 65) return WMO[61];
  if (code >= 71 && code <= 77) return WMO[61];
  if (code >= 80 && code <= 82) return WMO[80];
  if (code >= 85 && code <= 86) return WMO[80];
  if (code >= 96) return WMO[95];
  return WMO[3];
}
async function fetchWeather() {
  const el = document.getElementById('weather-widget');
  if (!el) return;
  try {
    const res  = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&current=temperature_2m,weathercode&timezone=America%2FSao_Paulo');
    const json = await res.json();
    const temp = Math.round(json.current.temperature_2m);
    const info = wmoInfo(json.current.weathercode);
    el.innerHTML = `
      <div class="weather-main">
        <span class="weather-emoji">${info.emoji}</span>
        <div class="weather-info">
          <div class="weather-temp">${temp}°C</div>
          <div class="weather-cond">${info.label} · São Paulo</div>
        </div>
      </div>
      <div class="weather-eco-tip">🌱 ${info.eco}</div>`;
  } catch {
    if (el) el.innerHTML = '<div class="weather-err">🌍 Weather unavailable</div>';
  }
}
fetchWeather();
setInterval(fetchWeather, 30 * 60 * 1000);

/* ── Countdown Timer ─────────────────────────────────────────────── */
function updateCountdown() {
  const evEl = document.getElementById('cd-event');
  const tmEl = document.getElementById('cd-time');
  if (!evEl || !tmEl) return;
  const today = dateToStr(new Date());
  const now   = Date.now();
  const sorted = Object.keys(plannerCache).filter(ds => ds >= today).sort();
  let foundText = null, foundDate = null;
  for (const ds of sorted) {
    const cached = plannerCache[ds];
    const pending = (cached?.goals || []).filter(g => !g.done);
    if (pending.length) { foundText = pending[0].text; foundDate = ds; break; }
    if (ds > today && cached?.schedule?.trim()) { foundText = 'Planned day'; foundDate = ds; break; }
  }
  if (!foundText) {
    evEl.textContent = 'No upcoming events';
    tmEl.textContent = 'Add one in Planner! 📅';
    return;
  }
  evEl.textContent = foundText.length > 38 ? foundText.slice(0, 38) + '…' : foundText;
  const target = new Date(foundDate + (foundDate === today ? 'T23:59:59' : 'T00:00:00')).getTime();
  const diff   = Math.max(0, target - now);
  const days   = Math.floor(diff / 86400000);
  const hours  = Math.floor((diff % 86400000) / 3600000);
  const mins   = Math.floor((diff % 3600000) / 60000);
  if (diff === 0)      tmEl.textContent = 'Due now!';
  else if (days > 0)   tmEl.textContent = `${days}d ${hours}h remaining`;
  else if (hours > 0)  tmEl.textContent = `${hours}h ${mins}m remaining`;
  else                 tmEl.textContent = `${mins}m remaining`;
}
updateCountdown();
setInterval(updateCountdown, 60000);

/* ── Browser Notifications ───────────────────────────────────────── */
let notifSentToday = '';
function initNotifToggle() {
  const toggle    = document.getElementById('notif-toggle');
  const timeInput = document.getElementById('notif-time');
  if (!toggle) return;
  const enabled = localStorage.getItem('rh_notif') === 'on';
  const saved   = localStorage.getItem('rh_notif_time') || '09:00';
  toggle.checked = enabled && ('Notification' in window) && Notification.permission === 'granted';
  if (timeInput) timeInput.value = saved;
  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      if (!('Notification' in window)) { toggle.checked = false; showToast('❌ Notifications not supported', ''); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toggle.checked = false; showToast('❌ Permission denied — check browser settings', ''); return; }
      localStorage.setItem('rh_notif', 'on');
      showToast('🔔 Daily reminders enabled!', 'study-toast');
      new Notification('✅ ResponsibleHub', { body: 'Daily reminders enabled! You\'ll be nudged at ' + (timeInput?.value || '09:00'), icon: '/icon.png' });
    } else {
      localStorage.setItem('rh_notif', 'off');
      showToast('🔕 Reminders disabled', '');
    }
  });
  if (timeInput) {
    timeInput.addEventListener('change', () => localStorage.setItem('rh_notif_time', timeInput.value));
  }
}
// Fire at the scheduled time if app is open
setInterval(() => {
  if (localStorage.getItem('rh_notif') !== 'on') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now   = new Date();
  const hhmm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const sched = localStorage.getItem('rh_notif_time') || '09:00';
  const today = dateToStr(now);
  if (hhmm === sched && notifSentToday !== today) {
    notifSentToday = today;
    new Notification('⏰ ResponsibleHub Daily Reminder', { body: 'Time to check your habits and complete today\'s challenges! 🌟', icon: '/icon.png' });
  }
}, 60000);

/* ── Profile Page ────────────────────────────────────────────────── */
document.getElementById('top-avatar-btn').addEventListener('click', () => {
  if (sbProfile) navigateTo('profile');
});
document.getElementById('profile-back-btn').addEventListener('click', () => navigateTo('home'));
document.getElementById('profile-name-save').addEventListener('click', saveProfileName);

function initProfilePage() {
  if (!sbProfile) { navigateTo('home'); return; }
  // Avatar
  setAvatarEl(document.getElementById('profile-av-lg'));
  // Name / level / XP
  document.getElementById('profile-name-display').textContent = sbProfile.username;
  const { name: lvlName } = getLevelInfo(sbProfile.xp);
  document.getElementById('profile-level-tag').textContent  = lvlName;
  document.getElementById('profile-xp-tag').textContent     = `${sbProfile.xp} XP`;
  // Quick stats
  document.getElementById('ps-streak').textContent = ecoStreak || '0';
  document.getElementById('ps-badges').textContent = earnedBadgeIds.size;
  if (sbProfile.created_at) {
    const d = new Date(sbProfile.created_at);
    document.getElementById('ps-joined').textContent =
      d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  // Async: challenge count
  (async () => {
    if (!sbProfile) return;
    const { data } = await sb.from('challenge_completions')
      .select('id', { count: 'exact', head: false }).eq('user_id', sbProfile.id);
    const el = document.getElementById('ps-challenges');
    if (el) el.textContent = (data || []).length;
  })();
  // Badges
  const wrap = document.getElementById('profile-badges-wrap');
  if (wrap) {
    const earned = ECO_BADGES.filter(b => earnedBadgeIds.has(b.id));
    if (!earned.length) {
      wrap.innerHTML = '<p class="profile-no-badges">No badges yet — complete eco challenges! 🌿</p>';
    } else {
      wrap.innerHTML = earned.map(b => `
        <div class="profile-badge">
          <span class="profile-badge-emoji">${b.emoji}</span>
          <div class="profile-badge-name">${escHtml(b.name)}</div>
        </div>`).join('');
    }
  }
}

/* ─── STYLE PAGE ─────────────────────────────────────────────────────── */

/* ── Outfit Builder ──────────────────────────────────────────────────── */
const OutfitBuilder = (() => {

  /* Cached weather temp (populated at init) */
  let _weatherTemp = null;

  const QUESTIONS = [
    {
      id: 'occasion', emoji: '🎯',
      text: "What's the occasion today?",
      type: 'chips',
      options: ['School', 'Casual hangout', 'Sports / gym', 'Date night', 'Family event', 'Work / internship'],
    },
    {
      id: 'weather', emoji: '🌡️',
      text: 'How is the weather right now?',
      type: 'chips',
      options: [], // filled dynamically from temp
    },
    {
      id: 'vibe', emoji: '✨',
      text: 'Pick your style vibe:',
      type: 'chips',
      options: ['Streetwear', 'Smart-casual', 'Minimalist', 'Sporty', 'Vintage', 'Preppy'],
    },
    {
      id: 'bottoms', emoji: '👖',
      text: 'What bottoms do you have available? (pick all that apply)',
      type: 'multichips',
      options: ['Jeans', 'Chinos', 'Shorts', 'Joggers', 'Sweatpants', 'Trousers', 'Skirt'],
      min: 1,
    },
    {
      id: 'shoes', emoji: '👟',
      text: 'Which shoes can you choose from? (pick all that apply)',
      type: 'multichips',
      options: ['Sneakers', 'Loafers', 'Boots', 'Sandals', 'Running shoes', 'Dress shoes', 'Slides'],
      min: 1,
    },
    {
      id: 'accessories', emoji: '⌚',
      text: 'Any accessories you want to include? (optional)',
      type: 'multichips',
      options: ['Watch', 'Cap / hat', 'Sunglasses', 'Belt', 'Backpack', 'Chain / necklace', 'Skip'],
      min: 0,
    },
  ];

  let queue = [];
  let answers = {};
  let currentIdx = 0;

  /* ── weather chips ── */
  function weatherChips(tempC) {
    if (tempC === null) return ['Hot (30°C+)', 'Warm (22–30°C)', 'Mild (15–22°C)', 'Cool (under 15°C)'];
    if (tempC >= 30) return ['Hot (30°C+)', 'Warm (22–30°C)', 'Mild (15–22°C)', 'Cool (under 15°C)'];
    if (tempC >= 22) return ['Hot (30°C+)', 'Warm (22–30°C)', 'Mild (15–22°C)', 'Cool (under 15°C)'];
    if (tempC >= 15) return ['Hot (30°C+)', 'Warm (22–30°C)', 'Mild (15–22°C)', 'Cool (under 15°C)'];
    return ['Hot (30°C+)', 'Warm (22–30°C)', 'Mild (15–22°C)', 'Cool (under 15°C)'];
  }
  function weatherAutoSelect(tempC) {
    if (tempC === null) return null;
    if (tempC >= 30) return 'Hot (30°C+)';
    if (tempC >= 22) return 'Warm (22–30°C)';
    if (tempC >= 15) return 'Mild (15–22°C)';
    return 'Cool (under 15°C)';
  }

  function showLauncher() {
    document.getElementById('outfit-launcher').classList.remove('hidden');
    document.getElementById('outfit-chat-wrap').classList.add('hidden');
    document.getElementById('outfit-result').classList.add('hidden');
    document.getElementById('outfit-result').innerHTML = '';
  }

  function start() {
    queue = QUESTIONS.map(q => ({ ...q, options: q.id === 'weather' ? weatherChips(_weatherTemp) : [...q.options] }));
    answers = {};
    currentIdx = 0;
    document.getElementById('outfit-launcher').classList.add('hidden');
    document.getElementById('outfit-result').classList.add('hidden');
    document.getElementById('outfit-result').innerHTML = '';
    document.getElementById('outfit-chat-wrap').classList.remove('hidden');
    document.getElementById('outfit-chat-log').innerHTML = '';
    document.getElementById('outfit-chat-answer').innerHTML = '';
    askNext();
  }

  function updateProgress() {
    const pct = (currentIdx / queue.length) * 100;
    document.getElementById('outfit-prog-fill').style.width = pct + '%';
    document.getElementById('outfit-prog-lbl').textContent =
      `Question ${Math.min(currentIdx + 1, queue.length)} of ${queue.length}`;
  }

  function addQ(q) {
    const log = document.getElementById('outfit-chat-log');
    const d = document.createElement('div');
    d.className = 'chat-bubble chat-q-bubble';
    d.innerHTML = `<span class="chat-bbl-emoji">${q.emoji}</span><span class="chat-bbl-txt">${q.text}</span>`;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function addA(text) {
    const log = document.getElementById('outfit-chat-log');
    const d = document.createElement('div');
    d.className = 'chat-bubble chat-a-bubble';
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function askNext() {
    if (currentIdx >= queue.length) { finish(); return; }
    const q = queue[currentIdx];
    updateProgress();
    addQ(q);

    // Auto-answer weather if temp available
    if (q.id === 'weather' && _weatherTemp !== null) {
      const auto = weatherAutoSelect(_weatherTemp);
      setTimeout(() => submitAnswer(q, auto, `${auto} (auto-detected)`), 380);
      return;
    }

    renderAnswerArea(q);
  }

  function renderAnswerArea(q) {
    const area = document.getElementById('outfit-chat-answer');
    area.innerHTML = '';

    if (q.type === 'chips') {
      renderChips(area, q.options, false, q.min ?? 1, val => submitAnswer(q, val, val));
    } else if (q.type === 'multichips') {
      renderMultiChips(area, q.options, q.min ?? 1, vals => {
        const label = vals.length ? vals.join(', ') : '—';
        submitAnswer(q, vals, label);
      });
    }
  }

  function submitAnswer(q, val, label) {
    answers[q.id] = val;
    addA(label);
    document.getElementById('outfit-chat-answer').innerHTML = '';
    currentIdx++;
    setTimeout(askNext, 320);
  }

  function finish() {
    document.getElementById('outfit-prog-fill').style.width = '100%';
    document.getElementById('outfit-prog-lbl').textContent = 'Done!';
    document.getElementById('outfit-chat-answer').innerHTML = '';

    const result = buildOutfitResult(answers);
    const el = document.getElementById('outfit-result');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="style-result-card">
        <div class="style-result-title">👕 Your Outfit Suggestion</div>
        <div class="style-result-section">
          <div class="style-result-section-hdr">Top</div>
          <div class="style-result-items">${result.top.map(i => `<span class="style-result-item">${i}</span>`).join('')}</div>
        </div>
        <div class="style-result-section">
          <div class="style-result-section-hdr">Bottom</div>
          <div class="style-result-items">${result.bottom.map(i => `<span class="style-result-item">${i}</span>`).join('')}</div>
        </div>
        <div class="style-result-section">
          <div class="style-result-section-hdr">Shoes</div>
          <div class="style-result-items">${result.shoes.map(i => `<span class="style-result-item">${i}</span>`).join('')}</div>
        </div>
        ${result.accessories.length ? `
        <div class="style-result-section">
          <div class="style-result-section-hdr">Accessories</div>
          <div class="style-result-items">${result.accessories.map(i => `<span class="style-result-item">${i}</span>`).join('')}</div>
        </div>` : ''}
        <div class="style-result-tip">💡 ${result.tip}</div>
      </div>
      <button class="style-restart-btn" id="outfit-restart-btn">🔄 Start Over</button>`;
    el.querySelector('#outfit-restart-btn').addEventListener('click', showLauncher);
    document.getElementById('outfit-chat-wrap').classList.add('hidden');
  }

  /* ── recommendation engine ── */
  function buildOutfitResult(a) {
    const occasion  = a.occasion  || 'Casual hangout';
    const weather   = a.weather   || 'Warm (22–30°C)';
    const vibe      = a.vibe      || 'Minimalist';
    const bottoms   = Array.isArray(a.bottoms) ? a.bottoms : [a.bottoms].filter(Boolean);
    const shoes     = Array.isArray(a.shoes)   ? a.shoes   : [a.shoes].filter(Boolean);
    const accs      = Array.isArray(a.accessories) ? a.accessories.filter(v => v !== 'Skip') : [];

    const hot  = weather.startsWith('Hot');
    const cool = weather.startsWith('Cool') || weather.startsWith('Mild');

    /* top layer */
    const topMap = {
      'Streetwear':    hot ? ['Graphic tee', 'Oversized tee'] : ['Hoodie', 'Graphic tee'],
      'Smart-casual':  hot ? ['Linen shirt', 'Polo shirt']    : ['Oxford shirt', 'Knit sweater'],
      'Minimalist':    hot ? ['Plain white tee', 'Linen tee']  : ['Clean crewneck', 'Monochrome tee'],
      'Sporty':        hot ? ['Compression tee', 'Tank top']   : ['Quarter-zip', 'Sports hoodie'],
      'Vintage':       hot ? ['Band tee', 'Henley shirt']      : ['Flannel shirt', 'Vintage sweatshirt'],
      'Preppy':        hot ? ['Polo shirt', 'Button-down']     : ['Blazer', 'Cable-knit sweater'],
    };
    const top = topMap[vibe] || ['Plain tee', 'Light shirt'];

    /* bottom pick — prefer available */
    const bottomPrefer = {
      'School':          ['Chinos', 'Jeans', 'Trousers'],
      'Casual hangout':  ['Jeans', 'Shorts', 'Joggers'],
      'Sports / gym':    ['Shorts', 'Joggers', 'Sweatpants'],
      'Date night':      ['Chinos', 'Trousers', 'Jeans'],
      'Family event':    ['Chinos', 'Trousers', 'Jeans'],
      'Work / internship': ['Trousers', 'Chinos', 'Jeans'],
    };
    const pref = bottomPrefer[occasion] || ['Jeans', 'Chinos'];
    const bottom = pref.filter(b => bottoms.includes(b)).slice(0, 2);
    if (!bottom.length && bottoms.length) bottom.push(bottoms[0]);
    if (!bottom.length) bottom.push('Jeans');

    /* shoe pick */
    const shoePrefer = {
      'School':          ['Sneakers', 'Loafers'],
      'Casual hangout':  ['Sneakers', 'Slides', 'Sandals'],
      'Sports / gym':    ['Running shoes', 'Sneakers'],
      'Date night':      ['Loafers', 'Boots', 'Dress shoes'],
      'Family event':    ['Loafers', 'Dress shoes', 'Sneakers'],
      'Work / internship': ['Dress shoes', 'Loafers', 'Boots'],
    };
    const sp = shoePrefer[occasion] || ['Sneakers'];
    const chosenShoes = sp.filter(s => shoes.includes(s)).slice(0, 1);
    if (!chosenShoes.length && shoes.length) chosenShoes.push(shoes[0]);
    if (!chosenShoes.length) chosenShoes.push('Sneakers');

    /* tip */
    const tips = {
      'Hot (30°C+)':     'In this heat, light breathable fabrics like linen or cotton are your best friends.',
      'Warm (22–30°C)':  'Great weather to layer — a light shirt over a tee works perfectly.',
      'Mild (15–22°C)':  'A mid-layer like a bomber or light jacket will keep you comfortable all day.',
      'Cool (under 15°C)': 'Layer up! Start with a base, add a sweater, and top with a coat or jacket.',
    };
    const tip = tips[weather] || 'Dress for comfort and confidence — you\'ve got this!';

    return { top, bottom, shoes: chosenShoes, accessories: accs, tip };
  }

  /* ── public init ── */
  function init(weatherTemp) {
    _weatherTemp = weatherTemp;
    document.getElementById('outfit-start-btn').addEventListener('click', start);
    document.getElementById('outfit-cancel-btn').addEventListener('click', showLauncher);
  }

  return { init };
})();


/* ── Fragrance Advisor ───────────────────────────────────────────────── */
const FragranceAdvisor = (() => {

  let _weatherTemp = null;

  const QUESTIONS = [
    {
      id: 'owned', emoji: '🧴',
      text: 'Which fragrances do you already own? (type them, or leave blank)',
      type: 'text',
      placeholder: 'e.g. Bleu de Chanel, Dior Sauvage… or leave blank',
    },
    {
      id: 'occasion', emoji: '🎯',
      text: "What's the occasion?",
      type: 'chips',
      options: ['Everyday / school', 'Casual hangout', 'Date night', 'Sports / gym', 'Office / work', 'Special event'],
    },
    {
      id: 'temperature', emoji: '🌡️',
      text: 'How warm is it outside?',
      type: 'chips',
      options: ['Hot (30°C+)', 'Warm (22–30°C)', 'Mild (15–22°C)', 'Cool (under 15°C)'],
    },
    {
      id: 'timeofday', emoji: '🕐',
      text: 'What time of day is it for?',
      type: 'chips',
      options: ['Morning', 'Afternoon', 'Evening', 'Night out'],
    },
    {
      id: 'vibe', emoji: '✨',
      text: 'What vibe are you going for?',
      type: 'chips',
      options: ['Fresh & clean', 'Woody & warm', 'Sweet & gourmand', 'Spicy & bold', 'Aquatic & light', 'Floral & soft'],
    },
  ];

  let queue = [];
  let answers = {};
  let currentIdx = 0;

  function tempToRange(t) {
    if (t === null) return null;
    if (t >= 30) return 'Hot (30°C+)';
    if (t >= 22) return 'Warm (22–30°C)';
    if (t >= 15) return 'Mild (15–22°C)';
    return 'Cool (under 15°C)';
  }

  function showLauncher() {
    document.getElementById('frag-launcher').classList.remove('hidden');
    document.getElementById('frag-chat-wrap').classList.add('hidden');
    document.getElementById('frag-result').classList.add('hidden');
    document.getElementById('frag-result').innerHTML = '';
  }

  function start() {
    queue = QUESTIONS.map(q => ({ ...q }));
    answers = {};
    currentIdx = 0;
    document.getElementById('frag-launcher').classList.add('hidden');
    document.getElementById('frag-result').classList.add('hidden');
    document.getElementById('frag-result').innerHTML = '';
    document.getElementById('frag-chat-wrap').classList.remove('hidden');
    document.getElementById('frag-chat-log').innerHTML = '';
    document.getElementById('frag-chat-answer').innerHTML = '';
    askNext();
  }

  function updateProgress() {
    const pct = (currentIdx / queue.length) * 100;
    document.getElementById('frag-prog-fill').style.width = pct + '%';
    document.getElementById('frag-prog-lbl').textContent =
      `Question ${Math.min(currentIdx + 1, queue.length)} of ${queue.length}`;
  }

  function addQ(q) {
    const log = document.getElementById('frag-chat-log');
    const d = document.createElement('div');
    d.className = 'chat-bubble chat-q-bubble';
    d.innerHTML = `<span class="chat-bbl-emoji">${q.emoji}</span><span class="chat-bbl-txt">${q.text}</span>`;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function addA(text) {
    const log = document.getElementById('frag-chat-log');
    const d = document.createElement('div');
    d.className = 'chat-bubble chat-a-bubble';
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function askNext() {
    if (currentIdx >= queue.length) { finish(); return; }
    const q = queue[currentIdx];
    updateProgress();
    addQ(q);

    // Auto-answer temperature
    if (q.id === 'temperature' && _weatherTemp !== null) {
      const auto = tempToRange(_weatherTemp);
      setTimeout(() => submitAnswer(q, auto, `${auto} (auto-detected)`), 380);
      return;
    }

    renderAnswerArea(q);
  }

  function renderAnswerArea(q) {
    const area = document.getElementById('frag-chat-answer');
    area.innerHTML = '';

    if (q.type === 'chips') {
      renderChips(area, q.options, false, 1, val => submitAnswer(q, val, val));
    } else if (q.type === 'text') {
      area.innerHTML = `
        <div class="chat-field-row">
          <input type="text" class="chat-field" id="frag-text-field" placeholder="${escHtml(q.placeholder || 'Type here…')}" maxlength="160"/>
          <button type="button" class="chat-next-btn" id="frag-next-btn">Next →</button>
        </div>`;
      const f = area.querySelector('#frag-text-field');
      const b = area.querySelector('#frag-next-btn');
      const go = () => {
        const v = f.value.trim() || '(none listed)';
        submitAnswer(q, v, v);
      };
      b.addEventListener('click', go);
      f.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      setTimeout(() => f.focus(), 80);
    }
  }

  function submitAnswer(q, val, label) {
    answers[q.id] = val;
    addA(label);
    document.getElementById('frag-chat-answer').innerHTML = '';
    currentIdx++;
    setTimeout(askNext, 320);
  }

  function finish() {
    document.getElementById('frag-prog-fill').style.width = '100%';
    document.getElementById('frag-prog-lbl').textContent = 'Done!';
    document.getElementById('frag-chat-answer').innerHTML = '';

    const result = buildFragResult(answers);
    const el = document.getElementById('frag-result');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="style-result-card">
        <div class="style-result-title">🌸 Your Fragrance Match</div>
        <div class="style-result-section">
          <div class="style-result-section-hdr">Top Pick</div>
          <div class="style-result-items"><span class="style-result-item">${result.topPick}</span></div>
        </div>
        <div class="style-result-section">
          <div class="style-result-section-hdr">Also Consider</div>
          <div class="style-result-items">${result.alternatives.map(i => `<span class="style-result-item">${i}</span>`).join('')}</div>
        </div>
        <div class="style-result-section">
          <div class="style-result-section-hdr">Scent Profile</div>
          <div class="style-result-items">${result.notes.map(n => `<span class="style-result-item">${n}</span>`).join('')}</div>
        </div>
        <div class="style-result-tip">💡 ${result.tip}</div>
      </div>
      <button class="style-restart-btn" id="frag-restart-btn">🔄 Start Over</button>`;
    el.querySelector('#frag-restart-btn').addEventListener('click', showLauncher);
    document.getElementById('frag-chat-wrap').classList.add('hidden');
  }

  /* ── fragrance engine ── */
  function buildFragResult(a) {
    const occasion = a.occasion  || 'Casual hangout';
    const temp     = a.temperature || 'Warm (22–30°C)';
    const tod      = a.timeofday || 'Afternoon';
    const vibe     = a.vibe     || 'Fresh & clean';
    const hot  = temp.startsWith('Hot');
    const cool = temp.startsWith('Cool') || temp.startsWith('Mild');
    const evening = tod === 'Evening' || tod === 'Night out';

    /* scent-note profiles by vibe */
    const noteMap = {
      'Fresh & clean':     ['Citrus', 'Aquatic', 'White musk', 'Light woods'],
      'Woody & warm':      ['Cedarwood', 'Sandalwood', 'Vetiver', 'Amber'],
      'Sweet & gourmand':  ['Vanilla', 'Tonka bean', 'Caramel', 'Benzoin'],
      'Spicy & bold':      ['Black pepper', 'Cardamom', 'Oud', 'Leather'],
      'Aquatic & light':   ['Sea breeze', 'Marine accord', 'Bergamot', 'Light musk'],
      'Floral & soft':     ['Rose', 'Jasmine', 'Peony', 'Soft musk'],
    };
    const notes = noteMap[vibe] || ['Citrus', 'Musk', 'Woods'];

    /* fragrance pick logic */
    const fragMatrix = {
      'Fresh & clean': {
        hot:     { day: 'Acqua di Gio – Giorgio Armani', night: 'Bleu de Chanel EDT' },
        cool:    { day: 'CK One – Calvin Klein',          night: 'Dior Sauvage EDT'  },
      },
      'Woody & warm': {
        hot:     { day: 'Tom Ford Oud Wood',          night: 'Aventus – Creed'         },
        cool:    { day: 'Terre d\'Hermès',             night: 'Dior Fahrenheit'         },
      },
      'Sweet & gourmand': {
        hot:     { day: 'Thierry Mugler A*Men',       night: 'La Nuit de L\'Homme – YSL' },
        cool:    { day: 'Paco Rabanne 1 Million',      night: 'Viktor & Rolf Spicebomb'   },
      },
      'Spicy & bold': {
        hot:     { day: 'Spicebomb Extreme – V&R',    night: 'Tom Ford Black Orchid'  },
        cool:    { day: 'Ambre Nuit – Dior',           night: 'Le Male – JPG'          },
      },
      'Aquatic & light': {
        hot:     { day: 'Davidoff Cool Water',        night: 'Issey Miyake L\'Eau d\'Issey' },
        cool:    { day: 'Polo Blue – Ralph Lauren',    night: 'Versace Pour Homme'            },
      },
      'Floral & soft': {
        hot:     { day: 'Light Blue – Dolce & Gabbana', night: 'Coco Mademoiselle – Chanel' },
        cool:    { day: 'Flowerbomb – Viktor & Rolf',   night: 'Black Opium – YSL'           },
      },
    };

    const matrix = fragMatrix[vibe] || fragMatrix['Fresh & clean'];
    const slot   = hot ? matrix.hot : matrix.cool;
    const topPick = evening ? slot.night : slot.day;

    /* alternatives */
    const altMap = {
      'Fresh & clean':    ['Versace Man Eau Fraîche', 'Bvlgari Aqva', 'L\'Eau d\'Issey'],
      'Woody & warm':     ['Sauvage EDP – Dior', 'Encre Noire – Lalique', 'Santal 33 – Le Labo'],
      'Sweet & gourmand': ['Invictus – Paco Rabanne', 'Million Lucky – PR', 'Eros – Versace'],
      'Spicy & bold':     ['Oud for Greatness – Initio', 'Black – Bulgari', 'Eros Flame – Versace'],
      'Aquatic & light':  ['Homme Sport – Chanel', 'Allure Homme – Chanel', 'Blue Label – Burberry'],
      'Floral & soft':    ['La Vie est Belle – Lancôme', 'Miss Dior Blooming', 'Daisy – Marc Jacobs'],
    };
    const alternatives = (altMap[vibe] || ['Try a local niche boutique for unique picks']).slice(0, 3);

    /* application tip */
    const tempTips = {
      'Hot (30°C+)':     'In heat, apply to pulse points (wrists, neck) — go lighter with 1–2 sprays; fragrance amplifies in warmth.',
      'Warm (22–30°C)':  '2–3 sprays on pulse points is ideal. Warm weather lets the top notes really shine.',
      'Mild (15–22°C)':  'Spray on clothing and skin — 3 sprays is a sweet spot for lasting projection.',
      'Cool (under 15°C)': 'Cold air dampens sillage — apply generously (4–5 sprays) on clothes and neck for best diffusion.',
    };
    const tip = tempTips[temp] || 'Apply to pulse points and let the fragrance develop on your skin.';

    return { topPick, alternatives, notes, tip };
  }

  function init(weatherTemp) {
    _weatherTemp = weatherTemp;
    document.getElementById('frag-start-btn').addEventListener('click', start);
    document.getElementById('frag-cancel-btn').addEventListener('click', showLauncher);
  }

  return { init };
})();


/* ── Shared chip-rendering helpers ───────────────────────────────────── */
function renderChips(area, options, _multi, _min, onSelect) {
  const grid = document.createElement('div');
  grid.className = 'style-chip-grid';
  options.forEach(opt => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'style-chip';
    chip.textContent = opt;
    chip.addEventListener('click', () => onSelect(opt));
    grid.appendChild(chip);
  });
  area.appendChild(grid);
}

function renderMultiChips(area, options, min, onConfirm) {
  const selected = new Set();
  const grid = document.createElement('div');
  grid.className = 'style-chip-grid';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'chat-next-btn';
  confirmBtn.style.marginTop = '.4rem';
  confirmBtn.style.width = '100%';
  confirmBtn.textContent = min === 0 ? 'Confirm →' : 'Confirm →';
  confirmBtn.disabled = min > 0;
  confirmBtn.style.opacity = min > 0 ? '.5' : '1';

  options.forEach(opt => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'style-chip';
    chip.textContent = opt;
    chip.addEventListener('click', () => {
      if (selected.has(opt)) {
        selected.delete(opt);
        chip.classList.remove('selected');
      } else {
        selected.add(opt);
        chip.classList.add('selected');
      }
      const ready = min === 0 || selected.size >= min;
      confirmBtn.disabled = !ready;
      confirmBtn.style.opacity = ready ? '1' : '.5';
    });
    grid.appendChild(chip);
  });

  confirmBtn.addEventListener('click', () => {
    if (min > 0 && !selected.size) return;
    onConfirm([...selected]);
  });

  area.appendChild(grid);
  area.appendChild(confirmBtn);
}


/* ── Style page init ─────────────────────────────────────────────────── */
let _styleWeatherTemp = null;
let _styleInitDone    = false;

async function initStylePage() {
  if (_styleInitDone) return;
  _styleInitDone = true;

  // Fetch São Paulo weather once
  try {
    const res  = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&current=temperature_2m,weathercode&timezone=America%2FSao_Paulo');
    const json = await res.json();
    _styleWeatherTemp = Math.round(json.current.temperature_2m);
  } catch { _styleWeatherTemp = null; }

  OutfitBuilder.init(_styleWeatherTemp);
  FragranceAdvisor.init(_styleWeatherTemp);
}


async function saveProfileName() {
  if (!sbUser || !sbProfile) return;
  const input  = document.getElementById('profile-name-input');
  const status = document.getElementById('profile-edit-status');
  const raw    = (input?.value || '').trim();
  const clean  = raw.replace(/[^a-z0-9_\-]/gi, '').slice(0, 20);
  if (!clean) { if (status) { status.textContent = '⚠️ Invalid name'; status.style.color = '#e53e3e'; } return; }
  if (status) { status.textContent = 'Saving…'; status.style.color = 'var(--muted)'; }
  const { error } = await sb.from('profiles').update({ username: clean }).eq('id', sbUser.id);
  if (error) {
    if (status) { status.textContent = '❌ Could not save — try another name'; status.style.color = '#e53e3e'; }
  } else {
    sbProfile.username = clean;
    if (input) input.value = '';
    const nameEl = document.getElementById('profile-name-display');
    if (nameEl) nameEl.textContent = clean;
    const topUn = document.getElementById('top-username');
    if (topUn) topUn.textContent = clean;
    if (status) { status.textContent = '✅ Name updated!'; status.style.color = '#52b788'; }
    setTimeout(() => { if (status) status.textContent = ''; }, 2500);
  }
}
