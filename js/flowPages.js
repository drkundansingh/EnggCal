/**
 * Power-plant flow-measurement pages (spec-driven).
 * Each page is described by a plain spec object; makePage() renders inputs, runs compute(),
 * and shows headline, rows, warnings, formula, assumptions, save-to-history and PDF export.
 */
import * as steam from './calculators/steamTable.js';
import * as iso from './calculators/dpFlowISO.js';
import * as dc from './calculators/densityCorrection.js';
import * as flowEng from './calculators/flowEngine.js';
import * as ppf from './calculators/powerPlantFlow.js';

const TH = 1000 / 3600; // t/h → kg/s
const DP_UNITS = {Pa: 1, mmWC: 9.80665, mbar: 100, kPa: 1000, inWC: 249.0889, bar: 1e5}; // → Pa (mmWC = mm H2O at 4 °C)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildFlowPages({ app, h, fmt, resultRow, saveAndToast, exportCalculationPDF }) {
  const dpFmt = (pa, u) => fmt(pa / DP_UNITS[u], 4) + ' ' + u;
  const sig = (v, n = 5) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(n)).toLocaleString(undefined, { maximumFractionDigits: 10 }) : '—');

  function fieldHTML(f) {
    const hint = f.hint ? `<div class="hint">${f.hint}</div>` : '';
    const modes = f.modes ? ` data-modes="${f.modes.join(',')}"` : '';
    let input;
    if (f.type === 'select') {
      input = `<select id="${f.id}">${f.options.map(([v, l]) => `<option value="${v}"${v === f.value ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${f.id}" rows="${f.rows || 6}" style="width:100%;font-family:var(--mono, monospace);">${f.value ?? ''}</textarea>`;
    } else {
      input = `<input type="number" id="${f.id}" step="any" value="${f.value ?? ''}"${f.optional ? ' placeholder="optional"' : ''}>`;
    }
    return `<div class="field" data-fid="${f.id}"${modes}><label>${f.label}</label>${input}${hint}</div>`;
  }

  function makePage(spec) {
    return function page() {
      app.appendChild(h(`<div class="page-head"><div class="eyebrow">Power Plant · Flow</div><h1>${spec.title}</h1><p class="lead">${spec.lead}</p></div>`));
      const layout = h('<div class="calc-layout"></div>');
      const panels = spec.panels.map((p, i) => {
        const inner = `<div class="panel-title"${p.modes ? ` data-modes="${p.modes.join(',')}"` : ''} data-pid="${i}">${p.title}</div>${p.fields.map(fieldHTML).join('')}`;
        return p.advanced ? `<details class="adv-panel" data-pid-d="${i}" style="margin:14px 0;"><summary style="cursor:pointer;color:var(--amber);font-size:.85rem;">${p.title} — optional, sensible defaults are used</summary>${p.fields.map(fieldHTML).join('')}</details>` : inner;
      }).join('');
      const left = h(`<div class="card">${panels}<div class="btn-row"><button class="btn" id="calc">Calculate</button></div></div>`);
      const right = h(`<div class="card"><div class="empty-state">${spec.empty || 'Enter the inputs and press Calculate.'}</div></div>`);
      layout.append(left, right);
      app.appendChild(layout);

      const allFields = spec.panels.flatMap((p) => p.fields);
      const applyMode = () => {
        if (!spec.modeField) return;
        const mode = left.querySelector('#' + spec.modeField).value;
        left.querySelectorAll('[data-modes]').forEach((el) => {
          el.style.display = el.dataset.modes.split(',').includes(mode) && el.dataset.hiddenByWhen !== '1' ? '' : 'none';
        });
      };
      // Conditional fields: f.when(state) hides inputs that do not apply to the chosen element / fluid / mode.
      const applyWhen = () => {
        const g = (id) => { const el = left.querySelector('#' + id); return el ? el.value : undefined; };
        const st = { mode: g('mode'), element: g('element'), fluid: g('fluid'), shape: g('shape'), gasKey: g('gasKey') };
        st.avg = st.element === 'airfoil';
        allFields.forEach((f) => {
          if (!f.when) return;
          const w = left.querySelector(`[data-fid="${f.id}"]`);
          if (!w) return;
          const ok = f.when(st);
          w.dataset.hiddenByWhen = ok ? '' : '1';
          w.style.display = ok ? '' : 'none';
        });
        applyMode();
        left.querySelectorAll('[data-hidden-by-when="1"]').forEach((el) => { el.style.display = 'none'; });
        spec.panels.forEach((p, i) => {
          const t = left.querySelector(`[data-pid="${i}"]`);
          if (t) { const any = p.fields.some((f) => { const w = left.querySelector(`[data-fid="${f.id}"]`); return w && w.style.display !== 'none'; }); t.style.display = any ? '' : 'none'; }
        });
      };
      if (spec.modeField) left.querySelector('#' + spec.modeField).addEventListener('change', applyWhen);
      left.querySelectorAll('select').forEach((el) => el.addEventListener('change', applyWhen));
      applyWhen();

      const read = () => {
        const v = {};
        allFields.forEach((f) => {
          const el = left.querySelector('#' + f.id);
          if (f.type === 'select' || f.type === 'textarea') v[f.id] = el.value;
          else v[f.id] = el.value === '' ? undefined : +el.value;
        });
        v._mode = spec.modeField ? left.querySelector('#' + spec.modeField).value : null;
        return v;
      };

      left.querySelector('#calc').addEventListener('click', () => {
        let r;
        try {
          const vals = read();
          r = spec.compute(vals);
          r._vals = vals;
        } catch (e) { right.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }
        const warn = (r.warnings || []).map((w) => `<div class="assumptions-note" style="margin-top:8px;border-left:3px solid var(--amber);">⚠ ${esc(w)}</div>`).join('');
        right.innerHTML = `
          <div style="text-align:center;padding:16px 0;">
            <div style="font-size:1.8rem;font-weight:700;color:var(--cyan);">${r.headline.value}</div>
            <div style="color:var(--text-dim);font-size:.85rem;margin-top:4px;">${r.headline.label}</div>
          </div>
          <div class="result-grid">${r.rows.map(([k, v]) => resultRow(k, v)).join('')}</div>
          ${warn}
          <div class="formula-box" style="margin-top:12px;">${r.formula || spec.formula}</div>
          <div class="assumptions-note" style="margin-top:12px;">${spec.note}</div>
          <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="saveBtn">Save to history</button><button class="btn secondary" id="pdfBtn">Export PDF</button></div>`;
        const inputsForSave = r.pdfInputs || {};
        right.querySelector('#saveBtn').addEventListener('click', () => saveAndToast(spec.id, `${spec.shortName} — ${r.headline.value}`, inputsForSave, Object.fromEntries(r.rows)));
        right.querySelector('#pdfBtn').addEventListener('click', () => exportCalculationPDF({
          calculatorName: spec.title,
          inputs: inputsForSave,
          result: Object.fromEntries([[r.headline.label, r.headline.value], ...r.rows]),
          assumptions: { note: spec.pdfNote || spec.note.replace(/<[^>]+>/g, '') },
        }));
      });
    };
  }

  /* ---------------------------------------------------------------- */
  /* 1. ISO 5167                                                       */
  /* ---------------------------------------------------------------- */
  const elementOptions = [...Object.entries(iso.ELEMENTS).map(([k, v]) => [k, v.label]), ['airfoil', 'Airfoil / averaging pitot (duct or pipe, datasheet K)']];
  const iso5167 = makePage({
    id: 'iso5167-flow', shortName: 'ISO 5167 flow', title: 'DP Flow — ISO 5167 (Orifice, Nozzle, Venturi)',
    lead: 'Steam, water or gas flow from a differential-pressure primary element using the full ISO 5167 equations: Reader-Harris/Gallagher discharge coefficient, Reynolds-number iteration, expansibility from the real IF97 isentropic exponent, bore and pipe thermal expansion, limits-of-use checks and a GUM uncertainty budget.',
    modeField: 'mode',
    panels: [
      { title: '1 · What to calculate', fields: [
        { id: 'mode', label: 'Solve for', type: 'select', value: 'flow', options: [['flow', 'Mass flow from measured Δp'], ['dp', 'Δp produced by a given flow'], ['bore', 'Bore diameter for a given flow and Δp']] },
        { id: 'element', label: 'Primary element', type: 'select', value: 'orifice_flange', options: elementOptions },
        { id: 'fluid', label: 'Fluid', type: 'select', value: 'iapws', options: [['iapws', 'Water / steam (IAPWS-IF97)'], ['gas', 'Gas / air / flue gas']] },
      ] },
      { title: '2 · Primary element & pipe', fields: [
        { id: 'shape', label: 'Pipe / duct section', type: 'select', value: 'circular', options: [['circular', 'Circular pipe'], ['rectangular', 'Rectangular / square duct']], when: (s) => s.avg },
        { id: 'D20', label: 'Pipe internal diameter D (mm)', value: 250, when: (s) => !s.avg || s.shape === 'circular' },
        { id: 'W', label: 'Duct width W (mm)', value: 3000, when: (s) => s.avg && s.shape === 'rectangular' },
        { id: 'H', label: 'Duct height H (mm)', value: 2000, when: (s) => s.avg && s.shape === 'rectangular' },
        { id: 'd20', label: 'Bore / throat diameter d (mm)', value: 150, modes: ['flow', 'dp'], when: (s) => !s.avg },
        { id: 'Kav', label: 'Flow coefficient K (datasheet)', value: 0.95, when: (s) => s.avg, hint: 'From the maker’s datasheet / calibration certificate: Q = K · A · √(2Δp/ρ). An airfoil has no generic value.' },
      ] },
      { title: '3 · Process conditions', fields: [
        { id: 'p1', label: 'Upstream static pressure (bar abs)', value: 30 },
        { id: 'T', label: 'Flowing temperature (°C)', value: 400 },
        { id: 'gasKey', label: 'Gas', type: 'select', value: 'air', options: Object.entries(dc.GASES).map(([k, g]) => [k, g.label]), when: (s) => s.fluid === 'gas', hint: 'Density, viscosity and κ are calculated automatically for the chosen gas.' },
        { id: 'rhGas', label: 'Relative humidity (%)', value: 0, when: (s) => s.fluid === 'gas' && s.gasKey === 'air', hint: 'Moist-air density per CIPM-2007. 0 = dry.' },
        { id: 'dpUnit', label: 'Δp unit', type: 'select', value: 'mbar', options: Object.keys(DP_UNITS).map((u) => [u, u === 'mmWC' ? 'mmWC (mm H₂O)' : u === 'inWC' ? 'inWC (in H₂O)' : u]), modes: ['flow', 'bore'] },
        { id: 'dpMbar', label: 'Measured differential pressure Δp', value: 250, modes: ['flow', 'bore'] },
        { id: 'qmTh', label: 'Mass flow (t/h)', value: 40, modes: ['dp', 'bore'] },
      ] },
      { title: 'Advanced', advanced: true, fields: [
        { id: 'rhoG', label: 'Gas density override (kg/m³)', value: undefined, optional: true, when: (s) => s.fluid === 'gas', hint: 'Leave blank for automatic real-gas density.' },
        { id: 'muG', label: 'Gas viscosity override (µPa·s)', value: undefined, optional: true, when: (s) => s.fluid === 'gas' && !s.avg, hint: 'Blank = Sutherland value for the chosen gas.' },
        { id: 'kapG', label: 'Gas isentropic exponent κ override', value: undefined, optional: true, when: (s) => s.fluid === 'gas' && !s.avg, hint: 'Blank = standard value for the chosen gas.' },
        { id: 'alphaBore', label: 'Bore expansion coefficient (×10⁻⁶ /K)', value: 17, when: (s) => !s.avg, hint: '17 ≈ austenitic stainless. 0 switches the correction off.' },
        { id: 'alphaPipe', label: 'Pipe expansion coefficient (×10⁻⁶ /K)', value: 13, when: (s) => !s.avg, hint: '13 ≈ low-alloy Cr-Mo steel. 0 switches the correction off.' },
        { id: 'uD', label: 'Uncertainty of D (%, 95 %)', value: 0.3, when: (s) => !s.avg },
        { id: 'ud', label: 'Uncertainty of d (%, 95 %)', value: 0.05, when: (s) => !s.avg },
        { id: 'uDp', label: 'Uncertainty of Δp (%, 95 %)', value: 0.5 },
        { id: 'uRho', label: 'Uncertainty of density (%, 95 %)', value: 0.5 },
      ] },
    ],
    formula: 'q<sub>m</sub> = C / √(1−β⁴) · ε · (π/4) d² · √(2 Δp ρ<sub>1</sub>) &nbsp;(ISO 5167-1)<br>C from Reader-Harris/Gallagher (orifice, ISO 5167-2), ISA 1932 / long-radius / Venturi nozzle (ISO 5167-3), classical Venturi (ISO 5167-4); iterated on Re<sub>D</sub> = 4q<sub>m</sub>/(π D µ).<br>Orifice ε = 1 − (0.351 + 0.256β⁴ + 0.93β⁸)(1 − (p<sub>2</sub>/p<sub>1</sub>)<sup>1/κ</sup>); nozzle/Venturi ε from the isentropic-expansion equation.',
    note: '<b>Orifice, nozzle and Venturi: circular pipes only</b> — ISO 5167 does not cover rectangular or square ducts. For a duct choose <b>Airfoil / averaging pitot</b> above (any circular or rectangular section, datasheet K), or use the DP → Flow Wizard or the Pitot Traverse page. C, ε and the Re<sub>D</sub> iteration were checked against the independent open-source <em>fluids</em> library (agreement ~10⁻¹⁵), and water/steam properties against <em>iapws</em>. Valid only inside the ISO limits of use (warnings are shown if you leave them) for single-phase, steady flow with ISO-compliant upstream/downstream straight lengths, sharp edges and tapping geometry. Not applicable to wet steam (no wet-steam correction), IF97 Region 3 (&gt;350 °C with p &gt; the saturation line), or pulsating flow. The expansion coefficients are typical mean values — use your material data. The uncertainty on C and ε follows the ISO 5167 statements (nozzle/Venturi ε rule taken from a text extraction; check against your licensed ISO copy for contractual use).',
    compute(v) {
      const mode = v._mode;
      const D20 = v.D20 / 1000;
      let fl;
      let liquid = false;
      if (v.fluid === 'iapws') {
        fl = steam.fluidProps(v.p1, v.T);
        fl.densityMethod = 'IAPWS-IF97 real-fluid density at the upstream tap';
        liquid = /water/.test(fl.phase) && !/saturated/.test(fl.phase);
      } else {
        const auto = !(v.rhoG > 0);
        const gk = v.gasKey || 'air';
        const dd = auto ? dc.flowingDensity({ kind: v.gasKey === 'air' ? 'air' : 'gas', gas: v.gasKey, pPa: v.p1 * 1e5, tC: v.T, rh: (v.rhGas || 0) / 100 }) : { density: v.rhoG };
        fl = { densityMethod: auto ? dd.method + ' (' + dd.standard + ')' : 'user-entered density', densityKgM3: dd.density, viscosityPaS: (v.muG > 0 ? v.muG : dc.gasViscosityMicroPaS(v.T, gk)) * 1e-6, isentropicExponent: v.kapG > 1 ? v.kapG : dc.GASES[gk].kappa, phase: 'gas', note: '' };
      }
      if (v.element === 'airfoil') {
        if (mode === 'bore') throw new Error('An airfoil / averaging element has no bore to size — choose "Mass flow from measured Δp" or "Δp produced by a given flow".');
        if (!(v.Kav > 0)) throw new Error('Enter the airfoil flow coefficient K from the datasheet.');
        const geo = flowEng.ductGeometry({ pipeShape: v.shape, pipeIdM: D20, ductWidthM: v.W / 1000, ductHeightM: v.H / 1000 });
        const rho = fl.densityKgM3, A = geo.areaM2;
        let dpPa, qm;
        if (mode === 'flow') { dpPa = v.dpMbar * DP_UNITS[v.dpUnit]; qm = v.Kav * A * Math.sqrt(2 * dpPa / rho) * rho; }
        else { qm = v.qmTh * TH; dpPa = 0.5 * rho * Math.pow(qm / (rho * v.Kav * A), 2); }
        const warnA = ['Averaging / airfoil elements are proprietary: accuracy is that of the maker’s calibration (typically ±1 %), not ISO 5167. Use the density at the element, and straight-run lengths from the datasheet.'];
        if (fl.note && v.fluid === 'iapws') warnA.push(fl.note);
        const uA = Math.sqrt(Math.pow(0.5 * v.uDp, 2) + Math.pow(0.5 * v.uRho, 2) + 1);
        return {
          headline: { value: fmt(qm * 3.6, 3) + ' t/h', label: 'Airfoil / averaging element' },
          rows: [
            ['Mass flow', fmt(qm * 3.6, 4) + ' t/h (' + fmt(qm, 4) + ' kg/s)'],
            ['Volume flow at element', fmt(qm / rho * 3600, 2) + ' m³/h'],
            ['Differential pressure', dpFmt(dpPa, v.dpUnit) + (v.dpUnit === 'Pa' ? '' : ' (' + fmt(dpPa, 1) + ' Pa)')],
            ['Flow coefficient K', sig(v.Kav, 5)],
            ['Section', geo.shape === 'rectangular' ? 'Rectangular ' + v.W + ' × ' + v.H + ' mm' : 'Circular Ø' + v.D20 + ' mm'],
            ['Flow area / hydraulic diameter', fmt(A, 4) + ' m² / ' + fmt(geo.hydraulicDiameterM, 4) + ' m'],
            ['Mean velocity', fmt(qm / rho / A, 3) + ' m/s'],
            ['Density basis', fl.densityMethod],
            ['Fluid density', fmt(rho, 4) + ' kg/m³'],
            ['Indicative uncertainty (K 1 % assumed, 95 %)', '± ' + fmt(uA, 2) + ' %'],
          ],
          warnings: warnA,
          formula: 'q<sub>m</sub> = K · A · √(2 Δp ρ) &nbsp;(averaging / airfoil element; A = W×H or πD²/4, K from the maker’s calibration)',
          pdfInputs: { Mode: mode, Element: 'Airfoil / averaging', Section: geo.shape, K: v.Kav, Pressure: v.p1 + ' bar abs', Temperature: v.T + ' °C' },
        };
      }
      const base = {
        element: v.element, D20, tempC: v.T, alphaBore: v.alphaBore * 1e-6, alphaPipe: v.alphaPipe * 1e-6,
        p1Pa: v.p1 * 1e5, rho: fl.densityKgM3, mu: fl.viscosityPaS, kappa: fl.isentropicExponent, liquid,
        uDpct: v.uD, udPct: v.ud, uDpPct: v.uDp, uRhoPct: v.uRho,
      };
      let res, d20mm = v.d20, dpPa;
      if (mode === 'flow') {
        dpPa = v.dpMbar * DP_UNITS[v.dpUnit];
        res = iso.solveFlow({ ...base, d20: v.d20 / 1000, dpPa });
      } else if (mode === 'dp') {
        res = iso.solveDP({ ...base, d20: v.d20 / 1000, qmKgS: v.qmTh * TH });
        dpPa = res.dpPa;
      } else {
        dpPa = v.dpMbar * DP_UNITS[v.dpUnit];
        const b = iso.solveBore({ ...base, dpPa, qmKgS: v.qmTh * TH });
        res = b; d20mm = b.d20 * 1000;
      }
      const warn = [...res.warnings];
      if (fl.note && v.fluid === 'iapws') warn.push(fl.note);
      if (v.fluid === 'iapws' && /saturated/.test(fl.phase)) warn.push('State is within 1 °C of saturation: wet-steam flow is not covered by ISO 5167 — treat as indicative only.');
      const u = res.uncertainty;
      const rows = [
        ['Mass flow', fmt(res.massFlowKgS * 3.6, 4) + ' t/h (' + fmt(res.massFlowKgS, 4) + ' kg/s)'],
        ['Volume flow at tap', fmt(res.volumeFlowM3S * 3600, 3) + ' m³/h'],
        ['Differential pressure', dpFmt(dpPa, v.dpUnit) + (v.dpUnit === 'Pa' ? '' : ' (' + fmt(dpPa, 1) + ' Pa)')],
        ['Discharge coefficient C', sig(res.C, 6)],
        ['Expansibility ε', sig(res.epsilon, 6)],
        ['Pipe Reynolds number Re_D', sig(res.ReD, 4)],
        ['β (hot)', sig(res.beta, 5)],
        ['Bore d at 20 °C / hot', fmt(d20mm, 4) + ' / ' + fmt(res.dBore * 1000, 4) + ' mm'],
        ['Pipe velocity', fmt(res.velocityPipeMs, 3) + ' m/s'],
        ['Permanent pressure loss', fmt(res.permanentLossPa / 100, 3) + ' mbar (' + res.permanentLossNote + ')'],
        ['Density basis', fl.densityMethod],
        ['Fluid density / viscosity', fmt(fl.densityKgM3, 4) + ' kg/m³ / ' + sig(fl.viscosityPaS * 1e6, 5) + ' µPa·s'],
        ['κ used in ε', liquid ? 'liquid (ε = 1)' : sig(fl.isentropicExponent, 5)],
        ['U(C) / U(ε)', fmt(u.parts.discharge, 3) + ' % / ' + fmt(u.parts.expansibility, 3) + ' %'],
        ['Contribution from D / d / Δp / ρ', [u.parts.pipeDiameter, u.parts.boreDiameter, u.parts.differentialPressure, u.parts.density].map((x) => fmt(x, 3)).join(' / ') + ' %'],
        ['Expanded uncertainty of mass flow (95 %)', '± ' + fmt(u.totalPct, 3) + ' %'],
      ];
      return {
        headline: { value: fmt(res.massFlowKgS * 3.6, 3) + ' t/h', label: iso.ELEMENTS[v.element].label },
        rows, warnings: warn,
        pdfInputs: { Mode: mode, Element: iso.ELEMENTS[v.element].label, 'Pipe D (20 °C)': v.D20 + ' mm', 'Bore d (20 °C)': fmt(d20mm, 4) + ' mm', 'Pressure': v.p1 + ' bar abs', Temperature: v.T + ' °C', 'Δp': fmt(dpPa / 100, 3) + ' mbar', 'alpha bore/pipe': v.alphaBore + ' / ' + v.alphaPipe + ' ×10⁻⁶/K' },
      };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 2. Stodola                                                        */
  /* ---------------------------------------------------------------- */
  const stodola = makePage({
    id: 'stodola-flow', shortName: 'Stodola flow', title: 'Turbine Stage-Group Flow (Stodola Ellipse)',
    lead: 'Steam flow through a turbine stage group from its inlet and exit pressures, scaled from one known reference point with the Stodola ellipse law and exact IF97 specific volume — the standard way to infer extraction and throttle flows between heat-balance points.',
    modeField: 'mode',
    panels: [
      { title: 'Reference point (design, heat balance or test)', fields: [
        { id: 'mode', label: 'Solve for', type: 'select', value: 'flow', options: [['flow', 'Flow at a new operating point'], ['p1', 'Inlet pressure for a target flow']] },
        { id: 'rp1', label: 'Reference inlet pressure (bar abs)', value: 100 },
        { id: 'rp2', label: 'Reference exit pressure (bar abs)', value: 40 },
        { id: 'rT', label: 'Reference inlet temperature (°C)', value: 540 },
        { id: 'rq', label: 'Reference flow (t/h)', value: 360 },
      ] },
      { title: 'New operating point', fields: [
        { id: 'p1', label: 'Inlet pressure (bar abs)', value: 70, modes: ['flow'] },
        { id: 'p2', label: 'Exit pressure (bar abs)', value: 28 },
        { id: 'T', label: 'Inlet temperature (°C)', value: 535 },
        { id: 'qt', label: 'Target flow (t/h)', value: 250, modes: ['p1'] },
        { id: 'stages', label: 'Number of stages in the group', value: 8, hint: 'The ellipse law fits groups of several stages; a single stage or nozzle group behaves differently near choking.' },
      ] },
    ],
    formula: 'ṁ = K · √[ (p₁² − p₂²) / (p₁ · v₁) ]&nbsp; &nbsp;(Stodola ellipse law)<br>K from the reference point; v₁ = IF97 specific volume at (p₁, T₁).',
    note: 'The ellipse law holds for a stage group (many stages) running below critical flow with unchanged geometry; it is a scaling law, so the result is only as good as the reference flow and pressures you supply (take them from a heat balance or acceptance test, not from memory). It does not include leakage changes, governing-stage (nozzle-group) throttling, or wet-steam effects. Specific volume is exact IAPWS-IF97.',
    compute(v) {
      const ref = { p1Bar: v.rp1, p2Bar: v.rp2, t1C: v.rT, flowKgS: v.rq * TH };
      if (v._mode === 'p1') {
        const p1 = ppf.stodolaInletPressure({ ref, flowKgS: v.qt * TH, p2Bar: v.p2, t1C: v.T });
        const r = ppf.stodolaFlow({ ref, p1Bar: p1, p2Bar: v.p2, t1C: v.T, stages: v.stages });
        return { headline: { value: fmt(p1, 3) + ' bar a', label: 'inlet pressure for ' + fmt(v.qt, 2) + ' t/h' }, rows: [['Pressure ratio p₂/p₁', sig(r.pressureRatio, 4)], ['Check flow', fmt(r.flowKgS / TH, 3) + ' t/h'], ['Stodola constant K', sig(r.K, 6)], ['Specific volume v₁', sig(r.v1M3Kg, 6) + ' m³/kg']], warnings: r.warnings, pdfInputs: { 'Reference': `${v.rp1}/${v.rp2} bar, ${v.rT} °C, ${v.rq} t/h`, Target: v.qt + ' t/h', 'p2': v.p2 + ' bar', 'T1': v.T + ' °C' } };
      }
      const r = ppf.stodolaFlow({ ref, p1Bar: v.p1, p2Bar: v.p2, t1C: v.T, stages: v.stages });
      return { headline: { value: fmt(r.flowKgS / TH, 3) + ' t/h', label: 'steam flow through the stage group' }, rows: [['Flow / reference flow', fmt(r.flowRatioToRef * 100, 2) + ' %'], ['Pressure ratio p₂/p₁', sig(r.pressureRatio, 4)], ['Stodola constant K', sig(r.K, 6)], ['Specific volume v₁', sig(r.v1M3Kg, 6) + ' m³/kg']], warnings: r.warnings, pdfInputs: { 'Reference': `${v.rp1}/${v.rp2} bar, ${v.rT} °C, ${v.rq} t/h`, 'p1': v.p1 + ' bar', 'p2': v.p2 + ' bar', 'T1': v.T + ' °C' } };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 3. Feedwater heater                                               */
  /* ---------------------------------------------------------------- */
  const heater = makePage({
    id: 'heater-extraction-flow', shortName: 'Heater extraction flow', title: 'Feedwater Heater — Extraction Steam Flow',
    lead: 'Extraction steam flow of a closed feedwater heater from an exact energy balance with IAPWS-IF97 enthalpies, including a cascaded drain from the next higher heater and a casing heat-loss factor — or the feedwater flow from a measured extraction flow.',
    modeField: 'mode',
    panels: [
      { title: 'Feedwater side', fields: [
        { id: 'mode', label: 'Solve for', type: 'select', value: 'ext', options: [['ext', 'Extraction flow from feedwater flow'], ['fw', 'Feedwater flow from extraction flow']] },
        { id: 'fwFlow', label: 'Feedwater flow (t/h)', value: 1000, modes: ['ext'] },
        { id: 'extFlow', label: 'Extraction steam flow (t/h)', value: 60, modes: ['fw'] },
        { id: 'fwP', label: 'Feedwater pressure (bar abs)', value: 200 },
        { id: 'fwIn', label: 'Feedwater inlet temperature (°C)', value: 180 },
        { id: 'fwOut', label: 'Feedwater outlet temperature (°C)', value: 210 },
      ] },
      { title: 'Shell side', fields: [
        { id: 'eP', label: 'Extraction pressure at the heater (bar abs)', value: 25 },
        { id: 'eT', label: 'Extraction temperature (°C)', value: 350, hint: 'Ignored if dryness x is entered.' },
        { id: 'eX', label: 'Extraction dryness x (0–1)', optional: true, value: '', hint: 'Only for saturated/wet extraction steam.' },
        { id: 'dT', label: 'Drain outlet temperature (°C)', value: 185 },
        { id: 'eta', label: 'Heat-transfer effectiveness to feedwater (%)', value: 99.5, hint: '100 − casing/radiation loss. Typical 99–100 %.' },
      ] },
      { title: 'Cascaded drain from the higher-pressure heater (optional)', fields: [
        { id: 'cFlow', label: 'Cascade drain flow (t/h)', value: 0 },
        { id: 'cP', label: 'Cascade drain pressure (bar abs)', value: 50 },
        { id: 'cT', label: 'Cascade drain temperature (°C)', value: 240 },
      ] },
    ],
    formula: 'ṁ<sub>ext</sub>(h<sub>ext</sub> − h<sub>drain</sub>) + ṁ<sub>casc</sub>(h<sub>casc</sub> − h<sub>drain</sub>) = ṁ<sub>fw</sub>(h<sub>fw,out</sub> − h<sub>fw,in</sub>) / η<br>All h from IAPWS-IF97 (compressed liquid evaluated at feedwater pressure).',
    note: 'Steady-state, single-shell balance. The drain is treated as liquid at the stated drain temperature and extraction pressure; desuperheating and drain-cooling zones are inside the balance automatically because only end states matter. Feedwater pressure must be the actual line pressure (subcooled liquid enthalpy is pressure dependent). Real extraction flow is also affected by tube leakage and vents, which are not modelled.',
    compute(v) {
      const a = {
        fwPressureBar: v.fwP, fwInC: v.fwIn, fwOutC: v.fwOut, extPressureBar: v.eP, extTempC: v.eT, extX: v.eX,
        drainC: v.dT, efficiency: v.eta / 100, cascadeFlowKgS: v.cFlow * TH, cascadePressureBar: v.cP, cascadeC: v.cT,
      };
      if (v._mode === 'fw') {
        const r = ppf.heaterFeedwaterFlow({ ...a, extractionFlowKgS: v.extFlow * TH });
        return { headline: { value: fmt(r.feedwaterFlowKgS / TH, 2) + ' t/h', label: 'feedwater flow' }, rows: [['Heater duty', fmt(r.dutyKW / 1000, 3) + ' MW'], ['Extraction / feedwater', fmt(100 * v.extFlow * TH / r.feedwaterFlowKgS, 3) + ' %'], ['TTD', fmt(r.ttdC, 2) + ' °C'], ['DCA', fmt(r.dcaC, 2) + ' °C']], warnings: [], pdfInputs: { 'Extraction flow': v.extFlow + ' t/h' } };
      }
      const r = ppf.heaterExtractionFlow({ ...a, fwFlowKgS: v.fwFlow * TH });
      const w = [];
      if (r.ttdC < -0.5) w.push('Feedwater outlet is above the saturation temperature at the extraction pressure — not physically possible for a closed heater.');
      return {
        headline: { value: fmt(r.extractionFlowKgS / TH, 3) + ' t/h', label: 'extraction steam flow' },
        rows: [['Extraction / feedwater', fmt(r.extractionPctOfFw, 3) + ' %'], ['Heater duty', fmt(r.dutyKW / 1000, 3) + ' MW'], ['Total drain flow leaving', fmt(r.drainFlowKgS / TH, 3) + ' t/h'], ['Extraction enthalpy', fmt(r.hExt, 2) + ' kJ/kg'], ['Drain enthalpy', fmt(r.hDrain, 2) + ' kJ/kg'], ['Feedwater Δh', fmt(r.hFwOut - r.hFwIn, 2) + ' kJ/kg'], ['TTD (Tsat − FW out)', fmt(r.ttdC, 2) + ' °C'], ['DCA (drain − FW in)', fmt(r.dcaC, 2) + ' °C']],
        warnings: w, pdfInputs: { 'FW flow': v.fwFlow + ' t/h', 'FW in/out': `${v.fwIn}/${v.fwOut} °C`, 'Extraction': `${v.eP} bar, ${v.eX ?? v.eT + ' °C'}`, 'Drain T': v.dT + ' °C' },
      };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 4. Desuperheater                                                  */
  /* ---------------------------------------------------------------- */
  const desup = makePage({
    id: 'desuperheater-spray', shortName: 'Desuperheater spray', title: 'Desuperheater Spray-Water Flow',
    lead: 'Spray-water flow needed to cool superheated steam to a target outlet temperature, from an exact mass-and-energy balance using IAPWS-IF97 enthalpies of steam and compressed spray water.',
    panels: [{ title: 'Steam and spray', fields: [
      { id: 'sf', label: 'Steam flow before spray (t/h)', value: 180 },
      { id: 'pin', label: 'Inlet pressure (bar abs)', value: 100 },
      { id: 'tin', label: 'Inlet temperature (°C)', value: 540 },
      { id: 'pout', label: 'Outlet pressure (bar abs)', optional: true, value: '', hint: 'Leave empty to use the inlet pressure.' },
      { id: 'tout', label: 'Target outlet temperature (°C)', value: 480 },
      { id: 'ts', label: 'Spray water temperature (°C)', value: 180 },
      { id: 'ps', label: 'Spray water pressure (bar abs)', value: 130 },
    ] }],
    formula: 'ṁ<sub>steam</sub> h<sub>in</sub> + ṁ<sub>spray</sub> h<sub>spray</sub> = (ṁ<sub>steam</sub> + ṁ<sub>spray</sub>) h<sub>out</sub><br>ṁ<sub>spray</sub> = ṁ<sub>steam</sub> (h<sub>in</sub> − h<sub>out</sub>) / (h<sub>out</sub> − h<sub>spray</sub>)',
    note: 'Adiabatic mixing at the stated outlet pressure; spray is taken as compressed liquid at its own pressure and temperature. The minimum safe outlet superheat (about 10–15 °C above saturation) is typical practice — use the manufacturer’s value for the actual desuperheater and downstream piping.',
    compute(v) {
      const r = ppf.desuperheaterSpray({ steamFlowKgS: v.sf * TH, inPressureBar: v.pin, inTempC: v.tin, outPressureBar: v.pout, outTempC: v.tout, sprayTempC: v.ts, sprayPressureBar: v.ps });
      return {
        headline: { value: fmt(r.sprayFlowKgS / TH, 3) + ' t/h', label: 'spray-water flow' },
        rows: [['Spray as % of steam flow', fmt(100 * r.sprayFlowKgS / (v.sf * TH), 3) + ' %'], ['Outlet steam flow', fmt(r.outletFlowKgS / TH, 3) + ' t/h'], ['Inlet / outlet enthalpy', fmt(r.hIn, 2) + ' / ' + fmt(r.hOut, 2) + ' kJ/kg'], ['Spray enthalpy', fmt(r.hSpray, 2) + ' kJ/kg'], ['Saturation temperature', fmt(r.satTempC, 2) + ' °C'], ['Outlet superheat', fmt(r.outletSuperheatC, 2) + ' °C']],
        warnings: r.warnings, pdfInputs: { 'Steam flow': v.sf + ' t/h', Inlet: `${v.pin} bar, ${v.tin} °C`, 'Target outlet': v.tout + ' °C', Spray: `${v.ts} °C at ${v.ps} bar` },
      };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 5. Condenser cooling water                                        */
  /* ---------------------------------------------------------------- */
  const cond = makePage({
    id: 'condenser-cw-flow', shortName: 'Condenser CW flow', title: 'Condenser Cooling-Water Flow',
    lead: 'Cooling-water flow required to condense a given turbine exhaust flow, from the steam-side heat load (IF97 wet-steam enthalpy) and the water-side enthalpy rise, with terminal temperature difference, LMTD and water-to-steam ratio.',
    panels: [{ title: 'Condenser data', fields: [
      { id: 'sf', label: 'Exhaust steam flow (t/h)', value: 400 },
      { id: 'pc', label: 'Condenser pressure (bar abs)', value: 0.08 },
      { id: 'x', label: 'Exhaust dryness x (0–1)', value: 0.92, hint: 'Typically 0.88–0.94 for a condensing turbine exhaust.' },
      { id: 'tcond', label: 'Condensate temperature (°C)', optional: true, value: '', hint: 'Leave empty for saturated condensate (no subcooling).' },
      { id: 'cin', label: 'Cooling-water inlet (°C)', value: 25 },
      { id: 'cout', label: 'Cooling-water outlet (°C)', value: 35 },
      { id: 'cp', label: 'Cooling-water pressure (bar abs)', value: 3 },
      { id: 'loss', label: 'Heat loss to surroundings (% of duty)', value: 0 },
    ] }],
    formula: 'Q = ṁ<sub>steam</sub> (h<sub>exh</sub> − h<sub>cond</sub>)&nbsp;;&nbsp; ṁ<sub>cw</sub> = Q / [(1−loss)(h<sub>cw,out</sub> − h<sub>cw,in</sub>)]<br>LMTD = (ITD − TTD) / ln(ITD/TTD), TTD = T<sub>sat</sub> − T<sub>cw,out</sub>, ITD = T<sub>sat</sub> − T<sub>cw,in</sub>',
    note: 'Heat load includes only the exhaust steam; drain flows, gland steam and air-removal duty are not added. Water enthalpies are exact IF97 values (no constant cp). Seawater or high-TDS cooling water has a different enthalpy than pure water — for those, scale the result by the actual cp ratio.',
    compute(v) {
      const r = ppf.condenserCoolingWater({ steamFlowKgS: v.sf * TH, condPressureBar: v.pc, exhaustX: v.x, condensateC: v.tcond, cwInC: v.cin, cwOutC: v.cout, cwPressureBar: v.cp, heatLossFrac: v.loss / 100 });
      return {
        headline: { value: fmt(r.cwFlowM3H, 1) + ' m³/h', label: 'cooling-water flow (' + fmt(r.cwFlowKgS * 3.6, 1) + ' t/h)' },
        rows: [['Heat load', fmt(r.heatLoadMW, 3) + ' MW'], ['Water-to-steam ratio', fmt(r.waterToSteamRatio, 2) + ' kg/kg'], ['Saturation temperature', fmt(r.satTempC, 2) + ' °C'], ['TTD', fmt(r.ttdC, 2) + ' °C'], ['Cooling-water range', fmt(r.rangeC, 2) + ' °C'], ['LMTD', fmt(r.lmtdC, 3) + ' °C'], ['Exhaust / condensate enthalpy', fmt(r.hExhaust, 2) + ' / ' + fmt(r.hCondensate, 2) + ' kJ/kg']],
        warnings: r.ttdC < 2 ? ['TTD below 2 °C is unrealistically small for a surface condenser — check the temperatures.'] : [],
        pdfInputs: { 'Steam flow': v.sf + ' t/h', 'Condenser pressure': v.pc + ' bar', x: v.x, 'CW in/out': `${v.cin}/${v.cout} °C` },
      };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 6. Tracer dilution                                                */
  /* ---------------------------------------------------------------- */
  const tracer = makePage({
    id: 'tracer-dilution-flow', shortName: 'Tracer dilution flow', title: 'Tracer Dilution Flow (Constant-Rate & Slug)',
    lead: 'Primary flow reference by tracer dilution: constant-rate injection with background correction and a first-order GUM uncertainty, or slug injection integrated from a sampled response curve. Used to calibrate cooling-water and large-pipe flow meters.',
    modeField: 'mode',
    panels: [{ title: 'Tracer test', fields: [
      { id: 'mode', label: 'Method', type: 'select', value: 'const', options: [['const', 'Constant-rate injection'], ['slug', 'Slug (gulp) injection']] },
      { id: 'q', label: 'Injection flow q (L/s)', value: 0.05, modes: ['const'] },
      { id: 'c1', label: 'Injected concentration C₁ (mg/L)', value: 50000, modes: ['const'] },
      { id: 'c2', label: 'Downstream plateau C₂ (mg/L)', value: 12, modes: ['const'] },
      { id: 'c0', label: 'Background concentration C₀ (mg/L)', value: 0.2, modes: ['const', 'slug'] },
      { id: 'uq', label: 'u(q) (%, 95 %)', value: 1, modes: ['const'] },
      { id: 'uc1', label: 'u(C₁) (%, 95 %)', value: 1, modes: ['const'] },
      { id: 'uc2', label: 'u(C₂) (%, 95 %)', value: 1, modes: ['const'] },
      { id: 'uc0', label: 'u(C₀) (%, 95 %)', value: 5, modes: ['const'] },
      { id: 'mass', label: 'Injected tracer mass M (g)', value: 1000, modes: ['slug'] },
      { id: 'data', label: 'Samples: time (s), concentration (mg/L) — one pair per line', type: 'textarea', modes: ['slug'], rows: 9, value: '0, 0.2\n20, 0.2\n40, 3\n60, 9\n80, 12\n100, 8\n120, 4.5\n140, 2\n160, 0.8\n180, 0.3\n200, 0.2' },
    ] }],
    formula: 'Constant rate: Q = q (C₁ − C₂)/(C₂ − C₀)<br>Slug: Q = M / ∫ (C(t) − C₀) dt (trapezoid rule)<br>Uncertainty: u(Q)² = Σ (∂Q/∂x<sub>i</sub> · u<sub>i</sub>)²',
    note: 'Assumes complete mixing at the sampling section, a conservative tracer (no losses or adsorption), and a steady flow. Units: constant-rate flow is returned in the unit of q (L/s); for the slug method M is in g and C in mg/L (= g/m\u00b3), so flow is returned in m\u00b3/s. The result is only as good as the mixing length and calibration of the concentration analyser.',
    compute(v) {
      if (v._mode === 'slug') {
        const rows = v.data.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,;\s]+/).map(Number));
        if (rows.some((r) => r.length < 2 || r.some((x) => !Number.isFinite(x)))) throw new Error('Each line needs "time, concentration" as numbers.');
        const r = ppf.tracerSlug({ massInjected: v.mass, times: rows.map((x) => x[0]), conc: rows.map((x) => x[1]), c0: v.c0 || 0 });
        return { headline: { value: fmt(r.flow, 4) + ' m³/s', label: 'flow (' + fmt(r.flow * 3600, 1) + ' m³/h)' }, rows: [['Area ∫(C−C₀)dt', fmt(r.area, 3) + ' mg·s/L'], ['Peak concentration above background', fmt(r.peak, 3) + ' mg/L'], ['Samples used', String(rows.length)]], warnings: r.warnings, pdfInputs: { 'Mass injected': v.mass + ' g', Samples: rows.length, Background: v.c0 + ' mg/L' } };
      }
      const r = ppf.tracerConstantRate({ q: v.q, c1: v.c1, c2: v.c2, c0: v.c0 || 0, uQ: v.uq, uC1: v.uc1, uC2: v.uc2, uC0: v.uc0 });
      return { headline: { value: fmt(r.flow, 3) + ' L/s', label: 'flow (' + fmt(r.flow * 3.6, 2) + ' m³/h)' }, rows: [['Dilution ratio', fmt(r.dilutionRatio, 2)], ['Expanded uncertainty (95 %)', '± ' + fmt(r.uPct, 3) + ' %  (± ' + fmt(r.uAbs, 3) + ' L/s)']], warnings: r.warnings, pdfInputs: { q: v.q + ' L/s', C1: v.c1, C2: v.c2, C0: v.c0 } };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 7. Pitot duct traverse                                            */
  /* ---------------------------------------------------------------- */
  const pitot = makePage({
    id: 'pitot-duct-flow', shortName: 'Pitot duct flow', title: 'Duct / Flue-Gas Flow — Pitot Traverse (EPA Method 1–3)',
    lead: 'Flue-gas or air flow in a duct from a multi-point pitot traverse: equal-area points, gas density from molecular weight (Orsat), moisture and absolute pressure, point-by-point velocities, and flow at actual, standard and normal conditions with an independent EPA-formula cross-check.',
    modeField: 'shape',
    panels: [
      { title: 'Duct', fields: [
        { id: 'shape', label: 'Duct shape', type: 'select', value: 'circ', options: [['circ', 'Circular'], ['rect', 'Rectangular']] },
        { id: 'dia', label: 'Inside diameter (m)', value: 2.0, modes: ['circ'] },
        { id: 'w', label: 'Width (m)', value: 2.5, modes: ['rect'] },
        { id: 'ht', label: 'Height (m)', value: 1.6, modes: ['rect'] },
      ] },
      { title: 'Gas', fields: [
        { id: 'tc', label: 'Gas temperature (°C)', value: 150 },
        { id: 'baro', label: 'Barometric pressure (kPa abs)', value: 101.325 },
        { id: 'stat', label: 'Duct static pressure, gauge (Pa)', value: -500 },
        { id: 'co2', label: 'CO₂ (dry vol %)', value: 12 },
        { id: 'o2', label: 'O₂ (dry vol %)', value: 7 },
        { id: 'co', label: 'CO (dry vol %)', value: 0 },
        { id: 'bws', label: 'Moisture (vol %)', value: 8 },
        { id: 'cp', label: 'Pitot coefficient Cp', value: 0.84, hint: '0.84 for an S-type pitot, 0.99 for a standard (Prandtl) pitot — use the calibration certificate.' },
      ] },
      { title: 'Velocity-head readings', fields: [
        { id: 'unit', label: 'Reading unit', type: 'select', value: 'pa', options: [['pa', 'Pa'], ['mmh2o', 'mm H₂O'], ['inh2o', 'in H₂O'], ['mbar', 'mbar']] },
        { id: 'readings', label: 'Readings at each traverse point (comma / space / new line separated)', type: 'textarea', rows: 5, value: '100, 120, 130, 125, 110, 95, 105, 115, 118, 122, 112, 98', hint: 'Use equal-area points: for a circle with N points on a diameter, distances from the wall (% of D) are 50·[1 − √((2i−1)/N)] and their mirror images (N = 12: 2.1, 6.7, 11.8, 17.7, 25.0, 35.6, 64.4, 75.0, 82.3, 88.2, 93.3, 97.9 %). Take readings on two perpendicular diameters.' },
      ] },
    ],
    formula: 'v<sub>i</sub> = C<sub>p</sub> √(2 Δp<sub>i</sub>/ρ), ρ = P M<sub>s</sub>/(R T), M<sub>s</sub> = M<sub>d</sub>(1−B<sub>ws</sub>) + 18.015 B<sub>ws</sub><br>v̄ = arithmetic mean of v<sub>i</sub> (not √ of the mean Δp); Q = v̄ A<br>EPA check: v<sub>s</sub> = 34.97 C<sub>p</sub> (√Δp)<sub>avg</sub> √(T<sub>s</sub>/(P<sub>s</sub> M<sub>s</sub>))',
    note: 'Valid for steady flow with the traverse plane ≥8 duct diameters downstream and ≥2 upstream of a disturbance (EPA Method 1), no cyclonic flow, and Reynolds number above the pitot’s calibrated range. Standard conditions are 20 °C and 101.325 kPa, dry (EPA); normal conditions are 0 °C and 101.325 kPa, dry. The pitot coefficient dominates the uncertainty (typically ±2–5 % for S-type).',
    compute(v) {
      const f = { pa: 1, mmh2o: 9.80665, inh2o: 249.0889, mbar: 100 }[v.unit];
      const dps = v.readings.split(/[\s,;]+/).filter(Boolean).map(Number).map((x) => x * f);
      if (dps.some((x) => !Number.isFinite(x))) throw new Error('Readings must be numbers.');
      const area = v._mode === 'circ' ? Math.PI * v.dia * v.dia / 4 : v.w * v.ht;
      const r = ppf.pitotTraverse({ dpPa: dps, areaM2: area, tempC: v.tc, baroPa: v.baro * 1000, staticPa: v.stat, co2: v.co2, o2: v.o2, co: v.co || 0, moisturePct: v.bws, cp: v.cp });
      const dev = 100 * (r.meanVelocity - r.vEpaCrossCheck) / r.vEpaCrossCheck;
      return {
        headline: { value: fmt(r.qActualM3S * 3600, 0) + ' m³/h', label: 'actual volumetric flow (' + fmt(r.qActualM3S, 3) + ' m³/s)' },
        rows: [['Mean velocity', fmt(r.meanVelocity, 3) + ' m/s'], ['Velocity range', fmt(Math.min(...r.pointVelocities), 2) + ' – ' + fmt(Math.max(...r.pointVelocities), 2) + ' m/s'], ['Gas density (actual)', fmt(r.rho, 4) + ' kg/m³'], ['Wet molar mass Ms / dry Md', fmt(r.Ms, 3) + ' / ' + fmt(r.Md, 3)], ['Mass flow', fmt(r.massFlowKgS * 3.6, 3) + ' t/h'], ['Standard dry flow (20 °C)', fmt(r.qStdDryM3S * 3600, 0) + ' m³/h'], ['Normal dry flow (0 °C)', fmt(r.qNormDryM3S * 3600, 0) + ' Nm³/h'], ['EPA-formula cross-check (difference)', fmt(dev, 3) + ' %'], ['Points used', String(dps.length)]],
        warnings: r.warnings, pdfInputs: { 'Area': fmt(area, 4) + ' m²', 'T': v.tc + ' °C', 'Cp': v.cp, 'Moisture': v.bws + ' %', Points: dps.length },
      };
    },
  });

  /* ---------------------------------------------------------------- */
  /* 8. Ultrasonic                                                     */
  /* ---------------------------------------------------------------- */
  const ultra = makePage({
    id: 'ultrasonic-flow', shortName: 'Ultrasonic flow', title: 'Ultrasonic Transit-Time Flow',
    lead: 'Flow from the upstream and downstream transit times of a clamp-on or spool-piece ultrasonic meter: path velocity, measured speed of sound, and an IAPWS-IF97 sound-speed plausibility check for water.',
    panels: [{ title: 'Meter data', fields: [
      { id: 'L', label: 'Acoustic path length L (m)', value: 0.5 },
      { id: 'ang', label: 'Path angle to the pipe axis φ (°)', value: 45 },
      { id: 'tu', label: 'Upstream transit time (µs)', value: 340.1 },
      { id: 'td', label: 'Downstream transit time (µs)', value: 340.0 },
      { id: 'id', label: 'Pipe internal diameter (mm)', value: 300 },
      { id: 'k', label: 'Profile correction factor k', value: 0.95, hint: 'Ratio of area-mean to path velocity; Reynolds dependent. Take from the meter maker (single-path ~0.90–0.96 turbulent).' },
      { id: 'pw', label: 'Water pressure for sound-speed check (bar abs)', optional: true, value: 5 },
      { id: 'tw', label: 'Water temperature (°C)', optional: true, value: 20 },
    ] }],
    formula: 'v<sub>path</sub> = L/(2 cosφ) · (t<sub>up</sub> − t<sub>down</sub>)/(t<sub>up</sub> t<sub>down</sub>)&nbsp;;&nbsp; c = (L/2)(1/t<sub>down</sub> + 1/t<sub>up</sub>)<br>Q = k · v<sub>path</sub> · A',
    note: 'The time difference is tiny (tens of nanoseconds), so a zero-flow offset or cable/electronics delay in the transit times directly biases the flow — verify the meter zero before trusting small flows. The profile factor k is user supplied; the sound-speed check uses IAPWS-IF97 for pure water only.',
    compute(v) {
      const r = ppf.ultrasonicFlow({ pathLengthM: v.L, angleDeg: v.ang, tUpS: v.tu * 1e-6, tDownS: v.td * 1e-6, innerDiameterM: v.id / 1000, k: v.k, waterPressureBar: v.pw, waterTempC: v.tw });
      const rows = [['Path velocity', fmt(r.pathVelocity, 4) + ' m/s'], ['Mean velocity (k × path)', fmt(r.meanVelocity, 4) + ' m/s'], ['Flow', fmt(r.flowM3S * 3600, 3) + ' m³/h'], ['Measured speed of sound', fmt(r.soundSpeed, 2) + ' m/s']];
      if (r.expectedSoundSpeed) rows.push(['IF97 speed of sound / deviation', fmt(r.expectedSoundSpeed, 2) + ' m/s / ' + fmt(r.soundSpeedDeviationPct, 3) + ' %']);
      return { headline: { value: fmt(r.flowM3S * 3600, 3) + ' m³/h', label: 'volume flow' }, rows, warnings: r.warnings, pdfInputs: { L: v.L + ' m', 'φ': v.ang + '°', 't_up': v.tu + ' µs', 't_down': v.td + ' µs', k: v.k, ID: v.id + ' mm' } };
    },
  });

  return {
    'iso5167-flow': iso5167, 'stodola-flow': stodola, 'heater-extraction-flow': heater,
    'desuperheater-spray': desup, 'condenser-cw-flow': cond, 'tracer-dilution-flow': tracer,
    'pitot-duct-flow': pitot, 'ultrasonic-flow': ultra,
  };
}
