const assert = require('assert');
const { parseForm, buildPrefillLink } = require('./parser');
const data = [null, [null, [
  [1, 'Area di un quadrato di lato 5?', null, 0, [[111, null, 1]]],
  [2, 'Triangolo con 3 angoli retti?', null, 2, [[222, [['Sì'], ['No']], 1]]],
  [3, 'Poligoni regolari', null, 4, [[333, [['Quadrato'], ['Rettangolo'], ['Triangolo equilatero']], 0]]],
  [4, 'Sezione', null, 8],
]], null, 'Quiz geometria'];
const html = `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(data)}; </script>`;
const f = parseForm(html);
assert.equal(f.title, 'Quiz geometria'); assert.equal(f.questions.length, 3);
const link = buildPrefillLink('https://docs.google.com/forms/d/e/ABC/viewform?x=1', f.questions, { 0: '25', 1: 'No', 2: ['Quadrato', 'Triangolo equilatero'] });
assert.equal(link, 'https://docs.google.com/forms/d/e/ABC/viewform?usp=pp_url&entry.111=25&entry.222=No&entry.333=Quadrato&entry.333=Triangolo+equilatero');
console.log('OK');
