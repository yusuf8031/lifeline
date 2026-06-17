/* ============================================================
   Lifeline — Fresno County Family Navigator
   Backend server with LIVE inmate lookup.

   Zero dependencies. Requires Node.js v18 or newer (built-in fetch).
   Run:   node server.js
   Then open:  http://localhost:3000

   What it does:
   - Serves the Lifeline dashboard (public/index.html)
   - /api/search?last=SMITH&first=  -> live name search
   - /api/inmate?booking=2619672    -> full record (charges, bail, court case #)

   Data source: Fresno County Sheriff public locator
   (publicinfo.fresnosheriff.org/InmateInfoV2). Public information only.
   This tool is independent and NOT affiliated with any government agency.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE = 'https://publicinfo.fresnosheriff.org/InmateInfoV2';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ---------- tiny HTML helpers (no dependencies) ---------- */
function stripTags(s){ return (s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').trim(); }

// pull a hidden ASP.NET field value out of raw html
function hidden(html, name){
  const re = new RegExp('id="'+name+'"[^>]*value="([^"]*)"','i');
  const m = html.match(re);
  return m ? m[1] : '';
}

// get text of a <span id="..."> ... </span>
function spanText(html, id){
  const re = new RegExp('id="'+id.replace(/[$]/g,'\\$')+'"[^>]*>([\\s\\S]*?)<\\/span>','i');
  const m = html.match(re);
  return m ? stripTags(m[1]) : '';
}

// split a table (by a header keyword) into array-of-objects keyed by its header row
function parseTableByHeader(html, headerKeyword){
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const target = tables.find(t => new RegExp(headerKeyword,'i').test(t));
  if(!target) return [];
  const rows = target.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if(rows.length < 2) return [];
  const headers = (rows[0].match(/<t[hd][\s\S]*?<\/t[hd]>/gi)||[]).map(stripTags);
  const out = [];
  for(let i=1;i<rows.length;i++){
    const cells = (rows[i].match(/<t[hd][\s\S]*?<\/t[hd]>/gi)||[]).map(stripTags);
    if(!cells.length || cells.every(c=>!c)) continue;
    const obj = {};
    headers.forEach((h,idx)=> obj[h||('col'+idx)] = cells[idx]||'');
    out.push(obj);
  }
  return out;
}

// charges live in an ASP.NET GridView with id="grvwCharges", nested inside
// layout tables — so we target that table by id and map columns by header name.
function parseCharges(html){
  const m = html.match(/<table[^>]*id="grvwCharges"[\s\S]*?<\/table>/i);
  if(!m) return [];
  const rows = m[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if(rows.length < 2) return [];
  const headers = (rows[0].match(/<t[hd][\s\S]*?<\/t[hd]>/gi)||[]).map(c=>stripTags(c).toLowerCase());
  const col = kw => headers.findIndex(h => h.includes(kw));
  const ci = { code:col('charge'), desc:col('description'), bail:col('bail amount'),
               auth:col('authority'), caseNo:col('case'), level:col('level'), court:col('court') };
  const out = [];
  for(let i=1;i<rows.length;i++){
    const cells = (rows[i].match(/<t[hd][\s\S]*?<\/t[hd]>/gi)||[]).map(stripTags);
    if(!cells.length || cells.every(c=>!c)) continue;
    const at = k => ci[k] >= 0 ? (cells[ci[k]]||'') : '';
    const o = { code:at('code'), description:at('desc'), bail:at('bail'),
                authority:at('auth'), caseNo:at('caseNo'), level:at('level'), court:at('court') };
    if(o.code || o.description) out.push(o);
  }
  return out;
}

/* ---------- fetch with cookie jar + browser UA ---------- */
async function go(url, opts={}, cookie=''){
  const headers = Object.assign({
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  }, opts.headers||{});
  if(cookie) headers['Cookie'] = cookie;
  const res = await fetch(url, Object.assign({}, opts, {headers, redirect:'follow'}));
  const setCookie = res.headers.get('set-cookie') || '';
  const jar = setCookie.split(',').map(c=>c.split(';')[0]).filter(Boolean).join('; ');
  const text = await res.text();
  return { text, status: res.status, cookie: jar || cookie };
}

/* ---------- LIVE: search by name ---------- */
async function searchInmates(last, first){
  // 1) GET the form to capture viewstate + session cookie
  const g = await go(BASE + '/search.aspx');
  const body = new URLSearchParams();
  body.set('__EVENTTARGET','');
  body.set('__EVENTARGUMENT','');
  body.set('__VIEWSTATE', hidden(g.text,'__VIEWSTATE'));
  body.set('__VIEWSTATEGENERATOR', hidden(g.text,'__VIEWSTATEGENERATOR'));
  body.set('__EVENTVALIDATION', hidden(g.text,'__EVENTVALIDATION'));
  body.set('tbxBookingNbr','');
  body.set('tbxLastName', (last||'').toUpperCase());
  body.set('tbxFirstName', (first||'').toUpperCase());
  body.set('btnSearch','Search');

  // 2) POST the search
  const p = await go(BASE + '/search.aspx', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':BASE+'/search.aspx'},
    body: body.toString()
  }, g.cookie);

  // 3) parse results: each booking number is a link to InmateDetail.aspx?BookingNo=
  const html = p.text;
  const results = [];
  const seen = new Set();
  // grab the results grid rows
  const grid = (html.match(/id="grvwSelections"[\s\S]*?<\/table>/i)||[''])[0] || html;
  const rows = grid.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for(const r of rows){
    const link = r.match(/InmateDetail\.aspx\?BookingNo=(\d+)/i);
    if(!link) continue;
    const booking = link[1];
    if(seen.has(booking)) continue; seen.add(booking);
    const cells = (r.match(/<td[\s\S]*?<\/td>/gi)||[]).map(stripTags);
    // typical columns: PersonID | BookingNumber | BookingName | Sex | Race | Birthdate | Age
    results.push({
      personId: cells[0]||'',
      bookingNo: booking,
      name: cells[2]||'',
      sex: cells[3]||'',
      race: cells[4]||'',
      dob: cells[5]||'',
      age: cells[6]||''
    });
  }
  return results;
}

/* ---------- LIVE: full record by booking number ---------- */
async function getInmate(booking){
  const r = await go(BASE + '/InmateDetail.aspx?BookingNo=' + encodeURIComponent(booking));
  const h = r.text;
  const rec = {
    bookingNo:  spanText(h,'fvwGenInfo_lblBookingNo') || booking,
    name:       spanText(h,'fvwGenInfo_lblBookingName'),
    personId:   spanText(h,'fvwGenInfo_lblPersonID'),
    sex:        spanText(h,'fvwGenInfo_lblSex'),
    dob:        spanText(h,'fvwGenInfo_lblBirthDate'),
    race:       spanText(h,'fvwGenInfo_lblRace'),
    age:        spanText(h,'fvwGenInfo_lblAge'),
    hair:       spanText(h,'fvwGenInfo_lblHair'),
    eyes:       spanText(h,'fvwGenInfo_lblEyes'),
    height:     spanText(h,'fvwGenInfo_lblHeight'),
    weight:     spanText(h,'fvwGenInfo_lblWeight'),
    arrestDate: spanText(h,'fvwArrest_lblArrestDate'),
    bookDate:   spanText(h,'fvwArrest_lblBookDate'),
    agency:     spanText(h,'fvwArrest_lblAgency'),
    housing:    spanText(h,'fvwArrest_lblLocation'),
    charges: []
  };
  // charges from the grvwCharges GridView
  rec.charges = parseCharges(h);

  // total bail (sum of numeric bail amounts)
  rec.totalBail = rec.charges.reduce((s,c)=> s + (parseFloat((c.bail||'').replace(/[^0-9.]/g,''))||0), 0);
  rec.found = !!(rec.name);
  return rec;
}

/* ============================================================
   CUSTODY-STATUS ALERTS
   - watch a booking number
   - a background poller re-checks every POLL_MINUTES
   - detects: released, housing change, charges change, bail change
   - changes are readable at /api/alerts
   - if WEBHOOK_URL is set, each change is POSTed there too
     (point it at Zapier / IFTTT / Make to get real SMS or email —
      no credentials ever touch this app)
   ============================================================ */
const STORE = path.join(__dirname, 'watches.json');
const POLL_MINUTES = Number(process.env.POLL_MINUTES || 30);
let WATCHES = {};   // { booking: { snapshot, label, since } }
let ALERTS = [];    // [ { booking, name, type, message, at } ]

function loadStore(){
  try{ const d=JSON.parse(fs.readFileSync(STORE,'utf8')); WATCHES=d.watches||{}; ALERTS=d.alerts||[]; }catch(e){ WATCHES={}; ALERTS=[]; }
}
function saveStore(){
  try{ fs.writeFileSync(STORE, JSON.stringify({watches:WATCHES, alerts:ALERTS.slice(-500)})); }catch(e){ console.error('store write failed', e.message); }
}
function snapOf(rec){
  return {
    found: !!rec.found,
    housing: rec.housing||'',
    bail: rec.totalBail||0,
    charges: (rec.charges||[]).map(c=>c.code).sort().join('|')
  };
}
async function pushAlert(booking, name, type, message){
  const a={booking, name, type, message, at:new Date().toISOString()};
  ALERTS.push(a); saveStore();
  if(process.env.WEBHOOK_URL){
    try{ await fetch(process.env.WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)}); }
    catch(e){ console.error('webhook failed', e.message); }
  }
}
function diff(booking, name, oldS, newS){
  if(oldS.found && !newS.found){ pushAlert(booking,name,'released','⚠️ '+name+' may have been RELEASED or moved — they are no longer in the jail record. Confirm at (559) 475-9491.'); return; }
  if(!oldS.found && newS.found){ pushAlert(booking,name,'rebooked',name+' now appears in custody again.'); }
  if(oldS.housing!==newS.housing && newS.found){ pushAlert(booking,name,'housing','📍 Housing changed for '+name+': '+(oldS.housing||'?')+' → '+(newS.housing||'?')+'. (A move can affect visits/calls.)'); }
  if(oldS.charges!==newS.charges && newS.found){ pushAlert(booking,name,'charges','§ Charges changed for '+name+'. Re-open Lifeline to review.'); }
  if(oldS.bail!==newS.bail && newS.found){ pushAlert(booking,name,'bail','💲 Bail changed for '+name+': $'+oldS.bail.toLocaleString()+' → $'+newS.bail.toLocaleString()+'.'); }
}
async function pollOnce(){
  const bookings=Object.keys(WATCHES);
  for(const b of bookings){
    try{
      const rec=await getInmate(b);
      const w=WATCHES[b]; const newS=snapOf(rec);
      if(w && w.snapshot) diff(b, w.label||rec.name||('#'+b), w.snapshot, newS);
      WATCHES[b]={snapshot:newS, label:(rec.name||w.label||('#'+b)), since:(w&&w.since)||new Date().toISOString()};
      saveStore();
    }catch(e){ /* leave watch in place; try next cycle */ }
    await new Promise(r=>setTimeout(r, 1500)); // be gentle on the gov site
  }
}

/* ---------- HTTP server ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try{
    if(u.pathname === '/api/search'){
      const last = u.searchParams.get('last')||'';
      const first = u.searchParams.get('first')||'';
      if(!last) return json(res, 400, {error:'Last name is required.'});
      const data = await searchInmates(last, first);
      return json(res, 200, {count:data.length, results:data});
    }
    if(u.pathname === '/api/inmate'){
      const b = u.searchParams.get('booking')||'';
      if(!b) return json(res, 400, {error:'booking number required'});
      const data = await getInmate(b);
      return json(res, 200, data);
    }
    if(u.pathname === '/api/watch'){            // start watching a booking
      const b = u.searchParams.get('booking')||'';
      if(!b) return json(res, 400, {error:'booking number required'});
      const rec = await getInmate(b);
      WATCHES[b] = {snapshot: snapOf(rec), label: rec.name||('#'+b), since: new Date().toISOString()};
      saveStore();
      return json(res, 200, {ok:true, watching:b, name:rec.name, pollMinutes:POLL_MINUTES});
    }
    if(u.pathname === '/api/unwatch'){
      const b = u.searchParams.get('booking')||'';
      delete WATCHES[b]; saveStore();
      return json(res, 200, {ok:true});
    }
    if(u.pathname === '/api/alerts'){           // read alerts (optionally for one booking)
      const b = u.searchParams.get('booking')||'';
      const list = (b ? ALERTS.filter(a=>a.booking===b) : ALERTS).slice(-100).reverse();
      return json(res, 200, {watching:Object.keys(WATCHES), pollMinutes:POLL_MINUTES, alerts:list});
    }
    if(u.pathname === '/api/checknow'){         // force an immediate poll (for testing/demo)
      await pollOnce();
      return json(res, 200, {ok:true});
    }
    // static files
    let file = u.pathname === '/' ? '/index.html' : u.pathname;
    const fp = path.join(__dirname, path.normalize(file).replace(/^(\.\.[\/\\])+/,''));
    if(fs.existsSync(fp) && fs.statSync(fp).isFile()){
      const ext = path.extname(fp).toLowerCase();
      const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[ext]||'text/plain';
      res.writeHead(200, {'Content-Type':mime});
      return res.end(fs.readFileSync(fp));
    }
    res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found');
  }catch(err){
    console.error(err);
    json(res, 502, {error:'Could not reach the Sheriff locator right now. '+(err.message||'')});
  }
});

function json(res, code, obj){
  res.writeHead(code, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(obj));
}

if(require.main === module){
  loadStore();
  server.listen(PORT, ()=>{
    console.log('\n  Lifeline is running.');
    console.log('  Open this in your browser:  http://localhost:'+PORT);
    console.log('  Custody-alert checks every '+POLL_MINUTES+' min'+(process.env.WEBHOOK_URL?' (webhook on)':'')+'.\n');
  });
  // background poller
  setInterval(()=>{ pollOnce().catch(e=>console.error('poll error', e.message)); }, POLL_MINUTES*60*1000);
} else {
  module.exports = { stripTags, hidden, spanText, parseTableByHeader, parseCharges, snapOf, diff };
}
