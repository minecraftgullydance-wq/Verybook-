# Quiz Solver (PWA per iPad)

Incolli il link di un Google Modulo (quiz di geometria/matematica non scolastici) → Claude risolve le domande → ottieni il **link precompilato** pronto da aprire e inviare.

## Avvio
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env   # ignorato da git; oppure variabile d'ambiente sull'host
npm start                             # http://localhost:3000
```
Deploy su qualsiasi host Node >= 18 (Render, Fly, Railway…; serve HTTPS). Poi su iPad: Safari → Condividi → **Aggiungi a Home**.

## Limiti
- Moduli pubblici (senza login obbligatorio). Domande supportate: risposta breve/lunga, scelta multipla, menu, caselle, scala, data, ora.
- Le immagini delle domande vengono scaricate e passate a Claude (visione); ricontrolla comunque le risposte sulle figure.
- Griglie e caricamento file vanno compilati a mano.
- L'invio finale lo premi tu su Google Moduli.
- `npm test` verifica il parser.
