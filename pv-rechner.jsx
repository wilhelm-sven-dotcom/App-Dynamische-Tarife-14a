import React, { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, ReferenceArea,
} from "recharts";
import {
  Sun, Battery, Zap, TrendingUp, Wallet, Gauge, Leaf, Info, ArrowRight,
  Check, Sparkles, ChevronDown, Sliders, ShieldCheck, Building2, Plus, X,
} from "lucide-react";

/* ===========================================================================
   Universeller PV-/Speicher-Wirtschaftlichkeitsrechner
   Echte 15-Minuten-Simulation (35.040 Schritte/Jahr) · Szenarien S0–S4
   Modulares Lastprofil · PV (Bestand oder Neuinvestition) · §14a EnWG Modul 1+3
   =========================================================================== */

const COLORS = {
  ink: "#17191c", ink2: "#6b7178", ink3: "#9aa0a6",
  paper: "#faf9f6", surface: "#ffffff", surface2: "#f6f5f1",
  line: "#eceae3", lineStrong: "#ddd9cf",
  solar: "#ea8c1c", solarSoft: "#fdeccf",
  green: "#0e9e6e", greenSoft: "#d6f1e6",
  battery: "#0e9e6e", batterySoft: "#d6f1e6",
  load: "#5b6472", grid: "#9aa0a6", gridSoft: "#edece8",
  imp: "#d2553b", impSoft: "#f7ddd4", neg: "#d2553b", pos: "#0e9e6e",
  exp: "#caa53a",
};

const STEPS_PER_DAY = 96;
const DAYS = 365;
const STEPS = STEPS_PER_DAY * DAYS; // 35.040
const DT = 0.25; // h pro Schritt
const MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const DIM = [31,28,31,30,31,30,31,31,30,31,30,31];
// Modelljahr 2026: 1. Januar 2026 ist ein Donnerstag → Index 3 bei Mo=0 … So=6.
const START_WEEKDAY = 3;

/* ===========================================================================
   Kundensegmente / Projektprofile
   =========================================================================== */
const SEGMENTS = [
  { id:"household",  label:"Privat / Einfamilienhaus" },
  { id:"multi",      label:"Mehrfamilienhaus" },
  { id:"commercial", label:"Gewerbe allgemein" },
  { id:"office",     label:"Büro" },
  { id:"retail",     label:"Einzelhandel" },
  { id:"gastro",     label:"Gastronomie" },
  { id:"bakery",     label:"Bäckerei / Lebensmittelhandwerk" },
  { id:"workshop",   label:"Werkstatt / Handwerk" },
  { id:"agriculture",label:"Landwirtschaft" },
  { id:"coldStorage",label:"Kühlung / Lager" },
  { id:"hotel",      label:"Hotel / Pension" },
  { id:"school",     label:"Schule / Kita / Kommune" },
  { id:"sportsClub", label:"Sportverein" },
  { id:"custom",     label:"Individuell" },
];
const segLabel = (id)=> (SEGMENTS.find(s=>s.id===id)||{label:"Standort"}).label;

/* ===========================================================================
   Lastprofil-Komponenten-Katalog
   Jede Komponente wird über STEPS normalisiert (Summe=1) und mit annualKwh
   (bzw. im Skalier-Modus mit ihrem Gewicht) multipliziert. Alle Komponenten
   werden additiv zu einem Gesamtlastprofil kombiniert.
   Felder: baseLevel (Last außerhalb des Fensters), intensity (im Fenster),
   startHour/endHour (Zeitfenster, Mitternachts-Umschlag erlaubt),
   weekdayFactor/weekendFactor, season: "all" | "winter" | "summer".
   =========================================================================== */
const LOAD_CATALOG = [
  { id:"base",          name:"Grundlast",              baseLevel:1.0, intensity:1.0, startHour:0,  endHour:24, weekdayFactor:1.0, weekendFactor:1.0, season:"all",    defaultKwh:3000 },
  { id:"morning",       name:"Morgenlast",             baseLevel:0.1, intensity:1.0, startHour:6,  endHour:9,  weekdayFactor:1.0, weekendFactor:0.9, season:"all",    defaultKwh:1500 },
  { id:"office",        name:"Bürozeiten",             baseLevel:0.05,intensity:1.0, startHour:8,  endHour:18, weekdayFactor:1.0, weekendFactor:0.15,season:"all",    defaultKwh:12000 },
  { id:"evening",       name:"Abendlast",              baseLevel:0.0, intensity:1.0, startHour:17, endHour:22, weekdayFactor:1.0, weekendFactor:1.1, season:"all",    defaultKwh:2500 },
  { id:"night",         name:"Nachtlast",              baseLevel:0.0, intensity:1.0, startHour:22, endHour:6,  weekdayFactor:1.0, weekendFactor:1.0, season:"all",    defaultKwh:1500 },
  { id:"weekend",       name:"Wochenendbetrieb",       baseLevel:0.0, intensity:1.0, startHour:8,  endHour:22, weekdayFactor:0.0, weekendFactor:1.0, season:"all",    defaultKwh:3000 },
  { id:"cooling",       name:"Kühlung konstant",       baseLevel:1.0, intensity:1.0, startHour:0,  endHour:24, weekdayFactor:1.0, weekendFactor:1.0, season:"all",    defaultKwh:15000 },
  { id:"heatpump",      name:"Wärmepumpe Winter",      baseLevel:0.4, intensity:1.0, startHour:5,  endHour:22, weekdayFactor:1.0, weekendFactor:1.0, season:"winter", defaultKwh:6000 },
  { id:"ac",            name:"Klimatisierung Sommer",  baseLevel:0.0, intensity:1.0, startHour:10, endHour:20, weekdayFactor:1.0, weekendFactor:0.8, season:"summer", defaultKwh:4000 },
  { id:"evDay",         name:"E-Mobilität tagsüber",   baseLevel:0.0, intensity:1.0, startHour:9,  endHour:16, weekdayFactor:1.0, weekendFactor:0.5, season:"all",    defaultKwh:3000 },
  { id:"evNight",       name:"E-Mobilität nachts",     baseLevel:0.0, intensity:1.0, startHour:22, endHour:6,  weekdayFactor:1.0, weekendFactor:1.0, season:"all",    defaultKwh:3000 },
  { id:"prodEarly",     name:"Produktion Frühschicht", baseLevel:0.0, intensity:1.0, startHour:6,  endHour:14, weekdayFactor:1.0, weekendFactor:0.1, season:"all",    defaultKwh:20000 },
  { id:"prodLate",      name:"Produktion Spätschicht", baseLevel:0.0, intensity:1.0, startHour:14, endHour:22, weekdayFactor:1.0, weekendFactor:0.1, season:"all",    defaultKwh:20000 },
  { id:"gastroLunch",   name:"Gastronomie Mittag",     baseLevel:0.0, intensity:1.0, startHour:11, endHour:15, weekdayFactor:1.0, weekendFactor:1.2, season:"all",    defaultKwh:12000 },
  { id:"gastroEvening", name:"Gastronomie Abend",      baseLevel:0.0, intensity:1.0, startHour:17, endHour:23, weekdayFactor:1.0, weekendFactor:1.3, season:"all",    defaultKwh:15000 },
  { id:"bakeryEarly",   name:"Backstube (früh)",       baseLevel:0.1, intensity:1.0, startHour:3,  endHour:8,  weekdayFactor:1.0, weekendFactor:0.8, season:"all",    defaultKwh:30000 },
  { id:"sportsEvening", name:"Abendtraining",          baseLevel:0.0, intensity:1.0, startHour:17, endHour:22, weekdayFactor:1.0, weekendFactor:0.6, season:"all",    defaultKwh:9000 },
  { id:"sportsWeekend", name:"Wochenend-/Spielbetrieb",baseLevel:0.0, intensity:1.0, startHour:14, endHour:22, weekdayFactor:0.0, weekendFactor:1.0, season:"all",    defaultKwh:3000 },
  { id:"floodlight",    name:"Winterbeleuchtung",      baseLevel:0.0, intensity:1.0, startHour:16, endHour:22, weekdayFactor:1.0, weekendFactor:1.0, season:"winter", defaultKwh:2500 },
  { id:"custom",        name:"Individuelles Zeitfenster",baseLevel:0.0,intensity:1.0,startHour:8,  endHour:16, weekdayFactor:1.0, weekendFactor:1.0, season:"all",    defaultKwh:5000 },
];
const catalogDef = (id)=> LOAD_CATALOG.find(c=>c.id===id);

/* makeComponents: erzeugt aus dem Katalog die Komponenten-Instanzen.
   overrides = { id: { enabled, annualKwh, ...feldueberschreibungen } }     */
function makeComponents(overrides={}){
  return LOAD_CATALOG.map(def=>{
    const ov = overrides[def.id] || {};
    return {
      id:def.id, name:def.name, type:def.id,
      enabled: ov.enabled!=null ? ov.enabled : false,
      annualKwh: ov.annualKwh!=null ? ov.annualKwh : def.defaultKwh,
      baseLevel: ov.baseLevel!=null ? ov.baseLevel : def.baseLevel,
      intensity: ov.intensity!=null ? ov.intensity : def.intensity,
      startHour: ov.startHour!=null ? ov.startHour : def.startHour,
      endHour:   ov.endHour!=null   ? ov.endHour   : def.endHour,
      weekdayFactor: ov.weekdayFactor!=null ? ov.weekdayFactor : def.weekdayFactor,
      weekendFactor: ov.weekendFactor!=null ? ov.weekendFactor : def.weekendFactor,
      season: ov.season || def.season,
    };
  });
}

/* Vordefinierte Lastprofil-Vorlagen je Kundensegment (welche Komponenten aktiv).
   Werte = grobe Verteilungs-Gewichte; im Skalier-Modus zählt nur die Form,
   im Summen-Modus die kWh/Jahr.                                             */
const LOAD_TEMPLATES = {
  household:   { base:{enabled:true,annualKwh:1800}, morning:{enabled:true,annualKwh:1500}, evening:{enabled:true,annualKwh:2200}, weekend:{enabled:true,annualKwh:500} },
  multi:       { base:{enabled:true,annualKwh:8000}, morning:{enabled:true,annualKwh:6000}, evening:{enabled:true,annualKwh:9000}, weekend:{enabled:true,annualKwh:4000} },
  commercial:  { base:{enabled:true,annualKwh:6000}, office:{enabled:true,annualKwh:18000}, weekend:{enabled:true,annualKwh:2000} },
  office:      { base:{enabled:true,annualKwh:4000}, office:{enabled:true,annualKwh:24000} },
  retail:      { base:{enabled:true,annualKwh:5000}, office:{enabled:true,annualKwh:18000,startHour:9,endHour:20}, weekend:{enabled:true,annualKwh:6000} },
  gastro:      { base:{enabled:true,annualKwh:8000}, gastroLunch:{enabled:true,annualKwh:14000}, gastroEvening:{enabled:true,annualKwh:18000} },
  bakery:      { base:{enabled:true,annualKwh:10000}, bakeryEarly:{enabled:true,annualKwh:38000}, office:{enabled:true,annualKwh:8000,startHour:7,endHour:14} },
  workshop:    { base:{enabled:true,annualKwh:6000}, office:{enabled:true,annualKwh:22000,startHour:7,endHour:17} },
  agriculture: { base:{enabled:true,annualKwh:30000}, prodEarly:{enabled:true,annualKwh:20000}, ac:{enabled:true,annualKwh:12000} },
  coldStorage: { base:{enabled:true,annualKwh:20000}, cooling:{enabled:true,annualKwh:50000} },
  hotel:       { base:{enabled:true,annualKwh:25000}, morning:{enabled:true,annualKwh:12000}, evening:{enabled:true,annualKwh:18000} },
  school:      { base:{enabled:true,annualKwh:6000}, office:{enabled:true,annualKwh:20000,startHour:7,endHour:16,weekendFactor:0.05} },
  sportsClub:  { base:{enabled:true,annualKwh:2500}, sportsEvening:{enabled:true,annualKwh:8500}, sportsWeekend:{enabled:true,annualKwh:3000}, floodlight:{enabled:true,annualKwh:2500} },
  custom:      { base:{enabled:true,annualKwh:5000}, custom:{enabled:true,annualKwh:10000} },
};
const templateFor = (seg)=> makeComponents(LOAD_TEMPLATES[seg] || LOAD_TEMPLATES.custom);

/* ===========================================================================
   Kundenspezifische Presets (setzen typische Werte; danach frei editierbar)
   =========================================================================== */
const PRESETS = {
  household:   { label:"Einfamilienhaus", state:{ segment:"household",  consumption:6000,  pvKwp:10, capacity:10, loadMode:"scale" } },
  office:      { label:"Gewerbe Büro",    state:{ segment:"office",     consumption:30000, pvKwp:30, capacity:20, loadMode:"scale" } },
  gastro:      { label:"Gastronomie",     state:{ segment:"gastro",     consumption:45000, pvKwp:25, capacity:20, loadMode:"scale" } },
  bakery:      { label:"Bäckerei",        state:{ segment:"bakery",     consumption:60000, pvKwp:30, capacity:25, loadMode:"scale" } },
  agriculture: { label:"Landwirtschaft",  state:{ segment:"agriculture",consumption:80000, pvKwp:50, capacity:40, loadMode:"scale" } },
  sportsClub:  { label:"Sportverein",     state:{ segment:"sportsClub", consumption:16500, pvKwp:30, capacity:20, loadMode:"scale" } },
};

/* ===========================================================================
   PV-Ausrichtungsfaktoren (Ertrag + Tagesform)
   f = relativer Jahresertrag · exp = Glockenschärfe (kleiner = breiter)
   shift = Verschiebung des Erzeugungsmaximums in Stunden                    */
const ORIENT = {
  south:        { label:"Süd",              f:1.00, exp:1.25, shift:0,    spread:0 },
  southeastwest:{ label:"Südost / Südwest", f:0.95, exp:1.05, shift:0,    spread:0.3 },
  eastwest:     { label:"Ost/West",         f:0.90, exp:0.62, shift:0,    spread:1.0 },
  east:         { label:"Ost",              f:0.82, exp:0.90, shift:-1.6,  spread:0.4 },
  west:         { label:"West",             f:0.82, exp:0.90, shift:+1.6,  spread:0.4 },
  north:        { label:"Nord / Sonderfall",f:0.60, exp:1.55, shift:0,    spread:0 },
};
const REGIONS = {
  nord:  { label:"Norddeutschland", f:0.90 },
  mitte: { label:"Mitteldeutschland",f:0.97 },
  sued:  { label:"Süddeutschland",  f:1.04 },
};
// Neigungs-Faktor: Optimum ~32°, milde Abschläge zu Flach-/Steildach.
const tiltFactor = (deg)=> clamp(1 - Math.abs(deg-32)*0.0035, 0.78, 1);

/* ---- Spotmarkt-Tagesprofile (24 Stundenfaktoren, Mittel=1) -------------- */
const SPOT_SHAPES = {
  generic: { mean:8.0, hours:[0.80,0.74,0.70,0.69,0.72,0.83,0.99,1.16,1.18,1.08,0.97,0.87,
                              0.80,0.75,0.76,0.84,0.97,1.17,1.30,1.27,1.12,1.00,0.92,0.84] },
  y2024:   { mean:7.80, hours:[0.82,0.74,0.68,0.66,0.70,0.86,1.12,1.34,1.24,0.86,0.46,0.18,
                               0.02,0.06,0.38,0.72,1.04,1.40,1.60,1.52,1.26,1.06,0.94,0.82] },
  y2025:   { mean:8.65, hours:[0.86,0.78,0.72,0.70,0.74,0.92,1.18,1.40,1.22,0.82,0.44,0.12,
                               0.00,0.06,0.34,0.70,1.06,1.44,1.64,1.56,1.28,1.06,0.94,0.86] },
};

const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const nf = (n,d=0)=> (isFinite(n)?n:0).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const eur = (n,d=0)=> nf(n,d)+" €";
const pct = (n,d=0)=> nf((isFinite(n)?n:0)*100,d)+" %";
const rnd = (i)=>{ const x=Math.sin(i*12.9898+78.233)*43758.5453; return x-Math.floor(x); };
const fmtHour = (v)=>{ const h=Math.floor(v), min=Math.round((v-h)*60); return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")} Uhr`; };

function percentile(sorted, p){
  if(sorted.length===0) return 0;
  const idx=(sorted.length-1)*p, lo=Math.floor(idx), hi=Math.ceil(idx);
  if(lo===hi) return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
}

/* ---- Meta: Monat / Wochenende / §14a-Quartal je Tag -------------------- */
function buildMeta(){
  const monthOfDay=new Int8Array(DAYS), weekend=new Uint8Array(DAYS), quarter=new Uint8Array(DAYS);
  let d=0;
  for(let m=0;m<12;m++) for(let k=0;k<DIM[m];k++){
    monthOfDay[d]=m; quarter[d]=(Math.floor(m/3)+1);
    const wd=(START_WEEKDAY+d)%7; weekend[d]=(wd===5||wd===6)?1:0;   // 5=Sa, 6=So
    d++;
  }
  return { monthOfDay, weekend, quarter };
}

// Stunde h in Zeitfenster [start,end)? Unterstützt Mitternachts-Umschlag (start>end).
function inWindow(h, start, end){
  if(start===end) return false;
  return start<end ? (h>=start && h<end) : (h>=start || h<end);
}
const isWinter = (m)=> (m<=2 || m>=9);    // Jan–Mär, Okt–Dez
const seasonFactor = (season, m)=> season==="winter" ? (isWinter(m)?1:0.18)
                                   : season==="summer" ? (isWinter(m)?0.18:1)
                                   : 1;

/* ---- PV-Profil: kWh je Schritt (Tageslicht-Glocke, ~49,5°N) ------------
   orientKey beeinflusst Jahresertrag (f), Tagesform (exp/spread) und die
   Lage des Maximums (shift). Die 15-Minuten-Auflösung bleibt erhalten.     */
function buildPV(kwp, yieldKwhPerKwp, orientKey){
  const o = ORIENT[orientKey] || ORIENT.south;
  const pv=new Float64Array(STEPS);
  const annual=kwp*yieldKwhPerKwp*o.f;
  const share=[0.030,0.048,0.082,0.108,0.123,0.122,0.128,0.112,0.090,0.062,0.034,0.024];
  const s=share.reduce((a,b)=>a+b,0); for(let i=0;i<12;i++) share[i]/=s;
  const lat=49.5*Math.PI/180, noon=12.7+o.shift;
  let d=0;
  for(let m=0;m<12;m++){
    const perDay=annual*share[m]/DIM[m];
    for(let k=0;k<DIM[m];k++,d++){
      const decl=23.45*Math.PI/180*Math.sin(2*Math.PI*(284+d)/365);
      const cosH=clamp(-Math.tan(lat)*Math.tan(decl),-1,1);
      const dl=2*Math.acos(cosH)*12/Math.PI;     // Tageslichtstunden
      // Ost/West verbreitert das Erzeugungsfenster (früher Start, späteres Ende)
      const sr=noon-dl/2-o.spread, ss=noon+dl/2+o.spread;
      const base=d*STEPS_PER_DAY; let sum=0; const tmp=new Float64Array(STEPS_PER_DAY);
      for(let j=0;j<STEPS_PER_DAY;j++){
        const h=j*DT;
        const v=(h<=sr||h>=ss)?0:Math.pow(Math.sin(Math.PI*(h-sr)/(ss-sr)),o.exp);
        tmp[j]=v; sum+=v;
      }
      for(let j=0;j<STEPS_PER_DAY;j++) pv[base+j]= sum>0 ? tmp[j]/sum*perDay : 0;
    }
  }
  return pv;
}

/* ---- Lastprofil: modular aus kombinierbaren Komponenten -----------------
   mode "scale": Komponenten bestimmen nur die Form, das Gesamtprofil wird
                 auf consumption skaliert.
   mode "sum":   jede Komponente trägt ihre annualKwh bei; Summe = Verbrauch.
   Rückgabe: { load: Float64Array, annual: number }                          */
function buildLoad(components, mode, consumption, meta){
  const load=new Float64Array(STEPS);
  const active=(components||[]).filter(c=>c.enabled && c.annualKwh>0);
  if(active.length===0){                       // Fallback: flaches Profil
    const f=(mode==="sum"?0:consumption)/STEPS;
    for(let i=0;i<STEPS;i++) load[i]=f;
    return { load, annual: mode==="sum"?0:consumption };
  }
  let annual=0;
  for(const c of active){
    // 1) Rohform der Komponente über das Jahr
    const tmp=new Float64Array(STEPS); let s=0;
    for(let i=0;i<STEPS;i++){
      const d=Math.floor(i/STEPS_PER_DAY), h=(i%STEPS_PER_DAY)*DT, m=meta.monthOfDay[d], we=meta.weekend[d];
      let v=(inWindow(h,c.startHour,c.endHour)?c.intensity:c.baseLevel);
      v*= we ? c.weekendFactor : c.weekdayFactor;
      v*= seasonFactor(c.season,m);
      if(v<0) v=0;
      tmp[i]=v; s+=v;
    }
    // 2) auf annualKwh der Komponente normieren und addieren
    if(s>0){ const f=c.annualKwh/s; for(let i=0;i<STEPS;i++) load[i]+=tmp[i]*f; annual+=c.annualKwh; }
  }
  if(mode==="scale"){                          // Form behalten, auf Verbrauch skalieren
    let sum=0; for(let i=0;i<STEPS;i++) sum+=load[i];
    if(sum>0){ const f=consumption/sum; for(let i=0;i<STEPS;i++) load[i]*=f; }
    annual=consumption;
  }
  return { load, annual };
}

/* ---- Spotpreis (€/kWh, ohne Abgaben) ----------------------------------- */
function buildSpot(avgCt, meta, shapeKey){
  const shape = SPOT_SHAPES[shapeKey] || SPOT_SHAPES.generic;
  const hours = shape.hours;
  const mean = hours.reduce((a,b)=>a+b,0)/24;
  const target = shapeKey && shapeKey!=="generic" ? shape.mean : avgCt;
  const spot=new Float64Array(STEPS);
  let raw=0;
  for(let i=0;i<STEPS;i++){
    const d=Math.floor(i/STEPS_PER_DAY), hI=Math.floor((i%STEPS_PER_DAY)*DT), m=meta.monthOfDay[d];
    const season=1+0.28*Math.cos(2*Math.PI*(d-10)/365);
    let mult=hours[hI]/mean;
    if(m>=3&&m<=8 && hI>=11&&hI<15) mult*=0.55;   // Sommer-Mittagsdelle
    const v=season*mult;
    spot[i]=v; raw+=v;
  }
  const k = target / (raw/STEPS);
  for(let i=0;i<STEPS;i++){
    const noise=(rnd(i)-0.5)*0.16;
    spot[i]=clamp(spot[i]*k*(1+noise),-12,80)/100;
  }
  return spot;
}

/* ---- Dynamischer Bezugspreis €/kWh inkl. §14a Modul 3 ------------------ */
function buildDynamicBuy(spot, meta, p){
  const buy=new Float64Array(STEPS);
  const active=p.activeQuarters||[];
  for(let i=0;i<STEPS;i++){
    const d=Math.floor(i/STEPS_PER_DAY), h=(i%STEPS_PER_DAY)*DT;
    let gf=p.gridFeeBase;
    if(p.modul3 && active.indexOf(meta.quarter[d])>=0){
      if(inWindow(h,p.ntStart,p.ntEnd)) gf=p.gridFeeBase-p.ntRed;
      else if(inWindow(h,p.htStart,p.htEnd)) gf=p.gridFeeBase+p.htSur;
    }
    gf=Math.max(0,gf);
    buy[i]=spot[i]+(gf+p.otherFixed)/100;
  }
  return buy;
}

/* ===========================================================================
   Dispatch-Engine (rein, testbar) – unverändertes 15-Minuten-Modell
   =========================================================================== */
function simulate(profiles, opt){
  const { pv:PV, load:LOAD, meta } = profiles;
  const { pvScale, cap, chargeP, dischargeP, effC, effD, buy, sell, arbitrage, rebate, traceDays } = opt;
  const cMaxAC=chargeP*DT, dMaxAC=dischargeP*DT;
  const MIN_SPREAD=0.05; // €/kWh – darunter lohnt Netzladung nicht

  const pvSuffices=new Uint8Array(DAYS), chgThresh=new Float64Array(DAYS), allow=new Uint8Array(DAYS);
  if(arbitrage && cap>0){
    for(let d=0; d<DAYS; d++){
      const s=d*STEPS_PER_DAY; let surplus=0; const db=[];
      for(let k=0;k<STEPS_PER_DAY;k++){ const i=s+k; surplus+=Math.max(0,PV[i]*pvScale-LOAD[i]); db.push(buy[i]); }
      pvSuffices[d]= surplus>=cap*0.7 ? 1:0;
      db.sort((a,b)=>a-b);
      chgThresh[d]=percentile(db,0.20);
      allow[d]= (percentile(db,0.80)-percentile(db,0.20))>MIN_SPREAD ? 1:0;
    }
  }

  let soc=0, socPV=0, socGrid=0, dayBudget=0, curDay=-1;
  const A={pvGen:0,load:0,pvDirect:0,feedIn:0,gridToLoad:0,gridToBatt:0,
           battToLoadPV:0,battToLoadGrid:0,battDis:0,cost:0};
  const monthly=Array.from({length:12},()=>({pvDirekt:0,battLast:0,netz:0,einsp:0,netzLadung:0}));
  const traces={}; (traceDays||[]).forEach(d=>traces[d]=[]);

  for(let i=0;i<STEPS;i++){
    const d=Math.floor(i/STEPS_PER_DAY), m=meta.monthOfDay[d];
    if(d!==curDay){ curDay=d; dayBudget=cap; }
    const pv=PV[i]*pvScale, load=LOAD[i], price=buy[i];
    A.pvGen+=pv; A.load+=load;

    let pvRem=pv, loadRem=load, chgAC=0;
    let sFeed=0, sGridLoad=0, sGridChg=0;

    const direct=Math.min(pvRem,loadRem); pvRem-=direct; loadRem-=direct;
    A.pvDirect+=direct; monthly[m].pvDirekt+=direct;

    if(cap>0 && pvRem>0){
      const room=(cap-soc)/effC;
      const c=Math.min(pvRem, cMaxAC-chgAC, room);
      if(c>0){ soc+=c*effC; socPV+=c*effC; pvRem-=c; chgAC+=c; }
    }
    if(pvRem>0){ sFeed=pvRem; A.feedIn+=pvRem; monthly[m].einsp+=pvRem; pvRem=0; }

    const cheapNow = arbitrage && cap>0 && allow[d] && !pvSuffices[d] && price<=chgThresh[d];

    if(cap>0 && loadRem>0 && soc>1e-9 && !cheapNow){
      const availAC=soc*effD;
      const dAC=Math.min(loadRem, dMaxAC, availAC);
      if(dAC>0){
        const cell=dAC/effD, fracPV= soc>0 ? socPV/soc : 0;
        socPV-=cell*fracPV; socGrid-=cell*(1-fracPV); soc-=cell;
        loadRem-=dAC; A.battDis+=dAC;
        const pvPart=dAC*fracPV; A.battToLoadPV+=pvPart; A.battToLoadGrid+=(dAC-pvPart);
        monthly[m].battLast+=dAC;
      }
    }
    if(loadRem>0){ sGridLoad=loadRem; A.gridToLoad+=loadRem; monthly[m].netz+=loadRem; A.cost+=loadRem*price; loadRem=0; }

    if(arbitrage && cap>0 && allow[d] && !pvSuffices[d] && price<=chgThresh[d] && soc<cap-1e-9 && dayBudget>1e-9){
      const room=(cap-soc)/effC;
      const g=Math.min(cMaxAC-chgAC, room, dayBudget);
      if(g>0){ soc+=g*effC; socGrid+=g*effC; chgAC+=g; dayBudget-=g; sGridChg=g; A.gridToBatt+=g; monthly[m].netzLadung+=g; A.cost+=g*price; }
    }

    if(traces[d]) traces[d].push({
      h:+( (i%STEPS_PER_DAY)*DT ).toFixed(2),
      pv:+(pv/DT).toFixed(3), last:+(load/DT).toFixed(3),
      netz:+((sGridLoad+sGridChg)/DT).toFixed(3), einsp:+(sFeed/DT).toFixed(3),
      soc:+soc.toFixed(2),
    });
  }

  A.cost-=A.feedIn*sell;     // Einspeisevergütung
  A.cost-=rebate;            // §14a Modul 1 Pauschale

  const selfCons= A.pvDirect + A.battToLoadPV;   // tatsächlich lastdeckender PV-Strom
  return {
    cost:A.cost,
    autarkie: A.load>0 ? (A.pvDirect+A.battToLoadPV)/A.load : 0,
    evq: A.pvGen>0 ? selfCons/A.pvGen : 0,
    feedIn:A.feedIn, netzGesamt:A.gridToLoad+A.gridToBatt, netzVersorgung:A.gridToLoad,
    netzladung:A.gridToBatt, selfCons, vollzyklen: cap>0 ? A.battDis/cap : 0,
    pvToBatt: Math.max(0, A.pvGen - A.pvDirect - A.feedIn), battToLoadPV:A.battToLoadPV,
    pvDirect:A.pvDirect, gridToLoad:A.gridToLoad,
    battDis:A.battDis, totalPV:A.pvGen, totalLoad:A.load, monthly, traces,
  };
}

/* ---- Finanz-Engine ------------------------------------------------------ */
function irr(invest, savY1, H, esc, battDeg, pvDeg){
  if(invest<=0 || savY1<=0) return NaN;          // keine Rendite ohne Invest/Ersparnis
  const cf=[-invest];
  for(let n=1;n<=H;n++) cf.push(savings(savY1,n,esc,battDeg,pvDeg));
  const npvAt=(r)=>cf.reduce((acc,c,t)=>acc+c/Math.pow(1+r,t),0);
  if(npvAt(0)<=0) return NaN;
  let lo=-0.9, hi=1.0;
  if(npvAt(hi)>0) return NaN;
  for(let k=0;k<80;k++){ const mid=(lo+hi)/2; (npvAt(mid)>0?lo=mid:hi=mid); }
  return (lo+hi)/2;
}
function savings(savY1,n,esc,battDeg,pvDeg){
  return savY1*Math.pow(1+esc,n-1)
    *clamp(1-battDeg*(n-1),0.5,1)
    *clamp(1-pvDeg*(n-1),0.85,1);
}

/* ===========================================================================
   Defaults & Konstanten
   =========================================================================== */
const DEFAULTS={
  segment:"sportsClub",
  // Lastprofil
  loadMode:"scale", consumption:16500,
  loadComponents: templateFor("sportsClub"),
  // PV
  pvKwp:30, yieldK:950, pvOrient:"south", pvTilt:30, pvRegion:"sued",
  pvIsNew:false, pvCostPerKwp:1300, pvOpexPct:1.0,
  // Speicher
  capacity:20, costPerKwh:400, chargeP:12, dischargeP:12, roundTrip:90,
  storageIsNew:true, battOpexPct:1.0,
  // Förderung / Restwert / Wartung
  funding:0, fundingPct:0, residual:0, maintenance:0,
  // Preise & Tarif
  arbeitspreis:28.87, feedIn:8.2, avgSpot:8.0, spotProfile:"y2025", gridFeeBase:8.0, otherFixed:12.5,
  modul3:true, ntRed:4.0, htSur:4.56, ntStart:10, ntEnd:15, htStart:17, htEnd:22, quarters:"q23",
  modul1:true, rebate:120, arbitrage:true, netz:"custom",
  horizon:20, esc:3.0, disc:4.0, pvDeg:0.5, battDeg:2.0,
};

const QSET={ q23:[2,3], all:[1,2,3,4], q14:[1,4] };

const NETZE={
  custom:{ label:"Eigene Werte (laut Preisblatt)" },
  bayernwerk:{
    label:"Bayernwerk Netz — 2026 (vorläufig)",
    vals:{ gridFeeBase:4.72, htSur:4.31, ntRed:4.25, ntStart:10, ntEnd:15, htStart:17, htEnd:22, quarters:"q23", modul3:true },
    src:"bayernwerk-netz.de · Preisblatt 2026, Stand 07.10.2025",
    note:"ST 4,72 / HT 9,03 / NT 0,47 ct/kWh (netto). Saisonal: Zeitfenster nur Q2+Q3, sonst durchgehend Standardtarif."
  },
  weiden:{
    label:"Stromnetz Weiden i.d.OPf. — 2025",
    vals:{ gridFeeBase:7.04, htSur:5.77, ntRed:4.22, ntStart:22, ntEnd:6, htStart:17, htEnd:19, quarters:"all", modul3:true, rebate:120 },
    src:"stromnetz-weiden.de · Preisblatt §14a 2025",
    note:"ST 7,04 / HT 12,81 / NT 2,82 ct/kWh (netto), Modul-1-Pauschale 120,03 €/a. Mehrband-Profil hier vereinfacht."
  },
};

/* ===========================================================================
   UI-Bausteine
   =========================================================================== */
function Field({label,unit="",step=1,min=0,max=100,slider=false,hint="",hintCls="",value,set}){
  const lo=min??-Infinity, hi=max??Infinity;
  return (
    <div className="fld">
      <div className="fld-top"><label>{label}</label><span className="unit">{unit}</span></div>
      <div className="inrow">
        {slider && <input type="range" min={min} max={max} step={step} value={value}
          onChange={e=>set(clamp(parseFloat(e.target.value),lo,hi))}/>}
        <input type="number" step={step} min={min} max={max} value={value}
          onChange={e=>{ const raw=e.target.value===""?0:parseFloat(e.target.value); set(Number.isFinite(raw)?raw:0); }}
          onBlur={e=>{ const raw=e.target.value===""?lo:parseFloat(e.target.value); set(Number.isFinite(raw)?clamp(raw,lo,hi):lo); }}/>
      </div>
      {hint && <div className={"hint "+(hintCls||"")}>{hint}</div>}
    </div>
  );
}
function Tog({label,hint="",value,set}){
  return (
    <div className="tog">
      <div><label style={{fontSize:13,fontWeight:500}}>{label}</label>{hint&&<div className="hint">{hint}</div>}</div>
      <div className={"switch "+(value?"on":"")} onClick={()=>set(!value)}><div className="knob"/></div>
    </div>
  );
}
function Select({label,unit="",value,set,options}){
  return (
    <div className="fld">
      <div className="fld-top"><label>{label}</label>{unit&&<span className="unit">{unit}</span>}</div>
      <select className="sel" value={value} onChange={e=>set(e.target.value)}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/* Editor-Zeile für eine Lastkomponente */
function CompRow({c, idx, mode, upc, remove}){
  return (
    <div className="comp">
      <div className="comp-head">
        <div className={"switch sm "+(c.enabled?"on":"")} onClick={()=>upc(idx,"enabled",!c.enabled)}><div className="knob"/></div>
        <span className="comp-name">{c.name}</span>
        <span className="comp-kwh mono">{nf(c.annualKwh)} kWh/a</span>
        <button className="comp-x" onClick={()=>remove(idx)} title="Komponente entfernen"><X size={13}/></button>
      </div>
      {c.enabled && (
        <div className="comp-grid">
          <label>{mode==="sum"?"kWh/Jahr":"Gewicht (kWh)"}
            <input type="number" step={500} min={0} value={c.annualKwh}
              onChange={e=>upc(idx,"annualKwh",Math.max(0,parseFloat(e.target.value)||0))}/></label>
          <label>Start
            <input type="number" step={1} min={0} max={23} value={c.startHour}
              onChange={e=>upc(idx,"startHour",clamp(parseFloat(e.target.value)||0,0,23))}/></label>
          <label>Ende
            <input type="number" step={1} min={0} max={24} value={c.endHour}
              onChange={e=>upc(idx,"endHour",clamp(parseFloat(e.target.value)||0,0,24))}/></label>
          <label>Werktag-Faktor
            <input type="number" step={0.1} min={0} max={5} value={c.weekdayFactor}
              onChange={e=>upc(idx,"weekdayFactor",clamp(parseFloat(e.target.value)||0,0,5))}/></label>
          <label>Wochenend-Faktor
            <input type="number" step={0.1} min={0} max={5} value={c.weekendFactor}
              onChange={e=>upc(idx,"weekendFactor",clamp(parseFloat(e.target.value)||0,0,5))}/></label>
          <label>Saison
            <select value={c.season} onChange={e=>upc(idx,"season",e.target.value)}>
              <option value="all">ganzjährig</option>
              <option value="winter">Winter</option>
              <option value="summer">Sommer</option>
            </select></label>
        </div>
      )}
    </div>
  );
}

export default function App(){
  const [I,setI]=useState(DEFAULTS);
  const up=(k)=>(v)=>setI(s=>({...s,[k]:v}));
  const applyNetz=(key)=>{ const o=NETZE[key]; setI(s=>({...s,...(o&&o.vals?o.vals:{}),netz:key})); };
  const applyPreset=(key)=>{ const p=PRESETS[key]; if(!p) return;
    setI(s=>({...s,...p.state,loadComponents:templateFor(p.state.segment)})); };
  const applySegment=(seg)=>{ setI(s=>({...s,segment:seg,loadComponents:templateFor(seg)})); };
  const upc=(idx,key,val)=> setI(s=>({...s,loadComponents:s.loadComponents.map((c,i)=>i===idx?{...c,[key]:val}:c)}));
  const removeComp=(idx)=> setI(s=>({...s,loadComponents:s.loadComponents.filter((_,i)=>i!==idx)}));
  const addComp=(id)=>{ const def=catalogDef(id); if(!def) return;
    setI(s=> s.loadComponents.some(c=>c.id===id)
      ? {...s,loadComponents:s.loadComponents.map(c=>c.id===id?{...c,enabled:true}:c)}
      : {...s,loadComponents:[...s.loadComponents, makeComponents({[id]:{enabled:true}}).find(c=>c.id===id)]}); };

  const [target,setTarget]=useState("S4");

  const meta=useMemo(()=>buildMeta(),[]);

  // effektiver spezifischer Ertrag inkl. Neigung & Region (Ausrichtung in buildPV)
  const effYield = I.yieldK * tiltFactor(I.pvTilt) * (REGIONS[I.pvRegion]?.f ?? 1);

  const loadBuilt=useMemo(()=>buildLoad(I.loadComponents,I.loadMode,I.consumption,meta),
    [I.loadComponents,I.loadMode,I.consumption,meta]);

  const profiles=useMemo(()=>({
    pv:buildPV(I.pvKwp,effYield,I.pvOrient),
    load:loadBuilt.load,
    spot:buildSpot(I.avgSpot,meta,I.spotProfile),
    meta,
  }),[I.pvKwp,effYield,I.pvOrient,loadBuilt,I.avgSpot,I.spotProfile,meta]);

  const sims=useMemo(()=>{
    const eff=Math.sqrt(clamp(I.roundTrip/100,0.5,1));
    const statBuy=new Float64Array(STEPS).fill(I.arbeitspreis/100);
    const dynBuy=buildDynamicBuy(profiles.spot,meta,{
      gridFeeBase:I.gridFeeBase, otherFixed:I.otherFixed, modul3:I.modul3,
      ntRed:I.ntRed, htSur:I.htSur, ntStart:I.ntStart, ntEnd:I.ntEnd,
      htStart:I.htStart, htEnd:I.htEnd, activeQuarters:(QSET[I.quarters]||QSET.q23),
    });
    const sell=I.feedIn/100;
    const traceDays=[171,15];
    const base={chargeP:I.chargeP,dischargeP:I.dischargeP,effC:eff,effD:eff,sell,traceDays};
    const rebate=(I.capacity>0&&I.modul1?I.rebate:0);   // §14a-Pauschale nur mit Speicher
    return {
      S0:simulate(profiles,{...base,pvScale:0,cap:0,        buy:statBuy,arbitrage:false,            rebate:0}),
      S1:simulate(profiles,{...base,pvScale:1,cap:0,        buy:statBuy,arbitrage:false,            rebate:0}),
      S2:simulate(profiles,{...base,pvScale:1,cap:I.capacity,buy:statBuy,arbitrage:false,           rebate:0}),
      S3:simulate(profiles,{...base,pvScale:1,cap:I.capacity,buy:dynBuy, arbitrage:I.arbitrage,     rebate:0}),
      S4:simulate(profiles,{...base,pvScale:1,cap:I.capacity,buy:dynBuy, arbitrage:I.arbitrage,     rebate}),
    };
  },[profiles,meta,I.roundTrip,I.arbeitspreis,I.gridFeeBase,I.otherFixed,I.modul3,I.ntRed,I.htSur,
     I.ntStart,I.ntEnd,I.htStart,I.htEnd,I.quarters,
     I.feedIn,I.chargeP,I.dischargeP,I.capacity,I.modul1,I.rebate,I.arbitrage]);

  /* ---- Investitions- & Referenzlogik ---- */
  const storageInvest = I.storageIsNew ? I.capacity*I.costPerKwh : 0;
  const pvInvest      = I.pvIsNew ? I.pvKwp*I.pvCostPerKwp : 0;
  const totalInvest   = storageInvest + pvInvest;
  const fundingTotal  = Math.min(totalInvest, I.funding + totalInvest*I.fundingPct/100);
  const investNet     = Math.max(0, totalInvest - fundingTotal);
  const opexYear      = (I.pvIsNew? pvInvest*I.pvOpexPct/100 : 0)
                      + (I.storageIsNew? storageInvest*I.battOpexPct/100 : 0)
                      + I.maintenance;
  // Referenz: PV neu → gegen Nur-Netz (S0); PV Bestand → gegen PV ohne Speicher (S1)
  const refKey   = I.pvIsNew ? "S0" : "S1";
  const refLabel = I.pvIsNew ? "Nur-Netz-Referenz (ohne PV & Speicher)" : "PV ohne Speicher (Bestand)";
  const refCost  = sims[refKey].cost;

  const eco=useMemo(()=>{
    const mk=(s)=>{
      const savY1=refCost - s.cost - opexYear;          // Wartung mindert Nettoersparnis
      const valid = investNet>0 && savY1>0;
      const amort= valid ? investNet/savY1 : Infinity;
      let npv=-investNet;
      const series=[{jahr:0, cum:-investNet}];
      let cum=-investNet;
      for(let n=1;n<=I.horizon;n++){
        const sv=savings(savY1,n,I.esc/100,I.battDeg/100,I.pvDeg/100);
        npv+=sv/Math.pow(1+I.disc/100,n);
        cum+=sv; series.push({jahr:n,cum:Math.round(cum)});
      }
      if(I.residual>0){ npv+=I.residual/Math.pow(1+I.disc/100,I.horizon); }
      const r=irr(investNet,savY1,I.horizon,I.esc/100,I.battDeg/100,I.pvDeg/100);
      let payback=Infinity;
      if(valid) for(let n=1;n<series.length;n++){ if(series[n].cum>=0){ const a=series[n-1].cum,b=series[n].cum; payback=(n-1)+(0-a)/(b-a); break; } }
      return {savY1,amort,npv,irr:r,series,payback};
    };
    return {S2:mk(sims.S2),S3:mk(sims.S3),S4:mk(sims.S4)};
  },[sims,investNet,opexYear,refCost,I.horizon,I.esc,I.disc,I.battDeg,I.pvDeg,I.residual]);

  /* Speichergröße-Optimum: NPV & Amortisation je Kapazität */
  const sweep=useMemo(()=>{
    const SIZES=Array.from({length:11},(_,i)=>i*5);   // 0,5,…,50 kWh
    const eff=Math.sqrt(clamp(I.roundTrip/100,0.5,1));
    const dynBuy=buildDynamicBuy(profiles.spot,meta,{
      gridFeeBase:I.gridFeeBase, otherFixed:I.otherFixed, modul3:I.modul3,
      ntRed:I.ntRed, htSur:I.htSur, ntStart:I.ntStart, ntEnd:I.ntEnd,
      htStart:I.htStart, htEnd:I.htEnd, activeQuarters:(QSET[I.quarters]||QSET.q23),
    });
    const base={chargeP:I.chargeP,dischargeP:I.dischargeP,effC:eff,effD:eff,sell:I.feedIn/100,traceDays:[]};
    const rows=SIZES.map(kwh=>{
      const sim=simulate(profiles,{...base,pvScale:1,cap:kwh,buy:dynBuy,
        arbitrage:kwh>0&&I.arbitrage, rebate:kwh>0&&I.modul1?I.rebate:0});
      const stInv=(I.storageIsNew?kwh*I.costPerKwh:0);
      const inv0=stInv+pvInvest;
      const fund=Math.min(inv0, I.funding+inv0*I.fundingPct/100);
      const inv=Math.max(0,inv0-fund);
      const savY1=refCost-sim.cost-opexYear;
      const valid = inv>0 && savY1>0;
      let npv=-inv, cum=-inv, prev=-inv, payback=Infinity;
      for(let n=1;n<=I.horizon;n++){
        const sv=savings(savY1,n,I.esc/100,I.battDeg/100,I.pvDeg/100);
        npv+=sv/Math.pow(1+I.disc/100,n);
        cum+=sv; if(valid && payback===Infinity && cum>=0){ payback=(n-1)+(0-prev)/(cum-prev); } prev=cum;
      }
      return {kwh, npv:Math.round(npv), savY1:Math.round(savY1),
        payback, amort: (valid&&isFinite(payback))? +payback.toFixed(1): null, autarkie:sim.autarkie};
    });
    let best=rows[0]; rows.forEach(r=>{ if(r.npv>best.npv) best=r; });
    return {rows, best};
  },[profiles,meta,I.roundTrip,I.gridFeeBase,I.otherFixed,I.modul3,I.ntRed,I.htSur,
     I.ntStart,I.ntEnd,I.htStart,I.htEnd,I.quarters,I.feedIn,I.storageIsNew,pvInvest,
     I.chargeP,I.dischargeP,I.modul1,I.rebate,I.arbitrage,I.costPerKwh,I.horizon,I.esc,I.disc,I.battDeg,I.pvDeg,
     refCost,opexYear,I.funding,I.fundingPct]);

  const S=sims[target], E=eco[target];
  const monthData=S.monthly.map((m,i)=>({monat:MONTHS[i],...m,
    netz:+m.netz.toFixed(0), pvDirekt:+m.pvDirekt.toFixed(0),
    battLast:+m.battLast.toFixed(0), einsp:+m.einsp.toFixed(0)}));
  const cashData=eco.S4.series.map((p,i)=>({jahr:p.jahr, S4:p.cum, S3:eco.S3.series[i].cum}));
  const sweepData=sweep.rows.map(r=>({
    size:r.kwh, npv:r.npv, amort:r.amort,
    isBest:r.kwh===sweep.best.kwh, isCurrent:r.kwh===Math.round(I.capacity),
  }));

  /* ---- Lastprofil-Tagesansicht (Werktags-Mittel, kW) ---- */
  const dayProfile=useMemo(()=>{
    const L=new Float64Array(STEPS_PER_DAY), P=new Float64Array(STEPS_PER_DAY);
    let nWd=0;
    for(let d=0; d<DAYS; d++){
      if(meta.weekend[d]) continue; nWd++;
      const b=d*STEPS_PER_DAY;
      for(let k=0;k<STEPS_PER_DAY;k++){ L[k]+=profiles.load[b+k]; P[k]+=profiles.pv[b+k]; }
    }
    const out=[];
    for(let k=0;k<STEPS_PER_DAY;k++){
      out.push({ h:k*DT, hl:fmtHour(k*DT),
        last:+(L[k]/Math.max(1,nWd)/DT).toFixed(3),
        pv:+(P[k]/Math.max(1,nWd)/DT).toFixed(3) });
    }
    return out;
  },[profiles,meta]);

  /* ---- Wertbeitrag-Zerlegung (Jahresersparnis ggü. Referenz) ---- */
  const decomp=useMemo(()=>{
    const reb=(I.capacity>0&&I.modul1?I.rebate:0);
    const pvEffect = I.pvIsNew ? (sims.S0.cost - sims.S1.cost) : 0;  // nur bei Neuinvestition
    const speicher = sims.S1.cost - sims.S2.cost;                    // Eigenverbrauch durch Speicher
    const dynTarif = sims.S2.cost - sims.S3.cost;                    // dyn. Tarif inkl. §14a Modul 3
    const modul1   = reb;                                            // §14a Modul 1 Pauschale (=S3−S4)
    const total    = refCost - sims.S4.cost;
    return {pvEffect,speicher,dynTarif,modul1,total};
  },[sims,I.capacity,I.modul1,I.rebate,I.pvIsNew,refCost]);

  const waterfall=useMemo(()=>{
    const steps=[];
    if(I.pvIsNew) steps.push({name:"PV-Strom", delta:decomp.pvEffect});
    steps.push({name:"Speicher", delta:decomp.speicher});
    steps.push({name:"Dyn. Tarif", delta:decomp.dynTarif});
    steps.push({name:"§14a M1", delta:decomp.modul1});
    let run=0; const rows=[];
    for(const s of steps){
      const lower=Math.min(run,run+s.delta);
      rows.push({name:s.name, base:lower, val:Math.abs(s.delta), delta:s.delta,
        fill:s.delta>=0?COLORS.battery:COLORS.neg});
      run+=s.delta;
    }
    rows.push({name:"Gesamt", base:Math.min(0,decomp.total), val:Math.abs(decomp.total),
      delta:decomp.total, fill:COLORS.ink, total:true});
    return rows;
  },[decomp,I.pvIsNew]);

  /* ---- UI-State ---- */
  const [showAdv,setShowAdv]=useState(false);
  const [showDetails,setShowDetails]=useState(false);
  const [showLoad,setShowLoad]=useState(true);

  /* ---- abgeleitete Anzeige-Werte ---- */
  const ok = E.npv>0 && isFinite(E.payback) && E.payback<=I.horizon;
  const today = sims[refKey].netzGesamt;       // Netzbezug Referenz
  const withSys = S.netzGesamt;                // Netzbezug Zielsystem
  const cut = today>0 ? (1-withSys/today) : 0;
  const netzBase = Math.max(today, withSys, 1);
  const inactive = LOAD_CATALOG.filter(d=>!I.loadComponents.some(c=>c.id===d.id && c.enabled));

  /* ---- Energiefluss-Bänder ---- */
  const flow = useMemo(()=>{
    const maxTot=Math.max(S.totalPV, S.totalLoad, 1);
    const H=190, scale=H/maxTot, x0=92, x1=296, x2=320, x3=520, top=24;
    const big = (v)=>v*scale;
    const eps = maxTot*0.004;
    let pvY=top, netzY=top+big(S.totalPV)+26;
    const pvH=big(S.totalPV), netzTot=S.gridToLoad+S.netzladung, netzH=big(netzTot);
    let verbY=top, einsY=top+big(S.totalLoad)+26;
    const verbH=big(S.totalLoad), einsH=big(S.feedIn);
    const battThru=Math.max(S.pvToBatt+S.netzladung, S.battDis);
    const battH=big(battThru); const battY=top+ (H-battH)/2;
    let pvo=pvY, netzo=netzY, verbi=verbY, einsi=einsY, batti=battY, batto=battY;
    const bands=[];
    const add=(x1c,y1c,x2c,y2c,v,color)=>{ if(v>eps) bands.push({x1:x1c,y1:y1c+big(v)/2,x2:x2c,y2:y2c+big(v)/2,w:big(v),color}); };
    add(x0,pvo, x3,verbi, S.pvDirect, COLORS.solar); pvo+=big(S.pvDirect); verbi+=big(S.pvDirect);
    add(x0,pvo, x1,batti, S.pvToBatt, COLORS.solar); pvo+=big(S.pvToBatt); batti+=big(S.pvToBatt);
    add(x0,pvo, x3,einsi, S.feedIn, COLORS.exp); pvo+=big(S.feedIn); einsi+=big(S.feedIn);
    add(x2,batto, x3,verbi, S.battDis, COLORS.green); batto+=big(S.battDis); verbi+=big(S.battDis);
    add(x0,netzo, x1,batti, S.netzladung, COLORS.grid); netzo+=big(S.netzladung); batti+=big(S.netzladung);
    add(x0,netzo, x3,verbi, S.gridToLoad, COLORS.grid); netzo+=big(S.gridToLoad); verbi+=big(S.gridToLoad);
    return {bands, nodes:{
      pv:{x:52,y:pvY,h:pvH,label:"PV-Anlage",val:S.totalPV,c:COLORS.solar},
      netz:{x:52,y:netzY,h:netzH,label:"Netzbezug",val:netzTot,c:COLORS.grid},
      batt:{x:x1,y:battY,h:battH,label:"Speicher",val:S.battDis,c:COLORS.green,show:battThru>eps},
      verb:{x:x3,y:verbY,h:verbH,label:"Verbrauch",val:S.totalLoad,c:COLORS.ink},
      eins:{x:x3,y:einsY,h:einsH,label:"Einspeisung",val:S.feedIn,c:COLORS.exp,show:einsH>2},
    }};
  },[S]);

  const monthSimple=monthData.map(m=>({
    monat:m.monat, eigen:Math.round(m.pvDirekt+m.battLast), netz:Math.round(m.netz),
  }));

  const css=`
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap');
  .pvx{ --ink:${COLORS.ink}; --ink2:${COLORS.ink2}; --ink3:${COLORS.ink3}; --paper:${COLORS.paper};
    --surface:${COLORS.surface}; --surface2:${COLORS.surface2}; --line:${COLORS.line}; --lineS:${COLORS.lineStrong};
    --solar:${COLORS.solar}; --green:${COLORS.green}; --imp:${COLORS.imp};
    font-family:'Manrope',-apple-system,BlinkMacSystemFont,sans-serif; color:var(--ink);
    background:var(--paper); min-height:100vh; line-height:1.55; -webkit-font-smoothing:antialiased; letter-spacing:-.005em; }
  .pvx *{ box-sizing:border-box; }
  .pvx .mono{ font-family:'Geist Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }

  .pvx .topbar{ position:sticky; top:0; z-index:30; backdrop-filter:saturate(1.2) blur(10px);
    background:${COLORS.paper}d9; border-bottom:1px solid var(--line); }
  .pvx .topbar-in{ max-width:1080px; margin:0 auto; padding:13px 22px; display:flex; align-items:center;
    justify-content:space-between; gap:16px; }
  .pvx .brand{ display:flex; align-items:center; gap:10px; font-weight:700; font-size:15px; letter-spacing:-.01em; }
  .pvx .brand .logo{ width:30px; height:30px; border-radius:9px; background:var(--ink); color:#fff;
    display:flex; align-items:center; justify-content:center; }
  .pvx .brand small{ display:block; font-weight:500; font-size:11px; color:var(--ink2); letter-spacing:0; }
  .pvx .verdict{ display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:999px;
    font-size:13px; font-weight:700; border:1px solid transparent; }
  .pvx .verdict.ok{ background:${COLORS.greenSoft}; color:#0a6e4d; border-color:${COLORS.green}33; }
  .pvx .verdict.no{ background:${COLORS.impSoft}; color:#9a3520; border-color:${COLORS.imp}33; }

  .pvx .wrap{ max-width:1080px; margin:0 auto; padding:30px 22px 70px; }

  .pvx .inputs{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:18px 20px;
    margin-bottom:30px; box-shadow:0 1px 2px #0000000a; }
  .pvx .inputs-h{ display:flex; align-items:center; gap:9px; font-weight:700; font-size:14px; margin-bottom:4px; }
  .pvx .inputs-h svg{ color:var(--ink2); }
  .pvx .pgrid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px 22px; margin-top:12px; }
  .pvx .fld-top{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
  .pvx .fld label{ font-size:12.5px; color:var(--ink); font-weight:600; }
  .pvx .fld .unit{ font-size:11px; color:var(--ink3); }
  .pvx .inrow{ display:flex; align-items:center; gap:10px; margin-top:7px; }
  .pvx input[type=number]{ width:100%; max-width:120px; font-family:'Geist Mono',monospace; font-variant-numeric:tabular-nums;
    font-size:14px; text-align:right; border:1px solid var(--line); border-radius:10px; padding:8px 10px;
    background:var(--surface); color:var(--ink); transition:.15s; }
  .pvx input[type=number]:focus{ outline:none; border-color:var(--solar); box-shadow:0 0 0 3px ${COLORS.solar}1f; }
  .pvx input[type=range]{ flex:1; accent-color:var(--solar); height:5px; }
  .pvx .hint{ font-size:11.5px; color:var(--ink2); margin-top:6px; line-height:1.45; }
  .pvx .hint.src{ font-style:italic; }
  .pvx .hint.warn{ color:var(--imp); } .pvx .hint.ok{ color:var(--green); }
  .pvx .hint b{ color:var(--ink); font-weight:600; }
  .pvx select.sel{ width:100%; margin-top:7px; font-family:inherit; font-size:13px; font-weight:500;
    border:1px solid var(--line); border-radius:10px; padding:9px 11px; background:var(--surface); color:var(--ink); cursor:pointer; }
  .pvx select.sel:focus{ outline:none; border-color:var(--solar); box-shadow:0 0 0 3px ${COLORS.solar}1f; }
  .pvx .win input[type=number]{ max-width:74px; }
  .pvx .tog{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; }
  .pvx .switch{ position:relative; width:42px; height:24px; border-radius:999px; background:var(--lineS);
    cursor:pointer; transition:.18s; flex:none; }
  .pvx .switch.sm{ width:34px; height:20px; }
  .pvx .switch.on{ background:var(--green); }
  .pvx .knob{ position:absolute; top:2.5px; left:2.5px; width:19px; height:19px; border-radius:50%; background:#fff;
    transition:.18s; box-shadow:0 1px 3px #0003; }
  .pvx .switch.sm .knob{ width:15px; height:15px; }
  .pvx .switch.on .knob{ left:20.5px; }
  .pvx .switch.sm.on .knob{ left:16.5px; }
  .pvx .adv-btn{ display:inline-flex; align-items:center; gap:7px; margin-top:16px; padding:9px 14px; cursor:pointer;
    border:1px solid var(--line); background:var(--surface2); border-radius:10px; font-family:inherit; font-size:13px;
    font-weight:600; color:var(--ink); transition:.15s; }
  .pvx .adv-btn:hover{ border-color:var(--lineS); }
  .pvx .adv-btn svg{ transition:.2s; } .pvx .adv-btn.open svg.chev{ transform:rotate(180deg); }
  .pvx .adv{ margin-top:16px; padding-top:16px; border-top:1px dashed var(--line); }
  .pvx .adv-grp{ font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--ink3);
    margin:14px 0 2px; }

  /* Segment-Chip */
  .pvx .seg-chip{ display:inline-flex; align-items:center; gap:7px; background:var(--ink); color:#fff;
    border-radius:999px; padding:5px 13px; font-size:12px; font-weight:600; }
  .pvx .seg-chip svg{ opacity:.8; }

  /* Presets */
  .pvx .presets{ display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  .pvx .preset{ font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer; padding:7px 13px;
    border-radius:999px; border:1px solid var(--line); background:var(--surface2); color:var(--ink); transition:.15s; }
  .pvx .preset:hover{ border-color:var(--solar); color:#9a5a06; }

  /* Lastprofil-Builder */
  .pvx .loadbox{ margin-top:14px; padding-top:14px; border-top:1px dashed var(--line); }
  .pvx .comp{ border:1px solid var(--line); border-radius:12px; padding:10px 12px; margin-top:8px; background:var(--surface); }
  .pvx .comp-head{ display:flex; align-items:center; gap:10px; }
  .pvx .comp-name{ font-size:13px; font-weight:600; flex:1; }
  .pvx .comp-kwh{ font-size:12px; color:var(--ink2); }
  .pvx .comp-x{ border:none; background:none; color:var(--ink3); cursor:pointer; padding:3px; border-radius:6px; display:flex; }
  .pvx .comp-x:hover{ background:var(--surface2); color:var(--imp); }
  .pvx .comp-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px 12px; margin-top:10px; }
  .pvx .comp-grid label{ font-size:11px; color:var(--ink2); font-weight:600; display:flex; flex-direction:column; gap:4px; }
  .pvx .comp-grid input,.pvx .comp-grid select{ font-family:'Geist Mono',monospace; font-size:12.5px; text-align:right;
    border:1px solid var(--line); border-radius:8px; padding:6px 8px; background:var(--surface); color:var(--ink); }
  .pvx .comp-grid select{ text-align:left; font-family:inherit; }
  .pvx .addrow{ display:flex; align-items:center; gap:8px; margin-top:10px; flex-wrap:wrap; }
  .pvx .addrow select{ font-family:inherit; font-size:12.5px; border:1px solid var(--line); border-radius:8px;
    padding:7px 9px; background:var(--surface); color:var(--ink); cursor:pointer; }
  .pvx .mode-seg{ display:inline-flex; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin-top:7px; }
  .pvx .mode-seg button{ font-family:inherit; font-size:12.5px; font-weight:600; padding:8px 12px; border:none;
    background:var(--surface); color:var(--ink2); cursor:pointer; }
  .pvx .mode-seg button.on{ background:var(--ink); color:#fff; }

  .pvx .hero{ display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:14px; }
  @media(max-width:920px){ .pvx .hero{ grid-template-columns:repeat(2,1fr); } }
  .pvx .kpi{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:18px 18px 17px;
    box-shadow:0 1px 2px #0000000a; opacity:0; transform:translateY(8px); animation:rise .5s cubic-bezier(.2,.7,.3,1) forwards; }
  .pvx .kpi:nth-child(2){ animation-delay:.05s; } .pvx .kpi:nth-child(3){ animation-delay:.1s; }
  .pvx .kpi:nth-child(4){ animation-delay:.15s; } .pvx .kpi:nth-child(5){ animation-delay:.2s; }
  @keyframes rise{ to{ opacity:1; transform:none; } }
  .pvx .kpi.feature{ background:var(--ink); border-color:var(--ink); }
  .pvx .kpi .k-ic{ width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center;
    background:var(--surface2); color:var(--ink); margin-bottom:13px; }
  .pvx .kpi.feature .k-ic{ background:#ffffff1a; color:#fff; }
  .pvx .kpi .k-lab{ font-size:12px; color:var(--ink2); font-weight:600; }
  .pvx .kpi.feature .k-lab{ color:#ffffffb0; }
  .pvx .kpi .k-val{ font-family:'Geist Mono',monospace; font-variant-numeric:tabular-nums; font-size:26px;
    font-weight:600; margin-top:5px; letter-spacing:-.02em; line-height:1.1; }
  .pvx .kpi.feature .k-val{ color:#fff; }
  .pvx .kpi .k-val.green{ color:var(--green); } .pvx .kpi .k-val.solar{ color:var(--solar); }
  .pvx .kpi .k-sub{ font-size:11.5px; color:var(--ink3); margin-top:5px; }
  .pvx .kpi.feature .k-sub{ color:#ffffff80; }

  .pvx section.story{ margin-top:38px; }
  .pvx .eyebrow{ display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  .pvx .step{ font-family:'Geist Mono',monospace; font-size:11px; font-weight:600; color:var(--solar);
    border:1px solid ${COLORS.solar}44; background:${COLORS.solarSoft}; border-radius:7px; padding:2px 8px; letter-spacing:.02em; }
  .pvx .eyebrow .ey-t{ font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink3); }
  .pvx h2.title{ font-size:23px; font-weight:800; margin:0 0 16px; letter-spacing:-.02em; line-height:1.15; }
  @media(max-width:620px){ .pvx h2.title{ font-size:20px; } }

  .pvx .card{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:22px;
    box-shadow:0 1px 2px #0000000a; }
  .pvx .card.tight{ padding:18px; }
  .pvx .chartbox{ width:100%; }

  .pvx .ba{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media(max-width:680px){ .pvx .ba{ grid-template-columns:1fr; } }
  .pvx .ba-card{ border:1px solid var(--line); border-radius:14px; padding:18px; }
  .pvx .ba-card.now{ background:var(--surface2); }
  .pvx .ba-card.goal{ background:${COLORS.greenSoft}66; border-color:${COLORS.green}44; }
  .pvx .ba-lab{ font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); }
  .pvx .ba-val{ font-family:'Geist Mono',monospace; font-size:30px; font-weight:600; letter-spacing:-.02em; margin:6px 0 2px; }
  .pvx .ba-unit{ font-size:13px; color:var(--ink2); font-weight:500; }
  .pvx .ba-bar{ height:10px; border-radius:999px; background:var(--line); margin-top:14px; overflow:hidden; }
  .pvx .ba-fill{ height:100%; border-radius:999px; transition:width .8s cubic-bezier(.2,.7,.3,1); }
  .pvx .ba-mid{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; }
  .pvx .ring-cut{ font-family:'Geist Mono',monospace; font-size:34px; font-weight:600; color:var(--green); letter-spacing:-.02em; }

  .pvx .legend{ display:flex; gap:16px; flex-wrap:wrap; font-size:12.5px; color:var(--ink2); margin-top:14px; }
  .pvx .legend span{ display:inline-flex; gap:7px; align-items:center; }
  .pvx .dot{ width:11px; height:11px; border-radius:4px; }

  .pvx .insight{ display:flex; gap:13px; background:var(--surface2); border:1px solid var(--line);
    border-radius:14px; padding:15px 17px; margin-top:16px; }
  .pvx .insight svg{ color:var(--green); flex:none; margin-top:1px; }
  .pvx .insight b{ color:var(--ink); font-weight:700; }

  .pvx .badge-rec{ display:inline-flex; align-items:center; gap:7px; background:${COLORS.solarSoft};
    color:#9a5a06; border:1px solid ${COLORS.solar}55; border-radius:999px; padding:6px 13px; font-size:13px; font-weight:700; }

  .pvx .det-btn{ width:100%; display:flex; align-items:center; justify-content:space-between; cursor:pointer;
    background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px 18px; font-family:inherit;
    font-size:15px; font-weight:700; color:var(--ink); }
  .pvx .det-btn svg.chev{ transition:.2s; } .pvx .det-btn.open svg.chev{ transform:rotate(180deg); }
  .pvx table{ width:100%; border-collapse:collapse; font-size:13px; margin-top:4px; }
  .pvx th,.pvx td{ padding:11px 10px; text-align:right; border-bottom:1px solid var(--line); }
  .pvx th:first-child,.pvx td:first-child{ text-align:left; }
  .pvx th{ font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink3); font-weight:700; }
  .pvx td.num{ font-family:'Geist Mono',monospace; font-variant-numeric:tabular-nums; }
  .pvx tr.hl{ background:var(--surface2); } .pvx tr.sel td{ background:${COLORS.greenSoft}55; }
  .pvx tr.sel td:first-child{ font-weight:700; }
  .pvx .tag{ font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:5px; margin-left:7px; vertical-align:middle; }
  .pvx .tag.now{ background:var(--ink); color:#fff; } .pvx .tag.goal{ background:var(--green); color:#fff; }
  .pvx .dl{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px 18px; margin-top:6px; }
  .pvx .dl .di{ display:flex; justify-content:space-between; gap:10px; font-size:13px; padding:7px 0; border-bottom:1px solid var(--line); }
  .pvx .dl .di .dk{ color:var(--ink2); } .pvx .dl .di .dv{ font-family:'Geist Mono',monospace; font-weight:600; }
  .pvx .foot{ font-size:11.5px; color:var(--ink3); margin-top:30px; padding-top:18px; border-top:1px solid var(--line); line-height:1.6; }
  .pvx .foot b{ color:var(--ink2); }
  `;

  const tip={ background:COLORS.surface, border:`1px solid ${COLORS.line}`, borderRadius:12,
    fontSize:12, fontFamily:"'Geist Mono',monospace", boxShadow:"0 4px 16px #0000001a", padding:"8px 11px" };

  const sourceObj = NETZE[I.netz];
  const seg = segLabel(I.segment);

  return (
    <div className="pvx">
      <style>{css}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="logo"><Sun size={17}/></span>
            <span>PV-/Speicher-Analyse<small>Wirtschaftlichkeit · {seg}</small></span>
          </div>
          <div className={"verdict "+(ok?"ok":"no")}>
            {ok? <Check size={16}/> : <Info size={16}/>}
            {ok? "Wirtschaftlich sinnvoll" : "Wirtschaftlich grenzwertig"}
          </div>
        </div>
      </div>

      <div className="wrap">

        {/* EINGABEN */}
        <div className="inputs">
          <div className="inputs-h"><Sliders size={16}/> Eingaben
            <span style={{marginLeft:"auto"}} className="seg-chip"><Building2 size={13}/>{seg}</span>
          </div>

          {/* Presets */}
          <div className="presets">
            {Object.keys(PRESETS).map(k=>(
              <button key={k} className="preset" onClick={()=>applyPreset(k)}>{PRESETS[k].label}</button>
            ))}
          </div>

          <div className="pgrid" style={{marginTop:14}}>
            <Select label="Kundensegment" unit="Profil" value={I.segment} set={applySegment}
              options={SEGMENTS.map(s=>({value:s.id,label:s.label}))}/>
            <div className="fld">
              <div className="fld-top"><label>Netzbetreiber</label><span className="unit">§14a-Profil</span></div>
              <select className="sel" value={I.netz} onChange={e=>applyNetz(e.target.value)}>
                {Object.keys(NETZE).map(k=><option key={k} value={k}>{NETZE[k].label}</option>)}
              </select>
            </div>
            <Field label="PV-Leistung" unit="kWp" step={1} min={0} max={500} value={I.pvKwp} set={up("pvKwp")}
              hint={I.pvIsNew?"Neuinvestition – fließt in die Wirtschaftlichkeit ein":"Bestand – ohne Investitionsanrechnung"}/>
            <Field label="Speicherkapazität" unit="kWh" step={1} min={0} max={50} slider value={I.capacity} set={up("capacity")}/>
          </div>

          {/* LASTPROFIL-BUILDER */}
          <div className="loadbox">
            <div className="inputs-h" style={{cursor:"pointer"}} onClick={()=>setShowLoad(!showLoad)}>
              <Gauge size={15}/> Lastprofil
              <span className="mono" style={{marginLeft:8,fontWeight:500,fontSize:12,color:COLORS.ink2}}>
                {nf(loadBuilt.annual)} kWh/a berechnet</span>
              <ChevronDown className="chev" size={15} style={{marginLeft:"auto",transition:".2s",transform:showLoad?"rotate(180deg)":"none"}}/>
            </div>
            {showLoad && (<>
              <div className="pgrid" style={{marginTop:10}}>
                <div className="fld">
                  <div className="fld-top"><label>Lastprofil-Modus</label></div>
                  <div className="mode-seg">
                    <button className={I.loadMode==="scale"?"on":""} onClick={()=>up("loadMode")("scale")}>Jahresverbrauch skalieren</button>
                    <button className={I.loadMode==="sum"?"on":""} onClick={()=>up("loadMode")("sum")}>Komponenten summieren</button>
                  </div>
                </div>
                {I.loadMode==="scale"
                  ? <Field label="Jahresverbrauch" unit="kWh" step={500} min={500} max={1000000} value={I.consumption} set={up("consumption")}
                      hint="Die Komponenten bestimmen nur die zeitliche Verteilung."/>
                  : <div className="fld">
                      <div className="fld-top"><label>Jahresverbrauch (Summe)</label><span className="unit">kWh</span></div>
                      <div className="inrow"><input type="number" readOnly value={Math.round(loadBuilt.annual)}/></div>
                      <div className="hint">Ergibt sich aus der Summe der aktiven Komponenten.</div>
                    </div>}
              </div>

              {I.loadComponents.filter(c=>c.enabled).map((c)=>{
                const idx=I.loadComponents.findIndex(x=>x.id===c.id);
                return <CompRow key={c.id} c={c} idx={idx} mode={I.loadMode} upc={upc} remove={removeComp}/>;
              })}

              <div className="addrow">
                <Plus size={14} color={COLORS.ink2}/>
                <select defaultValue="" onChange={e=>{ if(e.target.value){ addComp(e.target.value); e.target.value=""; } }}>
                  <option value="">Lastkomponente hinzufügen …</option>
                  {inactive.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </>)}
          </div>

          {/* Grund-Preise */}
          <div className="pgrid" style={{marginTop:14}}>
            <Field label="Strompreis netto (heute)" unit="ct/kWh" step={0.1} min={10} max={60} value={I.arbeitspreis} set={up("arbeitspreis")}
              hint="Aktueller Arbeitspreis ohne dyn. Tarif"/>
            <Field label="Einspeisevergütung" unit="ct/kWh" step={0.1} min={0} max={20} value={I.feedIn} set={up("feedIn")}/>
          </div>

          {/* erweiterte Eingaben */}
          <div className={"adv-btn"+(showAdv?" open":"")} onClick={()=>setShowAdv(!showAdv)}>
            <Sliders size={14}/> {showAdv?"Annahmen ausblenden":"PV, Speicher, Tarif & Wirtschaftlichkeit anzeigen"}
            <ChevronDown className="chev" size={15}/>
          </div>

          {showAdv && (
            <div className="adv">
              <div className="adv-grp">PV-Anlage</div>
              <div className="pgrid">
                <Field label="Spezifischer Ertrag" unit="kWh/kWp/a" step={10} min={600} max={1300} value={I.yieldK} set={up("yieldK")}
                  hint={`Effektiv inkl. Ausrichtung/Neigung/Region: ${nf(effYield*(ORIENT[I.pvOrient]?.f??1))} kWh/kWp`}/>
                <Select label="Ausrichtung" value={I.pvOrient} set={up("pvOrient")}
                  options={Object.keys(ORIENT).map(k=>({value:k,label:ORIENT[k].label}))}/>
                <Field label="Dachneigung" unit="Grad" step={1} min={0} max={90} value={I.pvTilt} set={up("pvTilt")}
                  hint={`Neigungsfaktor ${nf(tiltFactor(I.pvTilt),2)} (Optimum ~32°)`}/>
                <Select label="Region" value={I.pvRegion} set={up("pvRegion")}
                  options={Object.keys(REGIONS).map(k=>({value:k,label:REGIONS[k].label}))}/>
                <Field label="PV-Investitionskosten" unit="€/kWp" step={50} min={0} max={3000} value={I.pvCostPerKwp} set={up("pvCostPerKwp")}/>
                <Field label="PV-Betriebskosten" unit="%/a Invest" step={0.1} min={0} max={5} value={I.pvOpexPct} set={up("pvOpexPct")}/>
              </div>
              <div className="pgrid">
                <Tog label="PV ist Neuinvestition" hint={I.pvIsNew?"PV fließt in Invest & Referenz S0":"PV ist Bestand (versunkene Kosten)"} value={I.pvIsNew} set={up("pvIsNew")}/>
                <Tog label="Speicher ist Neuinvestition" hint="Speicherkosten in Wirtschaftlichkeit" value={I.storageIsNew} set={up("storageIsNew")}/>
              </div>

              <div className="adv-grp">Speicher &amp; Effizienz</div>
              <div className="pgrid">
                <Field label="Speicherpreis" unit="€/kWh" step={10} min={100} max={800} value={I.costPerKwh} set={up("costPerKwh")}/>
                <Field label="Lade-/Entladeleistung" unit="kW" step={1} min={1} max={50} value={I.chargeP} set={(v)=>setI(s=>({...s,chargeP:v,dischargeP:v}))}/>
                <Field label="Round-Trip-Wirkungsgrad" unit="%" step={1} min={50} max={100} value={I.roundTrip} set={up("roundTrip")}/>
                <Field label="Speicher-Betriebskosten" unit="%/a Invest" step={0.1} min={0} max={5} value={I.battOpexPct} set={up("battOpexPct")}/>
              </div>

              <div className="adv-grp">Förderung &amp; Restwert</div>
              <div className="pgrid">
                <Field label="Förderbetrag" unit="€" step={100} min={0} max={500000} value={I.funding} set={up("funding")}/>
                <Field label="Förderung" unit="% v. Invest" step={1} min={0} max={100} value={I.fundingPct} set={up("fundingPct")}/>
                <Field label="Restwert (Ende)" unit="€" step={100} min={0} max={500000} value={I.residual} set={up("residual")}/>
                <Field label="Zus. Wartung" unit="€/Jahr" step={50} min={0} max={50000} value={I.maintenance} set={up("maintenance")}/>
              </div>

              <div className="adv-grp">Preise &amp; Tarif</div>
              <div className="pgrid">
                <Field label="Ø Spotpreis" unit="ct/kWh" step={0.1} min={0} max={30} value={I.avgSpot} set={up("avgSpot")}
                  hint="Day-Ahead-Jahresmittel (für synthet. Spotprofil)"/>
                <Field label="Netzentgelt-Arbeitspreis (ST)" unit="ct/kWh" step={0.1} min={0} max={20} value={I.gridFeeBase} set={up("gridFeeBase")}
                  hint={sourceObj&&sourceObj.note?sourceObj.note:"Standardtarif-Anteil im Netzentgelt"} hintCls={sourceObj&&sourceObj.src?"src":""}/>
                <Field label="Weitere Festbestandteile" unit="ct/kWh" step={0.1} min={0} max={30} value={I.otherFixed} set={up("otherFixed")}
                  hint="Steuern, Umlagen, Konzession, Messung etc."/>
              </div>
              <div className="win">
                <div className="adv-grp">§14a EnWG · Modul 3 (zeitvariables Netzentgelt)</div>
                <div className="pgrid">
                  <Tog label="Modul 3 aktiv" hint="Zeitvariables Netzentgelt nutzen" value={I.modul3} set={up("modul3")}/>
                  <Tog label="Modul 1 Pauschale" hint="Jährliche Netzentgelt-Pauschale (nur mit Speicher)" value={I.modul1} set={up("modul1")}/>
                  <Field label="NT-Reduktion" unit="ct/kWh" step={0.01} min={0} max={20} value={I.ntRed} set={up("ntRed")}/>
                  <Field label="HT-Zuschlag" unit="ct/kWh" step={0.01} min={0} max={20} value={I.htSur} set={up("htSur")}/>
                  <Field label="NT-Fenster Start" unit="Uhr" step={1} min={0} max={23} value={I.ntStart} set={up("ntStart")}/>
                  <Field label="NT-Fenster Ende" unit="Uhr" step={1} min={0} max={23} value={I.ntEnd} set={up("ntEnd")}/>
                  <Field label="HT-Fenster Start" unit="Uhr" step={1} min={0} max={23} value={I.htStart} set={up("htStart")}/>
                  <Field label="HT-Fenster Ende" unit="Uhr" step={1} min={0} max={23} value={I.htEnd} set={up("htEnd")}/>
                </div>
                <div className="adv-grp">Wirtschaftlichkeit</div>
                <div className="pgrid">
                  <Field label="Betrachtungshorizont" unit="Jahre" step={1} min={5} max={30} value={I.horizon} set={up("horizon")}/>
                  <Field label="Strompreissteigerung" unit="%/Jahr" step={0.1} min={0} max={10} value={I.esc} set={up("esc")}/>
                  <Field label="Diskontsatz" unit="%/Jahr" step={0.1} min={0} max={10} value={I.disc} set={up("disc")}/>
                  <Field label="Speicherdegradation" unit="%/Jahr" step={0.1} min={0} max={5} value={I.battDeg} set={up("battDeg")}/>
                  <Field label="PV-Degradation" unit="%/Jahr" step={0.1} min={0} max={3} value={I.pvDeg} set={up("pvDeg")}/>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* HERO KPIS */}
        <div className="hero">
          <div className="kpi feature">
            <div className="k-ic"><Wallet size={17}/></div>
            <div className="k-lab">Jahresersparnis</div>
            <div className="k-val">{eur(E.savY1)}</div>
            <div className="k-sub">{target} ggü. {I.pvIsNew?"Nur Netz":"PV ohne Speicher"}</div>
          </div>
          <div className="kpi">
            <div className="k-ic"><Gauge size={17}/></div>
            <div className="k-lab">Autarkie</div>
            <div className="k-val green">{pct(S.autarkie)}</div>
            <div className="k-sub">Eigenversorgung</div>
          </div>
          <div className="kpi">
            <div className="k-ic"><Leaf size={17}/></div>
            <div className="k-lab">Eigenverbrauch</div>
            <div className="k-val solar">{pct(S.evq)}</div>
            <div className="k-sub">der PV-Erzeugung</div>
          </div>
          <div className="kpi">
            <div className="k-ic"><TrendingUp size={17}/></div>
            <div className="k-lab">Amortisation</div>
            <div className="k-val">{isFinite(E.payback)?nf(E.payback,1)+" J":"—"}</div>
            <div className="k-sub">{isFinite(E.payback)?"bis Break-even":"nicht im Horizont"}</div>
          </div>
          <div className="kpi">
            <div className="k-ic"><Sparkles size={17}/></div>
            <div className="k-lab">NPV ({I.horizon} J)</div>
            <div className="k-val">{eur(E.npv)}</div>
            <div className="k-sub">Kapitalwert</div>
          </div>
        </div>

        {/* STORY A */}
        <section className="story">
          <div className="eyebrow"><span className="step">A</span><span className="ey-t">Unabhängigkeit</span></div>
          <h2 className="title">So unabhängig wird der Standort</h2>
          <div className="card">
            <div className="ba">
              <div className="ba-card now">
                <div className="ba-lab">Referenz · Netz</div>
                <div className="ba-val">{nf(today)}</div>
                <div className="ba-unit">kWh Netzbezug / Jahr</div>
                <div className="ba-bar"><div className="ba-fill" style={{width:"100%",background:COLORS.grid}}/></div>
              </div>
              <div className="ba-mid">
                <div className="ring-cut">−{pct(cut)}</div>
                <ArrowRight size={20} color={COLORS.ink3}/>
                <div className="ba-unit">weniger Netzstrom</div>
              </div>
              <div className="ba-card goal">
                <div className="ba-lab">Mit {target}</div>
                <div className="ba-val" style={{color:COLORS.green}}>{nf(withSys)}</div>
                <div className="ba-unit">kWh Netzbezug / Jahr</div>
                <div className="ba-bar"><div className="ba-fill" style={{width:(netzBase>0?(withSys/netzBase*100):0)+"%",background:COLORS.green}}/></div>
              </div>
            </div>
            <div className="insight">
              <Info size={17}/>
              <div>Verglichen wird gegen die <b>{refLabel}</b>. Mit Zielsystem <b>{target}</b> sinkt der Netzbezug um <b>{pct(cut)}</b> – von {nf(today)} auf {nf(withSys)} kWh/Jahr.</div>
            </div>
          </div>
        </section>

        {/* STORY A2 – LASTPROFIL-TAGESANSICHT */}
        <section className="story">
          <div className="eyebrow"><span className="step">A2</span><span className="ey-t">Lastprofil</span></div>
          <h2 className="title">Last &amp; Erzeugung im Tagesverlauf</h2>
          <div className="card">
            <div className="chartbox">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dayProfile} margin={{top:10,right:18,left:6,bottom:4}}>
                  <defs>
                    <linearGradient id="gLast" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.load} stopOpacity={0.35}/>
                      <stop offset="100%" stopColor={COLORS.load} stopOpacity={0.04}/>
                    </linearGradient>
                    <linearGradient id="gPv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.solar} stopOpacity={0.4}/>
                      <stop offset="100%" stopColor={COLORS.solar} stopOpacity={0.04}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false}/>
                  <XAxis dataKey="h" type="number" domain={[0,24]} ticks={[0,3,6,9,12,15,18,21,24]}
                    tickFormatter={v=>String(v).padStart(2,"0")} tick={{fontSize:11,fill:COLORS.ink3}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>nf(v,1)} tick={{fontSize:11,fill:COLORS.ink3}} axisLine={false} tickLine={false} width={44}
                    label={{value:"kW",angle:-90,position:"insideLeft",fontSize:11,fill:COLORS.ink2}}/>
                  <Tooltip contentStyle={tip} labelFormatter={v=>fmtHour(v)}
                    formatter={(val,n)=>[nf(val,2)+" kW", n==="pv"?"PV-Erzeugung":"Last"]}/>
                  <Area type="monotone" dataKey="pv"   stroke={COLORS.solar} strokeWidth={2} fill="url(#gPv)"/>
                  <Area type="monotone" dataKey="last" stroke={COLORS.load}  strokeWidth={2} fill="url(#gLast)"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="legend">
              <span><span className="dot" style={{background:COLORS.solar}}/>PV-Erzeugung (Werktags-Ø)</span>
              <span><span className="dot" style={{background:COLORS.load}}/>Last (Werktags-Ø)</span>
            </div>
          </div>
        </section>

        {/* STORY B – ENERGIEFLUSS */}
        <section className="story">
          <div className="eyebrow"><span className="step">B</span><span className="ey-t">Energiefluss</span></div>
          <h2 className="title">Wohin der Strom fließt</h2>
          <div className="card">
            <div className="chartbox" style={{position:"relative"}}>
              <svg viewBox="0 0 572 240" width="100%" preserveAspectRatio="xMidYMid meet" style={{display:"block"}}>
                {flow.bands.map((b,i)=>{
                  const mx=(b.x1+b.x2)/2;
                  return <path key={i} d={`M${b.x1},${b.y1} C${mx},${b.y1} ${mx},${b.y2} ${b.x2},${b.y2}`}
                    fill="none" stroke={b.color} strokeWidth={b.w} strokeOpacity={.5} strokeLinecap="butt"/>;
                })}
                {Object.values(flow.nodes).map((n,i)=> n.show===false?null:(
                  <g key={i}>
                    <rect x={n.x} y={n.y} width={14} height={n.h} rx={4} fill={n.c}/>
                    <text x={n.x>300?n.x+20:n.x-8} y={n.y+n.h/2}
                      textAnchor={n.x>300?"start":"end"} dominantBaseline="middle"
                      fontSize="11" fontWeight="600" fill={COLORS.ink}>{n.label}</text>
                  </g>
                ))}
              </svg>
            </div>
            <div className="legend">
              <span><span className="dot" style={{background:COLORS.solar}}/>PV-Direkt</span>
              <span><span className="dot" style={{background:COLORS.green}}/>Speicher</span>
              <span><span className="dot" style={{background:COLORS.grid}}/>Netzbezug</span>
              <span><span className="dot" style={{background:COLORS.exp}}/>Einspeisung</span>
            </div>
          </div>
        </section>

        {/* STORY C – WERTTREIBER (WATERFALL) */}
        <section className="story">
          <div className="eyebrow"><span className="step">C</span><span className="ey-t">Werttreiber</span></div>
          <h2 className="title">Was die Ersparnis ausmacht</h2>
          <div className="card">
            <div className="chartbox">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={waterfall} margin={{top:20,right:20,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:12,fill:COLORS.ink2}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>nf(v)} tick={{fontSize:11,fill:COLORS.ink3}} axisLine={false} tickLine={false} width={54}/>
                  <Tooltip cursor={{fill:COLORS.surface2}} contentStyle={tip}
                    formatter={(v,n,p)=>[eur(p.payload.delta),"Beitrag"]}/>
                  <Bar dataKey="base" stackId="a" fill="transparent"/>
                  <Bar dataKey="val" stackId="a" radius={[4,4,0,0]}>
                    {waterfall.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                    <LabelList dataKey="delta" position="top" formatter={v=>eur(v)}
                      style={{fontSize:11,fontWeight:600,fill:COLORS.ink}}/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="legend">
              <span>Förderung einmalig {eur(fundingTotal)} · senkt die Nettoinvestition auf {eur(investNet)}.</span>
            </div>
          </div>
        </section>

        {/* STORY D – SPEICHERGRÖSSE */}
        <section className="story">
          <div className="eyebrow"><span className="step">D</span><span className="ey-t">Speichergröße</span></div>
          <h2 className="title">Welche Speichergröße sich lohnt</h2>
          <div className="card">
            <div className="chartbox">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={sweepData} margin={{top:20,right:18,left:10,bottom:6}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false}/>
                  <XAxis dataKey="size" tick={{fontSize:11,fill:COLORS.ink3}} axisLine={false} tickLine={false}
                    label={{value:"Speichergröße (kWh)",position:"insideBottom",offset:-2,fontSize:11,fill:COLORS.ink2}}/>
                  <YAxis yAxisId="l" tickFormatter={v=>nf(v)} tick={{fontSize:11,fill:COLORS.ink3}} axisLine={false} tickLine={false} width={58}/>
                  <YAxis yAxisId="r" orientation="right" tickFormatter={v=>nf(v,1)} tick={{fontSize:11,fill:COLORS.ink3}} axisLine={false} tickLine={false} width={42}/>
                  <Tooltip cursor={{fill:COLORS.surface2}} contentStyle={tip}
                    formatter={(v,n)=>n==="npv"?[eur(v),"NPV"]:[nf(v,1)+" J","Amortisation"]}/>
                  <Bar yAxisId="l" dataKey="npv" radius={[4,4,0,0]}>
                    {sweepData.map((e,i)=><Cell key={i} fill={e.isBest?COLORS.green:e.isCurrent?COLORS.solar:COLORS.lineStrong}/>)}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="amort" stroke={COLORS.ink} strokeWidth={2} dot={{r:3}}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="badge-rec"><Sparkles size={14}/> Optimum: {sweep.best.kwh} kWh → NPV {eur(sweep.best.npv)}</div>
          </div>
        </section>

        {/* DETAILS */}
        <section className="story">
          <button className={"det-btn"+(showDetails?" open":"")} onClick={()=>setShowDetails(!showDetails)}>
            <span style={{display:"flex",alignItems:"center",gap:9}}><Info size={16}/> Alle Szenarien, Annahmen &amp; Plausibilität</span>
            <ChevronDown className="chev" size={18}/>
          </button>
          {showDetails && (
            <div className="card" style={{marginTop:12}}>
              <table>
                <thead><tr>
                  <th>Szenario</th><th>Netzbezug</th><th>Autarkie</th><th>Kosten/Jahr</th><th>Ersparnis</th>
                </tr></thead>
                <tbody>
                  {[["S0","Nur Netz (Referenz ohne PV & Speicher)"],["S1","PV ohne Speicher"],
                    ["S2","PV + Speicher (statischer Tarif)"],["S3","PV + Speicher + dyn. Tarif"],
                    ["S4","PV + Speicher + dyn. Tarif + §14a"]].map(([k,lab])=>{
                    const s=sims[k];
                    return (
                      <tr key={k} className={k===target?"sel":k===refKey?"hl":""}>
                        <td>{lab}
                          {k===refKey?<span className="tag now">REFERENZ</span>:null}
                          {k===target?<span className="tag goal">ZIEL</span>:null}</td>
                        <td className="num">{nf(s.netzGesamt)}</td>
                        <td className="num">{pct(s.autarkie)}</td>
                        <td className="num">{eur(s.cost)}</td>
                        <td className="num">{k===refKey?"—":eur(refCost-s.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Plausibilität / Debug zum Zielsystem */}
              <div className="adv-grp" style={{marginTop:18}}>Plausibilität · Zielsystem {target}</div>
              <div className="dl">
                <div className="di"><span className="dk">Jahresverbrauch (berechnet)</span><span className="dv">{nf(S.totalLoad)} kWh</span></div>
                <div className="di"><span className="dk">PV-Erzeugung</span><span className="dv">{nf(S.totalPV)} kWh</span></div>
                <div className="di"><span className="dk">Eigenverbrauch (lastdeckend)</span><span className="dv">{nf(S.selfCons)} kWh</span></div>
                <div className="di"><span className="dk">Einspeisung</span><span className="dv">{nf(S.feedIn)} kWh</span></div>
                <div className="di"><span className="dk">Netzbezug gesamt</span><span className="dv">{nf(S.netzGesamt)} kWh</span></div>
                <div className="di"><span className="dk">Netzbezug für Last</span><span className="dv">{nf(S.gridToLoad)} kWh</span></div>
                <div className="di"><span className="dk">Speicherladung aus PV</span><span className="dv">{nf(S.pvToBatt)} kWh</span></div>
                <div className="di"><span className="dk">Speicherladung aus Netz</span><span className="dv">{nf(S.netzladung)} kWh</span></div>
                <div className="di"><span className="dk">Speicher-Vollzyklen</span><span className="dv">{nf(S.vollzyklen)}</span></div>
                <div className="di"><span className="dk">Nettoinvestition</span><span className="dv">{eur(investNet)}</span></div>
                <div className="di"><span className="dk">davon PV / Speicher</span><span className="dv">{eur(pvInvest)} / {eur(storageInvest)}</span></div>
                <div className="di"><span className="dk">Betriebskosten p.a.</span><span className="dv">{eur(opexYear)}</span></div>
                <div className="di"><span className="dk">IRR</span><span className="dv">{isFinite(E.irr)?pct(E.irr,1):"—"}</span></div>
                <div className="di"><span className="dk">Aktive Lastkomponenten</span><span className="dv">{I.loadComponents.filter(c=>c.enabled).length}</span></div>
              </div>
            </div>
          )}
        </section>

        {/* FOOT */}
        <div className="foot">
          <b>Methodik:</b> Echte 15-Minuten-Simulation über 8.760 h (35.040 Schritte).
          PV-Ertrag aus Standort-Tagesgang inkl. Ausrichtung/Neigung/Region, Lastprofil aus kombinierbaren Komponenten.
          Dynamischer Bezugspreis = Spotpreis + Netzentgelt (§14a Modul 3) + Steuern/Umlagen.
          §14a Modul 1 = jährliche Pauschale (nur mit Speicher). Alle Preise netto. Modelljahr 2026.
          <br/><br/>
          <b>Hinweis:</b> Modellrechnung mit synthetischen Last- und Erzeugungsprofilen. Für eine belastbare
          Auslegung sind reale Lastgangdaten, Standortdaten und aktuelle Preisblätter maßgeblich.
        </div>

      </div>
    </div>
  );
}
