// Server senza dipendenze: serve la PWA e fa da proxy per (1) leggere il modulo Google e (2) chiamare Claude.
const http = require('http'), fs = require('fs'), path = require('path');
const { parseForm, buildPrefillLink } = require('./parser');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ALLOWED_HOSTS = new Set(['docs.google.com', 'forms.gle', 'forms.google.com']);

function readBody(req) {
  return new Promise((ok, ko) => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { ko(e); } }); });
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function fetchForm(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('Incolla un link di Google Moduli (docs.google.com/forms o forms.gle).');
  const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'it,en' } });
  const finalHost = new URL(r.url).hostname;
  if (!ALLOWED_HOSTS.has(finalHost)) throw new Error('Il link porta fuori da Google Moduli (login richiesto?).');
  return { html: await r.text(), finalUrl: r.url };
}

async function solve(form, apiKey, model) {
  const payload = form.questions.map(q => ({ index: q.index, type: q.type, question: q.text, description: q.description || undefined, options: q.options.length ? q.options : undefined }));
  const system = 'Sei un esperto di matematica e geometria. Risolvi con cura ogni domanda del quiz (ragiona passo passo internamente). ' +
    'Per le domande a scelta (radio/dropdown/scale) rispondi con ESATTAMENTE il testo di una delle options. Per checkbox rispondi con un array di options. ' +
    'Per risposte aperte dai solo il valore finale conciso (es. "24" o "12.5", senza unità se non richieste). date = YYYY-MM-DD, time = HH:MM. ' +
    'Rispondi SOLO con JSON: {"answers":{"<index>":<risposta>},"notes":{"<index>":"breve spiegazione"}}.';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: `Titolo: ${form.title}\n\n${JSON.stringify(payload, null, 1)}` }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Errore API Claude');
  const text = j.content.map(c => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Risposta di Claude non valida.');
  return JSON.parse(m[0]);
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/solve') {
      const { url, model } = await readBody(req);
      const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return send(res, 400, { error: 'Manca la chiave API Anthropic (Impostazioni).' });
      const { html, finalUrl } = await fetchForm(url);
      const form = parseForm(html);
      if (!form.questions.length) return send(res, 422, { error: 'Nessuna domanda trovata nel modulo.' });
      const out = await solve(form, apiKey, model || 'claude-opus-5-5');
      const answers = out.answers || {};
      const link = buildPrefillLink(finalUrl, form.questions, answers);
      return send(res, 200, { title: form.title, link, skipped: form.skipped, questions: form.questions.map(q => ({ ...q, answer: answers[q.index], note: out.notes?.[q.index] })) });
    }
    const file = path.join(PUB, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, () => console.log(`Quiz Solver su http://localhost:${PORT}`));
