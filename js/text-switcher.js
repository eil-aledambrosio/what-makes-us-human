(function () {
  'use strict';

  var WORD_ORDER = ['living', 'asterischi', 'tracing', 'moving', 'breathing'];
  var FADE_MS = 300;
  var HOLD_MS = 600;

  var words = {};
  var activeWord = 'living';
  var cycleIndex = 0;
  var chainTimer = null;
  var rafId = null;
  var stopping = false;

  function cancelTween() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function cancelChain() {
    if (chainTimer) {
      clearTimeout(chainTimer);
      chainTimer = null;
    }
  }

  function tween(group, to, done) {
    if (!group) { if (done) done(); return; }
    cancelTween();
    var from = group.opacity;
    var start = performance.now();

    function tick(now) {
      var t = Math.min((now - start) / FADE_MS, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      group.opacity = from + (to - from) * eased;
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        group.opacity = to;
        rafId = null;
        if (done) done();
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function showNext(loop) {
    chainTimer = setTimeout(function () {
      chainTimer = null;
      var g = words[WORD_ORDER[cycleIndex]];
      tween(g, 1, function () {
        chainTimer = setTimeout(function () {
          chainTimer = null;
          tween(g, 0, function () {
            cycleIndex = (cycleIndex + 1) % WORD_ORDER.length;
            if (cycleIndex === 0 && !loop) return;
            showNext(true);
          });
        }, HOLD_MS);
      });
    }, 0);
  }

  function startCycle() {
    cancelTween();
    cancelChain();
    stopping = false;

    if (activeWord && words[activeWord]) {
      words[activeWord].opacity = 0;
    }

    cycleIndex = 0;
    activeWord = null;
    showNext(true);
  }

  function stopCycle() {
    if (stopping) return;
    if (!chainTimer && !rafId) return;
    stopping = true;

    cancelTween();
    cancelChain();

    if (words[WORD_ORDER[cycleIndex]]) {
      words[WORD_ORDER[cycleIndex]].opacity = 0;
    }

    var r = Math.floor(Math.random() * WORD_ORDER.length);
    var w = WORD_ORDER[r];
    activeWord = w;
    tween(words[w], 1, function () { stopping = false; });
  }

  window.textSwitcherInit = function (logoItem) {
    var all = {};
    for (var i = 0; i < WORD_ORDER.length; i++) {
      var item = logoItem.getItem({ name: WORD_ORDER[i] });
      if (!item) return;
      all[WORD_ORDER[i]] = item;
    }

    words = all;
    for (var j = 0; j < WORD_ORDER.length; j++) {
      words[WORD_ORDER[j]].opacity = 0;
    }
    words.living.opacity = 1;
    activeWord = 'living';

    logoItem.onMouseEnter = startCycle;
    logoItem.onMouseLeave = stopCycle;

    var canvas = document.getElementById('logo-canvas');
    if (!canvas) return;

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      startCycle();
    }, { passive: false });
    canvas.addEventListener('touchend', stopCycle);
  };
})();
