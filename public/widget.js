/*!
 * News Summoner XRウィジェット
 * 提携メディアの記事ページに貼るだけで「このニュースをXRで見る」ボタンを表示します。
 *
 *   <script src="https://（News Summoner のURL）/widget.js" data-partner="提携ID" async></script>
 *
 * 任意の属性：
 *   data-target=".article-footer"  … ボタンを入れる場所（CSSセレクタ）。省略時はこのタグの直後
 *   data-label="XRで見る"          … ボタンの文言
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src).origin;
  var partner = script.getAttribute('data-partner') || '';
  if (!partner) { console.warn('[News Summoner] data-partner がありません'); return; }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = script.getAttribute('data-label') || '🔮 このニュースをXRで見る';
  btn.setAttribute('style', [
    'display:inline-flex', 'align-items:center', 'gap:6px', 'margin:12px 0', 'padding:10px 18px',
    'border:none', 'border-radius:9999px', 'cursor:pointer', 'font:700 14px/1.2 system-ui,sans-serif', 'color:#fff',
    'background:linear-gradient(135deg,#a855f7,#3b82f6 55%,#06b6d4)', 'box-shadow:0 4px 14px rgba(168,85,247,.35)'
  ].join(';'));

  function articleUrl() {
    var c = document.querySelector('link[rel="canonical"]');
    var u = (c && c.href) || location.href;
    return u.split('#')[0];
  }

  function open() {
    var wrap = document.createElement('div');
    wrap.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px');
    var box = document.createElement('div');
    box.setAttribute('style', 'position:relative;width:min(440px,100%);height:min(720px,100%);border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);background:#0b0f19');
    var frame = document.createElement('iframe');
    frame.src = origin + '/widget?partner=' + encodeURIComponent(partner) + '&url=' + encodeURIComponent(articleUrl());
    frame.title = 'News Summoner';
    frame.allow = 'camera; microphone; autoplay; xr-spatial-tracking; fullscreen';
    frame.setAttribute('style', 'width:100%;height:100%;border:0;display:block');
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', '閉じる');
    close.setAttribute('style', 'position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer;z-index:1');
    function shut() { document.body.removeChild(wrap); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    close.onclick = shut;
    wrap.onclick = function (e) { if (e.target === wrap) shut(); };
    document.addEventListener('keydown', onKey);
    box.appendChild(frame);
    box.appendChild(close);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  }
  btn.onclick = open;

  var sel = script.getAttribute('data-target');
  var target = sel && document.querySelector(sel);
  if (target) target.appendChild(btn);
  else if (script.parentNode) script.parentNode.insertBefore(btn, script.nextSibling);
})();
