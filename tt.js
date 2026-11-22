// Tiny Titan's helpers for its web page (web/shell.html loads this before the engine).
//   ttSafe()    the safe-area insets (notch, home bar) in CSS pixels, as JSON
//   ttApp       is it a touch screen, an iPhone, opened from the Home Screen; the link's #part
//   ttKb        typing on a phone (the game's side is app/web_keys.gd)
//   ttFile      pick a file / save a file
// and it registers the service worker (sw.js) so the app opens without a connection.
(function () {
  'use strict';

  window.ttSafe = function () {
    const el = document.getElementById('tt-safe');
    const cs = el ? getComputedStyle(el) : null;
    const px = function (v) { return cs ? (parseFloat(cs.getPropertyValue(v)) || 0) : 0; };
    return JSON.stringify({
      top: px('padding-top'), right: px('padding-right'), bottom: px('padding-bottom'), left: px('padding-left'),
      w: window.innerWidth, h: window.innerHeight,
    });
  };

  const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // Smoother on a phone: draw at most 2 screen pixels per page pixel. An iPhone
  // has 3, so the game drew 2.25 times the pixels for no visible gain (pixel art)
  // and scrolling stuttered. The engine reads this when it sizes its canvas.
  if (touch && window.devicePixelRatio > 2) {
    try {
      Object.defineProperty(window, 'devicePixelRatio', { get: function () { return 2; }, configurable: true });
    } catch (e) { /* keeps the full size */ }
  }
  // A finger is not a mouse. The engine takes its mouse position from the browser's
  // "pointermove", and a real finger sends those too (a made-up TouchEvent does not,
  // which is how this got past the tests): so the engine's mouse followed the finger,
  // hovered whatever slid under it (a tooltip after every scroll, a highlight storm
  // during one) and stayed parked where the finger lifted. Pointer events that are
  // not a mouse's stop here, before the engine's listener (this script loads first).
  ['pointermove', 'pointerdown', 'pointerup', 'pointercancel'].forEach(function (name) {
    window.addEventListener(name, function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') e.stopImmediatePropagation();
    }, true);
  });
  // Can the main pointer hover (a mouse)? A phone's cannot.
  const noHover = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);

  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  window.ttApp = {
    touch: touch,
    ios: ios,
    standalone: standalone,
    noHover: noHover,
    // When this copy of the app was built (tools/build_web.py writes it into the page).
    build: String(window.ttBuild || ''),
    hash: function () { return String(window.location.hash || ''); },
    href: function () { return String(window.location.href || ''); },
    vibrate: function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not on iPhone */ } },
    // Keep the screen on while logging a workout (where the browser allows it).
    wake: function (on) {
      try {
        if (on && navigator.wakeLock && !window.ttWakeLock) {
          navigator.wakeLock.request('screen').then(function (l) { window.ttWakeLock = l; l.addEventListener('release', function () { window.ttWakeLock = null; }); }).catch(function () {});
        } else if (!on && window.ttWakeLock) {
          window.ttWakeLock.release();
          window.ttWakeLock = null;
        }
      } catch (e) { /* no wake lock */ }
    },
  };

  // --- typing on a phone ------------------------------------------------------------
  // The game's text boxes live inside the canvas, where a phone cannot type. When one
  // gets the focus, the game calls want(): a real text field shows at the top of the
  // screen. iOS only opens its keyboard when a field is focused inside the finger's own
  // event, so the field is focused on the touchend of that same tap; if the tap was too
  // quick for that, tapping the field opens it. What is typed goes back to the game as
  // it is typed (onChange), and Done / return hands it in (onSubmit).
  const kb = { active: false, onChange: null, onSubmit: null };
  window.ttKb = kb;
  let bar = null, input = null, done = null;

  function setup() {
    if (bar) return true;
    bar = document.getElementById('tt-type');
    input = document.getElementById('tt-input');
    done = document.getElementById('tt-done');
    if (!bar || !input || !done) { bar = null; return false; }
    input.addEventListener('input', function () { if (kb.active && kb.onChange) kb.onChange(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
    });
    // Keep the field focused while Done is pressed, then hand the text in.
    done.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    done.addEventListener('click', function (e) { e.preventDefault(); finish(); });
    return true;
  }

  function finish() {
    if (!kb.active) return;
    const v = input.value;
    kb.release();
    if (kb.onSubmit) kb.onSubmit(v);
  }

  kb.want = function (text, kind, hint) {
    if (!setup()) return;
    kb.active = true;
    input.value = String(text || '');
    input.placeholder = String(hint || 'Type here');
    input.inputMode = kind === 'number' ? 'decimal' : 'text';
    bar.classList.add('on');
  };

  kb.release = function () {
    if (!setup()) return;
    kb.active = false;
    bar.classList.remove('on');
    if (document.activeElement === input) input.blur();
  };

  kb.focused = function () { return !!input && document.activeElement === input; };

  // On the window, as the event bubbles up: after the game's own listener on the
  // canvas, so the field keeps the focus (still inside the finger's event).
  let downAt = null;
  window.addEventListener('touchstart', function (e) {
    const t = e.changedTouches && e.changedTouches[0];
    downAt = t ? [t.clientX, t.clientY] : null;
  }, true);
  window.addEventListener('touchend', function (e) {
    if (!kb.active || !setup()) return;
    if (bar.contains(e.target)) return;
    // A finger that moved was scrolling, not asking to type.
    const t = e.changedTouches && e.changedTouches[0];
    if (t && downAt && Math.hypot(t.clientX - downAt[0], t.clientY - downAt[1]) > 10) return;
    if (document.activeElement !== input) {
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) { /* number fields */ }
    }
  }, false);

  // --- files ------------------------------------------------------------------------
  // A phone only lets a page open a file chooser or the share sheet inside a tap,
  // and the game's buttons are drawn in the canvas. So the game asks for it, and a
  // real button (#tt-act) shows at the bottom of the screen for the player to tap.
  //   pick(accept, label, cb): cb(name, base64) once a file is read ('' if none)
  //   save(name, mime, base64, label): the share sheet (iPhone) or a download
  function actButton(label, run) {
    const bar = document.getElementById('tt-act');
    const btn = document.getElementById('tt-act-go');
    const no = document.getElementById('tt-act-no');
    if (!bar || !btn || !no) { run(); return; }
    btn.textContent = label;
    bar.classList.add('on');
    btn.onclick = function () { bar.classList.remove('on'); run(); };
    no.onclick = function () { bar.classList.remove('on'); };
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  // copy(text, label): text to the clipboard, from a real button (a phone only
  // lets a page write the clipboard inside a tap).
  window.ttCopy = function (text, label) {
    actButton(label || 'Copy', function () {
      const done = function () {};
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(text)).then(done, function () { window.prompt('Copy this:', String(text)); });
      } else {
        window.prompt('Copy this:', String(text));
      }
    });
  };

  window.ttFile = {
    // With maxSide, a picture is shrunk to that many pixels on its longer side and
    // handed over as a JPEG: the browser turns a phone photo the right way up (the
    // game's own reader would not) and a 12 megapixel photo does not have to cross
    // into the game whole.
    pick: function (accept, label, cb, maxSide) {
      actButton(label || 'Choose a file', function () {
        const f = document.createElement('input');
        f.type = 'file';
        f.accept = accept || '';
        f.style.display = 'none';
        document.body.appendChild(f);
        f.addEventListener('change', function () {
          const file = f.files && f.files[0];
          if (!file) { cb('', ''); f.remove(); return; }
          const whole = function () {
            const r = new FileReader();
            r.onload = function () {
              const s = String(r.result || '');
              cb(file.name, s.substring(s.indexOf(',') + 1));
              f.remove();
            };
            r.readAsDataURL(file);
          };
          if (!maxSide || !/^image\//.test(file.type || '')) { whole(); return; }
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = function () {
            try {
              const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
              const cv = document.createElement('canvas');
              cv.width = Math.max(1, Math.round(img.naturalWidth * k));
              cv.height = Math.max(1, Math.round(img.naturalHeight * k));
              cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
              const s = cv.toDataURL('image/jpeg', 0.9);
              URL.revokeObjectURL(url);
              cb(file.name.replace(/\.[^.]*$/, '') + '.jpg', s.substring(s.indexOf(',') + 1));
              f.remove();
            } catch (e) {
              URL.revokeObjectURL(url);
              whole();
            }
          };
          img.onerror = function () { URL.revokeObjectURL(url); whole(); };
          img.src = url;
        });
        f.click();
      });
    },
    // cb (optional) is called once the player has tapped the button.
    save: function (name, mime, b64, label, cb) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      actButton(label || 'Save it', function () {
        if (cb) cb();
        const file = (typeof File === 'function') ? new File([blob], name, { type: mime }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] }).catch(function (e) {
            if (!e || e.name !== 'AbortError') download(name, blob);
          });
          return;
        }
        download(name, blob);
      });
    },
  };

  // --- offline --------------------------------------------------------------------------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* still works online */ });
    });
  }
}());
