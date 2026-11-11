// Server senza dipendenze: serve la PWA e fa da proxy per (1) leggere il modulo Google e (2) chiamare Claude.
const http = require('http'), fs = require('fs'), path = require('path');
const { parseForm, buildPrefillLink } = require('./parser');

try { for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
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
  // link di modifica (/d/ID/edit) o con /u/0/ -> link di compilazione
  u.pathname = u.pathname.replace(/\/u\/\d+\//, '/').replace(/\/edit.*$/, '/viewform');
  const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'it,en' } });
  const finalHost = new URL(r.url).hostname;
  if (!ALLOWED_HOSTS.has(finalHost)) throw new Error('Il modulo richiede l\'accesso con un account Google: l\'app non può aprirlo. Apri le impostazioni del modulo e togli "Limita a utenti dell\'organizzazione" / "Richiedi accesso", oppure usa un modulo pubblico.');
  const html = await r.text();
  if (!/FB_PUBLIC_LOAD_DATA_/.test(html)) {
    console.log('Modulo non leggibile:', r.status, r.url, html.slice(0, 200).replace(/\s+/g, ' '));
    if (/ServiceLogin|accounts\.google\.com|Accedi|Sign in/i.test(html)) throw new Error('Il modulo richiede l\'accesso con un account Google (modulo non pubblico).');
    if (/non accetta più risposte|no longer accepting/i.test(html)) throw new Error('Il modulo è chiuso: non accetta più risposte.');
    throw new Error(`Google non ha restituito il modulo (stato ${r.status}). Controlla che il link sia di compilazione e che il modulo sia pubblico; se sì, Google potrebbe aver bloccato il server: riprova tra poco.`);
  }
  return { html, finalUrl: r.url };
}

async function loadImage(url) {
  const u = new URL(url);
  if (!/\.googleusercontent\.com$/.test(u.hostname)) return null;
  const r = await fetch(u);
  if (!r.ok) return null;
  const type = (r.headers.get('content-type') || '').split(';')[0];
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 4e6) return null;
  return { type, data: buf.toString('base64') };
}

async function solve(form, { provider, apiKey, model, baseUrl }) {
  const payload = form.questions.map(q => ({ index: q.index, type: q.type, question: q.text, images: q.images.length ? `${q.images.length} immagine/i allegata/e sotto` : undefined, description: q.description || undefined, options: q.options.length ? q.options : undefined }));
  const system = 'Sei un esperto di matematica e geometria. Puoi vedere le figure allegate: leggi con attenzione dati, etichette e angoli. Risolvi con cura ogni domanda del quiz (ragiona passo passo internamente). ' +
    'Per le domande a scelta (radio/dropdown/scale) rispondi con ESATTAMENTE il testo di una delle options. Per checkbox rispondi con un array di options. ' +
    'Per risposte aperte dai solo il valore finale conciso (es. "24" o "12.5", senza unità se non richieste). date = YYYY-MM-DD, time = HH:MM. ' +
    'Rispondi SOLO con JSON: {"answers":{"<index>":<risposta>},"notes":{"<index>":"breve spiegazione"}}.';
  const text0 = `Titolo: ${form.title}\n\n${JSON.stringify(payload, null, 1)}`;
  const imgs = [];
  for (const q of form.questions) for (const url of q.images) {
    const img = await loadImage(url).catch(() => null);
    if (img) imgs.push({ label: `Immagine per la domanda ${q.index}:`, ...img });
  }
  const text = await callLLM({ provider, apiKey, model, baseUrl, system, text: text0, imgs });
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Risposta dell\'IA non valida (prova un modello più capace).');
  return JSON.parse(m[0]);
}

function checkBase(u) {
  const x = new URL(u);
  if (x.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(x.hostname) || x.hostname.endsWith('.internal')) throw new Error('Indirizzo API non consentito (serve https pubblico).');
  return u.replace(/\/+$/, '');
}

async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || j.error || `Errore API (${r.status})`);
  return j;
}

// Anthropic, OpenAI, Google Gemini e qualsiasi API compatibile OpenAI (OpenRouter, Groq, Mistral, DeepSeek...).
async function callLLM({ provider, apiKey, model, baseUrl, system, text, imgs }) {
  if (provider === 'anthropic') {
    const content = [{ type: 'text', text }];
    for (const i of imgs) content.push({ type: 'text', text: i.label }, { type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } });
    const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, { model, max_tokens: 8000, system, messages: [{ role: 'user', content }] });
    return j.content.map(c => c.text || '').join('');
  }
  if (provider === 'gemini') {
    const parts = [{ text }];
    for (const i of imgs) parts.push({ text: i.label }, { inlineData: { mimeType: i.type, data: i.data } });
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': apiKey }, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }] });
    return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }
  // openai e compatibili
  const base = provider === 'openai' ? 'https://api.openai.com/v1' : checkBase(baseUrl || '');
  const content = [{ type: 'text', text }];
  for (const i of imgs) content.push({ type: 'text', text: i.label }, { type: 'image_url', image_url: { url: `data:${i.type};base64,${i.data}` } });
  const j = await post(`${base}/chat/completions`, { authorization: `Bearer ${apiKey}` }, { model, messages: [{ role: 'system', content: system }, { role: 'user', content }] });
  return j.choices?.[0]?.message?.content || '';
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/solve') {
      const { url, model, provider = 'anthropic', baseUrl } = await readBody(req);
      const apiKey = req.headers['x-api-key'] || (process.env.ALLOW_SERVER_KEY === '1' ? process.env.ANTHROPIC_API_KEY : '');
      if (!apiKey) return send(res, 400, { error: 'Inserisci la tua chiave API.' });
      const { html, finalUrl } = await fetchForm(url);
      const form = parseForm(html);
      if (!form.questions.length) return send(res, 422, { error: 'Nessuna domanda trovata nel modulo.' });
      if (!model) return send(res, 400, { error: 'Indica il modello da usare (Impostazioni).' });
      const out = await solve(form, { provider, apiKey, model, baseUrl });
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
