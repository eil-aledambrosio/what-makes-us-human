(function () {
  "use strict";

  const BRANCH_DURATION = 550;
  const OPEN_PAUSE = 1400;
  const CLOSED_PAUSE = 1200;

  const FIXED_BRANCH = 1;
  const OPEN_ORDER = [4, 3, 2];
  const CLOSE_ORDER = [2, 3, 4];

  const Phase = {
    CLOSED_WAIT: "closed_wait",
    OPENING: "opening",
    OPEN_PAUSE: "open_pause",
    CLOSING: "closing",
  };

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getCenter(el) {
    const box = el.getBBox();
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  function tipAngle(pivot, tip) {
    return Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
  }

  function setRotation(group, radians, pivot) {
    const deg = (radians * 180) / Math.PI;
    group.setAttribute(
      "transform",
      "rotate(" + deg + " " + pivot.x + " " + pivot.y + ")"
    );
  }

  function initBranches(svg) {
    const pivot = getCenter(svg.getElementById("palla5"));
    const byId = {};

    Array.from(svg.querySelectorAll(".branch")).forEach(function (group) {
      const id = Number(group.dataset.branch);
      const palla = group.querySelector("[id^='palla']");
      const openAngle = tipAngle(pivot, getCenter(palla));
      byId[id] = { id: id, group: group, openAngle: openAngle };
    });

    const startAngle = byId[FIXED_BRANCH].openAngle;

    Object.keys(byId).forEach(function (key) {
      const branch = byId[key];
      branch.closedOffset = startAngle - branch.openAngle;
      if (branch.id === FIXED_BRANCH) {
        branch.closedOffset = 0;
      }
    });

    return { byId: byId, pivot: pivot };
  }

  function LogoAnimation(byId, pivot) {
    this.byId = byId;
    this.pivot = pivot;
    this.phase = Phase.CLOSED_WAIT;
    this.phaseTime = 0;
    this.stepIndex = 0;
    this.stepProgress = 0;
    this.lastTime = null;

    this.applyAll();
  }

  LogoAnimation.prototype.offsetForBranch = function (branch, progress, opening) {
    if (opening) {
      return branch.closedOffset * (1 - easeInOutCubic(progress));
    }
    return branch.closedOffset * easeInOutCubic(progress);
  };

  LogoAnimation.prototype.applyAll = function () {
    var byId = this.byId;
    var pivot = this.pivot;
    var phase = this.phase;
    var stepIndex = this.stepIndex;
    var stepProgress = this.stepProgress;
    var i;
    var id;
    var branch;
    var order;
    var idx;

    if (phase === Phase.OPEN_PAUSE) {
      Object.keys(byId).forEach(function (key) {
        setRotation(byId[key].group, 0, pivot);
      });
      return;
    }

    var opening = phase === Phase.OPENING;
    var closing = phase === Phase.CLOSING;
    order = opening ? OPEN_ORDER : CLOSE_ORDER;

    Object.keys(byId).forEach(function (key) {
      id = Number(key);
      branch = byId[id];
      var offset = 0;

      if (id === FIXED_BRANCH) {
        setRotation(branch.group, 0, pivot);
        return;
      }

      if (opening) {
        idx = order.indexOf(id);
        if (idx < 0) {
          offset = 0;
        } else if (idx < stepIndex) {
          offset = 0;
        } else if (idx === stepIndex) {
          offset = this.offsetForBranch(branch, stepProgress, true);
        } else {
          offset = branch.closedOffset;
        }
      } else if (closing) {
        idx = order.indexOf(id);
        if (idx < 0) {
          offset = 0;
        } else if (idx < stepIndex) {
          offset = branch.closedOffset;
        } else if (idx === stepIndex) {
          offset = this.offsetForBranch(branch, stepProgress, false);
        } else {
          offset = 0;
        }
      } else {
        offset = branch.closedOffset;
      }

      setRotation(branch.group, offset, pivot);
    }, this);
  };

  LogoAnimation.prototype.tick = function (now) {
    if (this.lastTime === null) {
      this.lastTime = now;
      return;
    }

    var dt = now - this.lastTime;
    this.lastTime = now;
    this.phaseTime += dt;
    var steps = OPEN_ORDER.length;

    switch (this.phase) {
      case Phase.CLOSED_WAIT:
        if (this.phaseTime >= CLOSED_PAUSE) {
          this.phase = Phase.OPENING;
          this.phaseTime = 0;
          this.stepIndex = 0;
          this.stepProgress = 0;
        }
        break;

      case Phase.OPENING:
        this.stepProgress += dt / BRANCH_DURATION;
        if (this.stepProgress >= 1) {
          this.stepProgress = 0;
          this.stepIndex += 1;
          if (this.stepIndex >= steps) {
            this.phase = Phase.OPEN_PAUSE;
            this.phaseTime = 0;
            this.stepIndex = 0;
          }
        }
        break;

      case Phase.OPEN_PAUSE:
        if (this.phaseTime >= OPEN_PAUSE) {
          this.phase = Phase.CLOSING;
          this.phaseTime = 0;
          this.stepIndex = 0;
          this.stepProgress = 0;
        }
        break;

      case Phase.CLOSING:
        this.stepProgress += dt / BRANCH_DURATION;
        if (this.stepProgress >= 1) {
          this.stepProgress = 0;
          this.stepIndex += 1;
          if (this.stepIndex >= steps) {
            this.phase = Phase.CLOSED_WAIT;
            this.phaseTime = 0;
            this.stepIndex = 0;
          }
        }
        break;
    }

    this.applyAll();
  };

  function startLoop(anim) {
    function frame(now) {
      anim.tick(now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function start(svg) {
    var data = initBranches(svg);
    var anim = new LogoAnimation(data.byId, data.pivot);
    startLoop(anim);
  }

  function boot() {
    var svg = document.getElementById("logo");
    if (!svg) return;
    start(svg);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
