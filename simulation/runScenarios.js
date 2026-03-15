const fs = require("fs")
const zlib = require("zlib")

// --------------------------------------------
// LOAD PRICE DATA (.gz)
// --------------------------------------------

const compressed = fs.readFileSync("./public/omie_data.json.gz")

const decompressed = zlib.gunzipSync(compressed)

const priceData = JSON.parse(decompressed.toString())

const prices = []

for (const date in priceData) {

  const day = priceData[date]

  for (const hour in day) {

    const slot = day[hour]

    if (slot.price !== undefined) {
      prices.push(slot.price)
    }

  }

}

console.log("Loaded hours:", prices.length)


// --------------------------------------------
// SCENARIO GRID
// --------------------------------------------

const powerLevels = [1,2,3,5,7,10]  // GW
const durations = [1,2,4,8]         // hours


// --------------------------------------------
// BATTERY ASSUMPTIONS
// --------------------------------------------

const assumptions = {

  rte: 0.85,
  cyclesPerDay: 2,
  optimizerFee: 0.075,
  opexPerMW: 8000,
  lifetimeYears: 15,
  capacityPrice: 25000

}


// --------------------------------------------
// CAPEX MODEL
// --------------------------------------------

function capex(duration){

  if(duration === 1) return 350000
  if(duration === 2) return 450000
  if(duration === 4) return 700000
  if(duration === 8) return 1100000

}


// --------------------------------------------
// SIMPLE ARBITRAGE MODEL
// --------------------------------------------

function arbitrageRevenue(powerMW, duration){

  const sorted = [...prices].sort((a,b)=>a-b)

  const chargePrice = sorted[0]
  const dischargePrice = sorted[sorted.length-1]

  const spread = dischargePrice - chargePrice

  const cycles = assumptions.cyclesPerDay * 365

  const revenue = spread * powerMW * cycles

  return {

    spread,
    cycles,
    revenue

  }

}


// --------------------------------------------
// ANCILLARY MARKET MODEL
// --------------------------------------------

function ancillaryRevenue(powerMW){

  const basePrice = 10     // €/MW/h
  const marketSize = 4000  // MW

  const price = basePrice * Math.exp(-powerMW / marketSize)

  return price * powerMW * 8760

}


// --------------------------------------------
// CAPACITY MARKET
// --------------------------------------------

function capacityRevenue(powerMW){

  return assumptions.capacityPrice * powerMW

}


// --------------------------------------------
// IRR CALCULATION
// --------------------------------------------

function irr(capex, revenue){

  const years = assumptions.lifetimeYears

  let rate = 0.1

  for(let i=0;i<100;i++){

    let npv = -capex

    for(let y=1;y<=years;y++){

      npv += revenue / Math.pow(1+rate,y)

    }

    rate -= npv/100000000

  }

  return rate

}


// --------------------------------------------
// RUN SCENARIOS
// --------------------------------------------

const results = []

for(let p of powerLevels){

  for(let d of durations){

    const powerMW = p * 1000

    const arb = arbitrageRevenue(powerMW,d)
    const anc = ancillaryRevenue(powerMW)
    const cap = capacityRevenue(powerMW)

    const grossRevenue = arb.revenue + anc + cap

    const netRevenue = grossRevenue * (1 - assumptions.optimizerFee)

    const investment = capex(d) * powerMW

    const projectIRR = irr(investment, netRevenue)

    results.push({

      powerGW: p,
      durationH: d,

      arbitrageRevenue: arb.revenue,
      ancillaryRevenue: anc,
      capacityRevenue: cap,

      grossRevenue,
      netRevenue,

      investment,
      irr: projectIRR

    })

  }

}


// --------------------------------------------
// SAVE RESULTS
// --------------------------------------------

fs.writeFileSync(

  "./public/precomputed_scenarios.json",
  JSON.stringify(results,null,2)

)

console.log("Saved", results.length, "scenarios")