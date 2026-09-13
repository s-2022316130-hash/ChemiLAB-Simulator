// Canonical unit labels. One system across all simulators.
export const U = {
  massFlow:'kg/h', massFlowS:'kg/s', volFlow:'m³/h', volFlowS:'m³/s', molFlow:'kmol/h',
  tempC:'°C', tempK:'K', pressBar:'bar', pressKPa:'kPa', pressMPa:'MPa', pressPa:'Pa',
  powerKW:'kW', powerMW:'MW', energy:'kJ/kg', pct:'%', ppm:'ppm', conc:'mg/L',
  turbidity:'NTU', viscPa:'Pa·s', viscCp:'cP', moisture:'kg water/kg dry solid',
  humidity:'kg water/kg dry air', area:'m²', volume:'m³', length:'m', time:'s', timeMin:'min',
  velocity:'m/s', density:'kg/m³', cp:'kJ/kg·K', u:'W/m²·K', ph:'pH', dimensionless:'—'
};
// Explicit conversions only. No silent unit guessing anywhere in the engines.
export const conv = {
  kgh_to_kgs: v => v/3600, kgs_to_kgh: v => v*3600,
  m3h_to_m3s: v => v/3600, m3s_to_m3h: v => v*3600,
  C_to_K: v => v+273.15, K_to_C: v => v-273.15,
  bar_to_Pa: v => v*1e5, Pa_to_bar: v => v/1e5, bar_to_kPa: v => v*100,
  kW_to_MW: v => v/1000, cP_to_Pas: v => v/1000, Pas_to_cP: v => v*1000
};
