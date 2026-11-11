# Quiz Solver (PWA per iPad)

Incolli il link di un Google Modulo (quiz di geometria/matematica non scolastici) → Claude risolve le domande → ottieni il **link precompilato** pronto da aprire e inviare.

## Avvio
```bash
export ANTHROPIC_API_KEY=sk-ant-...   # oppure inseriscila nelle Impostazioni dell'app
npm start                             # http://localhost:3000
```
Deploy su qualsiasi host Node >= 18 (Render, Fly, Railway…; serve HTTPS). Poi su iPad: Safari → Condividi → **Aggiungi a Home**.

## Limiti
- Moduli pubblici (senza login obbligatorio). Domande supportate: risposta breve/lunga, scelta multipla, menu, caselle, scala, data, ora.
- Le figure/immagini nelle domande non vengono lette: controlla quelle risposte.
- Griglie e caricamento file vanno compilati a mano.
- L'invio finale lo premi tu su Google Moduli.
- `npm test` verifica il parser.
