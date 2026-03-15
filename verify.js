const fs = require('fs');

const raw = fs.readFileSync('./omie_data.json', 'utf8');
const data = JSON.parse(raw);

// Basic counts
const priceDays = Object.keys(data.prices || {});
const curveDays = Object.keys(data.curves || {});
console.log(`Price days: ${priceDays.length}`);
console.log(`Curve days: ${curveDays.length}`);
console.log(`File size: ${(fs.statSync('./omie_data.json').size / 1e6).toFixed(1)} MB`);

// Check date format
console.log(`\nSample price dates: ${priceDays.slice(0,3).join(', ')}`);

// Check a sample price entry
const d1 = priceDays[0];
const hours = Object.keys(data.prices[d1]);
console.log(`Hours in first day: ${hours.length} (${hours[0]} to ${hours[hours.length-1]})`);
console.log(`Sample price: hour 1 = ${data.prices[d1]['1']}`);

// Check a sample curve entry
if (curveDays.length > 0) {
  const cd1 = curveDays[0];
  const ch1 = data.curves[cd1]['1'];
  console.log(`\nSample curve day: ${cd1}`);
  console.log(`Supply points: ${ch1?.s?.length}`);
  console.log(`Demand points: ${ch1?.d?.length}`);
  console.log(`First supply point: ${JSON.stringify(ch1?.s?.[0])}`);
  console.log(`Last supply point: ${JSON.stringify(ch1?.s?.[ch1.s.length-1])}`);
  console.log(`First demand point: ${JSON.stringify(ch1?.d?.[0])}`);
}

// Check for any malformed entries
let badPrices = 0, badCurves = 0;
for (const d of priceDays) {
  const h = data.prices[d];
  if (Object.keys(h).length !== 24) badPrices++;
}
console.log(`\nDays with != 24 hours: ${badPrices}`);
console.log('\n✓ Verification complete');