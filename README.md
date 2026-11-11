# Quiz Solver (PWA per iPad)

Incolli il link di un Google Modulo (quiz di geometria/matematica non scolastici) → Claude risolve le domande → ottieni il **link precompilato** pronto da aprire e inviare.

## Avvio
```bash
# Alla prima apertura ogni utente sceglie l IA (Claude, ChatGPT, Gemini o altra compatibile OpenAI) e inserisce la PROPRIA chiave API (salvata solo sul suo dispositivo).
# Opzionale, solo uso personale: ANTHROPIC_API_KEY in .env + ALLOW_SERVER_KEY=1 (solo provider Claude)
npm start                             # http://localhost:3000
```
Deploy su qualsiasi host Node >= 18 (Render, Fly, Railway…; serve HTTPS). Poi su iPad: Safari → Condividi → **Aggiungi a Home**.

## Limiti
- Moduli pubblici (senza login obbligatorio). Domande supportate: risposta breve/lunga, scelta multipla, menu, caselle, scala, data, ora.
- Le immagini delle domande vengono scaricate e passate a Claude (visione); ricontrolla comunque le risposte sulle figure.
- Griglie e caricamento file vanno compilati a mano.
- L'invio finale lo premi tu su Google Moduli.
- `npm test` verifica il parser.
