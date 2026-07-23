/* ============================================================
   KIWIFIX APP – Navigation & State
   ============================================================ */

const state = {
  category: 'Plumbing',
  problem: 'Leak / Pipe Leak',
  description: '',
  region: 'Waikato',
  city: 'Hamilton',
  suburb: 'Dinsdale',
  urgency: 'Emergency (ASAP)',
  contact: 'Phone Call',
  firstName: '', lastName: '', mobile: '', email: '',
  otherPerson: false, otherName: '', otherPhone: '',
  unitNum: '', gateCode: '', parking: '', notes: '',
  otpVerified: false,
  isExistingCustomer: false,
  matchedServices: [],
  otherServices: [],
  jobId: null,
  photos: [], // uploaded URLs (e.g. "/uploads/xxx.jpg") ready to attach to the job on submit
};

/* ============================================================
   BACKEND API — job-poster auth + job posting (NestJS backend)
   ============================================================ */
const API_BASE = 'http://localhost:3000';

// JWT issued by /auth/otp/verify. Kept in memory only (not localStorage) —
// it's re-issued each time the user verifies, which already happens once
// per session in this flow.
let accessToken = null;

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }

  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status})`;
    throw new Error(Array.isArray(message) ? message.join(' ') : message);
  }
  return data;
}


// Browser back / forward button support
window.addEventListener('popstate', function(e) {
  const pageId = e.state?.page || 'home';
  if (document.getElementById(pageId)) nav(pageId, true);
});

/* ============================================================
   SIGNUP DATA – carry over to personal details
   ============================================================ */
const signupData = { firstName: '', lastName: '', mobile: '', email: '' };

function autofillPersonal() {
  const fn = document.getElementById('personal-firstname');
  const ln = document.getElementById('personal-lastname');
  if (fn && signupData.firstName && !fn.value) fn.value = signupData.firstName;
  if (ln && signupData.lastName  && !ln.value) ln.value = signupData.lastName;
}

/* ============================================================
   TRADIE LOGIN – email-first entry point
   There's no real backend for the tradie side yet, so "does this email
   already have an account" is approximated against the one tradie profile
   this demo persists in localStorage (kiwifix_tradie_profile, written by
   completeTradieOnboarding()). Good enough for a single-browser demo;
   swap for a real lookup once the tradie backend exists.
   ============================================================ */
let tradieAuthContext = 'signup'; // 'signup' (new tradie) or 'login' (existing tradie) — drives what happens after OTP

function resetTradieLoginForm() {
  const input = document.getElementById('tradieLoginEmail');
  if (input) input.value = '';
  const msg = document.getElementById('tradieWelcomeBackMsg');
  if (msg) msg.style.display = 'none';
}

function getStoredTradieProfile() {
  try { return JSON.parse(localStorage.getItem('kiwifix_tradie_profile') || 'null'); }
  catch (e) { return null; }
}

function handleTradieLoginContinue() {
  clearErrors('tradie-login');
  const input = document.getElementById('tradieLoginEmail');
  const email = (input?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    showError('tradie-login', 'Please enter a valid email address.');
    return;
  }

  const existing = getStoredTradieProfile();
  if (existing && existing.email && existing.email.toLowerCase() === email) {
    // Existing tradie — carry their details into the OTP step and greet them.
    tradieAuthContext = 'login';
    signupData.email = existing.email;
    signupData.firstName = existing.firstName || '';
    signupData.lastName = existing.lastName || '';
    signupData.mobile = existing.mobile || '';

    const msg = document.getElementById('tradieWelcomeBackMsg');
    if (msg) {
      msg.textContent = `👋 Welcome back, ${existing.firstName || 'there'}! Sending you a verification code...`;
      msg.style.display = 'block';
    }
    setTimeout(() => nav('tradie-verify-mobile'), 900); // brief pause so the welcome message is actually seen
  } else {
    // No match — this is a new tradie, send them to Create Account with the
    // email already filled in rather than making them retype it.
    tradieAuthContext = 'signup';
    nav('tradie-signup');
    setTimeout(() => {
      const emailInput = document.querySelector('#tradie-signup input[placeholder="e.g. john.smith@email.com"]');
      if (emailInput) emailInput.value = email;
      showError('tradie-signup', "We couldn't find an account with that email — let's get you set up below.");
    }, 0);
  }
}

// Populates the OTP screen's "sent to" targets with the real contact details
// instead of the old hardcoded placeholder phone/email.
function renderTradieVerifyTargets() {
  const mobileEl = document.getElementById('tvMobileTarget');
  const emailEl = document.getElementById('tvEmailTarget');
  if (mobileEl) mobileEl.textContent = signupData.mobile || 'your mobile';
  if (emailEl) emailEl.textContent = signupData.email || 'your email';
}

// Existing tradies logging back in should land on their dashboard, not get
// routed back through the registration wizard from scratch.
function tradieOtpContinue() {
  if (tradieAuthContext === 'login') {
    window.location.href = 'tradie-dashboard.html';
  } else {
    nav('tradie-services');
  }
}

function tradieVerifyBack() {
  nav(tradieAuthContext === 'login' ? 'tradie-login' : 'tradie-signup');
}

/* ============================================================
   TRADIE PROFILE DATA – captured live during registration,
   handed off to the dashboard (tradie-dashboard.html) on submit
   ============================================================ */
const tradieProfile = {
  firstName: '', lastName: '',
  tradeTypes: [],
  services: [],
  businessName: '', businessType: '',
  hasTeam: false, teamMembers: [], // team roster: NZ businesses often run several tradespeople under one name
  region: '', areas: [],
};

function captureStepData(step) {
  if (step === 'personal') {
    tradieProfile.firstName = document.getElementById('personal-firstname')?.value.trim() || signupData.firstName;
    tradieProfile.lastName  = document.getElementById('personal-lastname')?.value.trim()  || signupData.lastName;
  }
  if (step === 'services') {
    tradieProfile.tradeTypes = getSelectedTrades();
    // Standard (predefined) services left checked
    const standard = [...document.querySelectorAll('#servicesByTrade .services-trade-section')].flatMap(section => {
      const trade = section.dataset.trade;
      return [...section.querySelectorAll('.svc-check-card')]
        .filter(card => !card.querySelector('.custom-tag') && card.querySelector('input[type="checkbox"]').checked)
        .map(card => ({ trade, name: card.querySelector('span').childNodes[0].textContent.trim(), custom: false }));
    });
    // Custom (typed-in) services, including licence gating status
    const custom = Object.entries(customServicesByTrade).flatMap(([trade, list]) =>
      list.map(c => ({ trade, name: c.name, custom: true, tier: c.tier, uploaded: c.uploaded, qualificationDeclared: c.qualificationDeclared, reviewStatus: c.reviewStatus }))
    );
    tradieProfile.services = [...standard, ...custom];
    // Whole custom trades added via the "Add Trade" tile, with their own tier status
    tradieProfile.customTrades = customTrades.map(t => ({
      name: t.name, tier: t.tier, uploaded: t.uploaded, qualificationDeclared: t.qualificationDeclared, reviewStatus: t.reviewStatus,
    }));
  }
  if (step === 'business') {
    tradieProfile.businessName = document.getElementById('business-name')?.value.trim() || '';
    tradieProfile.businessType = document.getElementById('business-type')?.value || '';
    const isSoleTrader = tradieProfile.businessType === 'Sole Trader';
    tradieProfile.hasTeam = !isSoleTrader && !!document.getElementById('teamYesBtn')?.classList.contains('active');
    tradieProfile.teamMembers = tradieProfile.hasTeam ? getTeamMembers() : [];
  }
  if (step === 'areas') {
    tradieProfile.region = document.getElementById('areas-region')?.value || '';
    tradieProfile.areas = [...document.querySelectorAll('#areas-tag-row .area-tag')]
      .map(t => t.textContent.replace('✕', '').trim());
  }
}

/* ============================================================
   BUSINESS TEAM ROSTER — captures NZ businesses that run several
   tradespeople under one name (owner adds staff directly; staff don't
   get their own login. Jobs matched to the business are assigned
   internally by the owner, not picked per-person by the customer).
   ============================================================ */
let teamMemberSeq = 0;

// Sole traders don't get the team question at all — only Company/Partnership
// can register staff, since that's the only case where "one business, many
// tradespeople" applies.
function onBusinessTypeChange(businessType) {
  const block = document.getElementById('teamQuestionBlock');
  if (!block) return;
  if (businessType === 'Sole Trader') {
    block.style.display = 'none';
    setHasTeam(false); // reset — a sole trader has no roster
    document.getElementById('teamNoBtn')?.classList.add('active');
    document.getElementById('teamYesBtn')?.classList.remove('active');
    document.getElementById('teamMembersList').innerHTML = '';
  } else {
    block.style.display = 'block';
  }
  renderLicenceSections(getSelectedTrades()); // licence step depends on business type + team, keep it in sync
}

function setHasTeam(hasTeam) {
  const block = document.getElementById('teamRosterBlock');
  if (block) block.style.display = hasTeam ? 'block' : 'none';
  if (hasTeam && document.getElementById('teamMembersList')?.children.length === 0) {
    addTeamMember(); // start with one empty row so it's obvious what to do
  }
}

function addTeamMember() {
  const list = document.getElementById('teamMembersList');
  if (!list) return;
  const id = 'tm-' + (++teamMemberSeq);
  const row = document.createElement('div');
  row.className = 'team-member-row';
  row.id = id;
  row.innerHTML = `
    <div class="tmr-top">
      <input class="form-input tm-firstname" placeholder="First name">
      <input class="form-input tm-lastname" placeholder="Last name">
      <button type="button" class="rcc-edit" onclick="removeTeamMember('${id}')" title="Remove">✕</button>
    </div>
    <div class="tmr-trades-label">Services this person provides (select all that apply):</div>
    <div class="tmr-trades-grid" id="${id}-grid"></div>
    <div class="add-trade-row" id="${id}-addRow" style="display:none">
      <input type="text" class="form-input" id="${id}-addInput" placeholder="Don't see it? Type it here — e.g. Pool Builder, Interior Designer..."
        onkeydown="if(event.key==='Enter'){event.preventDefault();addTeamCustomTrade('${id}');}"/>
      <button type="button" class="btn-outline custom-svc-add-btn" onclick="addTeamCustomTrade('${id}')">+ Add</button>
    </div>
  `;
  list.appendChild(row);
  renderTeamMemberTradeGrid(id);
}

function removeTeamMember(id) {
  document.getElementById(id)?.remove();
}

function toggleTeamAddTradeInput(rowId) {
  const row = document.getElementById(rowId + '-addRow');
  if (!row) return;
  const showing = row.style.display !== 'none';
  row.style.display = showing ? 'none' : 'flex';
  if (!showing) document.getElementById(rowId + '-addInput')?.focus();
}

// One person can hold several trades (e.g. a plumber who's also a gasfitter),
// so this offers the full trade list ('Other' excluded — replaced by the "+"
// tile below) plus any custom trades the business has added, whether typed
// in here or on page 1. For a business/partnership, team selections drive
// page 1, not the other way round (see syncBusinessTradesToPage1 below).
function renderTeamMemberTradeGrid(rowId, forceCheckTrade) {
  const grid = document.getElementById(rowId + '-grid');
  if (!grid) return;
  const previouslyChecked = new Set([...grid.querySelectorAll('.tm-trade-cb:checked')].map(cb => cb.value));
  if (forceCheckTrade) previouslyChecked.add(forceCheckTrade);

  const standardPills = Object.keys(TRADE_SERVICES_MAP).filter(t => t !== 'Other').map(t => `
    <label class="tmr-trade-pill">
      <input type="checkbox" class="tm-trade-cb" value="${escapeHtml(t)}" ${previouslyChecked.has(t) ? 'checked' : ''} onchange="onTeamTradeToggle('${rowId}')">
      ${escapeHtml(TRADE_ICONS[t] || '')} ${escapeHtml(t)}
    </label>`).join('');

  const customPills = customTrades.map(t => `
    <label class="tmr-trade-pill tmr-trade-pill-custom">
      <input type="checkbox" class="tm-trade-cb" value="${escapeHtml(t.name)}" ${previouslyChecked.has(t.name) ? 'checked' : ''} onchange="onTeamTradeToggle('${rowId}')">
      🔧 ${escapeHtml(t.name)}<span class="custom-tag">Custom</span>${t.reviewStatus === 'pending' ? '<span class="svc-review-tag">🕓 Pending review</span>' : ''}
    </label>`).join('');

  const addTile = `<div class="tmr-trade-pill tmr-add-trade-tile" onclick="toggleTeamAddTradeInput('${rowId}')">➕ Add service</div>`;

  grid.innerHTML = standardPills + customPills + addTile;
}

// A team member typing in a trade we don't have listed goes through the same
// path as page 1's "Add Trade": added to the shared customTrades list (so
// it's available to every team member and shows on page 1 too), flagged
// reviewStatus 'pending' until KiwiFix's team checks and approves it.
function addTeamCustomTrade(rowId) {
  const input = document.getElementById(rowId + '-addInput');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;

  const alreadyExists = customTrades.some(t => t.name.toLowerCase() === name.toLowerCase())
    || Object.keys(TRADE_SERVICES_MAP).some(t => t.toLowerCase() === name.toLowerCase());

  if (!alreadyExists) {
    const licenceInfo = resolveServiceLicence(name);
    const id = 'customtrade-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    customTrades.push({
      id, name,
      tier: licenceInfo.tier, licenceType: licenceInfo.type, licenceNote: licenceInfo.note,
      uploaded: false, qualificationDeclared: null,
      reviewStatus: 'pending',
    });
    renderCustomTradeCards(); // reflect it on page 1 too
  }

  input.value = '';
  toggleTeamAddTradeInput(rowId);
  refreshAllTeamMemberTradeGrids();
  renderTeamMemberTradeGrid(rowId, name); // make sure the adder ends up checked for it
  onTeamTradeToggle(rowId);
}

// Keeps every team member's pill list in sync whenever the shared custom
// trades list changes (added here, added on page 1, or removed on page 1).
function refreshAllTeamMemberTradeGrids() {
  document.querySelectorAll('#teamMembersList .team-member-row').forEach(row => renderTeamMemberTradeGrid(row.id));
}

// Whenever a team member's trades change, the business's own Services-step
// selection (page 1) should grow to include it too — team selections drive
// page 1 for a business/partnership, not the reverse. Additive only: we
// never uncheck page 1 just because a team member's trade was removed.
function onTeamTradeToggle(rowId) {
  syncBusinessTradesToPage1();
}

function syncBusinessTradesToPage1() {
  const allTeamTrades = new Set(
    [...document.querySelectorAll('#teamMembersList .tm-trade-cb:checked')].map(cb => cb.value)
  );
  let changed = false;
  allTeamTrades.forEach(trade => {
    const cb = [...document.querySelectorAll('#tradeTypeGrid input[name="tradeType"]')]
      .find(el => el.value === trade);
    if (cb && !cb.checked) {
      cb.checked = true;
      changed = true;
    }
  });
  if (changed && typeof updateServicesList === 'function') updateServicesList();
  renderLicenceSections(getSelectedTrades());
}

function getTeamMembers() {
  return [...document.querySelectorAll('#teamMembersList .team-member-row')].map(row => {
    const firstName = row.querySelector('.tm-firstname')?.value.trim() || '';
    const lastName = row.querySelector('.tm-lastname')?.value.trim() || '';
    return {
      firstName, lastName,
      name: [firstName, lastName].filter(Boolean).join(' '),
      trades: [...row.querySelectorAll('.tm-trade-cb:checked')].map(cb => cb.value),
    };
  }).filter(m => m.firstName); // drop blank rows
}

// Handoff to the dashboard: a brand-new tradie has zero jobs/reviews/earnings.
// Real profile fields (name, trade, area, business) carry over; everything else starts fresh.
function completeTradieOnboarding() {
  // Pick up whatever was on the current step even if "Skip" was used to get here
  captureStepData('personal');
  captureStepData('services');
  captureStepData('business');
  captureStepData('areas');

  const now = new Date();
  const monthYear = now.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });

  const dashboardData = {
    firstName: tradieProfile.firstName || signupData.firstName || 'there',
    lastName:  tradieProfile.lastName  || signupData.lastName  || '',
    email: signupData.email || '', // used by the login page to recognise a returning tradie
    mobile: signupData.mobile || '',
    tradeTypes: tradieProfile.tradeTypes.length ? tradieProfile.tradeTypes : ['Tradie'],
    services: tradieProfile.services,
    businessName: tradieProfile.businessName,
    businessType: tradieProfile.businessType,
    hasTeam: tradieProfile.hasTeam,
    teamMembers: tradieProfile.teamMembers,
    region: tradieProfile.region,
    areas: tradieProfile.areas,
    profilePct: getProfilePct(),
    memberSince: monthYear,
    // Fresh account — no history yet
    jobsCompleted: 0,
    activeJobs: 0,
    avgRating: null,
    reviewCount: 0,
    monthEarnings: 0,
    recentJobs: [],
  };

  localStorage.setItem('kiwifix_tradie_profile', JSON.stringify(dashboardData));
  window.location.href = 'tradie-dashboard.html';
}

/* ============================================================
   PROFILE COMPLETION TRACKER
   ============================================================ */
const profileDone = {
  account: true,      // always true once they reach profile steps
  services: false,
  personal: false,
  business: false,
  licence: false,
  areas: false,
  availability: false,
};
const STEP_WEIGHT = { account:10, services:15, personal:15, business:20, licence:25, areas:10, availability:5 };

function getProfilePct() {
  return Object.entries(profileDone).reduce((sum, [k, done]) => done ? sum + STEP_WEIGHT[k] : sum, 0);
}

function updateProfileBars() {
  const pct = getProfilePct();
  document.querySelectorAll('.psb-fill').forEach(el => el.style.width = pct + '%');
  document.querySelectorAll('.psb-pct').forEach(el => el.textContent = pct + '%');
  updateSteppers();
  updateSidebars();
}

function updateSteppers() {
  const LABELS = {
    account:'Account', services:'Services', personal:'Personal',
    business:'Business', licence:'Licence', areas:'Areas', availability:'Availability'
  };
  document.querySelectorAll('.tradie-onboard-stepper').forEach(stepper => {
    const activeStep = stepper.dataset.active;
    const items = stepper.querySelectorAll('.tos-item[data-step]');
    const lines = stepper.querySelectorAll('.tos-line');
    items.forEach((item, i) => {
      const step = item.dataset.step;
      const isDone = step === 'account' || !!profileDone[step];
      const isActive = step === activeStep;
      let cls = 'tos-item';
      if (isDone) cls += ' done';
      if (isActive) cls += ' active';
      item.className = cls;
      item.textContent = (isDone && !isActive) ? '✓ ' + LABELS[step] : LABELS[step];
      const navPage = item.dataset.nav;
      if (isDone && navPage && !isActive) {
        item.style.cursor = 'pointer';
        item.onclick = () => nav(navPage);
      } else {
        item.style.cursor = '';
        item.onclick = null;
      }
      if (lines[i]) lines[i].className = 'tos-line' + (isDone ? ' done' : '');
    });
  });
}

function updateSidebars() {
  const LABELS = {
    account:'Account created', services:'Services offered', personal:'Personal details',
    business:'Business details', licence:'Trade licence', areas:'Service areas', availability:'Availability'
  };
  const NAV = {
    services:'tradie-services', personal:'tradie-personal', business:'tradie-business',
    licence:'tradie-licence', areas:'tradie-areas', availability:'tradie-availability'
  };
  const ORDER = ['account','services','personal','business','licence','areas','availability'];
  document.querySelectorAll('.tds-card[data-active]').forEach(card => {
    const activeStep = card.dataset.active;
    card.querySelectorAll('.tds-step[data-step]').forEach((item, i) => {
      const step = item.dataset.step;
      const isDone = step === 'account' || !!profileDone[step];
      const isActive = step === activeStep;
      let cls = 'tds-step';
      if (isDone) cls += ' done';
      if (isActive) cls += ' active';
      item.className = cls;
      const dot = item.querySelector('.tds-dot');
      if (dot) {
        dot.className = 'tds-dot' + (isActive ? ' active' : '');
        dot.textContent = isDone ? '✓' : (i + 1);
      }
      if (isDone && NAV[step] && !isActive) {
        item.style.cursor = 'pointer';
        item.onclick = () => nav(NAV[step]);
      } else {
        item.style.cursor = '';
        item.onclick = null;
      }
    });
  });
}

// Clear field-error as soon as user starts typing
document.addEventListener('input', e => {
  if (e.target.matches('input, textarea')) e.target.classList.remove('field-error');
});

/* ============================================================
   FORM VALIDATION
   ============================================================ */
function showError(sectionId, msg) {
  // Remove any existing toast
  document.querySelectorAll('.validation-toast').forEach(el => el.remove());
  const section = document.getElementById(sectionId);
  if (!section) return;
  const toast = document.createElement('div');
  toast.className = 'validation-toast';
  toast.textContent = '⚠️ ' + msg;
  // Insert before the form-nav-row
  const anchor = section.querySelector('.form-nav-row, .btn-primary-full, .auth-security-note');
  if (anchor) anchor.insertAdjacentElement('beforebegin', toast);
  else section.querySelector('.page-body, .auth-split-form')?.prepend(toast);
  setTimeout(() => toast.remove(), 4000);
}

function clearErrors(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  section.querySelectorAll('.validation-toast').forEach(el => el.remove());
}

function formatDOB(input) {
  // Strip everything except digits
  let digits = input.value.replace(/\D/g, '');
  // Cap at 8 digits (DDMMYYYY)
  digits = digits.slice(0, 8);
  // Clamp day (01-31) as user types
  if (digits.length >= 2) {
    let d = parseInt(digits.slice(0, 2), 10);
    if (d > 31) d = 31;
    if (d < 1 && digits.length === 2) d = 1;
    digits = String(d).padStart(2, '0') + digits.slice(2);
  }
  // Clamp month (01-12) as user types
  if (digits.length >= 4) {
    let m = parseInt(digits.slice(2, 4), 10);
    if (m > 12) m = 12;
    if (m < 1 && digits.length >= 4) m = 1;
    digits = digits.slice(0, 2) + String(m).padStart(2, '0') + digits.slice(4);
  }
  // Build formatted string with slashes
  let out = '';
  if (digits.length <= 2) {
    out = digits;
  } else if (digits.length <= 4) {
    out = digits.slice(0, 2) + ' / ' + digits.slice(2);
  } else {
    out = digits.slice(0, 2) + ' / ' + digits.slice(2, 4) + ' / ' + digits.slice(4);
  }
  input.value = out;
}

function validateDOB(input) {
  const digits = input.value.replace(/\D/g, '');
  if (digits.length === 0) return; // empty is fine (will be caught by required check)
  if (digits.length < 8) {
    input.classList.add('field-error');
    return;
  }
  const d = parseInt(digits.slice(0, 2), 10);
  const m = parseInt(digits.slice(2, 4), 10);
  const y = parseInt(digits.slice(4, 8), 10);
  const date = new Date(y, m - 1, d);
  const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    && y >= 1900 && y <= new Date().getFullYear() - 16;
  if (!valid) {
    input.classList.add('field-error');
  } else {
    input.classList.remove('field-error');
  }
}

function formatMobile(input) {
  let val = input.value.replace(/\D/g, '');
  val = val.slice(0, 10);
  if (val.length > 6) val = val.slice(0,3) + ' ' + val.slice(3,6) + ' ' + val.slice(6);
  else if (val.length > 3) val = val.slice(0,3) + ' ' + val.slice(3);
  input.value = val;
}

function validateSignup() {
  const section = document.getElementById('tradie-signup');
  clearErrors('tradie-signup');

  const inputs = {
    firstName: section.querySelector('input[placeholder="e.g. John"]'),
    lastName:  section.querySelector('input[placeholder="e.g. Smith"]'),
    mobile:    section.querySelector('input[placeholder="e.g. 021 123 4567"]'),
    email:     section.querySelector('input[placeholder="e.g. john.smith@email.com"]'),
  };

  let firstError = null;
  const labels = { firstName: 'First name', lastName: 'Last name', mobile: 'Mobile number', email: 'Email address' };

  for (const [key, input] of Object.entries(inputs)) {
    if (!input) continue;
    if (!input.value.trim()) {
      input.classList.add('field-error');
      if (!firstError) firstError = labels[key];
    } else {
      // Basic email check
      if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
        input.classList.add('field-error');
        if (!firstError) firstError = 'a valid email address';
      }
    }
  }

  if (firstError) {
    showError('tradie-signup', 'Please enter ' + firstError + ' before continuing.');
    return;
  }
  // Store signup data for auto-fill on later pages
  signupData.firstName = inputs.firstName?.value.trim() || '';
  signupData.lastName  = inputs.lastName?.value.trim()  || '';
  signupData.mobile    = inputs.mobile?.value.trim()     || '';
  signupData.email     = inputs.email?.value.trim()      || '';
  nav('tradie-verify-mobile');
}

function validateStep(step) {
  const sectionId = 'tradie-' + step;
  clearErrors(sectionId);
  const section = document.getElementById(sectionId);
  if (!section) return true;

  // Services: must select at least one trade type
  if (step === 'services') {
    const checked = section.querySelectorAll('input[name="tradeType"]:checked');
    if (checked.length === 0) {
      showError(sectionId, 'Please select at least one trade type before continuing.');
      return false;
    }
    return true;
  }

  // Availability: must have at least one day selected
  if (step === 'availability') {
    const activeDays = section.querySelectorAll('.day-btn.active');
    if (activeDays.length === 0) {
      showError(sectionId, 'Please select at least one working day.');
      return false;
    }
    return true;
  }

  // For all other steps: check required text inputs
  // A field is required if its label does NOT contain "(optional)"
  let firstError = null;
  section.querySelectorAll('.field-group').forEach(group => {
    const label = group.querySelector('.field-label');
    if (label && label.textContent.includes('optional')) return; // skip optional
    const input = group.querySelector('input.form-input, textarea.form-input');
    if (input && !input.value.trim()) {
      input.classList.add('field-error');
      if (!firstError) firstError = label ? label.textContent.replace('(optional)', '').trim() : 'Required field';
    }
  });

  if (firstError) {
    showError(sectionId, '"' + firstError + '" is required.');
    return false;
  }
  return true;
}

function saveAndContinue(step, nextPage) {
  if (!validateStep(step)) return; // block if invalid
  profileDone[step] = true;
  captureStepData(step);
  updateProfileBars();
  if (step === 'services') renderLicenceSections(getSelectedTrades());
  nav(nextPage);
}

/* ============================================================
   PAGE NAVIGATION
   ============================================================ */
function nav(pageId, fromPopState) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // Push a new history entry so browser back/forward work
  // (skip when called from popstate to avoid double-stacking)
  if (!fromPopState) history.pushState({ page: pageId }, '', '#' + pageId);
  // Page-specific logic
  if (pageId === 'job-step3') renderReview();
  if (pageId === 'job-step4') renderPosted();
  if (pageId === 'finding-tradies') startFindingAnimation();
  if (pageId === 'top-tradies') setTimeout(renderTopTradies, 0);
  if (pageId === 'tradie-licence') setTimeout(() => renderLicenceSections(getSelectedTrades()), 0);
  if (pageId === 'tradie-services') setTimeout(() => updateServicesList(), 0);
  if (pageId === 'tradie-personal') setTimeout(autofillPersonal, 0);
  if (pageId === 'tradie-review-submit') setTimeout(renderReviewSubmit, 0);
  if (pageId === 'tradie-login') setTimeout(resetTradieLoginForm, 0);
  if (pageId === 'tradie-verify-mobile') setTimeout(renderTradieVerifyTargets, 0);
  // Update profile bars whenever a profile step is shown
  const profilePages = ['tradie-services','tradie-personal','tradie-business','tradie-licence','tradie-areas','tradie-availability','tradie-review-submit'];
  if (profilePages.includes(pageId)) setTimeout(() => updateProfileBars(), 0);
  if (pageId === 'home') startLandingHeaderAutoHide();
}

/* ============================================================
   OTP AUTO-VERIFY
   ============================================================ */
function otpInput(input, groupId, nextPage) {
  // Only allow digits
  input.value = input.value.replace(/\D/g, '').slice(-1);
  if (input.value) input.classList.add('filled');
  else input.classList.remove('filled');

  const group = document.getElementById(groupId);
  const boxes = group.querySelectorAll('.otp-box');
  const values = [...boxes].map(b => b.value.trim());
  const complete = values.every(v => v.length === 1);

  // Auto-focus next box
  const idx = [...boxes].indexOf(input);
  if (input.value && idx < boxes.length - 1) boxes[idx + 1].focus();

  // Auto-verify when all 6 filled
  if (complete) {
    boxes.forEach(b => b.classList.add('otp-verified'));
    const msg = document.getElementById(groupId + '-verified');
    if (msg) { msg.style.display = 'flex'; }
    const btn = document.getElementById(groupId + '-btn');
    if (btn) { btn.disabled = false; btn.classList.remove('otp-btn-waiting'); }
  } else {
    boxes.forEach(b => b.classList.remove('otp-verified'));
    const msg = document.getElementById(groupId + '-verified');
    if (msg) msg.style.display = 'none';
    const btn = document.getElementById(groupId + '-btn');
    if (btn) { btn.disabled = true; btn.classList.add('otp-btn-waiting'); }
  }
}

function otpKey(e, input) {
  // Backspace moves to previous box
  if (e.key === 'Backspace' && !input.value) {
    const boxes = [...input.closest('.otp-inputs-row').querySelectorAll('.otp-box')];
    const idx = boxes.indexOf(input);
    if (idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ''; boxes[idx - 1].classList.remove('filled'); }
  }
}

/* ============================================================
   JOB STEP 1 – INTERACTIONS
   ============================================================ */
function selectCat(btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.category = btn.dataset.cat;

  // Show the "Other" sub-service picker only when Other is selected
  const otherPanel = document.getElementById('otherServicesPanel');
  if (otherPanel) {
    const isOther = state.category === 'Other';
    otherPanel.style.display = isOther ? 'block' : 'none';
    if (!isOther) {
      state.otherServices = [];
      document.querySelectorAll('.other-svc-chip').forEach(c => c.classList.remove('active'));
      renderOtherCustomTags();
    }
  }

  updateCategorySummary();
}

// Quick-pick chips are multi-select — clicking toggles membership in
// state.otherServices, same list the freeform input below adds to.
function selectOtherService(btn) {
  const svc = btn.dataset.svc;
  const idx = state.otherServices.indexOf(svc);
  if (idx === -1) {
    state.otherServices.push(svc);
    btn.classList.add('active');
  } else {
    state.otherServices.splice(idx, 1);
    btn.classList.remove('active');
  }
  renderOtherCustomTags();
  updateCategorySummary();
}

function addOtherCustomService() {
  const input = document.getElementById('otherCustomInput');
  if (!input) return;
  const name = input.value.trim();
  if (!name || state.otherServices.includes(name)) return;
  state.otherServices.push(name);
  input.value = '';
  renderOtherCustomTags();
  updateCategorySummary();
}

function removeOtherService(name) {
  state.otherServices = state.otherServices.filter(s => s !== name);
  document.querySelectorAll('.other-svc-chip').forEach(c => {
    if (c.dataset.svc === name) c.classList.remove('active');
  });
  renderOtherCustomTags();
  updateCategorySummary();
}

// Unified tag list under the Other panel — shows everything selected via
// quick-pick chips AND anything typed into the freeform input, each removable.
function renderOtherCustomTags() {
  const container = document.getElementById('otherCustomTags');
  if (!container) return;
  // Safe to embed inside onclick="...('...')" : escape backslash/quote for the
  // JS string literal, then &quot; so a literal " can't break the HTML attribute.
  const jsArg = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  container.innerHTML = state.otherServices.map(s => `
    <span class="other-tag">✓ ${escapeHtml(s)} <button type="button" class="other-tag-remove" aria-label="Remove ${escapeHtml(s)}" onclick="removeOtherService('${jsArg(s)}')">×</button></span>
  `).join('');
}

function updateCategorySummary() {
  const sumCat = document.getElementById('sumCat');
  if (!sumCat) return;
  if (state.category === 'Other' && state.otherServices.length) {
    sumCat.textContent = state.otherServices.length === 1
      ? `Other · ${state.otherServices[0]}`
      : `Other · ${state.otherServices.length} services`;
  } else {
    sumCat.textContent = state.category;
  }
}

function selectUrgency(btn) {
  document.querySelectorAll('.urgency-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.urgency = btn.dataset.urgency;
  const icon = btn.querySelector('.uo-icon');
  // Remove filled class from all icons first
  document.querySelectorAll('.urgency-opt .uo-icon').forEach(i => i.classList.remove('active-icon'));
  icon.style.background = 'var(--green)';
  // Reset others
  document.querySelectorAll('.urgency-opt:not(.active) .uo-icon').forEach(i => i.style.background = '');
  // Radios
  document.querySelectorAll('.uo-radio').forEach(r => { r.classList.remove('filled'); });
  btn.querySelector('.uo-radio').classList.add('filled');
  updateSummary();
}

function selectContact(btn) {
  document.querySelectorAll('.contact-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.contact = btn.dataset.contact;
  // Update check icons
  document.querySelectorAll('.co-check').forEach(c => { c.classList.remove('filled'); c.textContent = ''; });
  const check = btn.querySelector('.co-check');
  check.classList.add('filled');
  check.textContent = '✓';
}

function updateSummary() {
  // Category is tracked via state.category (updated by selectCat or icon grid)
  const sumCat = document.getElementById('sumCat');
  if (sumCat) sumCat.textContent = state.category;

  // Location dropdowns (on step 2+)
  const region = document.getElementById('region');
  const city   = document.getElementById('city');
  const suburb = document.getElementById('suburb');
  if (region && city && suburb) {
    const sumLoc = document.getElementById('sumLoc');
    if (sumLoc) sumLoc.textContent = `${suburb.value}, ${city.value}, ${region.value}`;
  }
}

function updateDesc() {
  const desc = document.getElementById('jobDesc');
  const count = document.getElementById('descCount');
  if (desc && count) {
    state.description = desc.value;
    count.textContent = desc.value.length;
    const sumDesc = document.getElementById('sumDesc');
    if (sumDesc) sumDesc.textContent = desc.value || 'Not provided yet';

    const wordHint = document.getElementById('descWordHint');
    if (wordHint) {
      const wordCount = desc.value.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount >= MIN_DESCRIPTION_WORDS) {
        wordHint.textContent = `✓ ${wordCount} words`;
        wordHint.style.color = 'var(--green)';
      } else {
        wordHint.textContent = `Add at least ${MIN_DESCRIPTION_WORDS} words so tradies understand the job (${wordCount} so far).`;
        wordHint.style.color = '';
      }
    }
  }
}

/* ============================================================
   JOB PHOTOS — upload to backend (local disk today, S3 later —
   the frontend only ever deals with whatever URL string comes back,
   so swapping storage providers server-side needs no change here)
   ============================================================ */
const MAX_JOB_PHOTOS = 6;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB, matches the upload box hint

async function handleJobPhotoUpload(input) {
  const files = Array.from(input.files || []);
  input.value = ''; // allow re-selecting the same file later

  const container = document.getElementById('jobPhotoPreviews');
  if (!container) return;

  for (const file of files) {
    if (state.photos.length >= MAX_JOB_PHOTOS) {
      showJobError('job-step1', `You can attach up to ${MAX_JOB_PHOTOS} photos.`);
      break;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      showJobError('job-step1', `"${file.name}" is over 10MB — please choose a smaller photo.`);
      continue;
    }

    const localId = 'ph_' + Math.random().toString(36).slice(2, 10);
    const previewUrl = URL.createObjectURL(file);

    const thumb = document.createElement('div');
    thumb.className = 'job-photo-thumb uploading';
    thumb.id = localId;
    thumb.innerHTML = `<img src="${previewUrl}" alt=""/><div class="jpt-spinner">…</div>`;
    container.appendChild(thumb);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: formData });
      let data = null;
      try { data = await res.json(); } catch (e) { /* empty body */ }
      if (!res.ok || !data?.url) {
        throw new Error((data && data.message) || 'Upload failed');
      }

      state.photos.push(data.url);
      thumb.dataset.url = data.url;
      thumb.classList.remove('uploading');
      thumb.innerHTML = `
        <img src="${previewUrl}" alt=""/>
        <button type="button" class="jpt-remove" onclick="removeJobPhoto('${localId}','${data.url}')">×</button>
      `;
    } catch (err) {
      thumb.classList.remove('uploading');
      thumb.innerHTML = `<div class="jpt-error">Failed to upload</div><button type="button" class="jpt-remove" onclick="document.getElementById('${localId}').remove()">×</button>`;
    }
  }
}

function removeJobPhoto(localId, url) {
  state.photos = state.photos.filter(u => u !== url);
  document.getElementById(localId)?.remove();
}

/* ============================================================
   ADDRESS AUTOCOMPLETE — Nominatim (OpenStreetMap) — free, no key
   ============================================================ */
let addrTimer = null;
// NZ bounding box: lon 165.7–178.6, lat -47.3–-34.3
const NZ_BBOX = '165.7,-47.3,178.6,-34.3';

function addressSearch(input) {
  const q = input.value.trim();
  // Find dropdown sibling within the same field-group
  const dropdown = input.closest('.field-group').querySelector('.address-dropdown');
  if (!dropdown) return;
  clearTimeout(addrTimer);
  if (q.length < 3) { dropdown.classList.add('d-none'); return; }
  dropdown.classList.remove('d-none');
  dropdown.innerHTML = '<div class="address-loading">Searching…</div>';
  addrTimer = setTimeout(async () => {
    try {
      // Photon: OSM-based autocomplete, built for partial queries, free, no key
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=${NZ_BBOX}&limit=7&lang=en`;
      const res = await fetch(url);
      const data = await res.json();
      const features = (data.features || []).filter(f => f.properties?.country === 'New Zealand');
      if (!features.length) {
        dropdown.innerHTML = '<div class="address-loading">No NZ addresses found — try suburb or city name</div>';
        return;
      }
      dropdown.innerHTML = features.map(f => {
        const p = f.properties || {};
        const cityName = p.city || p.town || p.village || '';
        // Photon/OSM doesn't consistently tag NZ suburbs as `suburb` — it's
        // often `district`, `locality`, or `neighbourhood` depending on how
        // that area was mapped. Check them in order and take the first one
        // that isn't just a duplicate of the city name.
        const suburbName = [p.suburb, p.district, p.locality, p.neighbourhood]
          .find(v => v && v !== cityName);
        const parts = [];
        if (p.housenumber || p.street) parts.push([p.housenumber, p.street].filter(Boolean).join(' '));
        if (suburbName) parts.push(suburbName);
        if (cityName) parts.push(cityName);
        if (p.postcode) parts.push(p.postcode);
        // fallback to name if no structured parts
        if (!parts.length && p.name) parts.push(p.name);
        const display = parts.join(', ') || p.name || '';
        const safe = display.replace(/'/g, '&#39;');
        return `<div class="address-option" onclick="selectAddress('${input.id}','${safe}')"><span class="addr-icon">📍</span><span>${display}</span></div>`;
      }).join('');
    } catch(e) {
      dropdown.innerHTML = '<div class="address-loading">Search unavailable — please type your address manually</div>';
    }
  }, 350);
}

function selectAddress(inputId, addr) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = addr;
    input.closest('.field-group').querySelector('.address-dropdown')?.classList.add('d-none');
  }
  state.address = addr;
  const sumLoc = document.getElementById('sumLoc');
  if (sumLoc) sumLoc.textContent = addr;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.address-dropdown') && !e.target.matches('[id^="jobAddress"]')) {
    document.querySelectorAll('.address-dropdown').forEach(d => d.classList.add('d-none'));
  }
});

/* ============================================================
   MASTER SERVICE DATABASE – single source of truth
   One record per known service: which trade it belongs to (so its
   licence tier can be looked up in TRADE_LICENCE_INFO, defined further
   below), the keywords that match it against a customer's job
   description (smart job matching), and an optional licence override
   for services that don't cleanly inherit their trade's tier.
   trade: null means the service isn't tied to a registered trade
   (e.g. "Other"-style jobs like Pest Control, House Movers).
   ============================================================ */
const SERVICE_DATABASE = {
  // Plumber
  'Leak Repairs':          { trade: 'Plumber', keywords: ['leak', 'leaking', 'drip', 'dripping'] },
  'Hot Water Systems':     { trade: 'Plumber', keywords: ['hot water', 'hws', 'water cylinder'] },
  'Drain Cleaning':        { trade: 'Plumber', keywords: ['drain', 'blocked drain', 'clogged'] },
  'Bathroom Renovations':  { trade: 'Plumber', keywords: ['bathroom renovation', 'bathroom reno', 'bathroom remodel'] },
  'Gas Fitting':           { trade: 'Gasfitter', keywords: ['gas', 'gasfit', 'gas fitting', 'lpg'] },
  'Emergency Plumbing':    { trade: 'Plumber', keywords: ['emergency', 'urgent', 'burst pipe', 'asap'] },

  // Electrician
  'Wiring & Rewiring':     { trade: 'Electrician', keywords: ['wiring', 'rewire', 'rewiring', 'wire'] },
  'Switchboard Upgrades':  { trade: 'Electrician', keywords: ['switchboard', 'fusebox', 'trip', 'tripping'] },
  'LED Lighting':          { trade: 'Electrician', keywords: ['led', 'lighting', 'downlight'] },
  'Solar Installation':    { trade: 'Electrician', keywords: ['solar', 'panel'], licenceTier: 'recommended', licenceType: 'Electrician licence + Solar competency', licenceNote: 'Usually requires an electrician licence plus solar competency certification.' },
  'EV Charging':           { trade: 'Electrician', keywords: ['ev charger', 'electric vehicle', 'ev charging'] },
  'Heat Pump Installation':{ trade: 'Electrician', keywords: ['heat pump', 'aircon', 'air conditioning'] },

  // Gasfitter
  'Gas Hot Water Systems': { trade: 'Gasfitter', keywords: ['gas hot water', 'gas water heater'] },

  // Drainlayer
  'Drain Laying & Installation': { trade: 'Drainlayer', keywords: ['new drain', 'drain laying', 'lay a drain'] },
  'Stormwater Drainage':   { trade: 'Drainlayer', keywords: ['stormwater', 'storm water'] },
  'Sewer Line Repairs':    { trade: 'Drainlayer', keywords: ['sewer', 'sewer line', 'sewage'] },

  // HVAC Technician
  'Refrigeration Repairs': { trade: 'HVAC Technician', keywords: ['fridge', 'freezer', 'refrigeration', 'cool room', 'chiller'] },
  'Air Conditioning Servicing': { trade: 'HVAC Technician', keywords: ['air conditioning', 'aircon service', 'ac not working', 'ac unit', 'hvac'] },

  // Lift Technician
  'Lift Installation':     { trade: 'Lift Technician', keywords: ['lift', 'elevator', 'stuck in the lift', 'stuck in lift'] },
  'Lift Maintenance & Servicing': { trade: 'Lift Technician', keywords: ['lift servicing', 'elevator maintenance'] },

  // Scaffolder
  'Residential Scaffolding': { trade: 'Scaffolder', keywords: ['scaffold', 'scaffolding'] },

  // Arborist
  'Tree Removal':          { trade: 'Arborist', keywords: ['tree', 'trees', 'stump', 'branch', 'branches'] },
  'Tree Pruning & Trimming': { trade: 'Arborist', keywords: ['prune', 'pruning', 'canopy', 'trim', 'trimming'] },
  'Tree Cutting':          { trade: 'Arborist', keywords: ['cut down', 'cutting', 'felling', 'fell', 'chop', 'chainsaw'] },

  // Solar Installer
  'Solar Panel Installation': { trade: 'Solar Installer', keywords: ['solar panel', 'solar power', 'solar install'] },

  // Fire Protection Technician
  'Fire Alarm Installation': { trade: 'Fire Protection Technician', keywords: ['fire alarm', 'smoke alarm install'] },
  'Fire Alarm Servicing & Testing': { trade: 'Fire Protection Technician', keywords: ['fire alarm testing', 'fire alarm service', 'smoke detector test'] },
  'Sprinkler System Maintenance': { trade: 'Fire Protection Technician', keywords: ['sprinkler system', 'fire sprinkler'] },

  // Builder / Carpenter
  'Renovations':           { trade: 'Builder', keywords: ['renovat', 'reno'] },
  'Extensions':            { trade: 'Builder', keywords: ['extension', 'extend'] },
  'New Builds':            { trade: 'Builder', keywords: ['new build', 'building a house'] },
  'Carpentry':             { trade: 'Carpenter', keywords: ['carpentry', 'carpenter', 'framing', 'joinery'] },

  // Fencer
  'Decking & Fencing':     { trade: 'Fencer', keywords: ['deck', 'decking', 'fence', 'fencing'] },

  // Painter
  'Interior Painting':     { trade: 'Painter', keywords: ['paint', 'painting', 'repaint', 'interior paint'] },
  'Exterior Painting':     { trade: 'Painter', keywords: ['exterior paint', 'house paint'] },

  // Gardener
  'Landscaping':           { trade: 'Gardener', keywords: ['landscap', 'garden design', 'section clearing', 'retaining wall'] },
  'Lawn Mowing':           { trade: 'Gardener', keywords: ['lawn', 'mowing', 'mow'] },

  // Cleaner
  'House Cleaning':        { trade: 'Cleaner', keywords: ['clean', 'cleaning', 'housekeeping'] },
  'Window Cleaning':       { trade: 'Cleaner', keywords: ['window clean', 'windows clean'] },

  // Roofer
  'Roof Repairs':          { trade: 'Roofer', keywords: ['roof', 'spouting', 'gutter'] },
  'Roof Replacement':      { trade: 'Roofer', keywords: ['roof replacement', 'new roof'] },

  // Tiler
  'Floor Tiling':          { trade: 'Tiler', keywords: ['tile', 'tiling', 'floor tile'] },

  // Glazier
  'Glazing':               { trade: 'Glazier', keywords: ['glass', 'glazing', 'window replacement', 'mirror install'] },

  // Flooring Installer
  'Flooring':              { trade: 'Flooring Installer', keywords: ['flooring', 'floor install', 'carpet lay', 'vinyl floor', 'laminate floor'] },

  // Cabinet Maker
  'Cabinet Making':        { trade: 'Cabinet Maker', keywords: ['cabinet', 'cabinetry', 'built-in wardrobe', 'custom joinery'] },

  // Handyman / Other
  'Handyman Services':     { trade: 'Other', keywords: ['handyman', 'odd job', 'odd jobs', 'fix things'] },

  // "Other" services — not tied to a registered trade
  'House Movers / Removals': { trade: null, keywords: ['mover', 'movers', 'moving house', 'removal', 'removalist', 'relocation'], licenceTier: 'none' },
  'Pest Control':            { trade: null, keywords: ['pest', 'rodent', 'possum', 'cockroach', 'rats', 'mice', 'ants', 'wasp'], licenceTier: 'recommended', licenceNote: 'Chemical pest treatments may require an Approved Handler certification.' },
  'Locksmith':               { trade: null, keywords: ['lock', 'locksmith', 'locked out', 'key cut', 'rekey'], licenceTier: 'none' },
  'Pool & Spa Maintenance':  { trade: null, keywords: ['pool', 'spa', 'swimming pool'], licenceTier: 'none' },
  'Blinds & Curtains':       { trade: null, keywords: ['blind', 'curtain', 'shutter'], licenceTier: 'none' },
  'Chimney Sweep':           { trade: null, keywords: ['chimney', 'flue', 'fireplace clean'], licenceTier: 'none' },
  'Security & Alarm Systems':{ trade: null, keywords: ['alarm', 'security system', 'cctv', 'camera install'], licenceTier: 'recommended', licenceNote: 'Monitored security/fire systems may require industry certification.' },
  'Concrete & Paving':       { trade: null, keywords: ['concrete', 'paving', 'driveway'], licenceTier: 'none' },
  'Rubbish & Skip Bin Removal': { trade: null, keywords: ['rubbish', 'skip bin', 'junk removal', 'waste removal'], licenceTier: 'none' },
  'Furniture Assembly':     { trade: null, keywords: ['furniture assembly', 'flat pack', 'flatpack', 'assemble furniture'], licenceTier: 'none' },
  'Building Inspection':    { trade: null, keywords: ['building inspection', 'pre-purchase inspection', 'house inspection'], licenceTier: 'recommended', licenceNote: 'Professional building inspection qualifications are recommended.' },
};

// Keyword fallback classification for typed/free-text service names that
// don't match anything in SERVICE_DATABASE at all (e.g. a made-up business
// name like "Concrete Cutting Co"). Kept deliberately small and specific —
// unmatched text defaults to 'none' rather than blocking someone over a
// false positive.
const REQUIRED_LICENCE_KEYWORDS = [
  'electric', 'electrical', 'wiring', 'wire', 'switchboard',
  'gas', 'gasfit', 'lpg',
  'plumb', 'drain', 'drainlay', 'backflow',
  'scaffold',
  'hvac', 'refrigerant', 'regas', 'refrigeration',
  'lift', 'elevator',
  'asbestos', 'demolition',
];
const RECOMMENDED_CERT_KEYWORDS = [
  'arboris', 'tree removal', 'tree cutt', 'tree fell', 'tree servic', 'tree work', 'faller', 'chainsaw',
  'solar',
  'fire alarm', 'fire protection', 'sprinkler',
  'crane', 'height', 'harness',
  'roof', 'roofing', 'structural', 'restricted building work', 'rbw',
  'pest',
  'alarm', 'security system', 'cctv',
  'building inspection',
];

// Terms we're confident carry no licence/certification expectation in NZ —
// only these get a firm "none". Everything else that reaches this point is
// genuinely unrecognised, so we ask rather than assume it's risk-free.
const SAFE_KEYWORDS = [
  'paint', 'painting',
  'clean', 'cleaning', 'housekeeping',
  'garden', 'gardening', 'lawn', 'mow',
  'tile', 'tiling',
  'floor', 'flooring', 'carpet lay',
  'fence', 'fencing', 'gate',
  'glass', 'glazing', 'mirror',
  'cabinet', 'cabinetry', 'joinery', 'wardrobe',
  'carpentry', 'carpenter', 'framing',
  'furniture assembly', 'flat pack', 'flatpack',
  'mover', 'movers', 'moving', 'removal', 'relocation',
  'lock', 'locksmith', 'key cut',
  'blind', 'curtain', 'shutter',
  'window clean',
  'concrete', 'paving', 'driveway',
  'rubbish', 'skip bin', 'junk removal', 'waste removal',
  'chimney', 'flue',
  'pool', 'spa', 'swimming pool',
  'handyman', 'odd job',
];

function classifyByKeyword(text) {
  const lower = (text || '').toLowerCase();
  if (REQUIRED_LICENCE_KEYWORDS.some(k => lower.includes(k))) return 'required';
  if (RECOMMENDED_CERT_KEYWORDS.some(k => lower.includes(k))) return 'recommended';
  if (SAFE_KEYWORDS.some(k => lower.includes(k))) return 'none';
  // Genuinely unrecognised text (industry slang, a typo, a made-up term) —
  // don't confidently wave it through as "no licence needed". Ask instead.
  return 'recommended';
}

function tierFromEntry(entry) {
  if (entry.licenceTier) return entry.licenceTier;
  if (entry.trade && TRADE_LICENCE_INFO[entry.trade]) return TRADE_LICENCE_INFO[entry.trade].level;
  return 'none';
}

function defaultTierNote(tier) {
  if (tier === 'required') return 'This looks like it may require a registered trade licence.';
  if (tier === 'recommended') return 'This may require a trade qualification or certification.';
  return 'No licence required.';
}

// Resolves the licence tier ('required' | 'recommended' | 'none') for any
// service name — whether it's an exact match in the database, a fuzzy
// keyword match against a known service, or completely novel free text.
function resolveServiceLicence(name) {
  const trimmed = (name || '').trim();

  // 1. Exact match against a known service — most precise, uses its curated note.
  const exact = SERVICE_DATABASE[trimmed];
  if (exact) {
    const tier = tierFromEntry(exact);
    return { tier, type: exact.licenceType || exact.trade || '', note: exact.licenceNote || (exact.trade && TRADE_LICENCE_INFO[exact.trade]?.note) || defaultTierNote(tier) };
  }

  // 2. Novel free text — classify via a small, deliberately specific keyword
  // list rather than fuzzy-matching against every SERVICE_DATABASE entry's
  // keywords. (Fuzzy substring matching here is too risky: generic single
  // words like "cutting" would wrongly flag something like "Concrete
  // Cutting" as tree-removal work. That looseness is fine for job-description
  // matching, where more recall is harmless, but not for deciding whether to
  // demand a licence.)
  const tier = classifyByKeyword(trimmed);
  return { tier, type: '', note: defaultTierNote(tier) };
}

// Returns the list of canonical service names whose keywords appear in the description
function matchJobToServices(description) {
  const text = (description || '').toLowerCase();
  const matches = [];
  for (const [service, entry] of Object.entries(SERVICE_DATABASE)) {
    if (entry.keywords.some(kw => text.includes(kw))) matches.push(service);
  }
  return matches;
}

// Checks the currently-registered tradie profile (saved by completeTradieOnboarding
// in app.js) against the matched services, so a real registration flows into matching.
function findMatchingRegisteredTradie(matchedServices) {
  if (!matchedServices || !matchedServices.length) return null;
  const raw = localStorage.getItem('kiwifix_tradie_profile');
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return null; }

  const tradieTerms = [
    ...(data.tradeTypes || []),
    ...((data.services || []).map(s => (s && s.name) || s)),
  ].filter(Boolean).map(s => s.toLowerCase());

  const overlap = matchedServices.filter(m =>
    tradieTerms.some(t => t.includes(m.toLowerCase()) || m.toLowerCase().includes(t))
  );
  if (!overlap.length) return null;
  return { data, overlap };
}

const MIN_DESCRIPTION_WORDS = 5;

function saveStep1() {
  const activeBtn = document.querySelector('#catGrid .cat-btn.active');
  if (activeBtn) state.category = activeBtn.dataset.cat;

  const desc = document.getElementById('jobDesc');
  state.description = desc ? desc.value.trim() : '';

  if (!state.description) {
    desc && desc.classList.add('field-error');
    showJobError('job-step1', 'Please describe your job before continuing.');
    return;
  }

  // Guard against low-effort entries like "test" or "fix it" — require
  // enough words for a tradie to actually understand the job.
  const wordCount = state.description.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_DESCRIPTION_WORDS) {
    desc && desc.classList.add('field-error');
    showJobError('job-step1', `Please add a bit more detail — at least ${MIN_DESCRIPTION_WORDS} words so tradies understand the job (you've written ${wordCount}).`);
    return;
  }

  state.matchedServices = matchJobToServices(state.description);
  // If they picked/typed specific "Other" services, make sure they're all
  // matched even if the free-text description didn't repeat the same wording
  if (state.category === 'Other' && state.otherServices.length) {
    state.otherServices.forEach(s => {
      if (!state.matchedServices.includes(s)) state.matchedServices.unshift(s);
    });
  }
  nav('job-step2');
}

function showJobError(sectionId, msg) {
  document.querySelectorAll('.validation-toast').forEach(el => el.remove());
  const section = document.getElementById(sectionId);
  if (!section) return;
  const toast = document.createElement('div');
  toast.className = 'validation-toast';
  toast.textContent = '⚠️ ' + msg;
  // A section can contain multiple candidate anchors that aren't all visible
  // at once (e.g. conditionally-shown panels toggled by other state). Picking
  // the first match unconditionally could silently insert the toast into a
  // currently-hidden container — pick the first one that's actually visible.
  const anchors = section.querySelectorAll('.form-footer-btns, .form-nav-row');
  const anchor = Array.from(anchors).find(el => el.offsetParent !== null) || anchors[0];
  if (anchor) anchor.insertAdjacentElement('beforebegin', toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ============================================================
   JOB STEP 2 – SIGN IN / CONTINUE
   ============================================================ */

/* Forgot password */
function showForgotPw() {
  document.getElementById('forgotPwPanel').classList.remove('d-none');
}
function hideForgotPw() {
  document.getElementById('forgotPwPanel').classList.add('d-none');
}
function sendResetLink() {
  const val = document.getElementById('resetUsername')?.value.trim();
  if (!val) return;
  document.getElementById('resetSent').classList.remove('d-none');
}

/* Unified sign-in/continue — one email field, backend tells us whether
   this is an existing customer (show "welcome back" + skip name fields)
   or a new one (show name fields), then sends the OTP either way. */
async function startAuth() {
  const emailEl = document.getElementById('authEmail');
  const email = emailEl?.value.trim() || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailEl && emailEl.classList.add('field-error');
    showJobError('job-step2', 'Please enter a valid email address to continue.');
    return;
  }
  emailEl.classList.remove('field-error');

  let result;
  try {
    result = await apiFetch('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  } catch (err) {
    showJobError('job-step2', err.message || 'Could not send the verification code. Please try again.');
    return;
  }

  state.email = email;
  state.isExistingCustomer = !!result.isExistingCustomer;

  const msgEl = document.getElementById('authEmailSentMsg');
  msgEl.innerHTML = '✓ Code sent! Check your email inbox.';
  msgEl.classList.remove('d-none');

  if (state.isExistingCustomer) {
    const name = [result.firstName, result.lastName].filter(Boolean).join(' ');
    document.getElementById('authAvatar').textContent = email.slice(0, 2).toUpperCase();
    document.getElementById('authWelcomeName').textContent = name ? `Welcome back, ${name}!` : 'Welcome back!';
    document.getElementById('authWelcomeSub').textContent = email;
    document.getElementById('authWelcomeBack').classList.remove('d-none');
    document.getElementById('authNameFields').classList.add('d-none');
  } else {
    document.getElementById('authWelcomeBack').classList.add('d-none');
    document.getElementById('authNameFields').classList.remove('d-none');
  }

  // Lock the email field + button so the email can't change after a code was sent
  emailEl.disabled = true;
  document.getElementById('btnContinueEmail').disabled = true;

  document.getElementById('authOtpRow').classList.remove('d-none');
  setTimeout(() => document.querySelector('#otpBoxesAuth .otp-box')?.focus(), 100);
}

/* Let the user go back and fix a typo'd email — undoes everything startAuth()
   locked in/showed, so they can re-enter and hit Continue again. */
function editAuthEmail() {
  const emailEl = document.getElementById('authEmail');
  emailEl.disabled = false;
  emailEl.classList.remove('field-error');
  document.getElementById('btnContinueEmail').disabled = false;

  document.getElementById('authEmailSentMsg').classList.add('d-none');
  document.getElementById('authWelcomeBack').classList.add('d-none');
  document.getElementById('authNameFields').classList.add('d-none');
  document.getElementById('authOtpRow').classList.add('d-none');
  document.getElementById('authVerifiedFields').classList.add('d-none');
  document.getElementById('otpGateMsg').classList.remove('d-none');
  document.getElementById('otpErrorAuth').classList.add('d-none');
  document.getElementById('otpOkAuth').classList.add('d-none');

  document.querySelectorAll('#otpBoxesAuth .otp-box').forEach(b => {
    b.value = '';
    b.style.borderColor = '';
    b.style.background = '';
  });

  const btnNext = document.getElementById('btnNextAuth');
  if (btnNext) { btnNext.disabled = true; btnNext.classList.add('btn-next-locked'); }

  state.otpVerified = false;
  state.isExistingCustomer = false;
  accessToken = null;

  emailEl.focus();
}

/* OTP — move focus between boxes, auto-verify once all 6 are filled */
function moveOtpAuth(input, position) {
  const boxes = document.querySelectorAll('#otpBoxesAuth .otp-box');
  if (input.value.length === 1 && position < boxes.length) boxes[position].focus();
  const code = Array.from(boxes).map(b => b.value).join('');
  if (code.length === 6) verifyAuthOtp();
}

/* OTP — verify against the real backend (POST /auth/otp/verify) */
async function verifyAuthOtp() {
  const boxes = document.querySelectorAll('#otpBoxesAuth .otp-box');
  const code = Array.from(boxes).map(b => b.value).join('');

  document.getElementById('otpErrorAuth')?.classList.add('d-none');
  if (code.length !== 6) return;

  let result;
  try {
    result = await apiFetch('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email: state.email, code }),
    });
  } catch (err) {
    document.getElementById('otpErrorAuth')?.classList.remove('d-none');
    boxes.forEach(b => { b.style.borderColor = '#ef4444'; });
    return;
  }

  accessToken = result.accessToken;

  // Correct — mark boxes green
  boxes.forEach(b => { b.style.borderColor = 'var(--green)'; b.style.background = 'var(--green-bg)'; });
  document.getElementById('otpOkAuth')?.classList.remove('d-none');
  state.otpVerified = true;

  if (result.customer) {
    state.firstName = result.customer.firstName || state.firstName;
    state.lastName  = result.customer.lastName  || state.lastName;
    state.mobile    = result.customer.mobile    || state.mobile;
  }

  document.getElementById('otpGateMsg')?.classList.add('d-none');
  document.getElementById('authVerifiedFields')?.classList.remove('d-none');
  const btn = document.getElementById('btnNextAuth');
  if (btn) { btn.disabled = false; btn.classList.remove('btn-next-locked'); }

  // Existing customers may already have a mobile number saved — prefill it.
  if (state.isExistingCustomer && state.mobile) {
    const mobileEl = document.getElementById('mobile');
    if (mobileEl) mobileEl.value = state.mobile;
  }
}

/* Someone else at the property toggle */
function toggleOtherPerson() {
  const toggle = document.getElementById('otherPersonToggle');
  const fields = document.getElementById('otherPersonFields');
  if (fields) fields.classList.toggle('d-none', !toggle.checked);
}

async function saveStep2() {
  const addrInput = document.getElementById('jobAddress');
  state.address = addrInput?.value.trim() || '';
  if (!state.address) {
    addrInput?.classList.add('field-error');
    addrInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showJobError('job-step2', 'Please enter the job address before continuing.');
    return;
  }
  const sumLoc = document.getElementById('sumLoc');
  if (sumLoc) sumLoc.textContent = state.address;

  if (!state.otpVerified) {
    showJobError('job-step2', 'Please verify your email address with the OTP before continuing.');
    return;
  }

  // New customers need to have filled in their name; existing ones already
  // have it from the DB (populated at verify time).
  if (!state.isExistingCustomer) {
    const fnEl = document.getElementById('firstName');
    const lnEl = document.getElementById('lastName');
    let firstError = null;
    for (const [el, label] of [[fnEl,'First name'],[lnEl,'Last name']]) {
      if (el && !el.value.trim()) {
        el.classList.add('field-error');
        if (!firstError) firstError = label;
      }
    }
    if (firstError) {
      showJobError('job-step2', 'Please fill in ' + firstError + ' before continuing.');
      return;
    }
    state.firstName = getValue('firstName') || '';
    state.lastName  = getValue('lastName')  || '';
  }
  state.mobile = getValue('mobile') || state.mobile || '';

  const toggle = document.getElementById('otherPersonToggle');
  state.otherPerson = toggle ? toggle.checked : false;

  const oName  = document.getElementById('otherName');
  const oPhone = document.getElementById('otherPhone');
  state.otherName  = oName  ? oName.value  : '';
  state.otherPhone = oPhone ? oPhone.value : '';

  state.unitNum  = getValue('unitNum');
  state.gateCode = getValue('gateCode');
  state.parking  = getValue('parking');
  state.notes    = getValue('notes');

  // Persist name/mobile to the customer profile now that we have an access
  // token — best-effort, doesn't block navigation if it fails.
  try {
    await apiFetch('/customers/me', {
      method: 'PATCH',
      body: JSON.stringify({ firstName: state.firstName, lastName: state.lastName, mobile: state.mobile }),
    });
  } catch (err) {
    console.warn('Could not save profile details:', err.message);
  }

  nav('job-step3');
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

/* ============================================================
   JOB STEP 3 – REVIEW
   ============================================================ */
function renderReview() {
  // Job details — real data only. `state.problem` and the old
  // region/city/suburb fields were leftover from an earlier design
  // (a sub-category picker and a dropdown location picker) that no longer
  // exist in the UI, so they always held their hardcoded initial values —
  // showing them made the review page look populated with fake data even
  // when the real fields (category, description, address) were empty.
  const topMatch = state.matchedServices && state.matchedServices[0];
  const serviceLabel = (topMatch && topMatch !== state.category) ? `${state.category} › ${topMatch}` : state.category;
  setText('rvService', serviceLabel || 'Not specified');
  setText('rvDesc', state.description || 'No description provided.');
  setText('rvLoc', state.address ? `📍 ${state.address}` : 'No address provided.');
  setText('rvContact', `📞 ${state.contact}`);

  // Photos — show real uploaded thumbnails (up to 3), "+N" for the rest
  const photosRow = document.getElementById('rvPhotosRow');
  const photosContainer = document.getElementById('rvPhotos');
  if (photosRow && photosContainer) {
    if (state.photos.length) {
      photosRow.style.display = '';
      const visible = state.photos.slice(0, 3);
      const extra = state.photos.length - visible.length;
      photosContainer.innerHTML =
        visible.map(url => `<div class="photo-thumb" style="background-size:cover;background-position:center;background-image:url('${API_BASE}${url}')"></div>`).join('') +
        (extra > 0 ? `<div class="photo-more">+${extra}</div>` : '');
    } else {
      photosRow.style.display = 'none';
      photosContainer.innerHTML = '';
    }
  }

  // Your details
  const name = `${state.firstName || ''} ${state.lastName || ''}`.trim();
  setText('rvName', name || '—');
  setText('rvMobile', state.mobile || '—');
  setText('rvEmail', state.email || '—');
  setText('rvOther', state.otherPerson ? `Yes – ${state.otherName} (${state.otherPhone})` : 'No');

  // The input form groups the address together with unit/gate/parking/notes
  // under one "Access details" section — mirror that here instead of only
  // showing unit/gate/parking/notes and leaving this blank when someone's
  // only filled in the address itself.
  const access = [
    state.address ? `📍 ${state.address}` : '',
    state.unitNum ? `Unit ${state.unitNum}` : '',
    state.gateCode ? `Gate code ${state.gateCode}` : '',
    state.parking || '',
    state.notes || '',
  ].filter(Boolean).join('\n');
  setText('rvAccess', access || 'None provided');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) { el.textContent = val; el.innerHTML = val.replace(/\n/g, '<br>'); }
}

/* ============================================================
   JOB STEP 4 – POST & CONFIRM
   ============================================================ */
async function postJob() {
  const btn = document.querySelector('#job-step3 .post-job-btn');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Posting…';
  }

  try {
    const created = await apiFetch('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        category: state.category,
        problem: state.problem,
        description: state.description,
        region: state.region,
        city: state.city,
        suburb: state.suburb,
        address: state.address,
        unitNum: state.unitNum,
        gateCode: state.gateCode,
        parking: state.parking,
        notes: state.notes,
        urgency: state.urgency,
        contact: state.contact,
        otherPerson: state.otherPerson,
        otherName: state.otherName,
        otherPhone: state.otherPhone,
        otherServices: state.otherServices,
        photos: state.photos,
      }),
    });
    state.jobId = created.id;
    state.matchedServices = created.matchedServices || state.matchedServices;
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    showJobError('job-step3', err.message || 'Could not post your job. Please try again.');
    return;
  }

  // Friendly display code shown to the customer (the real DB id is kept in state.jobId)
  const displayId = 'KF-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*99)+1).padStart(2,'0') + '-' + String(Math.floor(Math.random()*99999)).padStart(5,'0');
  const el = document.getElementById('jobId');
  if (el) el.textContent = displayId;
  nav('job-step4');
}

function renderPosted() {
  const topMatch = state.matchedServices && state.matchedServices[0];
  const serviceLabel = (topMatch && topMatch !== state.category) ? `${state.category} › ${topMatch}` : state.category;
  setText('sumService2', serviceLabel || 'Not specified');
  setText('sumDesc2', state.description || 'No description provided.');
  setText('sumLoc2', state.address || 'No address provided.');
}

/* ============================================================
   FINDING TRADIES ANIMATION
   ============================================================ */
function startFindingAnimation() {
  const items = ['sc1','sc2','sc3','sc4','sc5'];
  // Reset
  items.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('done');
  });

  // Reflect the smart-matched service/keyword in the first checklist line
  const sc1 = document.getElementById('sc1');
  if (sc1) {
    const topMatch = (state.matchedServices && state.matchedServices[0]) || state.category;
    sc1.innerHTML = `<div class="sc-dot done">✓</div> Searching tradies skilled in ${topMatch}...`;
  }

  // Animate
  items.forEach((id, i) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.classList.add('done');
      if (i === items.length - 1) {
        setTimeout(() => nav('top-tradies'), 1200);
      }
    }, 600 + i * 700);
  });
}

/* ============================================================
   TOP TRADIES – reflect smart-matched keywords/services, and
   surface the currently-registered tradie if their profile
   overlaps with what the customer described
   ============================================================ */
function renderTopTradies() {
  const matched = state.matchedServices || [];

  const kwBanner = document.getElementById('match-keywords-banner');
  if (kwBanner) {
    if (matched.length) {
      kwBanner.style.display = 'flex';
      kwBanner.innerHTML = 'Matched based on: ' +
        matched.slice(0, 5).map(m => `<span class="match-tag">${escapeHtml(m)}</span>`).join(' ');
    } else {
      kwBanner.style.display = 'none';
    }
  }

  const found = findMatchingRegisteredTradie(matched);
  const regBanner = document.getElementById('registered-match-banner');
  const list = document.querySelector('.tradie-list');
  // Clear out any previously-injected matched-tradie card before re-adding
  document.getElementById('matched-registered-tradie-card')?.remove();

  if (found && regBanner) {
    const name = `${found.data.firstName || ''} ${found.data.lastName || ''}`.trim() || 'A registered tradie';
    const initials = ((found.data.firstName || '')[0] || '') + ((found.data.lastName || '')[0] || '');
    regBanner.style.display = 'flex';
    regBanner.innerHTML = `🔔 <span><strong>${escapeHtml(name)}</strong> matches this job on ${found.overlap.map(escapeHtml).join(', ')} — notified automatically.</span>`;

    if (list) {
      const card = document.createElement('div');
      card.className = 'tradie-card-item best';
      card.id = 'matched-registered-tradie-card';
      card.innerHTML = `
        <div class="best-badge-wrap"><span class="best-badge">🔔 Notified · Smart match</span></div>
        <div class="tci-main">
          <div class="tci-avatar" style="background:linear-gradient(135deg,#0B6B35,#22C55E)">${escapeHtml(initials.toUpperCase() || 'TR')}</div>
          <div class="tci-info">
            <div class="tci-name-row">
              <span class="tci-name">${escapeHtml(found.data.businessName || name)}</span>
            </div>
            <div class="tci-badges">
              <span class="licensed-pill">✓ ${escapeHtml(found.overlap[0])}</span>
            </div>
            <div class="tci-meta">
              <span>📍 ${escapeHtml(found.data.region || 'Your area')}</span>
              <span class="avail-now">● Matched on: ${found.overlap.map(escapeHtml).join(', ')}</span>
            </div>
          </div>
        </div>
        <div class="tci-actions">
          <button class="btn-outline" onclick="nav('tradie-profile')">View Profile</button>
          <button class="btn-green-sm" onclick="nav('job-responses')">Invite</button>
        </div>`;
      list.insertBefore(card, list.firstChild);
    }
  } else if (regBanner) {
    regBanner.style.display = 'none';
  }
}

/* ============================================================
   TRADIE OTP FLOW (mobile frames)
   ============================================================ */
function sendTradieOtp() {
  nav('tradie-verify-mobile');
}

/* ============================================================
   TRADIE ONBOARDING STEPS
   ============================================================ */
function showTradieStep(step) {
  const map = {
    personal: 'tradie-personal',
    business: 'tradie-business',
    licence:  'tradie-licence',
    services: 'tradie-services',
    areas:    'tradie-areas',
    avail:    'tradie-availability',
    review:   'tradie-review-submit',
    submitted:'tradie-submitted',
  };
  if (map[step]) nav(map[step]);
}

/* ============================================================
   UTILS
   ============================================================ */
// Segmented buttons (Yes/No toggles — both mobile .ph-toggle-row and desktop .seg-toggle)
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.ph-seg-btn');
  if (btn) {
    const group = btn.closest('.ph-toggle-row') || btn.closest('.seg-toggle');
    if (group) {
      group.querySelectorAll('.ph-seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  // Day buttons
  const dayBtn = e.target.closest('.day-btn');
  if (dayBtn) {
    dayBtn.classList.toggle('active');
  }
});

// Init summary on load
document.addEventListener('DOMContentLoaded', function() {
  // Restore page from URL hash on refresh (use replaceState so it doesn't add to history)
  const hash = window.location.hash.slice(1);
  if (hash && document.getElementById(hash)) {
    nav(hash, true);
    history.replaceState({ page: hash }, '', '#' + hash);
  } else {
    history.replaceState({ page: 'home' }, '', '#home');
    startLandingHeaderAutoHide(); // no hash means we're on the default 'home' page; nav() never runs so kick this off directly
  }

  updateSummary();
  updateServicesList();
});

// The landing hero is a fixed 100vh page (overflow: hidden) — it never
// scrolls, so a scroll-triggered hide has nothing to react to there. Instead,
// auto-hide that header a couple seconds after it's shown, and bring it back
// whenever the mouse moves up near the top of the screen.
let _landingHeaderHideTimer = null;
function startLandingHeaderAutoHide() {
  const header = document.querySelector('#home .app-header');
  if (!header) return;
  header.classList.remove('header-hidden');
  clearTimeout(_landingHeaderHideTimer);
  _landingHeaderHideTimer = setTimeout(() => header.classList.add('header-hidden'), 2500);
}
document.addEventListener('mousemove', (e) => {
  const home = document.getElementById('home');
  if (!home || !home.classList.contains('active')) return;
  const header = home.querySelector('.app-header');
  if (!header) return;
  if (e.clientY <= 90) {
    header.classList.remove('header-hidden');
    clearTimeout(_landingHeaderHideTimer);
    _landingHeaderHideTimer = setTimeout(() => header.classList.add('header-hidden'), 2500);
  }
}, { passive: true });

// Other (scrollable) pages: hide the sticky header on scroll down, reveal on
// scroll up or near the top.
(function () {
  let lastY = window.scrollY;
  const HIDE_AFTER = 80;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const header = document.querySelector('.page.active .app-header');
    if (!header || header.closest('#home')) { lastY = y; return; } // landing page handled above
    if (y <= HIDE_AFTER) header.classList.remove('header-hidden');
    else if (y > lastY) header.classList.add('header-hidden');
    else if (y < lastY) header.classList.remove('header-hidden');
    lastY = y;
  }, { passive: true });
})();

// ============================================================
//  TRADIE SERVICES – trade type & dynamic services
// ============================================================
const TRADE_SERVICES_MAP = {
  Plumber:     ['Leak Repairs', 'Hot Water Systems', 'Drain Cleaning', 'Bathroom Renovations', 'Gas Fitting', 'Roof Plumbing', 'Pipe Relining', 'Emergency Plumbing'],
  Electrician: ['Wiring & Rewiring', 'Switchboard Upgrades', 'LED Lighting', 'Solar Installation', 'EV Charging', 'Security Systems', 'Emergency Electrical', 'Heat Pump Installation'],
  Gasfitter:   ['Gas Hot Water Systems', 'Gas Hob & Cooktop Install', 'Gas Line Installation', 'Gas Heater Servicing', 'LPG Bottle Swaps & Setup', 'Gas Safety Checks', 'Gas Fire Installation', 'Emergency Gas Callouts'],
  Drainlayer:  ['Drain Laying & Installation', 'Blocked Drain Clearing', 'Stormwater Drainage', 'Sewer Line Repairs', 'Drain Camera Inspections', 'Septic Tank Connections', 'Soak Hole Installation', 'Drain Relining'],
  'HVAC Technician': ['Heat Pump Installation', 'Air Conditioning Servicing', 'Refrigeration Repairs', 'Ventilation Systems', 'Commercial Refrigeration', 'Ducted Heating & Cooling', 'System Regassing'],
  'Lift Technician': ['Lift Installation', 'Lift Maintenance & Servicing', 'Lift Compliance Checks (WOF)', 'Escalator Servicing', 'Stairlift Installation', 'Emergency Lift Callouts'],
  Scaffolder:  ['Residential Scaffolding', 'Commercial Scaffolding', 'Scaffold Hire & Erection', 'Edge Protection Systems', 'Working at Height Setup', 'Scaffold Inspections'],
  Arborist:    ['Tree Removal', 'Tree Pruning & Trimming', 'Stump Grinding', 'Hazardous Tree Assessment', 'Storm Damage Clean-up', 'Hedge & Canopy Shaping', 'Land Clearing'],
  'Solar Installer': ['Solar Panel Installation', 'Solar Battery Storage', 'Solar System Servicing', 'Grid Connection Setup', 'Solar Monitoring Systems', 'EV Charger + Solar Combos'],
  'Fire Protection Technician': ['Fire Alarm Installation', 'Fire Alarm Servicing & Testing', 'Sprinkler System Maintenance', 'Extinguisher Servicing', 'Emergency Lighting Checks', 'Fire Evacuation System Compliance'],
  Builder:     ['Renovations', 'Extensions', 'New Builds', 'Decking & Fencing', 'Kitchen Fit-Out', 'Bathroom Fit-Out', 'Framing & Cladding', 'Concrete Work'],
  Carpenter:   ['Framing', 'Custom Joinery', 'Doors & Windows Fitting', 'Decking', 'Trim & Moulding', 'Furniture Repairs', 'Timber Flooring Install'],
  Painter:     ['Interior Painting', 'Exterior Painting', 'Wallpapering', 'Roof Painting', 'Spray Painting', 'Commercial Painting', 'Protective Coatings'],
  Gardener:    ['Lawn Mowing', 'Garden Design', 'Tree & Hedge Trimming', 'Irrigation Systems', 'Weed Control', 'Section Clearing', 'Landscaping'],
  Cleaner:     ['House Cleaning', 'End of Tenancy', 'Window Cleaning', 'Carpet Cleaning', 'Commercial Cleaning', 'Move-In / Move-Out'],
  Roofer:      ['Roof Repairs', 'Roof Replacement', 'Spouting & Gutters', 'Roof Painting', 'Skylight Installation', 'Waterproofing'],
  Tiler:       ['Floor Tiling', 'Wall Tiling', 'Bathroom Tiling', 'Kitchen Splashback', 'Outdoor Paving', 'Tile Repairs'],
  Glazier:     ['Window Glass Replacement', 'Shower Glass Installation', 'Mirror Installation', 'Double Glazing', 'Splashback Installation', 'Glass Balustrades'],
  'Flooring Installer': ['Carpet Laying', 'Vinyl & Laminate Flooring', 'Hardwood Flooring', 'Floor Sanding & Polishing', 'Underlay Installation', 'Floor Repairs'],
  Fencer:      ['Timber Fencing', 'Pool Fencing', 'Gate Installation', 'Retaining Walls', 'Chain-Link & Mesh Fencing', 'Fence Repairs'],
  'Cabinet Maker': ['Kitchen Cabinetry', 'Wardrobe & Built-Ins', 'Custom Joinery', 'Bathroom Vanities', 'Benchtop Installation', 'Cabinet Repairs'],
  Other:       ['Handyman Services', 'Odd Jobs', 'Assembly & Installation', 'Other']
};

const TRADE_ICONS = {
  Plumber: '🔧', Electrician: '⚡', Gasfitter: '🔥', Drainlayer: '🕳️',
  'HVAC Technician': '❄️', 'Lift Technician': '🛗', Scaffolder: '🪜',
  Arborist: '🪚', 'Solar Installer': '☀️', 'Fire Protection Technician': '🚒',
  Builder: '🏗️', Carpenter: '🔨', Painter: '🎨', Gardener: '🌿', Cleaner: '🧹', Roofer: '🏠',
  Tiler: '🪟', Glazier: '🪞', 'Flooring Installer': '🪵', Fencer: '🚪', 'Cabinet Maker': '🪛',
  Other: '⚙️'
};

// Whether each trade legally requires a licence, or typically needs
// certification/registration instead. Shown on the Licence step so
// tradies understand what's expected of their specific trade.
const TRADE_LICENCE_INFO = {
  Electrician: { level: 'required', note: 'Registered electrician licence required by law.' },
  Plumber: { level: 'required', note: 'Registered plumber licence required by law.' },
  Gasfitter: { level: 'required', note: 'Registered gasfitter licence required by law.' },
  Drainlayer: { level: 'required', note: 'Registered drainlayer licence required by law.' },
  'HVAC Technician': { level: 'required', note: 'Many practitioners require appropriate registration/licensing depending on the work.' },
  'Lift Technician': { level: 'required', note: 'Registration is usually required for lift/elevator work.' },
  Scaffolder: { level: 'required', note: 'High-risk work certification required.' },
  Arborist: { level: 'recommended', note: 'Often requires qualifications/certifications rather than a government licence.' },
  'Solar Installer': { level: 'recommended', note: 'Usually requires an electrician licence plus solar competency certification.' },
  'Fire Protection Technician': { level: 'recommended', note: 'Often requires industry certification.' },
  Builder: { level: 'recommended', note: 'Licensed Building Practitioner (LBP) status recommended for restricted building work.' },
  Roofer: { level: 'recommended', note: 'No government licence required, but LBP status is recommended for structural roofing work.' },
  Carpenter: { level: 'none', note: 'No government licence required. LBP status recommended if doing restricted building work.' },
  Painter: { level: 'none', note: 'No government licence required.' },
  Gardener: { level: 'none', note: 'No licence required for general gardening.' },
  Cleaner: { level: 'none', note: 'No licence required.' },
  Tiler: { level: 'none', note: 'No government licence required.' },
  Glazier: { level: 'none', note: 'No government licence required.' },
  'Flooring Installer': { level: 'none', note: 'No government licence required.' },
  Fencer: { level: 'none', note: 'No government licence required.' },
  'Cabinet Maker': { level: 'none', note: 'No government licence required.' },
  Other: { level: 'none', note: '' },
};

function getSelectedTrades() {
  return [...document.querySelectorAll('#tradeTypeGrid input[name="tradeType"]:checked')].map(el => el.value);
}

// ============================================================
//  CUSTOM SERVICES – tradie can type in a service that isn't
//  on the predefined list. Kept in a store (not the DOM) so it
//  survives updateServicesList() re-renders when trades change.
// ============================================================
const customServicesByTrade = {}; // { [trade]: [{ id, name, tier, licenceType, licenceNote, uploaded, qualificationDeclared, reviewStatus }] }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
//  CUSTOM TRADES – "Add Trade" tile lets a tradie type in a whole
//  trade that isn't in the predefined grid (e.g. "Pool Builder").
//  Uses the exact same tier-resolution (Upload / Yes-No / none) and
//  Pending Review flow as custom services — just applied to the
//  trade itself rather than one service within a trade.
// ============================================================
const customTrades = []; // [{ id, name, tier, licenceType, licenceNote, uploaded, qualificationDeclared, reviewStatus }]

function toggleAddTradeInput() {
  const row = document.getElementById('addTradeRow');
  if (!row) return;
  const showing = row.style.display !== 'none';
  row.style.display = showing ? 'none' : 'flex';
  if (!showing) document.getElementById('addTradeInput')?.focus();
}

function addCustomTrade() {
  const input = document.getElementById('addTradeInput');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const alreadyExists = customTrades.some(t => t.name.toLowerCase() === name.toLowerCase())
    || Object.keys(TRADE_SERVICES_MAP).some(t => t.toLowerCase() === name.toLowerCase());
  if (alreadyExists) { input.value = ''; return; }

  const licenceInfo = resolveServiceLicence(name);
  const id = 'customtrade-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  customTrades.push({
    id, name,
    tier: licenceInfo.tier, licenceType: licenceInfo.type, licenceNote: licenceInfo.note,
    uploaded: false, qualificationDeclared: null,
    reviewStatus: 'pending',
  });
  input.value = '';
  renderCustomTradeCards();
  updateServicesList();
}

function removeCustomTrade(id) {
  const idx = customTrades.findIndex(t => t.id === id);
  if (idx === -1) return;
  const [removed] = customTrades.splice(idx, 1);
  // Also drop any custom services that were added under this trade's name
  delete customServicesByTrade[removed.name];
  renderCustomTradeCards();
  updateServicesList();
  if (typeof refreshAllTeamMemberTradeGrids === 'function') refreshAllTeamMemberTradeGrids();
}

// Inserts a selectable card for each custom trade right before the
// "Add Trade" tile — checked by default, removable via its own × button.
function renderCustomTradeCards() {
  const grid = document.getElementById('tradeTypeGrid');
  const addTile = document.getElementById('addTradeTile');
  if (!grid || !addTile) return;
  grid.querySelectorAll('.custom-trade-card').forEach(el => el.remove());
  customTrades.forEach(t => {
    const card = document.createElement('label');
    card.className = 'trade-type-card custom-trade-card';
    card.innerHTML = `
      <input type="checkbox" name="tradeType" value="${escapeHtml(t.name)}" checked onchange="updateServicesList()"/>
      <button type="button" class="trade-remove-btn" title="Remove this trade" onclick="event.preventDefault();event.stopPropagation();removeCustomTrade('${t.id}')">×</button>
      <span class="ttc-icon">🔧</span>
      <span>${escapeHtml(t.name)}<span class="custom-tag">Custom</span></span>`;
    grid.insertBefore(card, addTile);
  });
}

function renderCustomServiceCard(trade, c) {
  let tierTag = '';
  if (c.tier === 'required') {
    tierTag = c.uploaded
      ? `<span class="svc-licence-tag approved">✓ Licence uploaded</span>`
      : `<span class="svc-licence-tag">🔒 Licence required</span>`;
  } else if (c.tier === 'recommended') {
    if (c.qualificationDeclared === true) tierTag = `<span class="svc-licence-tag approved">✓ Qualified</span>`;
    else if (c.qualificationDeclared === false) tierTag = `<span class="svc-licence-tag warn">⚠️ Unconfirmed</span>`;
    else tierTag = `<span class="svc-licence-tag">📋 Confirm qualification</span>`;
  }
  // Every typed-in (custom) service goes to the team for review before it's
  // shown live on the tradie's profile — this can't be verified automatically.
  const reviewTag = c.reviewStatus === 'pending'
    ? `<span class="svc-review-tag">🕓 Pending review</span>`
    : '';
  return `
    <label class="svc-check-card svc-custom-card">
      <input type="checkbox" checked/>
      <span>${escapeHtml(c.name)}<span class="custom-tag">Custom</span>${reviewTag}${tierTag}</span>
      <button type="button" class="svc-remove-btn" title="Remove this service" aria-label="Remove ${escapeHtml(c.name)}" onclick="event.preventDefault();event.stopPropagation();removeCustomService('${trade}','${c.id}')">×</button>
    </label>`;
}

// Shown immediately below a newly-added custom service — resolves its
// licence tier right on the spot rather than deferring to the Licence step.
function renderCustomActionCard(trade, c) {
  if (c.tier === 'required') {
    if (c.uploaded) {
      return `<div class="custom-licence-action cla-resolved" data-svc-id="${c.id}">✅ Licence uploaded for "${escapeHtml(c.name)}" — pending review.</div>`;
    }
    return `
      <div class="custom-licence-action" data-svc-id="${c.id}">
        <div class="cla-title">🔒 "${escapeHtml(c.name)}" requires a valid New Zealand licence.</div>
        <p class="cla-sub">Please upload your licence before it can be added to your profile.</p>
        <label class="upload-box-single" style="padding:14px;cursor:pointer">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="handleCustomLicenceUpload('${c.id}', this)"/>
          <div class="ub-icon-svg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#64748B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <div class="ub-title" style="font-size:13px">Upload Licence</div>
          <div class="ub-sub">PDF, JPG or PNG</div>
        </label>
      </div>`;
  }
  if (c.tier === 'recommended') {
    if (c.qualificationDeclared === true) {
      return `<div class="custom-licence-action cla-resolved" data-svc-id="${c.id}">✅ You confirmed you hold ${c.licenceType ? 'a ' + escapeHtml(c.licenceType) : 'a qualification/certification'} for "${escapeHtml(c.name)}".</div>`;
    }
    if (c.qualificationDeclared === false) {
      return `<div class="custom-licence-action cla-warn" data-svc-id="${c.id}">⚠️ You indicated you don't currently hold a qualification for "${escapeHtml(c.name)}" — this will be flagged for review before it shows on your profile.</div>`;
    }
    return `
      <div class="custom-licence-action" data-svc-id="${c.id}">
        <div class="cla-title">📋 Do you hold ${c.licenceType ? 'a ' + escapeHtml(c.licenceType) : 'an appropriate qualification/certification'} for "${escapeHtml(c.name)}"?</div>
        <div class="seg-toggle" style="margin-top:8px">
          <button type="button" class="ph-seg-btn" onclick="declareCustomQualification('${c.id}', true)">Yes</button>
          <button type="button" class="ph-seg-btn" onclick="declareCustomQualification('${c.id}', false)">No</button>
        </div>
      </div>`;
  }
  return `<div class="custom-licence-action cla-none" data-svc-id="${c.id}">✅ No licence required for "${escapeHtml(c.name)}".</div>`;
}

// Confirmation note shown under the "add custom service" row for a trade,
// listing whichever typed-in services are still awaiting team review.
function renderPendingReviewNote(trade) {
  const pending = (customServicesByTrade[trade] || []).filter(c => c.reviewStatus === 'pending');
  if (!pending.length) return '';
  const names = pending.map(c => `"${escapeHtml(c.name)}"`).join(', ');
  const plural = pending.length > 1;
  return `<div class="custom-review-note">🕓 You've added ${names}. Our team will review ${plural ? 'these' : 'this'} and add ${plural ? 'them' : 'it'} to your profile soon!</div>`;
}

function removeCustomService(trade, id) {
  if (!customServicesByTrade[trade]) return;
  customServicesByTrade[trade] = customServicesByTrade[trade].filter(c => c.id !== id);
  updateServicesList();
  renderLicenceSections(getSelectedTrades());
}

function addCustomService(trade) {
  const input = document.getElementById('custom-svc-input-' + trade);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const licenceInfo = resolveServiceLicence(name);
  const id = 'custom-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  if (!customServicesByTrade[trade]) customServicesByTrade[trade] = [];
  // Custom services aren't auto-approved — they're queued for the team to
  // review (catches anything meaningless, mistyped, or not a real service),
  // and the licence tier is resolved immediately (upload / qualification
  // question / no licence needed) rather than deferred to the Licence step.
  customServicesByTrade[trade].push({
    id, name,
    tier: licenceInfo.tier, licenceType: licenceInfo.type, licenceNote: licenceInfo.note,
    uploaded: false, qualificationDeclared: null,
    reviewStatus: 'pending',
  });
  input.value = '';
  updateServicesList();
  renderLicenceSections(getSelectedTrades());
}

function declareCustomQualification(id, value) {
  const svc = findCustomService(id);
  if (svc) svc.qualificationDeclared = value;
  updateServicesList();
  renderLicenceSections(getSelectedTrades());
}

function findCustomService(id) {
  for (const trade in customServicesByTrade) {
    const found = (customServicesByTrade[trade] || []).find(c => c.id === id);
    if (found) return found;
  }
  const customTrade = customTrades.find(t => t.id === id);
  if (customTrade) return customTrade;
  return null;
}

function handleCustomLicenceUpload(id, input) {
  if (!input.files || !input.files.length) return;
  const svc = findCustomService(id);
  if (svc) svc.uploaded = true;
  renderLicenceSections(getSelectedTrades());
  updateServicesList();
}

function updateServicesList() {
  const trades = getSelectedTrades();
  const container = document.getElementById('servicesByTrade');
  if (!container) return;
  if (trades.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:14px;margin-bottom:20px">Select one or more trade types above to see relevant services.</p>';
    return;
  }
  container.innerHTML = trades.map(trade => {
    const customList = customServicesByTrade[trade] || [];
    const predefined = TRADE_SERVICES_MAP[trade]; // undefined for a custom (typed-in) trade
    const customTradeInfo = customTrades.find(t => t.name === trade);
    const icon = TRADE_ICONS[trade] || '🔧';

    const tradeHeader = customTradeInfo ? `
      <div class="custom-review-note" style="margin-top:-2px">🕓 "${escapeHtml(trade)}" is a custom trade you added. Our team will review it and add it to your profile soon!</div>
      ${renderCustomActionCard(trade, customTradeInfo)}
    ` : '';

    return `
    <div class="services-trade-section" data-trade="${trade}">
      <div class="sts-title">${icon} ${trade} Services</div>
      ${tradeHeader}
      <div class="services-check-grid">
        ${(predefined || []).map((svc, i) => `
          <label class="svc-check-card">
            <input type="checkbox" ${i < 4 ? 'checked' : ''}/>
            <span>${svc}</span>
          </label>`).join('')}
        ${customList.map(c => renderCustomServiceCard(trade, c)).join('')}
      </div>
      <div class="custom-svc-row">
        <input type="text" class="form-input custom-svc-input" id="custom-svc-input-${trade}"
          placeholder="${predefined ? "Don't see your service? Type it here..." : 'Add specific services you offer under this trade...'}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomService('${trade}');}"/>
        <button type="button" class="btn-outline custom-svc-add-btn" onclick="addCustomService('${trade}')">+ Add</button>
      </div>
      ${customList.map(c => renderCustomActionCard(trade, c)).join('')}
      ${renderPendingReviewNote(trade)}
    </div>`;
  }).join('');
  // Also update licence sections if already rendered
  renderLicenceSections(trades);
}

// Review & Submit page: surface any custom services still waiting on a
// licence upload, and keep the services-count summary honest.
function renderReviewSubmit() {
  captureStepData('services');
  captureStepData('business');

  const bizSummary = document.getElementById('rvBusinessSummary');
  if (bizSummary) {
    if (!tradieProfile.businessName && !tradieProfile.businessType) {
      bizSummary.textContent = 'Not set yet';
    } else {
      const lines = [
        escapeHtml(tradieProfile.businessName || '(no business name)'),
        escapeHtml(tradieProfile.businessType || ''),
      ];
      if (tradieProfile.hasTeam && tradieProfile.teamMembers.length) {
        const names = tradieProfile.teamMembers.map(m => `${escapeHtml(m.name)} (${escapeHtml((m.trades || []).join(', ') || 'no trade selected')})`).join(', ');
        lines.push(`${tradieProfile.teamMembers.length} team member${tradieProfile.teamMembers.length === 1 ? '' : 's'}: ${names}`);
      } else if (tradieProfile.hasTeam) {
        lines.push('Team selected — no members added yet');
      }
      bizSummary.innerHTML = lines.filter(Boolean).join('<br>');
    }
  }

  const allCustom = Object.entries(customServicesByTrade).flatMap(([trade, list]) => list.map(c => ({ ...c, trade })));
  const pending = allCustom.filter(c =>
    (c.tier === 'required' && !c.uploaded) || (c.tier === 'recommended' && c.qualificationDeclared === null)
  );
  const banner = document.getElementById('pending-licence-banner');
  if (banner) {
    if (pending.length) {
      banner.style.display = 'block';
      banner.innerHTML = `⚠️ <strong>${pending.length} custom service${pending.length > 1 ? 's' : ''}</strong> ` +
        `still need${pending.length > 1 ? '' : 's'} a licence/qualification check before ${pending.length > 1 ? 'they' : 'it'} ` +
        `will show as approved on your profile: ${pending.map(p => escapeHtml(p.name)).join(', ')}. ` +
        `<a onclick="nav('tradie-services')" style="cursor:pointer;color:var(--green);font-weight:700">Resolve now →</a>`;
    } else {
      banner.style.display = 'none';
    }
  }

  // Every typed-in custom service (licence-gated or not) goes to the team
  // for review before it shows live on the tradie's profile.
  const pendingReview = allCustom.filter(c => c.reviewStatus === 'pending');
  const reviewBanner = document.getElementById('pending-review-banner');
  if (reviewBanner) {
    if (pendingReview.length) {
      reviewBanner.style.display = 'block';
      reviewBanner.innerHTML = `🕓 You've added <strong>${pendingReview.length} custom service${pendingReview.length > 1 ? 's' : ''}</strong> ` +
        `not on our standard list: ${pendingReview.map(p => escapeHtml(p.name)).join(', ')}. ` +
        `Our team will review ${pendingReview.length > 1 ? 'them' : 'it'} and add ${pendingReview.length > 1 ? 'them' : 'it'} to your profile soon!`;
    } else {
      reviewBanner.style.display = 'none';
    }
  }

  const total = tradieProfile.services.length;
  const summary = document.getElementById('rvServicesSummary');
  if (summary && total > 0) summary.textContent = `${total} service${total === 1 ? '' : 's'} selected`;
}

function saveServicesAndContinue() {
  const trades = getSelectedTrades();
  renderLicenceSections(trades);
  nav('tradie-personal');
}

// ============================================================
//  TRADIE LICENCE – dynamic sections per selected trade
// ============================================================
function renderLicenceSections(trades) {
  const container = document.getElementById('licence-sections');
  if (!container) return;
  if (!trades || trades.length === 0) trades = getSelectedTrades();
  if (trades.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:14px;margin-bottom:20px">No trade types selected. <a onclick="nav(\'tradie-services\')" style="color:var(--green);cursor:pointer">Go back to Services</a> to select your trade types first.</p>';
    return;
  }
  // Custom (typed-in) trades don't get the standard licence-number/expiry
  // form — their tier status is folded into the recap below instead.
  captureStepData('business'); // keep hasTeam/teamMembers fresh even if the Business step hasn't been "saved" yet this visit
  captureStepData('personal'); // need the tradie's own first name for the solo-licence labels below
  const useTeamLicensing = tradieProfile.businessType !== 'Sole Trader' && tradieProfile.hasTeam && tradieProfile.teamMembers.length > 0;
  const ownerFirstName = tradieProfile.firstName || signupData.firstName || '';

  function licenceSectionHtml(trade, titleLabel) {
    const info = TRADE_LICENCE_INFO[trade];
    const badge = info && info.level !== 'none' ? `
      <div class="trade-licence-requirement ${info.level === 'required' ? 'req-required' : 'req-recommended'}">
        ${info.level === 'required' ? '✅ Licence required' : '⚠️ Certification recommended'} — ${escapeHtml(info.note)}
      </div>` : '';
    return `
    <div class="licence-section">
      <div class="lic-section-title">${TRADE_ICONS[trade] || '🛠️'} ${escapeHtml(titleLabel)} Licence</div>
      ${badge}
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label">Licence number</label>
          <div class="input-icon-wrap"><span class="inp-icon">📋</span><input class="form-input" placeholder="e.g. PLB123456"/></div>
        </div>
        <div class="field-group">
          <label class="field-label">Licence expiry date</label>
          <div class="input-icon-wrap"><span class="inp-icon">📅</span><input class="form-input" placeholder="DD / MM / YYYY" type="text" maxlength="14" oninput="formatDOB(this)" onblur="validateDOB(this)"/></div>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Upload ${escapeHtml(titleLabel)} licence document</label>
        <div class="upload-box-single" style="padding:14px">
          <div class="ub-icon-svg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#64748B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <div class="ub-title" style="font-size:13px">Upload ${escapeHtml(titleLabel)} licence</div>
          <div class="ub-sub">PDF, JPG or PNG</div>
        </div>
      </div>
    </div>`;
  }

  let standardSections;
  if (useTeamLicensing) {
    // A business with staff on the roster: one licence per (member, trade)
    // pair — a person can hold several trades (2 plumbers + 1 electrician
    // means 3 licence uploads), but they're still listed once in the roster.
    const teamNote = `<p class="section-hint" style="margin:0 0 16px">
      This business has a team — we need a licence for each team member's trade individually, not just one for the business.
    </p>`;
    const sections = tradieProfile.teamMembers.flatMap(m =>
      (m.trades && m.trades.length ? m.trades : []).map(trade => licenceSectionHtml(trade, `${m.name} — ${trade}`))
    );
    standardSections = sections.length
      ? teamNote + sections.join('')
      : `<p style="color:#94a3b8;font-size:14px;margin-bottom:20px">Add trades for each team member on the Business step to see their licence requirements here.</p>`;
  } else {
    // Sole trader (or a business with no roster yet): licence is tied to the
    // tradie themself, so label it with their own first name the same way
    // team licences are labeled with the staff member's name.
    standardSections = trades.filter(trade => TRADE_SERVICES_MAP[trade])
      .map(trade => licenceSectionHtml(trade, ownerFirstName ? `${ownerFirstName} — ${trade}` : trade))
      .join('');
  }

  // Custom services AND custom trades the tradie typed in on the Services
  // step — the actual upload/qualification-question interaction happens
  // right there, inline. This is just a status recap so it's visible from
  // the Licence step too.
  const allCustomFlagged = [
    ...Object.entries(customServicesByTrade).flatMap(([trade, list]) => list.filter(c => c.tier !== 'none').map(c => ({ ...c, trade }))),
    ...customTrades.filter(t => trades.includes(t.name) && t.tier !== 'none').map(t => ({ ...t, trade: t.name })),
  ];

  const needsAction = allCustomFlagged.filter(c =>
    (c.tier === 'required' && !c.uploaded) || (c.tier === 'recommended' && c.qualificationDeclared === null)
  );
  const resolved = allCustomFlagged.filter(c => !needsAction.includes(c));

  const customSection = allCustomFlagged.length ? `
    <div class="licence-section custom-licence-section">
      <div class="lic-section-title">⚠️ Custom Trades &amp; Services You Added</div>
      ${needsAction.length ? `
        <p style="font-size:13px;color:#92400E;margin-bottom:8px">
          <strong>${needsAction.length}</strong> still need${needsAction.length > 1 ? '' : 's'} a licence/qualification check:
          ${needsAction.map(c => escapeHtml(c.name)).join(', ')}.
          <a onclick="nav('tradie-services')" style="cursor:pointer;color:var(--green);font-weight:700">Go back to Services →</a>
        </p>` : ''}
      ${resolved.length ? `<p style="font-size:13px;color:var(--green-mid)">✅ Resolved: ${resolved.map(c => escapeHtml(c.name)).join(', ')}</p>` : ''}
    </div>` : '';

  container.innerHTML = standardSections + customSection;
}

