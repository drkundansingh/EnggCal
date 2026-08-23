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
import { exportCalculationPDF } from './pdfExport.js';

const app = document.getElementById('content');
const navRoot = document.getElementById('nav-root');
let FORMULAS = [];

fetch('./data/formulaLibrary.json').then((r) => r.json()).then((data) => { FORMULAS = data; });

// ---------- Small DOM helpers ----------
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
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
    ]
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
    const g = h(`<div class="nav-group"><div class="nav-label">${group.group}</div></div>`);
    for (const item of group.items) {
      const a = h(`<div class="nav-item ${item.id === active ? 'active' : ''}" role="link" tabindex="0"><span class="ic">${item.icon}</span>${item.label}</div>`);
      a.addEventListener('click', () => navigate(item.id));
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(item.id); } });
      g.appendChild(a);
    }
    navRoot.appendChild(g);
  }
}

const ROUTES = {
  '': pageDashboard,
  'thermal-plant': pageThermalPlant,
  'protection': pageProtection,
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
  'formula-library': pageFormulaLibrary,
  'history': pageHistory,
  'support': pageSupport,
  'reviews': pageReviews,
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
    <div class="tab active" data-m="config">Plant Configuration</div>
    <div class="tab" data-m="ets">ETS Dashboard</div>
    <div class="tab" data-m="mft">MFT Dashboard</div>
    <div class="tab" data-m="simulator">Trip Simulator</div>
    <div class="tab" data-m="diagram">Trip Logic Diagram</div>
    <div class="tab" data-m="matrix">Trip Action Matrix</div>
    <div class="tab" data-m="reference">Reference Profiles</div>
    <div class="tab" data-m="history">Trip History</div>
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
    const o = overrides[p.id];
    return o ? { ...p, alarmSetpoint: o.alarmSetpoint, tripSetpoint: o.tripSetpoint, dataType: 'User Configured' } : p;
  }

  let mode = 'config';
  tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); mode = t.dataset.m; render();
  }));

  function render() {
    layout.style.gridTemplateColumns = '';
    left.style.display = '';
    right.innerHTML = '<div class="empty-state">Select options and calculate.</div>';
    if (mode === 'config') renderConfig();
    else if (mode === 'ets') renderDashboard('ETS');
    else if (mode === 'mft') renderDashboard('MFT');
    else if (mode === 'simulator') renderSimulator();
    else if (mode === 'diagram') renderDiagram();
    else if (mode === 'matrix') renderMatrix();
    else if (mode === 'reference') renderReference();
    else renderTripHistory();
  }

  function renderConfig() {
    left.innerHTML = `
      <div class="panel-title">Plant Configuration</div>
      <div class="field"><label>Plant type</label>
        <select id="cfgPlantType">${trip.PLANT_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.plantType ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Boiler type</label>
        <select id="cfgBoilerType">${trip.BOILER_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.boilerType ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Fuel</label>
        <select id="cfgFuelType">${trip.FUEL_TYPES.map((t) => `<option value="${t}" ${t === plantConfig.fuelType ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Unit rating (MW)</label><input type="number" id="cfgUnitMW" value="${plantConfig.unitMW}" min="25" max="1200"></div>
      <div class="field"><label>OEM reference profile</label>
        <select id="cfgOemProfile">${trip.OEM_REFERENCE_PROFILES.map((p) => `<option value="${p}" ${p === plantConfig.oemProfile ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <div class="hint">Changes attribution labeling only. Values shown remain generic/illustrative unless you override them yourself in the ETS/MFT dashboards — reference data never overrides your entered plant data.</div>
      </div>
      <div class="btn-row"><button class="btn" id="cfgApply">Apply</button></div>
    `;
    left.querySelector('#cfgApply').addEventListener('click', () => {
      plantConfig.plantType = left.querySelector('#cfgPlantType').value;
      plantConfig.boilerType = left.querySelector('#cfgBoilerType').value;
      plantConfig.fuelType = left.querySelector('#cfgFuelType').value;
      plantConfig.unitMW = +left.querySelector('#cfgUnitMW').value;
      plantConfig.oemProfile = left.querySelector('#cfgOemProfile').value;
      right.innerHTML = `<div class="panel-title">Configuration applied</div>
        <div class="result-grid">
          ${resultRow('Plant type', plantConfig.plantType)}
          ${resultRow('Boiler type', plantConfig.boilerType)}
          ${resultRow('Fuel', plantConfig.fuelType)}
          ${resultRow('Unit rating', plantConfig.unitMW + ' MW')}
          ${resultRow('OEM reference profile', plantConfig.oemProfile)}
        </div>
        <p style="color:var(--text-dim);font-size:.82rem;margin-top:10px;">This configuration now applies to the ETS/MFT dashboards, simulator, and reference profile tabs for the rest of this session (drum-only and once-through-only parameters are filtered accordingly).</p>`;
    });
    right.innerHTML = `<div class="empty-state">Set plant configuration, then switch to ETS/MFT Dashboard, Simulator, or Reference Profiles.</div>`;
  }

  function statusBadgeClass(status) {
    if (status === 'TRIP') return 'out';
    if (status === 'ALARM') return 'warning';
    return 'normal';
  }

  function renderDashboard(system) {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    const params = trip.parametersFor(plantConfig.boilerType).filter((p) => p.system === system).map(effectiveParam);
    right.innerHTML = `
      <div class="panel-title">${system === 'ETS' ? 'Turbine Trip Dashboard (ETS)' : 'Boiler Trip Dashboard (MFT)'} — ${plantConfig.plantType}, ${plantConfig.boilerType} boiler</div>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Parameter</th><th>Category</th><th>Value</th><th>Alarm</th><th>Trip</th><th>Status</th><th>Data type</th></tr></thead><tbody>
          ${params.map((p) => `<tr data-id="${p.id}">
            <td>${p.label}</td>
            <td style="font-size:.76rem;color:var(--text-dim);">${p.category}</td>
            <td><input type="number" class="pv-input" data-id="${p.id}" value="${(p.normalMin + p.normalMax) / 2}" step="any" style="width:100px;padding:5px 8px;"> <span style="color:var(--text-faint);font-size:.72rem;">${p.unit}</span></td>
            <td class="num">${fmt(p.alarmSetpoint, 3)}</td>
            <td class="num">${fmt(p.tripSetpoint, 3)}</td>
            <td class="status-cell"><span class="badge normal">NORMAL</span></td>
            <td style="font-size:.7rem;color:var(--text-faint);">${p.dataType}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="btn-row" style="margin-top:14px;"><button class="btn secondary" id="evalAllBtn">Evaluate all statuses</button></div>
      <p style="color:var(--text-dim);font-size:.78rem;margin-top:10px;">Enter a current value per parameter and click Evaluate — this simulates live status against the configured setpoints. Click a row's alarm/trip cell in the Reference Profiles tab to override defaults.</p>
    `;
    right.querySelector('#evalAllBtn').addEventListener('click', () => {
      right.querySelectorAll('tr[data-id]').forEach((tr) => {
        const id = tr.dataset.id;
        const p = params.find((x) => x.id === id);
        const val = +tr.querySelector('.pv-input').value;
        const status = trip.evaluateStatus(val, p.alarmSetpoint, p.tripSetpoint, p.direction);
        tr.querySelector('.status-cell').innerHTML = `<span class="badge ${statusBadgeClass(status)}">${status}</span>`;
      });
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

  function renderDiagram() {
    layout.style.gridTemplateColumns = '1fr';
    left.style.display = 'none';
    const examples = [
      { title: 'Turbine Overspeed → ETS', sensors: ['Speed Probe 1', 'Speed Probe 2', 'Speed Probe 3'], voting: '2oo3', signal: 'ETS Trip', paramId: 'ets-overspeed' },
      { title: 'Furnace Pressure HIGH-HIGH → MFT', sensors: ['Furnace PT-1', 'Furnace PT-2', 'Furnace PT-3'], voting: '2oo3', signal: 'MFT', paramId: 'mft-furnace-pressure-hh' },
      { title: 'Loss of All Flame → MFT', sensors: ['Scanner Group A', 'Scanner Group B', 'Scanner Group C'], voting: '2oo3', signal: 'MFT', paramId: 'mft-loss-all-flame' },
      { title: 'Drum Level LOW-LOW → MFT', sensors: ['Level TX-1', 'Level TX-2', 'Level TX-3'], voting: '2oo3', signal: 'MFT', paramId: 'mft-drum-level-ll' },
    ];
    right.innerHTML = `<div class="panel-title">Trip Logic Diagram</div>
      <p style="color:var(--text-dim);font-size:.82rem;">Click any block to see its signal, setpoint, logic, delay, action, and status. These are worked examples — actual sensor tag names and exact sequences are plant-configurable.</p>
      <div id="diagrams"></div>
      <div id="diagramDetail" class="card" style="margin-top:16px;background:var(--bg-inset);"><div class="empty-state">Click a block above for details.</div></div>`;
    const container = right.querySelector('#diagrams');
    for (const ex of examples) {
      const param = trip.PARAMETER_REGISTRY.find((p) => p.id === ex.paramId);
      const block = h(`<div style="margin-bottom:18px;">
        <div class="panel-title" style="margin-bottom:8px;">${ex.title}</div>
        <div class="pid-loop">
          ${ex.sensors.map((s) => `<span class="stage diagram-block" data-role="sensor" data-label="${s}" style="cursor:pointer;">${s}</span>`).join('<span class="arrow">→</span>')}
          <span class="arrow">→</span>
          <span class="stage diagram-block" data-role="voting" style="cursor:pointer;color:var(--amber);">${ex.voting} VOTING</span>
          <span class="arrow">→</span>
          <span class="stage diagram-block" data-role="signal" style="cursor:pointer;color:var(--red);">${ex.signal}</span>
        </div>
      </div>`);
      block.querySelectorAll('.diagram-block').forEach((el) => {
        el.addEventListener('click', () => {
          const role = el.dataset.role;
          const detail = right.querySelector('#diagramDetail');
          if (role === 'sensor') {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Signal', el.dataset.label)}
              ${resultRow('Parameter', param.label)}
              ${resultRow('Unit', param.unit)}
              ${resultRow('Normal range', `${fmt(param.normalMin,2)} – ${fmt(param.normalMax,2)} ${param.unit}`)}
              ${resultRow('Status', 'Simulated sensor — see ETS/MFT Dashboard for live evaluation')}
            </div>`;
          } else if (role === 'voting') {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Logic', ex.voting + ' voting')}
              ${resultRow('Setpoint (alarm)', fmt(param.alarmSetpoint,3) + ' ' + param.unit)}
              ${resultRow('Setpoint (trip)', fmt(param.tripSetpoint,3) + ' ' + param.unit)}
              ${resultRow('Time delay', param.timeDelaySec + ' s')}
              ${resultRow('Permissive', param.permissive)}
            </div>`;
          } else {
            detail.innerHTML = `<div class="result-grid" style="grid-template-columns:1fr;">
              ${resultRow('Trip signal', ex.signal)}
              ${resultRow('Classification', param.classification)}
              ${resultRow('Action', param.tripAction)}
              ${resultRow('Reset condition', param.resetCondition)}
              ${resultRow('Status', '<span class="badge out">TRIP (example)</span>')}
            </div>`;
          }
        });
      });
      container.appendChild(block);
    }
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
  const PAYEE_NAME = 'KUNDAN KUMAR';
  // The site owner's actual QR image (cropped from their uploaded scan
  // card). It's a static image, so — unlike a dynamically generated QR —
  // it can't encode the donation amount; scanning it means entering the
  // amount by hand in the UPI app. The "Open in UPI App" button below
  // builds its own live link with the real UPI ID and the chosen amount,
  // so that path still pre-fills the amount automatically.
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
    const upiUri = `upi://pay?${new URLSearchParams({ pa: UPI_ID, pn: PAYEE_NAME, am: selectedAmount, cu: 'INR', tn: 'Support the Project donation' }).toString()}`;
    modalBody.innerHTML = `
      <h3>Scan &amp; Pay — ₹${fmt(selectedAmount, 0)}</h3>
      <div class="qr-wrap"><img src="${QR_IMAGE_SRC}" alt="UPI QR code — Kundan Kumar"></div>
      <div class="scan-pay-note">📱 Scan &amp; Pay using any UPI app (Google Pay, PhonePe, Paytm, BHIM) — then enter ₹${fmt(selectedAmount, 0)} manually, since this QR image doesn't carry the amount. Or tap "Open in UPI App" below to have the amount filled in for you.</div>
      <div class="upi-id-row"><span id="donateUpiIdText">${UPI_ID}</span><button type="button" id="donateCopyUpiBtn">Copy</button></div>
      <button class="btn secondary" id="openUpiAppBtn" type="button" style="width:100%;justify-content:center;margin-bottom:10px;">Open in UPI App</button>
      <button class="btn" id="haveDonatedBtn" type="button" style="width:100%;justify-content:center;background:var(--green);border-color:var(--green);color:#06210c;">I Have Donated</button>
    `;
    modalBody.querySelector('#openUpiAppBtn').addEventListener('click', () => { window.location.href = upiUri; });
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
    const rows = allRows.filter((r) => r.calculatorId !== 'user-review');
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
navigate('');

// Register the offline service worker if supported (progressive
// enhancement — the app works fully without it, this just adds offline
// support for repeat visits and installed/TWA usage). Never lets a
// registration failure affect the rest of the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
