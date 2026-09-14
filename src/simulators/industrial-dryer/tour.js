/**
 * 02 — INDUSTRIAL DRYER — guided tour.
 *
 * Eight steps, following the solids. Each step moves the camera, selects the
 * unit in both views at once, and names the result keys worth watching while
 * the operating conditions are changed.
 *
 * The text explains why a unit exists and what decision it represents. It never
 * quotes a number: the numbers are on the results rail, computed by the engine.
 */
import { TAGS } from './engine.js';

export const TOUR = [
  {
    id: 'overview',
    title: 'Three things can limit a dryer',
    text: 'At any operating point this machine is short of one of three things: the heat the drum can transfer, the time the drum gives the solids, or the room the air has left to take up moisture. Each one calls for a different correction, and two of them call for opposite corrections, so guessing is expensive. The results rail names which one is binding on every run. Before you change anything, find out which it is — that single question is most of what this simulator is for.',
    preset: 'overview',
    watch: ['moistureOut', 'residenceTime', 'timeNeeded', 'rhOut', 'thermalEfficiency']
  },
  {
    id: 'feed',
    title: 'Dry basis, because the denominator holds still',
    text: 'Moisture here is quoted as kilograms of water per kilogram of bone-dry solid, not as a percentage of the wet mass. That is not pedantry. As the material dries, the wet mass falls, so anything written on a wet basis has a moving denominator and the balance stops being linear. The bone-dry solid flow is the one quantity that is the same at both ends of the drum. Note that the commercial specification is almost always quoted the other way round, on a wet basis, which is where arguments start.',
    tag: TAGS.feedHopper,
    watch: ['dryFeed', 'waterInFeed', 'moistureOut', 'moistureTarget']
  },
  {
    id: 'psychrometry',
    title: 'Heating air does not dry it',
    text: 'Heating the drying air changes nothing about how much water it already carries. The humidity ratio is exactly the same at the heater outlet as it was at the fan inlet. What changes is how much more the air could hold, and that rises very steeply with temperature. This is why the burner is the biggest handle on the plant. Watch the wet-bulb temperature too: it is the temperature a wet surface sits at while free moisture remains, so it sets both the product temperature and the driving force for the whole constant-rate period.',
    tag: TAGS.heater,
    watch: ['ambientHumidity', 'wetBulb', 'latentHeat', 'heaterDuty', 'utilisation']
  },
  {
    id: 'residence',
    title: 'The gas takes time away from the solids',
    text: 'Slope and rotation convey the solids down the drum. But this is a co-current dryer, so the gas travels the same way and drags the solids along faster than the mechanics alone would. More air always means less time. That is the trade at the heart of a rotary dryer: air carries the heat in and the moisture out, yet the more of it you use, the less time the material gets and the more of it you blow out as dust. Push the air flow far enough and the correlation gives no residence time at all, which is the model telling you the solids are being blown straight through.',
    tag: TAGS.drum,
    watch: ['conveyingTime', 'dragTime', 'residenceTime', 'holdup', 'loading']
  },
  {
    id: 'kinetics',
    title: 'The last few points of moisture cost the most',
    text: 'While free water covers the surface the rate is flat — the constant-rate period, limited only by how fast heat arrives. Below the critical moisture the water has to come from inside the particle, and the rate falls away with the free moisture remaining. The consequence is that drying from 0.25 to 0.12 kg/kg can take less time than drying from 0.12 to 0.05. Tighten the product specification a little and the residence time you need rises a lot. Watch the drying curve on the results rail while you move the critical moisture.',
    tag: TAGS.drum,
    watch: ['dryingRate', 'timeNeeded', 'residenceTime', 'moistureOut', 'solidTempOut']
  },
  {
    id: 'balances',
    title: 'The moisture and the heat are one calculation',
    text: 'The air temperature leaving the drum comes from the enthalpy balance, and that temperature is what drives the heat transfer that sets the evaporation in the first place. You cannot do one before the other, so they are solved together. Watch the exhaust relative humidity as you cut the air flow: the driving force disappears long before the air actually reaches saturation, and at that point adding heat achieves nothing because there is nowhere for the moisture to go.',
    tag: TAGS.drum,
    watch: ['airTempOut', 'humidityOut', 'rhOut', 'deltaTlm', 'qTransferred']
  },
  {
    id: 'entrainment',
    title: 'Fast gas turns product into dust',
    text: 'Every particle has a terminal velocity, the speed of rising gas that will just hold it up. As the superficial gas velocity in the drum climbs towards it, more and more of the solids leave with the exhaust instead of with the product. The fine material goes first. The cyclone is there to get the bulk of it back, and the bag filter to catch what the cyclone missed, but everything they recover was product that took a detour. Raise the air flow and watch the dust fraction and the recovery move together.',
    tag: TAGS.cyclone,
    watch: ['gasVelocity', 'terminalVelocity', 'dustFraction', 'stackDustConc']
  },
  {
    id: 'energy',
    title: 'Where the fuel actually went',
    text: 'The theoretical floor for evaporating water is about 2400 kJ per kilogram. A rotary dryer running well sits between 3500 and 6000. The gap is almost entirely sensible heat leaving up the stack in air that was heated and then barely used. The thermal utilisation figure tells you how much of the temperature rise you bought in the heater was actually taken out again in the drum. If it is low, you are heating air to throw it away, and the answer is less air rather than more heat. Look at the energy bar chart: the exhaust bar is usually the tallest one on the plant.',
    tag: TAGS.stack,
    watch: ['specificEnergy', 'thermalEfficiency', 'utilisation', 'airTempOut']
  }
];

export default TOUR;
