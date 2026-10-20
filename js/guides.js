/**
 * Long-form engineering guides. Plain data so the pages, the sitemap and the
 * prerender step all draw on one source. Inline links use {{route-id|label}}.
 * Worked numbers quoted here were produced by this site's own calculators
 * (see tests/test.js for the reference checks behind them).
 */
export const GUIDES = [
  {
    id: 'orifice-venturi-flow-measurement',
    title: 'How Orifice-Plate and Venturi Flow Measurement Works (ISO 5167)',
    description: 'The physics and the equations behind differential-pressure flow measurement: discharge coefficient, expansibility, steam density, thermal expansion and the mistakes that cause 2–5 % errors.',
    readMinutes: 8,
    intro: 'Differential-pressure (DP) flow elements are the most common way to measure steam, feedwater and fuel-gas flow in a power plant. The principle is simple, but the last few percent of accuracy depend on details that are easy to get wrong. This guide explains the equation, what every term means, and where real installations lose accuracy.',
    sections: [
      { h: 'The principle', p: [
        'A restriction in the pipe — an orifice plate, a nozzle or a Venturi tube — forces the fluid to speed up, and its static pressure falls. From conservation of mass and Bernoulli’s equation, the pressure drop between an upstream tap and the restriction grows with the square of the flow. Measuring that difference and inverting the relationship gives the flow.',
        'The international standard ISO 5167 turns this into a practical, empirically calibrated equation. For mass flow:',
        '<b>q<sub>m</sub> = C / √(1 − β⁴) · ε · (π/4) d² · √(2 Δp ρ₁)</b>',
        'Here d is the bore (or throat) diameter, D the pipe diameter, β = d/D, Δp the measured differential pressure and ρ₁ the fluid density at the upstream tap. C is the discharge coefficient and ε the expansibility factor.' ] },
      { h: 'The discharge coefficient C', p: [
        'C corrects the ideal equation for the real flow pattern: the jet contracts after a sharp-edged orifice, friction acts, and the pressure taps sit at specific positions. For a standard orifice plate C is about 0.60 and depends on β, on the pipe Reynolds number and on where the taps are (corner, flange or D and D/2). The Reader-Harris/Gallagher equation in ISO 5167-2 gives C to within about 0.5 % for typical geometries. A Venturi tube is far more efficient: C is about 0.984 to 0.995 depending on how the convergent section is finished.',
        'Because C depends on Reynolds number, and Reynolds number depends on the flow you are trying to find, a correct calculation iterates: guess the flow, compute C, recompute the flow, and repeat until they agree. The {{iso5167-flow|ISO 5167 DP flow calculator}} does this automatically.' ] },
      { h: 'Expansibility ε for steam and gas', p: [
        'A liquid does not change density as it passes the restriction, so ε = 1. A gas or steam expands as its pressure falls, which lowers the density at the throat and reduces the flow for a given Δp. For an orifice plate ISO gives ε = 1 − (0.351 + 0.256β⁴ + 0.93β⁸)(1 − (p₂/p₁)^(1/κ)), where κ is the isentropic exponent. Nozzles and Venturi tubes use a different expression derived from isentropic expansion.',
        'For superheated steam κ is not the textbook 1.3. At 30 bar and 400 °C the real isentropic exponent calculated from the IAPWS-IF97 equations is about 1.286, and at 100 bar and 540 °C about 1.276. The effect on ε is small but systematic, and it is simply free accuracy once the steam properties are computed properly.' ] },
      { h: 'Density is the biggest lever', p: [
        'Because density sits under a square root, a 1 % error in ρ₁ produces a 0.5 % error in flow. For steam that matters more than almost anything else, since density changes quickly with pressure and temperature. Treating steam as an ideal gas overstates its specific volume: at 30 bar and 400 °C the compressibility factor is about 0.96, so the ideal-gas density is roughly 4 % too low and the computed flow about 2 % too high. At 100 bar and 540 °C the compressibility factor is about 0.935 and the error is larger still. Use real steam tables (see {{steam-props|Steam Properties}}) and always use absolute pressure.' ] },
      { h: 'Thermal expansion of the bore and pipe', p: [
        'Orifice dimensions are specified at 20 °C but the plate and pipe run hot. Austenitic stainless steel expands roughly 17 × 10⁻⁶ per kelvin and low-alloy steel roughly 13 × 10⁻⁶ per kelvin. At 540 °C the bore has grown by 1–2 %, which changes the flow by a comparable amount. The correction is d = d₂₀ [1 + α(T − 20)], applied to both d and D. These coefficients are material dependent, so a good calculator treats them as inputs you can override.' ] },
      { h: 'A worked example', p: [
        'Take a 250 mm pipe with a 150 mm flange-tapped orifice in 30 bar (absolute), 400 °C steam and a measured Δp of 250 mbar. The calculator finds a steam density of 10.06 kg/m³, a pipe Reynolds number of about 1.7 million, C = 0.6045, ε = 0.9974 and a mass flow of 29.55 t/h, with an expanded uncertainty of roughly 1–2 % once typical instrument uncertainties are included. The permanent pressure loss is about 157 mbar, or 63 % of the Δp, which is why orifice plates are not chosen where pressure recovery matters.' ] },
      { h: 'Where installations actually lose accuracy', p: [
        '<b>Straight lengths and flow conditioning.</b> ISO accuracy assumes the specified upstream and downstream straight pipe. Elbows, valves and reducers close to the plate distort the profile and shift C by more than the stated uncertainty.',
        '<b>Edge wear.</b> The upstream edge of an orifice must be sharp. Erosion rounds it, which raises C and makes the meter under-read.',
        '<b>Impulse lines.</b> Blocked, leaking or unequally filled impulse lines (condensate pots at different levels in steam service) give false Δp readings.',
        '<b>Wet steam.</b> ISO 5167 is for single-phase flow. Near saturation, steam carries moisture and the meter over-reads.',
        '<b>Square-root scaling.</b> Flow varies as √Δp, so at 10 % of flow the Δp is only 1 % of its full-scale value. Transmitter turn-down limits accuracy at low load; two ranges or a smaller bore are often used.' ] },
      { h: 'Choosing between element types', p: [
        'Orifice plates are cheap and standardised but have a high permanent loss. ISA 1932 and long-radius nozzles lose less pressure and tolerate high velocities and steam erosion better. A classical Venturi recovers most of the pressure and copes well with dirty fluids and large-diameter lines, at much higher cost. Which one suits you depends on pressure budget, accuracy requirement and maintenance access.' ] },
    ],
    related: [
      { id: 'iso5167-flow', label: 'DP Flow — ISO 5167' },
      { id: 'dp-flow-cal', label: 'DP → Flow (Calibrated)' },
      { id: 'steam-props', label: 'Steam Properties' },
    ],
  },
  {
    id: 'steam-tables-iapws-if97',
    title: 'Steam Tables and IAPWS-IF97: What the Numbers Are and Why They Matter',
    description: 'How steam properties are calculated in industry, what the IF97 regions mean, and why the ideal-gas shortcut is not good enough for power-plant calculations.',
    readMinutes: 7,
    intro: 'Every heat balance, turbine test and flow calculation in a thermal plant starts with the properties of water and steam. This guide explains where those numbers come from, what the formulation IAPWS-IF97 is, and where its limits are.',
    sections: [
      { h: 'What the steam tables are', p: [
        'Steam tables are tabulated thermodynamic properties of water: specific volume, enthalpy, entropy and so on, as functions of pressure and temperature. The printed tables engineers learn from are generated from equations of state maintained by the International Association for the Properties of Water and Steam (IAPWS). Today almost every calculation uses those equations directly rather than reading a table.' ] },
      { h: 'IAPWS-IF97 in brief', p: [
        'IF97 is the industrial formulation adopted in 1997. It is designed to be fast enough for heat-balance and control software while reproducing the scientific standard (IAPWS-95) very closely. It divides the pressure–temperature plane into regions, each with its own equation:',
        '<ul><li><b>Region 1</b> — compressed (sub-cooled) liquid water, up to 350 °C and 100 MPa.</li><li><b>Region 2</b> — superheated and dry steam, up to 800 °C at 100 MPa and 1073 K at lower pressures.</li><li><b>Region 3</b> — the near-critical region around the critical point (22.064 MPa, 373.946 °C), where density changes very steeply.</li><li><b>Region 4</b> — the saturation line, which links boiling temperature and pressure.</li><li><b>Region 5</b> — high-temperature steam above 800 °C.</li></ul>',
        'Region 3 is the hardest to calculate because its equation is expressed in density and temperature, so pressure-based use needs an iteration. This site covers Regions 1, 2 and 4 and refuses Region 3 states with an explicit message instead of extrapolating a nearby region — an extrapolation can be wrong by several percent.' ] },
      { h: 'Why the ideal-gas shortcut fails', p: [
        'It is tempting to treat superheated steam as an ideal gas with pv = RT. For steam at 30 bar and 400 °C the true specific volume is 0.0994 m³/kg, but the ideal-gas value is 0.1036 m³/kg: a 4 % difference, because the compressibility factor Z is about 0.96. At 100 bar and 540 °C Z falls to about 0.935. A density error of that size passes straight into flow-metering and heat-balance results (flow depends on √ρ, so a 4 % density error gives about 2 % in flow).' ] },
      { h: 'Beyond density and enthalpy', p: [
        'Real calculations need more than the basic properties. Specific heat capacity c<sub>p</sub> sets how much steam a given temperature change represents; the speed of sound is needed for choked-flow and acoustic checks; the isentropic exponent κ = ρw²/p is used in expansibility and valve-sizing equations; and the dynamic viscosity (IAPWS 2008 formulation) sets the Reynolds number. At 30 bar and 400 °C these are about 2.28 kJ/kg·K cp, 619 m/s, κ = 1.286 and 24.4 µPa·s.' ] },
      { h: 'Saturation properties and wet steam', p: [
        'On the saturation line liquid and vapour coexist. Water boils at 41.5 °C when the pressure is 0.08 bar absolute and at 45.8 °C at 0.1 bar — which is why condenser back-pressure and cooling-water temperature are so tightly linked. The enthalpy of a wet mixture is h = h<sub>f</sub> + x·h<sub>fg</sub>, where x is the dryness fraction. At 0.08 bar the latent heat h<sub>fg</sub> is 2402 kJ/kg, which is what a condenser must remove from every kilogram of exhaust steam.' ] },
      { h: 'Accuracy and limits', p: [
        'Inside its valid range IF97 reproduces its reference values to very high precision, so the uncertainty of a steam calculation is dominated by the pressure and temperature measurements, not the tables. The limits to remember are the region boundaries, the fact that properties near saturation change rapidly with small temperature errors, and that these equations describe pure water — dissolved solids and non-condensable gases change real behaviour.' ] },
    ],
    related: [
      { id: 'steam-props', label: 'Steam Properties' },
      { id: 'iso5167-flow', label: 'DP Flow — ISO 5167' },
      { id: 'condenser-cw-flow', label: 'Condenser Cooling-Water Flow' },
    ],
  },
  {
    id: 'feedwater-heaters-ttd-dca',
    title: 'Feedwater Heaters: TTD, DCA and What They Tell You About Plant Health',
    description: 'Why regenerative feedwater heating improves efficiency, what terminal temperature difference and drain cooler approach mean, and how to read them for diagnosis.',
    readMinutes: 7,
    intro: 'Feedwater heaters are among the most heat-rate-sensitive items in a steam plant, and two numbers describe how well each one is doing: terminal temperature difference (TTD) and drain cooler approach (DCA).',
    sections: [
      { h: 'Why heat the feedwater with extraction steam?', p: [
        'In a regenerative cycle, small amounts of partly expanded steam are extracted from the turbine and used to heat the feedwater before it enters the boiler. That steam has already done some work, and its latent heat is transferred to the feedwater instead of being rejected in the condenser. Raising the average temperature at which heat enters the cycle improves cycle efficiency, which is why large units carry six to eight heaters.' ] },
      { h: 'Types and zones', p: [
        'Closed heaters keep steam and feedwater separate, with the feedwater flowing inside tubes. The deaerator is an open (direct-contact) heater that also removes dissolved oxygen. A high-pressure closed heater typically has up to three zones: a desuperheating zone that removes superheat from the extraction steam, a condensing zone where most of the heat is transferred, and a drain cooling zone that sub-cools the condensate before it cascades to the next lower-pressure heater.' ] },
      { h: 'TTD and DCA defined', p: [
        '<b>Terminal temperature difference (TTD)</b> = saturation temperature of the extraction steam at the heater shell pressure − feedwater outlet temperature. It measures how closely the feedwater approaches the steam temperature.',
        '<b>Drain cooler approach (DCA)</b> = drain outlet temperature − feedwater inlet temperature. It measures how far the drain is cooled toward the incoming water.',
        'Design values are on the heater data sheet; they are typically a few degrees Celsius. Use the {{feedwater-heater|Feedwater Heater TTD and DCA calculator}} to compute both from measured temperatures and the extraction pressure.' ] },
      { h: 'Reading the numbers', p: [
        '<b>Rising TTD at constant load</b> means the heater is delivering less heat for the same steam condition. Common causes are tube fouling or plugging, non-condensable gases accumulating in the shell (a vent problem), a flooded condensing zone from a high drain level, or feedwater bypass leakage.',
        '<b>High DCA</b> usually points to a low drain level or lost drain-cooler seal so that hot drain or steam leaves the shell, wasting energy and eroding the downstream piping. <b>Very low DCA with a high TTD</b> often indicates flooding.',
        'These are indications, not proofs; confirm against level readings, vent flow and the heater’s own performance curves. The main value of TTD and DCA is trending: a slow drift over months matters more than a single reading.' ] },
      { h: 'Extraction flow from an energy balance', p: [
        'Extraction steam flow is rarely metered directly, but it follows from an energy balance on the heater: the heat released by the steam (and any cascaded drain from the heater above) equals the heat absorbed by the feedwater. The {{heater-extraction-flow|extraction flow calculator}} solves this with exact IAPWS-IF97 enthalpies. Using real compressed-liquid enthalpy at feedwater pressure matters: at 200 bar the enthalpy of water differs noticeably from saturated-liquid values at the same temperature, which changes the duty by a visible fraction of a percent.' ] },
      { h: 'Why it matters for heat rate', p: [
        'Taking a high-pressure heater out of service forces the boiler to heat colder feedwater and reduces the work extracted from the extraction steam, so heat rate rises. Operators therefore track TTD and DCA of every heater, and a heater that is bypassed or degraded is one of the first places to look when unit heat rate drifts.' ] },
    ],
    related: [
      { id: 'feedwater-heater', label: 'Feedwater Heater (TTD & DCA)' },
      { id: 'heater-extraction-flow', label: 'FW Heater Extraction Flow' },
      { id: 'plant-performance', label: 'Plant Performance Indicators' },
    ],
  },
  {
    id: 'sama-diagrams-explained',
    title: 'SAMA Diagrams Explained: How to Read Boiler and Turbine Control Logic',
    description: 'What a SAMA functional diagram shows, what its symbols mean, and a worked example of three-element drum-level control.',
    readMinutes: 6,
    intro: 'A P&ID shows the hardware of a plant. A SAMA diagram shows its control logic: how signals are measured, combined and turned into valve and motor commands. Power-plant control documentation has long used the SAMA style, which comes from the Scientific Apparatus Makers Association functional-diagramming standard (PMC 22.1).',
    sections: [
      { h: 'Function-oriented, not hardware-oriented', p: [
        'The key idea is that each symbol represents a function, independent of whether it is implemented in a DCS, a PLC or analog electronics. The diagram reads left to right: measurements enter on the left, they pass through blocks that process them, and commands leave on the right toward the final control element.' ] },
      { h: 'The basic symbol set', p: [
        '<ul><li><b>Circle</b> — a measurement or readout: transmitter inputs, indicators.</li><li><b>Rectangle / square</b> — an automatic signal-processing function: summer, gain, bias, lag, lead/lag, integrator, high or low select, function generator.</li><li><b>Diamond</b> — a manual function: a hand/auto station or manual setpoint adjustment.</li><li><b>Trapezoid</b> — the final controlling element, such as a control valve or damper actuator.</li></ul>',
        'Inside each rectangle a short label states the function: Σ for a summer, K for a gain, f(x) for a function generator, ∫ for an integrator, d/dt for a derivative, and a logic word such as AND, OR or NOT for logic gates. Signal lines carry arrows, and every block also shows which signal enters which input, which matters for blocks such as a subtractor where the order changes the sign.' ] },
      { h: 'Example: three-element drum-level control', p: [
        'Boiler drum level is hard to control because of shrink and swell: when steam demand rises suddenly, pressure falls, bubbles in the water expand and the level momentarily rises even though the water inventory is dropping. A controller that only watches level would first close the feedwater valve, which is exactly the wrong action.',
        'The standard remedy is three-element control. The drum-level measurement is compared with its setpoint and passed through a PI controller. The steam-flow signal is added as a feedforward, so a demand change moves the feedwater valve right away in the correct direction. Feedwater flow is then subtracted, so the final command corrects any mismatch between steam out and water in. A SAMA diagram shows this as a few circles for the three measurements, a summing block, a PI block, a hand/auto diamond and a trapezoid for the feedwater valve. Reading it left to right, you can see what happens when any signal moves.' ] },
      { h: 'Why practising matters', p: [
        'Logic that looks right on paper can hide timing problems: lags, dead time and limits change how a loop behaves. The {{sama-logic|SAMA Logic Simulator}} on this site lets you place blocks, wire them with the standard shapes and watch signals propagate, so you can test a scheme before it is built into a control system.' ] },
      { h: 'Reading tips', p: [
        'Start from the final element and work backwards to see what drives it. Note every high or low selector, since they decide which signal is in control at any moment. Check every limit and rate-of-change block, because they define what happens during start-up and trips. And always confirm the tag names against the P&ID and the loop sheets, because the diagram is only useful if its signals are the plant’s signals.' ] },
    ],
    related: [
      { id: 'sama-logic', label: 'SAMA Logic Simulator' },
      { id: 'control-loops', label: 'Control Loops' },
      { id: 'pid', label: 'PID Tuning' },
    ],
  },
  {
    id: 'heat-rate-and-efficiency',
    title: 'Heat Rate and Thermal Efficiency of a Power Plant, Explained',
    description: 'What station heat rate means, how it converts to efficiency in kcal/kWh and kJ/kWh, and what changes it.',
    readMinutes: 6,
    intro: 'Heat rate is the standard way to express how efficiently a thermal plant turns fuel into electricity. Lower is better. Understanding exactly what goes into the number is the first step to improving it.',
    sections: [
      { h: 'Definition', p: [
        'Heat rate = heat energy supplied by the fuel ÷ electrical energy sent out, usually in kJ/kWh or, in India and some other markets, kcal/kWh. Because one kilowatt-hour is 3600 kJ (about 860 kcal), efficiency follows directly: efficiency = 3600 ÷ heat rate in kJ/kWh, or 860 ÷ heat rate in kcal/kWh. A plant with a heat rate of 2,450 kcal/kWh therefore runs at about 35 %; one at 10,000 kJ/kWh at 36 %.' ] },
      { h: 'Gross versus net', p: [
        'Gross heat rate divides by the energy produced at the generator terminals. Net (or station) heat rate divides by the energy exported after the plant’s own auxiliary consumption (fans, pumps, mills, cooling-water pumps). Net is always worse than gross. Always check which one a figure refers to, and whether the fuel energy is on a gross (higher) or net (lower) calorific-value basis — the difference can be several percent for coal and much more for hydrogen-rich fuels.' ] },
      { h: 'What drives heat rate', p: [
        '<ul><li><b>Steam conditions.</b> Higher main-steam pressure and temperature raise the average temperature of heat addition. This is why supercritical and ultra-supercritical units exist.</li><li><b>Condenser pressure.</b> Lower back-pressure increases the enthalpy drop across the turbine. It depends on cooling-water temperature and condenser cleanliness.</li><li><b>Reheat and regeneration.</b> Reheating improves efficiency and keeps exhaust steam dry; feedwater heaters raise the average heat-addition temperature.</li><li><b>Boiler efficiency.</b> Stack temperature, excess air, unburnt carbon and moisture in the fuel set how much of the fuel energy reaches the steam.</li><li><b>Auxiliary power.</b> Fans, mills and pumps cost net output.</li><li><b>Part load.</b> Most units run less efficiently away from design load.</li></ul>' ] },
      { h: 'Measuring it', p: [
        'The direct method divides fuel input by output, but it needs accurate coal flow and calorific value, which are difficult to measure on a continuous basis. The indirect (heat-loss) method computes boiler efficiency by summing the individual losses, and turbine cycle heat rate is computed from steam flow and enthalpy rise. The two are combined into a station figure. The {{plant-performance|Plant Performance Indicators}} and {{thermal-plant|Thermal Plant Estimator}} calculators help estimate these quantities.' ] },
      { h: 'Using heat rate to find losses', p: [
        'A deviation from the expected heat rate at a given load is not a diagnosis, but it narrows the search. Elevated condenser pressure points to cooling-water or air-ingress problems; high stack temperature points to boiler fouling or air-heater issues; higher TTD on feedwater heaters points to heater problems; and excessive auxiliary power points to fans, mills or pump operating points. The {{feedwater-heater|feedwater heater}} and {{condenser-cw-flow|condenser}} pages on this site cover two of those items.' ] },
    ],
    related: [
      { id: 'plant-performance', label: 'Plant Performance Indicators' },
      { id: 'thermal-plant', label: 'Thermal Plant Estimator' },
      { id: 'boiler-blowdown', label: 'Boiler Blowdown Rate' },
    ],
  },
  {
    id: 'condenser-performance-cooling-water',
    title: 'Condenser Performance and Cooling-Water Flow in a Steam Power Plant',
    description: 'How the surface condenser sets turbine back-pressure, how cooling-water flow is calculated, and what TTD and LMTD say about condenser health.',
    readMinutes: 6,
    intro: 'The condenser is where a steam plant rejects most of its heat, and its pressure sets the low end of the whole thermodynamic cycle. Small changes in condenser performance show up directly in output and heat rate.',
    sections: [
      { h: 'What the condenser does', p: [
        'Exhaust steam from the low-pressure turbine condenses on the outside of tubes carrying cooling water. Because steam occupies enormously more volume than liquid water, condensation creates a vacuum, and the pressure in the shell is the saturation pressure at the condensing temperature. Water boils at 41.5 °C at 0.08 bar absolute and at 45.8 °C at 0.1 bar, so the achievable back-pressure follows the temperature of the available cooling water.' ] },
      { h: 'Heat load and cooling-water flow', p: [
        'The heat to be removed is Q = steam flow × (exhaust enthalpy − condensate enthalpy). For wet exhaust steam the enthalpy is h<sub>f</sub> + x·h<sub>fg</sub>. Cooling-water flow follows from the water-side enthalpy rise: flow = Q ÷ (h<sub>out</sub> − h<sub>in</sub>). As an example, 400 t/h of exhaust at 0.08 bar and dryness 0.92 rejects about 245.6 MW; with cooling water warming from 25 to 35 °C the required flow is about 21,200 m³/h, or roughly 53 kg of water per kilogram of steam. The {{condenser-cw-flow|condenser cooling-water calculator}} performs this balance with exact IAPWS-IF97 enthalpies instead of a constant specific heat.' ] },
      { h: 'TTD, range and LMTD', p: [
        'Three temperatures describe the heat exchange: the saturation temperature of the steam, the cooling-water inlet, and the cooling-water outlet. The <b>terminal temperature difference (TTD)</b> is the saturation temperature minus the water outlet. The <b>range</b> is the water temperature rise. The <b>log-mean temperature difference (LMTD)</b> = (ITD − TTD) ÷ ln(ITD ÷ TTD), where ITD is the saturation temperature minus the water inlet. For a given duty and area, a lower cooling-water inlet temperature or higher water flow reduces the back-pressure.' ] },
      { h: 'What raises condenser pressure', p: [
        '<ul><li><b>Warm cooling water</b> in summer or from an undersized cooling tower.</li><li><b>Tube fouling</b> that cuts heat transfer and raises TTD at the same load.</li><li><b>Air in-leakage</b>, which blankets the tube surface; the air-removal system must keep non-condensables low.</li><li><b>Low cooling-water flow</b> from pump or screen problems.</li><li><b>Tube plugging or leaks</b> reducing surface area.</li></ul>',
        'Because turbine output and heat rate depend directly on back-pressure, a sustained rise of even a few millibar is worth chasing.' ] },
      { h: 'Using the numbers for diagnosis', p: [
        'Trend TTD against load and cooling-water inlet temperature. At a given load and water temperature, a rising TTD indicates fouling or air in-leakage; a rising range with constant TTD simply means the load or the water flow changed. The cooling tower side of the system is covered by the {{cooling-tower|Cooling Tower Performance}} calculator.' ] },
    ],
    related: [
      { id: 'condenser-cw-flow', label: 'Condenser Cooling-Water Flow' },
      { id: 'cooling-tower', label: 'Cooling Tower Performance' },
      { id: 'steam-props', label: 'Steam Properties' },
    ],
  },
];

export const GUIDE_ROUTE_PREFIX = 'guide-';
export const guideRouteId = (g) => GUIDE_ROUTE_PREFIX + g.id;
