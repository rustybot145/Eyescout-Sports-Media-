/* EyeScout image cropper — reusable reposition/crop modal.
   Usage:
     const result = await EyeScoutCropper.open(fileOrDataUrl, {
       shape: 'circle' | 'rect',
       aspect: 3.6,          // width/height — ignored for circle (always 1)
       outWidth: 600,        // output resolution (long edge)
       title: 'Position your photo'
     });
     // result === null if cancelled, else { blob, dataUrl, file }
*/
(function () {
  'use strict';

  var ACCENT = '#1E90FF';
  var injected = false;

  function injectStyles() {
    if (injected) return;
    injected = true;
    var css = `
    .esc-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(4,6,10,0.78);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; opacity: 0; transition: opacity 0.22s ease;
    }
    .esc-overlay.esc-show { opacity: 1; }
    .esc-card {
      width: 100%; max-width: 420px;
      background: #0d1119;
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 20px;
      box-shadow: 0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(30,144,255,0.04);
      padding: 26px 26px 22px;
      transform: translateY(10px) scale(0.985);
      transition: transform 0.22s cubic-bezier(0.16,1,0.3,1);
    }
    .esc-overlay.esc-show .esc-card { transform: translateY(0) scale(1); }
    .esc-title {
      font-family: Impact, 'Arial Narrow', Arial, sans-serif;
      font-size: 20px; letter-spacing: 0.06em; text-transform: uppercase;
      color: #fff; margin: 0 0 4px;
    }
    .esc-sub { font-size: 12px; color: rgba(255,255,255,0.4); margin: 0 0 20px; line-height: 1.5; }
    .esc-stage {
      position: relative; margin: 0 auto 18px;
      overflow: hidden; background: #05070c;
      touch-action: none; cursor: grab; user-select: none;
      border-radius: 12px;
    }
    .esc-stage.esc-grabbing { cursor: grabbing; }
    .esc-stage img { position: absolute; top: 0; left: 0; max-width: none; min-width: 0; will-change: transform; pointer-events: none; -webkit-user-drag: none; }
    /* circle mask: darken outside the inscribed circle */
    .esc-mask-circle {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      border-radius: 50%;
      box-shadow: 0 0 0 9999px rgba(5,7,12,0.6);
      border: 2px solid rgba(255,255,255,0.9);
      pointer-events: none;
    }
    .esc-frame-rect {
      position: absolute; inset: 0;
      border: 2px solid rgba(255,255,255,0.85);
      border-radius: 12px; pointer-events: none;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35);
    }
    /* rule-of-thirds guides */
    .esc-guide { position: absolute; background: rgba(255,255,255,0.18); pointer-events: none; }
    .esc-zoom-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .esc-zoom-ico { color: rgba(255,255,255,0.35); flex-shrink: 0; }
    .esc-range {
      -webkit-appearance: none; appearance: none; flex: 1; height: 4px;
      border-radius: 999px; background: rgba(255,255,255,0.12); outline: none;
    }
    .esc-range::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 18px; height: 18px; border-radius: 50%;
      background: ${ACCENT}; border: 2px solid #0d1119; cursor: pointer;
      box-shadow: 0 2px 6px rgba(30,144,255,0.5);
      transition: transform 0.12s ease;
    }
    .esc-range::-webkit-slider-thumb:active { transform: scale(1.15); }
    .esc-range::-moz-range-thumb {
      width: 18px; height: 18px; border-radius: 50%;
      background: ${ACCENT}; border: 2px solid #0d1119; cursor: pointer;
    }
    .esc-actions { display: flex; gap: 10px; }
    .esc-btn {
      flex: 1; padding: 13px 0; border-radius: 11px; font-size: 12px; font-weight: 800;
      letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer;
      font-family: 'Arial Narrow', Arial, sans-serif;
      border: 1px solid transparent; transition: background 0.15s ease, transform 0.08s ease;
    }
    .esc-btn:active { transform: translateY(1px); }
    .esc-btn:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
    .esc-btn-cancel { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.1); }
    .esc-btn-cancel:hover { background: rgba(255,255,255,0.09); color: #fff; }
    .esc-btn-save { background: ${ACCENT}; color: #fff; }
    .esc-btn-save:hover { background: #1877d6; }
    `;
    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = null;
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { if (url) URL.revokeObjectURL(url); reject(new Error('load failed')); };
      if (typeof src === 'string') {
        img.src = src;
      } else {
        url = URL.createObjectURL(src);
        img.src = url;
      }
    });
  }

  function open(src, opts) {
    opts = opts || {};
    injectStyles();
    var shape = opts.shape === 'rect' ? 'rect' : 'circle';
    var aspect = shape === 'circle' ? 1 : (opts.aspect || 3.6);
    var outW = opts.outWidth || (shape === 'circle' ? 600 : 1200);
    var outH = shape === 'circle' ? outW : Math.round(outW / aspect);

    // display stage dimensions
    var VW = shape === 'circle' ? 300 : 460;
    var VH = shape === 'circle' ? 300 : Math.round(460 / aspect);

    return loadImage(src).then(function (loaded) {
      return new Promise(function (resolve) {
        var img = loaded.img;
        var Nw = img.naturalWidth, Nh = img.naturalHeight;
        var baseScale = Math.max(VW / Nw, VH / Nh);
        var z = 1;                 // zoom multiplier
        var tx = 0, ty = 0;        // translation of image top-left within stage

        // ---- build DOM ----
        var overlay = document.createElement('div');
        overlay.className = 'esc-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        var stageInner = shape === 'circle'
          ? '<div class="esc-mask-circle" style="width:' + VW + 'px;height:' + VW + 'px;"></div>'
          : '<div class="esc-frame-rect"></div>' +
            '<div class="esc-guide" style="left:33.33%;top:0;bottom:0;width:1px;"></div>' +
            '<div class="esc-guide" style="left:66.66%;top:0;bottom:0;width:1px;"></div>' +
            '<div class="esc-guide" style="top:33.33%;left:0;right:0;height:1px;"></div>' +
            '<div class="esc-guide" style="top:66.66%;left:0;right:0;height:1px;"></div>';

        overlay.innerHTML =
          '<div class="esc-card">' +
            '<p class="esc-title">' + (opts.title || (shape === 'circle' ? 'Position your photo' : 'Position your banner')) + '</p>' +
            '<p class="esc-sub">Drag to move' + (shape === 'circle' ? ' — center your face inside the circle.' : ' — everything inside the frame will show.') + '</p>' +
            '<div class="esc-stage" style="width:' + VW + 'px;height:' + VH + 'px;"><img alt=""></div>' +
            '<div class="esc-zoom-row">' +
              '<svg class="esc-zoom-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>' +
              '<input class="esc-range" type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">' +
            '</div>' +
            '<div class="esc-actions">' +
              '<button class="esc-btn esc-btn-cancel" type="button">Cancel</button>' +
              '<button class="esc-btn esc-btn-save" type="button">' + (opts.saveLabel || (shape === 'rect' ? 'Save Banner' : 'Save Photo')) + '</button>' +
            '</div>' +
          '</div>';

        // insert circle/rect overlays before the range row (inside stage)
        var stage = overlay.querySelector('.esc-stage');
        var imgEl = stage.querySelector('img');
        stage.insertAdjacentHTML('beforeend', stageInner);

        document.body.appendChild(overlay);
        requestAnimationFrame(function () { overlay.classList.add('esc-show'); });

        function clamp() {
          var iw = Nw * baseScale * z, ih = Nh * baseScale * z;
          tx = Math.min(0, Math.max(VW - iw, tx));
          ty = Math.min(0, Math.max(VH - ih, ty));
        }
        function apply() {
          var iw = Nw * baseScale * z, ih = Nh * baseScale * z;
          imgEl.style.width = iw + 'px';
          imgEl.style.height = ih + 'px';
          imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
        }
        // center initially
        (function init() {
          var iw = Nw * baseScale * z, ih = Nh * baseScale * z;
          tx = (VW - iw) / 2; ty = (VH - ih) / 2;
          clamp(); apply();
        })();
        imgEl.src = img.src;

        // ---- drag ----
        var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        function down(e) {
          dragging = true; stage.classList.add('esc-grabbing');
          var pt = point(e); sx = pt.x; sy = pt.y; ox = tx; oy = ty;
          if (e.pointerId != null && stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (_) {} }
        }
        function move(e) {
          if (!dragging) return;
          var pt = point(e);
          tx = ox + (pt.x - sx); ty = oy + (pt.y - sy);
          clamp(); apply();
        }
        function up() { dragging = false; stage.classList.remove('esc-grabbing'); }
        function point(e) {
          if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
          return { x: e.clientX, y: e.clientY };
        }
        stage.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);

        // ---- zoom (slider keeps stage-center focal) ----
        var range = overlay.querySelector('.esc-range');
        range.addEventListener('input', function () {
          var zNew = parseFloat(range.value);
          var cx = (VW / 2 - tx) / (baseScale * z);
          var cy = (VH / 2 - ty) / (baseScale * z);
          z = zNew;
          tx = VW / 2 - cx * baseScale * z;
          ty = VH / 2 - cy * baseScale * z;
          clamp(); apply();
        });
        // wheel zoom
        stage.addEventListener('wheel', function (e) {
          e.preventDefault();
          var zNew = Math.min(4, Math.max(1, z - e.deltaY * 0.0015));
          var cx = (VW / 2 - tx) / (baseScale * z);
          var cy = (VH / 2 - ty) / (baseScale * z);
          z = zNew; range.value = String(z);
          tx = VW / 2 - cx * baseScale * z;
          ty = VH / 2 - cy * baseScale * z;
          clamp(); apply();
        }, { passive: false });

        // ---- close/finish ----
        function teardown() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.removeEventListener('keydown', onKey);
          overlay.classList.remove('esc-show');
          setTimeout(function () {
            if (loaded.url) URL.revokeObjectURL(loaded.url);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          }, 220);
        }
        function cancel() { teardown(); resolve(null); }
        function save() {
          var s = baseScale * z;
          var srcX = -tx / s, srcY = -ty / s, srcW = VW / s, srcH = VH / s;
          var canvas = document.createElement('canvas');
          canvas.width = outW; canvas.height = outH;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(0, 0, outW, outH);
          ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          canvas.toBlob(function (blob) {
            var file = blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : null;
            teardown();
            resolve({ blob: blob, dataUrl: dataUrl, file: file });
          }, 'image/jpeg', 0.9);
        }
        function onKey(e) { if (e.key === 'Escape') cancel(); }
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.esc-btn-cancel').addEventListener('click', cancel);
        overlay.querySelector('.esc-btn-save').addEventListener('click', save);
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) cancel(); });
      });
    }).catch(function () { return null; });
  }

  window.EyeScoutCropper = { open: open };
})();
