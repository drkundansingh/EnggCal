import * as units from './calculators/units.js';
import * as tx from './calculators/transmitter.js';
import * as dp from './calculators/dpLevel.js';
import * as orf from './calculators/orifice.js';
import * as cv from './calculators/controlValve.js';
import * as ipc from './calculators/ipConverter.js';
import * as rtd from './calculators/rtd.js';
import * as tc from './calculators/thermocouple.js';
import * as pid from './calculators/pid.js';
import * as tp from './calculators/thermalPlant.js';
import * as tpa from './calculators/thermalPlantAdvanced.js';
import * as trip from './calculators/tripProtection.js';
import * as flow from './calculators/flowEngine.js';
import * as store from './storage.js';
import * as lu from './calculators/loopUncertainty.js';
import * as cl from './calculators/controlLoops.js';
import * as ec from './calculators/electricalCommon.js';
import * as sc from './calculators/shortCircuit.js';
import * as idmt from './calculators/idmt.js';
import * as ctEng from './calculators/ctEngine.js';
import * as tfProt from './calculators/transformerProtection.js';
import * as motProt from './calculators/motorProtection.js';
import * as lsig from './calculators/lsigEngine.js';
import * as coord from './calculators/coordination.js';
import * as ed from './calculators/electricalDesign.js';
import { exportCalculationPDF } from './pdfExport.js';

const app = document.getElementById('content');
const navRoot = document.getElementById('nav-root');
let FORMULAS = [];

fetch('./data/formulaLibrary.json').then((r) => r.json()).then((data) => { FORMULAS = data; });

// ---------- Small DOM helpers ----------
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  // A template with multiple top-level siblings would silently lose every
  // element after the first if we just returned firstElementChild — this
  // has caused real bugs before. Auto-wrap in that case; single-root
  // templates (the common case) are returned exactly as before.
  if (t.content.children.length > 1) {
    const wrapper = document.createElement('div');
    wrapper.append(...t.content.childNodes);
    return wrapper;
  }
  return t.content.firstElementChild;
}
function fmt(v, dp = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  return Number(v.toFixed(dp)).toLocaleString(undefined, { maximumFractionDigits: dp });
}
function badgeFor(value, { low, normalLow, normalHigh, high }) {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  if (low !== undefined && value < low) return '<span class="badge out">OUT OF RANGE — LOW</span>';
  if (high !== undefined && value > high) return '<span class="badge out">OUT OF RANGE — HIGH</span>';
  if (normalLow !== undefined && value < normalLow) return '<span class="badge low">LOW</span>';
  if (normalHigh !== undefined && value > normalHigh) return '<span class="badge high">HIGH</span>';
  return '<span class="badge normal">NORMAL</span>';
}
function resultRow(k, v) {
  return `<div class="result-item"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}
function disclaimerHTML() {
  return `<div class="disclaimer">This application is intended for engineering education, preliminary calculations, estimation, and reference purposes. Results should be verified against approved engineering standards, manufacturer data, plant design documents, calibrated instruments, and qualified engineering personnel before being used for operational, safety, or design decisions.</div>`;
}
async function saveAndToast(calculatorId, name, inputs, result, assumptions = null) {
  await store.saveCalculation({ calculatorId, name, inputs, result, assumptions });
  toast('Saved to calculation history');
}
function toast(msg) {
  const t = h(`<div style="position:fixed;bottom:20px;right:20px;background:var(--bg-panel);border:1px solid var(--amber);color:var(--text);padding:10px 16px;border-radius:6px;font-size:.85rem;box-shadow:var(--shadow);z-index:50;">${msg}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- Nav / routing ----------
const NAV = [
  { group: 'Overview', items: [{ id: '', label: 'Dashboard', icon: '▣' }] },
  {
    group: 'Power Plant', items: [
      { id: 'thermal-plant', label: 'Thermal Plant Estimator', icon: '⚡' },
      { id: 'protection', label: 'Turbine & Boiler Protection', icon: '🛡' },
      { id: 'control-loops', label: 'Control Loops', icon: '↻' },
    ]
  },
  {
    group: 'Instrumentation', items: [
      { id: 'dp-flow-wizard', label: 'DP → Flow Wizard', icon: '🧭' },
      { id: 'transmitter', label: '4–20 mA Transmitter', icon: '↯' },
      { id: 'dp-level', label: 'DP & Level', icon: '≈' },
      { id: 'orifice', label: 'Orifice Plate', icon: '◎' },
      { id: 'control-valve', label: 'Control Valve Sizing', icon: '⏛' },
      { id: 'ip-converter', label: 'I/P Converter', icon: '⇄' },
      { id: 'rtd', label: 'RTD', icon: 'Ω' },
      { id: 'thermocouple', label: 'Thermocouple', icon: 'μV' },
      { id: 'pid', label: 'PID Controller', icon: '∫' },
      { id: 'loop-uncertainty', label: 'Loop Uncertainty', icon: '±' },
      { id: 'cavitation', label: 'Valve Cavitation', icon: '◌' },
    ]
  },
  {
    group: 'Electrical', items: [
      { id: 'short-circuit', label: 'Short Circuit / Fault', icon: '⚡' },
      { id: 'idmt', label: 'IDMT Relay Curves', icon: '⌒' },
      { id: 'ct-sizing', label: 'CT Sizing & Burden', icon: '⧖' },
      { id: 'transformer-prot', label: 'Transformer Protection', icon: '⧉' },
      { id: 'motor-prot', label: 'Motor Protection', icon: '⟳' },
      { id: 'lsig', label: 'LSIG Breaker Settings', icon: '⌶' },
      { id: 'coordination', label: 'Relay Coordination', icon: '⇅' },
      { id: 'cable-sizing', label: 'Cable Sizing & Volt Drop', icon: '≡' },
      { id: 'cable-withstand', label: 'Short-Circuit Withstand', icon: '⚡' },
      { id: 'motor-start', label: 'Motor Starting Dip', icon: '↓' },
      { id: 'pf-correction', label: 'Power Factor Correction', icon: '≅' },
      { id: 'battery-sizing', label: 'Battery / DC Sizing', icon: '▤' },
      { id: 'tx-loading', label: 'Transformer Loading', icon: '◱' },
    ],
  },
  {
    group: 'Reference', items: [
      { id: 'converter', label: 'Unit Converter', icon: '⇌' },
      { id: 'formula-library', label: 'Formula Library', icon: '𝑓' },
      { id: 'history', label: 'Calculation History', icon: '🕘' },
      { id: 'support', label: 'Support the Project', icon: '❤' },
      { id: 'reviews', label: 'Reviews & Ratings', icon: '★' },
    ]
  },
];

function renderNav(active) {
  navRoot.innerHTML = '';
  for (const group of NAV) {
    const visibleItems = group.items.filter((item) => adminMode || contentVisibility[item.id] !== false);
    if (!visibleItems.length) continue;
    const g = h(`<div class="nav-group"><div class="nav-label">${group.group}</div></div>`);
    for (const item of visibleItems) {
      const hidden = contentVisibility[item.id] === false;
      const a = h(`<div class="nav-item ${item.id === active ? 'active' : ''}" role="link" tabindex="0">
        <span class="ic">${item.icon}</span>${item.label}${adminMode && hidden ? ' <span class="badge out" style="margin-left:6px;">hidden</span>' : ''}
      </div>`);
      a.addEventListener('click', () => navigate(item.id));
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(item.id); } });
      g.appendChild(a);
    }
    navRoot.appendChild(g);
  }
  if (adminMode) {
    const g = h('<div class="nav-group"><div class="nav-label">Admin</div></div>');
    const a = h(`<div class="nav-item ${active === 'admin' ? 'active' : ''}" role="link" tabindex="0"><span class="ic">\u2699</span>Admin Panel</div>`);
    a.addEventListener('click', () => navigate('admin'));
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('admin'); } });
    g.appendChild(a);
    navRoot.appendChild(g);
  }
}

// ---------- Content visibility (admin-controlled) ----------
// Static site, no backend: this config is a JSON file shipped with the
// site. It genuinely filters the nav for every real visitor (since it's
// baked into the deployed files everyone's browser loads) — but changing
// it here only affects THIS browser's session until the updated file is
// committed and pushed to the live site. See the Admin Panel for details.
let contentVisibility = {};
async function loadContentVisibility() {
  try {
    const res = await fetch('./data/content-visibility.json');
    if (!res.ok) return;
    const data = await res.json();
    contentVisibility = data.items || {};
  } catch (e) {
    // Missing/unreachable (e.g. the single-file bundle, or file:// access) —
    // fall back to "everything visible", the previous behavior.
  }
}

// Admin gate — a LOCAL, soft deterrent only. This is client-side JavaScript
// with no server to verify against, so it cannot be real security: anyone
// with browser dev tools can see exactly how this check works and bypass
// it. It exists to keep the admin panel out of casual visitors' way, not
// to protect sensitive data — never put anything genuinely sensitive
// behind this gate.
let adminMode = false;
const ADMIN_PASSWORD_HASH_PLACEHOLDER = '494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be'; // sha256("changeme123") — CHANGE THIS before publishing
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function attemptAdminLogin() {
  const pw = prompt('Admin password (this is a local, soft gate only — see Admin Panel for details):');
  if (pw === null) return;
  const hash = await sha256Hex(pw);
  if (hash === ADMIN_PASSWORD_HASH_PLACEHOLDER) {
    adminMode = true;
    toast('Admin mode on');
    renderNav(currentRoute);
    navigate('admin');
  } else {
    toast('Incorrect password');
  }
}

const ROUTES = {
  '': pageDashboard,
  'thermal-plant': pageThermalPlant,
  'protection': pageProtection,
  'control-loops': pageControlLoops,
  'short-circuit': pageShortCircuit,
  'idmt': pageIdmt,
  'ct-sizing': pageCtSizing,
  'transformer-prot': pageTransformerProt,
  'motor-prot': pageMotorProt,
  'lsig': pageLsig,
  'coordination': pageCoordination,
  'cable-sizing': pageCableSizing,
  'cable-withstand': pageCableWithstand,
  'motor-start': pageMotorStart,
  'pf-correction': pagePfCorrection,
  'battery-sizing': pageBatterySizing,
  'tx-loading': pageTxLoading,
  'dp-flow-wizard': pageDPFlowWizard,
  'converter': pageConverter,
  'transmitter': pageTransmitter,
  'dp-level': pageDpLevel,
  'orifice': pageOrifice,
  'control-valve': pageControlValve,
  'ip-converter': pageIpConverter,
  'rtd': pageRtd,
  'thermocouple': pageThermocouple,
  'pid': pagePid,
  'loop-uncertainty': pageLoopUncertainty,
  'cavitation': pageCavitation,
  'formula-library': pageFormulaLibrary,
  'history': pageHistory,
  'support': pageSupport,
  'reviews': pageReviews,
  'admin': pageAdmin,
};

// NOTE: navigation is driven entirely by JS state (`currentRoute`), not by
// real <a href> links or window.location.hash. In a sandboxed preview iframe,
// anchor-tag navigation and hash changes can be intercepted by the host page
// as if they were external links; plain click handlers avoid that entirely
// and work identically when this app is served on its own domain.
let currentRoute = '';
function navigate(route) {
  currentRoute = ROUTES[route] ? route : '';
  render();
  closeMobileMenu();
}
function render() {
  renderNav(currentRoute);
  app.innerHTML = '';
  (ROUTES[currentRoute] || pageDashboard)();
  app.scrollTop = 0;
}

// ---------- Mobile sidebar drawer ----------
const sidebarEl = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const menuToggle = document.getElementById('menuToggle');
function openMobileMenu() {
  sidebarEl.classList.add('open');
  sidebarBackdrop.classList.add('open');
}
function closeMobileMenu() {
  sidebarEl.classList.remove('open');
  sidebarBackdrop.classList.remove('open');
}
if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    sidebarEl.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
  });
}
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileMenu(); });

// ---------- Dashboard ----------
function pageDashboard() {
  const cards = [
    ['thermal-plant', '⚡', 'Thermal Power Plant', 'MW ⇄ fuel ⇄ steam performance estimator, 0–1000 MW', 'free'],
    ['transmitter', '↯', '4–20 mA Calculator', 'Signal ⇄ % ⇄ engineering value scaling', 'free'],
    ['orifice', '◎', 'Orifice Plate', 'Flow, bore sizing, beta ratio, Reynolds number', 'free'],
    ['control-valve', '⏛', 'Control Valve Sizing', 'Cv/Kv for liquid, gas, and steam service', 'free'],
    ['dp-level', '≈', 'DP & Level', 'Hydrostatic, wet-leg, interface level, DP-flow', 'free'],
    ['ip-converter', '⇄', 'I/P Converter', '4–20 mA ⇄ 3–15 psi and custom ranges', 'free'],
    ['rtd', 'Ω', 'RTD Calculator', 'Pt100 / Pt1000 / Ni100 / Cu100, IEC 60751', 'free'],
    ['thermocouple', 'μV', 'Thermocouple', 'Type J/K/T/E/N/R/S/B with CJC', 'free'],
    ['pid', '∫', 'PID Controller', 'P/I/D terms + Ziegler-Nichols, Cohen-Coon, IMC', 'free'],
    ['converter', '⇌', 'Unit Converter', 'Pressure, temperature, flow, length, mass, power', 'free'],
    ['formula-library', '𝑓', 'Formula Library', 'Searchable reference formulas by discipline', 'free'],
    ['history', '🕘', 'Calculation History', 'Saved calculations, export to PDF', 'free'],
  ];
  app.appendChild(h(`
    <div class="page-head">
      <div class="eyebrow">Engineering Calculator Hub</div>
      <h1>Plant, instrumentation & process calculations — in one place</h1>
      <p class="lead">Modular calculators built on transparent, unit-consistent engineering equations. Every estimate shows its formula and assumptions — nothing is a hardcoded lookup.</p>
    </div>
  `));
  const grid = h('<div class="grid cols-4"></div>');
  for (const [id, icon, title, desc, tier] of cards) {
    const card = h(`
      <div class="card hover-link" role="link" tabindex="0" style="text-decoration:none;color:inherit;">
        <span class="tag ${tier}">${tier}</span>
        <div class="card-icon">${icon}</div>
        <h4>${title}</h4>
        <p>${desc}</p>
      </div>
    `);
    card.addEventListener('click', () => navigate(id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(id); } });
    grid.appendChild(card);
  }
  app.appendChild(grid);
  app.appendChild(h(`<div style="margin-top:22px;">${disclaimerHTML()}</div>`));
}

// ---------- Thermal Power Plant ----------
function pageThermalPlant() {
  app.appendChild(h(`
    <div class="page-head">
      <div class="eyebrow">Power Plant</div>
      <h1>Thermal Power Plant Estimator</h1>
      <p class="lead">Estimates for units from 25 MW to 1000 MW. Every result is derived from the assumptions shown — override them with actual design data for site-specific accuracy.</p>
    </div>
  `));

  const tabs = h(`<div class="tabs">
    <div class="tab active" data-mode="mw">Mode 1: MW → Parameters</div>
    <div class="tab" data-mode="fuel">Mode 2: Fuel → Generation</div>
    <div class="tab" data-mode="advanced">Mode 3: Flexible Estimator (partial inputs)</div>
    <div class="tab" data-mode="flow">Mode 4: Flow Calculator</div>
  </div>`);
  app.appendChild(tabs);

  const layout = h('<div class="calc-layout"></div>');
  const inputPanel = h('<div class="card"></div>');
  const resultPanel = h('<div class="card"></div>');
  layout.append(inputPanel, resultPanel);
  app.appendChild(layout);

  let mode = 'mw';
  tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    mode = t.dataset.mode;
    renderInputs();
  }));

  function renderInputs() {
    inputPanel.innerHTML = '';
    resultPanel.innerHTML = '<div class="empty-state">Enter inputs and calculate to see results.</div>';
    layout.style.gridTemplateColumns = '';
    inputPanel.style.display = '';
    if (mode === 'mw') renderMwInputs();
    else if (mode === 'fuel') renderFuelInputs();
    else if (mode === 'advanced') renderAdvancedInputs();
    else renderFlowCalculator();
  }

  function renderMwInputs() {
    const a0 = tp.defaultAssumptions('subcritical');
    inputPanel.innerHTML = `
      <div class="panel-title">Inputs</div>
      <div class="field"><label>Plant type</label>
        <select id="plantType">
          <option value="subcritical">Subcritical</option>
          <option value="supercritical">Supercritical</option>
          <option value="ultra-supercritical">Ultra-supercritical</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="field"><label>Unit size (typical) MW</label>
        <select id="unitSizePick">
          <option value="">Custom / enter below</option>
          ${tp.UNIT_SIZES_MW.map((s) => `<option value="${s}">${s} MW</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Generated MW (gross)</label><input type="number" id="grossMW" value="210" min="0" max="1000" step="1"></div>
      <h3 style="margin-top:18px;">Assumptions (editable)</h3>
      <div class="field"><label>Boiler efficiency (%)</label><input type="number" id="boilerEff" value="${a0.boilerEfficiencyPct}" step="0.1"></div>
      <div class="field"><label>Turbine cycle efficiency (%)</label><input type="number" id="turbineEff" value="${a0.turbineEfficiencyPct}" step="0.1"></div>
      <div class="field"><label>Generator efficiency (%)</label><input type="number" id="genEff" value="${a0.generatorEfficiencyPct}" step="0.1"></div>
      <div class="field"><label>Auxiliary power (%)</label><input type="number" id="auxPct" value="${a0.auxPowerPct}" step="0.1"></div>
      <div class="field"><label>Fuel GCV (kcal/kg)</label><input type="number" id="gcv" value="${a0.fuelGcvKcalKg}" step="10"></div>
      <div class="field"><label>Fuel type</label>
        <select id="fuelType"><option value="coal">Coal</option><option value="oil">Oil</option><option value="gas">Gas</option></select>
      </div>
      <div class="field"><label>Main steam pressure (bar)</label><input type="number" id="msp" value="${a0.mainSteamPressureBar}" step="1"></div>
      <div class="field"><label>Main steam temperature (°C)</label><input type="number" id="mst" value="${a0.mainSteamTempC}" step="1"></div>
      <div class="field"><label>Reheat temperature (°C)</label><input type="number" id="rht" value="${a0.reheatTempC}" step="1"></div>
      <div class="field"><label>Condenser pressure (kPa)</label><input type="number" id="cndp" value="${a0.condenserPressureKPa}" step="0.5"></div>
      <div class="field"><label>Feedwater temperature (°C)</label><input type="number" id="fwt" value="${a0.feedwaterTempC}" step="1"></div>
      <div class="btn-row"><button class="btn" id="calcBtn">Calculate</button></div>
    `;
    const plantTypeSel = inputPanel.querySelector('#plantType');
    plantTypeSel.addEventListener('change', () => {
      const a = tp.defaultAssumptions(plantTypeSel.value);
      inputPanel.querySelector('#boilerEff').value = a.boilerEfficiencyPct;
      inputPanel.querySelector('#turbineEff').value = a.turbineEfficiencyPct;
      inputPanel.querySelector('#genEff').value = a.generatorEfficiencyPct;
      inputPanel.querySelector('#auxPct').value = a.auxPowerPct;
      inputPanel.querySelector('#gcv').value = a.fuelGcvKcalKg;
      inputPanel.querySelector('#msp').value = a.mainSteamPressureBar;
      inputPanel.querySelector('#mst').value = a.mainSteamTempC;
      inputPanel.querySelector('#rht').value = a.reheatTempC;
      inputPanel.querySelector('#cndp').value = a.condenserPressureKPa;
      inputPanel.querySelector('#fwt').value = a.feedwaterTempC;
    });
    inputPanel.querySelector('#unitSizePick').addEventListener('change', (e) => {
      if (e.target.value) inputPanel.querySelector('#grossMW').value = e.target.value;
    });
    inputPanel.querySelector('#calcBtn').addEventListener('click', () => {
      const assumptions = {
        boilerEfficiencyPct: +inputPanel.querySelector('#boilerEff').value,
        turbineEfficiencyPct: +inputPanel.querySelector('#turbineEff').value,
        generatorEfficiencyPct: +inputPanel.querySelector('#genEff').value,
        auxPowerPct: +inputPanel.querySelector('#auxPct').value,
        fuelGcvKcalKg: +inputPanel.querySelector('#gcv').value,
        fuelType: inputPanel.querySelector('#fuelType').value,
        mainSteamPressureBar: +inputPanel.querySelector('#msp').value,
        mainSteamTempC: +inputPanel.querySelector('#mst').value,
        reheatTempC: +inputPanel.querySelector('#rht').value,
        condenserPressureKPa: +inputPanel.querySelector('#cndp').value,
        feedwaterTempC: +inputPanel.querySelector('#fwt').value,
      };
      const grossMW = +inputPanel.querySelector('#grossMW').value;
      try {
        const r = tp.fromGeneratedMW(grossMW, assumptions);
        renderMwResult(grossMW, assumptions, r);
      } catch (e) { resultPanel.innerHTML = `<div class="empty-state">${e.message}</div>`; }
    });
  }

  function renderMwResult(grossMW, assumptions, r) {
    resultPanel.innerHTML = `
      <div class="panel-title">Result — Estimated</div>
      <div class="assumptions-note">All values below are ESTIMATES computed from the assumptions you provided (boiler/turbine/generator efficiency, steam conditions). They are not guaranteed plant operating values.</div>
      <div class="readout">
        <span class="value">${fmt(r.netGenerationMW, 1)}</span><span class="unit">MW net</span>
        <div class="label">Net Generation (Gross ${fmt(grossMW, 1)} MW − Aux ${fmt(r.auxiliaryPowerMW, 1)} MW)</div>
      </div>
      <div class="result-grid">
        ${resultRow('Auxiliary power', fmt(r.auxiliaryPowerMW, 1) + ' MW')}
        ${resultRow('Plant efficiency', fmt(r.plantEfficiencyPct, 2) + ' %')}
        ${resultRow('Gross heat rate', fmt(r.grossHeatRateKcalKwh, 0) + ' kcal/kWh')}
        ${resultRow('Net heat rate', fmt(r.netHeatRateKcalKwh, 0) + ' kcal/kWh')}
        ${resultRow('Main steam flow', fmt(r.mainSteamFlowTh, 1) + ' t/h')}
        ${resultRow('Feedwater flow', fmt(r.feedwaterFlowTh, 1) + ' t/h')}
        ${resultRow('Main steam pressure', fmt(r.mainSteamPressureBar, 0) + ' bar')}
        ${resultRow('Main steam temp', fmt(r.mainSteamTempC, 0) + ' °C')}
        ${resultRow('Reheat pressure (est.)', fmt(r.reheatSteamPressureBar, 0) + ' bar')}
        ${resultRow('Reheat temp', fmt(r.reheatSteamTempC, 0) + ' °C')}
        ${resultRow('Condenser pressure', fmt(r.condenserPressureKPa, 1) + ' kPa')}
        ${resultRow('Fuel flow', fmt(r.fuelFlowTh, 2) + ' t/h')}
        ${resultRow('Fuel heat input', fmt(r.fuelHeatInputKcalH, 0) + ' kcal/h')}
        ${resultRow('Specific fuel consumption', fmt(r.specificFuelConsumptionKgKwh, 4) + ' kg/kWh')}
        ${resultRow('Estimated CO₂ emission', fmt(r.co2EmissionTh, 2) + ' t/h')}
      </div>
      <div class="btn-row">
        <button class="btn secondary" id="saveBtn">Save to history</button>
        <button class="btn secondary" id="pdfBtn">Export PDF</button>
      </div>
      ${disclaimerHTML()}
    `;
    resultPanel.querySelector('#saveBtn').addEventListener('click', () =>
      saveAndToast('thermal-plant', `Thermal Plant — ${grossMW} MW gross`, { grossMW, ...assumptions }, r, assumptions));
    resultPanel.querySelector('#pdfBtn').addEventListener('click', () =>
      exportCalculationPDF({ calculatorName: 'Thermal Power Plant Estimator', inputs: { grossMW, ...assumptions }, result: r, assumptions }));
  }

  function renderFuelInputs() {
    inputPanel.innerHTML = `
      <div class="panel-title">Inputs</div>
      <div class="field"><label>Fuel flow (kg/h)</label><input type="number" id="fFlow" value="40000" step="100"></div>
      <div class="field"><label>Fuel GCV (kcal/kg)</label><input type="number" id="fGcv" value="4200" step="10"></div>
      <div class="field"><label>Boiler efficiency (%)</label><input type="number" id="fBoil" value="86" step="0.1"></div>
      <div class="field"><label>Turbine cycle efficiency (%)</label><input type="number" id="fTurb" value="40" step="0.1"></div>
      <div class="field"><label>Generator efficiency (%)</label><input type="number" id="fGen" value="98.5" step="0.1"></div>
      <div class="field"><label>Auxiliary power (%)</label><input type="number" id="fAux" value="8.5" step="0.1"></div>
      <div class="btn-row"><button class="btn" id="calcBtn2">Calculate</button></div>
    `;
    inputPanel.querySelector('#calcBtn2').addEventListener('click', () => {
      const inputs = {
        fuelFlowKgH: +inputPanel.querySelector('#fFlow').value,
        fuelGcvKcalKg: +inputPanel.querySelector('#fGcv').value,
        boilerEfficiencyPct: +inputPanel.querySelector('#fBoil').value,
        turbineEfficiencyPct: +inputPanel.querySelector('#fTurb').value,
        generatorEfficiencyPct: +inputPanel.querySelector('#fGen').value,
        auxPowerPct: +inputPanel.querySelector('#fAux').value,
      };
      try {
        const r = tp.fromFuel(inputs);
        resultPanel.innerHTML = `
          <div class="panel-title">Result — Estimated</div>
          <div class="readout"><span class="value">${fmt(r.netMW, 2)}</span><span class="unit">MW net</span><div class="label">Estimated Net Generation</div></div>
          <div class="result-grid">
            ${resultRow('Gross MW', fmt(r.grossMW, 2))}
            ${resultRow('Auxiliary MW', fmt(r.auxiliaryMW, 2))}
            ${resultRow('Thermal input', fmt(r.thermalInputKcalH, 0) + ' kcal/h')}
            ${resultRow('Useful boiler heat', fmt(r.usefulBoilerHeatKcalH, 0) + ' kcal/h')}
            ${resultRow('Heat rate', fmt(r.heatRateKcalKwh, 0) + ' kcal/kWh')}
            ${resultRow('Specific fuel consumption', fmt(r.specificFuelConsumptionKgKwh, 4) + ' kg/kWh')}
          </div>
          <div class="btn-row"><button class="btn secondary" id="saveBtn2">Save to history</button></div>
          ${disclaimerHTML()}
        `;
        resultPanel.querySelector('#saveBtn2').addEventListener('click', () =>
          saveAndToast('thermal-plant-fuel', 'Thermal Plant — fuel to generation', inputs, r));
      } catch (e) { resultPanel.innerHTML = `<div class="empty-state">${e.message}</div>`; }
    });
  }

  // ---------- Mode 3: Flexible Estimator (partial inputs) ----------
  function renderAdvancedInputs() {
    const cfg0 = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
    const inputFields = tpa.INPUT_KEYS.map((key) => {
      const meta = tpa.PARAM_META[key];
      return `<div class="field"><label>${meta.label}${meta.unit ? ` (${meta.unit})` : ''}</label><input type="number" id="adv_${key}" placeholder="not entered" step="any"></div>`;
    }).join('');
    inputPanel.innerHTML = `
      <div class="panel-title">Enter what you have — leave the rest blank</div>
      <div class="assumptions-note">Only fill in the parameters you actually have. The solver derives as many of the remaining parameters as it can from mass/energy balance and standard engineering relationships; anything it still can't derive falls back to a labeled typical assumption for the selected plant/boiler type — never a guessed number.</div>
      <div class="field"><label>Plant type</label>
        <select id="advPlantType">
          <option value="subcritical">Subcritical / Critical</option>
          <option value="supercritical">Supercritical</option>
          <option value="ultra-supercritical">Ultra-supercritical</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="field"><label>Boiler type</label>
        <select id="advBoilerType"><option value="drum">Drum boiler</option><option value="once-through">Once-through boiler</option></select>
      </div>
      <div class="field"><label>Fuel type</label>
        <select id="advFuelType"><option value="coal">Coal</option><option value="oil">Oil</option><option value="gas">Gas</option></select>
      </div>
      <h3 style="margin-top:16px;">Available operating parameters</h3>
      ${inputFields}
      <h3 style="margin-top:16px;">Ultimate (elemental) fuel analysis — optional</h3>
      <div class="assumptions-note">If you have a lab fuel analysis, entering carbon and hydrogen content (plus oxygen and sulfur if available) lets the solver compute combustion air and CO₂ emission from actual fuel chemistry instead of a typical ratio — meaningfully more accurate. Leave blank to use the typical-ratio method.</div>
      ${tpa.ULTIMATE_ANALYSIS_KEYS.map((key) => {
        const meta = tpa.PARAM_META[key];
        return `<div class="field"><label>${meta.label}${meta.unit ? ` (${meta.unit})` : ''}</label><input type="number" id="adv_${key}" placeholder="not entered" step="any"></div>`;
      }).join('')}
      <div class="btn-row"><button class="btn" id="advCalcBtn">Estimate</button></div>
    `;
    inputPanel.querySelector('#advCalcBtn').addEventListener('click', () => {
      const plantType = inputPanel.querySelector('#advPlantType').value;
      const boilerType = inputPanel.querySelector('#advBoilerType').value;
      const fuelType = inputPanel.querySelector('#advFuelType').value;
      const config = tpa.defaultAdvancedConfig(plantType, boilerType, fuelType);
      const rawInputs = {};
      for (const key of [...tpa.INPUT_KEYS, ...tpa.ULTIMATE_ANALYSIS_KEYS]) {
        const el = inputPanel.querySelector(`#adv_${key}`);
        if (el && el.value !== '') rawInputs[key] = el.value;
      }
      try {
        const result = tpa.estimate(rawInputs, config);
        renderAdvancedResult(rawInputs, config, result);
      } catch (e) { resultPanel.innerHTML = `<div class="empty-state">${e.message}</div>`; }
    });
  }

  function renderAdvancedResult(rawInputs, config, result) {
    const statusBadge = (s) => `<span class="badge status-${s.toLowerCase()}">${s.toUpperCase()}</span>`;
    const rows = tpa.OUTPUT_KEYS
      .filter((k) => result.parameters[k])
      .map((k) => {
        const p = result.parameters[k];
        return `<tr>
          <td>${p.label}</td>
          <td class="num">${fmt(p.value, 3)} ${p.unit}</td>
          <td>${statusBadge(p.status)}</td>
          <td style="font-family:var(--font-mono);font-size:.76rem;color:var(--text-dim);">${p.formula}</td>
        </tr>`;
      }).join('');
    resultPanel.innerHTML = `
      <div class="panel-title">Result — Mode 3 Flexible Estimator</div>
      <div class="assumptions-note">Status shows exactly how each value was obtained: <b>Measured</b> = you entered it · <b>Calculated</b> = pure physical/mass/energy balance from measured data · <b>Estimated</b> = one engineering assumption applied to measured data · <b>Simulated</b> = derived through a chain that also relies on an estimated/typical value · <b>Predicted</b> = no data to derive it from — a typical value for this plant/boiler type.</div>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Parameter</th><th>Value</th><th>Status</th><th>Formula / basis</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="btn-row">
        <button class="btn secondary" id="advSaveBtn">Save to history</button>
        <button class="btn secondary" id="advPdfBtn">Export PDF</button>
      </div>
      ${disclaimerHTML()}
    `;
    resultPanel.querySelector('#advSaveBtn').addEventListener('click', () =>
      saveAndToast('thermal-plant-advanced', `Thermal Plant — flexible estimator (${config.plantType}/${config.boilerType})`, rawInputs, result.parameters, config));
    resultPanel.querySelector('#advPdfBtn').addEventListener('click', () => {
      const flatResult = {};
      for (const [k, p] of Object.entries(result.parameters)) flatResult[`${p.label} [${p.status}]`] = `${fmt(p.value, 3)} ${p.unit}`;
      exportCalculationPDF({ calculatorName: 'Thermal Power Plant — Flexible Estimator', inputs: rawInputs, result: flatResult, assumptions: config });
    });
  }

  // ---------- Mode 4: Flow Calculator ----------
  function renderFlowCalculator() {
    inputPanel.style.display = 'none';
    layout.style.gridTemplateColumns = '1fr';
    resultPanel.innerHTML = `
      <div class="panel-title">Power Plant Flow Calculation & Estimation Engine</div>
      <p style="color:var(--text-dim);font-size:.84rem;">Three independent flow-estimation methods — DP flow element, energy/mass balance, and MW-based — plus a comparison and consistency check. Method C reuses the Mode 3 solver above; method B reuses the same boiler-duty model as Mode 1.</p>
      <div class="tabs" id="flowSubTabs">
        <div class="tab active" data-fm="dp">A. DP Flow Element</div>
        <div class="tab" data-fm="energy">B. Energy Balance</div>
        <div class="tab" data-fm="mw">C. MW-Based</div>
        <div class="tab" data-fm="compare">Compare Methods</div>
        <div class="tab" data-fm="transmitter">DP Transmitter Model</div>
        <div class="tab" data-fm="refflow">Actual / Normal / Standard</div>
      </div>
      <div id="flowSubContent"></div>
    `;
    const subContent = resultPanel.querySelector('#flowSubContent');
    const savedFlowResults = {}; // method -> { value(t/h), label } for the comparison tab
    let compareReferenceMethod = null; // which saved method the user has chosen as "actual/reference" for comparison

    let subMode = 'dp';
    resultPanel.querySelectorAll('#flowSubTabs .tab').forEach((t) => t.addEventListener('click', () => {
      resultPanel.querySelectorAll('#flowSubTabs .tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      subMode = t.dataset.fm;
      renderSub();
    }));

    function renderSub() {
      if (subMode === 'dp') renderDpFlowSub();
      else if (subMode === 'energy') renderEnergyBalanceSub();
      else if (subMode === 'mw') renderMwBasedSub();
      else if (subMode === 'compare') renderCompareSub();
      else if (subMode === 'transmitter') renderTransmitterModelSub();
      else renderRefFlowSub();
    }

    function renderDpFlowSub() {
      subContent.innerHTML = `
        <p style="color:var(--text-dim);font-size:.85rem;margin-top:-4px;">Enter what's on the transmitter and the line — defaults are pre-filled so you can see a result immediately, then adjust for your actual installation.</p>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Fluid</label>
            <select id="fe_fluid">
              <option value="gas">Air / Gas</option>
              <option value="steam">Steam</option>
              <option value="liquid">Water / Liquid</option>
            </select>
          </div>
          <div class="field" style="flex:1"><label>Flow element</label>
            <select id="fe_type">${flow.FLOW_ELEMENT_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
          </div>
        </div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>DP (kPa)</label><input type="number" id="fe_dp" value="5"></div>
          <div class="field" style="flex:1"><label>Upstream pressure (kPa abs)</label><input type="number" id="fe_p" value="101.325"></div>
          <div class="field" style="flex:1"><label>Temperature (°C)</label><input type="number" id="fe_t" value="20"></div>
        </div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Pipe ID (mm)</label><input type="number" id="fe_pipe" value="200"></div>
          <div class="field" style="flex:1"><label id="fe_bore_label">Bore/throat (mm)</label><input type="number" id="fe_bore" value="100"></div>
        </div>
        <div class="field" id="fe_rho_field"><label id="fe_rho_label">Fluid density (kg/m³) — auto-calculated, override if you have a measured value</label><input type="number" id="fe_rho" placeholder="auto" step="any"></div>
        <div style="margin:6px 0 14px;">
          <span id="fe_advToggle" style="color:var(--amber);font-size:.8rem;cursor:pointer;">▸ Advanced: discharge coefficient override</span>
          <div id="fe_advFields" style="display:none;margin-top:10px;">
            <div class="field"><label>Discharge coefficient (blank = typical default for this element)</label><input type="number" id="fe_cd" placeholder="auto" step="any"></div>
          </div>
        </div>
        <div class="btn-row"><button class="btn" id="fe_calc">Calculate</button></div>
        <div id="fe_result" style="margin-top:16px;"></div>
      `;
      const fluidSel = subContent.querySelector('#fe_fluid');
      const rhoInput = subContent.querySelector('#fe_rho');
      const boreField = subContent.querySelector('#fe_bore').closest('.field');
      const boreLabel = subContent.querySelector('#fe_bore_label');
      const rhoLabel = subContent.querySelector('#fe_rho_label');
      function syncFluidUI() {
        if (fluidSel.value === 'liquid' && rhoInput.value === '') {
          rhoInput.value = 1000; // sensible default so Calculate works immediately; still editable
        }
        rhoLabel.textContent = fluidSel.value === 'liquid'
          ? 'Fluid density (kg/m³) — required for liquids; 1000 = water, adjust for other fluids'
          : 'Fluid density (kg/m³) — auto-calculated from pressure/temperature, override if you have a measured value';
      }
      fluidSel.addEventListener('change', syncFluidUI);
      subContent.querySelector('#fe_type').addEventListener('change', (e) => {
        const isPitot = e.target.value === 'pitot';
        boreField.style.display = isPitot ? 'none' : '';
        boreLabel.textContent = e.target.value === 'orifice' ? 'Orifice bore (mm)' : 'Throat diameter (mm)';
        if (e.target.value === 'custom') {
          const box = subContent.querySelector('#fe_advFields');
          box.style.display = 'block';
          subContent.querySelector('#fe_advToggle').textContent = '▾ Advanced: discharge coefficient override';
          toast('Custom element requires a discharge coefficient — enter it below');
        }
      });
      subContent.querySelector('#fe_advToggle').addEventListener('click', (e) => {
        const box = subContent.querySelector('#fe_advFields');
        const showing = box.style.display !== 'none';
        box.style.display = showing ? 'none' : 'block';
        e.target.textContent = showing ? '▸ Advanced: discharge coefficient override' : '▾ Advanced: discharge coefficient override';
      });

      subContent.querySelector('#fe_calc').addEventListener('click', () => {
        const elementType = subContent.querySelector('#fe_type').value;
        const fluidClass = fluidSel.value;
        const dpPa = (+subContent.querySelector('#fe_dp').value) * 1000;
        const upstreamPressurePa = (+subContent.querySelector('#fe_p').value) * 1000;
        const tempC = +subContent.querySelector('#fe_t').value;
        const pipeIdM = (+subContent.querySelector('#fe_pipe').value) / 1000;
        const boreM = elementType === 'pitot' ? 0 : (+subContent.querySelector('#fe_bore').value) / 1000;
        const cdRaw = subContent.querySelector('#fe_cd').value;
        const rhoRaw = rhoInput.value;
        try {
          const r = flow.calculateDPFlow({
            elementType, fluidClass, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM,
            cd: cdRaw === '' ? undefined : +cdRaw,
            densityKgM3: rhoRaw === '' ? undefined : +rhoRaw,
          });
          const dq = flow.validateDPFlowInputs({ beta: r.beta, reynolds: r.reynolds, cd: r.cd, dpPa, densityKgM3: r.density });
          savedFlowResults.dp = { value: r.massFlowTh, label: 'DP Measured' };
          subContent.querySelector('#fe_result').innerHTML = `
            <div class="readout"><span class="value">${fmt(r.massFlowTh,3)}</span><span class="unit">t/h</span><div class="label">Mass Flow (${elementType}) — also ${fmt(r.volumetricFlowM3h,1)} m³/h, ${fmt(r.velocityMs,2)} m/s</div></div>
            <div class="result-grid">
              ${resultRow('Beta ratio', r.beta !== null ? fmt(r.beta,3) : '— (full bore)')}
              ${resultRow('Discharge coefficient', fmt(r.cd,3))}
              ${resultRow('Density used', fmt(r.density,3) + ' kg/m³')}
              ${resultRow('Data quality', dq.score + '%' + (dq.failed.length ? ' — ' + dq.failed[0] : ' — all checks passed'))}
            </div>
            <div style="margin:12px 0;">
              <span id="fe_traceToggle" style="color:var(--amber);font-size:.8rem;cursor:pointer;">▸ Show calculation trace</span>
              <div id="fe_traceBox" style="display:none;margin-top:10px;">
                <table><thead><tr><th>Step</th><th>Value</th></tr></thead><tbody>
                  ${r.trace.map((s) => `<tr><td>${s.step}</td><td class="num">${s.value === null ? '—' : fmt(s.value, 4) + ' ' + s.unit}</td></tr>`).join('')}
                </tbody></table>
              </div>
            </div>
            <div class="btn-row"><button class="btn secondary" id="fe_save">Save to history</button></div>
          `;
          subContent.querySelector('#fe_traceToggle').addEventListener('click', (e) => {
            const box = subContent.querySelector('#fe_traceBox');
            const showing = box.style.display !== 'none';
            box.style.display = showing ? 'none' : 'block';
            e.target.textContent = showing ? '▸ Show calculation trace' : '▾ Hide calculation trace';
          });
          subContent.querySelector('#fe_save').addEventListener('click', () =>
            saveAndToast('flow-dp-element', `DP Flow (${elementType}) — ${fmt(r.massFlowTh,2)} t/h`, { elementType, fluidClass, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM }, r));
        } catch (e) { subContent.querySelector('#fe_result').innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> ${e.message}</div>`; }
      });
      syncFluidUI();
    }

    function renderEnergyBalanceSub() {
      subContent.innerHTML = `
        <div class="input-row">
          <div class="field" style="flex:1"><label>Fuel flow (t/h)</label><input type="number" id="eb_fuel" value="127"></div>
          <div class="field" style="flex:1"><label>Fuel GCV (kcal/kg)</label><input type="number" id="eb_gcv" value="4200"></div>
          <div class="field" style="flex:1"><label>Boiler efficiency (%)</label><input type="number" id="eb_eff" value="86"></div>
        </div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Feedwater temp (°C)</label><input type="number" id="eb_fwt" value="240"></div>
          <div class="field" style="flex:1"><label>Main steam pressure (bar)</label><input type="number" id="eb_msp" value="170"></div>
          <div class="field" style="flex:1"><label>Main steam temp (°C)</label><input type="number" id="eb_mst" value="537"></div>
        </div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Blowdown (% of steam)</label><input type="number" id="eb_bd" value="1.5"></div>
          <div class="field" style="flex:1"><label>Spray water (t/h)</label><input type="number" id="eb_spray" value="15"></div>
          <div class="field" style="flex:1"><label>Extraction (t/h)</label><input type="number" id="eb_extr" value="0"></div>
        </div>
        <div class="btn-row"><button class="btn" id="eb_calc">Calculate</button></div>
        <div id="eb_result" style="margin-top:16px;"></div>
      `;
      subContent.querySelector('#eb_calc').addEventListener('click', () => {
        const fuelFlowKgH = (+subContent.querySelector('#eb_fuel').value) * 1000;
        const fuelGcvKcalKg = +subContent.querySelector('#eb_gcv').value;
        const boilerEfficiencyPct = +subContent.querySelector('#eb_eff').value;
        const feedwaterTempC = +subContent.querySelector('#eb_fwt').value;
        const mainSteamPressureBar = +subContent.querySelector('#eb_msp').value;
        const mainSteamTempC = +subContent.querySelector('#eb_mst').value;
        const blowdownPctOfSteam = +subContent.querySelector('#eb_bd').value;
        const sprayFlowTh = +subContent.querySelector('#eb_spray').value;
        const extractionFlowTh = +subContent.querySelector('#eb_extr').value;
        const resultBox = subContent.querySelector('#eb_result');
        if (!(fuelGcvKcalKg > 0)) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> Fuel GCV must be greater than 0.</div>`; return; }
        if (!(boilerEfficiencyPct > 0)) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> Boiler efficiency must be greater than 0%.</div>`; return; }
        try {
          const r = flow.energyBalanceSteamFlow({ fuelFlowKgH, fuelGcvKcalKg, boilerEfficiencyPct, feedwaterTempC, mainSteamPressureBar, mainSteamTempC });
          const fw = flow.feedwaterMassBalance({ steamFlowTh: r.steamFlowTh, blowdownPctOfSteam, sprayFlowTh, extractionFlowTh });
          savedFlowResults.energy = { value: r.steamFlowTh, label: 'Energy Balance' };
          resultBox.innerHTML = `
          <div class="readout"><span class="value">${fmt(r.steamFlowTh,2)}</span><span class="unit">t/h</span><div class="label">${r.status}</div></div>
          <div class="formula-box">Q_fuel = FuelFlow × GCV;  Q_boiler = Q_fuel × η_boiler;  m_steam = Q_boiler / (h_steam − h_fw)</div>
          <div class="result-grid">
            ${resultRow('Fuel heat input', fmt(r.qFuelKcalH,0) + ' kcal/h')}
            ${resultRow('Boiler heat output', fmt(r.qBoilerKcalH,0) + ' kcal/h')}
            ${resultRow('Enthalpy rise (h_steam − h_fw)', fmt(r.enthalpyRiseKcalKg,1) + ' kcal/kg')}
            ${resultRow('Feedwater flow (mass balance)', fmt(fw.feedwaterTh,2) + ' t/h')}
            ${resultRow('Blowdown', fmt(fw.blowdownTh,2) + ' t/h')}
          </div>
          <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="eb_save">Save to history</button></div>
        `;
        subContent.querySelector('#eb_save').addEventListener('click', () =>
          saveAndToast('flow-energy-balance', `Energy Balance — ${fmt(r.steamFlowTh,2)} t/h steam`, { fuelFlowKgH, fuelGcvKcalKg, boilerEfficiencyPct, feedwaterTempC, mainSteamPressureBar, mainSteamTempC }, { ...r, ...fw }));
        } catch (e) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> ${e.message}</div>`; }
      });
    }

    function renderMwBasedSub() {
      subContent.innerHTML = `
        <div class="input-row">
          <div class="field" style="flex:1"><label>Gross MW</label><input type="number" id="mwb_mw" value="300"></div>
          <div class="field" style="flex:1"><label>Plant type</label><select id="mwb_pt">${tpa.PLANT_TYPES.filter(p=>p!=='custom').map((t) => `<option value="${t}">${t}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>Fuel</label><select id="mwb_fuel"><option value="coal">coal</option><option value="oil">oil</option><option value="gas">gas</option></select></div>
        </div>
        <div class="assumptions-note">Only fill in what you actually know — leave blank to use typical plant-type defaults (confidence drops accordingly). MW alone is never presented as if exact flows are known.</div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Boiler efficiency (%, optional)</label><input type="number" id="mwb_beff" placeholder="typical default"></div>
          <div class="field" style="flex:1"><label>Turbine efficiency (%, optional)</label><input type="number" id="mwb_teff" placeholder="typical default"></div>
          <div class="field" style="flex:1"><label>Fuel GCV (kcal/kg, optional)</label><input type="number" id="mwb_gcv" placeholder="typical default"></div>
        </div>
        <div class="btn-row"><button class="btn" id="mwb_calc">Calculate</button></div>
        <div id="mwb_result" style="margin-top:16px;"></div>
      `;
      subContent.querySelector('#mwb_calc').addEventListener('click', () => {
        const grossMW = +subContent.querySelector('#mwb_mw').value;
        const plantType = subContent.querySelector('#mwb_pt').value;
        const fuelType = subContent.querySelector('#mwb_fuel').value;
        const resultBox = subContent.querySelector('#mwb_result');
        if (!(grossMW > 0)) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> Gross MW must be greater than 0.</div>`; return; }
        const config = tpa.defaultAdvancedConfig(plantType, 'drum', fuelType);
        const userProvidedKeys = [];
        const beff = subContent.querySelector('#mwb_beff').value;
        const teff = subContent.querySelector('#mwb_teff').value;
        const gcv = subContent.querySelector('#mwb_gcv').value;
        if (beff !== '') {
          if (!(+beff > 0)) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> Boiler efficiency must be greater than 0% — leave blank to use the typical default instead.</div>`; return; }
          config.boilerEfficiencyPct = +beff; userProvidedKeys.push('boilerEfficiencyPct');
        }
        if (teff !== '') {
          if (!(+teff > 0)) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> Turbine efficiency must be greater than 0% — leave blank to use the typical default instead.</div>`; return; }
          config.turbineEfficiencyPct = +teff; userProvidedKeys.push('turbineEfficiencyPct');
        }
        if (gcv !== '') {
          if (!(+gcv > 0)) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> Fuel GCV must be greater than 0 — leave blank to use the typical default instead.</div>`; return; }
          config.fuelGcvKcalKg = +gcv; userProvidedKeys.push('fuelGcvKcalKg');
        }
        try {
          const r = flow.mwBasedFlowEstimate(grossMW, config, userProvidedKeys);
          if (r.flows.mainSteamFlowTh) savedFlowResults.mw = { value: r.flows.mainSteamFlowTh.value, label: 'MW Estimate' };
          const confClass = r.confidence === 'HIGH' ? 'normal' : r.confidence === 'MEDIUM' ? 'warning' : 'out';
          resultBox.innerHTML = `
          <div class="readout"><span class="value">${r.flows.mainSteamFlowTh ? fmt(r.flows.mainSteamFlowTh.value,2) : '—'}</span><span class="unit">t/h main steam</span>
            <div class="label">${r.status} — <span class="badge ${confClass}">${r.confidence} CONFIDENCE</span></div></div>
          <div class="result-grid">
            ${Object.entries(r.flows).map(([k,p]) => resultRow(p.label, fmt(p.value,2) + ' ' + p.unit + ` [${p.status}]`)).join('')}
          </div>
          <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="mwb_save">Save to history</button></div>
        `;
          subContent.querySelector('#mwb_save').addEventListener('click', () =>
            saveAndToast('flow-mw-based', `MW-Based Flow — ${grossMW}MW (${r.confidence} confidence)`, { grossMW, plantType, fuelType, userProvidedKeys }, r.flows));
        } catch (e) { resultBox.innerHTML = `<div class="empty-state"><span class="badge out">CHECK INPUTS</span> ${e.message}</div>`; }
      });
    }

    function renderCompareSub() {
      const methodDefs = [
        { key: 'dp', label: 'A. DP Flow Element', jumpIndex: 0 },
        { key: 'energy', label: 'B. Energy Balance', jumpIndex: 1 },
        { key: 'mw', label: 'C. MW-Based', jumpIndex: 2 },
      ];
      const checklistHTML = `
        <div class="panel-title">What's been calculated</div>
        <div class="result-grid" style="margin-bottom:18px;">
          ${methodDefs.map((m) => {
            const done = savedFlowResults[m.key];
            return `<div class="result-item">
              <span class="k">${done ? '✓' : '○'} ${m.label}</span>
              <span class="v">${done ? fmt(done.value,2) + ' t/h' : `<span class="wiz-jump" data-i="${m.jumpIndex}" role="link" tabindex="0" style="color:var(--amber);cursor:pointer;text-decoration:underline;">calculate →</span>`}</span>
            </div>`;
          }).join('')}
        </div>
      `;
      const entries = Object.entries(savedFlowResults);
      if (entries.length < 1) {
        subContent.innerHTML = checklistHTML + `<div class="empty-state">Calculate at least one method above (A, B, or C) — it will appear here automatically.</div>`;
        wireJumps();
        return;
      }
      if (entries.length < 2) {
        subContent.innerHTML = checklistHTML + `<div class="empty-state">One method calculated so far. Calculate a second method to compare them against each other.</div>`;
        wireJumps();
        return;
      }
      // Default the reference to the DP-measured value if available (that's
      // normally the "actual" instrument reading), else the first calculated.
      if (!compareReferenceMethod || !savedFlowResults[compareReferenceMethod]) {
        compareReferenceMethod = savedFlowResults.dp ? 'dp' : entries[0][0];
      }
      const refEntry = savedFlowResults[compareReferenceMethod];
      const others = entries.filter(([k]) => k !== compareReferenceMethod);

      subContent.innerHTML = checklistHTML + `
        <div class="panel-title">Compare against</div>
        <div class="field" style="max-width:320px;"><select id="cmp_ref">
          ${entries.map(([k, v]) => `<option value="${k}" ${k === compareReferenceMethod ? 'selected' : ''}>${v.label} (${fmt(v.value,2)} t/h)</option>`).join('')}
        </select></div>
        <table style="margin-top:14px;"><thead><tr><th>Method</th><th>Flow (t/h)</th><th>vs. reference</th></tr></thead><tbody>
          <tr style="background:var(--bg-panel-2);"><td><b>${refEntry.label}</b> (reference)</td><td class="num">${fmt(refEntry.value,2)}</td><td class="num">—</td></tr>
          ${others.map(([, v]) => {
            const devPct = refEntry.value !== 0 ? ((v.value - refEntry.value) / refEntry.value) * 100 : 0;
            return `<tr><td>${v.label}</td><td class="num">${fmt(v.value,2)}</td><td class="num">${devPct >= 0 ? '+' : ''}${fmt(devPct,2)}%</td></tr>`;
          }).join('')}
        </tbody></table>
        <div class="field" style="max-width:200px;margin-top:16px;"><label>Warn if deviation exceeds (%)</label><input type="number" id="cmp_tol" value="5"></div>
        <div id="cmp_checkResult" style="margin-top:12px;"></div>
      `;
      wireJumps();

      function runCheck() {
        const tol = +subContent.querySelector('#cmp_tol').value;
        const box = subContent.querySelector('#cmp_checkResult');
        if (others.length === 0) { box.innerHTML = ''; return; }
        const messages = others.map(([, v]) => {
          const check = flow.consistencyCheck(refEntry.value, v.value, tol);
          return check.withinTolerance
            ? `<div style="margin-bottom:6px;"><span class="badge normal">OK</span> ${v.label} is within ${tol}% of ${refEntry.label} (${fmt(check.deviationPct,2)}% deviation).</div>`
            : `<div style="margin-bottom:10px;"><span class="badge out">WARNING</span> ${v.label} deviates ${fmt(check.deviationPct,2)}% from ${refEntry.label} — exceeds ±${tol}%.
               <div style="color:var(--text-dim);font-size:.8rem;margin-top:4px;">Possible causes (not an automatic instrument-fault declaration): ${check.possibleCauses.slice(0,4).join('; ')}.</div></div>`;
        });
        box.innerHTML = messages.join('');
      }
      subContent.querySelector('#cmp_ref').addEventListener('change', (e) => { compareReferenceMethod = e.target.value; renderCompareSub(); });
      subContent.querySelector('#cmp_tol').addEventListener('input', runCheck);
      runCheck();

      function wireJumps() {
        subContent.querySelectorAll('.wiz-jump').forEach((a) => {
          const jump = () => {
            const i = +a.dataset.i;
            resultPanel.querySelectorAll('#flowSubTabs .tab').forEach((x) => x.classList.remove('active'));
            resultPanel.querySelectorAll('#flowSubTabs .tab')[i].classList.add('active');
            subMode = ['dp', 'energy', 'mw'][i];
            renderSub();
          };
          a.addEventListener('click', jump);
          a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); } });
        });
      }
    }

    function renderTransmitterModelSub() {
      subContent.innerHTML = `
        <div class="input-row">
          <div class="field" style="flex:1"><label>LRV</label><input type="number" id="tm_lrv" value="0"></div>
          <div class="field" style="flex:1"><label>URV</label><input type="number" id="tm_urv" value="100"></div>
          <div class="field" style="flex:1"><label>Actual DP</label><input type="number" id="tm_dp" value="25"></div>
        </div>
        <div class="field"><label>Square-root extraction stage (choose exactly one, or none for linear DP%)</label>
          <select id="tm_stage"><option value="none">None (linear DP% = Flow%)</option><option value="transmitter">In transmitter</option><option value="dcs">In DCS</option><option value="calculator">In this calculator</option></select>
        </div>
        <div class="btn-row"><button class="btn" id="tm_calc">Calculate</button></div>
        <div id="tm_result" style="margin-top:16px;"></div>
      `;
      subContent.querySelector('#tm_calc').addEventListener('click', () => {
        const lrv = +subContent.querySelector('#tm_lrv').value;
        const urv = +subContent.querySelector('#tm_urv').value;
        const actualDP = +subContent.querySelector('#tm_dp').value;
        const stage = subContent.querySelector('#tm_stage').value;
        try {
          const r = flow.dpTransmitterModel({
            lrv, urv, actualDP,
            sqrtInTransmitter: stage === 'transmitter', sqrtInDcs: stage === 'dcs', sqrtInCalculator: stage === 'calculator',
          });
          subContent.querySelector('#tm_result').innerHTML = `
            <div class="result-grid">
              ${resultRow('DP %', fmt(r.dpPct,2) + ' %')}
              ${resultRow('Flow %', fmt(r.flowPct,2) + ' %')}
              ${resultRow('Signal', fmt(r.mA,3) + ' mA')}
              ${resultRow('Square-root extraction applied', r.sqrtApplied ? 'Yes (exactly one stage)' : 'No (linear)')}
            </div>`;
        } catch (e) {
          subContent.querySelector('#tm_result').innerHTML = `<div class="empty-state"><span class="badge out">ERROR</span> ${e.message}</div>`;
        }
      });
    }

    function renderRefFlowSub() {
      subContent.innerHTML = `
        <p style="color:var(--text-dim);font-size:.82rem;">Actual, Normal (0°C), and Standard (user-defined) flow are NOT the same thing — set your standard reference temperature explicitly.</p>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Actual flow (m³/h)</label><input type="number" id="rf_actual" value="1000"></div>
          <div class="field" style="flex:1"><label>Actual temp (°C)</label><input type="number" id="rf_t" value="150"></div>
          <div class="field" style="flex:1"><label>Actual pressure (kPa abs)</label><input type="number" id="rf_p" value="120"></div>
        </div>
        <div class="field" style="max-width:220px;"><label>Standard reference temp (°C)</label><input type="number" id="rf_stdT" value="15"></div>
        <div class="btn-row"><button class="btn" id="rf_calc">Calculate</button></div>
        <div id="rf_result" style="margin-top:16px;"></div>
      `;
      subContent.querySelector('#rf_calc').addEventListener('click', () => {
        const actualM3h = +subContent.querySelector('#rf_actual').value;
        const tempC = +subContent.querySelector('#rf_t').value;
        const pressureKPa = +subContent.querySelector('#rf_p').value;
        const stdTempC = +subContent.querySelector('#rf_stdT').value;
        try {
          const normal = flow.actualToReferenceFlow(actualM3h, tempC, pressureKPa, 0);
          const standard = flow.actualToReferenceFlow(actualM3h, tempC, pressureKPa, stdTempC);
          subContent.querySelector('#rf_result').innerHTML = `
            <div class="result-grid">
              ${resultRow('Actual', fmt(actualM3h,2) + ' m³/h (at ' + fmt(tempC,1) + '°C, ' + fmt(pressureKPa,1) + ' kPa)')}
              ${resultRow('Normal', fmt(normal,2) + ' Nm³/h (ref. 0°C, 101.325 kPa)')}
              ${resultRow('Standard', fmt(standard,2) + ' Sm³/h (ref. ' + fmt(stdTempC,1) + '°C, 101.325 kPa)')}
            </div>
            <p style="color:var(--amber);font-size:.78rem;margin-top:10px;">Nm³/h and Sm³/h differ here because their reference temperatures differ — they are not interchangeable.</p>`;
        } catch (e) { subContent.querySelector('#rf_result').innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    }

    renderSub();
  }

  renderInputs();
}

// ---------- Unit Converter ----------
function pageConverter() {
  app.appendChild(h(`
    <div class="page-head"><div class="eyebrow">Reference</div><h1>Engineering Unit Converter</h1>
    <p class="lead">Pressure, temperature, flow, length, mass, and power — all routed through a single SI base per quantity for consistency.</p></div>
  `));
  const layout = h('<div class="calc-layout"></div>');
  app.appendChild(layout);

  const quantities = {
    Pressure: { units: Object.keys(units.PRESSURE_TO_PA), fn: units.convertPressure },
    Temperature: { units: Object.keys(units.TEMP_TO_K), fn: units.convertTemperature },
    Length: { units: Object.keys(units.LENGTH_TO_M), fn: units.convertLength },
    Mass: { units: Object.keys(units.MASS_TO_KG), fn: units.convertMass },
    Power: { units: Object.keys(units.POWER_TO_W), fn: units.convertPower },
  };

  const left = h(`<div class="card">
    <div class="panel-title">Convert</div>
    <div class="field"><label>Quantity</label><select id="qty">${Object.keys(quantities).map((q) => `<option>${q}</option>`).join('')}</select></div>
    <div class="field"><label>Value</label><input type="number" id="val" value="1"></div>
    <div class="input-row">
      <div class="field" style="flex:1"><label>From</label><select id="fromU"></select></div>
      <div class="field" style="flex:1"><label>To</label><select id="toU"></select></div>
    </div>
  </div>`);
  const right = h(`<div class="card"><div class="panel-title">Result</div><div class="readout"><span class="value" id="convOut">—</span><span class="unit" id="convUnit"></span></div></div>`);
  layout.append(left, right);

  const qtySel = left.querySelector('#qty');
  const fromSel = left.querySelector('#fromU');
  const toSel = left.querySelector('#toU');
  const valInput = left.querySelector('#val');

  const sensibleDefaultFrom = { Pressure: 'bar', Temperature: 'C', Length: 'm', Mass: 'kg', Power: 'kW' };
  const sensibleDefaultTo = { Pressure: 'psi', Temperature: 'F', Length: 'ft', Mass: 'lb', Power: 'HP' };
  function refreshUnits() {
    const list = quantities[qtySel.value].units;
    fromSel.innerHTML = list.map((u) => `<option>${u}</option>`).join('');
    toSel.innerHTML = list.map((u) => `<option>${u}</option>`).join('');
    const dFrom = sensibleDefaultFrom[qtySel.value];
    const dTo = sensibleDefaultTo[qtySel.value];
    fromSel.value = list.includes(dFrom) ? dFrom : list[0];
    toSel.value = list.includes(dTo) ? dTo : list[Math.min(1, list.length - 1)];
    compute();
  }
  function compute() {
    const { fn } = quantities[qtySel.value];
    try {
      const out = fn(+valInput.value, fromSel.value, toSel.value);
      right.querySelector('#convOut').textContent = fmt(out, 5);
      right.querySelector('#convUnit').textContent = toSel.value;
    } catch (e) {
      right.querySelector('#convOut').textContent = 'error';
    }
  }
  [qtySel].forEach((el) => el.addEventListener('change', refreshUnits));
  [fromSel, toSel, valInput].forEach((el) => el.addEventListener('input', compute));
  refreshUnits();
}

// ---------- 4-20mA Transmitter ----------
function pageTransmitter() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>4–20 mA Transmitter Calculator</h1>
    <p class="lead">Convert between engineering value, percent of span, and signal for 4–20mA, 0–20mA, 1–5V, or 0–10V transmitters.</p></div>`));
  const layout = h('<div class="calc-layout"></div>');
  app.appendChild(layout);
  const left = h(`<div class="card">
    <div class="panel-title">Range & signal</div>
    <div class="field"><label>Signal type</label><select id="rangeKey">${Object.keys(tx.SIGNAL_RANGES).map((k) => `<option>${k}</option>`).join('')}</select></div>
    <div class="input-row">
      <div class="field" style="flex:1"><label>LRV</label><input type="number" id="lrv" value="0"></div>
      <div class="field" style="flex:1"><label>URV</label><input type="number" id="urv" value="100"></div>
    </div>
    <div class="field"><label>Engineering unit</label>
      <select id="euUnitSelect">
        ${Object.entries(tx.ENGINEERING_UNIT_GROUPS).map(([group, units]) =>
          `<optgroup label="${group}">${units.map((u) => `<option value="${u}" ${u === 'bar' ? 'selected' : ''}>${u}</option>`).join('')}</optgroup>`
        ).join('')}
      </select>
      <input type="text" id="euUnitCustom" placeholder="Type custom unit..." style="display:none;margin-top:8px;">
    </div>
    <div class="tabs" style="margin-top:6px;">
      <div class="tab active" data-f="signalToPv">Signal → PV</div>
      <div class="tab" data-f="pvToSignal">PV → Signal</div>
    </div>
    <div class="field" id="inputWrap"><label id="inputLbl">Input signal (mA)</label><input type="number" id="inVal" value="14.5"></div>
    <div class="btn-row"><button class="btn" id="calcBtn">Calculate</button></div>
  </div>`);
  const right = h(`<div class="card"><div class="panel-title">Result</div><div id="txResult" class="empty-state">Enter values and calculate.</div></div>`);
  layout.append(left, right);

  let f = 'signalToPv';
  function updateInputLabel() {
    const rangeKey = left.querySelector('#rangeKey').value;
    const sigUnit = tx.SIGNAL_RANGES[rangeKey].unit;
    left.querySelector('#inputLbl').textContent = f === 'signalToPv'
      ? `Input signal (${sigUnit})`
      : `Input PV (${currentUnit()})`;
  }
  left.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    left.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    f = t.dataset.f;
    updateInputLabel();
  }));
  left.querySelector('#rangeKey').addEventListener('change', updateInputLabel);

  const euSelect = left.querySelector('#euUnitSelect');
  const euCustom = left.querySelector('#euUnitCustom');
  euSelect.addEventListener('change', () => {
    euCustom.style.display = euSelect.value === 'custom' ? 'block' : 'none';
    updateInputLabel();
  });
  euCustom.addEventListener('input', updateInputLabel);
  function currentUnit() {
    return euSelect.value === 'custom' ? (euCustom.value || 'custom') : euSelect.value;
  }

  left.querySelector('#calcBtn').addEventListener('click', () => {
    const rangeKey = left.querySelector('#rangeKey').value;
    const lrv = +left.querySelector('#lrv').value;
    const urv = +left.querySelector('#urv').value;
    const unit = currentUnit();
    const sigUnit = tx.SIGNAL_RANGES[rangeKey].unit;
    const inVal = +left.querySelector('#inVal').value;
    try {
      let pv, signal, pct;
      if (f === 'signalToPv') {
        signal = inVal;
        pct = tx.signalToPercent(signal, rangeKey);
        pv = tx.percentToPv(pct, lrv, urv);
      } else {
        pv = inVal;
        pct = tx.pvToPercent(pv, lrv, urv);
        signal = tx.percentToSignal(pct, rangeKey);
      }
      const result = { pv, signal, pct, rangeKey, lrv, urv };
      // The primary readout matches what the user asked to SOLVE FOR:
      // Signal → PV mode solves for PV (engineering unit); PV → Signal mode
      // solves for the signal (mA/V) — each should show its own unit, not
      // always the engineering unit.
      const primary = f === 'signalToPv'
        ? { value: pv, unit, label: 'Process Value' }
        : { value: signal, unit: sigUnit, label: 'Signal Output' };
      right.innerHTML = `
        <div class="panel-title">Result</div>
        <div class="readout"><span class="value">${fmt(primary.value, 3)}</span><span class="unit">${primary.unit}</span><div class="label">${primary.label}</div></div>
        <div class="formula-box">${tx.formula(rangeKey)}</div>
        <div class="result-grid">
          ${resultRow('Process value', fmt(pv, 3) + ' ' + unit)}
          ${resultRow('Signal', fmt(signal, 3) + ' ' + sigUnit)}
          ${resultRow('Percent of span', fmt(pct, 2) + ' %')}
          ${resultRow('LRV / URV', `${fmt(lrv)} / ${fmt(urv)} ${unit}`)}
        </div>
        <div class="btn-row">
          <button class="btn secondary" id="saveBtn">Save to history</button>
          <button class="btn secondary" id="pdfBtn">Export PDF</button>
        </div>
      `;
      right.querySelector('#saveBtn').addEventListener('click', () =>
        saveAndToast('transmitter', `4-20mA — ${fmt(primary.value,2)} ${primary.unit}`, { rangeKey, lrv, urv, inVal, mode: f }, result));
      right.querySelector('#pdfBtn').addEventListener('click', () =>
        exportCalculationPDF({ calculatorName: '4-20mA Transmitter Calculator', inputs: { rangeKey, lrv, urv, inVal, mode: f }, result, formula: tx.formula(rangeKey) }));
    } catch (e) {
      right.innerHTML = `<div class="empty-state">${e.message}</div>`;
    }
  });
}

// ---------- DP & Level ----------
function pageDpLevel() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>Differential Pressure & Level</h1>
    <p class="lead">DP-flow square-root relationship, hydrostatic level, and open/closed tank level from DP.</p></div>`));

  const tabs = h(`<div class="tabs">
    <div class="tab active" data-m="dpflow">DP ⇄ Flow</div>
    <div class="tab" data-m="hydro">Hydrostatic Level</div>
    <div class="tab" data-m="opentank">Open Tank Level (from DP)</div>
    <div class="tab" data-m="closedtank">Closed Tank Level (from DP)</div>
  </div>`);
  app.appendChild(tabs);
  const layout = h('<div class="calc-layout"></div>');
  const left = h('<div class="card"></div>');
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  let mode = 'dpflow';
  tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m; render();
  }));

  function render() {
    right.innerHTML = '<div class="empty-state">Enter values and calculate.</div>';
    if (mode === 'dpflow') {
      left.innerHTML = `<div class="panel-title">DP ⇄ Flow</div>
        <div class="field"><label>DP (% of span)</label><input type="number" id="dpPct" value="25"></div>
        <div class="field"><label>Max flow (engineering units)</label><input type="number" id="flowMax" value="200"></div>
        <div class="field"><label>Max DP (same unit as DP above, e.g. 100 = 100%)</label><input type="number" id="dpMax" value="100"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const dpPct = +left.querySelector('#dpPct').value, flowMax = +left.querySelector('#flowMax').value, dpMax = +left.querySelector('#dpMax').value;
        const flow = dp.flowFromDP(dpPct, dpMax, flowMax);
        right.innerHTML = `<div class="readout"><span class="value">${fmt(flow,2)}</span><div class="label">Estimated Flow</div></div>
          <div class="formula-box">Flow = Flow_max · √(ΔP / ΔP_max)</div>`;
      });
    } else if (mode === 'hydro') {
      left.innerHTML = `<div class="panel-title">Hydrostatic Pressure / Level</div>
        <div class="field"><label>Fluid density (kg/m³)</label><input type="number" id="rho" value="1000"></div>
        <div class="field"><label>Column height (m)</label><input type="number" id="hgt" value="2"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const rho = +left.querySelector('#rho').value, hgt = +left.querySelector('#hgt').value;
        const p = dp.hydrostaticPressurePa(rho, hgt);
        right.innerHTML = `<div class="readout"><span class="value">${fmt(p/1000,3)}</span><span class="unit">kPa</span><div class="label">Hydrostatic Pressure</div></div>
          <div class="formula-box">P = ρ · g · h</div>`;
      });
    } else if (mode === 'opentank') {
      left.innerHTML = `<div class="panel-title">Open Tank Level from DP</div>
        <div class="field"><label>DP (kPa)</label><input type="number" id="dpk" value="19.6"></div>
        <div class="field"><label>Fluid density (kg/m³)</label><input type="number" id="rho2" value="1000"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const dpk = +left.querySelector('#dpk').value, rho2 = +left.querySelector('#rho2').value;
        const lvl = dp.openTankLevel(dpk * 1000, rho2);
        right.innerHTML = `<div class="readout"><span class="value">${fmt(lvl,3)}</span><span class="unit">m</span><div class="label">Estimated Level</div></div>
          <div class="formula-box">Level = ΔP / (ρ · g)</div>`;
      });
    } else {
      left.innerHTML = `<div class="panel-title">Closed Tank Level from DP (wet-leg method)</div>
        <p style="color:var(--text-dim);font-size:.82rem;margin-top:-4px;">For a closed, pressurized vessel with the LP (dry-leg) transmitter side connected via an elevated, liquid-filled wet leg — the standard arrangement when the vapor space above the liquid is not at atmospheric pressure.</p>
        <div class="field"><label>Measured DP (kPa)</label><input type="number" id="dpc" value="15"></div>
        <div class="field"><label>Process fluid density (kg/m³)</label><input type="number" id="rhoProc" value="950"></div>
        <div class="field"><label>Wet-leg fill fluid density (kg/m³)</label><input type="number" id="rhoWetLeg" value="1000"></div>
        <div class="field"><label>Wet-leg height (m)</label><input type="number" id="wetLegH" value="3"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const dpc = +left.querySelector('#dpc').value;
        const rhoProc = +left.querySelector('#rhoProc').value;
        const rhoWetLeg = +left.querySelector('#rhoWetLeg').value;
        const wetLegH = +left.querySelector('#wetLegH').value;
        try {
          const lvl = dp.closedTankWetLegLevel(dpc * 1000, rhoProc, rhoWetLeg, wetLegH);
          right.innerHTML = `<div class="readout"><span class="value">${fmt(lvl,3)}</span><span class="unit">m</span><div class="label">Estimated Level</div></div>
            <div class="formula-box">Level = [ΔP + (ρ_wetleg · g · H_wetleg)] / (ρ_process · g)</div>
            <div class="result-grid">
              ${resultRow('Wet-leg static pressure', fmt(rhoWetLeg * 9.80665 * wetLegH / 1000, 3) + ' kPa')}
            </div>
            <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
          right.querySelector('#saveBtn').addEventListener('click', () =>
            saveAndToast('dp-level-closedtank', `Closed tank level — ${fmt(lvl,2)} m`, { dpc, rhoProc, rhoWetLeg, wetLegH }, { levelM: lvl }));
        } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    }
  }
  render();
}

// ---------- Orifice ----------
function pageOrifice() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>Orifice Plate Calculator</h1>
    <p class="lead">Square-edged concentric orifice, simplified ISO 5167 form. Verify against full ISO 5167 for custody-transfer accuracy.</p></div>`));
  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Inputs</div>
    <div class="field"><label>Pipe internal diameter (mm)</label><input type="number" id="pipeD" value="100"></div>
    <div class="field"><label>Orifice bore (mm)</label><input type="number" id="bore" value="50"></div>
    <div class="field"><label>Differential pressure (kPa)</label><input type="number" id="dpv" value="5"></div>
    <div class="field"><label>Fluid density (kg/m³)</label><input type="number" id="rho" value="1000"></div>
    <div class="field"><label>Discharge coefficient Cd</label><input type="number" id="cd" value="0.6" step="0.01"></div>
    <div class="field"><label>Dynamic viscosity (Pa·s, for Re)</label><input type="number" id="visc" value="0.001" step="0.0001"></div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    const pipeDm = (+left.querySelector('#pipeD').value) / 1000;
    const boreM = (+left.querySelector('#bore').value) / 1000;
    const dpPa = (+left.querySelector('#dpv').value) * 1000;
    const rho = +left.querySelector('#rho').value;
    const cd = +left.querySelector('#cd').value;
    const visc = +left.querySelector('#visc').value;
    try {
      const qM3s = orf.volumetricFlow(boreM, pipeDm, dpPa, rho, cd);
      const massKgS = orf.massFlow(boreM, pipeDm, dpPa, rho, cd);
      const beta = orf.betaRatio(boreM, pipeDm);
      const re = orf.reynoldsNumber(massKgS, pipeDm, visc);
      const result = { qM3s, qM3h: qM3s * 3600, massKgS, massTh: massKgS * 3.6, beta, re };
      right.innerHTML = `
        <div class="panel-title">Result</div>
        <div class="readout"><span class="value">${fmt(result.qM3h,2)}</span><span class="unit">m³/h</span><div class="label">Volumetric Flow</div></div>
        <div class="formula-box">${orf.formula()}</div>
        <div class="result-grid">
          ${resultRow('Mass flow', fmt(result.massTh,3) + ' t/h')}
          ${resultRow('Beta ratio (β)', fmt(beta,4))}
          ${resultRow('Reynolds number', fmt(re,0) + ' ' + badgeFor(re, { normalLow: 4000 }))}
        </div>
        <div class="btn-row">
          <button class="btn secondary" id="saveBtn">Save to history</button>
          <button class="btn secondary" id="pdfBtn">Export PDF</button>
        </div>`;
      const inputs = { pipeDmm: +left.querySelector('#pipeD').value, boreMm: +left.querySelector('#bore').value, dpKPa: +left.querySelector('#dpv').value, rho, cd, visc };
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('orifice', `Orifice — β=${fmt(beta,3)}`, inputs, result));
      right.querySelector('#pdfBtn').addEventListener('click', () => exportCalculationPDF({ calculatorName: 'Orifice Plate Calculator', inputs, result, formula: orf.formula() }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Control Valve ----------
function pageControlValve() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>Control Valve Sizing</h1>
    <p class="lead">Preliminary Cv/Kv sizing for liquid, gas, and steam service. Verify final selection against the manufacturer's sizing software.</p></div>`));
  const tabs = h(`<div class="tabs">
    <div class="tab active" data-m="liquid">Liquid</div>
    <div class="tab" data-m="gas">Gas</div>
    <div class="tab" data-m="steam">Steam</div>
  </div>`);
  app.appendChild(tabs);
  const layout = h('<div class="calc-layout"></div>');
  const left = h('<div class="card"></div>');
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  let mode = 'liquid';
  tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m; render();
  }));

  function render() {
    right.innerHTML = '<div class="empty-state">Enter values and calculate.</div>';
    if (mode === 'liquid') {
      left.innerHTML = `<div class="panel-title">Liquid Valve Sizing</div>
        <div class="field"><label>Flow (m³/h)</label><input type="number" id="q" value="50"></div>
        <div class="field"><label>Pressure drop ΔP (bar)</label><input type="number" id="dp" value="1.5"></div>
        <div class="field"><label>Specific gravity</label><input type="number" id="sg" value="1.0" step="0.01"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const q = +left.querySelector('#q').value, dp = +left.querySelector('#dp').value, sg = +left.querySelector('#sg').value;
        try {
          const kv = cv.liquidKv(q, dp, sg);
          const Cv = cv.kvToCv(kv);
          right.innerHTML = `<div class="readout"><span class="value">${fmt(Cv,2)}</span><div class="label">Required Cv</div></div>
            <div class="formula-box">${cv.formulas().liquidMetric}</div>
            <div class="result-grid">${resultRow('Kv', fmt(kv,2))}</div>
            <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
          right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('control-valve-liquid', `Valve Cv=${fmt(Cv,1)}`, { q, dp, sg }, { Cv, kv }));
        } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    } else if (mode === 'gas') {
      left.innerHTML = `<div class="panel-title">Gas Valve Sizing (approx., non-choked)</div>
        <div class="field"><label>Flow (scfh)</label><input type="number" id="q" value="50000"></div>
        <div class="field"><label>Upstream pressure P1 (psia)</label><input type="number" id="p1" value="100"></div>
        <div class="field"><label>Downstream pressure P2 (psia)</label><input type="number" id="p2" value="80"></div>
        <div class="field"><label>Specific gravity (air=1)</label><input type="number" id="sg" value="1.0" step="0.01"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const q = +left.querySelector('#q').value, p1 = +left.querySelector('#p1').value, p2 = +left.querySelector('#p2').value, sg = +left.querySelector('#sg').value;
        try {
          const Cv = cv.gasCv(q, p1, p2, sg);
          const choked = cv.isChokedFlow(p1, p2);
          right.innerHTML = `<div class="readout"><span class="value">${fmt(Cv,2)}</span><div class="label">Required Cv (approx.)</div></div>
            <div class="formula-box">${cv.formulas().gasApprox}</div>
            <div class="result-grid">${resultRow('Choked-flow screen', choked ? '<span class="badge warning">POSSIBLE — verify</span>' : '<span class="badge normal">Non-choked</span>')}</div>
            <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
          right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('control-valve-gas', `Valve Cv=${fmt(Cv,1)} (gas)`, { q, p1, p2, sg }, { Cv, choked }));
        } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    } else {
      left.innerHTML = `<div class="panel-title">Steam Valve Sizing (approx., non-choked)</div>
        <div class="field"><label>Flow (lb/h)</label><input type="number" id="q" value="10000"></div>
        <div class="field"><label>Upstream pressure P1 (psia)</label><input type="number" id="p1" value="150"></div>
        <div class="field"><label>Downstream pressure P2 (psia)</label><input type="number" id="p2" value="100"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const q = +left.querySelector('#q').value, p1 = +left.querySelector('#p1').value, p2 = +left.querySelector('#p2').value;
        try {
          const Cv = cv.steamCv(q, p1, p2);
          const choked = cv.isChokedFlow(p1, p2);
          right.innerHTML = `<div class="readout"><span class="value">${fmt(Cv,2)}</span><div class="label">Required Cv (approx.)</div></div>
            <div class="formula-box">${cv.formulas().steamApprox}</div>
            <div class="result-grid">${resultRow('Choked-flow screen', choked ? '<span class="badge warning">POSSIBLE — verify</span>' : '<span class="badge normal">Non-choked</span>')}</div>
            <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
          right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('control-valve-steam', `Valve Cv=${fmt(Cv,1)} (steam)`, { q, p1, p2 }, { Cv, choked }));
        } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    }
  }
  render();
  app.appendChild(h(disclaimerHTML()));
}

// ---------- I/P Converter ----------
function pageIpConverter() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>I/P Converter Calculator</h1>
    <p class="lead">Current-to-pneumatic (and reverse) signal conversion with custom input/output ranges.</p></div>`));
  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Ranges</div>
    <div class="input-row"><div class="field" style="flex:1"><label>mA min</label><input type="number" id="mAMin" value="4"></div><div class="field" style="flex:1"><label>mA max</label><input type="number" id="mAMax" value="20"></div></div>
    <div class="input-row"><div class="field" style="flex:1"><label>psi min</label><input type="number" id="psiMin" value="3"></div><div class="field" style="flex:1"><label>psi max</label><input type="number" id="psiMax" value="15"></div></div>
    <div class="tabs"><div class="tab active" data-m="i2p">mA → psi</div><div class="tab" data-m="p2i">psi → mA</div></div>
    <div class="field" id="inWrap"><label id="inLbl">Input (mA)</label><input type="number" id="inVal" value="12"></div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  let mode = 'i2p';
  left.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    left.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m;
    left.querySelector('#inLbl').textContent = mode === 'i2p' ? 'Input (mA)' : 'Input (psi)';
  }));
  left.querySelector('#calc').addEventListener('click', () => {
    const mAMin = +left.querySelector('#mAMin').value, mAMax = +left.querySelector('#mAMax').value;
    const psiMin = +left.querySelector('#psiMin').value, psiMax = +left.querySelector('#psiMax').value;
    const inVal = +left.querySelector('#inVal').value;
    try {
      const out = mode === 'i2p' ? ipc.currentToPressure(inVal, mAMin, mAMax, psiMin, psiMax) : ipc.pressureToCurrent(inVal, mAMin, mAMax, psiMin, psiMax);
      const unit = mode === 'i2p' ? 'psi' : 'mA';
      right.innerHTML = `<div class="readout"><span class="value">${fmt(out,3)}</span><span class="unit">${unit}</span></div>
        <div class="formula-box">${ipc.formula()}</div>
        <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('ip-converter', `I/P — ${fmt(out,2)} ${unit}`, { mAMin, mAMax, psiMin, psiMax, inVal, mode }, { out }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- RTD ----------
function pageRtd() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>RTD Calculator</h1>
    <p class="lead">Pt100/Pt1000 use the IEC 60751 Callendar-Van Dusen equation. Ni100/Cu100 use published approximations.</p></div>`));
  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Inputs</div>
    <div class="field"><label>RTD type</label><select id="rtdType">${Object.keys(rtd.RTD_TYPES).map((k) => `<option>${k}</option>`).join('')}</select></div>
    <div class="tabs"><div class="tab active" data-m="r2t">Resistance → Temperature</div><div class="tab" data-m="t2r">Temperature → Resistance</div></div>
    <div class="field" id="inWrap"><label id="inLbl">Resistance (Ω)</label><input type="number" id="inVal" value="138.51"></div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  let mode = 'r2t';
  left.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    left.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m;
    left.querySelector('#inLbl').textContent = mode === 'r2t' ? 'Resistance (Ω)' : 'Temperature (°C)';
  }));
  left.querySelector('#calc').addEventListener('click', () => {
    const type = left.querySelector('#rtdType').value;
    const inVal = +left.querySelector('#inVal').value;
    try {
      const out = mode === 'r2t' ? rtd.resistanceToTemperature(inVal, type) : rtd.temperatureToResistance(inVal, type);
      const unit = mode === 'r2t' ? '°C' : 'Ω';
      right.innerHTML = `<div class="readout"><span class="value">${fmt(out,3)}</span><span class="unit">${unit}</span></div>
        <div class="formula-box">${rtd.formula(type)}</div>
        <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('rtd', `${type} — ${fmt(out,2)} ${unit}`, { type, inVal, mode }, { out }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Thermocouple ----------
function pageThermocouple() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>Thermocouple Calculator</h1>
    <p class="lead">Linear-approximation model. Cold-junction temperature is always included — a real transmitter/DAQ measures mV relative to its own terminal temperature, not 0°C, so both directions need it to be accurate. For calibration-grade work, use NIST ITS-90 polynomial tables.</p></div>`));
  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Inputs</div>
    <div class="field"><label>Type</label><select id="tcType">${Object.keys(tc.TC_TYPES).map((k) => `<option>Type ${k}</option>`).join('')}</select></div>
    <div class="tabs"><div class="tab active" data-m="mv2t">mV → Temperature</div><div class="tab" data-m="t2mv">Temperature → mV</div></div>
    <div id="fields"></div>
    <div class="field"><label>Cold junction (CJC) temperature (°C)</label><input type="number" id="cjcT" value="25"><div class="hint">The transmitter/DAQ terminal temperature — typically close to ambient. Set to 0 to see the uncompensated (0°C reference) value.</div></div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  let mode = 'mv2t';
  function renderFields() {
    const fields = left.querySelector('#fields');
    if (mode === 'mv2t') fields.innerHTML = `<div class="field"><label>Measured mV (as read at the transmitter/DAQ terminals)</label><input type="number" id="inVal" value="12.2"></div>`;
    else fields.innerHTML = `<div class="field"><label>Actual hot-junction temperature (°C)</label><input type="number" id="inVal" value="300"></div>`;
  }
  left.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    left.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m; renderFields();
  }));
  renderFields();
  left.querySelector('#calc').addEventListener('click', () => {
    const type = left.querySelector('#tcType').value.replace('Type ', '');
    const inVal = +left.querySelector('#inVal').value;
    const cjcT = +left.querySelector('#cjcT').value;
    try {
      let out, unit, label;
      if (mode === 'mv2t') {
        out = tc.cjcCompensatedTemperature(inVal, cjcT, type);
        unit = '°C'; label = 'Actual Hot-Junction Temperature';
      } else {
        out = tc.temperatureToMvWithCjc(inVal, cjcT, type);
        unit = 'mV'; label = 'mV at Transmitter (CJC-compensated)';
      }
      right.innerHTML = `<div class="readout"><span class="value">${fmt(out,3)}</span><span class="unit">${unit}</span><div class="label">${label}</div></div>
        <div class="formula-box">${tc.formula()}</div>
        <div class="result-grid">${resultRow('Cold junction temp used', fmt(cjcT,1) + ' °C')}</div>
        <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('thermocouple', `Type ${type} — ${fmt(out,2)} ${unit} (CJC ${fmt(cjcT,1)}°C)`, { type, inVal, cjcT, mode }, { out }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- PID ----------
function pagePid() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Control Systems</div><h1>PID Controller Calculator</h1>
    <p class="lead">Controller output plus every major published tuning method: Ziegler-Nichols, Cohen-Coon, IMC/Lambda, Tyreus-Luyben, Chien-Hrones-Reswick, SIMC (Skogestad), a relay-feedback auto-tune estimator, and a practical loop-type quick reference.</p></div>`));
  app.appendChild(h(`<div class="pid-loop">
    ${pid.controlLoopStages.map((s, i) => `<span class="stage">${s}</span>${i < pid.controlLoopStages.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('')}
  </div>`));

  const tabs = h(`<div class="tabs">
    <div class="tab active" data-m="output">Controller Output</div>
    <div class="tab" data-m="zn-open">Ziegler-Nichols (open loop)</div>
    <div class="tab" data-m="cc">Cohen-Coon</div>
    <div class="tab" data-m="imc">IMC / Lambda</div>
    <div class="tab" data-m="chr">Chien-Hrones-Reswick</div>
    <div class="tab" data-m="simc">SIMC (Skogestad)</div>
    <div class="tab" data-m="zn-closed">Ziegler-Nichols (closed loop)</div>
    <div class="tab" data-m="tyreus-luyben">Tyreus-Luyben</div>
    <div class="tab" data-m="relay">Relay Feedback Auto-Tune</div>
    <div class="tab" data-m="loop-ref">Loop Type Reference</div>
  </div>`);
  app.appendChild(tabs);
  const layout = h('<div class="calc-layout"></div>');
  const left = h('<div class="card"></div>');
  const right = h('<div class="card"><div class="empty-state">Enter values and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  const REACTION_CURVE_METHODS = { 'zn-open': 'Ziegler-Nichols (Open Loop)', cc: 'Cohen-Coon', imc: 'IMC / Lambda', chr: 'Chien-Hrones-Reswick', simc: 'SIMC (Skogestad)' };
  const ULTIMATE_GAIN_METHODS = { 'zn-closed': 'Ziegler-Nichols (Closed Loop / Ultimate Gain)', 'tyreus-luyben': 'Tyreus-Luyben' };

  function tuningTable(r) {
    return `<table><thead><tr><th>Controller</th><th>Kp</th><th>Ti (s)</th><th>Td (s)</th></tr></thead><tbody>
      ${Object.entries(r).map(([k, v]) => `<tr><td>${k}</td><td class="num">${fmt(v.kp,3)}</td><td class="num">${v.ti !== undefined ? fmt(v.ti,3) : '—'}</td><td class="num">${v.td !== undefined ? fmt(v.td,3) : '—'}</td></tr>`).join('')}
      </tbody></table>`;
  }

  let mode = 'output';
  tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m; render();
  }));

  function render() {
    right.innerHTML = '<div class="empty-state">Enter values and calculate.</div>';
    layout.style.gridTemplateColumns = '';
    left.style.display = '';
    if (mode === 'output') {
      left.innerHTML = `<div class="panel-title">Controller Output</div>
        <div class="input-row"><div class="field" style="flex:1"><label>Setpoint</label><input type="number" id="sp" value="50"></div><div class="field" style="flex:1"><label>Process Value</label><input type="number" id="pv" value="45"></div></div>
        <div class="input-row"><div class="field" style="flex:1"><label>Kp</label><input type="number" id="kp" value="2"></div><div class="field" style="flex:1"><label>Ki</label><input type="number" id="ki" value="0.1"></div><div class="field" style="flex:1"><label>Kd</label><input type="number" id="kd" value="0"></div></div>
        <div class="input-row"><div class="field" style="flex:1"><label>Integral error (accum.)</label><input type="number" id="ie" value="10"></div><div class="field" style="flex:1"><label>Error rate (de/dt)</label><input type="number" id="er" value="0"></div><div class="field" style="flex:1"><label>Bias</label><input type="number" id="bias" value="0"></div></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const sp = +left.querySelector('#sp').value, pv = +left.querySelector('#pv').value;
        const kp = +left.querySelector('#kp').value, ki = +left.querySelector('#ki').value, kd = +left.querySelector('#kd').value;
        const integralError = +left.querySelector('#ie').value, errorRate = +left.querySelector('#er').value, bias = +left.querySelector('#bias').value;
        const r = pid.pidOutput({ sp, pv, kp, ki, kd, integralError, errorRate, bias });
        right.innerHTML = `<div class="readout"><span class="value">${fmt(r.output,3)}</span><div class="label">Controller Output</div></div>
          <div class="result-grid">${resultRow('Error', fmt(r.error,3))}${resultRow('P term', fmt(r.pTerm,3))}${resultRow('I term', fmt(r.iTerm,3))}${resultRow('D term', fmt(r.dTerm,3))}</div>
          <div class="btn-row"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
        right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('pid-output', `PID output=${fmt(r.output,2)}`, { sp, pv, kp, ki, kd, integralError, errorRate, bias }, r));
      });
    } else if (mode in REACTION_CURVE_METHODS) {
      left.innerHTML = `<div class="panel-title">${REACTION_CURVE_METHODS[mode]}</div>
        <p style="color:var(--text-dim);font-size:.82rem;margin-top:-4px;">From a process reaction-curve test: process gain K, time constant T, and dead time L.</p>
        <div class="field"><label>Process gain K</label><input type="number" id="K" value="2"></div>
        <div class="field"><label>Time constant T (s)</label><input type="number" id="T" value="10"></div>
        <div class="field"><label>Dead time L (s)</label><input type="number" id="L" value="2"></div>
        ${mode === 'imc' ? '<div class="field"><label>Lambda (s)</label><input type="number" id="lambda" value="5"></div>' : ''}
        ${mode === 'simc' ? '<div class="field"><label>Tau_c — closed-loop time constant (s)</label><input type="number" id="tauC" value="2"><div class="hint">Smaller = faster/more aggressive. A common default is τc = L.</div></div>' : ''}
        ${mode === 'chr' ? `
          <div class="field"><label>Response type</label><select id="chrResponse"><option value="disturbance">Disturbance rejection (regulatory)</option><option value="setpoint">Setpoint tracking (servo)</option></select></div>
          <div class="field"><label>Overshoot</label><select id="chrOvershoot"><option value="0">0% (conservative)</option><option value="20">20% (faster)</option></select></div>
        ` : ''}
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const K = +left.querySelector('#K').value, T = +left.querySelector('#T').value, L = +left.querySelector('#L').value;
        try {
          let r;
          if (mode === 'zn-open') r = pid.zieglerNicholsOpenLoop(K, T, L);
          else if (mode === 'cc') r = pid.cohenCoon(K, T, L);
          else if (mode === 'imc') r = pid.imcLambda(K, T, L, +left.querySelector('#lambda').value);
          else if (mode === 'simc') r = pid.simcSkogestad(K, T, L, +left.querySelector('#tauC').value);
          else r = pid.chienHronesReswick(K, T, L, left.querySelector('#chrResponse').value, left.querySelector('#chrOvershoot').value);
          right.innerHTML = `<div class="panel-title">Suggested tuning</div>${tuningTable(r)}
            <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
          right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast(`pid-tuning-${mode}`, `PID tuning (${mode})`, { K, T, L }, r));
        } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    } else if (mode in ULTIMATE_GAIN_METHODS) {
      left.innerHTML = `<div class="panel-title">${ULTIMATE_GAIN_METHODS[mode]}</div>
        <p style="color:var(--text-dim);font-size:.82rem;margin-top:-4px;">From a sustained-oscillation or relay-feedback test: ultimate gain Ku and ultimate period Pu.${mode === 'tyreus-luyben' ? ' Tyreus-Luyben gives a deliberately less oscillatory result than standard Ziegler-Nichols for the same Ku/Pu.' : ''}</p>
        <div class="field"><label>Ultimate gain Ku</label><input type="number" id="Ku" value="10"></div>
        <div class="field"><label>Ultimate period Pu (s)</label><input type="number" id="Pu" value="20"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const Ku = +left.querySelector('#Ku').value, Pu = +left.querySelector('#Pu').value;
        const r = mode === 'zn-closed' ? pid.zieglerNicholsClosedLoop(Ku, Pu) : pid.tyreusLuyben(Ku, Pu);
        right.innerHTML = `<div class="panel-title">Suggested tuning</div>${tuningTable(r)}
          <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
        right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast(`pid-tuning-${mode}`, `PID tuning (${mode})`, { Ku, Pu }, r));
      });
    } else if (mode === 'relay') {
      left.innerHTML = `<div class="panel-title">Relay Feedback Auto-Tune</div>
        <p style="color:var(--text-dim);font-size:.82rem;margin-top:-4px;">Estimates Ku and Pu from a relay (on/off) test instead of manually pushing the loop into sustained oscillation with proportional-only control — this is how most modern DCS/PLC auto-tune features work. Feed the resulting Ku/Pu into Ziegler-Nichols (closed loop) or Tyreus-Luyben.</p>
        <div class="field"><label>Relay output amplitude (d)</label><input type="number" id="d" value="5"><div class="hint">The on/off step size applied to the control output.</div></div>
        <div class="field"><label>Measured PV oscillation amplitude (a)</label><input type="number" id="a" value="2"></div>
        <div class="field"><label>Measured oscillation period Pu (s)</label><input type="number" id="Pu2" value="18"></div>
        <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>`;
      left.querySelector('#calc').addEventListener('click', () => {
        const d = +left.querySelector('#d').value, a = +left.querySelector('#a').value, Pu = +left.querySelector('#Pu2').value;
        try {
          const r = pid.relayFeedbackUltimateGain(d, a, Pu);
          const znResult = pid.zieglerNicholsClosedLoop(r.Ku, r.Pu);
          const tlResult = pid.tyreusLuyben(r.Ku, r.Pu);
          right.innerHTML = `
            <div class="readout"><span class="value">${fmt(r.Ku,3)}</span><div class="label">Estimated Ultimate Gain (Ku)</div></div>
            <div class="formula-box">Ku = 4d / (π·a)  —  Åström–Hägglund relay method</div>
            <div class="result-grid">${resultRow('Ultimate period (Pu)', fmt(r.Pu,2) + ' s')}</div>
            <div class="panel-title" style="margin-top:16px;">Applied to Ziegler-Nichols (closed loop)</div>${tuningTable(znResult)}
            <div class="panel-title" style="margin-top:16px;">Applied to Tyreus-Luyben</div>${tuningTable(tlResult)}
            <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
          right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('pid-relay-autotune', `Relay auto-tune — Ku=${fmt(r.Ku,2)}`, { d, a, Pu }, { ...r, znResult, tlResult }));
        } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
      });
    } else {
      layout.style.gridTemplateColumns = '1fr';
      left.style.display = 'none';
      right.innerHTML = `
        <div class="panel-title">Loop Type Quick Reference</div>
        <p style="color:var(--text-dim);font-size:.82rem;">Practical starting-point ranges by loop type — useful when there's no time for a full reaction-curve or relay test. Always verify against the actual loop; these are commonly cited industry rules of thumb, not guaranteed values for any specific process.</p>
        <div style="overflow-x:auto;">
          <table><thead><tr><th>Loop type</th><th>Typical dynamics</th><th>Controller</th><th>Kp range</th><th>Ti range</th><th>Td range</th></tr></thead><tbody>
            ${pid.LOOP_TYPE_GUIDANCE.map((g) => `<tr>
              <td><b>${g.type}</b></td>
              <td style="font-size:.78rem;color:var(--text-dim);">${g.dynamics}</td>
              <td style="font-size:.78rem;">${g.controller}</td>
              <td class="num">${g.kpRange}</td>
              <td class="num">${g.tiRange}</td>
              <td class="num">${g.tdRange}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
        <div class="result-grid" style="margin-top:16px;grid-template-columns:1fr;">
          ${pid.LOOP_TYPE_GUIDANCE.map((g) => resultRow(g.type, g.notes)).join('')}
        </div>`;
    }
  }
  render();
}

// ---------- Turbine & Boiler Trip / Protection ----------
function svgTrendChart(sim, alarmSetpoint, tripSetpoint) {
  const W = 760, H = 260, padL = 54, padR = 20, padT = 16, padB = 28;
  const series = sim.series;
  const ts = series.map((p) => p.t);
  const vs = series.map((p) => p.value);
  const minT = Math.min(...ts), maxT = Math.max(...ts);
  const minV = Math.min(...vs, alarmSetpoint, tripSetpoint);
  const maxV = Math.max(...vs, alarmSetpoint, tripSetpoint);
  const spanV = (maxV - minV) || 1;
  const spanT = (maxT - minT) || 1;
  const x = (t) => padL + ((t - minT) / spanT) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - minV) / spanV) * (H - padT - padB);
  const linePts = series.map((p) => `${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const alarmY = y(alarmSetpoint).toFixed(1);
  const tripY = y(tripSetpoint).toFixed(1);
  let markers = '';
  if (sim.timeToAlarmSec !== null) {
    markers += `<circle cx="${x(sim.timeToAlarmSec).toFixed(1)}" cy="${alarmY}" r="4" style="fill:var(--amber);" />`;
  }
  if (sim.timeToTripSec !== null) {
    markers += `<circle cx="${x(sim.timeToTripSec).toFixed(1)}" cy="${tripY}" r="5" style="fill:var(--red);" />`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:var(--bg-inset);border:1px solid var(--line);border-radius:6px;">
    <line x1="${padL}" y1="${alarmY}" x2="${W - padR}" y2="${alarmY}" style="stroke:var(--amber);stroke-dasharray:4,3;stroke-width:1;" />
    <line x1="${padL}" y1="${tripY}" x2="${W - padR}" y2="${tripY}" style="stroke:var(--red);stroke-dasharray:4,3;stroke-width:1;" />
    <text x="${W - padR}" y="${Number(alarmY) - 4}" text-anchor="end" font-size="10" style="fill:var(--amber);">ALARM ${fmt(alarmSetpoint, 2)}</text>
    <text x="${W - padR}" y="${Number(tripY) - 4}" text-anchor="end" font-size="10" style="fill:var(--red);">TRIP ${fmt(tripSetpoint, 2)}</text>
    <polyline points="${linePts}" fill="none" style="stroke:var(--cyan);stroke-width:2;" />
    ${markers}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" style="stroke:var(--line);" />
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" style="stroke:var(--line);" />
    <text x="${padL}" y="${H - 8}" font-size="10" style="fill:var(--text-faint);">t=0s</text>
    <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="10" style="fill:var(--text-faint);">t=${maxT}s</text>
  </svg>`;
}

function pageProtection() {
  app.appendChild(h(`<div class="page-head">
    <div class="eyebrow">Power Plant</div>
    <h1>Turbine & Boiler Trip / Protection System</h1>
    <p class="lead">ETS, MFT, voting logic, trip simulator, and trip history — universal across plant type and OEM. Reference values below are generic, illustrative industry-typical figures for education, not sourced from a specific manufacturer's proprietary manual; your own entered plant data always takes precedence.</p>
  </div>`));
  app.appendChild(h(`<div class="assumptions-note">${trip.CLASSIFICATIONS.join(' · ')} — this simulator is intended for engineering education, analysis, training and configurable plant-model simulation. It is not a replacement for OEM protection logic, approved plant procedures, actual DCS/SIS/FSSS/ETS systems, statutory requirements, or qualified engineering judgment. Never change actual plant protection settings based only on this tool.</div>`));

  const tabs = h(`<div class="tabs">
    <div class="tab active" data-m="ets">ETS Dashboard</div>
    <div class="tab" data-m="mft">MFT Dashboard</div>
    <div class="tab" data-m="drives">Major Drives Dashboard</div>
    <div class="tab" data-m="diagram">Trip Logic Diagram</div>
    <div class="tab" data-m="usc">BTG Master Specification</div>
  </div>`);
  app.appendChild(tabs);
  const layout = h('<div class="calc-layout"></div>');
  const left = h('<div class="card"></div>');
  const right = h('<div class="card"><div class="empty-state">Select a tab.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  // Shared, in-session plant configuration (resets on navigation away — this
  // is a working session, not a saved profile; use "Save to Trip History"
  // on the simulator to persist specific events).
  const plantConfig = {
    plantType: 'subcritical', boilerType: 'drum', fuelType: 'coal', unitMW: 210, oemProfile: 'Generic / Illustrative',
  };
  // User-entered overrides of registry alarm/trip setpoints, keyed by parameter id.
  const overrides = {};
  function effectiveParam(p) {
    const plantAdjusted = trip.applyPlantType(p, plantConfig.plantType);
    const o = overrides[p.id];
    return o ? { ...plantAdjusted, alarmSetpoint: o.alarmSetpoint, tripSetpoint: o.tripSetpoint, dataType: 'User Configured' } : plantAdjusted;
  }

  let mode = 'ets';
  tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m; render();
  }));

  function render() {
    layout.style.gridTemplateColumns = '';
    left.style.display = '';
    right.innerHTML = '<div class="empty-state">Select options and calculate.</div>';
    if (mode === 'ets') renderDashboard('ETS');
    else if (mode === 'mft') renderDashboard('MFT');
    else if (mode === 'drives') renderDashboard('DRIVES');
    else if (mode === 'usc') renderUscSpec();
    else renderDiagram();
  }

  function renderInlinePlantConfigBar(container) {
    const bar = h(`<div class="card" style="background:var(--bg-inset);margin-bottom:16px;padding:12px 16px;">
      <div class="input-row" style="align-items:flex-end;">
        <div class="field" style="flex:1;margin-bottom:0;"><label>Plant type</label>
          <select id="cfgPlantType">${trip.PLANT_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.plantType ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="field" style="flex:1;margin-bottom:0;"><label>Boiler type</label>
          <select id="cfgBoilerType">${trip.BOILER_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.boilerType ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="field" style="flex:1;margin-bottom:0;"><label>Fuel</label>
          <select id="cfgFuelType">${trip.FUEL_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.fuelType ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="field" style="flex:1;margin-bottom:0;"><label>Unit rating (MW)</label><input type="number" id="cfgUnitMW" value="${plantConfig.unitMW}" min="25" max="1200"></div>
        <div class="field" style="flex:1;margin-bottom:0;"><label>OEM reference profile</label>
          <select id="cfgOemProfile">${trip.OEM_REFERENCE_PROFILES.map((p) => `<option value="${p}" ${p === plantConfig.oemProfile ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
        <button class="btn secondary" id="cfgApply" style="flex-shrink:0;">Apply</button>
      </div>
    </div>`);
    container.appendChild(bar);
    bar.querySelector('#cfgApply').addEventListener('click', () => {
      plantConfig.plantType = bar.querySelector('#cfgPlantType').value;
      plantConfig.boilerType = bar.querySelector('#cfgBoilerType').value;
      plantConfig.fuelType = bar.querySelector('#cfgFuelType').value;
      plantConfig.unitMW = +bar.querySelector('#cfgUnitMW').value;
      plantConfig.oemProfile = bar.querySelector('#cfgOemProfile').value;
      toast('Plant configuration updated');
      render();
    });
  }

  function statusBadgeClass(status) {
    if (status === 'TRIP') return 'out';
    if (status === 'ALARM') return 'warning';
    return 'normal';
  }

  function renderDashboard(system) {
    layout.style.gridTemplateColumns = '';
    left.style.display = '';
    if (plantConfig.plantType === 'ultra-supercritical') plantConfig.boilerType = 'once-through';
    left.innerHTML = `
      <div class="panel-title">Plant Setup</div>
      <p style="color:var(--text-dim);font-size:.78rem;">Affects which parameters apply below — e.g. boiler type filters drum-only vs once-through-only entries, and steam-condition setpoints (pressure/temperature) scale by plant type.</p>
      <div class="field"><label>Plant type</label>
        <select id="cfgPlantType">${trip.PLANT_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.plantType ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Boiler type</label>
        <select id="cfgBoilerType" ${plantConfig.plantType === 'ultra-supercritical' ? 'disabled' : ''}>${trip.BOILER_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.boilerType ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${plantConfig.plantType === 'ultra-supercritical' ? '<div class="hint">Locked to once-through — ultra-supercritical operates above the critical point, where there is no distinct liquid/vapor phase for a drum to separate.</div>' : ''}
      </div>
      <div class="field"><label>Fuel type</label>
        <select id="cfgFuelType">${trip.FUEL_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.fuelType ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Unit rating (MW)</label>
        <div style="display:flex;gap:8px;">
          <input type="number" id="cfgUnitMW" value="${plantConfig.unitMW}" step="1" style="flex:1;">
          <button class="btn secondary" id="cfgUnitMWApply" style="padding:8px 14px;flex-shrink:0;">Submit</button>
        </div>
        <div class="hint">Type a value and click Submit (or press Enter) to apply it.</div>
      </div>
    `;
    left.querySelector('#cfgPlantType').addEventListener('change', (e) => {
      plantConfig.plantType = e.target.value;
      if (plantConfig.plantType === 'ultra-supercritical') plantConfig.boilerType = 'once-through';
      renderDashboard(system);
    });
    left.querySelector('#cfgBoilerType').addEventListener('change', (e) => { plantConfig.boilerType = e.target.value; renderDashboard(system); });
    left.querySelector('#cfgFuelType').addEventListener('change', (e) => { plantConfig.fuelType = e.target.value; renderDashboard(system); });
    function applyUnitMW() {
      const val = +left.querySelector('#cfgUnitMW').value;
      plantConfig.unitMW = val || plantConfig.unitMW;
      renderDashboard(system);
    }
    left.querySelector('#cfgUnitMWApply').addEventListener('click', applyUnitMW);
    left.querySelector('#cfgUnitMW').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyUnitMW(); } });

    right.innerHTML = '';
    const isDrives = system === 'DRIVES';
    const params = trip.parametersFor(plantConfig.boilerType)
      .filter((p) => (isDrives ? p.classification === 'AUXILIARY DRIVE' : p.system === system))
      .map(effectiveParam);
    const title = system === 'ETS' ? 'Turbine Trip Dashboard (ETS)' : system === 'MFT' ? 'Boiler Trip Dashboard (MFT)' : 'Major Drives Dashboard';
    right.appendChild(h(`<div>
      <div class="panel-title">${title} — ${plantConfig.plantType}, ${plantConfig.boilerType} boiler, ${plantConfig.unitMW} MW</div>
      <p style="color:var(--text-dim);font-size:.78rem;">Enter a current value for any parameter and click its <b>Submit</b> button (or press Enter) to check status against its alarm/trip setpoints — each row evaluates independently.</p>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Parameter</th>${isDrives ? '<th>Drive</th>' : ''}<th>Category</th><th>Value</th><th></th><th>Alarm</th><th>Trip</th><th>Status</th><th>Data type</th></tr></thead><tbody>
          ${params.map((p) => `<tr data-id="${p.id}">
            <td>${p.label}</td>
            ${isDrives ? `<td style="font-size:.76rem;color:var(--cyan);">${p.system}</td>` : ''}
            <td style="font-size:.76rem;color:var(--text-dim);">${p.category}</td>
            <td><input type="number" class="pv-input" data-id="${p.id}" value="${(p.normalMin + p.normalMax) / 2}" step="any" style="width:100px;padding:5px 8px;"> <span style="color:var(--text-faint);font-size:.72rem;">${p.unit}</span></td>
            <td><button class="btn secondary eval-row-btn" data-id="${p.id}" style="padding:5px 12px;font-size:.76rem;">Submit</button></td>
            <td class="num">${fmt(p.alarmSetpoint, 3)}</td>
            <td class="num">${fmt(p.tripSetpoint, 3)}</td>
            <td class="status-cell"><span class="badge normal">NORMAL</span></td>
            <td style="font-size:.7rem;color:var(--text-faint);">${p.dataType}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="btn-row" style="margin-top:14px;"><button class="btn secondary" id="evalAllBtn">Evaluate all statuses</button></div>
      <p style="color:var(--text-dim);font-size:.78rem;margin-top:10px;">Enter a current value per parameter and click Evaluate — this simulates live status against the configured setpoints.</p>
    </div>`));

    function evaluateRow(tr) {
      const id = tr.dataset.id;
      const p = params.find((x) => x.id === id);
      const val = +tr.querySelector('.pv-input').value;
      const status = trip.evaluateStatus(val, p.alarmSetpoint, p.tripSetpoint, p.direction);
      tr.querySelector('.status-cell').innerHTML = `<span class="badge ${statusBadgeClass(status)}">${status}</span>`;
    }
    right.querySelectorAll('.eval-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => evaluateRow(btn.closest('tr')));
    });
    right.querySelectorAll('.pv-input').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); evaluateRow(input.closest('tr')); }
      });
    });
    right.querySelector('#evalAllBtn').addEventListener('click', () => {
      right.querySelectorAll('tr[data-id]').forEach((tr) => evaluateRow(tr));
    });
  }

  function renderSimulator() {
    const scenario0 = trip.DISTURBANCE_SCENARIOS[0];
    left.innerHTML = `
      <div class="panel-title">Trip Simulator</div>
      <div class="field"><label>Disturbance scenario</label>
        <select id="simScenario">${trip.DISTURBANCE_SCENARIOS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
      </div>
      <div id="simFields"></div>
      <div class="btn-row"><button class="btn" id="simRun">Run Simulation</button></div>
    `;
    function paramForScenario(scenarioId) {
      const s = trip.DISTURBANCE_SCENARIOS.find((x) => x.id === scenarioId) || scenario0;
      const p = effectiveParam(trip.PARAMETER_REGISTRY.find((x) => x.id === s.parameterId));
      return { s, p };
    }
    function renderFields() {
      const { s, p } = paramForScenario(left.querySelector('#simScenario').value);
      const startValue = (p.normalMin + p.normalMax) / 2;
      left.querySelector('#simFields').innerHTML = `
        <div class="assumptions-note">Linked parameter: <b>${p.label}</b> (${p.category}, ${p.system}) — normal range ${fmt(p.normalMin,2)}–${fmt(p.normalMax,2)} ${p.unit}, voting ${p.voting}, time delay ${p.timeDelaySec}s.</div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Start value</label><input type="number" id="simStart" value="${startValue}" step="any"></div>
          <div class="field" style="flex:1"><label>Ramp rate (/s)</label><input type="number" id="simRate" value="${s.rampRatePerSec}" step="any"></div>
        </div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Alarm setpoint</label><input type="number" id="simAlarm" value="${p.alarmSetpoint}" step="any"></div>
          <div class="field" style="flex:1"><label>Trip setpoint</label><input type="number" id="simTrip" value="${p.tripSetpoint}" step="any"></div>
        </div>
        <div class="input-row">
          <div class="field" style="flex:1"><label>Time delay (s)</label><input type="number" id="simDelay" value="${p.timeDelaySec}" step="any"></div>
          <div class="field" style="flex:1"><label>Duration (s)</label><input type="number" id="simDuration" value="60" step="any"></div>
        </div>
        <input type="hidden" id="simDirection" value="${p.direction}">
        <input type="hidden" id="simParamId" value="${p.id}">
      `;
    }
    left.querySelector('#simScenario').addEventListener('change', renderFields);
    renderFields();
    left.querySelector('#simRun').addEventListener('click', () => {
      const startValue = +left.querySelector('#simStart').value;
      const rampRatePerSec = +left.querySelector('#simRate').value;
      const alarmSetpoint = +left.querySelector('#simAlarm').value;
      const tripSetpoint = +left.querySelector('#simTrip').value;
      const timeDelaySec = +left.querySelector('#simDelay').value;
      const durationSec = +left.querySelector('#simDuration').value;
      const direction = left.querySelector('#simDirection').value;
      const paramId = left.querySelector('#simParamId').value;
      const param = trip.PARAMETER_REGISTRY.find((p) => p.id === paramId);
      try {
        const sim = trip.simulateDisturbance({ startValue, alarmSetpoint, tripSetpoint, direction, rampRatePerSec, timeDelaySec, durationSec });
        right.innerHTML = `
          <div class="panel-title">Simulation Result — ${param.label}</div>
          ${svgTrendChart(sim, alarmSetpoint, tripSetpoint)}
          <div class="result-grid" style="margin-top:14px;">
            ${resultRow('Time to alarm', sim.timeToAlarmSec !== null ? fmt(sim.timeToAlarmSec, 1) + ' s' : '— not reached')}
            ${resultRow('Time to trip (confirmed)', sim.timeToTripSec !== null ? fmt(sim.timeToTripSec, 1) + ' s' : '— not reached')}
            ${resultRow('Trip confirmation delay', fmt(sim.tripDelaySec, 1) + ' s')}
            ${resultRow('Max deviation from start', fmt(sim.maxDeviation, 3))}
            ${resultRow('Recovery time', sim.recoveryTimeSec !== null ? fmt(sim.recoveryTimeSec, 1) + ' s' : '—')}
            ${resultRow('Trip action', param.tripAction)}
            ${resultRow('Voting logic', param.voting)}
            ${resultRow('Reset condition', param.resetCondition)}
          </div>
          <div class="btn-row" style="margin-top:14px;"><button class="btn secondary" id="simSaveBtn">Save to Trip History</button></div>
        `;
        right.querySelector('#simSaveBtn').addEventListener('click', async () => {
          await store.saveCalculation({
            calculatorId: 'trip-event',
            name: `${param.system} — ${param.label} (${sim.tripped ? 'TRIPPED' : 'no trip'})`,
            inputs: { plant: plantConfig, startValue, rampRatePerSec, alarmSetpoint, tripSetpoint, timeDelaySec, durationSec },
            result: {
              parameter: param.label, system: param.system, classification: param.classification,
              measuredValue: sim.series[sim.series.length - 1].value, alarmSetpoint, tripSetpoint,
              tripType: param.system, votingResult: param.voting, tripAction: param.tripAction,
              tripped: sim.tripped, timeToAlarmSec: sim.timeToAlarmSec, timeToTripSec: sim.timeToTripSec,
              source: 'Simulation',
            },
          });
          toast('Saved to Trip History');
        });
      } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
    });
  }

  function renderUscSpec() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    right.innerHTML = `<div>
      <div class="panel-title">BTG Master Specification — Ultra-Supercritical Power Plant</div>
      <p style="color:var(--text-dim);font-size:.85rem;">A working reference for how a real USC boiler-turbine-generator unit is structured, protected, started, and stopped — built around the ${trip.PARAMETER_REGISTRY.length} live parameters in this app's own registry, not a generic textbook copy.</p>
      <div class="assumptions-note">Plant/OEM-specific numeric limits (exact trip setpoints, ramp rates, generator ratings, etc.) vary by manufacturer and by unit and are marked accordingly below — they're not guessed. Where this page gives a real number, it's either the live registry (see ETS/MFT/Major Drives dashboards) or a cited public source.</div>

      <h3 style="margin-top:22px;">Power Plant Systems</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">Click a major system to open it, then a subsystem to see its parameters.</p>
      <div id="systemTree"></div>

      <h3 style="margin-top:26px;">Permissive, Interlock, Trip, Alarm, Runback, MFT — what's the difference?</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">Mixing these up in a real C&amp;E document is a genuinely common and consequential mistake — they're never interchangeable.</p>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Term</th><th>What it actually means</th></tr></thead><tbody>
          ${trip.CONCEPT_DEFINITIONS.map(([term, def]) => `<tr><td><b>${term}</b></td><td style="font-size:.84rem;color:var(--text-dim);">${def}</td></tr>`).join('')}
        </tbody></table>
      </div>

      <h3 style="margin-top:26px;">Unit Operating States</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">The path a real unit moves through, from cold and off to synchronized and loaded — and how it gets pulled out of that path by a trip.</p>
      <div class="pid-loop">
        ${trip.MASTER_UNIT_STATES.map((s) => `<span class="stage">${s}</span>`).join('<span class="arrow">→</span>')}
      </div>

      <h3 style="margin-top:26px;">Automatic Start &amp; Stop Sequences</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">A boiler or turbine "stop" isn't one thing — normal, fast, and emergency stops are deliberately different philosophies with different risk trade-offs, never treated as interchangeable.</p>
      ${Object.entries(trip.BTG_SEQUENCES).map(([name, steps]) => `
        <div style="margin-top:16px;">
          <div style="font-weight:600;margin-bottom:8px;">${name}</div>
          <div class="pid-loop">
            ${steps.map((s) => `<span class="stage">${s}</span>`).join('<span class="arrow">→</span>')}
          </div>
        </div>
      `).join('')}

      <h3 style="margin-top:26px;">Master Fuel Trip — What Actually Causes One</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">MFT is boiler-wide fuel isolation, not a single sensor tripping — it's triggered by any of these category failures, evaluated against the unit's own approved logic:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${trip.MFT_CAUSE_CATEGORIES.map((c) => `<span class="badge out">${c}</span>`).join('')}</div>

      <h3 style="margin-top:26px;">Before an Automatic Unit Start Is Even Allowed</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">All of these must be true — an automatic start sequence won't even begin otherwise:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${trip.UNIT_AUTO_START_PERMISSIVES.map((p) => `<span class="badge normal">${p}</span>`).join('')}</div>

      <h3 style="margin-top:26px;">Standby Equipment — What Auto-Starts When Something Fails</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">Every one of these has a running/standby pair with automatic changeover — losing the running unit doesn't (by itself) trip the plant:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${trip.STANDBY_AUTOSTART_EXAMPLES.map((e) => `<span class="badge warning">${e}</span>`).join('')}</div>

      <h3 style="margin-top:26px;">Runback — Dropping Load Instead of Tripping</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">When equipment degrades but the unit doesn't need to trip outright, a runback pulls load down automatically to what the remaining equipment can actually support. Target load and ramp rate always come from the unit's own C&amp;E, never a generic number. Common triggers:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${trip.RUNBACK_TRIGGERS.map((r) => `<span class="badge normal">${r}</span>`).join('')}</div>

    </div>`;

    // Interactive Power Plant Systems tree: major system -> click to expand
    // -> subsystem -> click to expand -> parameter list.
    const treeRoot = document.getElementById('systemTree');
    const majors = trip.PLANT_HIERARCHY.PLANT.UNIT;
    for (const major of majors) {
      const subsystems = trip.SYSTEM_TREE[major] || [];
      const majorRow = h(`<div class="tree-node" role="link" tabindex="0" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--line-soft);">
        <span class="tree-caret" style="color:var(--amber);font-family:var(--font-mono);width:14px;flex-shrink:0;">${subsystems.length ? '▸' : '·'}</span>
        <span style="font-weight:600;">${major}</span>
        <span style="color:var(--text-faint);font-size:.72rem;margin-left:auto;">${subsystems.length ? subsystems.length + ' subsystem' + (subsystems.length === 1 ? '' : 's') : 'no dedicated subsystem — see a related system'}</span>
      </div>`);
      const subContainer = h('<div style="display:none;margin-left:22px;"></div>');
      treeRoot.appendChild(majorRow);
      treeRoot.appendChild(subContainer);

      if (subsystems.length) {
        const toggleMajor = () => {
          const open = subContainer.style.display !== 'none';
          subContainer.style.display = open ? 'none' : 'block';
          majorRow.querySelector('.tree-caret').textContent = open ? '▸' : '▾';
        };
        majorRow.addEventListener('click', toggleMajor);
        majorRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMajor(); } });

        for (const subKey of subsystems) {
          const items = trip.BTG_PARAMETER_GROUPS[subKey] || [];
          const isLive = subKey.includes('live data');
          const cleanLabel = subKey.replace(/\s*\(live data:[^)]*\)/, '').replace(/\s*\([^)]*live[^)]*\)/i, '');
          const subRow = h(`<div class="tree-node" role="link" tabindex="0" style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--line-soft);">
            <span class="tree-caret" style="color:var(--cyan);font-family:var(--font-mono);width:14px;flex-shrink:0;">▸</span>
            <span>${cleanLabel}</span>
            ${isLive ? '<span class="badge normal" style="margin-left:8px;">live data</span>' : ''}
            <span style="color:var(--text-faint);font-size:.72rem;margin-left:auto;">${items.length} parameters</span>
          </div>`);
          const itemContainer = h(`<div style="display:none;margin-left:22px;padding:10px 0;"><div style="display:flex;flex-wrap:wrap;gap:6px;">${items.map((i) => `<span class="badge status-predicted">${i}</span>`).join('')}</div></div>`);
          subContainer.appendChild(subRow);
          subContainer.appendChild(itemContainer);

          const toggleSub = () => {
            const open = itemContainer.style.display !== 'none';
            itemContainer.style.display = open ? 'none' : 'block';
            subRow.querySelector('.tree-caret').textContent = open ? '▸' : '▾';
          };
          subRow.addEventListener('click', (e) => { e.stopPropagation(); toggleSub(); });
          subRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSub(); } });
        }
      }
    }
  }


  function renderDiagram() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    const CLASS_COLORS = { 'ETS': 'var(--red)', 'MFT': 'var(--amber)', 'GENERATOR TRIP': 'var(--blue)', 'AUXILIARY DRIVE': 'var(--cyan)' };
    function sensorCountFor(voting) {
      const m = /(\d+)oo(\d+)/.exec(voting);
      return m ? Math.min(+m[2], 3) : 1; // cap the drawn sensor count at 3 for readability
    }
    let classFilter = 'All';
    right.innerHTML = `<div class="panel-title">Trip Logic Diagram</div>
      <p style="color:var(--text-dim);font-size:.82rem;">Every registered ETS, MFT, and generator-trip parameter for the current plant configuration (${plantConfig.boilerType} boiler) — sensors, voting, trip signal, and the resulting downstream action. Click any block for details. Sensor tag names and exact sequences are illustrative and plant-configurable.</p>
      <div class="tabs" id="diagramClassTabs" style="margin-bottom:16px;">
        ${['All', 'ETS', 'GENERATOR TRIP', 'MFT', 'AUXILIARY DRIVE'].map((c) => `<div class="tab ${c === 'All' ? 'active' : ''}" data-c="${c}">${c}</div>`).join('')}
      </div>
      <div id="diagrams"></div>
      <div id="diagramDetail" class="card" style="margin-top:16px;background:var(--bg-inset);position:sticky;bottom:12px;"><div class="empty-state">Click a block above for details.</div></div>`;

    const container = right.querySelector('#diagrams');
    const params = trip.parametersFor(plantConfig.boilerType).map(effectiveParam);

    function draw() {
      container.innerHTML = '';
      const shown = classFilter === 'All' ? params : params.filter((p) => p.classification === classFilter);
      if (!shown.length) { container.innerHTML = '<div class="empty-state">No registered parameters in this category for the current boiler type.</div>'; return; }
      for (const param of shown) {
        const sensorCount = sensorCountFor(param.voting);
        const sensors = Array.from({ length: sensorCount }, (_, i) => sensorCount === 1 ? param.label : `${param.label} — Ch.${i + 1}`);
        const color = CLASS_COLORS[param.classification] || 'var(--red)';
        const block = h(`<div style="margin-bottom:18px;">
          <div class="panel-title" style="margin-bottom:8px;">${param.label} <span class="badge" style="border-color:${color};color:${color};">${param.classification}</span></div>
          <div class="pid-loop">
            ${sensors.map((s) => `<span class="stage diagram-block" data-role="sensor" data-label="${s}" data-id="${param.id}" style="cursor:pointer;">${s}</span>`).join('<span class="arrow">→</span>')}
            <span class="arrow">→</span>
            <span class="stage diagram-block" data-role="voting" data-id="${param.id}" style="cursor:pointer;color:var(--amber);">${param.voting} VOTING</span>
            <span class="arrow">→</span>
            <span class="stage diagram-block" data-role="signal" data-id="${param.id}" style="cursor:pointer;color:${color};">${param.classification === 'MFT' ? 'MFT' : param.classification === 'GENERATOR TRIP' ? 'GEN TRIP' : param.classification === 'AUXILIARY DRIVE' ? 'DRIVE TRIP' : 'ETS TRIP'}</span>
            <span class="arrow">→</span>
            <span class="stage diagram-block" data-role="action" data-id="${param.id}" style="cursor:pointer;color:var(--text-dim);font-size:.78rem;">Action ▸</span>
          </div>
        </div>`);
        container.appendChild(block);
      }
      container.querySelectorAll('.diagram-block').forEach((el) => {
        el.addEventListener('click', () => {
          const role = el.dataset.role;
          const p = params.find((x) => x.id === el.dataset.id);
          const detail = right.querySelector('#diagramDetail');
          if (role === 'sensor') {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Signal', el.dataset.label)}
              ${resultRow('System', p.system + ' — ' + p.category)}
              ${resultRow('Unit', p.unit)}
              ${resultRow('Normal range', p.unit === 'boolean' ? 'N/A (discrete)' : `${fmt(p.normalMin,2)} – ${fmt(p.normalMax,2)} ${p.unit}`)}
              ${resultRow('Status', 'Simulated sensor — see ETS/MFT Dashboard for live evaluation')}
            </div>`;
          } else if (role === 'voting') {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Logic', p.voting)}
              ${resultRow('Setpoint (alarm)', p.unit === 'boolean' ? 'N/A' : fmt(p.alarmSetpoint,3) + ' ' + p.unit)}
              ${resultRow('Setpoint (trip)', p.unit === 'boolean' ? 'N/A (discrete)' : fmt(p.tripSetpoint,3) + ' ' + p.unit)}
              ${resultRow('Time delay', p.timeDelaySec + ' s')}
              ${resultRow('Permissive', p.permissive)}
            </div>`;
          } else if (role === 'signal') {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Trip signal', p.classification)}
              ${resultRow('Classification', p.classification)}
              ${resultRow('Reset condition', p.resetCondition)}
              ${resultRow('Status', `<span class="badge out">TRIP (example)</span>`)}
              ${resultRow('Data type', `<span class="badge ${p.dataType === 'User Configured' ? 'normal' : 'warning'}">${p.dataType}</span>`)}
            </div>`;
          } else {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Downstream action', p.tripAction)}
              ${resultRow('Reset condition', p.resetCondition)}
              ${resultRow('Permissive', p.permissive)}
            </div>
            <p style="color:var(--text-faint);font-size:.76rem;margin-top:10px;">For the full plant-wide downstream effect (fans, feedwater, cooling, etc.), see the Cause &amp; Action Diary tab — this describes the immediate trip action only.</p>`;
          }
        });
      });
    }

    right.querySelectorAll('#diagramClassTabs .tab').forEach((t) => t.addEventListener('click', () => {
      right.querySelectorAll('#diagramClassTabs .tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      classFilter = t.dataset.c;
      draw();
    }));
    draw();
  }

  function renderCauseActionDiary() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    right.innerHTML = `
      <div class="panel-title">Cause & Action Diary</div>
      <div class="assumptions-note">Turbine trip does <b>not</b> automatically mean MFT — the exact wiring for any specific cause must come from your unit's approved Cause &amp; Effect (C&amp;E) drawings. This page is illustrative and educational, not a substitute for those documents.</div>

      <h3 style="margin-top:18px;">Three general scenarios</h3>
      <div id="scenarioChains"></div>

      <h3 style="margin-top:24px;">Add to your diary</h3>
      <p style="color:var(--text-dim);font-size:.82rem;">Pick a cause, describe what happens in plain language, and save it. That's it.</p>
      <div class="card" style="background:var(--bg-inset);margin-top:12px;">
        <div class="input-row">
          <div class="field" style="flex:2;"><label>Initiating trip cause</label>
            <input type="text" id="diaryCause" list="diaryCauseList" placeholder="e.g. Condenser vacuum low-low">
            <datalist id="diaryCauseList">${Object.values(trip.MASTER_TRIP_CAUSES).flat().map((c) => `<option value="${c}">`).join('')}</datalist>
          </div>
          <div class="field" style="flex:1;"><label>Category (optional)</label>
            <select id="diaryCategory"><option value="">\u2014</option>${trip.DIARY_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field"><label>What happens</label>
          <textarea id="diaryResponse" rows="3" placeholder="e.g. ETS trips, generator breaker opens, MFT is C&amp;E dependent, BFP and CEP continue running, HP bypass opens." style="width:100%;padding:9px 11px;background:var(--bg-panel);border:1px solid var(--line);border-radius:var(--radius);color:var(--text);font-family:inherit;resize:vertical;"></textarea>
        </div>
        <div class="btn-row" style="margin-top:8px;"><button class="btn" id="diaryAddBtn">Add to Diary</button></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px;margin-top:24px;">
        <h3 style="margin:0;">Your plant's Trip Diary</h3>
        <div style="display:flex;gap:14px;align-items:center;">
          <select id="diaryFilterCategory" style="font-size:.78rem;padding:6px 8px;"><option value="">All categories</option>${trip.DIARY_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
          <span id="diaryExportBtn" role="link" tabindex="0" style="color:var(--amber);font-size:.82rem;cursor:pointer;text-decoration:underline;">Export to PDF</span>
        </div>
      </div>
      <div id="diaryTableWrap" style="margin-top:10px;"></div>

      <div style="margin-top:28px;border-top:1px solid var(--line);padding-top:14px;">
        <span id="refToggle" role="link" tabindex="0" style="color:var(--amber);font-size:.85rem;cursor:pointer;text-decoration:underline;">\u25b8 Show reference material (worked examples, master cause list, sources)</span>
        <div id="refMaterial" style="display:none;margin-top:16px;"></div>
      </div>
    `;
    const chainsContainer = right.querySelector('#scenarioChains');
    for (const scenario of trip.TRIP_SCENARIOS) {
      const block = h(`<div style="margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:8px;">${scenario.title}</div>
        <div class="pid-loop">
          ${scenario.chain.map((step) => `<span class="stage">${step}</span>`).join('<span class="arrow">\u2192</span>')}
        </div>
        <p style="color:var(--text-faint);font-size:.78rem;margin-top:6px;">${scenario.note}</p>
      </div>`);
      chainsContainer.appendChild(block);
    }

    const refToggle = right.querySelector('#refToggle');
    const refMaterial = right.querySelector('#refMaterial');
    refToggle.addEventListener('click', () => {
      const showing = refMaterial.style.display !== 'none';
      refMaterial.style.display = showing ? 'none' : 'block';
      refToggle.textContent = showing
        ? '\u25b8 Show reference material (worked examples, master cause list, sources)'
        : '\u25be Hide reference material';
      if (!showing && !refMaterial.dataset.loaded) {
        refMaterial.dataset.loaded = '1';
        refMaterial.innerHTML = `
          <h3 style="margin-top:0;">System response after a turbine trip (general/typical)</h3>
          <div style="overflow-x:auto;">
            <table><thead><tr><th>System</th><th>Typical response</th></tr></thead><tbody>
              ${trip.GENERAL_SYSTEM_RESPONSE.map((r) => `<tr><td><b>${r.system}</b></td><td style="font-size:.82rem;color:var(--text-dim);">${r.response}</td></tr>`).join('')}
            </tbody></table>
          </div>

          <h3 style="margin-top:24px;">Worked examples</h3>
          <div style="overflow-x:auto;">
            <table><thead><tr><th>Initiating trip</th><th>Turbine</th><th>Generator</th><th>MFT</th><th>Mills</th><th>BFP</th><th>CEP</th><th>CW</th><th>Bypass</th></tr></thead><tbody>
              ${trip.CAUSE_ACTION_DIARY.map((r) => `<tr>
                <td><b>${r.cause}</b></td><td>${r.turbine}</td><td>${r.generator}</td>
                <td style="font-size:.8rem;">${r.mft}</td><td style="font-size:.8rem;">${r.mills}</td>
                <td style="font-size:.8rem;">${r.bfp}</td><td>${r.cep}</td><td>${r.cw}</td><td>${r.bypass}</td>
              </tr>`).join('')}
            </tbody></table>
          </div>

          <h3 style="margin-top:24px;">Master list of initiating trip causes</h3>
          ${Object.entries(trip.MASTER_TRIP_CAUSES).map(([group, causes]) => `
            <div class="diary-group-label" style="margin-top:12px;">${group}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${causes.map((c) => `<span class="badge status-predicted">${c}</span>`).join('')}</div>
          `).join('')}

          <h3 style="margin-top:24px;">Researched examples (genuinely sourced)</h3>
          <p style="color:var(--text-dim);font-size:.82rem;">A handful of publicly findable examples, attributed and confidence-rated — not a complete or verified cross-OEM database.</p>
          ${trip.RESEARCHED_EXAMPLES.map((ex) => `
            <div class="card" style="background:var(--bg-inset);margin-top:10px;">
              <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
                <b>${ex.cause}</b>
                <span class="badge ${ex.confidence.includes('General') ? 'warning' : 'out'}">${ex.confidence}</span>
              </div>
              <p style="font-size:.84rem;color:var(--text-dim);margin:6px 0;">${ex.summary}</p>
              <div style="font-size:.74rem;color:var(--text-faint);">OEM: ${ex.oem} &middot; Unit: ${ex.unitMW} MW &middot; ${ex.scUsc}</div>
              <div style="font-size:.74rem;color:var(--text-faint);margin-top:2px;">Source: ${ex.source}</div>
            </div>
          `).join('')}

          <h3 style="margin-top:24px;">Source register</h3>
          <div style="overflow-x:auto;">
            <table><thead><tr><th>Title</th><th>Note</th><th>Link</th></tr></thead><tbody>
              ${trip.SOURCE_REGISTER.map((s) => `<tr>
                <td style="font-size:.8rem;">${s.title}</td>
                <td style="font-size:.78rem;color:var(--text-dim);">${s.note}</td>
                <td><a href="${s.url}" target="_blank" rel="noopener" style="color:var(--amber);font-size:.78rem;">Open \u2192</a></td>
              </tr>`).join('')}
            </tbody></table>
          </div>
        `;
      }
    });

    const tableWrap = right.querySelector('#diaryTableWrap');
    let filterCategory = '';

    async function renderDiaryTable() {
      let rows = await store.listHistory('trip-diary-entry');
      if (filterCategory) rows = rows.filter((r) => r.result.category === filterCategory);
      if (!rows.length) {
        tableWrap.innerHTML = '<div class="empty-state">No entries yet — add your first initiating cause above.</div>';
        return;
      }
      tableWrap.innerHTML = `<div style="overflow-x:auto;">
        <table><thead><tr><th>Trip Cause</th><th>Category</th><th>What happens</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr data-id="${r.id}">
          <td><b>${r.result.cause}</b></td>
          <td style="font-size:.78rem;color:var(--text-dim);">${r.result.category || '\u2014'}</td>
          <td style="font-size:.84rem;color:var(--text-dim);">${(r.result.response || '\u2014').replace(/</g, '&lt;')}</td>
          <td><span class="diary-del" data-id="${r.id}" role="link" tabindex="0" style="color:var(--red);cursor:pointer;font-size:.78rem;">Delete</span></td>
        </tr>`).join('')}</tbody></table>
      </div>`;
      tableWrap.querySelectorAll('.diary-del').forEach((el) => {
        const del = async () => { await store.deleteCalculation(el.dataset.id); renderDiaryTable(); };
        el.addEventListener('click', del);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); del(); } });
      });
    }

    right.querySelector('#diaryFilterCategory').addEventListener('change', (e) => { filterCategory = e.target.value; renderDiaryTable(); });

    // Auto-fill "What happens" (and category, if not already set) when the
    // typed cause matches a known worked example or researched example —
    // never overwrites text the user has already typed themselves.
    function findKnownCause(causeText) {
      const needle = causeText.trim().toLowerCase();
      if (!needle) return null;
      const researched = trip.RESEARCHED_EXAMPLES.find((ex) => ex.cause.toLowerCase().includes(needle) || needle.includes(ex.cause.toLowerCase().split(' \u2013 ')[0]));
      if (researched) return { response: researched.summary, category: researched.category };
      const worked = trip.CAUSE_ACTION_DIARY.find((r) => r.cause.toLowerCase().includes(needle) || needle.includes(r.cause.toLowerCase()));
      if (worked) {
        const response = `Turbine: ${worked.turbine}. Generator: ${worked.generator}. MFT: ${worked.mft}. Mills: ${worked.mills}. BFP: ${worked.bfp}. CEP: ${worked.cep}. CW: ${worked.cw}. Bypass: ${worked.bypass}.`;
        return { response, category: null };
      }
      return null;
    }
    const diaryCauseInput = right.querySelector('#diaryCause');
    const diaryResponseInput = right.querySelector('#diaryResponse');
    const diaryCategoryInput = right.querySelector('#diaryCategory');
    let lastAutoFill = '';
    diaryCauseInput.addEventListener('input', () => {
      const match = findKnownCause(diaryCauseInput.value);
      const untouched = !diaryResponseInput.value.trim() || diaryResponseInput.value === lastAutoFill;
      if (match && untouched) {
        diaryResponseInput.value = match.response;
        lastAutoFill = match.response;
        if (match.category && !diaryCategoryInput.value) diaryCategoryInput.value = match.category;
      } else if (!match && diaryResponseInput.value === lastAutoFill) {
        diaryResponseInput.value = '';
        lastAutoFill = '';
      }
    });

    right.querySelector('#diaryAddBtn').addEventListener('click', async () => {
      const cause = right.querySelector('#diaryCause').value.trim();
      if (!cause) { toast('Enter the initiating trip cause first'); return; }
      const category = right.querySelector('#diaryCategory').value;
      const response = right.querySelector('#diaryResponse').value.trim();
      await store.saveCalculation({ calculatorId: 'trip-diary-entry', name: `Trip Diary — ${cause}`, inputs: { cause }, result: { cause, category, response } });
      toast('Added to Trip Diary');
      right.querySelector('#diaryCause').value = '';
      right.querySelector('#diaryCategory').value = '';
      right.querySelector('#diaryResponse').value = '';
      lastAutoFill = '';
      renderDiaryTable();
    });

    const exportDiary = async () => {
      const rows = await store.listHistory('trip-diary-entry');
      if (!rows.length) { toast('Add at least one diary entry first'); return; }
      const resultForPdf = {};
      for (const r of rows) {
        resultForPdf[r.result.cause] = { Category: r.result.category || '—', 'What happens': r.result.response || '—' };
      }
      await exportCalculationPDF({
        calculatorName: 'Turbine & Boiler Trip Diary — Cause & Action',
        inputs: { plantType: plantConfig.plantType, unitMW: plantConfig.unitMW, entries: rows.length },
        result: resultForPdf,
        assumptions: { note: 'Sourced from the user\'s own entries — verify against the unit\'s approved C&E/ETS/FSSS drawings before use.' },
      });
    };
    right.querySelector('#diaryExportBtn').addEventListener('click', exportDiary);
    right.querySelector('#diaryExportBtn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportDiary(); } });

    renderDiaryTable();
  }

  function renderMatrix() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    right.innerHTML = `<div class="panel-title">Trip Action Matrix</div>
      <p style="color:var(--text-dim);font-size:.82rem;">Worked examples. The exact valve/isolation sequence is plant-specific and configurable — this is not a universal sequence claim.</p>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Trip source</th><th>Logic</th><th>Trip signal</th><th>Protection action</th></tr></thead><tbody>
          ${trip.TRIP_ACTION_MATRIX.map((r) => `<tr>
            <td><b>${r.source}</b></td>
            <td style="font-size:.8rem;color:var(--text-dim);">${r.logic}</td>
            <td><span class="badge out">${r.signal}</span></td>
            <td style="font-size:.8rem;">${r.action}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>`;
  }

  function renderReference() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    const params = trip.parametersFor(plantConfig.boilerType).map(effectiveParam);
    right.innerHTML = `<div class="panel-title">Reference Profiles — ${plantConfig.oemProfile}</div>
      <div class="assumptions-note">SOURCE for every row below is generic/illustrative unless you've overridden it. "${plantConfig.oemProfile}" changes attribution labeling only — it is not verified data from that manufacturer's proprietary documents (this environment has no access to such documents). Values are never presented as a specific real plant's actual trip settings.</div>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Parameter</th><th>System</th><th>Alarm</th><th>Trip</th><th>Unit</th><th>Data type</th><th>Source</th></tr></thead><tbody>
          ${params.map((p) => `<tr>
            <td>${p.label}</td>
            <td>${p.system}</td>
            <td class="num">${fmt(p.alarmSetpoint,3)}</td>
            <td class="num">${fmt(p.tripSetpoint,3)}</td>
            <td>${p.unit}</td>
            <td><span class="badge ${p.dataType === 'User Configured' ? 'normal' : 'warning'}">${p.dataType}</span></td>
            <td style="font-size:.72rem;color:var(--text-faint);">${p.dataType === 'User Configured' ? 'You' : plantConfig.oemProfile}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
      <h3 style="margin-top:20px;">Override a parameter's setpoints</h3>
      <div class="input-row">
        <div class="field" style="flex:2"><label>Parameter</label>
          <select id="refParamSelect">${params.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select>
        </div>
        <div class="field" style="flex:1"><label>New alarm setpoint</label><input type="number" id="refAlarmOverride" step="any"></div>
        <div class="field" style="flex:1"><label>New trip setpoint</label><input type="number" id="refTripOverride" step="any"></div>
      </div>
      <div class="btn-row"><button class="btn secondary" id="refOverrideBtn">Apply override</button><button class="btn secondary" id="refResetBtn">Reset all overrides</button></div>`;
    right.querySelector('#refOverrideBtn').addEventListener('click', () => {
      const id = right.querySelector('#refParamSelect').value;
      const alarmSetpoint = +right.querySelector('#refAlarmOverride').value;
      const tripSetpoint = +right.querySelector('#refTripOverride').value;
      overrides[id] = { alarmSetpoint, tripSetpoint };
      toast('Override applied — reflected in ETS/MFT dashboards and this table');
      renderReference();
    });
    right.querySelector('#refResetBtn').addEventListener('click', () => {
      for (const k of Object.keys(overrides)) delete overrides[k];
      toast('All overrides reset to reference values');
      renderReference();
    });
  }

  async function renderTripHistory() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    right.innerHTML = `<div class="panel-title">Trip History</div>
      <div class="field" style="max-width:280px;"><label>Filter by classification</label>
        <select id="histFilter"><option value="">All</option>${trip.CLASSIFICATIONS.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div id="histTable"></div>`;
    async function renderTable() {
      const rows = await store.listHistory('trip-event');
      const filter = right.querySelector('#histFilter').value;
      const filtered = filter ? rows.filter((r) => r.result?.classification === filter) : rows;
      const tableDiv = right.querySelector('#histTable');
      if (!filtered.length) { tableDiv.innerHTML = '<div class="empty-state">No trip events recorded yet. Run a simulation and click "Save to Trip History".</div>'; return; }
      tableDiv.innerHTML = `<div style="overflow-x:auto;"><table><thead><tr>
          <th>Date/time</th><th>Parameter</th><th>System</th><th>Measured</th><th>Alarm</th><th>Trip</th><th>Voting</th><th>Result</th><th>Source</th>
        </tr></thead><tbody>
        ${filtered.map((r) => `<tr>
          <td style="font-size:.76rem;">${new Date(r.createdAt).toLocaleString()}</td>
          <td>${r.result?.parameter ?? '—'}</td>
          <td>${r.result?.system ?? '—'}</td>
          <td class="num">${fmt(r.result?.measuredValue, 3)}</td>
          <td class="num">${fmt(r.result?.alarmSetpoint, 3)}</td>
          <td class="num">${fmt(r.result?.tripSetpoint, 3)}</td>
          <td>${r.result?.votingResult ?? '—'}</td>
          <td><span class="badge ${r.result?.tripped ? 'out' : 'normal'}">${r.result?.tripped ? 'TRIPPED' : 'NO TRIP'}</span></td>
          <td style="font-size:.72rem;color:var(--text-faint);">${r.result?.source ?? '—'}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    }
    right.querySelector('#histFilter').addEventListener('change', renderTable);
    renderTable();
  }

  render();
}


// ---------- DP → Flow Wizard ----------
function pageDPFlowWizard() {
  app.appendChild(h(`<div class="page-head">
    <div class="eyebrow">Instrumentation</div>
    <h1>DP → Flow Wizard</h1>
    <p class="lead">A guided, step-by-step walkthrough for turning a DP transmitter reading into an engineering flow value — built for the field, not for re-typing 15 fields into a flat form. Uses the same calculation engine as the Thermal Plant Estimator's Flow Calculator (Mode 4).</p>
  </div>`));

  const card = h('<div class="card" style="max-width:720px;"></div>');
  app.appendChild(card);

  const STEP_LABELS = ['Fluid', 'Element', 'DP', 'P & T', 'Dimensions', 'Properties', 'Flow', 'Units', 'Compare', 'Trace'];
  const wizard = {
    step: 1, fluidChoice: null, elementType: null, elementLabel: null,
    dpKPa: null, pressureKPa: null, tempC: null, pipeIdMm: null, boreMm: null, viscosityPaS: null,
    density: null, flowResult: null, dcsFlowTh: null,
  };

  function progressHTML() {
    let out = '<div class="wizard-progress">';
    for (let i = 1; i <= STEP_LABELS.length; i++) {
      const cls = i < wizard.step ? 'done' : i === wizard.step ? 'active' : '';
      out += `<div class="wizard-dot ${cls}" title="${STEP_LABELS[i - 1]}">${i < wizard.step ? '✓' : i}</div>`;
      if (i < STEP_LABELS.length) out += '<div class="wizard-connector"></div>';
    }
    out += '</div>';
    return out;
  }

  function goTo(step) { wizard.step = step; render(); }

  function render() {
    card.innerHTML = progressHTML() + `<div class="panel-title">Step ${wizard.step} of ${STEP_LABELS.length} — ${STEP_LABELS[wizard.step - 1]}</div><div id="wizBody"></div>`;
    const body = card.querySelector('#wizBody');
    if (wizard.step === 1) renderStep1(body);
    else if (wizard.step === 2) renderStep2(body);
    else if (wizard.step === 3) renderStep3(body);
    else if (wizard.step === 4) renderStep4(body);
    else if (wizard.step === 5) renderStep5(body);
    else if (wizard.step === 6) renderStep6(body);
    else if (wizard.step === 7) renderStep7(body);
    else if (wizard.step === 8) renderStep8(body);
    else if (wizard.step === 9) renderStep9(body);
    else renderStep10(body);
  }

  function backBtn(toStep) {
    return `<div class="btn-row" style="margin-top:16px;"><button class="btn secondary" id="wizBack">← Back</button></div>`;
  }
  function wireBack(body, toStep) {
    const b = body.querySelector('#wizBack');
    if (b) b.addEventListener('click', () => goTo(toStep));
  }

  function renderStep1(body) {
    body.innerHTML = `
      <p style="color:var(--text-dim);">What's flowing through the line?</p>
      <div class="wizard-choice-grid">
        ${['Steam', 'Water', 'Air', 'Gas'].map((f) => `<div class="wizard-choice-card ${wizard.fluidChoice === f ? 'selected' : ''}" data-f="${f}">${f}</div>`).join('')}
      </div>
    `;
    body.querySelectorAll('.wizard-choice-card').forEach((elCard) => elCard.addEventListener('click', () => {
      wizard.fluidChoice = elCard.dataset.f;
      goTo(2);
    }));
  }

  function renderStep2(body) {
    const elements = [['Orifice', 'orifice'], ['Venturi', 'venturi'], ['Nozzle', 'nozzle'], ['Annubar', 'pitot']];
    body.innerHTML = `
      <p style="color:var(--text-dim);">Which primary flow element is installed?</p>
      <div class="wizard-choice-grid">
        ${elements.map(([label, val]) => `<div class="wizard-choice-card ${wizard.elementType === val ? 'selected' : ''}" data-el="${val}" data-label="${label}">${label}</div>`).join('')}
      </div>
      ${backBtn(1)}
    `;
    body.querySelectorAll('.wizard-choice-card').forEach((elCard) => elCard.addEventListener('click', () => {
      wizard.elementType = elCard.dataset.el;
      wizard.elementLabel = elCard.dataset.label;
      goTo(3);
    }));
    wireBack(body, 1);
  }

  function renderStep3(body) {
    body.innerHTML = `
      <p style="color:var(--text-dim);">Enter the measured differential pressure across the ${wizard.elementLabel ?? 'element'}.</p>
      <div class="field"><label>DP (kPa)</label><input type="number" id="wizDp" value="${wizard.dpKPa ?? 5}" step="any"></div>
      <div class="btn-row"><button class="btn" id="wizNext">Next →</button></div>
      ${backBtn(2)}
    `;
    body.querySelector('#wizNext').addEventListener('click', () => {
      const v = +body.querySelector('#wizDp').value;
      if (!(v >= 0)) { toast('Enter a valid, non-negative DP'); return; }
      wizard.dpKPa = v; goTo(4);
    });
    wireBack(body, 2);
  }

  function renderStep4(body) {
    body.innerHTML = `
      <div class="field"><label>Upstream (absolute) pressure (kPa)</label><input type="number" id="wizP" value="${wizard.pressureKPa ?? 101.325}" step="any"></div>
      <div class="field"><label>Temperature (°C)</label><input type="number" id="wizT" value="${wizard.tempC ?? 20}" step="any"></div>
      <div class="btn-row"><button class="btn" id="wizNext">Next →</button></div>
      ${backBtn(3)}
    `;
    body.querySelector('#wizNext').addEventListener('click', () => {
      const p = +body.querySelector('#wizP').value;
      const t = +body.querySelector('#wizT').value;
      if (!(p > 0)) { toast('Enter a valid absolute pressure > 0'); return; }
      wizard.pressureKPa = p; wizard.tempC = t; goTo(5);
    });
    wireBack(body, 4 - 1);
  }

  function renderStep5(body) {
    const isPitot = wizard.elementType === 'pitot';
    body.innerHTML = `
      <div class="field"><label>Pipe internal diameter (mm)</label><input type="number" id="wizPipe" value="${wizard.pipeIdMm ?? 200}" step="any"></div>
      ${isPitot ? '<p style="color:var(--text-faint);font-size:.8rem;">Annubar/averaging pitot uses the full pipe bore — no separate throat diameter needed.</p>' :
        `<div class="field"><label>${wizard.elementType === 'orifice' ? 'Orifice bore' : 'Throat'} diameter (mm)</label><input type="number" id="wizBore" value="${wizard.boreMm ?? 100}" step="any"></div>`}
      <div class="field"><label>Dynamic viscosity (Pa·s, optional — for Reynolds number)</label><input type="number" id="wizVisc" value="${wizard.viscosityPaS ?? ''}" placeholder="optional" step="any"></div>
      <div class="btn-row"><button class="btn" id="wizNext">Next →</button></div>
      ${backBtn(4)}
    `;
    body.querySelector('#wizNext').addEventListener('click', () => {
      const pipe = +body.querySelector('#wizPipe').value;
      const boreEl = body.querySelector('#wizBore');
      const bore = isPitot ? 0 : +boreEl.value;
      if (!(pipe > 0)) { toast('Enter a valid pipe diameter > 0'); return; }
      if (!isPitot && !(bore > 0 && bore < pipe)) { toast('Bore/throat diameter must be > 0 and less than the pipe diameter'); return; }
      const viscRaw = body.querySelector('#wizVisc').value;
      wizard.pipeIdMm = pipe; wizard.boreMm = bore; wizard.viscosityPaS = viscRaw === '' ? null : +viscRaw;
      goTo(6);
    });
    wireBack(body, 5 - 1);
  }

  function renderStep6(body) {
    body.innerHTML = `
      <p style="color:var(--text-dim);">Calculating fluid density from your fluid choice, pressure, and temperature.</p>
      <div class="btn-row"><button class="btn" id="wizCalcProps">Calculate fluid properties</button></div>
      <div id="wizPropsResult" style="margin-top:16px;"></div>
      ${backBtn(5)}
    `;
    body.querySelector('#wizCalcProps').addEventListener('click', () => {
      const pPa = wizard.pressureKPa * 1000;
      try {
        let density, note;
        if (wizard.fluidChoice === 'Water') { density = flow.approxWaterDensity(wizard.tempC); note = 'Standard reference-table density for liquid water (0-300°C), not pressure-corrected — override if you have a precise value.'; }
        else if (wizard.fluidChoice === 'Steam') { density = flow.steamDensityApprox(pPa, wizard.tempC); note = 'Ideal-gas approximation — steam deviates from ideal-gas behavior at high pressure; use for planning estimates.'; }
        else { density = flow.airDensity(pPa, wizard.tempC); note = wizard.fluidChoice === 'Gas' ? 'Generic gas approximated with air\'s properties (ideal gas law) — override if your gas differs significantly (e.g. natural gas, CO2).' : 'Ideal gas law — accurate for combustion air at typical duct conditions.'; }
        wizard.density = density;
        body.querySelector('#wizPropsResult').innerHTML = `
          <div class="readout"><span class="value">${fmt(density,4)}</span><span class="unit">kg/m³</span><div class="label">Calculated Density</div></div>
          <p style="color:var(--text-faint);font-size:.78rem;">${note}</p>
          <div class="btn-row"><button class="btn" id="wizToFlow">Next → Calculate Flow</button></div>
        `;
        body.querySelector('#wizToFlow').addEventListener('click', () => goTo(7));
      } catch (e) { body.querySelector('#wizPropsResult').innerHTML = `<div class="empty-state">${e.message}</div>`; }
    });
    wireBack(body, 5);
  }

  function renderStep7(body) {
    body.innerHTML = `
      <p style="color:var(--text-dim);">Applying the ${wizard.elementLabel} flow equation with the calculated density.</p>
      <div class="btn-row"><button class="btn" id="wizCalcFlow">Calculate flow</button></div>
      <div id="wizFlowResult" style="margin-top:16px;"></div>
      ${backBtn(6)}
    `;
    body.querySelector('#wizCalcFlow').addEventListener('click', () => {
      const fluidClass = wizard.fluidChoice === 'Water' ? 'liquid' : wizard.fluidChoice === 'Steam' ? 'steam' : 'gas';
      try {
        const r = flow.calculateDPFlow({
          elementType: wizard.elementType, fluidClass,
          dpPa: wizard.dpKPa * 1000, upstreamPressurePa: wizard.pressureKPa * 1000, tempC: wizard.tempC,
          pipeIdM: wizard.pipeIdMm / 1000, boreM: wizard.boreMm / 1000,
          densityKgM3: wizard.density, viscosityPaS: wizard.viscosityPaS || undefined,
        });
        wizard.flowResult = r;
        body.querySelector('#wizFlowResult').innerHTML = `
          <div class="readout"><span class="value">${fmt(r.massFlowTh,3)}</span><span class="unit">t/h</span><div class="label">Mass Flow — CALCULATED</div></div>
          <div class="result-grid">
            ${resultRow('Beta ratio', r.beta !== null ? fmt(r.beta,4) : '— (Annubar: full bore)')}
            ${resultRow('Discharge coefficient', fmt(r.cd,4))}
            ${resultRow('Expansion factor', fmt(r.expansionFactor,4))}
            ${resultRow('Velocity', fmt(r.velocityMs,3) + ' m/s')}
            ${resultRow('Reynolds number', r.reynolds !== null ? fmt(r.reynolds,0) : '— (no viscosity entered)')}
          </div>
          <div class="btn-row"><button class="btn" id="wizToUnits">Next → Unit Conversions</button></div>
        `;
        body.querySelector('#wizToUnits').addEventListener('click', () => goTo(8));
      } catch (e) { body.querySelector('#wizFlowResult').innerHTML = `<div class="empty-state">${e.message}</div>`; }
    });
    wireBack(body, 6);
  }

  function renderStep8(body) {
    const r = wizard.flowResult;
    const refTempC = 15.56, refPressureKPa = 101.325; // standard conditions convention for SCFM (60°F/14.696psia)
    const normalM3h = flow.actualToReferenceFlow(r.volumetricFlowM3h, wizard.tempC, wizard.pressureKPa, 0);
    const scfmEquivM3h = flow.actualToReferenceFlow(r.volumetricFlowM3h, wizard.tempC, wizard.pressureKPa, refTempC, refPressureKPa);
    const scfm = flow.convertVolFlow(scfmEquivM3h, 'm3/h', 'ft3/min');
    body.innerHTML = `
      <p style="color:var(--text-dim);">Flow expressed in every practical engineering unit:</p>
      <div class="result-grid">
        ${resultRow('kg/s', fmt(r.massFlowKgS,4))}
        ${resultRow('kg/h', fmt(r.massFlowKgS * 3600,2))}
        ${resultRow('t/h', fmt(r.massFlowTh,3))}
        ${resultRow('m³/h (actual)', fmt(r.volumetricFlowM3h,2))}
        ${resultRow('Nm³/h (0°C, 101.325 kPa)', fmt(normalM3h,2))}
        ${resultRow('SCFM (60°F, 14.696 psia)', fmt(scfm,2))}
      </div>
      <div class="btn-row"><button class="btn" id="wizToCompare">Next → Compare with DCS</button></div>
      ${backBtn(7)}
    `;
    body.querySelector('#wizToCompare').addEventListener('click', () => goTo(9));
    wireBack(body, 7);
  }

  function renderStep9(body) {
    body.innerHTML = `
      <p style="color:var(--text-dim);">If you have a DCS or other actual/reference reading for this line, enter it here to check consistency. Otherwise, skip.</p>
      <div class="field"><label>DCS / actual flow (t/h)</label><input type="number" id="wizDcs" value="${wizard.dcsFlowTh ?? ''}" placeholder="optional" step="any"></div>
      <div class="btn-row">
        <button class="btn" id="wizFinish">Next → Trace & Result</button>
        <button class="btn secondary" id="wizSkip">Skip</button>
      </div>
      ${backBtn(8)}
    `;
    body.querySelector('#wizFinish').addEventListener('click', () => {
      const v = body.querySelector('#wizDcs').value;
      wizard.dcsFlowTh = v === '' ? null : +v;
      goTo(10);
    });
    body.querySelector('#wizSkip').addEventListener('click', () => { wizard.dcsFlowTh = null; goTo(10); });
    wireBack(body, 8);
  }

  function renderStep10(body) {
    const r = wizard.flowResult;
    const dq = flow.validateDPFlowInputs({ beta: r.beta, reynolds: r.reynolds, cd: r.cd, dpPa: wizard.dpKPa * 1000, densityKgM3: r.density });
    let comparisonHTML = '<div class="empty-state">No DCS/actual value entered — skipped consistency check.</div>';
    if (wizard.dcsFlowTh !== null) {
      const check = flow.consistencyCheck(wizard.dcsFlowTh, r.massFlowTh, 5);
      comparisonHTML = check.withinTolerance
        ? `<span class="badge normal">WITHIN TOLERANCE</span> Wizard-calculated ${fmt(r.massFlowTh,2)} t/h vs. DCS ${fmt(wizard.dcsFlowTh,2)} t/h — deviation ${fmt(check.deviationPct,2)}%`
        : `<span class="badge out">WARNING</span> deviation ${fmt(check.deviationPct,2)}% exceeds ±5%. Possible causes:
           <ul style="margin:8px 0 0 18px;color:var(--text-dim);font-size:.82rem;">${check.possibleCauses.map((c) => `<li>${c}</li>`).join('')}</ul>`;
    }
    body.innerHTML = `
      <div class="readout"><span class="value">${fmt(r.massFlowTh,3)}</span><span class="unit">t/h</span><div class="label">Final Result — CALCULATED (data quality ${dq.score}%)</div></div>
      <h3>Calculation trace [SHOW CALCULATION]</h3>
      <table><thead><tr><th>Step</th><th>Value</th></tr></thead><tbody>
        ${r.trace.map((s) => `<tr><td>${s.step}</td><td class="num">${s.value === null ? '—' : fmt(s.value, 4) + ' ' + s.unit}</td></tr>`).join('')}
      </tbody></table>
      <h3 style="margin-top:16px;">Comparison with DCS/actual</h3>
      <div>${comparisonHTML}</div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn secondary" id="wizSave">Save to history</button>
        <button class="btn secondary" id="wizRestart">Start over</button>
      </div>
      ${backBtn(9)}
    `;
    body.querySelector('#wizSave').addEventListener('click', () => saveAndToast(
      'flow-dp-wizard',
      `DP Wizard — ${wizard.fluidChoice}/${wizard.elementLabel} — ${fmt(r.massFlowTh,2)} t/h`,
      { fluid: wizard.fluidChoice, element: wizard.elementLabel, dpKPa: wizard.dpKPa, pressureKPa: wizard.pressureKPa, tempC: wizard.tempC, pipeIdMm: wizard.pipeIdMm, boreMm: wizard.boreMm, dcsFlowTh: wizard.dcsFlowTh },
      { massFlowTh: r.massFlowTh, volumetricFlowM3h: r.volumetricFlowM3h, dataQualityScore: dq.score }
    ));
    body.querySelector('#wizRestart').addEventListener('click', () => {
      Object.assign(wizard, { step: 1, fluidChoice: null, elementType: null, elementLabel: null, dpKPa: null, pressureKPa: null, tempC: null, pipeIdMm: null, boreMm: null, viscosityPaS: null, density: null, flowResult: null, dcsFlowTh: null });
      render();
    });
    wireBack(body, 9);
  }

  render();
}

// ---------- Support the Project ----------
function pageSupport() {
  // SITE OWNER: replace with your real UPI ID before publishing — this is a
  // placeholder. A UPI ID is enough to receive real payments (no payment
  // gateway account needed); this page never touches the money itself.
  // Real UPI ID and payee name, decoded directly from the site owner's own
  // uploaded PhonePe/ICICI Bank QR code — not a placeholder.
  const UPI_ID = 'getkundan.singh@ibl';
  // The site owner's actual QR image (cropped from their uploaded scan
  // card). It's a static image, so it can't encode the donation amount —
  // scanning it means entering the amount by hand in the UPI app. This is
  // the only payment path shown (no separate deep-link button): UPI apps
  // often show an extra security check for links opened from a website,
  // which was confusing donors, while a QR scan is the path they already
  // trust and use every day.
  const QR_IMAGE_SRC = './assets/support-qr.png';

  app.appendChild(h(`
    <div>
    <div class="page-head">
      <div class="eyebrow">Reference</div>
    </div>
    <div class="support-hero">
      <div class="heart">❤️</div>
      <h1>Support the Project</h1>
      <p>Help us build knowledge, skills, and opportunities for the next generation.</p>
      <p>Every contribution matters. Please support this initiative.</p>
      <div style="margin-top:18px;color:var(--amber);font-weight:600;">💝 Donate Now</div>
      <button class="btn-donate" id="openDonateBtn" type="button">DONATE ❤️</button>
    </div>
    <div class="support-footer-sig">
      <div class="name">Built &amp; Maintained by Dr. Kundan</div>
      <div>Engineering • Automation • Instrumentation • Power Plant Technology</div>
      <div>&copy; 2026 Dr. Kundan — All Rights Reserved</div>
    </div>

    <div class="donate-modal-backdrop" id="donateModalBackdrop">
      <div class="donate-modal" role="dialog" aria-modal="true" aria-labelledby="donateModalTitle">
        <button class="donate-modal-close" id="donateModalClose" type="button" aria-label="Close">✕</button>
        <div id="donateModalBody"></div>
      </div>
    </div>
    </div>
  `));

  const backdrop = document.getElementById('donateModalBackdrop');
  const modalBody = document.getElementById('donateModalBody');
  let selectedAmount = null;

  function closeModal() {
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }
  function openModal() {
    selectedAmount = null;
    renderAmountStep();
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  document.getElementById('openDonateBtn').addEventListener('click', openModal);
  document.getElementById('donateModalClose').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal(); });

  function renderAmountStep() {
    modalBody.innerHTML = `
      <h3 id="donateModalTitle">Enter Donation Amount</h3>
      <div class="field"><label>Amount (₹)</label><input type="number" id="donateCustomInput" placeholder="Enter amount" min="1" value="${selectedAmount ?? ''}"></div>
      <div class="donate-amounts">
        <div class="donate-amt" data-amt="100">₹100</div>
        <div class="donate-amt" data-amt="500">₹500</div>
        <div class="donate-amt" data-amt="1000">₹1,000</div>
        <div class="donate-amt" data-amt="2000">₹2,000</div>
        <div class="donate-amt" data-amt="custom" style="grid-column:span 2;">Custom</div>
      </div>
      <div class="btn-row"><button class="btn" id="proceedDonateBtn" style="width:100%;justify-content:center;">Proceed to Donate</button></div>
    `;
    const input = modalBody.querySelector('#donateCustomInput');
    modalBody.querySelectorAll('.donate-amt').forEach((btn) => {
      btn.addEventListener('click', () => {
        modalBody.querySelectorAll('.donate-amt').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (btn.dataset.amt === 'custom') { input.value = ''; input.focus(); selectedAmount = null; }
        else { input.value = btn.dataset.amt; selectedAmount = +btn.dataset.amt; }
      });
    });
    input.addEventListener('input', () => {
      modalBody.querySelectorAll('.donate-amt').forEach((b) => b.classList.remove('selected'));
      selectedAmount = input.value ? +input.value : null;
    });
    modalBody.querySelector('#proceedDonateBtn').addEventListener('click', () => {
      const amt = input.value ? +input.value : null;
      if (!amt || amt <= 0) { toast('Please enter a donation amount first'); return; }
      selectedAmount = amt;
      renderPayStep();
    });
  }

  function renderPayStep() {
    modalBody.innerHTML = `
      <h3>Scan &amp; Pay — ₹${fmt(selectedAmount, 0)}</h3>
      <div class="qr-wrap"><img src="${QR_IMAGE_SRC}" alt="UPI QR code — Kundan Kumar"></div>
      <div class="scan-pay-note">📱 <strong>Scan this QR with your UPI app's camera/scan option</strong> (Google Pay, PhonePe, Paytm, BHIM) — then enter ₹${fmt(selectedAmount, 0)}.</div>
      <div class="upi-id-row"><span id="donateUpiIdText">${UPI_ID}</span><button type="button" id="donateCopyUpiBtn">Copy</button></div>
      <button class="btn" id="haveDonatedBtn" type="button" style="width:100%;justify-content:center;background:var(--green);border-color:var(--green);color:#06210c;">I Have Donated</button>
    `;
    modalBody.querySelector('#donateCopyUpiBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(UPI_ID);
        const btn = modalBody.querySelector('#donateCopyUpiBtn');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      } catch (e) { /* clipboard unavailable — UPI ID is still shown as text */ }
    });
    modalBody.querySelector('#haveDonatedBtn').addEventListener('click', () => {
      saveAndToast('project-donation', `Donation — ₹${fmt(selectedAmount,0)}`, { amount: selectedAmount }, { amount: selectedAmount, status: 'Self-reported by donor' });
      renderSuccessStep();
    });
  }

  function renderSuccessStep() {
    modalBody.innerHTML = `
      <div class="donate-success" style="position:relative;">
        <span class="big-heart">🙏</span>
        <h3>Thank You for Your Donation!</h3>
        <p>Your generous support means a lot and helps us continue building this initiative for students and the next generation. ❤️</p>
        <div class="btn-row" style="margin-top:20px;justify-content:center;"><button class="btn secondary" id="closeSuccessBtn">Close</button></div>
      </div>
    `;
    // subtle confetti-lite burst, purely decorative CSS animation
    const colors = ['var(--amber)', 'var(--green)', 'var(--cyan)', 'var(--red)'];
    const successBox = modalBody.querySelector('.donate-success');
    for (let i = 0; i < 14; i++) {
      const dot = document.createElement('span');
      dot.className = 'confetti-dot';
      dot.style.left = `${10 + Math.random() * 80}%`;
      dot.style.top = '10px';
      dot.style.background = colors[i % colors.length];
      dot.style.animationDelay = `${Math.random() * 0.3}s`;
      successBox.appendChild(dot);
    }
    modalBody.querySelector('#closeSuccessBtn').addEventListener('click', closeModal);
  }
}

// ---------- Reviews & Ratings ----------
async function pageReviews() {
  app.appendChild(h(`
    <div class="page-head">
      <div class="eyebrow">Reference</div>
      <h1>Reviews &amp; Ratings</h1>
      <p class="lead">Tell other engineers what you think — ratings and reviews are stored locally in your browser, the same as your calculation history.</p>
    </div>
  `));

  const layout = h('<div class="calc-layout"></div>');
  const formCard = h('<div class="card"></div>');
  const listCard = h('<div class="card"></div>');
  layout.append(formCard, listCard);
  app.appendChild(layout);

  let currentRating = 0;

  function renderForm() {
    formCard.innerHTML = `
      <div class="panel-title">Write a Review</div>
      <div class="field"><label>Your name</label><input type="text" id="revName" placeholder="e.g. Priya S." maxlength="60"></div>
      <div class="field">
        <label>Your rating</label>
        <div class="star-input" id="revStars">
          ${[1,2,3,4,5].map((n) => `<span class="star" data-val="${n}">★</span>`).join('')}
        </div>
      </div>
      <div class="field"><label>Your review</label><textarea id="revText" rows="5" maxlength="800" placeholder="What did you use this app for? What worked well, what could be better?" style="width:100%;padding:9px 11px;background:var(--bg-inset);border:1px solid var(--line);border-radius:var(--radius);color:var(--text);font-family:inherit;resize:vertical;"></textarea></div>
      <div class="btn-row"><button class="btn" id="revSubmit">Submit Review</button></div>
    `;
    const starEls = formCard.querySelectorAll('#revStars .star');
    function paintStars() {
      starEls.forEach((s) => s.classList.toggle('filled', +s.dataset.val <= currentRating));
    }
    starEls.forEach((s) => s.addEventListener('click', () => { currentRating = +s.dataset.val; paintStars(); }));
    paintStars();

    formCard.querySelector('#revSubmit').addEventListener('click', async () => {
      const reviewerName = formCard.querySelector('#revName').value.trim();
      const reviewText = formCard.querySelector('#revText').value.trim();
      if (!reviewerName) { toast('Please enter your name'); return; }
      if (currentRating < 1) { toast('Please select a star rating'); return; }
      if (!reviewText) { toast('Please write a short review'); return; }
      await store.saveCalculation({
        calculatorId: 'user-review',
        name: `${reviewerName} — ${currentRating}★`,
        inputs: { reviewerName, rating: currentRating, reviewText },
        result: { reviewerName, rating: currentRating, reviewText },
      });
      toast('Thank you for your review!');
      currentRating = 0;
      renderForm();
      renderList();
    });
  }

  async function renderList() {
    const rows = await store.listHistory('user-review');
    const ratings = rows.map((r) => r.result?.rating).filter((n) => typeof n === 'number');
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const avgRounded = Math.round(avg);

    listCard.innerHTML = `
      <div class="panel-title">Average Rating</div>
      <p style="color:var(--text-faint);font-size:.76rem;margin:-4px 0 14px;">Individual reviewer names and comments are kept private — only the overall average is shown here.</p>
      <div class="review-summary">
        <div class="avg-num">${ratings.length ? avg.toFixed(1) : '—'}</div>
        <div>
          <div class="star-display">${'★'.repeat(avgRounded)}${'☆'.repeat(5 - avgRounded)}</div>
          <div class="avg-meta">${ratings.length} review${ratings.length === 1 ? '' : 's'}</div>
        </div>
      </div>
    `;
  }

  renderForm();
  await renderList();
}

// ---------- Admin Panel ----------
function pageAdmin() {
  if (!adminMode) {
    app.appendChild(h(`
      <div>
      <div class="page-head"><div class="eyebrow">Admin</div><h1>Admin Panel</h1></div>
      <div class="card"><div class="empty-state">Not signed in. Use the "Admin" link at the bottom of the sidebar.</div></div>
      </div>
    `));
    return;
  }
  app.appendChild(h(`
    <div>
    <div class="page-head">
      <div class="eyebrow">Admin</div>
      <h1>Content Visibility</h1>
      <p class="lead">Tick which sidebar items are visible to public visitors. This updates your preview immediately, but real visitors won't see the change until you copy the JSON below into <code>data/content-visibility.json</code> and push it to your live site.</p>
    </div>
    <div class="assumptions-note">This admin gate is a local, soft deterrent only — this site has no backend server, so there's nothing for a password to be securely checked against. Anyone with browser dev tools could bypass it. Don't rely on it to protect anything sensitive, and change the default password (instructions in the README) before publishing.</div>
    <div class="card" id="adminChecklist" style="margin-top:16px;"></div>
    <div class="card" style="margin-top:16px;">
      <div class="panel-title">Updated content-visibility.json</div>
      <p style="color:var(--text-dim);font-size:.82rem;">Copy this into <code>data/content-visibility.json</code> in your repo, commit, and push.</p>
      <textarea id="adminJsonOut" rows="10" readonly style="width:100%;padding:10px;background:var(--bg-inset);border:1px solid var(--line);border-radius:var(--radius);color:var(--text);font-family:var(--font-mono);font-size:.78rem;"></textarea>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn secondary" id="adminCopyBtn">Copy JSON</button>
        <button class="btn secondary" id="adminLogoutBtn">Log out of admin mode</button>
      </div>
    </div>
    </div>
  `));

  const checklist = document.getElementById('adminChecklist');
  const rows = NAV.flatMap((group) => group.items.map((item) => ({ ...item, group: group.group })));
  checklist.innerHTML = rows.map((item) => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft);cursor:pointer;">
      <input type="checkbox" data-id="${item.id}" ${contentVisibility[item.id] !== false ? 'checked' : ''} style="width:16px;height:16px;">
      <span style="color:var(--text-faint);font-size:.72rem;font-family:var(--font-mono);width:110px;flex-shrink:0;">${item.group}</span>
      <span>${item.icon} ${item.label}</span>
    </label>
  `).join('');

  function refreshJson() {
    const out = { _comment: 'Controls which sidebar items are visible to public visitors. Edit via the app\'s Admin Panel (checkboxes generate updated JSON to paste here), or edit this file directly. Changes only take effect for real visitors after this file is committed and pushed to your live site.', items: { ...contentVisibility } };
    document.getElementById('adminJsonOut').value = JSON.stringify(out, null, 2);
  }
  checklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      contentVisibility[cb.dataset.id] = cb.checked;
      refreshJson();
      renderNav(currentRoute); // live preview in this session
    });
  });
  refreshJson();

  document.getElementById('adminCopyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('adminJsonOut').value);
      toast('Copied — paste into data/content-visibility.json');
    } catch (e) { toast('Copy failed — select the text manually'); }
  });
  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    adminMode = false;
    toast('Logged out of admin mode');
    navigate('');
  });
}

// ---------- Cable Sizing & Voltage Drop ----------
function pageCableSizing() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Cable Sizing &amp; Voltage Drop</h1>
    <p class="lead">Voltage drop along a run, plus ampacity after derating. Cables are often sized by voltage drop rather than current \u2014 a cable that carries the load comfortably can still leave too little voltage at the far end.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Load &amp; Route</div>
    <div class="input-row">
      <div class="field"><label>Load current (A)</label><input type="number" id="i" step="any" value="100"></div>
      <div class="field"><label>Route length (m)</label><input type="number" id="len" step="any" value="150"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>System voltage (V)</label><input type="number" id="v" step="any" value="415"></div>
      <div class="field"><label>System</label><select id="sys">${ed.SYSTEM_TYPES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Power factor</label><input type="number" id="pf" step="any" value="0.85"></div>
      <div class="field"><label>Parallel runs</label><input type="number" id="par" step="1" value="1"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Cable Data (from manufacturer)</div>
    <div class="input-row">
      <div class="field"><label>R (\u03a9/km)</label><input type="number" id="r" step="any" value="0.164"></div>
      <div class="field"><label>X (\u03a9/km)</label><input type="number" id="x" step="any" value="0.08"></div>
    </div>
    <div class="hint">Per-conductor values straight off the cable datasheet. Set X to 0 for a DC circuit.</div>
    <div class="panel-title" style="margin-top:14px;">Ampacity Derating (optional)</div>
    <div class="input-row">
      <div class="field"><label>Base ampacity (A)</label><input type="number" id="base" step="any" value="250"></div>
      <div class="field"><label>Ambient factor</label><input type="number" id="fa" step="any" value="0.87"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Grouping factor</label><input type="number" id="fg" step="any" value="0.8"></div>
      <div class="field"><label>Soil / other factor</label><input type="number" id="fs" step="any" value="1"></div>
    </div>
    <div class="hint">Base ampacity comes from the applicable cable table for your installation method \u2014 it isn't invented here.</div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter cable and load data.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const i = +left.querySelector('#i').value;
      const v = +left.querySelector('#v').value;
      const vd = ed.voltageDrop({
        currentA: i, lengthM: +left.querySelector('#len').value,
        rOhmPerKm: +left.querySelector('#r').value, xOhmPerKm: +left.querySelector('#x').value,
        voltageV: v, systemType: left.querySelector('#sys').value,
        parallelRuns: +left.querySelector('#par').value, powerFactor: +left.querySelector('#pf').value,
      });
      const base = +left.querySelector('#base').value;
      let ampHtml = '';
      if (base > 0) {
        const amp = ed.deratedAmpacity({
          baseAmpacityA: base,
          ambientFactor: +left.querySelector('#fa').value,
          groupingFactor: +left.querySelector('#fg').value,
          soilResistivityFactor: +left.querySelector('#fs').value,
          designCurrentA: i,
        });
        ampHtml = `
          <div class="panel-title" style="margin-top:16px;">Ampacity Check</div>
          <div class="result-grid">
            ${resultRow('Total derating factor', fmt(amp.totalDeratingFactor, 4))}
            ${resultRow('Derated ampacity', fmt(amp.deratedAmpacityA, 2) + ' A')}
            ${resultRow('Utilisation', fmt(amp.utilisationPct, 1) + ' %')}
            ${resultRow('Verdict', amp.check === 'ADEQUATE' ? '<span class="badge normal">ADEQUATE</span>' : '<span class="badge out">UNDERSIZED</span>')}
          </div>`;
      }
      const dropBadge = vd.dropPct <= 3 ? 'normal' : vd.dropPct <= 5 ? 'warning' : 'out';
      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(vd.dropPct, 3)}</span><span class="unit">% voltage drop</span></div>
        <div class="result-grid">
          ${resultRow('Voltage drop', fmt(vd.dropV, 3) + ' V')}
          ${resultRow('Receiving-end voltage', fmt(vd.receivingEndV, 2) + ' V')}
          ${resultRow('Effective resistance', fmt(vd.resistanceOhm, 5) + ' \u03a9')}
          ${resultRow('Effective reactance', fmt(vd.reactanceOhm, 5) + ' \u03a9')}
          ${resultRow('Drop band', `<span class="badge ${dropBadge}">${fmt(vd.dropPct, 2)} %</span>`)}
        </div>
        ${ampHtml}
        <div class="formula-box" style="margin-top:12px;">3-phase: \u0394V = \u221a3 \u00b7 I \u00b7 L \u00b7 (R\u00b7cos\u03c6 + X\u00b7sin\u03c6)<br>1-phase: \u0394V = 2 \u00b7 I \u00b7 L \u00b7 (R\u00b7cos\u03c6 + X\u00b7sin\u03c6)</div>
        <div class="assumptions-note" style="margin-top:12px;">Acceptable voltage drop limits are set by the applicable wiring standard and by the connected equipment's tolerance \u2014 commonly around 3% for lighting and 5% for power circuits, but confirm against the standard that applies to your installation rather than treating those figures as universal.</div>
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('cable-sizing',
        `Cable \u2014 ${fmt(vd.dropPct, 2)}% drop`, { i, v }, { dropV: vd.dropV, dropPct: vd.dropPct }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Short-Circuit Withstand ----------
function pageCableWithstand() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Short-Circuit Withstand</h1>
    <p class="lead">Whether a conductor survives a fault before the protection clears it, by the standard adiabatic method. Applies equally to cable conductors and earthing conductors.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Fault</div>
    <div class="input-row">
      <div class="field"><label>Fault current (A)</label><input type="number" id="if" step="any" value="25000"></div>
      <div class="field"><label>Clearing time (s)</label><input type="number" id="t" step="any" value="0.5"></div>
    </div>
    <div class="hint">Use the protection's <b>total</b> clearing time \u2014 relay operating time plus circuit-breaker opening time, not the relay alone.</div>
    <div class="panel-title" style="margin-top:14px;">Conductor</div>
    <div class="input-row">
      <div class="field"><label>k factor</label><input type="number" id="k" step="any" value="143"></div>
      <div class="field"><label>Actual CSA (mm\u00b2)</label><input type="number" id="csa" step="any" value="185"></div>
    </div>
    <div class="hint">k comes from the applicable standard for your conductor and insulation combination \u2014 it depends on the material and on the permitted initial and final temperatures, so it isn't assumed here.</div>
    <div class="btn-row"><button class="btn" id="calc">Check</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter fault and conductor data.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const r = ed.adiabaticMinimumCsa({
        faultCurrentA: +left.querySelector('#if').value,
        faultDurationS: +left.querySelector('#t').value,
        kFactor: +left.querySelector('#k').value,
        actualCsaMm2: +left.querySelector('#csa').value || undefined,
      });
      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(r.minCsaMm2, 2)}</span><span class="unit">mm\u00b2 minimum</span></div>
        <div class="result-grid">
          ${resultRow('Minimum required CSA', fmt(r.minCsaMm2, 3) + ' mm\u00b2')}
          ${resultRow('Actual CSA', r.actualCsaMm2 === null ? 'not supplied' : fmt(r.actualCsaMm2, 1) + ' mm\u00b2')}
          ${resultRow('Margin', r.marginPct === null ? '\u2014' : fmt(r.marginPct, 1) + ' %')}
          ${resultRow('Withstand current', r.withstandA === null ? '\u2014' : fmt(r.withstandA, 0) + ' A for this duration')}
          ${resultRow('Verdict', r.check === null ? '\u2014' : r.check === 'ADEQUATE' ? '<span class="badge normal">ADEQUATE</span>' : '<span class="badge out">INADEQUATE</span>')}
          ${resultRow('Adiabatic assumption', r.adiabaticValid ? '<span class="badge normal">valid</span>' : '<span class="badge warning">questionable</span>')}
        </div>
        <div class="formula-box" style="margin-top:12px;">S = I \u00b7 \u221at / k</div>
        <div class="assumptions-note" style="margin-top:12px;">${r.note}</div>`;
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Motor Starting Dip ----------
function pageMotorStart() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Motor Starting Voltage Dip</h1>
    <p class="lead">Bus voltage dip when a large motor starts direct-on-line. The dip matters twice over: other equipment may drop out, and the starting motor's own torque falls with the <b>square</b> of voltage.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Motor</div>
    <div class="input-row">
      <div class="field"><label>Rating (kW)</label><input type="number" id="kw" step="any" value="1000"></div>
      <div class="field"><label>Voltage (kV)</label><input type="number" id="kv" step="any" value="6.6"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Power factor</label><input type="number" id="pf" step="any" value="0.85"></div>
      <div class="field"><label>Efficiency (%)</label><input type="number" id="eff" step="any" value="95"></div>
    </div>
    <div class="field"><label>Starting current (\u00d7 FLC)</label><input type="number" id="mult" step="any" value="6"></div>
    <div class="panel-title" style="margin-top:14px;">Supply</div>
    <div class="input-row">
      <div class="field"><label>Source fault level (MVA)</label><input type="number" id="mva" step="any" value="250"></div>
      <div class="field"><label>Permitted dip (%)</label><input type="number" id="lim" step="any" value="15"></div>
    </div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter motor and supply data.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const r = ed.motorStartingDip({
        motorKW: +left.querySelector('#kw').value, voltageKV: +left.querySelector('#kv').value,
        powerFactor: +left.querySelector('#pf').value, efficiencyPct: +left.querySelector('#eff').value,
        startingCurrentMultiple: +left.querySelector('#mult').value,
        sourceFaultMVA: +left.querySelector('#mva').value,
        permittedDipPct: +left.querySelector('#lim').value,
      });
      const badge = r.check === 'ACCEPTABLE' ? 'normal' : 'out';
      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(r.dipPct, 2)}</span><span class="unit">% voltage dip</span></div>
        <div class="result-grid">
          ${resultRow('Full-load current', fmt(r.flcA, 1) + ' A')}
          ${resultRow('Starting current', fmt(r.startingCurrentA, 1) + ' A')}
          ${resultRow('Starting kVA', fmt(r.startingKVA, 1) + ' kVA')}
          ${resultRow('Voltage dip', fmt(r.dipPct, 3) + ' %')}
          ${resultRow('Residual voltage', fmt(r.residualVoltagePct, 2) + ' %')}
          ${resultRow('Available torque', fmt(r.torqueAtDipPct, 1) + ' % of full-voltage torque')}
          ${resultRow('Verdict', `<span class="badge ${badge}">${r.check}</span>`)}
        </div>
        <div class="formula-box" style="margin-top:12px;">dip(pu) = kVA_start / (kVA_start + MVA_fault \u00d7 1000)<br>torque \u221d V\u00b2</div>
        <div class="assumptions-note" style="margin-top:12px;">${r.note}</div>
        <div class="assumptions-note" style="margin-top:10px;">This is a screening calculation assuming a stiff source behind a single impedance and a direct-on-line start. It doesn't model intervening transformer and cable impedance in detail, motor dynamics, or reduced-voltage starting methods \u2014 a marginal result should go to a proper transient study.</div>
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('motor-start',
        `Motor start \u2014 ${fmt(r.dipPct, 2)}% dip`, {}, { dipPct: r.dipPct, check: r.check }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Power Factor Correction ----------
function pagePfCorrection() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Power Factor Correction</h1>
    <p class="lead">Capacitor kVAr needed to reach a target power factor \u2014 and the transformer and cable capacity that correcting it frees up.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Load</div>
    <div class="input-row">
      <div class="field"><label>Real power (kW)</label><input type="number" id="kw" step="any" value="500"></div>
      <div class="field"><label>Voltage (kV)</label><input type="number" id="kv" step="any" value="0.415"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Existing PF</label><input type="number" id="pf1" step="any" value="0.75"></div>
      <div class="field"><label>Target PF</label><input type="number" id="pf2" step="any" value="0.95"></div>
    </div>
    <div class="field"><label>Frequency (Hz)</label><input type="number" id="hz" step="any" value="50"></div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter load and power factors.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const r = ed.powerFactorCorrection({
        loadKW: +left.querySelector('#kw').value,
        existingPF: +left.querySelector('#pf1').value,
        targetPF: +left.querySelector('#pf2').value,
        voltageKV: +left.querySelector('#kv').value,
        frequencyHz: +left.querySelector('#hz').value,
      });
      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(r.kvarRequired, 1)}</span><span class="unit">kVAr required</span></div>
        <div class="result-grid">
          ${resultRow('Reactive power before', fmt(r.kvarBefore, 1) + ' kVAr')}
          ${resultRow('Reactive power after', fmt(r.kvarAfter, 1) + ' kVAr')}
          ${resultRow('Capacitor rating', fmt(r.kvarRequired, 2) + ' kVAr')}
          ${resultRow('Apparent power before', fmt(r.kvaBefore, 1) + ' kVA')}
          ${resultRow('Apparent power after', fmt(r.kvaAfter, 1) + ' kVA')}
          ${resultRow('Capacity released', fmt(r.releasedKVA, 1) + ' kVA')}
          ${resultRow('Current reduction', fmt(r.currentReductionPct, 1) + ' %')}
          ${resultRow('Capacitance (per phase, star equiv.)', r.capacitanceUF === null ? '\u2014' : fmt(r.capacitanceUF, 1) + ' \u00b5F')}
        </div>
        <div class="formula-box" style="margin-top:12px;">kVAr = kW \u00b7 (tan\u03c6\u2081 \u2212 tan\u03c6\u2082)</div>
        <div class="assumptions-note" style="margin-top:12px;">Correcting power factor frees ${fmt(r.releasedKVA, 1)} kVA of transformer and cable capacity that reactive current was previously consuming \u2014 often the strongest part of the business case. Watch for harmonics: capacitors and system inductance can resonate, and detuned reactors are commonly needed where significant harmonic sources are present.</div>
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('pf-correction',
        `PF correction \u2014 ${fmt(r.kvarRequired, 1)} kVAr`, {}, { kvarRequired: r.kvarRequired }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Battery / DC Sizing ----------
function pageBatterySizing() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Battery / DC System Sizing</h1>
    <p class="lead">Required battery capacity from a DC duty cycle, with temperature, ageing and design margins applied. The plant DC system is what holds up protection, tripping and emergency lubrication when AC is gone.</p></div>`));

  let steps = [{ currentA: 50, durationMin: 60 }, { currentA: 200, durationMin: 1 }];

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Duty Cycle</div>
    <div id="stepsWrap"></div>
    <div class="btn-row" style="margin-top:8px;"><button class="btn secondary" id="addStep">+ Add step</button></div>
    <div class="panel-title" style="margin-top:14px;">Factors</div>
    <div class="input-row">
      <div class="field"><label>Temperature factor</label><input type="number" id="ft" step="any" value="1.0"></div>
      <div class="field"><label>Ageing factor</label><input type="number" id="fa" step="any" value="1.25"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Design margin</label><input type="number" id="fd" step="any" value="1.10"></div>
      <div class="field"><label>System voltage (V)</label><input type="number" id="sv" step="any" value="110"></div>
    </div>
    <div class="hint">Ageing factor is normally about 1.25, since batteries are sized to still perform at end of life (typically 80% of rated capacity).</div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Define the duty cycle and calculate.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  const stepsWrap = left.querySelector('#stepsWrap');
  function renderSteps() {
    stepsWrap.innerHTML = steps.map((s, i) => `
      <div class="input-row" data-i="${i}" style="align-items:flex-end;flex-wrap:nowrap;gap:8px;">
        <div class="field" style="flex:1;min-width:0;"><label>${i === 0 ? 'Current (A)' : ''}</label><input type="number" class="s-i" step="any" value="${s.currentA}"></div>
        <div class="field" style="flex:1;min-width:0;"><label>${i === 0 ? 'Duration (min)' : ''}</label><input type="number" class="s-d" step="any" value="${s.durationMin}"></div>
        <div class="field" style="flex:0 0 auto;"><label>${i === 0 ? '&nbsp;' : ''}</label><button class="btn secondary s-del" style="padding:8px 10px;">\u2715</button></div>
      </div>`).join('');
    stepsWrap.querySelectorAll('.s-del').forEach((b, i) => b.addEventListener('click', () => {
      if (steps.length === 1) { toast('Keep at least one load step'); return; }
      readSteps(); steps.splice(i, 1); renderSteps();
    }));
  }
  function readSteps() {
    steps = [...stepsWrap.querySelectorAll('.input-row')].map((r) => ({
      currentA: +r.querySelector('.s-i').value,
      durationMin: +r.querySelector('.s-d').value,
    }));
  }
  renderSteps();
  left.querySelector('#addStep').addEventListener('click', () => { readSteps(); steps.push({ currentA: 10, durationMin: 30 }); renderSteps(); });

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      readSteps();
      const r = ed.batterySizing({
        loadSteps: steps,
        temperatureFactor: +left.querySelector('#ft').value,
        ageingFactor: +left.querySelector('#fa').value,
        designMargin: +left.querySelector('#fd').value,
        systemVoltageV: +left.querySelector('#sv').value,
      });
      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(r.requiredAh, 1)}</span><span class="unit">Ah required</span></div>
        <div class="result-grid">
          ${resultRow('Duty cycle demand', fmt(r.dutyAh, 3) + ' Ah')}
          ${resultRow('Combined factor', fmt(r.combinedFactor, 4))}
          ${resultRow('Required capacity', fmt(r.requiredAh, 2) + ' Ah')}
          ${resultRow('Total duration', fmt(r.totalDurationMin, 1) + ' min')}
          ${resultRow('Peak current', fmt(r.peakCurrentA, 1) + ' A')}
          ${resultRow('Cells in series', r.cellCount === null ? '\u2014' : r.cellCount + ' (at 2.0 V/cell)')}
        </div>
        <div style="overflow-x:auto;margin-top:14px;">
          <table><thead><tr><th class="num">Step</th><th class="num">Current</th><th class="num">Duration</th><th class="num">Ah</th></tr></thead><tbody>
            ${steps.map((s, i) => `<tr><td class="num">${i + 1}</td><td class="num">${fmt(s.currentA, 1)} A</td><td class="num">${fmt(s.durationMin, 1)} min</td><td class="num">${fmt(s.currentA * s.durationMin / 60, 3)}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="assumptions-note" style="margin-top:12px;">${r.note}</div>`;
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Transformer Loading ----------
function pageTxLoading() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Transformer Loading &amp; Losses</h1>
    <p class="lead">Efficiency and loss breakdown at a given load. Iron loss is constant while copper loss varies with the square of load \u2014 which is why peak efficiency sits well below full load.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Transformer</div>
    <div class="input-row">
      <div class="field"><label>Rating (kVA)</label><input type="number" id="rating" step="any" value="1000"></div>
      <div class="field"><label>Load (kVA)</label><input type="number" id="load" step="any" value="600"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>No-load (iron) loss (W)</label><input type="number" id="nll" step="any" value="1500"></div>
      <div class="field"><label>Full-load (copper) loss (W)</label><input type="number" id="fll" step="any" value="10000"></div>
    </div>
    <div class="field"><label>Power factor</label><input type="number" id="pf" step="any" value="0.9"></div>
    <div class="hint">Both loss figures come from the transformer test certificate or datasheet.</div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter transformer data.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const r = ed.transformerLoading({
        ratingKVA: +left.querySelector('#rating').value,
        loadKVA: +left.querySelector('#load').value,
        noLoadLossW: +left.querySelector('#nll').value,
        fullLoadLossW: +left.querySelector('#fll').value,
        powerFactor: +left.querySelector('#pf').value,
      });
      const badge = r.check === 'NORMAL' ? 'normal' : r.check === 'HIGH LOADING' ? 'warning' : 'out';
      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(r.efficiencyPct, 3)}</span><span class="unit">% efficiency</span></div>
        <div class="result-grid">
          ${resultRow('Loading', fmt(r.loadingPct, 1) + ' %')}
          ${resultRow('Status', `<span class="badge ${badge}">${r.check}</span>`)}
          ${resultRow('Iron (no-load) loss', fmt(r.noLoadLossW, 0) + ' W')}
          ${resultRow('Copper (load) loss', fmt(r.copperLossW, 0) + ' W')}
          ${resultRow('Total loss', fmt(r.totalLossW, 0) + ' W')}
          ${resultRow('Efficiency', fmt(r.efficiencyPct, 4) + ' %')}
          ${resultRow('Peak-efficiency loading', fmt(r.optimalLoadingPct, 1) + ' % (' + fmt(r.optimalLoadKVA, 0) + ' kVA)')}
          ${resultRow('Annual energy lost', fmt(r.annualLossKWh, 0) + ' kWh/yr')}
        </div>
        <div class="formula-box" style="margin-top:12px;">P_cu = P_cu(FL) \u00b7 (load/rating)\u00b2<br>Peak efficiency where P_cu = P_fe</div>
        <div class="assumptions-note" style="margin-top:12px;">Peak efficiency occurs at ${fmt(r.optimalLoadingPct, 0)}% loading, where copper loss equals iron loss. Annual loss assumes continuous operation at this load (8,760 h) \u2014 scale it to your actual duty cycle for a real energy cost.</div>
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('tx-loading',
        `Transformer \u2014 ${fmt(r.efficiencyPct, 2)}% eff`, {}, { efficiencyPct: r.efficiencyPct, totalLossW: r.totalLossW }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ================= ELECTRICAL SECTION =================
// These pages surface the electrical protection engines that were already
// in the codebase (and covered by the 100,000-point fuzz suite) but had no
// UI. Every engine returns explicit status flags (CALCULATED / RECOMMENDED
// / USER_SELECTED) and the shared PROTECTION_DISCLAIMER, both of which are
// shown rather than hidden: auto-generated protection settings are a
// starting point for a study, never a substitute for one.

function protectionDisclaimer() {
  return `<div class="assumptions-note" style="margin-top:14px;">${ec.PROTECTION_DISCLAIMER}</div>`;
}

function statusBadge(status) {
  const cls = status === ec.SETTING_STATUS.VERIFIED ? 'normal'
    : status === ec.SETTING_STATUS.CALCULATED ? 'normal'
    : status === ec.SETTING_STATUS.USER_SELECTED ? 'warning' : 'warning';
  return `<span class="badge ${cls}">${status}</span>`;
}

/** Renders any engine sub-object (oc, ef, diff, ...) as a readable block. */
function protectionBlock(title, obj) {
  const rows = Object.entries(obj)
    .filter(([k]) => k !== 'status' && k !== 'ansi')
    .map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      let val;
      if (v === null || v === undefined) val = '<span style="color:var(--text-faint);">not calculated \u2014 input not supplied</span>';
      else if (Array.isArray(v)) val = v.join(', ');
      else if (typeof v === 'number') val = fmt(v, 4);
      else val = String(v);
      return resultRow(label, val);
    }).join('');
  return `<div style="margin-top:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div class="panel-title" style="margin:0;">${title}${obj.ansi ? ` <span style="color:var(--text-faint);font-weight:400;">\u00b7 ANSI ${obj.ansi}</span>` : ''}</div>
      ${obj.status ? statusBadge(obj.status) : ''}
    </div>
    <div class="result-grid" style="grid-template-columns:1fr;">${rows}</div>
  </div>`;
}

// ---------- Short Circuit / Fault Level ----------
function pageShortCircuit() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Short Circuit / Fault Level</h1>
    <p class="lead">Fault MVA and fault current at a bus, combining the upstream source with the transformer impedance. This is the number every downstream protection setting and equipment rating depends on.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">System Data</div>
    <div class="input-row">
      <div class="field"><label>Source fault level (MVA)</label><input type="number" id="srcMva" step="any" value="2000"></div>
      <div class="field"><label>Bus voltage (kV)</label><input type="number" id="kv" step="any" value="11"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Transformer (optional)</div>
    <div class="input-row">
      <div class="field"><label>Rating (MVA)</label><input type="number" id="txMva" step="any" value="25"></div>
      <div class="field"><label>Impedance (%)</label><input type="number" id="txZ" step="any" value="10"></div>
    </div>
    <div class="hint">Leave the transformer blank to get the fault level at the source bus itself.</div>
    <div class="panel-title" style="margin-top:14px;">Earth Fault</div>
    <div class="input-row">
      <div class="field"><label>Grounding</label><select id="grounding">${ec.GROUNDING_TYPES.map((g) => `<option${g === 'solid' ? ' selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>NGR let-through (A)</label><input type="number" id="ngr" step="any" placeholder="if resistance/reactance"></div>
    </div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter system data and calculate.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const srcMva = +left.querySelector('#srcMva').value;
      const kv = +left.querySelector('#kv').value;
      const txMva = +left.querySelector('#txMva').value;
      const txZ = +left.querySelector('#txZ').value;
      const grounding = left.querySelector('#grounding').value;
      const ngrRaw = left.querySelector('#ngr').value.trim();

      const source = sc.sourceFaultMVA(srcMva);
      let busMva = source, path = 'Source bus only';
      if (txMva > 0 && txZ > 0) {
        const txf = sc.transformerFaultMVA(txMva, txZ);
        busMva = sc.combineSeriesFaultMVA([source, txf]);
        path = `Source (${fmt(source, 0)} MVA) in series with transformer (${fmt(txf, 1)} MVA)`;
      }
      const i3ph = sc.threePhaseFaultCurrentKA(busMva, kv);

      let efRow = '';
      try {
        const opts = ngrRaw === '' ? {} : { ngrLetThroughA: +ngrRaw };
        const ilg = sc.lineToGroundFaultCurrentKA(i3ph, grounding, opts);
        efRow = resultRow('Line-to-ground fault current', ilg === null ? 'negligible (ungrounded system)' : fmt(ilg, 4) + ' kA');
      } catch (e) {
        efRow = resultRow('Line-to-ground fault current', `<span style="color:var(--amber);">${e.message}</span>`);
      }

      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(i3ph, 3)}</span><span class="unit">kA (3-phase)</span></div>
        <div class="result-grid">
          ${resultRow('Fault level at bus', fmt(busMva, 1) + ' MVA')}
          ${resultRow('Contribution path', path)}
          ${resultRow('3-phase fault current', fmt(i3ph, 4) + ' kA')}
          ${efRow}
          ${resultRow('Grounding', grounding)}
        </div>
        <div class="formula-box" style="margin-top:12px;">Fault MVA (series) = 1 / (1/MVA\u2081 + 1/MVA\u2082)<br>I\u2083\u03c6 = MVA_fault / (\u221a3 \u00b7 kV)</div>
        ${protectionDisclaimer()}
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('short-circuit',
        `Fault level \u2014 ${fmt(i3ph, 2)} kA at ${kv} kV`, { srcMva, kv, txMva, txZ }, { busMva, i3ph }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- IDMT Relay Curves ----------
function pageIdmt() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>IDMT Relay Curves</h1>
    <p class="lead">Inverse-time overcurrent relay operating time from the standard IEC curves. Also solves the reverse problem: what TMS do I need to hit a target operating time?</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Relay Setting</div>
    <div class="input-row">
      <div class="field"><label>Fault current (A)</label><input type="number" id="ifault" step="any" value="4000"></div>
      <div class="field"><label>Pickup current (A)</label><input type="number" id="ipickup" step="any" value="500"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Curve</label><select id="curve">${Object.keys(idmt.CURVES).map((k) => `<option value="${k}">${k} \u2014 ${idmt.CURVES[k].name || k}</option>`).join('')}</select></div>
      <div class="field"><label>TMS</label><input type="number" id="tms" step="any" value="0.2"></div>
    </div>
    <div class="hint">SI = standard inverse, VI = very inverse, EI = extremely inverse, LTI = long-time inverse.</div>
    <div class="panel-title" style="margin-top:14px;">Reverse Solve (optional)</div>
    <div class="field"><label>Desired operating time (s)</label><input type="number" id="desiredT" step="any" placeholder="leave blank to skip"></div>
    <div class="btn-row"><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter relay settings and calculate.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const ifault = +left.querySelector('#ifault').value;
      const ipickup = +left.querySelector('#ipickup').value;
      const curve = left.querySelector('#curve').value;
      const tms = +left.querySelector('#tms').value;
      const desiredRaw = left.querySelector('#desiredT').value.trim();

      const m = idmt.psm(ifault, ipickup);
      const t = idmt.operatingTime(ifault, ipickup, tms, curve);

      let reverse = '';
      if (desiredRaw !== '') {
        const need = idmt.tmsForDesiredTime(ifault, ipickup, +desiredRaw, curve);
        reverse = `<div class="assumptions-note" style="margin-top:12px;">To operate in <b>${fmt(+desiredRaw, 3)} s</b> at this fault current on the ${curve} curve, set <b>TMS = ${fmt(need, 4)}</b>. Round to the nearest step your relay actually supports \u2014 most relays have discrete TMS steps, not a continuous dial.</div>`;
      }

      // A small operating-time table across a range of fault currents makes
      // the shape of the curve obvious in a way a single number does not.
      const multiples = [1.5, 2, 3, 5, 10, 20];
      const rows = multiples.map((mult) => {
        const i = ipickup * mult;
        let tt;
        try { tt = fmt(idmt.operatingTime(i, ipickup, tms, curve), 3) + ' s'; }
        catch { tt = '\u2014'; }
        return `<tr><td class="num">${mult}\u00d7</td><td class="num">${fmt(i, 0)} A</td><td class="num">${tt}</td></tr>`;
      }).join('');

      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(t, 3)}</span><span class="unit">seconds</span></div>
        <div class="result-grid">
          ${resultRow('PSM (plug setting multiplier)', fmt(m, 3))}
          ${resultRow('Curve', curve)}
          ${resultRow('TMS', fmt(tms, 4))}
          ${resultRow('Operating time', fmt(t, 4) + ' s')}
        </div>
        ${reverse}
        <div class="panel-title" style="margin-top:16px;">Operating time vs fault current</div>
        <div style="overflow-x:auto;">
          <table><thead><tr><th class="num">PSM</th><th class="num">Current</th><th class="num">Trip time</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        ${protectionDisclaimer()}
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('idmt',
        `IDMT ${curve} \u2014 ${fmt(t, 3)} s`, { ifault, ipickup, curve, tms }, { psm: m, operatingTimeS: t }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- CT Sizing & Burden ----------
function pageCtSizing() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>CT Sizing &amp; Burden</h1>
    <p class="lead">Whether a current transformer can actually deliver what the protection scheme needs. An undersized CT saturates during a fault, and a saturated CT can make a differential scheme mis-operate on an external fault.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">CT &amp; Circuit</div>
    <div class="input-row">
      <div class="field"><label>Primary current (A)</label><input type="number" id="prim" step="any" value="1000"></div>
      <div class="field"><label>CT ratio primary</label><input type="number" id="ctp" step="any" value="1000"></div>
      <div class="field"><label>CT secondary</label><input type="number" id="cts" step="any" value="1"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Burden</div>
    <div class="input-row">
      <div class="field"><label>Relay burden (VA)</label><input type="number" id="relayVA" step="any" value="0.1"></div>
      <div class="field"><label>Lead resistance (\u03a9)</label><input type="number" id="leadR" step="any" value="0.5"></div>
      <div class="field"><label>Other burden (VA)</label><input type="number" id="otherVA" step="any" value="0"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Stability (differential / REF)</div>
    <div class="input-row">
      <div class="field"><label>Secondary fault current (A)</label><input type="number" id="ifsec" step="any" value="20"></div>
      <div class="field"><label>CT resistance (\u03a9)</label><input type="number" id="ctR" step="any" value="2"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Stability factor K</label><input type="number" id="kfac" step="any" value="2"></div>
      <div class="field"><label>Actual knee-point (V)</label><input type="number" id="vk" step="any" placeholder="from CT nameplate"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>CT class</label><input type="text" id="ctClass" placeholder="e.g. 5P20, PX"></div>
      <div class="field"><label>CT rated burden (VA)</label><input type="number" id="ratedVA" step="any" placeholder="optional"></div>
    </div>
    <div class="btn-row"><button class="btn" id="calc">Assess</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter CT and burden data.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const prim = +left.querySelector('#prim').value;
      const ctp = +left.querySelector('#ctp').value;
      const cts = +left.querySelector('#cts').value;
      const relayVA = +left.querySelector('#relayVA').value;
      const leadR = +left.querySelector('#leadR').value;
      const otherVA = +left.querySelector('#otherVA').value;
      const ifsec = +left.querySelector('#ifsec').value;
      const ctR = +left.querySelector('#ctR').value;
      const kfac = +left.querySelector('#kfac').value;
      const vkRaw = left.querySelector('#vk').value.trim();
      const ctClass = left.querySelector('#ctClass').value.trim();
      const ratedVARaw = left.querySelector('#ratedVA').value.trim();

      const secA = ctEng.ctSecondaryCurrent(prim, ctp, cts);
      const cableVA = ctEng.cableBurdenVA(secA, leadR);
      const totalVA = ctEng.totalBurdenVA(relayVA, cableVA, otherVA);
      const vkReq = ctEng.requiredKneePointVoltage(ifsec, ctR, leadR, kfac);

      const suff = ctEng.checkCtSufficiency({
        actualKneePointV: vkRaw === '' ? undefined : +vkRaw,
        requiredKneePointV: vkReq,
        ctClass: ctClass || undefined,
        ctRatedBurdenVA: ratedVARaw === '' ? undefined : +ratedVARaw,
        actualBurdenVA: totalVA,
      });

      const warnHtml = (suff.warnings && suff.warnings.length)
        ? suff.warnings.map((w) => `<div class="assumptions-note" style="margin-top:8px;">${w}</div>`).join('')
        : '<div class="assumptions-note" style="margin-top:8px;">No warnings raised for the data supplied.</div>';

      right.innerHTML = `
        <div class="readout"><span class="value">${fmt(vkReq, 1)}</span><span class="unit">V knee-point required</span></div>
        <div class="result-grid">
          ${resultRow('CT secondary current', fmt(secA, 4) + ' A')}
          ${resultRow('Cable (lead) burden', fmt(cableVA, 4) + ' VA')}
          ${resultRow('Total burden', fmt(totalVA, 4) + ' VA')}
          ${resultRow('Required knee-point voltage', fmt(vkReq, 2) + ' V')}
          ${resultRow('Actual knee-point', vkRaw === '' ? 'not supplied' : fmt(+vkRaw, 2) + ' V')}
          ${resultRow('Sufficient?', suff.sufficient === true ? '<span class="badge normal">YES</span>' : suff.sufficient === false ? '<span class="badge out">NO</span>' : '<span class="badge warning">CANNOT CONFIRM</span>')}
        </div>
        ${warnHtml}
        <div class="formula-box" style="margin-top:12px;">V\u2096(required) = K \u00b7 I_f(sec) \u00b7 (R_ct + 2\u00b7R_lead)<br>Cable burden = I\u00b2 \u00b7 R (per lead, both legs counted)</div>
        ${protectionDisclaimer()}`;
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Transformer Protection ----------
function pageTransformerProt() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Transformer Protection</h1>
    <p class="lead">Generates a starting set of transformer protection settings \u2014 overcurrent, earth fault, differential, REF, thermal and over-fluxing \u2014 from the transformer nameplate and system fault level.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Transformer Nameplate</div>
    <div class="input-row">
      <div class="field"><label>Rating (MVA)</label><input type="number" id="mva" step="any" value="25"></div>
      <div class="field"><label>Impedance (%)</label><input type="number" id="z" step="any" value="10"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>HV (kV)</label><input type="number" id="hv" step="any" value="132"></div>
      <div class="field"><label>LV (kV)</label><input type="number" id="lv" step="any" value="11"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">CTs &amp; System</div>
    <div class="input-row">
      <div class="field"><label>HV CT primary (A)</label><input type="number" id="hvct" step="any" value="200"></div>
      <div class="field"><label>LV CT primary (A)</label><input type="number" id="lvct" step="any" value="1500"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Source fault (MVA)</label><input type="number" id="srcMva" step="any" value="2000"></div>
      <div class="field"><label>Grounding</label><select id="grounding">${ec.GROUNDING_TYPES.map((g) => `<option${g === 'solid' ? ' selected' : ''}>${g}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>NGR let-through (A)</label><input type="number" id="ngr" step="any" placeholder="if resistance/reactance grounded"></div>
    <div class="btn-row"><button class="btn" id="calc">Generate Settings</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter transformer data and generate.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const ngrRaw = left.querySelector('#ngr').value.trim();
      const basic = {
        ratingMVA: +left.querySelector('#mva').value,
        hvKV: +left.querySelector('#hv').value,
        lvKV: +left.querySelector('#lv').value,
        impedancePct: +left.querySelector('#z').value,
        hvCtPrimary: +left.querySelector('#hvct').value || undefined,
        lvCtPrimary: +left.querySelector('#lvct').value || undefined,
        sourceFaultMVA: +left.querySelector('#srcMva').value || undefined,
        groundingType: left.querySelector('#grounding').value,
        ngrLetThroughA: ngrRaw === '' ? undefined : +ngrRaw,
      };
      const r = tfProt.autoGenerate(basic);
      const bp = r.basicParameters;
      const blocks = Object.entries(r.protection).map(([k, v]) => {
        const titles = { oc: 'Overcurrent', ef: 'Earth Fault', diff: 'Differential', ref: 'Restricted Earth Fault', thermal: 'Thermal', overfluxing: 'Over-fluxing' };
        return protectionBlock(titles[k] || k, v);
      }).join('');

      right.innerHTML = `
        <div class="panel-title">Basic Parameters</div>
        <div class="result-grid">
          ${resultRow('HV full-load current', fmt(bp.hvFLC, 2) + ' A')}
          ${resultRow('LV full-load current', fmt(bp.lvFLC, 2) + ' A')}
          ${resultRow('Turns ratio', fmt(bp.turnsRatio, 3))}
          ${resultRow('HV fault current', fmt(bp.hvFaultKA, 3) + ' kA')}
          ${resultRow('LV fault current', fmt(bp.lvFaultKA, 3) + ' kA')}
          ${resultRow('HV CT secondary at FLC', bp.hvCtSecondaryA === null ? 'CT not supplied' : fmt(bp.hvCtSecondaryA, 4) + ' A')}
          ${resultRow('LV CT secondary at FLC', bp.lvCtSecondaryA === null ? 'CT not supplied' : fmt(bp.lvCtSecondaryA, 4) + ' A')}
        </div>
        ${blocks}
        ${protectionDisclaimer()}`;
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Motor Protection ----------
function pageMotorProt() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Motor Protection</h1>
    <p class="lead">Generates a starting set of motor protection settings \u2014 thermal overload, overcurrent, earth fault, negative sequence, locked rotor, under-current and voltage \u2014 from motor nameplate data.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Motor Nameplate</div>
    <div class="input-row">
      <div class="field"><label>Rating (kW)</label><input type="number" id="kw" step="any" value="1000"></div>
      <div class="field"><label>Voltage (kV)</label><input type="number" id="kv" step="any" value="6.6"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Power factor</label><input type="number" id="pf" step="any" value="0.86"></div>
      <div class="field"><label>Efficiency (%)</label><input type="number" id="eff" step="any" value="95"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Starting</div>
    <div class="input-row">
      <div class="field"><label>Starting current (\u00d7 FLC)</label><input type="number" id="startMult" step="any" value="6"></div>
      <div class="field"><label>Starting time (s)</label><input type="number" id="startT" step="any" value="8"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">CT &amp; System</div>
    <div class="input-row">
      <div class="field"><label>CT primary (A)</label><input type="number" id="ctp" step="any" value="150"></div>
      <div class="field"><label>Source fault (MVA)</label><input type="number" id="srcMva" step="any" value="250"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Grounding</label><select id="grounding">${ec.GROUNDING_TYPES.map((g) => `<option${g === 'resistance' ? ' selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>NGR let-through (A)</label><input type="number" id="ngr" step="any" value="200"></div>
    </div>
    <div class="btn-row"><button class="btn" id="calc">Generate Settings</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter motor data and generate.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const ngrRaw = left.querySelector('#ngr').value.trim();
      const basic = {
        ratingKW: +left.querySelector('#kw').value,
        voltageKV: +left.querySelector('#kv').value,
        powerFactor: +left.querySelector('#pf').value,
        efficiencyPct: +left.querySelector('#eff').value,
        startingCurrentMultiple: +left.querySelector('#startMult').value,
        startingTimeS: +left.querySelector('#startT').value,
        ctPrimary: +left.querySelector('#ctp').value || undefined,
        sourceFaultMVA: +left.querySelector('#srcMva').value || undefined,
        groundingType: left.querySelector('#grounding').value,
        ngrLetThroughA: ngrRaw === '' ? undefined : +ngrRaw,
      };
      const r = motProt.autoGenerate(basic);
      const bp = r.basicParameters;
      const titles = { thermal: 'Thermal Overload', oc: 'Overcurrent', ef: 'Earth Fault', negSeq: 'Negative Sequence', lockedRotor: 'Locked Rotor', underCurrent: 'Under-current', voltage: 'Voltage' };
      const blocks = Object.entries(r.protection).map(([k, v]) => protectionBlock(titles[k] || k, v)).join('');

      right.innerHTML = `
        <div class="panel-title">Basic Parameters</div>
        <div class="result-grid">
          ${resultRow('Full-load current', fmt(bp.flc, 2) + ' A')}
          ${resultRow('Starting current', fmt(bp.startingCurrentA, 2) + ' A')}
          ${resultRow('Starting kVA', fmt(bp.startingKVA, 1) + ' kVA')}
          ${resultRow('Fault current', fmt(bp.faultKA, 3) + ' kA')}
          ${resultRow('CT secondary at FLC', bp.ctSecondaryA === null ? 'CT not supplied' : fmt(bp.ctSecondaryA, 4) + ' A')}
        </div>
        ${blocks}
        ${protectionDisclaimer()}`;
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- LSIG Breaker Settings ----------
function pageLsig() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>LSIG Breaker Settings</h1>
    <p class="lead">Long-time, Short-time, Instantaneous and Ground-fault settings for an electronic-trip circuit breaker \u2014 snapped to the discrete steps real breakers actually offer, not idealised continuous values.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Breaker &amp; Load</div>
    <div class="input-row">
      <div class="field"><label>Frame rating (A)</label><input type="number" id="frame" step="any" value="630"></div>
      <div class="field"><label>Load current (A)</label><input type="number" id="load" step="any" value="400"></div>
    </div>
    <div class="field"><label>Fault current (kA)</label><input type="number" id="fault" step="any" value="25"></div>
    <div class="panel-title" style="margin-top:14px;">Available Functions</div>
    <div class="input-row" style="flex-wrap:nowrap;gap:8px;">
      ${['L', 'S', 'I', 'G'].map((f) => `<label style="display:flex;align-items:center;gap:6px;font-size:.85rem;"><input type="checkbox" class="fnChk" data-f="${f}" checked> ${f}</label>`).join('')}
    </div>
    <div class="hint">Untick any protection function your breaker doesn't have \u2014 many MCCBs are LI only, without short-time or ground-fault stages.</div>
    <div class="btn-row"><button class="btn" id="calc">Generate Settings</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter breaker data and generate.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const availableFunctions = {};
      left.querySelectorAll('.fnChk').forEach((cb) => { availableFunctions[cb.dataset.f] = cb.checked; });
      const r = lsig.autoGenerate({
        frameRatingA: +left.querySelector('#frame').value,
        loadCurrentA: +left.querySelector('#load').value,
        faultCurrentKA: +left.querySelector('#fault').value,
        availableFunctions,
      });
      const titles = { longTime: 'Long-Time (L)', shortTime: 'Short-Time (S)', instantaneous: 'Instantaneous (I)', groundFault: 'Ground Fault (G)' };
      const blocks = Object.entries(r).map(([k, v]) => protectionBlock(titles[k] || k, v)).join('');
      right.innerHTML = blocks
        ? blocks + protectionDisclaimer()
        : '<div class="empty-state">No protection functions selected.</div>';
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Relay Coordination ----------
function pageCoordination() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Electrical</div><h1>Relay Coordination</h1>
    <p class="lead">Checks grading between an upstream and downstream relay at a common fault current. The downstream relay must clear first, with enough margin that the upstream one doesn't also trip and take out more of the system than necessary.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Fault</div>
    <div class="input-row">
      <div class="field"><label>Fault current (A)</label><input type="number" id="ifault" step="any" value="4000"></div>
      <div class="field"><label>Required margin (s)</label><input type="number" id="margin" step="any" value="0.3"></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Upstream Relay</div>
    <div class="input-row">
      <div class="field"><label>Pickup (A)</label><input type="number" id="upPickup" step="any" value="500"></div>
      <div class="field"><label>TMS</label><input type="number" id="upTms" step="any" value="0.3"></div>
      <div class="field"><label>Curve</label><select id="upCurve">${Object.keys(idmt.CURVES).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
    </div>
    <div class="panel-title" style="margin-top:14px;">Downstream Relay</div>
    <div class="input-row">
      <div class="field"><label>Pickup (A)</label><input type="number" id="dnPickup" step="any" value="200"></div>
      <div class="field"><label>TMS</label><input type="number" id="dnTms" step="any" value="0.1"></div>
      <div class="field"><label>Curve</label><select id="dnCurve">${Object.keys(idmt.CURVES).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
    </div>
    <div class="btn-row"><button class="btn" id="calc">Check Coordination</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter both relays and check.</div></div>');
  layout.append(left, right); app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    try {
      const ifault = +left.querySelector('#ifault').value;
      const margin = +left.querySelector('#margin').value;
      const upstream = { pickupA: +left.querySelector('#upPickup').value, tms: +left.querySelector('#upTms').value, curve: left.querySelector('#upCurve').value };
      const downstream = { pickupA: +left.querySelector('#dnPickup').value, tms: +left.querySelector('#dnTms').value, curve: left.querySelector('#dnCurve').value };
      const r = coord.checkCoordination(upstream, downstream, ifault, margin);

      const badge = r.check === ec.ENGINEERING_CHECK.PASS ? 'normal'
        : r.check === ec.ENGINEERING_CHECK.WARNING ? 'warning' : 'out';
      const explain = r.check === ec.ENGINEERING_CHECK.PASS
        ? 'The downstream relay operates first with at least the required grading margin. Only the faulted section is disconnected.'
        : r.check === ec.ENGINEERING_CHECK.WARNING
          ? 'The downstream relay is faster, but the margin is tighter than typical practice. Relay tolerance, CT error and breaker operating time can all eat into this \u2014 with too little margin, both relays may trip on the same fault.'
          : 'No discrimination: the downstream relay is not faster than the upstream one at this fault current. The upstream relay may trip first and disconnect far more of the system than the fault requires.';

      right.innerHTML = `
        <div style="text-align:center;padding:16px 0;">
          <span class="badge ${badge}" style="font-size:1rem;padding:8px 18px;">${r.check}</span>
        </div>
        <div class="result-grid">
          ${resultRow('Upstream operating time', fmt(r.upstreamOperatingTimeS, 4) + ' s')}
          ${resultRow('Downstream operating time', fmt(r.downstreamOperatingTimeS, 4) + ' s')}
          ${resultRow('Actual margin', fmt(r.marginS, 4) + ' s')}
          ${resultRow('Required margin', fmt(r.minGradingMarginS, 3) + ' s')}
        </div>
        <div class="assumptions-note" style="margin-top:14px;">${explain}</div>
        ${protectionDisclaimer()}
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('coordination',
        `Coordination \u2014 ${r.check}`, { ifault, upstream, downstream }, { check: r.check, marginS: r.marginS }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Power Plant Control Loops (visual) ----------
function pageControlLoops() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Power Plant</div><h1>Control Loops \u2014 Visual Reference</h1>
    <p class="lead">The major control loops of a thermal power plant, drawn as live block diagrams. Move the disturbance slider and watch the signals actually propagate \u2014 these loops are far easier to understand seeing them move than reading about them.</p></div>`));

  const loopTabs = h(`<div class="tabs" id="loopTabs">${cl.LOOP_IDS.map((id, i) =>
    `<div class="tab ${i === 0 ? 'active' : ''}" data-l="${id}">${cl.CONTROL_LOOPS[id].name}</div>`).join('')}</div>`);
  app.appendChild(loopTabs);

  const body = h('<div></div>');
  app.appendChild(body);

  // --- SVG diagram renderer -------------------------------------------
  const NODE_W = 108, NODE_H = 52;
  function anchorPoint(n, toward) {
    // Pick the edge midpoint of the node box facing the target, so arrows
    // meet the box cleanly instead of running to its centre.
    const cx = n.x + NODE_W / 2, cy = n.y + NODE_H / 2;
    const dx = toward.x + NODE_W / 2 - cx, dy = toward.y + NODE_H / 2 - cy;
    if (Math.abs(dx) * NODE_H > Math.abs(dy) * NODE_W) {
      return { x: cx + Math.sign(dx) * (NODE_W / 2), y: cy };
    }
    return { x: cx, y: cy + Math.sign(dy) * (NODE_H / 2) };
  }

  function drawLoop(loop, values) {
    const nodeById = Object.fromEntries(loop.nodes.map((n) => [n.id, n]));
    const maxX = Math.max(...loop.nodes.map((n) => n.x)) + NODE_W + 40;
    const maxY = Math.max(...loop.nodes.map((n) => n.y)) + NODE_H + 40;

    // Edge labels are placed at the line midpoint, but two edges crossing
    // the same area put their labels on top of each other and the text
    // becomes unreadable. Track used label positions and nudge later ones
    // vertically until they clear.
    const usedLabelSpots = [];
    function labelOffset(x, y) {
      let dy = 0;
      for (let guard = 0; guard < 8; guard++) {
        const clash = usedLabelSpots.some((s) => Math.abs(s.x - x) < 70 && Math.abs(s.y - (y + dy)) < 11);
        if (!clash) break;
        dy = dy <= 0 ? -dy + 12 : -dy;   // alternate above/below, widening
      }
      usedLabelSpots.push({ x, y: y + dy });
      return dy;
    }

    const edgeSvg = loop.edges.map((e, i) => {
      const a = nodeById[e.from], b = nodeById[e.to];
      const p1 = anchorPoint(a, b), p2 = anchorPoint(b, a);
      const st = cl.EDGE_STYLES[e.style || 'normal'];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 + (e.label ? labelOffset((p1.x + p2.x) / 2, (p1.y + p2.y) / 2) : 0);
      return `
        <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
              stroke="${st.color}" stroke-width="1.6" ${st.dash ? `stroke-dasharray="${st.dash}"` : ''}
              marker-end="url(#arrow-${e.style || 'normal'})" opacity="0.85"/>
        <circle r="3.5" fill="${st.color}">
          <animateMotion dur="2.4s" repeatCount="indefinite" begin="${(i * 0.18).toFixed(2)}s"
            path="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}"/>
        </circle>
        ${e.label ? `<text x="${midX}" y="${midY - 5}" fill="${st.color}" font-size="9"
             font-family="var(--font-mono)" text-anchor="middle" opacity="0.9">${e.label}</text>` : ''}`;
    }).join('');

    const nodeSvg = loop.nodes.map((n) => {
      const st = cl.NODE_STYLES[n.type];
      const val = values && values[n.id] ? values[n.id] : '';
      return `
        <g class="loop-node" data-node="${n.id}" style="cursor:pointer;">
          <rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="6"
                fill="var(--bg-panel)" stroke="${st.color}" stroke-width="1.8"/>
          <text x="${n.x + NODE_W / 2}" y="${n.y + 19}" fill="${st.color}" font-size="11"
                font-family="var(--font-mono)" font-weight="600" text-anchor="middle">${n.label.replace(/<br\/>/g, ' ')}</text>
          <text x="${n.x + NODE_W / 2}" y="${n.y + 32}" fill="var(--text-faint)" font-size="8"
                font-family="var(--font-mono)" text-anchor="middle">${n.sub}</text>
          <text x="${n.x + NODE_W / 2}" y="${n.y + 45}" fill="var(--text)" font-size="10"
                font-family="var(--font-mono)" font-weight="600" text-anchor="middle">${val}</text>
        </g>`;
    }).join('');

    const markers = Object.entries(cl.EDGE_STYLES).map(([k, st]) => `
      <marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${st.color}"/>
      </marker>`).join('');

    return `<svg viewBox="0 0 ${maxX} ${maxY}" style="width:100%;height:auto;min-width:640px;">
      <defs>${markers}</defs>${edgeSvg}${nodeSvg}</svg>`;
  }

  // --- Page for one loop ----------------------------------------------
  function showLoop(loopId) {
    const loop = cl.CONTROL_LOOPS[loopId];
    let simInput = loop.sim.inputDefault;
    let prevInput = loop.sim.inputDefault;

    body.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
          <div>
            <div class="panel-title" style="margin-bottom:2px;">${loop.name}</div>
            <div style="font-size:.76rem;color:var(--text-faint);font-family:var(--font-mono);">${loop.system} \u00b7 ${loop.difficulty}</div>
          </div>
        </div>
        <p style="color:var(--text-dim);font-size:.86rem;margin-top:10px;">${loop.why}</p>

        <div class="input-row" style="margin-top:14px;align-items:center;flex-wrap:nowrap;gap:12px;">
          <div class="field" style="flex:1;min-width:0;margin-bottom:0;">
            <label>${loop.sim.inputLabel}</label>
            <input type="range" id="simSlider" min="${loop.sim.inputMin}" max="${loop.sim.inputMax}" step="1" value="${simInput}" style="width:100%;">
          </div>
          <div style="flex:0 0 auto;text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.4rem;color:var(--amber);" id="simVal">${simInput}</div>
            <div style="font-size:.68rem;color:var(--text-faint);">drag to disturb</div>
          </div>
          <button class="btn secondary" id="simReset" style="flex:0 0 auto;">Reset</button>
        </div>

        <div id="loopSvg" style="overflow-x:auto;margin-top:14px;padding:10px 0;"></div>

        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:6px;font-size:.72rem;color:var(--text-faint);">
          ${Object.entries(cl.EDGE_STYLES).map(([, st]) =>
            `<span style="display:inline-flex;align-items:center;gap:5px;">
              <span style="display:inline-block;width:18px;height:0;border-top:2px ${st.dash ? 'dashed' : 'solid'} ${st.color};"></span>${st.label}</span>`).join('')}
        </div>

        <div class="assumptions-note" id="simInsight" style="margin-top:14px;"></div>
      </div>

      <div class="calc-layout" style="margin-top:16px;">
        <div class="card">
          <div class="panel-title">The Problem</div>
          <p style="color:var(--text-dim);font-size:.86rem;">${loop.problem}</p>
          <div class="panel-title" style="margin-top:16px;">The Solution</div>
          <p style="color:var(--text-dim);font-size:.86rem;">${loop.solution}</p>
        </div>
        <div class="card">
          <div class="panel-title">Key Elements</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
            ${loop.elements.map((el) => `<div style="display:flex;gap:8px;align-items:flex-start;">
              <span style="color:var(--amber);flex-shrink:0;">\u25b8</span>
              <span style="font-size:.85rem;color:var(--text-dim);">${el}</span></div>`).join('')}
          </div>
          <div class="panel-title" style="margin-top:18px;">Block Types</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
            ${[...new Set(loop.nodes.map((n) => n.type))].map((t) =>
              `<span class="badge" style="border:1px solid ${cl.NODE_STYLES[t].color};color:${cl.NODE_STYLES[t].color};">${cl.NODE_STYLES[t].hint}</span>`).join('')}
          </div>
          <div class="panel-title" style="margin-top:18px;">Sources</div>
          <ul style="margin:6px 0 0 16px;padding:0;color:var(--text-faint);font-size:.76rem;line-height:1.7;">
            ${loop.sources.map((s) => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      </div>`;

    const svgWrap = body.querySelector('#loopSvg');
    const insight = body.querySelector('#simInsight');
    const slider = body.querySelector('#simSlider');
    const valEl = body.querySelector('#simVal');

    function refresh() {
      const r = loop.sim.run(simInput, prevInput);
      svgWrap.innerHTML = drawLoop(loop, r.nodeValues);
      insight.innerHTML = r.insight;
      valEl.textContent = simInput;
      // Clicking a block explains what it is.
      svgWrap.querySelectorAll('.loop-node').forEach((g) => {
        g.addEventListener('click', () => {
          const n = loop.nodes.find((x) => x.id === g.dataset.node);
          const st = cl.NODE_STYLES[n.type];
          insight.innerHTML = `<b style="color:${st.color};">${n.label.replace(/<br\/>/g, ' ')} \u2014 ${n.sub}</b><br>${st.hint}. Current value: <b>${r.nodeValues[n.id] || 'n/a'}</b>.`;
        });
      });
    }
    slider.addEventListener('input', (e) => { prevInput = simInput; simInput = +e.target.value; refresh(); });
    body.querySelector('#simReset').addEventListener('click', () => {
      prevInput = loop.sim.inputDefault; simInput = loop.sim.inputDefault;
      slider.value = simInput; refresh();
    });
    refresh();
  }

  loopTabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    loopTabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    showLoop(t.dataset.l);
  }));
  showLoop(cl.LOOP_IDS[0]);
}

// ---------- Loop Measurement Uncertainty ----------
function pageLoopUncertainty() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>Measurement Loop Uncertainty</h1>
    <p class="lead">A "\u00b10.1% accurate" transmitter is never the real accuracy of the measurement. This builds the full error budget across the loop and combines the terms properly \u2014 by root-sum-square, not by adding them up.</p></div>`));

  const DEFAULT_TERMS = [
    { label: 'Transmitter reference accuracy', value: 0.075, basis: '% of span', kind: 'random' },
    { label: 'Ambient temperature effect', value: 0.15, basis: '% of span', kind: 'random' },
    { label: 'Static pressure effect', value: 0.10, basis: '% of span', kind: 'random' },
    { label: 'Drift since last calibration', value: 0.10, basis: '% of span', kind: 'random' },
    { label: 'Analogue input card', value: 0.05, basis: '% of span', kind: 'random' },
  ];
  let terms = DEFAULT_TERMS.map((t) => ({ ...t }));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Range &amp; Operating Point</div>
    <div class="input-row">
      <div class="field"><label>LRV</label><input type="number" id="lrv" value="0"></div>
      <div class="field"><label>URV</label><input type="number" id="urv" value="100"></div>
      <div class="field"><label>Reading</label><input type="number" id="reading" value="50"></div>
    </div>
    <div class="hint">Enter the range and the process value you want the uncertainty evaluated at. "% of reading" terms change with the reading; "% of span" terms don't.</div>
    <div class="panel-title" style="margin-top:16px;">Error Terms</div>
    <div id="termsWrap"></div>
    <div class="btn-row" style="margin-top:10px;"><button class="btn secondary" id="addTerm">+ Add term</button><button class="btn" id="calc">Calculate</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter the loop\u2019s error terms and calculate.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  const termsWrap = left.querySelector('#termsWrap');
  function renderTerms() {
    termsWrap.innerHTML = terms.map((t, i) => `
      <div class="input-row" data-i="${i}" style="align-items:flex-end;gap:6px;flex-wrap:nowrap;">
        <div class="field" style="flex:2 1 0;min-width:0;"><label>${i === 0 ? 'Description' : ''}</label><input type="text" class="t-label" value="${t.label.replace(/"/g, '&quot;')}"></div>
        <div class="field" style="flex:0 0 68px;min-width:0;"><label>${i === 0 ? 'Value' : ''}</label><input type="number" class="t-value" step="any" value="${t.value}"></div>
        <div class="field" style="flex:0 0 112px;min-width:0;"><label>${i === 0 ? 'Basis' : ''}</label><select class="t-basis" style="padding:8px 4px;">${lu.ERROR_BASIS.map((b) => `<option ${b === t.basis ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
        <div class="field" style="flex:0 0 96px;min-width:0;"><label>${i === 0 ? 'Type' : ''}</label><select class="t-kind" style="padding:8px 4px;">${lu.ERROR_KIND.map((k) => `<option ${k === t.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="field" style="flex:0 0 auto;min-width:0;"><label>${i === 0 ? '&nbsp;' : ''}</label><button class="btn secondary t-del" style="padding:8px 9px;">\u2715</button></div>
      </div>`).join('');
    termsWrap.querySelectorAll('.t-del').forEach((b, i) => b.addEventListener('click', () => {
      if (terms.length === 1) { toast('Keep at least one error term'); return; }
      readTerms(); terms.splice(i, 1); renderTerms();
    }));
  }
  function readTerms() {
    const rows = [...termsWrap.querySelectorAll('.input-row')];
    terms = rows.map((r) => ({
      label: r.querySelector('.t-label').value.trim() || 'Unnamed term',
      value: +r.querySelector('.t-value').value,
      basis: r.querySelector('.t-basis').value,
      kind: r.querySelector('.t-kind').value,
    }));
  }
  renderTerms();

  left.querySelector('#addTerm').addEventListener('click', () => {
    readTerms();
    terms.push({ label: '', value: 0.05, basis: '% of span', kind: 'random' });
    renderTerms();
  });

  left.querySelector('#calc').addEventListener('click', () => {
    readTerms();
    const lrv = +left.querySelector('#lrv').value;
    const urv = +left.querySelector('#urv').value;
    const reading = +left.querySelector('#reading').value;
    try {
      const r = lu.loopUncertainty({ lrv, urv, reading, terms });
      const overstatement = r.totalAbsolute > 0 ? r.linearSumAbsolute / r.totalAbsolute : 1;
      right.innerHTML = `
        <div class="readout"><span class="value">\u00b1${fmt(r.totalPctSpan, 3)}</span><span class="unit">% of span</span></div>
        <div class="result-grid">
          ${resultRow('Total uncertainty', '\u00b1' + fmt(r.totalAbsolute, 4) + ' engineering units')}
          ${resultRow('As % of reading', r.totalPctReading === null ? 'n/a at zero reading' : '\u00b1' + fmt(r.totalPctReading, 3) + ' %')}
          ${resultRow('Random terms (RSS)', '\u00b1' + fmt(r.rssAbsolute, 4))}
          ${resultRow('Systematic terms (added)', r.systematicAbsolute > 0 ? '\u00b1' + fmt(r.systematicAbsolute, 4) : 'none')}
          ${resultRow('Dominant term', r.dominant ? r.dominant.label + ' (' + fmt(r.dominant.contributionPct, 1) + '% of the budget)' : 'n/a')}
        </div>
        <div class="assumptions-note" style="margin-top:14px;">If you had added every term together instead of combining them by RSS, you'd get \u00b1${fmt(r.linearSumAbsolute, 4)} \u2014 <b>${fmt(overstatement, 2)}\u00d7 larger</b> than the real figure. That's the classic error budget mistake, and it leads to over-specifying instruments that were never the problem.</div>
        <div style="overflow-x:auto;margin-top:14px;">
          <table><thead><tr><th>Term</th><th>Spec</th><th>Type</th><th class="num">Absolute</th><th class="num">Share of budget</th></tr></thead><tbody>
            ${r.detail.map((d) => `<tr>
              <td>${d.label}</td>
              <td style="font-size:.78rem;color:var(--text-dim);">${fmt(d.value, 3)} ${d.basis}</td>
              <td><span class="badge ${d.kind === 'systematic' ? 'warning' : 'normal'}">${d.kind}</span></td>
              <td class="num">${fmt(d.absolute, 4)}</td>
              <td class="num">${d.kind === 'random' ? fmt(d.contributionPct, 1) + '%' : '\u2014'}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
        <div class="assumptions-note" style="margin-top:12px;">Independent random errors combine as root-sum-square \u2014 the standard method in ISA/IEC instrument uncertainty practice. Terms marked <b>systematic</b> are known one-directional biases and are added arithmetically instead. Tag a term correctly: calling a real bias "random" understates your true uncertainty.</div>
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button><button class="btn secondary" id="pdfBtn">Export PDF</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('loop-uncertainty', `Loop uncertainty \u2014 \u00b1${fmt(r.totalPctSpan,3)}% span`, { lrv, urv, reading, terms }, { totalPctSpan: r.totalPctSpan, totalAbsolute: r.totalAbsolute }));
      right.querySelector('#pdfBtn').addEventListener('click', () => exportCalculationPDF({
        calculatorName: 'Measurement Loop Uncertainty',
        inputs: { LRV: lrv, URV: urv, Reading: reading, Terms: terms.length },
        result: { 'Total (% span)': fmt(r.totalPctSpan, 3), 'Total (abs)': fmt(r.totalAbsolute, 4), 'Dominant term': r.dominant ? r.dominant.label : 'n/a' },
        assumptions: { method: 'Random terms combined by RSS; systematic terms added arithmetically.' },
      }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Control Valve Cavitation / Flashing ----------
function pageCavitation() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Instrumentation</div><h1>Valve Cavitation &amp; Flashing Predictor</h1>
    <p class="lead">Sizing a valve for capacity doesn't tell you whether it will destroy itself. A correctly-sized valve can still cavitate badly \u2014 this checks the pressure conditions that decide it.</p></div>`));

  const layout = h('<div class="calc-layout"></div>');
  const left = h(`<div class="card">
    <div class="panel-title">Service Conditions</div>
    <div class="hint" style="margin-bottom:10px;">All pressures must be <b>absolute</b> and in the same unit (bar a, psia, kPa a \u2014 the analysis is unit-agnostic as long as you're consistent).</div>
    <div class="input-row">
      <div class="field"><label>P\u2081 inlet (abs)</label><input type="number" id="p1" step="any" value="10"></div>
      <div class="field"><label>P\u2082 outlet (abs)</label><input type="number" id="p2" step="any" value="2"></div>
    </div>
    <div class="input-row">
      <div class="field"><label>Vapour pressure P\u1d65</label><input type="number" id="pv" step="any" value="1.0"></div>
      <div class="field"><label>Critical pressure P\u1d04</label><input type="number" id="pc" step="any" value="221"></div>
    </div>
    <div class="hint">P\u1d65 is at the flowing temperature, not ambient. P\u1d04 is a fluid property (water \u2248 221 bar a).</div>
    <div class="panel-title" style="margin-top:16px;">Valve Data (from manufacturer)</div>
    <div class="field"><label>F\u029f \u2014 liquid pressure recovery factor</label><input type="number" id="fl" step="any" value="0.9"></div>
    <div class="hint">Valve-specific. Roughly: globe \u2248 0.9 (low recovery), butterfly/ball \u2248 0.5\u20130.7 (high recovery, far more cavitation-prone). Use your actual valve's published figure.</div>
    <div class="input-row" style="margin-top:10px;">
      <div class="field"><label>\u03c3 incipient (optional)</label><input type="number" id="sigI" step="any" placeholder="e.g. 2.0"></div>
      <div class="field"><label>\u03c3 damage (optional)</label><input type="number" id="sigD" step="any" placeholder="e.g. 1.5"></div>
    </div>
    <div class="hint">Leave blank if you don't have them \u2014 the tool will say plainly what it can and can't conclude without them.</div>
    <div class="btn-row"><button class="btn" id="calc">Assess</button></div>
  </div>`);
  const right = h('<div class="card"><div class="empty-state">Enter service conditions and assess.</div></div>');
  layout.append(left, right);
  app.appendChild(layout);

  left.querySelector('#calc').addEventListener('click', () => {
    const p1 = +left.querySelector('#p1').value;
    const p2 = +left.querySelector('#p2').value;
    const pv = +left.querySelector('#pv').value;
    const pc = +left.querySelector('#pc').value;
    const fl = +left.querySelector('#fl').value;
    const sigIRaw = left.querySelector('#sigI').value.trim();
    const sigDRaw = left.querySelector('#sigD').value.trim();
    try {
      const r = lu.cavitationCheck({
        p1, p2, pv, pc, fl,
        sigmaIncipient: sigIRaw === '' ? undefined : +sigIRaw,
        sigmaDamage: sigDRaw === '' ? undefined : +sigDRaw,
      });
      const badge = r.severity === 'high' ? 'out' : r.severity === 'medium' ? 'warning' : 'normal';
      right.innerHTML = `
        <div style="text-align:center;padding:16px 0;">
          <span class="badge ${badge}" style="font-size:1rem;padding:8px 18px;">${r.regime}</span>
        </div>
        <div class="result-grid">
          ${resultRow('Actual \u0394P', fmt(r.dpActual, 3))}
          ${resultRow('Choked \u0394P limit', fmt(r.dpChoked, 3))}
          ${resultRow('Fraction of choked limit', fmt(r.chokedRatio * 100, 1) + ' %')}
          ${resultRow('Service \u03c3 index', fmt(r.sigmaService, 3))}
          ${resultRow('F\ua730 (critical pressure ratio)', fmt(r.ff, 4))}
          ${resultRow('Choked?', r.isChoked ? '<span class="badge out">YES</span>' : '<span class="badge normal">No</span>')}
          ${resultRow('Flashing?', r.isFlashing ? '<span class="badge out">YES</span>' : '<span class="badge normal">No</span>')}
        </div>
        <div class="assumptions-note" style="margin-top:14px;">${r.note}</div>
        <div class="formula-box" style="margin-top:12px;">F\ua730 = 0.96 \u2212 0.28\u221a(P\u1d65/P\u1d04)<br>\u0394P_choked = F\u029f\u00b2 \u00b7 (P\u2081 \u2212 F\ua730\u00b7P\u1d65)<br>\u03c3 = (P\u2081 \u2212 P\u1d65) / (P\u2081 \u2212 P\u2082)</div>
        <div class="assumptions-note" style="margin-top:12px;">${r.assumptions} Method follows the standard IEC 60534 / ISA-75 liquid sizing approach. This is a screening assessment for engineering study \u2014 final valve selection needs the manufacturer's own sizing software and review.</div>
        <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button><button class="btn secondary" id="pdfBtn">Export PDF</button></div>`;
      right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast('cavitation', `Cavitation check \u2014 ${r.regime}`, { p1, p2, pv, pc, fl }, { regime: r.regime, sigmaService: r.sigmaService, dpChoked: r.dpChoked }));
      right.querySelector('#pdfBtn').addEventListener('click', () => exportCalculationPDF({
        calculatorName: 'Control Valve Cavitation / Flashing Assessment',
        inputs: { P1: p1, P2: p2, Pv: pv, Pc: pc, FL: fl },
        result: { Regime: r.regime, 'Service sigma': fmt(r.sigmaService, 3), 'Choked dP': fmt(r.dpChoked, 3), 'Actual dP': fmt(r.dpActual, 3) },
        assumptions: { note: r.assumptions },
      }));
    } catch (e) { right.innerHTML = `<div class="empty-state">${e.message}</div>`; }
  });
}

// ---------- Formula Library ----------
function pageFormulaLibrary() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Reference</div><h1>Formula Library</h1>
    <p class="lead">Searchable engineering formulas with variables, units, worked examples, and assumptions.</p></div>`));
  const searchWrap = h(`<div class="field" style="max-width:420px;"><input type="text" id="flSearch" placeholder="Search formulas, e.g. 'orifice', 'Cv', 'RTD'..."></div>`);
  app.appendChild(searchWrap);
  const catBar = h('<div class="tabs" id="flCats"></div>');
  app.appendChild(catBar);
  const grid = h('<div class="grid cols-2" id="flGrid"></div>');
  app.appendChild(grid);

  let activeCat = 'All';
  function renderCats() {
    const cats = ['All', ...new Set(FORMULAS.map((f) => f.category))];
    catBar.innerHTML = '';
    cats.forEach((c) => {
      const t = h(`<div class="tab ${c === activeCat ? 'active' : ''}">${c}</div>`);
      t.addEventListener('click', () => { activeCat = c; renderCats(); renderGrid(); });
      catBar.appendChild(t);
    });
  }
  function renderGrid() {
    const q = searchWrap.querySelector('#flSearch').value.toLowerCase();
    grid.innerHTML = '';
    const items = FORMULAS.filter((f) =>
      (activeCat === 'All' || f.category === activeCat) &&
      (!q || `${f.name} ${f.formula} ${f.description}`.toLowerCase().includes(q))
    );
    if (!items.length) { grid.appendChild(h('<div class="empty-state">No formulas match.</div>')); return; }
    for (const f of items) {
      grid.appendChild(h(`
        <div class="card fl-card">
          <div class="fl-meta"><span class="fl-cat">${f.category}</span></div>
          <h4>${f.name}</h4>
          <div class="formula-box">${f.formula}</div>
          <p>${f.description}</p>
          <div class="result-grid">
            ${resultRow('Variables', f.variables)}
            ${resultRow('Units', f.units)}
            ${resultRow('Example', f.example)}
            ${resultRow('Application', f.application)}
            ${resultRow('Assumptions', f.assumptions)}
            ${resultRow('Standard', f.standard || '—')}
          </div>
        </div>
      `));
    }
  }
  searchWrap.querySelector('#flSearch').addEventListener('input', renderGrid);
  const waitForData = setInterval(() => {
    if (FORMULAS.length) { clearInterval(waitForData); renderCats(); renderGrid(); }
  }, 50);
}

// ---------- History ----------
async function pageHistory() {
  app.appendChild(h(`<div class="page-head"><div class="eyebrow">Reference</div><h1>Calculation History</h1>
    <p class="lead">Saved calculations from every calculator. Export a full JSON backup, or export any single result to PDF.</p></div>`));
  const actions = h(`<div class="btn-row" style="margin-bottom:16px;">
    <button class="btn secondary" id="backupBtn">Export full backup (JSON)</button>
    <label class="btn secondary" style="cursor:pointer;">Restore backup<input type="file" id="restoreFile" accept="application/json" style="display:none;"></label>
  </div>`);
  app.appendChild(actions);
  const tableWrap = h('<div class="card"></div>');
  app.appendChild(tableWrap);

  actions.querySelector('#backupBtn').addEventListener('click', () => store.exportBackup());
  actions.querySelector('#restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const backup = JSON.parse(text);
      const res = await store.importBackup(backup);
      toast(`Restored ${res.restored} calculations`);
      renderTable();
    } catch (err) { toast('Restore failed: ' + err.message); }
  });

  async function renderTable() {
    const allRows = await store.listHistory();
    // Reviews (and their comments) are stored, but this page is for
    // engineering calculations, not reviews — keep them out of this list.
    // Reviews and trip-diary entries are reference records, not engineering
    // calculations — keep this list focused on genuine calculations.
    const rows = allRows.filter((r) => r.calculatorId !== 'user-review' && r.calculatorId !== 'trip-diary-entry');
    if (!rows.length) { tableWrap.innerHTML = '<div class="empty-state">No saved calculations yet. Calculate something and click "Save to history".</div>'; return; }
    tableWrap.innerHTML = `<table><thead><tr><th>Name</th><th>Calculator</th><th>Date</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${r.id}">
        <td>${r.name}</td><td>${r.calculatorId}</td><td>${new Date(r.createdAt).toLocaleString()}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn secondary" data-act="pdf" style="padding:5px 10px;font-size:.76rem;">PDF</button>
          <button class="btn secondary" data-act="dup" style="padding:5px 10px;font-size:.76rem;">Duplicate</button>
          <button class="btn secondary" data-act="rename" style="padding:5px 10px;font-size:.76rem;">Rename</button>
          <button class="btn danger" data-act="del" style="padding:5px 10px;font-size:.76rem;">Delete</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
    tableWrap.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      const rec = rows.find((r) => r.id === id);
      tr.querySelector('[data-act="pdf"]').addEventListener('click', () => exportCalculationPDF({ calculatorName: rec.calculatorId, inputs: rec.inputs, result: rec.result, assumptions: rec.assumptions }));
      tr.querySelector('[data-act="dup"]').addEventListener('click', async () => { await store.duplicateCalculation(id); renderTable(); });
      tr.querySelector('[data-act="rename"]').addEventListener('click', async () => {
        const name = prompt('New name', rec.name);
        if (name) { await store.renameCalculation(id, name); renderTable(); }
      });
      tr.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (confirm('Delete this saved calculation?')) { await store.deleteCalculation(id); renderTable(); }
      });
    });
  }
  renderTable();
}

// ---------- Global search (topbar) ----------
function initGlobalSearch() {
  const input = document.getElementById('globalSearch');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      navigate('formula-library');
      setTimeout(() => {
        const fl = document.getElementById('flSearch');
        if (fl) { fl.value = input.value.trim(); fl.dispatchEvent(new Event('input')); }
      }, 60);
    }
  });
}

// ---------- Theme ----------
async function initTheme() {
  const saved = await store.getConfig('theme', 'dark');
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  btn.textContent = saved === 'dark' ? '☾ Dark' : '☀ Light';
  btn.addEventListener('click', async () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    btn.textContent = next === 'dark' ? '☾ Dark' : '☀ Light';
    await store.setConfig('theme', next);
  });
}

// ---------- Boot ----------
initTheme();
initGlobalSearch();
loadContentVisibility().then(() => navigate(''));
const adminLoginLink = document.getElementById('adminLoginLink');
if (adminLoginLink) {
  adminLoginLink.addEventListener('click', attemptAdminLogin);
  adminLoginLink.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); attemptAdminLogin(); } });
}

// Register the offline service worker if supported (progressive
// enhancement — the app works fully without it, this just adds offline
// support for repeat visits and installed/TWA usage). Never lets a
// registration failure affect the rest of the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
