/* ==========================================================
   QR — generador de códigos QR (sin dependencias)
   Modo byte (UTF-8), corrección de errores M, versiones 1–10
   (hasta 213 caracteres). Uso:
     QR.matrix("texto")            -> Array de filas con true/false
     QR.svg("texto", {margin:4})   -> cadena SVG lista para insertar
   Lo usa el emparejamiento con el teléfono (cast.js).
   ========================================================== */
(function (root) {
  "use strict";

  /* ---------- Campo de Galois GF(256) ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  function generator(n) {
    var g = [1], i, j;
    for (i = 0; i < n; i++) {
      var ng = new Array(g.length + 1);
      for (j = 0; j < ng.length; j++) ng[j] = 0;
      for (j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  function remainder(data, n) {
    var g = generator(n), r = [], i, j;
    for (i = 0; i < n; i++) r.push(0);
    data.forEach(function (b) {
      var f = b ^ r[0];
      r.shift(); r.push(0);
      if (f) for (j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f);
    });
    return r;
  }

  /* ---------- Tablas (nivel M) ---------- */
  // [códigos EC por bloque, [[bloques, datos por bloque], ...]]
  var BLOCKS = [null,
    [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]
  ];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function dataCapacity(v) {
    var t = 0;
    BLOCKS[v][1].forEach(function (b) { t += b[0] * b[1]; });
    return t;
  }

  function utf8(str) {
    var out = [], i, c;
    var s = unescape(encodeURIComponent(String(str)));
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); out.push(c); }
    return out;
  }

  function bit(n, i) { return ((n >>> i) & 1) !== 0; }

  /* ---------- Codificación ---------- */
  function encodeData(bytes, v) {
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);
    push(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { push(b, 8); });
    var cap = dataCapacity(v) * 8;
    push(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    var out = [], i;
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
      out.push(b);
    }
    for (i = 0; out.length < dataCapacity(v); i++) out.push(i % 2 ? 0x11 : 0xec);
    return out;
  }

  function interleave(data, v) {
    var ecLen = BLOCKS[v][0], blocks = [], pos = 0;
    BLOCKS[v][1].forEach(function (g) {
      for (var i = 0; i < g[0]; i++) {
        var d = data.slice(pos, pos + g[1]); pos += g[1];
        blocks.push({ d: d, e: remainder(d, ecLen) });
      }
    });
    var out = [], i, maxD = 0;
    blocks.forEach(function (b) { if (b.d.length > maxD) maxD = b.d.length; });
    for (i = 0; i < maxD; i++) blocks.forEach(function (b) { if (i < b.d.length) out.push(b.d[i]); });
    for (i = 0; i < ecLen; i++) blocks.forEach(function (b) { out.push(b.e[i]); });
    return out;
  }

  /* ---------- Matriz ---------- */
  function build(codewords, v) {
    var size = 17 + 4 * v, x, y, i;
    var mod = [], fn = [];
    for (y = 0; y < size; y++) { mod.push([]); fn.push([]); for (x = 0; x < size; x++) { mod[y].push(false); fn[y].push(false); } }

    function setFn(px, py, dark) { mod[py][px] = !!dark; fn[py][px] = true; }

    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }

    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), px = cx + dx, py = cy + dy;
        if (px >= 0 && px < size && py >= 0 && py < size) setFn(px, py, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    var al = ALIGN[v], n = al.length;
    for (i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        setFn(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    function formatBits(mask) {
      var data = mask; // nivel M = 00
      var rem = data;
      for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      for (k = 0; k <= 5; k++) setFn(8, k, bit(bits, k));
      setFn(8, 7, bit(bits, 6)); setFn(8, 8, bit(bits, 7)); setFn(7, 8, bit(bits, 8));
      for (k = 9; k < 15; k++) setFn(14 - k, 8, bit(bits, k));
      for (k = 0; k < 8; k++) setFn(size - 1 - k, 8, bit(bits, k));
      for (k = 8; k < 15; k++) setFn(8, size - 15 + k, bit(bits, k));
      setFn(8, size - 8, true);
    }
    formatBits(0);

    if (v >= 7) {
      var rem = v;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var vb = (v << 12) | rem;
      for (i = 0; i < 18; i++) {
        var a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setFn(a, b, bit(vb, i)); setFn(b, a, bit(vb, i));
      }
    }

    // Datos en zigzag
    var total = codewords.length * 8, k2 = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          x = right - jj;
          var upward = ((right + 1) & 2) === 0;
          y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && k2 < total) { mod[y][x] = bit(codewords[k2 >>> 3], 7 - (k2 & 7)); k2++; }
        }
      }
    }

    function maskFn(m, px, py) {
      switch (m) {
        case 0: return (px + py) % 2 === 0;
        case 1: return py % 2 === 0;
        case 2: return px % 3 === 0;
        case 3: return (px + py) % 3 === 0;
        case 4: return (Math.floor(px / 3) + Math.floor(py / 2)) % 2 === 0;
        case 5: return (px * py) % 2 + (px * py) % 3 === 0;
        case 6: return ((px * py) % 2 + (px * py) % 3) % 2 === 0;
        default: return ((px + py) % 2 + (px * py) % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && maskFn(m, xx, yy)) mod[yy][xx] = !mod[yy][xx];
    }

    function penalty() {
      var p = 0, a, b, run, dark = 0;
      for (a = 0; a < size; a++) {
        var rowRun = 1, colRun = 1;
        for (b = 1; b < size; b++) {
          if (mod[a][b] === mod[a][b - 1]) { rowRun++; if (rowRun === 5) p += 3; else if (rowRun > 5) p++; } else rowRun = 1;
          if (mod[b][a] === mod[b - 1][a]) { colRun++; if (colRun === 5) p += 3; else if (colRun > 5) p++; } else colRun = 1;
        }
      }
      for (a = 0; a < size - 1; a++) for (b = 0; b < size - 1; b++) {
        var c = mod[a][b];
        if (c === mod[a][b + 1] && c === mod[a + 1][b] && c === mod[a + 1][b + 1]) p += 3;
      }
      var pat = [1, 0, 1, 1, 1, 0, 1];
      function scan(get) {
        for (var s = 0; s < size; s++) {
          for (var t = 0; t <= size - 7; t++) {
            var ok = true;
            for (var u = 0; u < 7; u++) if ((get(s, t + u) ? 1 : 0) !== pat[u]) { ok = false; break; }
            if (!ok) continue;
            var before = true, after = true;
            for (u = 1; u <= 4; u++) {
              if (t - u >= 0 && get(s, t - u)) before = false;
              if (t + 6 + u < size && get(s, t + 6 + u)) after = false;
            }
            if (before || after) p += 40;
          }
        }
      }
      scan(function (s, t) { return mod[s][t]; });
      scan(function (s, t) { return mod[t][s]; });
      for (a = 0; a < size; a++) for (b = 0; b < size; b++) if (mod[a][b]) dark++;
      var tot = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1) * 10;
      return p;
    }

    var best = 0, bestScore = Infinity, m;
    for (m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var sc = penalty();
      if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);
    return mod;
  }

  function matrix(text) {
    var bytes = utf8(text), v = 1;
    while (v <= 10 && bytes.length > dataCapacity(v) - (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error("Texto demasiado largo para el QR");
    return build(interleave(encodeData(bytes, v), v), v);
  }

  function svg(text, opt) {
    opt = opt || {};
    var m = matrix(text), n = m.length, q = opt.margin == null ? 4 : opt.margin, d = "";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    var s = n + q * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges" role="img" aria-label="' + (opt.label || "Código QR") + '">' +
      '<rect width="' + s + '" height="' + s + '" fill="' + (opt.light || "#fff") + '"/><path d="' + d + '" fill="' + (opt.dark || "#000") + '"/></svg>';
  }

  root.QR = { matrix: matrix, svg: svg };
})(window);
