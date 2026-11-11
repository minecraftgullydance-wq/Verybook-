// Estrae domande, entry ID e opzioni da una pagina Google Moduli.
const TYPES = { 0: 'short', 1: 'paragraph', 2: 'radio', 3: 'dropdown', 4: 'checkbox', 5: 'scale', 9: 'date', 10: 'time' };

function extractLoadData(html) {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*/);
  if (!m) throw new Error('Modulo non leggibile (richiede login, è chiuso o il link non è valido).');
  let i = m.index + m[0].length, depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return JSON.parse(html.slice(i, j + 1));
  }
  throw new Error('Struttura del modulo non riconosciuta.');
}

function parseForm(html) {
  const data = extractLoadData(html);
  const title = data[3] || data[1]?.[8] || 'Modulo';
  const items = data[1]?.[1] || [];
  const questions = [];
  const skipped = [];
  for (const it of items) {
    const typeId = it[3];
    const text = it[1] || '';
    const sub = it[4];
    if (!Array.isArray(sub) || !sub.length) continue; // sezioni, testo, immagini
    if (!(typeId in TYPES)) { skipped.push(text || `(tipo ${typeId})`); continue; }
    const q = sub[0];
    questions.push({
      index: questions.length,
      entry: q[0],
      text,
      description: it[2] || '',
      type: TYPES[typeId],
      required: !!q[2],
      options: (q[1] || []).map(o => o[0]).filter(o => o !== undefined && o !== ''),
      hasImage: Array.isArray(it[6]) || (typeof it[6] === 'string'),
    });
  }
  return { title, questions, skipped };
}

function buildPrefillLink(baseUrl, questions, answers) {
  const u = new URL(baseUrl);
  const p = new URLSearchParams();
  p.set('usp', 'pp_url');
  for (const q of questions) {
    let a = answers[q.index];
    if (a === undefined || a === null || a === '') continue;
    if (q.type === 'checkbox') {
      for (const v of [].concat(a)) p.append(`entry.${q.entry}`, String(v));
    } else if (q.type === 'date') {
      const d = String(a).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!d) continue;
      p.set(`entry.${q.entry}_year`, d[1]); p.set(`entry.${q.entry}_month`, String(+d[2])); p.set(`entry.${q.entry}_day`, String(+d[3]));
    } else if (q.type === 'time') {
      const t = String(a).match(/^(\d{1,2}):(\d{2})/);
      if (!t) continue;
      p.set(`entry.${q.entry}_hour`, t[1]); p.set(`entry.${q.entry}_minute`, t[2]);
    } else {
      p.set(`entry.${q.entry}`, String(Array.isArray(a) ? a[0] : a));
    }
  }
  return `${u.origin}${u.pathname.replace(/\/(edit|viewform).*$/, '')}/viewform?${p.toString()}`;
}

module.exports = { parseForm, buildPrefillLink, extractLoadData };
