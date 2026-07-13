// The spelling-practice web page, served at GET /. Kept as a single self-
// contained string so the Worker can return it with no build step or assets.
// The page asks once for the API token and keeps it in localStorage.
export const PRACTICE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Spelling Practice</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 640px; margin: 3rem auto; padding: 0 1.2rem; }
  h1 { font-size: 1.5rem; }
  input[type=text] { font-size: 1.1rem; padding: .5rem .6rem; width: 100%; box-sizing: border-box;
                     border: 1px solid #8886; border-radius: 8px; background: transparent; color: inherit; }
  button { font-size: 1rem; padding: .5rem 1rem; border-radius: 8px; border: 1px solid #8886;
           background: #4472c4; color: #fff; cursor: pointer; margin-top: .8rem; }
  button.secondary { background: transparent; color: inherit; }
  #card { margin-top: 1.5rem; padding: 1.2rem; border: 1px solid #8884; border-radius: 12px; }
  .pos { color: #888; font-size: .95rem; margin: 0 0 .4rem; }
  .definition { font-size: 1.2rem; margin: .2rem 0 .6rem; }
  .example { color: #888; font-style: italic; }
  .progress { color: #888; font-size: .9rem; }
  .ok { color: #2e9e4f; font-weight: 600; }
  .bad { color: #d1453b; font-weight: 600; }
  .msg { color: #d1453b; font-size: .9rem; }
</style>
</head>
<body>
<h1>Spelling Practice</h1>

<div id="setup">
  <p>Enter your API token to connect to your saved words.</p>
  <input id="tokenInput" type="text" placeholder="API token" autocomplete="off" />
  <p class="msg" id="setupMsg"></p>
  <button id="saveToken">Connect</button>
</div>

<div id="app" hidden>
  <p class="progress" id="progress"></p>
  <button id="start">Start round</button>
  <button class="secondary" id="signout">Sign out</button>

  <div id="card" hidden>
    <p class="pos" id="pos"></p>
    <p class="definition" id="definition"></p>
    <p class="example" id="example"></p>
    <input id="answer" type="text" placeholder="type the word"
           autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
    <div>
      <button id="check">Check</button>
      <button id="next" hidden>Next</button>
    </div>
    <p id="feedback"></p>
  </div>

  <div id="done" hidden>
    <p class="definition" id="score"></p>
    <button id="again">Practice again</button>
  </div>
</div>

<script>
  var TOKEN_KEY = 'spelling_token';
  var words = [], queue = [], current = null, correctCount = 0, total = 0;
  function el(id){ return document.getElementById(id); }
  function show(id, on){ el(id).hidden = !on; }
  function token(){ return localStorage.getItem(TOKEN_KEY) || ''; }

  function api(path, opts){
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { 'Authorization': 'Bearer ' + token() });
    return fetch(path, opts);
  }

  function initSetup(){
    if (token()){ show('setup', false); show('app', true); loadWords(); }
    else { show('setup', true); show('app', false); }
  }

  el('saveToken').onclick = function(){
    var v = el('tokenInput').value.trim();
    if (!v){ return; }
    localStorage.setItem(TOKEN_KEY, v);
    el('setupMsg').textContent = '';
    initSetup();
  };
  el('signout').onclick = function(){ localStorage.removeItem(TOKEN_KEY); initSetup(); };

  function loadWords(){
    return api('/words').then(function(r){
      if (r.status === 401){
        localStorage.removeItem(TOKEN_KEY);
        show('app', false); show('setup', true);
        el('setupMsg').textContent = 'Token rejected — check it and try again.';
        throw new Error('unauthorized');
      }
      return r.json();
    }).then(function(d){
      words = (d && d.words) || [];
      el('progress').textContent = words.length + ' saved word' + (words.length === 1 ? '' : 's');
    }).catch(function(){});
  }

  function shuffle(a){
    for (var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mask(text, word){
    if (!text){ return ''; }
    var re = new RegExp(word.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'ig');
    var blank = new Array(Math.max(4, word.length) + 1).join('_');
    return text.replace(re, blank);
  }

  el('start').onclick = function(){
    if (!words.length){
      el('progress').textContent = 'No saved words yet — look some up with the Mac app first.';
      return;
    }
    queue = shuffle(words.slice());
    correctCount = 0; total = 0;
    show('done', false); show('card', true);
    nextWord();
  };

  function nextWord(){
    el('answer').value = '';
    el('answer').disabled = false;
    el('feedback').textContent = '';
    show('check', true); show('next', false);
    if (!queue.length){ finishRound(); return; }
    current = queue.shift();
    var meta = [];
    if (current.partOfSpeech){ meta.push(current.partOfSpeech); }
    if (current.pronunciation){ meta.push(current.pronunciation); }
    el('pos').textContent = meta.join('  ·  ');
    el('definition').textContent = current.definition || (current.definitions && current.definitions[0]) || '(no definition)';
    var ex = (current.examples && current.examples[0]) || '';
    el('example').textContent = ex ? '“' + mask(ex, current.word) + '”' : '';
    el('progress').textContent = 'Word ' + (total + 1) + ' of ' + words.length;
    el('answer').focus();
  }

  function submit(){
    var ans = el('answer').value.trim();
    if (!ans){ return; }
    total++;
    var ok = ans.toLowerCase() === current.word.toLowerCase();
    if (ok){ correctCount++; }
    el('answer').disabled = true;
    el('feedback').textContent = ok ? '✓ Correct — ' + current.word : '✗ It was: ' + current.word;
    el('feedback').className = ok ? 'ok' : 'bad';
    show('check', false); show('next', true);
    el('next').focus();
    api('/practice/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ word: current.word, correct: ok })
    }).catch(function(){});
  }

  el('check').onclick = submit;
  el('next').onclick = nextWord;
  el('answer').addEventListener('keydown', function(e){
    if (e.key === 'Enter'){ el('check').hidden ? nextWord() : submit(); }
  });

  function finishRound(){
    show('card', false); show('done', true);
    el('score').textContent = 'Score: ' + correctCount + ' / ' + total;
  }
  el('again').onclick = function(){ el('start').click(); };

  initSetup();
</script>
</body>
</html>`;
