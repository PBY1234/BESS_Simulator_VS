const fs = require('fs');
const path = require('path');

// Paths to data directories
const pricesDir = 'c:\\Users\\PabloBorras\\Downloads\\Omie2025';
const curvesDir = 'c:\\Users\\PabloBorras\\Downloads\\OmieDemand2025';

// Output JSON
const output = {
  prices: {},
  curves: {}
};

// Helper functions
function parseEU(s) {
  if (s==null) return NaN;
  const t=String(s).trim(); if(!t) return NaN;
  const hasDot=t.includes("."),hasComma=t.includes(",");
  if(hasDot&&hasComma) return t.lastIndexOf(".")>t.lastIndexOf(",") ? parseFloat(t.replace(/,/g,"")) : parseFloat(t.replace(/\./g,"").replace(",","."));
  if(hasComma) return parseFloat(t.replace(",","."));
  return parseFloat(t);
}
function parseHour(s) {
  if(!s) return NaN;
  const m=String(s).trim().match(/^H(\d+)/i);
  return m ? parseInt(m[1]) : parseInt(String(s).trim());
}
function findCol(hds, tests) {
  for(const test of tests) for(let i=0;i<hds.length;i++) if(test(hds[i])) return i;
  return -1;
}

function parseMarginalPDBC(text) {
  const lines=text.replace(/\r/g,"\n").split("\n").map(l=>l.trim()).filter(Boolean);
  const rr=[];
  for(const line of lines){
    if(line.startsWith("MARGINALPDBC")||line.startsWith("*")) continue;
    const p=line.split(";"); if(p.length<5) continue;
    const y=parseInt(p[0]),mo=parseInt(p[1]),d=parseInt(p[2]),per=parseInt(p[3]),pr=parseFloat(p[4].replace(",","."));
    if(y>2000&&y<2100&&mo>=1&&mo<=12&&d>=1&&d<=31&&per>=1&&per<=96&&!isNaN(pr))
      rr.push({year:y,month:mo,day:d,period:per,price:pr});
  }
  const maxP=rr.reduce((m,r)=>Math.max(m,r.period),0);
  const isQH=maxP>24;
  // Collapse to hourly: average the 4 QH within each hour
  const byDateHour={};
  rr.forEach(r=>{
    const ds=String(r.day).padStart(2,"0")+"/"+String(r.month).padStart(2,"0")+"/"+r.year;
    const hora=isQH?Math.floor((r.period-1)/4)+1:r.period;
    const key=ds+"|"+hora;
    if(!byDateHour[key]) byDateHour[key]={date:ds,hora,prices:[]};
    byDateHour[key].prices.push(r.price);
  });
  const slots=Object.values(byDateHour).map(s=>({
    date:s.date, hora:s.hora, price:s.prices.reduce((a,b)=>a+b,0)/s.prices.length
  }));
  if(slots.length>0){
    const nd=new Set(slots.map(s=>s.date)).size;
    return {slots,note:slots.length+" hourly slots, "+nd+" days"+(isQH?" (from 15-min)":"")};
  }
  return {slots:[],note:"Could not parse"};
}

function parseOMIECurva(text) {
  const lines=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l=>l.trim());
  let hi=-1;
  for(let i=0;i<Math.min(20,lines.length);i++){const f=lines[i].split(";")[0].trim().toLowerCase();if(["hora","periodo","hour","period"].includes(f)){hi=i;break;}}
  if(hi<0) return {error:"Header not found"};
  const hd=lines[hi].split(";").map(h=>h.trim().toLowerCase().replace(/^"|"$/g,""));
  const iH=findCol(hd,[h=>["hora","periodo","hour","period"].includes(h)]);
  const iF=findCol(hd,[h=>h.includes("fecha")||h.includes("date")]);
  const iT=findCol(hd,[h=>h==="tipo oferta"||h==="tipo de oferta",h=>h.startsWith("tipo")&&!h.includes("log")]);
  const iE=findCol(hd,[h=>h.includes("acumul"),h=>h.includes("potencia"),h=>h.includes("energ"),h=>h.includes("mw")]);
  const iPr=findCol(hd,[h=>h.includes("precio"),h=>h.includes("price")]);
  let iOC=findCol(hd,[h=>h.includes("ofertada"),h=>h.includes("casada"),h=>h==="o/c"]);
  if(iOC===iT) iOC=-1;
  if([iH,iF,iT,iE,iPr].some(i=>i<0)) return {error:"Missing cols: "+hd.join("|")};
  const raw={},fl={total:0,accepted:0};
  for(let li=hi+1;li<lines.length;li++){
    const line=lines[li];if(line.startsWith("OMIE")||line.startsWith("*"))continue;
    const parts=line.split(";");if(parts.length<5)continue;fl.total++;
    const hora=parseHour(parts[iH]),fecha=(parts[iF]||"").trim();
    const tipo=(parts[iT]||"").trim().toUpperCase();
    const isSup=["V","SELL","S"].includes(tipo),isDem=["C","D","BUY","B"].includes(tipo);
    if(!isSup&&!isDem) continue;
    const mw=parseEU(parts[iE]),price=parseEU(parts[iPr]);
    if(isNaN(hora)||!fecha||isNaN(mw)||isNaN(price)||mw<0||price>3010||price<-490) continue;
    const oc=iOC>=0?(parts[iOC]||"").trim().toUpperCase():"n/a";
    if(iOC>=0&&oc!=="O") continue;
    fl.accepted++;
    if(!raw[fecha]) raw[fecha]={};
    if(!raw[fecha][hora]) raw[fecha][hora]={supply:[],demand:[],hora};
    if(isSup) raw[fecha][hora].supply.push({price,mw});
    else raw[fecha][hora].demand.push({price,mw});
  }
  const out={};
  for(const date of Object.keys(raw)){
    out[date]={};
    for(const hStr of Object.keys(raw[date])){
      const h=parseInt(hStr),{supply:sup,demand:dem,hora}=raw[date][hStr];
      sup.sort((a,b)=>a.price-b.price);dem.sort((a,b)=>b.price-a.price);
      let cs=0,cd=0;
      const supC=sup.map(s=>{cs+=s.mw;return{price:s.price,cumMW:cs};});
      const demC=dem.map(d=>{cd+=d.mw;return{price:d.price,cumMW:cd};});
      const inter=solveIntersection(supC,demC);
      out[date][h]={supply:supC,demand:demC,hora,...inter};
    }
  }
  out._diag={filterLog:fl};
  return out;
}

function solveIntersection(sup,dem){
  if(!sup||!dem||sup.length<2||dem.length<2) return null;
  try{
    const step=(c,mw)=>{if(mw<=c[0].cumMW)return c[0].price;if(mw>c.at(-1).cumMW)return c.at(-1).price;let lo=0,hi=c.length-1;while(lo<hi){const m=(lo+hi)>>1;if(c[m].cumMW<mw)lo=m+1;else hi=m;}return c[lo].price;};
    const bp={};sup.forEach(s=>bp[s.cumMW]=1);dem.forEach(d=>bp[d.cumMW]=1);
    const mx=Math.min(sup.at(-1).cumMW,dem.at(-1).cumMW),mn=Math.max(sup[0].cumMW,dem[0].cumMW);
    const pts=Object.keys(bp).map(Number).filter(m=>m>=mn&&m<=mx).sort((a,b)=>a-b);
    if(!pts.length)return null;
    for(const mw of pts){if(step(sup,mw)>=step(dem,mw))return{clearPrice:Math.max(step(sup,mw),0),clearMW:mw};}
    let mg=Infinity,bm=pts[0],bp2=0;for(const mw of pts){const g=Math.abs(step(sup,mw)-step(dem,mw));if(g<mg){mg=g;bm=mw;bp2=(step(sup,mw)+step(dem,mw))/2;}}
    return{clearPrice:Math.max(bp2,0),clearMW:bm};
  }catch{return null;}
}

function thinCurve(c,N=50){if(c.length<=N)return c;const r=[c[0]];const s=(c.length-2)/(N-2);for(let i=1;i<N-1;i++)r.push(c[Math.round(i*s)]);r.push(c.at(-1));return r;}

// Function to parse prices
function parsePrices() {
  const files = fs.readdirSync(pricesDir).filter(f => f.startsWith('marginalpdbc_'));
  for (const file of files) {
    const filePath = path.join(pricesDir, file);
    const content = fs.readFileSync(filePath, 'latin1');
    const parsed = parseMarginalPDBC(content);
    for (const slot of parsed.slots) {
      if (!output.prices[slot.date]) output.prices[slot.date] = {};
      output.prices[slot.date][slot.hora.toString()] = slot.price;
    }
  }
}

// Function to parse curves
function parseCurves() {
  const files = fs.readdirSync(curvesDir).filter(f => f.startsWith('curva_pbc_'));
  console.log(`Found ${files.length} curve files`);
  let processed = 0;
  for (const file of files) {
    const filePath = path.join(curvesDir, file);
    const content = fs.readFileSync(filePath, 'latin1');
    const parsed = parseOMIECurva(content);
    if (parsed.error) {
      console.log(`Skipping ${file}: ${parsed.error}`);
      continue;
    }
    for (const date of Object.keys(parsed)) {
      if (date.startsWith('_')) continue;
      if (!output.curves[date]) output.curves[date] = {};
      for (const hStr of Object.keys(parsed[date])) {
        const h = parsed[date][hStr];
        const thinS = thinCurve(h.supply, 50);
        const thinD = thinCurve(h.demand, 50);
        output.curves[date][hStr] = {
          s: thinS.map(p => [p.price, p.cumMW]),
          d: thinD.map(p => [p.price, p.cumMW])
        };
      }
    }
    processed++;
  }
  console.log(`Processed ${processed} curve files`);
}

// Function to thin curve to max points
function thinCurve(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const thinned = [];
  for (let i = 0; i < points.length; i += step) {
    thinned.push(points[i]);
  }
  return thinned;
}

// Run parsing
parsePrices();
parseCurves();

// Write output
fs.writeFileSync('omie_data.json', JSON.stringify(output, null, 2));

// Compress the file
const zlib = require('zlib');
const fs2 = require('fs');
const gzip = zlib.createGzip();
const input = fs2.createReadStream('omie_data.json');
const outputGz = fs2.createWriteStream('omie_data.json.gz');
input.pipe(gzip).pipe(outputGz).on('finish', () => {
  const stats = fs.statSync('omie_data.json.gz');
  console.log(`Compressed file size: ${(stats.size / 1e6).toFixed(1)} MB`);
});