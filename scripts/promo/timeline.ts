import { DURATION_MS, SCENES, type SceneId, type SceneTheme } from "./copy";

/**
 * Node holds the clock. Headless Chrome throttles performance.now and rAF, so
 * a page-side timer never leaves the first scene. show() is what the capture
 * script calls at each beat; pulse() keeps the compositor dirty so screencast
 * keeps sending frames. start() is for opening the HTML in a real browser.
 */
export function timelineScript(): string {
  return `<script>
window.__PROMO = {
  ready: false,
  durationMs: ${DURATION_MS},
  scenes: ${JSON.stringify(SCENES)},
  show: function (id, theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    var nodes = document.querySelectorAll("[data-scene]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("on", nodes[i].getAttribute("data-scene") === id);
    }
  },
  pulse: function () {
    var pulse = document.getElementById("pulse");
    var n = 0;
    var tick = function () {
      n += 1;
      if (pulse) pulse.textContent = String(n);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  start: function () {
    var self = this;
    var t0 = Date.now();
    var idx = 0;
    var scenes = self.scenes;
    self.show(scenes[0].id, scenes[0].theme);
    self.pulse();
    var tick = function () {
      var elapsed = (Date.now() - t0) / 1000;
      while (idx + 1 < scenes.length && elapsed >= scenes[idx + 1].at) {
        idx += 1;
        self.show(scenes[idx].id, scenes[idx].theme);
      }
      if (Date.now() - t0 < self.durationMs) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
};
function markReady() { window.__PROMO.ready = true; }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(markReady);
setTimeout(markReady, 2500);
</script>`;
}

export function showExpression(id: SceneId, theme: SceneTheme): string {
  return `window.__PROMO.show(${JSON.stringify(id)}, ${JSON.stringify(theme)})`;
}
