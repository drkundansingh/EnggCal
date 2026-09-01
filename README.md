# Engineering Calculator Hub

A modular engineering calculator platform for thermal power plant, instrumentation,
process, and control-system engineers.

This is the **first working version** described in the spec: Dashboard, Thermal
Power Plant Estimator, 4–20 mA Transmitter, DP & Level, Orifice Plate, Control
Valve Sizing, I/P Converter, RTD, Thermocouple, PID Controller, Unit Converter,
Formula Library, and Calculation History with PDF export and JSON backup/restore.

## Running it

No build step. It's static files plus a JS module graph.

```bash
cd enghub
python3 -m http.server 8811
# open http://localhost:8811
```

Or open `index.html` via any static file server (it uses ES module `<script type="module">`
and `fetch()` for the formula library data, so it must be served over HTTP(S), not
opened directly as a `file://` URL).

## Architecture

```
enghub/
  index.html            App shell: sidebar nav, topbar, #content mount
  css/styles.css         Design tokens + layout (dark/light via [data-theme])
  js/
    app.js               Hash router + one render function per calculator page
    storage.js            Persistence layer (IndexedDB) — see "Data & backups"
    pdfExport.js          Calculation report → PDF (lazy-loads jsPDF from CDN)
    calculators/          Pure calculation engine, ZERO DOM code, ZERO UI code
      units.js            Pressure/temp/flow/length/mass/power conversions
      transmitter.js       4-20mA / 0-20mA / 1-5V / 0-10V scaling
      dpLevel.js            DP-flow, hydrostatic & tank level
      orifice.js             Orifice plate flow (simplified ISO 5167)
      controlValve.js         Cv/Kv sizing (liquid/gas/steam, ISA-75.01-style)
      ipConverter.js           I/P transducer scaling
      rtd.js                    Pt100/Pt1000 (IEC 60751), Ni100/Cu100
      thermocouple.js            Type J/K/T/E/N/R/S/B, linear approx + CJC
      pid.js                      PID output, ZN/Cohen-Coon/IMC tuning
      thermalPlant.js              MW↔fuel↔steam estimator, config-driven
  data/formulaLibrary.json    Formula Library content (searchable)
  tests/test.js                Automated engine tests — `node tests/test.js`
```

**Every calculator module is independent**: input in, result out, no side
effects, no DOM access. That's deliberate — the spec asks for the calculation
engine to be reusable by a future API or mobile app, and for calculators not to
be bundled into one large component. `app.js` is the *only* file that imports
the DOM; if you build a REST API or a React Native app later, you import the
same `js/calculators/*.js` files directly (they're plain ES modules with no
framework dependency) and wrap them in a new UI layer.

Assumptions are always separated from equations (spec #20): e.g.
`thermalPlant.js` exports `defaultAssumptions(plantType)` as a starting point,
but every number it returns is an editable input in the UI, and the calculated
result object echoes back exactly which assumptions were used, so nothing is a
hardcoded "answer."

## Deployment note

Source files use `.js`, not `.mjs`, even though they're plain ES modules
(`import`/`export`, no bundler). This is deliberate: `.js` is served with the
correct JavaScript MIME type by virtually every static host with zero
configuration, while `.mjs` is a newer extension that some shared hosts
(including some default Hostinger configurations) don't map correctly —
serving it as `text/plain` instead, which makes browsers silently refuse to
run the module and the whole app fails to start (blank sidebar, blank
content, no console-visible error beyond a generic MIME-type rejection).
`package.json` sets `"type": "module"` so Node still treats these `.js`
files as ES modules for local testing — this has no effect on how browsers
load them, since browsers only look at the `<script type="module">` tag and
the server's declared content type, never the file extension.

## Admin Panel / Content Visibility

There's a lightweight admin panel for controlling which sidebar items are
visible to public visitors — click "Admin" at the bottom of the sidebar and
enter the password (default: `changeme123`).

**Important — read before publishing:**

- This is a **static site with no backend server**, so there is nothing for
  a password to be securely checked against server-side. The admin gate is
  client-side JavaScript only: a soft deterrent to keep the panel out of
  casual visitors' way, not real security. Anyone with browser dev tools
  can see exactly how the check works and bypass it. Never put anything
  genuinely sensitive behind it.
- **Change the default password** before publishing. Generate a new hash:
  ```
  node -e "console.log(require('crypto').createHash('sha256').update('YOUR_NEW_PASSWORD').digest('hex'))"
  ```
  Then replace `ADMIN_PASSWORD_HASH_PLACEHOLDER` in `js/app.js` with the
  output.
- Ticking/unticking items in the admin panel updates your own browser's
  preview immediately, but **does not change what real visitors see**.
  Content visibility is controlled by `data/content-visibility.json`, a
  file shipped with the site — every visitor's browser loads it and
  filters the nav accordingly. To make a change live, copy the JSON the
  admin panel generates into that file, commit, and push, the same way you
  deploy any other change.
- The single-file bundle (`index.html` / the preview build) has no
  separate config file to fetch, so it always shows every item — content
  visibility control only applies to the modular deployment.

## Testing

`tests/test.js` is a real (not smoke) test suite — it checks each formula
against known reference values (e.g. the 4-20mA spec example: 0-100 bar
range, 14.5 mA → 65.625 bar; Pt100 at 100°C → 138.51 Ω per IEC 60751;
Ziegler-Nichols closed-loop textbook ratios; etc). 77 tests, all passing.

`tests/accuracy_2000.js` is a large-scale (2000-point Monte Carlo) numerical
accuracy check. **Important scope note**: this environment has no internet
access, so there is no real external dataset (verified NIST/IAPWS steam
tables, real plant operating logs) to validate against — "accuracy" here
means something specific and honest: for every calculator with a provable
mathematical property (an exact round-trip, or a hard physical inequality),
2000 randomized inputs are run through it and the error is measured against
that property. It is a check of internal numerical/mathematical correctness,
not a claim of real-world predictive accuracy. Run it with:

```bash
node tests/accuracy_2000.js
```

What it checks, all passing at 2000 points each:
- Pressure/temperature unit conversion round-trips: max error ~1e-13 (floating-point precision floor)
- 4-20mA PV→signal→PV, RTD T→R→T, thermocouple T→mV→T (with CJC), orifice bore→flow→bore, valve Kv→Cv→Kv, I/P mA→psi→mA, DP→flow→DP: all round-trip to within 1e-4 to 1e-9 relative/absolute error (RTD and orifice use iterative numeric solvers, hence the slightly larger — still ~1e-9 — residual)
- Thermal Plant Mode 1: netMW = grossMW×(1−aux%) holds to the display rounding precision (±0.005 MW)
- Thermal Plant Mode 3: flue gas mass balance (flue gas = air + fuel) holds exactly; the Carnot efficiency limit exceeds the achievable-efficiency cross-check on all 2000 random steam/condenser conditions (this is a second-law-of-thermodynamics check — a violation would indicate a real bug)
- Thermal Plant Mode 3: carbon-content-based CO₂ vs. ratio-based CO₂ stay within a 0.5×–2× sanity band across randomized coal carbon content (50-75%) — these are two *different* estimation methods by design, so they aren't expected to match exactly, just stay in the same physical ballpark

`tests/deep_10000.js` is a broader 10,000-point-per-check fuzz/property
suite covering modules the 2,000-point suite doesn't reach: the flow engine
(DP element calculations across all element/fluid combinations), trip
voting logic (exhaustive k-out-of-n truth tables), the disturbance
simulator, the Mode 3 solver under randomized partial inputs (including
randomized ultimate fuel analysis), MW-based flow confidence rating, the
DP transmitter double-extraction guard, and PID tuning methods — checking
properties (no NaN/Infinity, physical inequalities always hold, expected
exceptions actually throw) rather than single fixed examples. Run it with:

```bash
node tests/deep_10000.js
```

**This suite caught a real bug**: `calculateDPFlow` would silently return a
*negative* mass flow when the randomly-generated differential pressure
exceeded the upstream absolute pressure — a physically impossible input
(the implied downstream pressure would be negative) that the code didn't
validate against. Fixed by adding an explicit check in both
`calculateDPFlow` and the underlying `expansionFactor` function: DP ≥
upstream pressure now throws a clear, actionable error instead of
propagating nonsense through the calculation. Verified the fix holds
across 6 repeated 10,000-point runs with fresh random seeds (140,000+
randomized test cases each run) with zero failures, and confirmed the
error surfaces cleanly in the actual UI (both the Mode 4 DP Flow Element
calculator and the DP → Flow Wizard) rather than crashing the page.

`tests/deep_50000.js` is the widest sweep in the suite: 50,000 randomized
points spread across 20 property checks covering the whole calculation
engine, including the newest modules (`loopUncertainty`, `controlLoops`).
It leans entirely on properties that must always hold rather than fixed
expected answers:

- Round-trips close (pressure, temperature, PV↔percent↔signal, RTD
  resistance↔temperature, I/P current↔pressure, hydrostatic level↔DP)
- Monotonic relationships stay monotonic (RTD resistance rises with
  temperature, level rises with DP and falls with density, Cv rises with
  flow, drift grows with calibration interval)
- Physical bounds hold (Kelvin never negative above absolute zero, beta
  ratio strictly between 0 and 1, FF within the IEC/ISA correlation band,
  efficiency between 0 and 1, choked ΔP positive)
- Method correctness: the RSS loop-uncertainty total can *never* exceed
  the naive linear sum, and random-term contributions must sum to exactly
  100% of the budget
- Alarm setpoints always sit inside trip setpoints, in the correct
  direction, across every plant-type variant
- No NaN, Infinity, or `undefined` leaks into any control-loop node
  display value across every loop's full input range — these would render
  as literal broken text in the diagrams

```bash
node tests/deep_50000.js
```

**Worth noting about this suite**: on its first run, five checks failed —
all five were bugs in the *test*, not the app. I'd guessed at function
names and signatures (`dpToLevel` instead of `openTankLevel`, an RTD `r0`
argument instead of a named type key, a Rankine temperature unit that
doesn't exist in this codebase) rather than reading the actual exports.
Worth stating plainly because a test suite that's wrong about the API is
worse than no test at all — it produces confident-looking failures that
send you hunting for bugs that were never there. Fixed by checking the
real signatures and rewriting those five checks against them.

`tests/deep_100000.js` runs 100,000 points per check and additionally covers
the electrical protection engines (shortCircuit, idmt, ctEngine,
transformerProtection, motorProtection, lsigEngine, coordination).

```bash
node tests/deep_100000.js
```

**Three stale assertions were found and fixed in this suite** — all three
were test bugs, not app bugs, and all three had been silently failing:

- `transformerProtection.autoGenerate` and `motorProtection.autoGenerate`
  return a *structured* object (`basicParameters` / `protection` /
  `philosophy`). The test was reading `result.flc` and `result.hvFLC` at
  the top level, where they don't exist, so every single point failed.
- `coordination.checkCoordination` returns the string `'REVIEW REQUIRED'`
  (with a **space**). The test asserted `'REVIEW_REQUIRED'` (underscore —
  that's only the *key name* in the `ENGINEERING_CHECK` map). This one is
  the subtle one: it only failed on the ~8% of randomized cases that
  actually reached that branch, which is exactly the kind of intermittent
  failure that's easy to dismiss as flakiness.

The lesson worth recording: a test that's wrong about the API is worse
than no test, because it manufactures confident-looking failures that send
you hunting for bugs that were never there. Always verify the real export
shape before asserting against it.

## Live control-loop dynamics

The Control Loops section runs a real time-stepped simulation rather than
jumping between steady states. `js/calculators/loopDynamics.js` provides the
standard process blocks (first-order lag with an exact discrete solution,
dead time, integrator, rate limit) and a PI/PID controller with anti-windup
and derivative-on-measurement. `LOOP_DYNAMICS` in `controlLoops.js` builds a
model per loop; the UI advances it at a fixed 0.1 s timestep and draws a
live trend.

These are first-order-plus-dead-time approximations — the standard
engineering models used for control design. **The time constants are
typical published magnitudes, not values from any specific unit.** Treat the
shape of the response as the accurate part and the exact seconds as
illustrative.

Five physics bugs were found and fixed by writing tests that asserted real
plant behaviour rather than just "it runs":

- **Steam temperature master had the wrong action.** It was reverse-acting,
  so a hot outlet drove the slave setpoint the wrong way and the inner loop
  was effectively dead. Direct-acting is correct.
- **The air loop was too slow to hold the cross-limit.** The select logic
  was right, but the controller and damper could not keep air above fuel on
  a fast ramp. Tightened, plus the excess-air margin real schemes carry.
- **Furnace draft PID sign was inverted** — positive furnace pressure drove
  the ID fan *down*, making it worse until the trim saturated. It was
  positive feedback pegged at +22 mmWC.
- **Coordinated master and turbine bypass integrator gains** were orders of
  magnitude too large, slamming into their clamps before the PI could act.
- **Turbine bypass could never absorb full boiler flow** (capacity 0.85 vs
  boiler 1.0), leaving a permanent surplus that integrated to the clamp.

### Two bundler bugs worth recording

The single-file build inlines ES modules as IIFEs and rewrites cross-module
identifiers. Two failures came out of that:

1. **Identifier rewriting corrupted display text.** `PID` appears 51 times
   inside node labels and insight strings but only 16 times as real code, so
   a blanket regex turned `'Voltage PID'` into `'Voltage dynlib.PID'` on
   screen. Fixed by protecting literals before rewriting.
2. **Apostrophes in comments broke the literal protector.** A comment
   containing `the unit's own design` looked like the start of a string and
   swallowed the code that followed, desynchronising everything after it —
   which silently produced *both* corrupted labels and un-namespaced code.
   Fixed by tokenizing comments and strings in a single pass instead of
   treating strings alone.

Also: `js/storage.js` has a top-level helper named `tx`, which collided with
the `tx` namespace variable used for the transmitter module. Inline helpers
are now wrapped in their own IIFE so their internals cannot clash.

I also ran a full headless-browser pass (Playwright) clicking through every
route and every calculator's Calculate button, checking for JS errors and
verifying computed values match the engine tests. All 20 routes render, all
calculators produce correct results, history save/restore and the light/dark
toggle work, and there are no console errors. Re-run the same style of check
after any change — routing, storage, and PDF export are the parts most likely
to break silently since they touch the DOM/browser APIs that `tests/test.js`
can't reach (it only covers the pure calculation engine).

**Before you launch commercially**, add:
- A CI job that runs `node tests/test.js` on every commit
- Browser E2E tests (Playwright/Cypress) for the UI flows, checked into the repo
- Cross-browser checks (Safari, Firefox, mobile Chrome) — this was tested in Chromium only

## Data & backups (current MVP vs. production)

Right now, everything (calculation history, theme preference) lives in the
browser's **IndexedDB** — not `localStorage` (too small, synchronous, string-only)
and not a server database. That means:
- Data is per-browser, per-device. Clearing browser data deletes it.
- "Export full backup (JSON)" on the History page downloads everything as a
  file the user can keep or re-import (`importBackup`) — that's the closest
  thing to a backup in a purely client-side app, and it's wired up and working.
- `storage.js` exposes a stable API (`saveCalculation`, `listHistory`,
  `deleteCalculation`, `renameCalculation`, `duplicateCalculation`,
  `exportBackup`, `importBackup`, `getConfig`, `setConfig`). Swapping the
  IndexedDB internals for `fetch()` calls to a real backend requires **no
  changes to app.js** — every call site already goes through this module.

### Moving to a real database (recommended before commercial launch)

A commercial multi-user product needs a server-side database — IndexedDB alone
cannot give you account-based history, cross-device sync, admin analytics, or
real backups (server-side backups, not "download a JSON file"). Suggested path:

1. **Backend**: Node/Express or similar, exposing REST endpoints that mirror
   `storage.js`'s function names (`POST /calculations`, `GET /calculations`,
   `DELETE /calculations/:id`, etc.).
2. **Database**: PostgreSQL. Starting schema:

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  plan text not null default 'free', -- free | premium | pro
  created_at timestamptz not null default now()
);

create table calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  calculator_id text not null,
  name text not null,
  inputs jsonb not null,
  result jsonb not null,
  assumptions jsonb,
  created_at timestamptz not null default now()
);
create index on calculations (user_id, created_at desc);

create table plant_configs ( -- saved custom assumption sets, premium feature
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  plant_type text not null,
  assumptions jsonb not null,
  created_at timestamptz not null default now()
);
```

3. **Backups**: standard managed-Postgres automated backups (e.g. daily
   snapshots + point-in-time recovery) rather than relying on client-side
   export. Keep the client-side JSON export too — it's still useful for users
   who want a personal copy.
4. **Auth**: add a `sessions`/JWT layer; gate premium calculators server-side
   based on `users.plan`, not just in the UI (client-side checks are trivially
   bypassed).

## Monetization tiers (architecture is ready, gating is not wired up yet)

The spec's Free/Premium/Pro split is reflected in the dashboard card tags
(`free`/`premium`) purely as a **visual label** right now — nothing is
actually restricted, because there's no auth/subscription system yet. To make
it real:
- Add the `users.plan` column above and a subscription/payment provider
  (Stripe is the common choice).
- Gate premium calculator API endpoints server-side by plan.
- Keep the free calculators (unit conversion, basic 4-20mA, basic temp/pressure
  conversion, basic formulas) always open, exactly as scoped in the spec.

## DP → Flow Wizard (Instrumentation section)

A guided, step-by-step alternative to the flat 15-field DP flow form —
added as its own top-level Instrumentation nav entry rather than buried in
Mode 4, since this is meant for real field/control-room use, not just
another calculator page. Reuses `flowEngine.js` entirely (same
`calculateDPFlow`, `validateDPFlowInputs`, `consistencyCheck` as Mode 4) —
no calculation logic was duplicated.

10 steps: Fluid (Steam/Water/Air/Gas, click-to-advance) → Element
(Orifice/Venturi/Nozzle/Annubar, click-to-advance) → DP → Pressure &
Temperature → Pipe/element dimensions → Calculate fluid properties (density,
shown before flow so the intermediate step is visible, not hidden) →
Calculate flow → Show flow in kg/s, kg/h, t/h, m³/h, Nm³/h, and SCFM →
Compare with DCS/actual (optional) → Final result with full calculation
trace and consistency check. Back/Start-over navigation preserves entered
values; results can be saved to history from the final step.

One addition needed to support the "Water" fluid choice: `approxWaterDensity()`
in `flowEngine.js`, a standard reference-table interpolation (0-300°C,
verified against known reference points at 0/100/300°C) — liquid water has
no ideal-gas approximation to fall back on, and the wizard needed a sensible
one-click default rather than forcing every user to look up a density value
before they can even see a flow number.

## Power Plant Flow Calculation & Estimation Engine (Mode 4)

A new, fully additive module (`js/calculators/flowEngine.js` + a new "Mode
4: Flow Calculator" tab inside the existing Thermal Plant Estimator page)
implementing three independent flow-estimation methods, exactly as the
architecture diagram in the spec requires — no existing tab, module, or
behavior was changed to build this. The refactor that made this possible
(extracting the enthalpy-rise correlation from Mode 1's `fromGeneratedMW`
into a shared, exported `estimateEnthalpyRiseKcalKg` helper in
`thermalPlant.js`) was verified to produce byte-identical results before
and after — the full test suite passed unchanged.

- **Method A — DP flow element**: orifice, venturi, nozzle, averaging
  pitot/Annubar, V-cone, or a custom calibrated element. Deliberately does
  NOT default to a bare `Flow = K√DP` — every element type has its own
  typical discharge coefficient (or, for 'custom', the calculation refuses
  to run until you supply one), and an ISO 5167-style expansibility
  (expansion) factor is applied for compressible fluids. Liquids require an
  explicit density (no ideal-gas fallback); gas/steam density defaults to
  the ideal gas law, clearly labeled as an approximation.
- **Method B — Energy/mass balance**: reuses the exact same boiler-duty
  correlation as Mode 1/Mode 3 (not a re-derivation), then a feedwater mass
  balance (steam + blowdown + spray + extraction).
- **Method C — MW-based estimation**: delegates to the Mode 3 solver
  directly, then assigns LOW/MEDIUM/HIGH confidence based on how many key
  assumptions (boiler efficiency, turbine efficiency, fuel GCV) you actually
  supplied yourself vs. left at typical defaults — MW alone is never
  presented as if exact flows are known.
- **Compare Methods**: any results calculated in A/B/C above carry over
  automatically into a deviation/consistency table. Exceeding a
  user-defined tolerance produces a WARNING with a list of possible causes
  (transmitter calibration, density assumption, Cd error, process
  abnormality, etc.) — it never automatically declares an instrument
  faulty.
- **DP Transmitter Model**: models the DP%→signal→Flow% chain and actively
  guards against the classic double square-root-extraction mistake — it
  throws an error if more than one stage (transmitter/DCS/calculator)
  claims to extract the square root. Verified against the spec's own worked
  example (DP=25% → Flow≈50% with exactly one extraction stage).
- **Actual / Normal / Standard flow**: explicitly distinct reference
  conditions — Normal (0°C) and Standard (user-defined, e.g. 15°C) are never
  treated as interchangeable, with both reference temperatures always shown.
- **Data quality score**: automatic 0-100% validation (beta ratio range,
  Reynolds turbulence, Cd plausibility, non-negative DP, finite values) on
  every DP flow-element calculation, shown alongside the result.

**Scope note**: the spec's sections 21-23 (a full live dashboard combining
all ten flow types, historical trend graphs with selectable time windows,
and a dedicated what-if simulator) are not built as separate features in
this pass — Mode 3's flexible estimator already provides what-if-style
partial-input estimation, and a full trending dashboard would need a live
data feed this app doesn't have (it's a calculator, not a DCS front-end).
Everything else in the spec (DP element calc, steam/feedwater/air/fuel flow
methods, theoretical combustion air, energy balance, MW-based estimation
with confidence, comparison engine, consistency checking, DP transmitter
model, extended unit conversions, actual/normal/standard distinction, and
calculation trace) is implemented and tested.

## Turbine & Boiler Trip / Protection System

A new, fully additive module (`js/calculators/tripProtection.js` + a new
"Turbine & Boiler Protection" nav entry) — nothing in any existing calculator
was modified to build this.

- **Universal by design**: plant type, boiler type, fuel, unit rating, and an
  "OEM reference profile" selector are all configurable. Reference/default
  values are labeled `Public Reference` (generic, illustrative, industry-
  typical figures) and are never presented as a specific real plant's actual
  trip settings — this environment has no internet access to verified OEM
  proprietary manuals (BHEL, Siemens Energy, GE Vernova, Mitsubishi Power),
  so the OEM profile selector changes attribution labeling only, not the
  underlying numbers. Overriding any setpoint yourself changes its data type
  to `User Configured` and that value takes precedence everywhere.
- **ETS Dashboard / MFT Dashboard**: every parameter from the registry
  (filtered by drum vs. once-through applicability), with an editable
  current-value field and live NORMAL/ALARM/TRIP evaluation against the
  configured setpoints.
- **Voting logic**: 1oo1 / 1oo2 / 2oo2 / 2oo3 / 2oo4 (and free-text logic
  notes for cases like "per BMS zone logic"), implemented as a real k-out-of-n
  evaluator, not just a label.
- **Trip Simulator**: pick a disturbance scenario (turbine speed increase,
  furnace pressure high/low, loss of flame, loss of FD/ID fan, low feedwater
  flow, low drum level, high steam temperature, low condenser vacuum, low
  lube-oil pressure, high vibration, high axial displacement, generator
  fault, manual trip), ramps the linked parameter against its alarm/trip
  setpoints with a confirmation time delay (matching how real trip logic
  requires sustained deviation, not an instant blip), and renders an inline
  SVG trend chart with alarm/trip lines and the trip point marked — no
  external chart library needed. Reports time-to-alarm, time-to-trip,
  max deviation, and recovery time.
- **Trip Logic Diagram**: interactive sensor → voting → trip signal → action
  block diagrams for representative examples (turbine overspeed, furnace
  pressure HH, loss of all flame, drum level LL) — click any block for its
  signal/setpoint/logic/delay/action/status.
- **Trip Action Matrix**: worked examples (e.g. Overspeed → ETS → valve
  closure sequence; Loss of All Flame → MFT → fuel isolation) explicitly
  labeled as examples, not a universal sequence claim — exact plant sequences
  are configurable.
- **Trip History**: every simulation can be saved (reuses the existing
  calculation-history storage under a `trip-event` category so no new
  storage schema was needed) with parameter, measured/alarm/trip values,
  voting result, trip action, and source (Simulation); filterable by
  classification (ETS/MFT/Boiler/Turbine/Electrical/Mechanical/
  Instrumentation/Process — the full classification set from the spec).

**Scope note**: the spec lists on the order of 80 individual trip parameters
across ETS and MFT. This first version implements a representative ~37-entry
registry spanning every category (ETS: Turbine Mechanical, Steam Conditions,
Valve Protection, Generator/Electrical, Other; MFT: Furnace Protection,
Combustion Air, Flame Protection, Fuel System, Feedwater/Boiler, Steam
Protection, Other), not a claim of covering every conceivable plant signal —
same scoping approach used for the rest of this app. `PARAMETER_REGISTRY` in
`tripProtection.js` is a flat array; adding more parameters is additive and
doesn't require touching the voting/simulation engine.

## What's deliberately out of scope in this first version

Per the spec's own closing paragraph ("build the first working version
with..."), the following modules from the full spec are **not yet built**:
Power Plant Instrumentation sub-pages (Boiler/Turbine/Condenser dedicated
views), Process Engineering calculators (pump/fan/compressor/mass-balance),
Daily Technical Update / engineering news feed, and user accounts/auth/payment.
The architecture (independent calculator modules, storage abstraction, PDF
export) is built so each of these is an additive module, not a rewrite.

## Engineering accuracy notes (read before commercial use)

This is estimation/reference-grade software, not calibration- or
custody-transfer-grade:
- **Thermal plant estimator (Mode 3, flexible)**: has real analytical depth
  beyond a simple lookup table, but is still not a substitute for certified
  design software. What it actually does:
  - Boiler duty now correctly accounts for feedwater temperature (a real bug
    in the original version: `feedwaterTempC` was collected as an input but
    never used in the enthalpy-rise calculation — raising feedwater
    temperature by regenerative heating measurably reduces required boiler
    duty per kg of steam, and the calculator now reflects that using the
    specific heat of liquid water, cp ≈ 1 kcal/kg·°C).
  - When a lab ultimate (elemental) fuel analysis is available (C/H/O/S mass
    %), combustion air and CO₂ emission are computed from actual fuel
    chemistry via standard stoichiometry (`Air_theoretical = 11.5C +
    34.5(H−O/8) + 4.32S`; `CO2 = C × 44/12`) instead of a typical ratio/factor
    — this is how real boiler combustion calculations are normally done, and
    is meaningfully more accurate whenever that data is on hand. Falls back
    cleanly to the ratio-based method when it isn't.
  - An independent **Carnot-limit cross-check** on turbine efficiency: from
    main steam temperature and condenser saturation temperature (derived via
    the Antoine equation from condenser pressure), it computes the absolute
    thermodynamic ceiling (`η_Carnot = 1 − T_cond/T_steam`) and a rule-of-thumb
    achievable fraction (~60-65% of Carnot for modern reheat cycles), shown
    alongside the primary efficiency estimate so a wildly inconsistent input
    combination is visible rather than silently accepted.
  - Steam enthalpy is still a calibrated correlation, not full IAPWS-IF97
    steam tables — implementing the genuine multi-region IAPWS-IF97 equations
    (which involve dozens of region-specific coefficients, and require
    careful handling near the critical point for ultra-supercritical
    conditions) is a substantial undertaking on its own and was out of scope
    here. Good for planning-level estimates; verify against actual design
    heat balance software for anything else.
- **Orifice plate**: constant discharge coefficient (default Cd = 0.6), not
  the full iterative ISO 5167 Cd/expansibility correlation.
- **Control valve sizing**: simplified ISA-75.01-style equations without
  piping geometry (Fp), cavitation (FL), or exact choked-flow (Fk) factors —
  labeled in the UI as preliminary; the app tells the user to verify against
  the manufacturer's sizing tool.
- **Thermocouple**: linear Seebeck-coefficient approximation, not the NIST
  ITS-90 polynomial tables. Good for teaching/estimation; not for calibration.
  Cold-junction compensation is applied in both directions (mV→Temperature
  and Temperature→mV), matching how a real transmitter/DAQ actually reports.
- **RTD (Pt100/Pt1000)**: uses the real IEC 60751 Callendar-Van Dusen equation
  — this one *is* standards-accurate.
- **Condenser saturation temperature**: uses the standard Antoine equation
  for water (A=8.07131, B=1730.63, C=233.426), valid 1-100°C — verified
  against known reference points (10 kPa → ~45.8°C, 101.325 kPa → 100°C
  exactly, both to within rounding).

None of the above amounts to a claim of being definitively "the best in the
world" — that's not a verifiable claim for a tool like this to make, and this
app has no live connection to external steam-table or plant databases. What's
true is narrower and checkable: every one of the improvements above is a
named, testable formula (77 automated tests cover them), the assumptions are
shown next to every estimated value, and the two real gaps this round closed
(feedwater temperature being silently ignored, and combustion calculations
defaulting to a flat ratio even when better fuel data was available) were
genuine accuracy issues, not just polish.

Every calculator result panel and every exported PDF carries the disclaimer
below; don't remove it.

## Disclaimer

> This application is intended for engineering education, preliminary
> calculations, estimation, and reference purposes. Results should be verified
> against approved engineering standards, manufacturer data, plant design
> documents, calibrated instruments, and qualified engineering personnel
> before being used for operational, safety, or design decisions.

## Deployment & caching (why an update didn't show up)

If you push to GitHub, the host serves the new files, and the site *still*
shows the old version, the cause is almost always the service worker rather
than the browser cache. Two bugs were fixed here:

1. **The service worker was cache-first for everything.** Once `index.html`
   and `app.js` were cached they were served forever. A normal refresh does
   not bypass a service worker, so users were pinned to whatever version
   they first loaded.
2. **`CACHE_NAME` was hardcoded**, so it never changed between deploys and
   the cleanup code in `activate` never ran.

Both were confirmed by simulating a real deploy in a headless browser: with
the old worker the page stayed stale after a normal reload; with the new one
it updates.

### What the fix does

- **Network-first** for HTML, JS, CSS and JSON, so a deploy is picked up on
  the next load. Cache is used only as an offline fallback.
- **Cache-first** kept for images and fonts, which rarely change.
- **`BUILD_ID` stamped into the cache name** by `stamp-build.mjs`, so every
  deploy gets a fresh cache and the previous one is deleted.
- **Update prompt**: if a new version installs while the app is open, a
  small banner offers "Update now" instead of leaving the user on old code.
- **`.htaccess`** sets `no-cache, must-revalidate` on code and, critically,
  on `service-worker.js` itself — if the host serves a stale service worker,
  none of the above can take effect.

### Deploy steps

```bash
node stamp-build.mjs      # new BUILD_ID -> new cache name
git add . && git commit -m "..." && git push origin main
```

Then upload/redeploy on the host, including `.htaccess`.

### One-time cleanup for existing visitors

Anyone who already loaded the old site still has the old worker installed.
The new worker calls `skipWaiting()` and `clients.claim()`, so it takes over
on the next visit. If a specific device is still stuck, in DevTools use
Application → Service Workers → Unregister, or Application → Storage →
Clear site data.
