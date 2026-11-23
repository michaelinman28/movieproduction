/*!
 * Lattice Grid v1.5.0
 * A dependency-free JavaScript data grid written from scratch.
 * MIT License.
 *
 * Features: row virtualisation, sorting (multi), column filters (text / number /
 * date / set), floating filters, quick filter, find-in-grid, pinned columns,
 * column resize / move / hide / autosize, column groups, inline editing with
 * validation, undo / redo, cell range selection, clipboard copy / paste, fill
 * handle, row selection, row grouping with drag-and-drop group panel,
 * aggregation, pivoting, tree data, master / detail, totals row, sparklines,
 * integrated charts, CSV + native .xlsx export, side bar tool panels, context
 * menu, column menu, status bar, pagination, live updates with cell flashing,
 * state save / restore, light and dark themes.
 */
(function (global) {
  'use strict';

  /* =====================================================================
   * Utilities
   * ===================================================================== */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function getPath(obj, path) {
    if (obj == null || path == null) return undefined;
    if (path.indexOf('.') < 0) return obj[path];
    let cur = obj;
    for (const k of path.split('.')) { if (cur == null) return undefined; cur = cur[k]; }
    return cur;
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ESC[c]); }
  function xmlEsc(s) {
    // eslint-disable-next-line no-control-regex
    return esc(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function toTime(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.getTime();
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function debounce(fn, ms) {
    let t = 0;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  }
  function same(a, b) {
    if (a === b) return true;
    if ((a == null || a === '') && (b == null || b === '')) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
    return false;
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const numFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const intFmt = new Intl.NumberFormat();
  const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

  function compareValues(a, b) {
    const an = a == null || a === '' || (typeof a === 'number' && isNaN(a));
    const bn = b == null || b === '' || (typeof b === 'number' && isNaN(b));
    if (an || bn) return an && bn ? 0 : an ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a instanceof Date && b instanceof Date) return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1;
    return collator.compare(String(a), String(b));
  }

  function defaultFormat(v, type) {
    if (v == null) return '';
    if (typeof v === 'number') return isNaN(v) ? '' : type === 'number' ? numFmt.format(v) : String(v);
    if (v instanceof Date) return v.toLocaleDateString();
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }

  /**
   * Wraps a text/number/date input with a small "×" button that clears what was typed.
   * The button only shows while the input has a value. Esc also clears.
   * onClear runs immediately (no debounce) after the input is emptied.
   */
  function clearable(input, onClear) {
    const wrap = el('div', 'lg-clearable' + (input.type === 'date' ? ' lg-clearable-date' : ''));
    if (input.type === 'search') input.type = 'text'; // avoid a second, browser-drawn ×
    const x = el('button', 'lg-clear');
    // drawn rather than typed, so the cross sits exactly in the centre of the circle in every font
    x.innerHTML = '<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" focusable="false"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    x.type = 'button';
    x.tabIndex = -1;
    x.title = 'Clear';
    x.setAttribute('aria-label', 'Clear ' + (input.getAttribute('aria-label') || input.placeholder || 'text'));
    const sync = () => wrap.classList.toggle('lg-has-value', input.value !== '');
    const clear = () => {
      input.value = '';
      sync();
      input.focus();
      if (onClear) onClear();
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value !== '') { e.preventDefault(); e.stopPropagation(); clear(); }
    });
    x.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
    x.addEventListener('click', (e) => { e.stopPropagation(); clear(); });
    wrap.append(input, x);
    sync();
    return wrap;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ---------- aggregation functions ---------- */
  const AGGS = {
    sum(vals) { let s = 0, n = 0; for (const v of vals) if (isNum(v)) { s += v; n++; } return n ? s : null; },
    avg(vals) { let s = 0, n = 0; for (const v of vals) if (isNum(v)) { s += v; n++; } return n ? s / n : null; },
    min(vals) { let m = null; for (const v of vals) if (isNum(v) && (m === null || v < m)) m = v; return m; },
    max(vals) { let m = null; for (const v of vals) if (isNum(v) && (m === null || v > m)) m = v; return m; },
    count(vals) { return vals.length; },
    first(vals) { return vals.length ? vals[0] : null; },
    last(vals) { return vals.length ? vals[vals.length - 1] : null; },
  };

  /* ---------- tiny ZIP (store) writer + CRC32, used for .xlsx ---------- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(files, mime) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    let cdSize = 0;
    for (const p of central) cdSize += p.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: mime || 'application/zip' });
  }
  function colLetter(i) {
    let s = '';
    i++;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function buildXlsx(header, rows, widths, sheetName) {
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const cell = (v, ref, style) => {
      const s = style ? ` s="${style}"` : '';
      if (v == null || v === '') return '';
      if (isNum(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    };
    const lines = [];
    const all = [header].concat(rows);
    all.forEach((r, ri) => {
      const cells = r.map((v, ci) => cell(v, colLetter(ci) + (ri + 1), ri === 0 ? 1 : r._bold ? 1 : 0)).join('');
      lines.push(`<row r="${ri + 1}">${cells}</row>`);
    });
    const last = colLetter(Math.max(0, header.length - 1));
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.round(w / 7))}" customWidth="1"/>`).join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS}" xmlns:r="${NSR}">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${lines.join('')}</sheetData>` +
      `<autoFilter ref="A1:${last}${all.length}"/></worksheet>`;
    const name = xmlEsc((sheetName || 'Sheet1').slice(0, 31));
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS}" xmlns:r="${NSR}"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${last}$${all.length}</definedName></definedNames></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      { name: 'xl/worksheets/sheet1.xml', data: sheet },
    ];
    return zipStore(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /* ---------- SVG: sparklines and charts ---------- */
  const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

  function sparklineSvg(values, cfg, w, h) {
    const nums = values.map(Number).filter((v) => isFinite(v));
    if (!nums.length) return '';
    w = Math.max(24, Math.floor(w));
    h = Math.max(10, Math.floor(h));
    const color = cfg.color || 'var(--lg-accent)';
    let min = Math.min.apply(null, nums), max = Math.max.apply(null, nums);
    const type = cfg.type || 'line';
    if (type === 'bar') { min = Math.min(0, min); max = Math.max(0, max); }
    const span = max - min || 1;
    const X = (i) => (nums.length === 1 ? w / 2 : 2 + (i * (w - 4)) / (nums.length - 1));
    const Y = (v) => 2 + (h - 4) - ((v - min) / span) * (h - 4);
    let body = '';
    if (type === 'bar') {
      const bw = (w - 4) / nums.length;
      const base = Y(0);
      nums.forEach((v, i) => {
        const y = Math.min(base, Y(v)), hh = Math.max(1, Math.abs(Y(v) - base));
        body += `<rect x="${(2 + i * bw + bw * 0.12).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw * 0.76).toFixed(1)}" height="${hh.toFixed(1)}" style="fill:${v < 0 ? '#e15759' : color}"><title>${esc(numFmt.format(v))}</title></rect>`;
      });
    } else {
      const pts = nums.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
      if (type === 'area') {
        body += `<path d="M${X(0).toFixed(1)},${h - 1} L${pts.replace(/ /g, ' L')} L${X(nums.length - 1).toFixed(1)},${h - 1} Z" style="fill:${color};opacity:.18"/>`;
      }
      body += `<polyline points="${pts}" style="fill:none;stroke:${color};stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round"/>`;
      const li = nums.length - 1;
      body += `<circle cx="${X(li).toFixed(1)}" cy="${Y(nums[li]).toFixed(1)}" r="2.2" style="fill:${color}"><title>${esc(numFmt.format(nums[li]))}</title></circle>`;
    }
    return `<svg class="lg-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  }

  function niceTicks(min, max, count) {
    if (min === max) { max = min + 1; }
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function chartSvg(type, cats, series, W, H, dark) {
    const fg = dark ? '#cfd5df' : '#374151';
    const gridC = dark ? '#323844' : '#e5e7eb';
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12" fill="${fg}">`;
    // legend
    const legendItems = type === 'pie' ? cats : series.map((x) => x.name);
    let lx = 16, ly = 18;
    legendItems.forEach((name, i) => {
      const label = String(name).slice(0, 28);
      const wItem = 22 + label.length * 6.6;
      if (lx + wItem > W - 10) { lx = 16; ly += 18; }
      s += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${PALETTE[i % PALETTE.length]}"/><text x="${lx + 16}" y="${ly}">${esc(label)}</text>`;
      lx += wItem + 10;
    });
    const top = ly + 20;
    if (type === 'pie') {
      const vals = (series[0] ? series[0].values : []).map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = W / 2, cy = top + (H - top) / 2, r = Math.min(W, H - top) / 2 - 34;
      let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const a1 = a0 + (v / total) * Math.PI * 2;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const pct = ((v / total) * 100).toFixed(1) + '%';
        const path = vals.length === 1
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[0]}"/>`
          : `<path d="M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${PALETTE[i % PALETTE.length]}" stroke="${dark ? '#1f232b' : '#fff'}" stroke-width="1.5"><title>${esc(cats[i])}: ${esc(numFmt.format(v))} (${pct})</title></path>`;
        s += path;
        if (v / total > 0.04) {
          const am = (a0 + a1) / 2;
          s += `<text x="${(cx + (r + 16) * Math.cos(am)).toFixed(1)}" y="${(cy + (r + 16) * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" font-size="11">${pct}</text>`;
        }
        a0 = a1;
      });
      return s + '</svg>';
    }
    const pad = { l: 64, r: 18, t: top, b: 70 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    let min = 0, max = 0;
    if (type === 'stacked') {
      cats.forEach((_, i) => {
        let pos = 0, neg = 0;
        series.forEach((sr) => { const v = sr.values[i]; if (v >= 0) pos += v; else neg += v; });
        max = Math.max(max, pos); min = Math.min(min, neg);
      });
    } else {
      series.forEach((sr) => sr.values.forEach((v) => { max = Math.max(max, v); min = Math.min(min, v); }));
    }
    const ticks = niceTicks(min, max, 5);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const Y = (v) => pad.t + ph - ((v - y0) / (y1 - y0 || 1)) * ph;
    ticks.forEach((t) => {
      const y = Y(t).toFixed(1);
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${gridC}"/>`;
      s += `<text x="${pad.l - 8}" y="${+y + 4}" text-anchor="end" font-size="11">${esc(compactFmt.format(t))}</text>`;
    });
    const n = Math.max(1, cats.length);
    const band = pw / n;
    const base = Y(clamp(0, y0, y1));
    if (type === 'bar' || type === 'stacked') {
      const gw = band * 0.78;
      cats.forEach((c, i) => {
        let acc = 0, accNeg = 0;
        series.forEach((sr, si) => {
          const v = sr.values[i] || 0;
          let x, w, ya, yb;
          if (type === 'stacked') {
            x = pad.l + band * i + (band - gw) / 2; w = gw;
            if (v >= 0) { ya = Y(acc + v); yb = Y(acc); acc += v; } else { ya = Y(accNeg); yb = Y(accNeg + v); accNeg += v; }
          } else {
            w = gw / series.length; x = pad.l + band * i + (band - gw) / 2 + si * w;
            ya = Math.min(Y(v), base); yb = Math.max(Y(v), base);
          }
          s += `<rect x="${x.toFixed(1)}" y="${ya.toFixed(1)}" width="${Math.max(1, w - 1).toFixed(1)}" height="${Math.max(0.5, yb - ya).toFixed(1)}" fill="${PALETTE[si % PALETTE.length]}" rx="1.5"><title>${esc(c)} · ${esc(sr.name)}: ${esc(numFmt.format(v))}</title></rect>`;
        });
      });
    } else {
      series.forEach((sr, si) => {
        const col = PALETTE[si % PALETTE.length];
        const pts = sr.values.map((v, i) => [pad.l + band * (i + 0.5), Y(v)]);
        if (type === 'area' && pts.length) {
          s += `<path d="M${pts[0][0].toFixed(1)},${base.toFixed(1)} ${pts.map((p) => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} L${pts[pts.length - 1][0].toFixed(1)},${base.toFixed(1)} Z" fill="${col}" opacity="0.22"/>`;
        }
        s += `<polyline points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>`;
        if (pts.length <= 60) pts.forEach((p, i) => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${col}"><title>${esc(cats[i])} · ${esc(sr.name)}: ${esc(numFmt.format(sr.values[i]))}</title></circle>`; });
      });
    }
    s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${base.toFixed(1)}" y2="${base.toFixed(1)}" stroke="${fg}" stroke-opacity=".5"/>`;
    const every = Math.ceil(n / Math.max(1, Math.floor(pw / 26)));
    const rotate = band < 64;
    cats.forEach((c, i) => {
      if (i % every) return;
      const x = pad.l + band * (i + 0.5), y = pad.t + ph + 16;
      const label = esc(String(c).slice(0, 18));
      s += rotate
        ? `<text x="${x.toFixed(1)}" y="${y}" text-anchor="end" font-size="11" transform="rotate(-38 ${x.toFixed(1)} ${y})">${label}</text>`
        : `<text x="${x.toFixed(1)}" y="${y}" text-anchor="middle" font-size="11">${label}</text>`;
    });
    return s + '</svg>';
  }

  // wrapped cells: line height, vertical padding, and horizontal padding (cell padding + a little slack)
  const WRAP_LINE = 18, WRAP_VPAD = 7, WRAP_HPAD = 22;

  const FUNNEL_SVG = '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5z"/></svg>';

  const FILTER_OPS = {
    text: [['contains', 'Contains'], ['notContains', 'Does not contain'], ['equals', 'Equals'], ['notEqual', 'Does not equal'], ['startsWith', 'Starts with'], ['endsWith', 'Ends with'], ['blank', 'Blank'], ['notBlank', 'Not blank']],
    number: [['eq', 'Equals'], ['ne', 'Does not equal'], ['gt', 'Greater than'], ['gte', 'Greater than or equal'], ['lt', 'Less than'], ['lte', 'Less than or equal'], ['between', 'Between'], ['blank', 'Blank'], ['notBlank', 'Not blank']],
    date: [['eq', 'On'], ['ne', 'Not on'], ['lt', 'Before'], ['gt', 'After'], ['between', 'Between'], ['blank', 'Blank'], ['notBlank', 'Not blank']],
  };

  const DEFAULTS = {
    columns: [],
    rows: [],
    rowId: null,
    rowHeight: 34,
    headerHeight: 38,
    groupHeaderHeight: 30,
    floatingFilterHeight: 34,
    detailHeight: 280,
    selection: null, // 'single' | 'multiple'
    rowClickSelection: false,
    groupBy: null,
    pivotBy: null,
    pivotMode: false,
    groupDefaultExpanded: 0,
    hideGroupedColumns: true,
    groupColumnHeader: 'Group',
    groupColumnWidth: 240,
    groupPanel: true,
    sideBar: false, // false | true (closed) | 'open'
    statusBar: true,
    toolbar: true, // true = all items, or { quickFilter, find, undoRedo, expandCollapse, export, panels }
    floatingFilters: true,
    pagination: false,
    pageSize: 100,
    treeData: false,
    getTreePath: null,
    treeColumnHeader: 'Hierarchy',
    masterDetail: false,
    detailRenderer: null,
    totalsRow: false,
    theme: 'light',
    flashChanges: true,
    rowClass: null,
    externalFilter: null,
    emptyMessage: 'No rows to show',
    contextMenuItems: null,
    exportFileName: 'export',
    rowReorder: false,
    rangeSelection: true,
    fillHandle: true,
    contextMenu: true,
    columnMenu: true,
    columnMove: true,
    readOnly: false,
    wrapText: false, // wrap long text in every plain-text column (columns can override with wrap: true/false)
  };

  /* =====================================================================
   * LatticeGrid
   * ===================================================================== */
  class LatticeGrid {
    constructor(container, options) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('LatticeGrid: container not found');
      this.o = Object.assign({}, DEFAULTS, options || {});
      this._listeners = {};
      this.cols = [];
      this.colMap = new Map();
      this.filters = new Map();
      this.sorts = [];
      this.quickFilter = '';
      this._qWords = [];
      this.expandState = new Map();
      this.detailOpen = new Set();
      this.selected = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this.flash = new Map();
      this.find = { term: '', matches: [], index: -1 };
      this.focus = null;
      this.rangeEnd = null;
      this.range = null;
      this.page = 0;
      this.editing = null;
      this._detailCache = new Map();
      this._uvCache = new Map();
      this._genMap = new Map();
      this._genWidths = new Map();
      this.pivotGenCols = [];
      this.pivotMode = !!this.o.pivotMode;
      this._sideOpen = this.o.sideBar === 'open';
      this._sideTab = 'columns';
      this._openFilterSecs = new Set();
      this.display = [];
      this.allDisplay = [];
      this.visible = [];
      this.offsets = new Float64Array(1);
      this.totalHeight = 0;
      this.headerHeightTotal = 0;

      this._dragCol = { special: 'drag', id: '__drag', header: '', width: 34, minWidth: 34, flex: 0, pinned: 'left', resizable: false, sortable: false, filterType: null, def: {} };
      this._selCol = { special: 'sel', id: '__sel', header: '', width: 44, minWidth: 44, flex: 0, pinned: 'left', resizable: false, sortable: false, filterType: null, def: {} };
      this._groupCol = { special: 'group', id: '__group', header: this.o.treeData ? this.o.treeColumnHeader : this.o.groupColumnHeader, width: this.o.groupColumnWidth, minWidth: 100, flex: 0, pinned: 'left', resizable: true, sortable: true, filterType: null, def: {} };

      this._initColumns(this.o.columns);
      this._initialState = this.getState();
      this._buildDom();
      this.setRows(this.o.rows || []);
    }

    /* ---------------- events ---------------- */
    on(name, fn) { (this._listeners[name] = this._listeners[name] || []).push(fn); return this; }
    off(name, fn) { const l = this._listeners[name]; if (l) this._listeners[name] = l.filter((f) => f !== fn); return this; }
    emit(name, payload) { (this._listeners[name] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); }

    /* ---------------- columns ---------------- */
    _initColumns(defs) {
      const add = (d, groupHeader) => {
        if (d.children) { d.children.forEach((c) => add(c, d.header)); return; }
        const id = d.id || d.field || 'col' + this.cols.length;
        const type = d.type || 'text';
        const col = {
          def: d, id, field: d.field || id,
          header: d.header != null ? d.header : d.field || id,
          type,
          width: d.width || 150,
          minWidth: d.minWidth || 48,
          flex: d.flex || 0,
          pinned: d.pinned || null,
          hidden: !!d.hidden,
          sortable: d.sortable !== false,
          resizable: d.resizable !== false,
          filterType: d.filter === false ? null : d.filter || (type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'boolean' ? 'set' : 'text'),
          agg: d.aggregate || null,
          groupHeader: groupHeader || null,
          groupable: d.groupable !== false,
          pivotable: d.pivotable !== false,
          wrap: d.wrap == null ? null : !!d.wrap, // null = follow the grid's wrapText option
        };
        if (d.sort) this.sorts.push({ id, dir: d.sort });
        this.cols.push(col);
        this.colMap.set(id, col);
      };
      (defs || []).forEach((d) => add(d, null));
      const byIndex = (key) => this.cols.filter((c) => c.def[key] != null).sort((a, b) => a.def[key] - b.def[key]).map((c) => c.id);
      this.groupCols = (this.o.groupBy || byIndex('groupIndex')).filter((id) => this.colMap.has(id));
      this.pivotCols = (this.o.pivotBy || byIndex('pivotIndex')).filter((id) => this.colMap.has(id));
    }

    _colById(id) {
      if (id === '__sel') return this._selCol;
      if (id === '__drag') return this._dragCol;
      if (id === '__group') return this._groupCol;
      return this.colMap.get(id) || this._genMap.get(id) || null;
    }

    _computeVisibleCols() {
      const list = [];
      if (this.o.rowReorder) list.push(this._dragCol);
      if (this.o.selection) list.push(this._selCol);
      const grouping = this.groupCols.length > 0 || this.o.treeData || this.pivotMode;
      if (grouping) list.push(this._groupCol);
      if (this.pivotMode) {
        if (this.pivotGenCols.length) list.push.apply(list, this.pivotGenCols);
        else list.push.apply(list, this.cols.filter((c) => c.agg && !c.hidden));
      } else {
        for (const c of this.cols) {
          if (c.hidden) continue;
          if (this.o.hideGroupedColumns && this.groupCols.indexOf(c.id) >= 0) continue;
          list.push(c);
        }
      }
      const L = list.filter((c) => c.pinned === 'left');
      const R = list.filter((c) => c.pinned === 'right');
      const C = list.filter((c) => c.pinned !== 'left' && c.pinned !== 'right');
      return L.concat(C, R);
    }

    _layout() {
      const vis = this._computeVisibleCols();
      const avail = this.viewport.clientWidth;
      let fixed = 0, flexSum = 0;
      for (const c of vis) { if (c.flex) flexSum += c.flex; else fixed += c.width; }
      const rest = Math.max(0, avail - fixed);
      let x = 0;
      for (const c of vis) {
        c.w = c.flex ? Math.max(c.minWidth, Math.floor((rest * c.flex) / flexSum)) : Math.max(c.minWidth, c.width);
        c.x = x;
        x += c.w;
        c.lastLeft = c.firstRight = false;
      }
      let l = 0, lastL = null;
      for (const c of vis) if (c.pinned === 'left') { c.stickyLeft = l; l += c.w; lastL = c; }
      if (lastL) lastL.lastLeft = true;
      let r = 0, firstR = null;
      for (let i = vis.length - 1; i >= 0; i--) { const c = vis[i]; if (c.pinned === 'right') { c.stickyRight = r; r += c.w; firstR = c; } }
      if (firstR) firstR.firstRight = true;
      this.leftWidth = l;
      this.rightWidth = r;
      this.totalWidth = x;
      this.visible = vis;
      this.canvas.style.width = x + 'px';
      const gi = vis.indexOf(this._groupCol);
      this._mdCol = gi >= 0 ? gi : vis.findIndex((c) => !this._isUtil(c));
      if (this.display) this._computeOffsets();
    }

    /* ---------------- values ---------------- */
    _val(col, data) {
      if (data == null) return null;
      if (col.def && col.def.getValue) return col.def.getValue(data);
      return getPath(data, col.field);
    }
    _isUtil(col) { return col.special === 'sel' || col.special === 'drag'; }
    _isGroupLike(n) { return !!(n.group || (n.tree && n.children.length)); }
    _cellValue(col, n) {
      if (col.generated) return n.agg ? n.agg[col.aggKey] : null;
      if (col.special === 'group') return n.group || n.tree ? n.key : null;
      if (col.special) return null;
      if (n.group) {
        if (col.agg && n.agg && col.id in n.agg) return n.agg[col.id];
        if (n.col && n.col.id === col.id) return n.key;
        return null;
      }
      if (n.tree && n.children.length && col.agg && n.agg && n.agg[col.id] != null) return n.agg[col.id];
      return n.data ? this._val(col, n.data) : null;
    }
    _fmt(col, v, data, aggCell) {
      if (col.generated) {
        const vc = col.valueCol;
        if (vc && vc.agg === 'count') return defaultFormat(v, 'number');
        return vc && vc.def.format ? String(vc.def.format(v, null) ?? '') : defaultFormat(v, 'number');
      }
      if (aggCell && col.agg === 'count') return defaultFormat(v, 'number');
      if (col.def && col.def.format) {
        try { const s = col.def.format(v, data); return s == null ? '' : String(s); } catch (e) { return v == null ? '' : String(v); }
      }
      return defaultFormat(v, col.type);
    }
    _cellText(col, e) {
      const n = e.node;
      if (this._isUtil(col)) return '';
      if (col.special === 'group') {
        if (e.kind === 'total') return 'Total';
        return (n.group || n.tree) && n.keyText != null ? n.keyText : '';
      }
      const v = this._cellValue(col, n);
      const aggCell = e.kind === 'total' || n.group || (n.tree && n.children.length > 0 && !!col.agg);
      return this._fmt(col, v, aggCell ? null : n.data, aggCell);
    }
    _setKey(col, v) {
      if (v == null || v === '') return '(Blanks)';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v);
    }
    _editorType(col) {
      if (col.def.editor) return col.def.editor;
      return col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : col.type === 'boolean' ? 'checkbox' : 'text';
    }
    _parse(col, s, type) {
      if (col.def.parse) return col.def.parse(s);
      if (typeof s !== 'string') return s;
      if (type === 'number') { const t = s.replace(/[,\s$€£%]/g, ''); return t === '' ? null : Number(t); }
      if (type === 'checkbox') return /^(true|yes|y|1|✓|x)$/i.test(s.trim());
      if (type === 'date') {
        const t = s.trim();
        if (!t) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
        const ms = Date.parse(t);
        return isNaN(ms) ? t : new Date(ms).toISOString().slice(0, 10);
      }
      return s;
    }
    _isEditable(col, e) {
      if (this.o.readOnly || !e || !col || col.special || col.generated || !col.def) return false;
      const n = e.node;
      if (!n.data) return false;
      if (e.kind !== 'leaf' && !(n.tree && !col.agg)) return false;
      const ed = col.def.editable;
      return typeof ed === 'function' ? !!ed(n.data) : !!ed;
    }

    /* ---------------- data ---------------- */
    setRows(rows) {
      this.rows = rows || [];
      const idFn = this.o.rowId;
      this.nodes = this.rows.map((d, i) => ({ id: idFn ? String(idFn(d)) : 'r' + i, data: d, leaf: true }));
      this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
      this._uvCache.clear();
      this._detailCache.clear();
      this.undoStack = [];
      this.redoStack = [];
      this.refresh();
    }
    getRows() { return this.rows; }
    addRows(rows) {
      const idFn = this.o.rowId;
      rows.forEach((d) => {
        this.rows.push(d);
        const n = { id: idFn ? String(idFn(d)) : 'r' + this.nodes.length + '_' + Date.now(), data: d, leaf: true };
        this.nodes.push(n);
        this.nodeById.set(n.id, n);
      });
      this._uvCache.clear();
      this.refresh();
    }
    removeRows(predicateOrIds) {
      const pred = typeof predicateOrIds === 'function' ? predicateOrIds : ((ids) => (d, n) => ids.indexOf(n.id) >= 0)(predicateOrIds.map(String));
      const keep = [];
      this.nodes.forEach((n) => { if (pred(n.data, n)) { this.nodeById.delete(n.id); this.selected.delete(n.id); } else keep.push(n); });
      this.nodes = keep;
      this.rows = keep.map((n) => n.data);
      this._uvCache.clear();
      this.refresh();
    }
    /** Merge partial row objects into existing rows (matched with options.rowId), flashing changed cells. */
    updateRows(partials, opts) {
      if (!this.o.rowId) throw new Error('updateRows requires the rowId option');
      const cols = this.cols;
      for (const p of partials) {
        const n = this.nodeById.get(String(this.o.rowId(p)));
        if (!n) continue;
        const before = cols.map((c) => this._val(c, n.data));
        Object.assign(n.data, p);
        delete n._q;
        cols.forEach((c, i) => {
          const after = this._val(c, n.data);
          if (!same(before[i], after) && !Array.isArray(after)) this._flashCell(n, c, before[i], after);
        });
      }
      this._uvCache.clear();
      if (opts && opts.refresh) { this.refresh({ side: false }); return; }
      this._refreshAggregates();
      if (this._hasWrap) { for (const p of partials) this._hFix.delete(String(this.o.rowId(p))); this._computeOffsets(); }
      this._renderRows();
      this._renderFooter();
      this._renderStatus();
    }

    /* ---------------- pipeline ---------------- */
    refresh(opts) {
      opts = opts || {};
      if (this.editing) this.stopEdit(true, true);
      this._runPipeline();
      this._afterModelChange();
      if (opts.side !== false) this._renderSideBar();
    }
    _afterModelChange() {
      this._layout();
      this._clampFocus();
      this._recomputeFind();
      this._renderAll();
    }
    _renderAll() {
      this._renderGroupPanel();
      this._renderHeader();
      this._renderRows();
      this._renderFooter();
      this._renderStatus();
      this._renderPager();
    }
    _clampFocus() {
      if (!this.focus) return;
      if (this.focus.r >= this.display.length || this.focus.c >= this.visible.length) {
        this.focus = this.rangeEnd = this.range = null;
        return;
      }
      this.rangeEnd = this.focus;
      this.range = { r1: this.focus.r, r2: this.focus.r, c1: this.focus.c, c2: this.focus.c };
    }

    _runPipeline() {
      const o = this.o;
      if (this.quickFilter) this._qWords = this.quickFilter.toLowerCase().split(/\s+/).filter(Boolean);
      const passing = [];
      for (const n of this.nodes) if (this._passes(n)) passing.push(n);
      this.filteredLeafs = passing;
      this.valueCols = this.cols.filter((c) => c.agg);

      // pivot columns
      this._genMap = new Map();
      this.pivotGenCols = [];
      if (this.pivotMode && this.pivotCols.length && this.valueCols.length) {
        const keys = new Map();
        for (const n of passing) {
          const k = this._pivotKeyOf(n.data);
          if (!keys.has(k)) keys.set(k, this.pivotCols.map((id) => this._val(this.colMap.get(id), n.data)));
        }
        const sorted = Array.from(keys.entries()).sort((a, b) => {
          for (let i = 0; i < a[1].length; i++) { const r = compareValues(a[1][i], b[1][i]); if (r) return r; }
          return 0;
        });
        const mk = (id, header, groupHeader, vc, aggKey) => {
          const c = { generated: true, id, header, groupHeader, valueCol: vc, aggKey, type: 'number', width: this._genWidths.get(id) || 130, minWidth: 60, flex: 0, pinned: null, sortable: true, resizable: true, filterType: null, def: {} };
          this._genMap.set(id, c);
          this.pivotGenCols.push(c);
        };
        for (const [k] of sorted) {
          for (const vc of this.valueCols) mk('p\u0001' + k + '\u0001' + vc.id, this._aggLabel(vc), k, vc, 'p\u0001' + k + '\u0001' + vc.id);
        }
        for (const vc of this.valueCols) mk('t\u0001' + vc.id, this._aggLabel(vc), 'Totals', vc, vc.id);
      }

      let top;
      if (o.treeData && o.getTreePath) top = this._buildTree(passing);
      else if (this.groupCols.length) top = this._buildGroups(passing, 0, '');
      else if (this.pivotMode) top = [{ group: true, id: 'g:__all', key: 'Total', keyText: 'Total', level: 0, leafs: passing, children: [], agg: {} }];
      else top = passing.slice();

      this.root = { group: true, id: '__root', key: 'Total', keyText: 'Total', level: -1, leafs: passing, children: top, agg: {} };
      this._aggregate(top);
      this._computeAgg(this.root);
      this._sortNodes(top);
      this.topNodes = top;
      this._flatten();
    }

    _aggLabel(vc) { return vc.header + ' (' + (typeof vc.agg === 'string' ? vc.agg : 'custom') + ')'; }
    _pivotKeyOf(data) {
      return this.pivotCols.map((id) => {
        const c = this.colMap.get(id);
        const v = this._val(c, data);
        return v == null || v === '' ? '(Blank)' : this._fmt(c, v, data);
      }).join(' › ');
    }

    _passes(n) {
      for (const [id, m] of this.filters) {
        const c = this.colMap.get(id);
        if (c && !this._matchFilter(c, m, this._val(c, n.data))) return false;
      }
      if (this.o.externalFilter && !this.o.externalFilter(n.data)) return false;
      if (this.quickFilter) {
        if (n._q == null) n._q = this.cols.map((c) => this._fmt(c, this._val(c, n.data), n.data)).join('\u0001').toLowerCase();
        for (const w of this._qWords) if (n._q.indexOf(w) < 0) return false;
      }
      return true;
    }

    _matchFilter(col, m, v) {
      if (m.type === 'set') {
        if (!m._set) Object.defineProperty(m, '_set', { value: new Set(m.values), enumerable: false });
        return m._set.has(this._setKey(col, v));
      }
      if (m.type === 'text') {
        const s = v == null ? '' : String(v).toLowerCase();
        const q = String(m.value == null ? '' : m.value).toLowerCase();
        switch (m.op) {
          case 'contains': return s.indexOf(q) >= 0;
          case 'notContains': return s.indexOf(q) < 0;
          case 'equals': return s === q;
          case 'notEqual': return s !== q;
          case 'startsWith': return s.startsWith(q);
          case 'endsWith': return s.endsWith(q);
          case 'blank': return s === '';
          case 'notBlank': return s !== '';
        }
        return true;
      }
      let x, a, b;
      if (m.type === 'number') {
        x = typeof v === 'number' ? v : v == null || v === '' ? null : Number(v);
        a = Number(m.value); b = Number(m.value2);
      } else {
        x = toTime(v); a = toTime(m.value); b = toTime(m.value2);
      }
      const blank = x == null || isNaN(x);
      if (m.op === 'blank') return blank;
      if (m.op === 'notBlank') return !blank;
      if (blank) return false;
      switch (m.op) {
        case 'eq': return x === a;
        case 'ne': return x !== a;
        case 'gt': return x > a;
        case 'gte': return x >= a;
        case 'lt': return x < a;
        case 'lte': return x <= a;
        case 'between': return x >= Math.min(a, b) && x <= Math.max(a, b);
      }
      return true;
    }

    _buildGroups(leafs, level, path) {
      const col = this.colMap.get(this.groupCols[level]);
      const map = new Map();
      for (const n of leafs) {
        const v = this._val(col, n.data);
        const k = v == null || v === '' ? '' : v instanceof Date ? v.toISOString() : String(v);
        let g = map.get(k);
        if (!g) {
          g = { group: true, key: v, keyText: k === '' ? '(Blank)' : this._fmt(col, v, n.data), col, level, leafs: [], children: null, agg: {} };
          g.id = path + '|' + col.id + '=' + k;
          map.set(k, g);
        }
        g.leafs.push(n);
      }
      const out = Array.from(map.values());
      const deeper = level + 1 < this.groupCols.length;
      for (const g of out) g.children = deeper ? this._buildGroups(g.leafs, level + 1, g.id) : this.pivotMode ? [] : g.leafs.slice();
      return out;
    }

    _buildTree(passing) {
      const getTreePath = this.o.getTreePath;
      const keyOf = (p) => p.join('\u0001');
      const byKey = new Map();
      for (const n of this.nodes) byKey.set(keyOf(getTreePath(n.data)), n);
      const include = new Set(passing);
      if (passing.length !== this.nodes.length) {
        for (const n of passing) {
          const p = getTreePath(n.data);
          for (let i = 1; i < p.length; i++) { const a = byKey.get(keyOf(p.slice(0, i))); if (a) include.add(a); }
        }
      }
      const roots = [];
      const tnodes = new Map();
      const ensure = (p) => {
        const k = keyOf(p);
        let t = tnodes.get(k);
        if (t) return t;
        t = { tree: true, id: 't:' + k, key: p[p.length - 1], keyText: String(p[p.length - 1]), level: p.length - 1, children: [], data: null, src: null, leafs: [], agg: {} };
        tnodes.set(k, t);
        if (p.length === 1) roots.push(t);
        else ensure(p.slice(0, -1)).children.push(t);
        return t;
      };
      for (const n of this.nodes) {
        if (!include.has(n)) continue;
        const t = ensure(getTreePath(n.data));
        t.data = n.data; t.src = n; t.id = n.id;
      }
      const collect = (t) => {
        t.leafs = [];
        for (const c of t.children) { collect(c); if (c.src) t.leafs.push(c.src); for (const l of c.leafs) t.leafs.push(l); }
      };
      roots.forEach(collect);
      return roots;
    }

    _aggregate(nodes) {
      for (const n of nodes) {
        if (n.group || (n.tree && n.children.length)) {
          this._computeAgg(n);
          if (n.children && n.children.length && (n.children[0].group || n.children[0].tree)) this._aggregate(n.children);
        }
      }
    }
    _refreshAggregates() {
      if (!this.topNodes) return;
      this._aggregate(this.topNodes);
      this._computeAgg(this.root);
    }
    _computeAgg(g) {
      g.agg = {};
      const vcs = this.valueCols;
      if (!vcs || !vcs.length) return;
      const fnOf = (c) => (typeof c.agg === 'function' ? c.agg : AGGS[c.agg]);
      // tree parents that carry their own data roll up themselves + descendants
      const members = g.tree && g.src ? [g.src].concat(g.leafs) : g.leafs;
      for (const c of vcs) {
        const fn = fnOf(c);
        if (fn) g.agg[c.id] = fn(members.map((l) => this._val(c, l.data)));
      }
      if (this.pivotMode && this.pivotCols.length) {
        const buckets = new Map();
        for (const l of g.leafs) {
          const k = this._pivotKeyOf(l.data);
          let b = buckets.get(k);
          if (!b) { b = []; buckets.set(k, b); }
          b.push(l);
        }
        for (const [k, ls] of buckets) {
          for (const c of vcs) { const fn = fnOf(c); if (fn) g.agg['p\u0001' + k + '\u0001' + c.id] = fn(ls.map((l) => this._val(c, l.data))); }
        }
      }
    }

    _sortValue(col, n) {
      if (col.special === 'group') return n.group || n.tree ? n.key : null;
      if (n.group && n.col && n.col.id === col.id) return n.key;
      return this._cellValue(col, n);
    }
    _sortNodes(list) {
      const sorts = this.sorts.map((s) => ({ s, col: this._colById(s.id) })).filter((x) => x.col);
      if (!sorts.length) return;
      const cmp = (a, b) => {
        for (const { s, col } of sorts) {
          const va = this._sortValue(col, a), vb = this._sortValue(col, b);
          const r = col.def && col.def.comparator ? col.def.comparator(va, vb, a.data, b.data) : compareValues(va, vb);
          if (r) return s.dir === 'desc' ? -r : r;
        }
        return 0;
      };
      const rec = (arr) => {
        arr.sort(cmp);
        for (const n of arr) if (n.children && n.children.length) rec(n.children);
      };
      rec(list);
    }

    _isExpanded(n) {
      if (this.expandState.has(n.id)) return this.expandState.get(n.id);
      const d = this.o.groupDefaultExpanded;
      return d === -1 || n.level < d;
    }

    _flatten() {
      const out = [];
      const md = this.o.masterDetail;
      const walk = (arr, level) => {
        for (const n of arr) {
          const isG = this._isGroupLike(n);
          const lvl = n.group || n.tree ? n.level : level;
          out.push({ node: n, kind: isG ? 'group' : 'leaf', level: lvl });
          if (isG) {
            if (n.children.length && this._isExpanded(n)) walk(n.children, lvl + 1);
          } else if (md && this.detailOpen.has(n.id)) {
            out.push({ node: n, kind: 'detail', level: lvl });
          }
        }
      };
      walk(this.topNodes || [], 0);
      this.allDisplay = out;
      if (this.o.pagination) {
        const size = this.o.pageSize;
        const pages = Math.max(1, Math.ceil(out.length / size));
        this.page = clamp(this.page, 0, pages - 1);
        this.display = out.slice(this.page * size, (this.page + 1) * size);
      } else {
        this.display = out;
      }
      this._computeOffsets();
    }

    /* ---------------- row heights & text wrapping ---------------- */
    _isWrap(col) {
      if (!col || col.special || col.generated || !col.def || col.def.sparkline) return false;
      if (col.wrap != null) return col.wrap;
      return !!this.o.wrapText && !col.def.render;
    }
    /**
     * Works out every displayed row's top position. Rows are rowHeight tall unless a wrapped
     * cell needs more lines; those heights are estimated by measuring the text with a canvas
     * (fast, no DOM), then corrected after rendering if the browser wrapped differently.
     */
    _computeOffsets() {
      const o = this.o, disp = this.display;
      const wrapCols = (this.visible || []).filter((c) => this._isWrap(c) && c.w);
      this._hasWrap = wrapCols.length > 0;
      const sig = wrapCols.map((c) => c.id + ':' + c.w).join(',');
      if (sig !== this._wrapSig || !this._hFix) { this._wrapSig = sig; this._hFix = new Map(); }
      if (this._hasWrap) {
        const ctx = this._measureCtx();
        const cs = getComputedStyle(this.rootEl);
        ctx.font = cs.fontSize + ' ' + cs.fontFamily;
        if (this._lineFont !== ctx.font) { this._lineFont = ctx.font; this._lineCache = new Map(); }
      }
      const offs = new Float64Array(disp.length + 1);
      let y = 0;
      for (let i = 0; i < disp.length; i++) {
        const e = disp[i];
        offs[i] = y;
        let h = e.kind === 'detail' ? o.detailHeight : o.rowHeight;
        if (this._hasWrap && e.kind !== 'detail') h = Math.max(h, this._wrapHeight(e, wrapCols));
        y += h;
      }
      offs[disp.length] = y;
      this.offsets = offs;
      this.totalHeight = y;
    }
    _measureCtx() {
      if (!this._mctx) this._mctx = document.createElement('canvas').getContext('2d');
      return this._mctx;
    }
    _wrapHeight(e, cols) {
      let lines = 1;
      for (const c of cols) {
        const t = this._cellText(c, e);
        if (!t) continue;
        let n = this._countLines(t, c.w - WRAP_HPAD);
        if (c.def.maxLines) n = Math.min(n, c.def.maxLines);
        if (n > lines) lines = n;
      }
      let h = lines > 1 ? lines * WRAP_LINE + WRAP_VPAD * 2 + 1 : 0;
      const fix = this._hFix.get(e.node.id);
      if (fix && fix > h) h = fix;
      return h;
    }
    /** Number of lines `text` takes when word-wrapped to `width` pixels (long words break). */
    _countLines(text, width) {
      width = Math.max(10, width);
      const key = width + '|' + text;
      const hit = this._lineCache.get(key);
      if (hit) return hit;
      const ctx = this._mctx;
      const space = ctx.measureText(' ').width;
      let lines = 0;
      for (const para of String(text).split('\n')) {
        lines++;
        let cur = 0;
        for (const word of para.split(/\s+/)) {
          if (!word) continue;
          let w = ctx.measureText(word).width;
          if (cur > 0 && cur + space + w <= width) { cur += space + w; continue; }
          if (cur > 0) lines++;
          if (w > width) { const extra = Math.ceil(w / width) - 1; lines += extra; w -= extra * width; }
          cur = w;
        }
      }
      if (this._lineCache.size > 200000) this._lineCache.clear();
      this._lineCache.set(key, lines);
      return lines;
    }
    /** After rendering, grow any row whose wrapped text needs more room than estimated. */
    _fixWrapHeights() {
      if (!this._hasWrap || this._fixingWrap) return;
      let changed = false;
      for (const row of this.bodyEl.children) {
        const r = +row.dataset.r;
        const e = this.display[r];
        if (!e || e.kind === 'detail') continue;
        const cur = this.offsets[r + 1] - this.offsets[r];
        let need = 0;
        row.querySelectorAll('.lg-cell.lg-wrap > .lg-txt:not(.lg-clamp)').forEach((t) => { need = Math.max(need, t.scrollHeight + 1); });
        if (need > cur + 0.5) { this._hFix.set(e.node.id, need); changed = true; }
      }
      if (changed) {
        this._computeOffsets();
        this._fixingWrap = true;
        this._rendered = null;
        this._renderRows();
        this._fixingWrap = false;
      }
    }
    /** Turn wrapping on/off for one column (null = follow the grid-wide wrapText option). */
    setColumnWrap(id, on) {
      const c = this.colMap.get(id);
      if (!c) return;
      c.wrap = on == null ? null : !!on;
      this._wrapSig = null;
      this._afterModelChange();
    }
    /** Turn wrapping on/off for every plain-text column that has no wrap setting of its own. */
    setWrapText(on) {
      this.o.wrapText = !!on;
      this._wrapSig = null;
      this._afterModelChange();
    }
    _rowAtY(y) {
      const offs = this.offsets;
      let lo = 0, hi = this.display.length - 1;
      if (hi < 0) return 0;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offs[mid] <= y) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    /* =====================================================================
     * DOM construction
     * ===================================================================== */
    _themeClass() { return this.o.theme === 'dark' ? 'lg-theme-dark' : 'lg-theme-light'; }

    _buildDom() {
      const root = (this.rootEl = el('div', 'lg-root ' + this._themeClass()));
      this.container.innerHTML = '';
      this.container.appendChild(root);
      if (this.o.toolbar) root.appendChild(this._buildToolbar());
      if (!this._toolbarHas('quickFilter')) this.quickInput = null;
      if (this.o.groupPanel) {
        this.groupPanel = el('div', 'lg-group-panel');
        this.groupPanel.dataset.dropZone = 'group';
        root.appendChild(this.groupPanel);
      }
      const main = el('div', 'lg-main');
      root.appendChild(main);
      const vp = (this.viewport = el('div', 'lg-viewport'));
      vp.tabIndex = 0;
      vp.setAttribute('role', 'grid');
      main.appendChild(vp);
      this.canvas = el('div', 'lg-canvas');
      vp.appendChild(this.canvas);
      this.headerEl = el('div', 'lg-header');
      this.bodyEl = el('div', 'lg-body');
      this.footerEl = el('div', 'lg-footer');
      this.canvas.append(this.headerEl, this.bodyEl, this.footerEl);
      this.overlayEl = el('div', 'lg-overlay', this.o.emptyMessage);
      main.appendChild(this.overlayEl);
      if (this.o.sideBar) {
        this.sideBar = el('div', 'lg-sidebar');
        main.appendChild(this.sideBar);
      }
      if (this.o.pagination) this._ensurePager();
      if (this.o.statusBar) { this.statusEl = el('div', 'lg-status'); root.appendChild(this.statusEl); }
      if (this.pagerEl && this.statusEl) root.insertBefore(this.pagerEl, this.statusEl);
      this._bindEvents();
      this._lastVpW = -1;
      this._ro = new ResizeObserver(() => {
        const w = vp.clientWidth;
        if (w !== this._lastVpW) { this._lastVpW = w; this._layout(); this._renderAll(); }
        else this._renderRows();
      });
      this._ro.observe(vp);
    }

    _toolbarHas(item) {
      const t = this.o.toolbar;
      return t === true || (!!t && typeof t === 'object' && !!t[item]);
    }
    _buildToolbar() {
      const tb = el('div', 'lg-toolbar');
      const has = (k) => this._toolbarHas(k);
      const q = el('input', 'lg-input lg-quick');
      q.type = 'search';
      q.placeholder = 'Quick filter…';
      q.setAttribute('aria-label', 'Quick filter');
      q.addEventListener('input', debounce(() => { if (this.quickFilter !== q.value.trim()) this.setQuickFilter(q.value); }, 160));
      this.quickInput = q;
      const qWrap = clearable(q, () => this.setQuickFilter(''));
      qWrap.classList.add('lg-quick-wrap');
      const fw = el('div', 'lg-find');
      const f = el('input', 'lg-input');
      f.type = 'search';
      f.placeholder = 'Find (Ctrl+F)';
      f.setAttribute('aria-label', 'Find in grid');
      const info = el('span', 'lg-find-info');
      const mkBtn = (label, title, fn, cls) => { const b = el('button', 'lg-btn ' + (cls || ''), label); b.type = 'button'; b.title = title; b.addEventListener('click', fn); return b; };
      f.addEventListener('input', debounce(() => this.setFind(f.value), 160));
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.findNext(e.shiftKey ? -1 : 1); }
      });
      const fWrap = clearable(f, () => this.setFind(''));
      fw.append(fWrap, mkBtn('‹', 'Previous match (Shift+Enter)', () => this.findNext(-1), 'lg-btn-sm'), mkBtn('›', 'Next match (Enter)', () => this.findNext(1), 'lg-btn-sm'), info);
      if (has('quickFilter')) tb.append(qWrap);
      if (has('find')) { this.findInput = f; this.findInfo = info; tb.append(fw); }
      tb.append(el('div', 'lg-spacer'));
      if (has('undoRedo')) tb.append(mkBtn('↶', 'Undo (Ctrl+Z)', () => this.undo()), mkBtn('↷', 'Redo (Ctrl+Y)', () => this.redo()));
      if (has('expandCollapse')) tb.append(mkBtn('Expand', 'Expand all groups', () => this.expandAll()), mkBtn('Collapse', 'Collapse all groups', () => this.collapseAll()));
      if (has('export')) tb.append(mkBtn('CSV', 'Export to CSV', () => this.exportCsv()), mkBtn('Excel', 'Export to Excel (.xlsx)', () => this.exportExcel()));
      if (this.o.sideBar && has('panels')) tb.append(mkBtn('☰ Panels', 'Toggle columns & filters panel', () => this.toggleSideBar()));
      return tb;
    }

    /* =====================================================================
     * Rendering
     * ===================================================================== */
    _cellBase(cls, col) {
      const d = el('div', cls);
      d.style.width = col.w + 'px';
      if (col.pinned === 'left') {
        d.classList.add('lg-pin-l');
        d.style.left = col.stickyLeft + 'px';
        if (col.lastLeft) d.classList.add('lg-pin-l-edge');
      } else if (col.pinned === 'right') {
        d.classList.add('lg-pin-r');
        d.style.right = col.stickyRight + 'px';
        if (col.firstRight) d.classList.add('lg-pin-r-edge');
      }
      return d;
    }

    _renderGroupPanel() {
      const gp = this.groupPanel;
      if (!gp) return;
      gp.innerHTML = '';
      gp.appendChild(el('span', 'lg-gp-icon', '☷'));
      if (this.o.treeData) { gp.appendChild(el('span', 'lg-gp-hint', 'Tree data mode')); return; }
      if (!this.groupCols.length) gp.appendChild(el('span', 'lg-gp-hint', 'Drag a column header here to group rows'));
      this.groupCols.forEach((id, i) => {
        if (i) gp.appendChild(el('span', 'lg-gp-arrow', '›'));
        gp.appendChild(this._chip(id, 'group'));
      });
    }

    _chip(id, zone) {
      const c = this.colMap.get(id);
      const ch = el('span', 'lg-chip');
      ch.draggable = true;
      ch.dataset.chip = id;
      ch.appendChild(el('span', null, c ? c.header : id));
      if (zone === 'value' && c) {
        const sel = el('select');
        ['sum', 'avg', 'min', 'max', 'count', 'first', 'last'].forEach((a) => { const op = el('option', null, a); op.value = a; sel.appendChild(op); });
        sel.value = typeof c.agg === 'string' ? c.agg : 'sum';
        sel.addEventListener('mousedown', (e) => e.stopPropagation());
        sel.addEventListener('change', () => this.setAggregate(id, sel.value));
        ch.appendChild(sel);
      }
      const x = el('button', 'lg-chip-x', '×');
      x.type = 'button';
      x.title = 'Remove';
      x.addEventListener('click', (e) => { e.stopPropagation(); this._removeFromZone(zone, id); });
      ch.appendChild(x);
      ch.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/lg-col', id);
        e.dataTransfer.setData('text/lg-from', zone);
        e.dataTransfer.effectAllowed = 'move';
      });
      ch.addEventListener('dragend', (e) => { if (e.dataTransfer.dropEffect === 'none') this._removeFromZone(zone, id); });
      return ch;
    }

    _renderHeader() {
      const o = this.o;
      const H = this.headerEl;
      const active = document.activeElement;
      let restore = null;
      if (active && active.dataset && active.dataset.ff && H.contains(active)) {
        restore = { id: active.dataset.ff, s: null, e: null, value: active.value };
        try { restore.s = active.selectionStart; restore.e = active.selectionEnd; } catch (err) { /* date inputs */ }
      }
      H.innerHTML = '';
      const vis = this.visible;
      let total = 0;
      if (vis.some((c) => c.groupHeader)) {
        const row = el('div', 'lg-hrow');
        row.style.height = o.groupHeaderHeight + 'px';
        row.style.width = this.totalWidth + 'px';
        let i = 0;
        while (i < vis.length) {
          const c0 = vis[i];
          let j = i, w = 0;
          while (j < vis.length && vis[j].groupHeader === c0.groupHeader && vis[j].pinned === c0.pinned) { w += vis[j].w; j++; }
          const seg = this._cellBase('lg-hcell lg-hgroup-cell', { w, pinned: c0.pinned, stickyLeft: c0.stickyLeft, stickyRight: vis[j - 1].stickyRight, lastLeft: vis[j - 1].lastLeft, firstRight: c0.firstRight });
          seg.textContent = c0.groupHeader || '';
          seg.title = c0.groupHeader || '';
          row.appendChild(seg);
          i = j;
        }
        H.appendChild(row);
        total += o.groupHeaderHeight;
      }
      const main = el('div', 'lg-hrow');
      main.style.height = o.headerHeight + 'px';
      main.style.width = this.totalWidth + 'px';
      vis.forEach((c, i) => main.appendChild(this._headerCell(c, i)));
      H.appendChild(main);
      total += o.headerHeight;
      if (o.floatingFilters && vis.some((c) => c.filterType && !c.special && !c.generated)) {
        const ff = el('div', 'lg-hrow');
        ff.style.height = o.floatingFilterHeight + 'px';
        ff.style.width = this.totalWidth + 'px';
        vis.forEach((c) => ff.appendChild(this._floatingCell(c)));
        H.appendChild(ff);
        total += o.floatingFilterHeight;
      }
      this.headerHeightTotal = total + 1;
      if (restore) {
        const inp = H.querySelector('[data-ff="' + CSS.escape(restore.id) + '"]');
        if (inp) {
          if (inp.value !== restore.value) {
            // keep text typed but not yet applied, and re-queue it so it still takes effect
            inp.value = restore.value;
            inp.dispatchEvent(new Event('input'));
          }
          inp.focus();
          try { if (restore.s != null) inp.setSelectionRange(restore.s, restore.e); } catch (err) { /* ignore */ }
        }
      }
    }

    _headerCell(c, idx) {
      const d = this._cellBase('lg-hcell', c);
      d.dataset.c = idx;
      d.dataset.col = c.id;
      d.setAttribute('role', 'columnheader');
      if (c.special === 'drag') {
        d.classList.add('lg-sel');
        const why = this._reorderBlockReason();
        const ic = el('span', 'lg-drag-hicon' + (why ? ' lg-disabled' : ''), '⇅');
        ic.title = why ? 'Row reordering is paused: ' + why : 'Drag the ⠿ handles to reorder rows';
        d.appendChild(ic);
        return d;
      }
      if (c.special === 'sel') {
        d.classList.add('lg-sel');
        if (this.o.selection === 'multiple') {
          const cb = el('input', 'lg-check');
          cb.type = 'checkbox';
          cb.dataset.selectAll = '1';
          cb.title = 'Select all (filtered)';
          const ids = this.filteredLeafs || [];
          let n = 0;
          for (const x of ids) if (this.selected.has(x.id)) n++;
          cb.checked = n > 0 && n === ids.length;
          cb.indeterminate = n > 0 && n < ids.length;
          d.appendChild(cb);
        }
        return d;
      }
      if (c.sortable) d.classList.add('lg-sortable');
      if (c.type === 'number' || c.generated) d.classList.add('lg-num');
      const label = el('span', 'lg-hlabel', c.header);
      label.title = (c.def && c.def.headerTooltip) || c.header;
      d.appendChild(label);
      const si = this.sorts.findIndex((s) => s.id === c.id);
      if (si >= 0) {
        const s = el('span', 'lg-sort', this.sorts[si].dir === 'asc' ? '▲' : '▼');
        if (this.sorts.length > 1) s.appendChild(el('sub', null, String(si + 1)));
        d.appendChild(s);
      }
      if (this.filters.has(c.id)) { const f = el('span', 'lg-filter-ind'); f.innerHTML = FUNNEL_SVG; f.title = 'Filtered'; d.appendChild(f); }
      if (this.o.columnMenu) {
        const m = el('button', 'lg-hmenu', '⋮');
        m.type = 'button';
        m.title = 'Column menu';
        m.dataset.menu = c.id;
        d.appendChild(m);
      }
      if (c.resizable) { const r = el('div', 'lg-resize'); r.dataset.resize = c.id; d.appendChild(r); }
      return d;
    }

    _floatingCell(c) {
      const d = this._cellBase('lg-hcell lg-ffcell', c);
      if (!c.filterType || c.special || c.generated) return d;
      const m = this.filters.get(c.id);
      if (c.filterType === 'set') {
        const b = el('button', 'lg-btn lg-ff-set', m ? m.values.length + ' selected' : 'All');
        b.type = 'button';
        b.dataset.ffSet = c.id;
        d.appendChild(b);
        return d;
      }
      const inp = el('input', 'lg-input');
      inp.dataset.ff = c.id;
      inp.type = c.filterType === 'date' ? 'date' : 'text';
      inp.placeholder = c.filterType === 'number' ? 'e.g. >100, 5..10' : 'Filter…';
      inp.setAttribute('aria-label', 'Filter ' + c.header);
      inp.value = this._floatingText(c, m);
      inp.addEventListener('input', debounce(() => {
        if (!inp.isConnected) return; // header was re-rendered (e.g. cleared) meanwhile
        const model = this._parseFloating(c, inp.value);
        if (model !== undefined) this.setFilter(c.id, model);
      }, 250));
      d.appendChild(clearable(inp, () => this.setFilter(c.id, null)));
      return d;
    }
    _floatingText(col, m) {
      if (!m) return '';
      if (m.type === 'text') return m.op === 'blank' || m.op === 'notBlank' ? '' : m.value || '';
      if (m.type === 'number') {
        if (m.op === 'between') return m.value + '..' + m.value2;
        const sym = { eq: '', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[m.op];
        return sym == null ? '' : sym + m.value;
      }
      if (m.type === 'date') return m.op === 'eq' ? m.value : '';
      return '';
    }
    _parseFloating(col, s) {
      s = String(s).trim();
      if (!s) return null;
      if (col.filterType === 'text') {
        const prev = this.filters.get(col.id);
        const op = prev && prev.type === 'text' && prev.op !== 'blank' && prev.op !== 'notBlank' ? prev.op : 'contains';
        return { type: 'text', op, value: s };
      }
      if (col.filterType === 'number') {
        let mm = s.match(/^(-?[\d.]+)\s*(?:\.\.|to)\s*(-?[\d.]+)$/i);
        if (mm) return { type: 'number', op: 'between', value: mm[1], value2: mm[2] };
        mm = s.match(/^(>=|<=|!=|<>|=|>|<)?\s*(-?[\d.]+)$/);
        if (!mm) return undefined;
        const op = { '>=': 'gte', '<=': 'lte', '!=': 'ne', '<>': 'ne', '=': 'eq', '>': 'gt', '<': 'lt' }[mm[1]] || 'eq';
        return { type: 'number', op, value: mm[2] };
      }
      if (col.filterType === 'date') return { type: 'date', op: 'eq', value: s };
      return undefined;
    }

    _renderRows(opts) {
      const body = this.bodyEl;
      const vp = this.viewport;
      const len = this.display.length;
      this._dragBlock = this._reorderBlockReason();
      body.style.height = Math.max(this.totalHeight, 1) + 'px';
      this.overlayEl.style.display = len ? 'none' : 'flex';
      if (!len) { body.replaceChildren(); this._rendered = null; return; }
      const top = vp.scrollTop;
      const bottom = top + Math.max(vp.clientHeight - this.headerHeightTotal, 50);
      const needFirst = this._rowAtY(top);
      const needLast = this._rowAtY(bottom);
      if (opts && opts.ifNeeded && this._rendered && needFirst >= this._rendered[0] && needLast <= this._rendered[1]) return;
      if (opts && opts.ifNeeded && this.editing) this.stopEdit(true, true);
      const first = Math.max(0, needFirst - 8);
      const last = Math.min(len - 1, needLast + 8);
      const frag = document.createDocumentFragment();
      for (let r = first; r <= last; r++) frag.appendChild(this._renderRow(r));
      body.replaceChildren(frag);
      this._rendered = [first, last];
      if (this._hasWrap) this._fixWrapHeights();
    }

    _renderRow(r) {
      const e = this.display[r];
      const n = e.node;
      const o = this.o;
      const row = el('div', 'lg-row');
      row.style.top = this.offsets[r] + 'px';
      row.style.height = this.offsets[r + 1] - this.offsets[r] + 'px';
      row.style.width = this.totalWidth + 'px';
      row.dataset.r = r;
      row.setAttribute('role', 'row');
      if (e.kind === 'detail') {
        row.classList.add('lg-detail-row');
        const det = this._detailEl(n);
        det.style.width = this.viewport.clientWidth + 'px';
        row.appendChild(det);
        return row;
      }
      if (r % 2) row.classList.add('lg-alt');
      if (e.kind === 'group') row.classList.add('lg-group-row');
      if (n.data && this.selected.has(n.id)) row.classList.add('lg-selected');
      if (this._draggingIds && this._draggingIds.has(n.id)) row.classList.add('lg-row-dragging');
      if (o.rowClass && n.data && e.kind === 'leaf') {
        const rc = o.rowClass(n.data);
        if (rc) rc.split(/\s+/).filter(Boolean).forEach((c) => row.classList.add(c));
      }
      const vis = this.visible;
      for (let c = 0; c < vis.length; c++) row.appendChild(this._renderCell(e, r, vis[c], c));
      return row;
    }

    _detailEl(n) {
      let d = this._detailCache.get(n.id);
      if (!d) {
        d = el('div', 'lg-detail');
        if (this.o.detailRenderer) {
          try {
            const res = this.o.detailRenderer({ data: n.data, container: d, grid: this, theme: this.o.theme });
            if (res instanceof Node) d.appendChild(res);
            else if (typeof res === 'string') d.innerHTML = res;
          } catch (err) { d.textContent = 'Detail renderer error: ' + err.message; }
        }
        this._detailCache.set(n.id, d);
      }
      return d;
    }

    _renderCell(e, r, col, ci) {
      const n = e.node;
      const o = this.o;
      const d = this._cellBase('lg-cell', col);
      d.dataset.c = ci;
      d.setAttribute('role', 'gridcell');
      const total = e.kind === 'total';
      if (col.type === 'number' || col.generated) d.classList.add('lg-num');
      const rg = this.range;
      if (!total && rg && r >= rg.r1 && r <= rg.r2 && ci >= rg.c1 && ci <= rg.c2) {
        if (rg.r1 !== rg.r2 || rg.c1 !== rg.c2) {
          d.classList.add('lg-in-range');
          const sh = [];
          if (r === rg.r1) sh.push('inset 0 1px 0 var(--lg-accent)');
          if (r === rg.r2) sh.push('inset 0 -1px 0 var(--lg-accent)');
          if (ci === rg.c1) sh.push('inset 1px 0 0 var(--lg-accent)');
          if (ci === rg.c2) sh.push('inset -1px 0 0 var(--lg-accent)');
          if (sh.length) d.style.boxShadow = sh.join(',');
        }
        if (this.o.fillHandle && r === rg.r2 && ci === rg.c2 && !this.editing && e.kind === 'leaf') d.appendChild(el('div', 'lg-fill'));
      }
      if (!total && this.focus && this.focus.r === r && this.focus.c === ci) d.classList.add('lg-focus');
      const fm = this.find.term ? this.find.matches[this.find.index] : null;
      if (!total && fm && fm.r === r && fm.c === ci) d.classList.add('lg-find-current');

      if (col.special === 'drag') {
        d.classList.add('lg-center');
        if (total || e.kind !== 'leaf') return d;
        const why = this._dragBlock;
        const hd = el('span', 'lg-drag-handle' + (why ? ' lg-disabled' : ''), '⠿');
        hd.dataset.rowDrag = '1';
        hd.title = why ? 'Row reordering is paused: ' + why : 'Drag to reorder (or Alt+↑ / Alt+↓)';
        d.appendChild(hd);
        return d;
      }
      if (col.special === 'sel') {
        d.classList.add('lg-center');
        if (total || !o.selection) return d;
        const cb = el('input', 'lg-check');
        cb.type = 'checkbox';
        cb.dataset.select = '1';
        cb.tabIndex = -1;
        if (e.kind === 'leaf') cb.checked = this.selected.has(n.id);
        else {
          const ids = this._entryIds(n);
          let k = 0;
          for (const id of ids) if (this.selected.has(id)) k++;
          cb.checked = k > 0 && k === ids.length;
          cb.indeterminate = k > 0 && k < ids.length;
        }
        d.appendChild(cb);
        return d;
      }

      if (col.special === 'group') {
        const wrap = el('div', 'lg-gcell');
        wrap.style.paddingLeft = (total ? 0 : e.level * 18) + 'px';
        if (total) {
          wrap.appendChild(el('span', 'lg-gkey', 'Total'));
        } else {
          const expandable = this._isGroupLike(n) && n.children.length > 0;
          if (expandable) {
            const ch = el('span', 'lg-chev' + (this._isExpanded(n) ? ' lg-open' : ''), '▶');
            ch.dataset.toggle = '1';
            wrap.appendChild(ch);
          } else if (o.masterDetail && e.kind === 'leaf') {
            const ch = el('span', 'lg-chev' + (this.detailOpen.has(n.id) ? ' lg-open' : ''), '▶');
            ch.dataset.detail = '1';
            ch.title = 'Show details';
            wrap.appendChild(ch);
          } else {
            wrap.appendChild(el('span', 'lg-chev-sp'));
          }
          if (n.group || n.tree) {
            const keyText = n.keyText == null ? '' : n.keyText;
            const k = el('span', 'lg-gkey');
            this._setText(k, keyText, r, ci);
            wrap.appendChild(k);
            if (n.group || n.children.length) wrap.appendChild(el('span', 'lg-gcount', '(' + intFmt.format(n.leafs.length) + ')'));
          }
        }
        d.appendChild(wrap);
        return d;
      }

      const val = this._cellValue(col, n);
      const isAgg = total || e.kind === 'group';
      const span = el('span', 'lg-txt');
      if (this._isWrap(col)) {
        d.classList.add('lg-wrap');
        if (col.def.maxLines) { span.classList.add('lg-clamp'); span.style.webkitLineClamp = String(col.def.maxLines); }
      }
      let done = false;
      if (!isAgg && col.def.render) {
        const res = col.def.render({ value: val, data: n.data, node: n, grid: this, column: col.id, text: this._cellText(col, e) });
        if (res instanceof Node) span.appendChild(res);
        else if (res != null) span.innerHTML = String(res);
        done = true;
      } else if (col.def.sparkline && Array.isArray(val)) {
        span.innerHTML = sparklineSvg(val, col.def.sparkline, col.w - 22, o.rowHeight - 12);
        done = true;
      }
      if (!done) {
        const text = this._cellText(col, e);
        if (total && !text && ci === this._mdCol && !this.visible.some((c) => c.special === 'group')) span.textContent = 'Total';
        else this._setText(span, text, r, ci);
        if (col.def.tooltip) d.title = typeof col.def.tooltip === 'function' ? col.def.tooltip(val, n.data) : text;
      }
      if (o.masterDetail && e.kind === 'leaf' && ci === this._mdCol) {
        const ch = el('span', 'lg-chev' + (this.detailOpen.has(n.id) ? ' lg-open' : ''), '▶');
        ch.dataset.detail = '1';
        ch.title = 'Show details';
        d.appendChild(ch);
      }
      d.appendChild(span);
      if (!isAgg && col.def.cellClass) {
        const cc = typeof col.def.cellClass === 'function' ? col.def.cellClass({ value: val, data: n.data }) : col.def.cellClass;
        if (cc) String(cc).split(/\s+/).filter(Boolean).forEach((c) => d.classList.add(c));
      }
      if (!total && n.id) {
        const f = this.flash.get(n.id + '|' + col.id);
        if (f) d.classList.add(f.dir > 0 ? 'lg-flash-up' : f.dir < 0 ? 'lg-flash-down' : 'lg-flash-same');
      }
      return d;
    }

    _setText(node, text, r, ci) {
      const term = this.find.term;
      if (term && r >= 0) {
        const lower = text.toLowerCase();
        const at = lower.indexOf(term);
        if (at >= 0) {
          node.innerHTML = esc(text.slice(0, at)) + '<mark>' + esc(text.slice(at, at + term.length)) + '</mark>' + esc(text.slice(at + term.length));
          return;
        }
      }
      node.textContent = text;
    }

    _renderFooter() {
      const F = this.footerEl;
      F.innerHTML = '';
      if (!this.o.totalsRow || !this.root) return;
      const row = el('div', 'lg-row lg-total-row');
      row.style.width = this.totalWidth + 'px';
      row.style.height = this.o.rowHeight + 'px';
      const e = { node: this.root, kind: 'total', level: 0 };
      this.visible.forEach((c, i) => row.appendChild(this._renderCell(e, -1, c, i)));
      F.appendChild(row);
    }

    _renderStatus() {
      const s = this.statusEl;
      if (!s) return;
      const total = this.nodes.length, shown = this.filteredLeafs ? this.filteredLeafs.length : 0;
      let html = '<span>Rows: <b>' + intFmt.format(shown) + '</b>' + (shown !== total ? ' of ' + intFmt.format(total) : '') + '</span>';
      if (this.selected.size) html += '<span>Selected: <b>' + intFmt.format(this.selected.size) + '</b></span>';
      if (this.groupCols.length && !this.o.treeData) html += '<span>Groups: <b>' + intFmt.format(this.topNodes.length) + '</b> top-level</span>';
      html += '<span class="lg-spacer"></span>';
      const st = this._rangeStats();
      if (st) {
        html += '<span>Count: <b>' + intFmt.format(st.count) + '</b></span>';
        if (st.nums) {
          html += '<span>Sum: <b>' + numFmt.format(st.sum) + '</b></span><span>Avg: <b>' + numFmt.format(st.sum / st.nums) + '</b></span>';
          html += '<span>Min: <b>' + numFmt.format(st.min) + '</b></span><span>Max: <b>' + numFmt.format(st.max) + '</b></span>';
        }
      }
      s.innerHTML = html;
    }
    _rangeStats() {
      const rg = this.range;
      if (!rg || (rg.r1 === rg.r2 && rg.c1 === rg.c2)) return null;
      let count = 0, nums = 0, sum = 0, min = Infinity, max = -Infinity;
      for (let r = rg.r1; r <= rg.r2; r++) {
        const e = this.display[r];
        if (!e || e.kind === 'detail') continue;
        for (let c = rg.c1; c <= rg.c2; c++) {
          const col = this.visible[c];
          if (!col || this._isUtil(col)) continue;
          const v = col.special === 'group' ? e.node.keyText : this._cellValue(col, e.node);
          if (v == null || v === '') continue;
          count++;
          if (isNum(v)) { nums++; sum += v; if (v < min) min = v; if (v > max) max = v; }
        }
      }
      return { count, nums, sum, min, max };
    }

    _ensurePager() {
      if (this.pagerEl) return;
      this.pagerEl = el('div', 'lg-pager');
      if (this.statusEl) this.rootEl.insertBefore(this.pagerEl, this.statusEl);
      else this.rootEl.appendChild(this.pagerEl);
    }
    _renderPager() {
      const p = this.pagerEl;
      if (!p) return;
      p.style.display = this.o.pagination ? '' : 'none';
      p.innerHTML = '';
      if (!this.o.pagination) return;
      const size = this.o.pageSize;
      const total = this.allDisplay.length;
      const pages = Math.max(1, Math.ceil(total / size));
      const sel = el('select');
      const sizes = [25, 50, 100, 250, 1000];
      if (sizes.indexOf(size) < 0) { sizes.push(size); sizes.sort((a, b) => a - b); }
      sizes.forEach((n) => { const op = el('option', null, String(n)); op.value = n; sel.appendChild(op); });
      sel.value = String(size);
      sel.addEventListener('change', () => this.setPageSize(+sel.value));
      const from = total ? this.page * size + 1 : 0, to = Math.min(total, (this.page + 1) * size);
      const mk = (t, title, pg, dis) => { const b = el('button', 'lg-btn lg-btn-sm', t); b.type = 'button'; b.title = title; b.disabled = dis; b.addEventListener('click', () => this.setPage(pg)); return b; };
      p.append(el('span', null, 'Page size:'), sel, el('span', null, intFmt.format(from) + '–' + intFmt.format(to) + ' of ' + intFmt.format(total)),
        mk('«', 'First page', 0, this.page === 0), mk('‹', 'Previous page', this.page - 1, this.page === 0),
        el('span', null, 'Page ' + (this.page + 1) + ' of ' + pages),
        mk('›', 'Next page', this.page + 1, this.page >= pages - 1), mk('»', 'Last page', pages - 1, this.page >= pages - 1));
    }
    setPage(p) {
      this.page = p;
      this._flatten();
      this.viewport.scrollTop = 0;
      this._afterModelChange();
      this.emit('paginationChanged', this.getPaginationInfo());
    }
    /** Turns paging on or off at runtime. Optionally sets the page size too. */
    setPagination(on, pageSize) {
      if (this.editing) this.stopEdit(true, true);
      this.o.pagination = !!on;
      if (pageSize > 0) this.o.pageSize = Math.floor(pageSize);
      if (this.o.pagination) this._ensurePager();
      this.page = 0;
      this._flatten();
      this.viewport.scrollTop = 0;
      this._afterModelChange();
      this.emit('paginationChanged', this.getPaginationInfo());
    }
    setPageSize(n) {
      if (!(n > 0)) return;
      this.o.pageSize = Math.floor(n);
      this.setPage(0);
    }
    getPaginationInfo() {
      const size = this.o.pageSize, total = this.allDisplay.length;
      return { enabled: !!this.o.pagination, page: this.page, pageSize: size, pageCount: this.o.pagination ? Math.max(1, Math.ceil(total / size)) : 1, rowCount: total };
    }

    /* ---------------- side bar ---------------- */
    toggleSideBar(open) {
      if (!this.sideBar) return;
      this._sideOpen = open == null ? !this._sideOpen : !!open;
      this._renderSideBar();
    }
    _renderSideBar() {
      const sb = this.sideBar;
      if (!sb) return;
      sb.style.display = this._sideOpen ? '' : 'none';
      if (!this._sideOpen) return;
      const keepScroll = sb.querySelector('.lg-sb-body');
      const scrollTop = keepScroll ? keepScroll.scrollTop : 0;
      sb.innerHTML = '';
      const tabs = el('div', 'lg-sb-tabs');
      [['columns', 'Columns'], ['filters', 'Filters']].forEach(([k, label]) => {
        const b = el('button', 'lg-sb-tab' + (this._sideTab === k ? ' lg-active' : ''), label);
        b.type = 'button';
        b.addEventListener('click', () => { this._sideTab = k; this._renderSideBar(); });
        tabs.appendChild(b);
      });
      sb.appendChild(tabs);
      const body = el('div', 'lg-sb-body');
      sb.appendChild(body);
      if (this._sideTab === 'columns') this._renderColumnsPanel(body);
      else this._renderFiltersPanel(body);
      body.scrollTop = scrollTop;
    }
    _renderColumnsPanel(body) {
      if (!this.o.treeData) {
        const pm = el('label', 'lg-sb-row');
        const cb = el('input', 'lg-check');
        cb.type = 'checkbox';
        cb.checked = this.pivotMode;
        cb.addEventListener('change', () => this.setPivotMode(cb.checked));
        pm.append(cb, el('span', null, 'Pivot mode'));
        body.appendChild(pm);
      }
      const search = el('input', 'lg-input');
      search.type = 'search';
      search.placeholder = 'Search columns…';
      body.appendChild(search);
      const list = el('div', 'lg-col-list');
      list.dataset.dropZone = 'columns';
      for (const c of this.cols) {
        const it = el('label', 'lg-col-item');
        it.draggable = true;
        it.dataset.name = c.header.toLowerCase();
        const cb = el('input', 'lg-check');
        cb.type = 'checkbox';
        cb.checked = !c.hidden;
        cb.addEventListener('change', () => this.setColumnVisible(c.id, cb.checked));
        it.append(cb, el('span', null, c.header));
        const badges = [];
        if (this.groupCols.indexOf(c.id) >= 0) badges.push('group');
        if (c.agg) badges.push(typeof c.agg === 'string' ? c.agg : 'agg');
        if (this.pivotCols.indexOf(c.id) >= 0) badges.push('pivot');
        if (c.pinned) badges.push('pin ' + c.pinned);
        if (badges.length) it.appendChild(el('span', 'lg-badge', badges.join(' · ')));
        it.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/lg-col', c.id); e.dataTransfer.effectAllowed = 'copyMove'; });
        list.appendChild(it);
      }
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        list.querySelectorAll('.lg-col-item').forEach((it) => { it.style.display = it.dataset.name.indexOf(q) >= 0 ? '' : 'none'; });
      });
      body.appendChild(list);
      const zone = (title, key, ids, hint) => {
        const z = el('div', 'lg-zone');
        z.dataset.dropZone = key;
        z.appendChild(el('div', 'lg-zone-title', title));
        const items = el('div', 'lg-zone-items');
        if (!ids.length) items.appendChild(el('span', 'lg-zone-empty', hint));
        ids.forEach((id) => items.appendChild(this._chip(id, key)));
        z.appendChild(items);
        body.appendChild(z);
      };
      if (!this.o.treeData) zone('Row groups', 'group', this.groupCols, 'Drag columns here to group');
      zone('Values', 'value', this.cols.filter((c) => c.agg).map((c) => c.id), 'Drag columns here to aggregate');
      if (this.pivotMode) zone('Column labels (pivot)', 'pivot', this.pivotCols, 'Drag columns here to pivot');
    }
    _renderFiltersPanel(body) {
      const cols = this.cols.filter((c) => c.filterType);
      if (this.filters.size) {
        const clr = el('button', 'lg-btn lg-btn-sm', 'Clear all filters');
        clr.type = 'button';
        clr.addEventListener('click', () => this.clearFilters());
        body.appendChild(clr);
      }
      for (const c of cols) {
        const sec = el('div', 'lg-fsec');
        const head = el('div', 'lg-fsec-head');
        const open = this._openFilterSecs.has(c.id);
        head.append(el('span', null, open ? '▾' : '▸'), el('span', null, c.header));
        if (this.filters.has(c.id)) head.appendChild(el('span', 'lg-dot'));
        head.addEventListener('click', () => {
          if (open) this._openFilterSecs.delete(c.id); else this._openFilterSecs.add(c.id);
          this._renderSideBar();
        });
        sec.appendChild(head);
        if (open) {
          const b = el('div', 'lg-fsec-body');
          b.appendChild(this._buildFilterUI(c, false));
          sec.appendChild(b);
        }
        body.appendChild(sec);
      }
    }

    /* =====================================================================
     * Events / interaction
     * ===================================================================== */
    _bindEvents() {
      const vp = this.viewport;
      vp.addEventListener('scroll', () => {
        if (this._scrollRaf) return;
        this._scrollRaf = requestAnimationFrame(() => { this._scrollRaf = 0; this._renderRows({ ifNeeded: true }); });
      });
      this.headerEl.addEventListener('pointerdown', (e) => this._onHeaderPointerDown(e));
      this.headerEl.addEventListener('click', (e) => {
        const t = e.target;
        if (t.dataset.menu) { e.stopPropagation(); this._openColumnMenu(this._colById(t.dataset.menu), t); return; }
        if (t.dataset.selectAll) { e.preventDefault(); this.selectAllFiltered(!this._allFilteredSelected()); return; }
        if (t.dataset.ffSet) { this.openFilterPopup(this._colById(t.dataset.ffSet), t); }
      });
      this.headerEl.addEventListener('dblclick', (e) => {
        if (e.target.dataset.resize) { this.autoSizeColumn(e.target.dataset.resize); }
      });
      this.bodyEl.addEventListener('mousedown', (e) => this._onBodyMouseDown(e));
      this.bodyEl.addEventListener('pointerdown', (e) => {
        if (!e.target.dataset || !e.target.dataset.rowDrag || e.button !== 0) return;
        const p = this._cellFromEvent(e);
        if (!p) return;
        e.preventDefault();
        if (this.editing) this.stopEdit(true);
        this.viewport.focus({ preventScroll: true });
        const why = this._reorderBlockReason();
        if (why) this._toast('Row reordering is paused: ' + why);
        else this._startRowDrag(e, this.display[p.r]);
      });
      this.bodyEl.addEventListener('click', (e) => {
        if (!e.target.dataset.select) return;
        const p = this._cellFromEvent(e);
        if (!p) return;
        e.preventDefault();
        if (p) this._toggleSelectEntry(this.display[p.r], p.r, e.shiftKey);
      });
      vp.addEventListener('keydown', (e) => this._onKeyDown(e));
      vp.addEventListener('copy', (e) => {
        if (this.editing || !this.focus || (e.target !== vp && !this.bodyEl.contains(e.target)) || (e.target.closest && e.target.closest('.lg-detail'))) return;
        e.preventDefault();
        const t = this._rangeToTsv(false);
        this._clip = t;
        e.clipboardData.setData('text/plain', t);
        this._toast('Copied ' + this._rangeCellCount() + ' cell(s)');
      });
      vp.addEventListener('paste', (e) => {
        if (this.editing || (e.target !== vp && !this.bodyEl.contains(e.target)) || (e.target.closest && e.target.closest('.lg-detail'))) return;
        e.preventDefault();
        this._pasteTsv(e.clipboardData.getData('text/plain'));
      });
      vp.addEventListener('contextmenu', (e) => this._onContextMenu(e));

      // HTML5 drag & drop for chips / side-bar items
      const root = this.rootEl;
      let hoverZone = null;
      const setHover = (z) => { if (hoverZone && hoverZone !== z) hoverZone.classList.remove('lg-drop-hover'); hoverZone = z; if (z) z.classList.add('lg-drop-hover'); };
      root.addEventListener('dragover', (e) => {
        const z = e.target.closest && e.target.closest('[data-drop-zone]');
        if (z && Array.from(e.dataTransfer.types).indexOf('text/lg-col') >= 0) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHover(z); } else setHover(null);
      });
      root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) setHover(null); });
      root.addEventListener('drop', (e) => {
        const z = e.target.closest && e.target.closest('[data-drop-zone]');
        setHover(null);
        if (!z) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/lg-col');
        const from = e.dataTransfer.getData('text/lg-from');
        const chip = e.target.closest('[data-chip]');
        const zone = z.dataset.dropZone;
        if (!id) return;
        if (from && from !== zone && zone !== 'columns') this._removeFromZone(from, id, true);
        if (zone === 'columns') { if (from) this._removeFromZone(from, id); return; }
        this._dropToZone(zone, id, chip && chip.dataset.chip !== id ? chip.dataset.chip : null);
      });
    }

    _cellFromEvent(e) {
      const cell = e.target.closest && e.target.closest('.lg-cell');
      if (!cell) return null;
      const row = cell.parentElement;
      if (!row || row.parentElement !== this.bodyEl) return null;
      return { r: +row.dataset.r, c: +cell.dataset.c };
    }
    _cellFromPoint(x, y) {
      const t = document.elementFromPoint(x, y);
      if (!t) return null;
      return this._cellFromEvent({ target: t });
    }
    _cellEl(r, c) {
      const row = this.bodyEl.querySelector('.lg-row[data-r="' + r + '"]');
      return row ? row.querySelector('.lg-cell[data-c="' + c + '"]') : null;
    }

    _onHeaderPointerDown(ev) {
      if (ev.button !== 0) return;
      const t = ev.target;
      if (t.dataset.resize) { this._startResize(ev, this._colById(t.dataset.resize)); return; }
      if (t.closest('input,button,select')) return;
      const cell = t.closest('.lg-hcell');
      if (!cell || !cell.dataset.col) return;
      const col = this._colById(cell.dataset.col);
      if (!col || this._isUtil(col)) return;
      const sx = ev.clientX, sy = ev.clientY;
      let dragging = false, ghost = null, lastTarget = null, lastZone = null;
      const canDrag = this.o.columnMove && !col.special && !col.generated;
      const clearMarks = () => {
        if (lastTarget) lastTarget.classList.remove('lg-drop-target', 'lg-drop-after');
        if (lastZone) lastZone.classList.remove('lg-drop-hover');
        lastTarget = lastZone = null;
      };
      const move = (e) => {
        if (!dragging && canDrag && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
          dragging = true;
          ghost = el('div', 'lg-drag-ghost ' + this._themeClass(), col.header);
          document.body.appendChild(ghost);
          this.rootEl.classList.add('lg-dragging');
        }
        if (!dragging) return;
        ghost.style.left = e.clientX + 14 + 'px';
        ghost.style.top = e.clientY + 10 + 'px';
        const tgt = document.elementFromPoint(e.clientX, e.clientY);
        clearMarks();
        const zone = tgt && tgt.closest('[data-drop-zone]');
        const hc = tgt && this.headerEl.contains(tgt) && tgt.closest('.lg-hcell[data-col]');
        if (zone && zone.dataset.dropZone !== 'columns') { zone.classList.add('lg-drop-hover'); lastZone = zone; }
        else if (hc && hc.dataset.col !== col.id && this.colMap.has(hc.dataset.col)) {
          const rect = hc.getBoundingClientRect();
          hc.classList.add('lg-drop-target');
          if (e.clientX > rect.left + rect.width / 2) hc.classList.add('lg-drop-after');
          lastTarget = hc;
        }
        ghost.classList.toggle('lg-ok', !!(lastZone || lastTarget));
      };
      const up = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!dragging) {
          if (col.sortable) this._toggleSort(col, e.shiftKey || e.ctrlKey || e.metaKey);
          return;
        }
        ghost.remove();
        this.rootEl.classList.remove('lg-dragging');
        const zone = lastZone, target = lastTarget;
        const after = target && target.classList.contains('lg-drop-after');
        clearMarks();
        if (zone) this._dropToZone(zone.dataset.dropZone, col.id, null);
        else if (target) this.moveColumn(col.id, target.dataset.col, after);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    _startResize(ev, col) {
      ev.preventDefault();
      ev.stopPropagation();
      const sx = ev.clientX, sw = col.w;
      let raf = 0;
      this.rootEl.classList.add('lg-dragging');
      const move = (e) => {
        col.width = Math.max(col.minWidth, Math.round(sw + (e.clientX - sx)));
        col.flex = 0;
        if (col.generated) this._genWidths.set(col.id, col.width);
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; this._layout(); this._renderHeader(); this._renderRows(); this._renderFooter(); });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.rootEl.classList.remove('lg-dragging');
        this.emit('columnResized', { column: col.id, width: col.width });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    _onBodyMouseDown(e) {
      const t = e.target;
      if (t.closest('.lg-detail')) return;
      if (this.editing && t.closest('.lg-editor')) return;
      const p = this._cellFromEvent(e);
      if (!p) return;
      const entry = this.display[p.r];
      if (e.button === 2) {
        if (!this._inRange(p)) this._setRange(p, p);
        return;
      }
      if (e.button !== 0) return;
      if (t.dataset.toggle) { e.preventDefault(); this.toggleExpand(entry.node); return; }
      if (t.dataset.detail) { e.preventDefault(); this.toggleDetail(entry.node); return; }
      if (t.dataset.rowDrag) { e.preventDefault(); return; } // handled on pointerdown (mouse + touch)
      if (t.dataset.select) return;
      if (t.classList.contains('lg-fill')) { e.preventDefault(); this._startFill(); return; }
      // Double-click detection is done here because rows re-render on mousedown,
      // which would otherwise swallow the native dblclick event.
      const now = Date.now(), ld = this._lastDown;
      this._lastDown = { r: p.r, c: p.c, t: now };
      if (ld && ld.r === p.r && ld.c === p.c && now - ld.t < 450) {
        this._lastDown = null;
        e.preventDefault();
        if (!this.startEdit(p.r, p.c) && entry.kind === 'group') this.toggleExpand(entry.node);
        return;
      }
      if (this.editing) this.stopEdit(true);
      e.preventDefault();
      this.viewport.focus({ preventScroll: true });
      if (e.shiftKey && this.focus) this._setRange(this.focus, p);
      else this._setRange(p, p);
      if (this.o.rowClickSelection && this.o.selection && entry.kind === 'leaf') this._toggleSelectEntry(entry, p.r, false, true);
      let last = p;
      const move = (ev) => {
        this._autoScroll(ev);
        const q = this._cellFromPoint(ev.clientX, ev.clientY);
        if (q && (q.r !== last.r || q.c !== last.c)) { last = q; this._setRange(this.focus, q); }
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        clearInterval(this._asTimer);
        this._asTimer = 0;
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    _autoScroll(ev) {
      const r = this.viewport.getBoundingClientRect();
      let dy = 0;
      if (ev.clientY > r.bottom - 24) dy = 24;
      else if (ev.clientY < r.top + this.headerHeightTotal + 10) dy = -24;
      clearInterval(this._asTimer);
      this._asTimer = 0;
      if (dy) {
        this._asTimer = setInterval(() => {
          this.viewport.scrollTop += dy;
          const q = this._cellFromPoint(clamp(ev.clientX, r.left + 2, r.right - 2), dy > 0 ? r.bottom - 30 : r.top + this.headerHeightTotal + 12);
          if (q && this.focus) this._setRange(this.focus, q);
        }, 40);
      }
    }
    _inRange(p) {
      const rg = this.range;
      return !!rg && p.r >= rg.r1 && p.r <= rg.r2 && p.c >= rg.c1 && p.c <= rg.c2;
    }
    _setRange(anchor, end) {
      if (!this.o.rangeSelection) end = anchor; // single-cell focus only
      this.focus = { r: anchor.r, c: anchor.c };
      this.rangeEnd = { r: end.r, c: end.c };
      this.range = { r1: Math.min(anchor.r, end.r), r2: Math.max(anchor.r, end.r), c1: Math.min(anchor.c, end.c), c2: Math.max(anchor.c, end.c) };
      this._renderRows();
      this._renderStatus();
      this.emit('rangeChanged', Object.assign({}, this.range));
    }
    _rangeCellCount() {
      const rg = this.range;
      return rg ? (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1) : 0;
    }

    ensureVisible(r, c) {
      const vp = this.viewport;
      const hh = this.headerHeightTotal;
      const fh = this.o.totalsRow ? this.o.rowHeight : 0;
      if (r != null && r >= 0 && r < this.display.length) {
        const top = this.offsets[r], bot = this.offsets[r + 1];
        const room = vp.clientHeight - hh - fh;
        if (top < vp.scrollTop) vp.scrollTop = top;
        else if (bot > vp.scrollTop + room) vp.scrollTop = bot - room;
      }
      const col = c != null ? this.visible[c] : null;
      if (col && !col.pinned) {
        const sl = vp.scrollLeft;
        if (col.x < sl + this.leftWidth) vp.scrollLeft = col.x - this.leftWidth;
        else if (col.x + col.w > sl + vp.clientWidth - this.rightWidth) vp.scrollLeft = col.x + col.w - vp.clientWidth + this.rightWidth;
      }
      this._renderRows({ ifNeeded: true });
    }

    _onKeyDown(e) {
      if (this.editing) return;
      if (e.target !== this.viewport && !this.bodyEl.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.lg-detail')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const lk = k.length === 1 ? k.toLowerCase() : k;
      if (ctrl && lk === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (ctrl && lk === 'y') { e.preventDefault(); this.redo(); return; }
      if (ctrl && lk === 'f' && this.findInput) { e.preventDefault(); this.findInput.focus(); this.findInput.select(); return; }
      if (ctrl && lk === 'a') {
        e.preventDefault();
        if (this.display.length) this._setRange({ r: 0, c: 0 }, { r: this.display.length - 1, c: this.visible.length - 1 });
        return;
      }
      if (ctrl && (lk === 'c' || lk === 'v' || lk === 'x')) return;
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown') && this.o.rowReorder && this.focus) {
        e.preventDefault();
        this._keyboardMove(k === 'ArrowUp' ? -1 : 1);
        return;
      }
      const R = this.display.length - 1, C = this.visible.length - 1;
      if (R < 0) return;
      const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab'];
      if (!this.focus) {
        if (nav.indexOf(k) >= 0) { e.preventDefault(); this._setRange({ r: 0, c: 0 }, { r: 0, c: 0 }); this.ensureVisible(0, 0); }
        return;
      }
      const f = this.focus;
      const from = e.shiftKey && k !== 'Tab' && this.rangeEnd ? this.rangeEnd : f;
      let r = from.r, c = from.c;
      const page = Math.max(1, Math.floor((this.viewport.clientHeight - this.headerHeightTotal) / this.o.rowHeight) - 1);
      let moved = true;
      switch (k) {
        case 'ArrowUp': r = ctrl ? 0 : r - 1; break;
        case 'ArrowDown': r = ctrl ? R : r + 1; break;
        case 'ArrowLeft': c = ctrl ? 0 : c - 1; break;
        case 'ArrowRight': c = ctrl ? C : c + 1; break;
        case 'PageUp': r -= page; break;
        case 'PageDown': r += page; break;
        case 'Home': c = 0; if (ctrl) r = 0; break;
        case 'End': c = C; if (ctrl) r = R; break;
        case 'Tab':
          c += e.shiftKey ? -1 : 1;
          if (c > C) { c = 0; r++; }
          if (c < 0) { c = C; r--; }
          if (r < 0 || r > R) moved = false;
          break;
        default: moved = false;
      }
      if (moved) {
        e.preventDefault();
        r = clamp(r, 0, R);
        c = clamp(c, 0, C);
        if (e.shiftKey && k !== 'Tab') this._setRange(f, { r, c });
        else this._setRange({ r, c }, { r, c });
        this.ensureVisible(r, c);
        return;
      }
      const en = this.display[f.r];
      if (k === 'Enter' || k === 'F2') {
        e.preventDefault();
        if (this.startEdit(f.r, f.c)) return;
        if (en.kind === 'group') this.toggleExpand(en.node);
        else if (this.o.masterDetail && en.kind === 'leaf') this.toggleDetail(en.node);
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        if (this.o.selection && en.kind !== 'detail') this._toggleSelectEntry(en, f.r, e.shiftKey);
        else if (en.kind === 'group') this.toggleExpand(en.node);
        return;
      }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this._clearRange(); return; }
      if (k === 'Escape') { this._setRange(f, f); return; }
      if (k.length === 1 && !ctrl && !e.altKey) {
        if (this.startEdit(f.r, f.c, k)) e.preventDefault();
      }
    }

    /* ---------------- editing ---------------- */
    startEdit(r, c, initial) {
      const e = this.display[r], col = this.visible[c];
      if (!this._isEditable(col, e)) return false;
      if (this.editing) this.stopEdit(true);
      const type = this._editorType(col);
      const val = this._val(col, e.node.data);
      if (type === 'checkbox') {
        this._setRange({ r, c }, { r, c });
        this._applyChanges([{ node: e.node, col, value: !val }], true);
        return true;
      }
      this._setRange({ r, c }, { r, c });
      this.ensureVisible(r, c);
      const cell = this._cellEl(r, c);
      if (!cell) return false;
      let input;
      if (type === 'select') {
        input = el('select', 'lg-editor');
        let opts = col.def.editorOptions || [];
        if (typeof opts === 'function') opts = opts(e.node.data);
        opts.forEach((v) => { const op = el('option', null, String(v)); op.value = String(v); input.appendChild(op); });
        input.value = val == null ? '' : String(val);
      } else if (type === 'textarea') {
        input = el('textarea', 'lg-editor lg-editor-large');
        input.value = initial != null ? initial : val == null ? '' : String(val);
      } else {
        input = el('input', 'lg-editor');
        input.type = type === 'date' ? 'date' : 'text';
        if (type === 'number') input.inputMode = 'decimal';
        input.value = initial != null && type !== 'date' ? initial : val == null ? '' : String(val);
      }
      input.setAttribute('aria-label', 'Edit ' + col.header);
      cell.classList.add('lg-editing');
      cell.textContent = '';
      cell.appendChild(input);
      this.editing = { r, c, node: e.node, col, input, type };
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') { ev.preventDefault(); this.stopEdit(false); this.viewport.focus({ preventScroll: true }); return; }
        if (ev.key === 'Enter' && (type !== 'textarea' || ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          if (this.stopEdit(true)) this._moveAfterEdit(ev.shiftKey ? -1 : 1, 0);
          return;
        }
        if (ev.key === 'Tab') {
          ev.preventDefault();
          if (this.stopEdit(true)) this._moveAfterEdit(0, ev.shiftKey ? -1 : 1);
        }
      });
      input.addEventListener('mousedown', (ev) => ev.stopPropagation());
      input.addEventListener('blur', () => {
        setTimeout(() => { if (this.editing && this.editing.input === input) this.stopEdit(true, true); }, 0);
      });
      input.focus();
      if (initial == null && input.select) input.select();
      return true;
    }
    _moveAfterEdit(dr, dc) {
      const f = this.focus;
      this.viewport.focus({ preventScroll: true });
      if (!f) return;
      const r = clamp(f.r + dr, 0, this.display.length - 1), c = clamp(f.c + dc, 0, this.visible.length - 1);
      this._setRange({ r, c }, { r, c });
      this.ensureVisible(r, c);
    }
    /** Ends editing. Returns false if the value failed validation and the editor stays open. */
    stopEdit(commit, force) {
      const ed = this.editing;
      if (!ed) return true;
      if (commit) {
        const v = this._parse(ed.col, ed.input.value, ed.type);
        let err = null;
        if (ed.type === 'number' && typeof v === 'number' && isNaN(v)) err = 'Please enter a number';
        else if (ed.col.def.validate) {
          const res = ed.col.def.validate(v, ed.node.data);
          if (res !== true && res != null && res !== undefined) err = typeof res === 'string' ? res : 'Invalid value';
        }
        if (err) {
          if (!force) {
            ed.input.classList.add('lg-invalid');
            ed.input.title = err;
            this._toast(err);
            return false;
          }
          this._toast('Edit discarded: ' + err);
          this.editing = null;
          this._renderRows();
          return true;
        }
        this.editing = null;
        if (!same(v, this._val(ed.col, ed.node.data))) {
          this._applyChanges([{ node: ed.node, col: ed.col, value: v }], true);
          return true;
        }
      }
      this.editing = null;
      this._renderRows();
      return true;
    }

    _applyChanges(changes, record) {
      const applied = [];
      for (const ch of changes) {
        const d = ch.node.data;
        const col = ch.col;
        const old = this._val(col, d);
        if (same(old, ch.value)) continue;
        if (col.def.setValue) col.def.setValue(d, ch.value);
        else setPath(d, col.field, ch.value);
        delete ch.node._q;
        if (ch.node.src) delete ch.node.src._q;
        applied.push({ node: ch.node, col, old, value: ch.value });
        this._flashCell(ch.node, col, old, ch.value);
        this.emit('cellValueChanged', { data: d, column: col.id, oldValue: old, newValue: ch.value });
      }
      if (!applied.length) { this._renderRows(); return 0; }
      if (record) {
        this.undoStack.push(applied);
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack.length = 0;
      }
      this._uvCache.clear();
      this._refreshAggregates();
      if (this._hasWrap) { for (const a of applied) this._hFix.delete(a.node.id); this._computeOffsets(); }
      this._renderRows();
      this._renderFooter();
      this._renderStatus();
      return applied.length;
    }
    undo() {
      const b = this.undoStack.pop();
      if (!b) { this._toast('Nothing to undo'); return; }
      if (b.type === 'order') { this._setOrder(b.before); this.redoStack.push(b); return; }
      this._applyChanges(b.map((x) => ({ node: x.node, col: x.col, value: x.old })), false);
      this.redoStack.push(b);
    }
    redo() {
      const b = this.redoStack.pop();
      if (!b) { this._toast('Nothing to redo'); return; }
      if (b.type === 'order') { this._setOrder(b.after); this.undoStack.push(b); return; }
      this._applyChanges(b.map((x) => ({ node: x.node, col: x.col, value: x.value })), false);
      this.undoStack.push(b);
    }
    _flashCell(node, col, old, nv) {
      if (!this.o.flashChanges) return;
      const dir = isNum(old) && isNum(nv) ? (nv > old ? 1 : nv < old ? -1 : 0) : 0;
      this.flash.set(node.id + '|' + col.id, { dir, t: Date.now() });
      if (!this._flashTimer) {
        const tick = () => {
          const now = Date.now();
          for (const [k, f] of this.flash) if (now - f.t > 900) this.flash.delete(k);
          this._renderRows();
          this._flashTimer = this.flash.size ? setTimeout(tick, 300) : 0;
        };
        this._flashTimer = setTimeout(tick, 950);
      }
    }
    _clearRange() {
      const rg = this.range;
      if (!rg) return;
      const changes = [];
      for (let r = rg.r1; r <= rg.r2; r++) {
        const e = this.display[r];
        for (let c = rg.c1; c <= rg.c2; c++) {
          const col = this.visible[c];
          if (this._isEditable(col, e) && this._editorType(col) !== 'checkbox') changes.push({ node: e.node, col, value: col.type === 'text' ? '' : null });
        }
      }
      this._applyChanges(changes, true);
    }

    /* ---------------- fill handle ---------------- */
    _startFill() {
      const src = Object.assign({}, this.range);
      let target = src.r2;
      const move = (ev) => {
        const q = this._cellFromPoint(ev.clientX, ev.clientY);
        if (!q) return;
        target = Math.max(src.r2, q.r);
        this.range = { r1: src.r1, r2: target, c1: src.c1, c2: src.c2 };
        this._renderRows();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (target > src.r2) this._applyFill(src, target);
        this._setRange({ r: src.r1, c: src.c1 }, { r: target, c: src.c2 });
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    _applyFill(rg, target) {
      const changes = [];
      for (let c = rg.c1; c <= rg.c2; c++) {
        const col = this.visible[c];
        const src = [];
        for (let r = rg.r1; r <= rg.r2; r++) { const e = this.display[r]; if (e.kind === 'leaf') src.push(this._cellValue(col, e.node)); }
        if (!src.length) continue;
        const step = src.length >= 2 && src.every(isNum) ? (src[src.length - 1] - src[0]) / (src.length - 1) : null;
        let k = 0;
        for (let r = rg.r2 + 1; r <= target; r++) {
          const e = this.display[r];
          if (e.kind !== 'leaf') continue;
          const v = step != null ? +(src[src.length - 1] + step * (k + 1)).toFixed(10) : src[k % src.length];
          k++;
          if (this._isEditable(col, e)) changes.push({ node: e.node, col, value: v });
        }
      }
      const n = this._applyChanges(changes, true);
      if (n) this._toast('Filled ' + n + ' cell(s)');
    }

    /* ---------------- clipboard ---------------- */
    _rangeToTsv(withHeaders) {
      const rg = this.range || (this.focus && { r1: this.focus.r, r2: this.focus.r, c1: this.focus.c, c2: this.focus.c });
      if (!rg) return '';
      const cols = this.visible.slice(rg.c1, rg.c2 + 1).filter((c) => !this._isUtil(c));
      const lines = [];
      if (withHeaders) lines.push(cols.map((c) => c.header).join('\t'));
      for (let r = rg.r1; r <= rg.r2; r++) {
        const e = this.display[r];
        if (!e || e.kind === 'detail') continue;
        lines.push(cols.map((c) => {
          let v = c.special === 'group' ? (e.node.group || e.node.tree ? e.node.keyText : '') : this._cellValue(c, e.node);
          if (v == null) v = '';
          if (Array.isArray(v)) v = v.join(' ');
          return String(v).replace(/[\t\n\r]+/g, ' ');
        }).join('\t'));
      }
      return lines.join('\n');
    }
    copyRange(withHeaders) {
      const text = this._rangeToTsv(withHeaders);
      if (!text) return;
      this._clip = text;
      const fallback = () => {
        const ta = el('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (err) { /* ignore */ }
        ta.remove();
        this.viewport.focus({ preventScroll: true });
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
      else fallback();
      this._toast('Copied ' + this._rangeCellCount() + ' cell(s)');
    }
    pasteFromClipboard() {
      const useInternal = () => { if (this._clip) this._pasteTsv(this._clip); else this._toast('Clipboard not available here — press Ctrl+V instead'); };
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => this._pasteTsv(t), useInternal);
      else useInternal();
    }
    _pasteTsv(text) {
      if (!text || !this.focus) return;
      const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
      const rg = this.range || { r1: this.focus.r, r2: this.focus.r, c1: this.focus.c, c2: this.focus.c };
      const single = lines.length === 1 && lines[0].length === 1;
      const changes = [];
      const rowsN = single ? rg.r2 - rg.r1 + 1 : lines.length;
      const colsN = single ? rg.c2 - rg.c1 + 1 : Math.max.apply(null, lines.map((l) => l.length));
      let c0 = rg.c1;
      while (this.visible[c0] && this._isUtil(this.visible[c0])) c0++;
      let i = 0, r = rg.r1, lastR = r;
      while (i < rowsN && r < this.display.length) {
        const e = this.display[r];
        if (e.kind === 'detail') { r++; continue; }
        const line = single ? lines[0] : lines[i];
        for (let j = 0; j < colsN; j++) {
          const col = this.visible[c0 + j];
          if (!col) break;
          const raw = single ? lines[0][0] : line[j];
          if (raw === undefined || !this._isEditable(col, e)) continue;
          const v = this._parse(col, raw, this._editorType(col));
          if (typeof v === 'number' && isNaN(v)) continue;
          changes.push({ node: e.node, col, value: v });
        }
        lastR = r;
        i++;
        r++;
      }
      const n = this._applyChanges(changes, true);
      this._setRange({ r: rg.r1, c: c0 }, { r: lastR, c: Math.min(this.visible.length - 1, c0 + colsN - 1) });
      this._toast(n ? 'Pasted ' + n + ' cell(s)' : 'Nothing pasted (cells are read-only)');
    }

    /* ---------------- row reordering ---------------- */
    /**
     * Returns null when rows can be reordered, otherwise a short reason.
     * Reordering only makes sense when the grid shows the raw row order:
     * no sort, no filter, no grouping / pivot / tree, and no pagination.
     */
    _reorderBlockReason() {
      if (!this.o.rowReorder) return 'row reordering is not enabled';
      if (this.sorts.length) return 'clear the sort to reorder rows';
      if (this.filters.size || this.quickFilter || this.o.externalFilter) return 'clear the filters to reorder rows';
      if (this.o.treeData) return 'not available for tree data';
      if (this.pivotMode) return 'turn off pivot mode to reorder rows';
      if (this.groupCols.length) return 'remove row grouping to reorder rows';
      if (this.o.pagination) return 'turn off paging to reorder rows';
      return null;
    }
    canReorderRows() { return !this._reorderBlockReason(); }
    /** Why row reordering is paused right now, or null if it is allowed. */
    getReorderBlockReason() { return this._reorderBlockReason(); }

    _movingNodes(node) {
      // dragging a selected row moves every selected row, keeping their order
      if (this.selected.has(node.id) && this.selected.size > 1) return this.nodes.filter((n) => this.selected.has(n.id));
      return [node];
    }

    _startRowDrag(ev, entry) {
      const moving = this._movingNodes(entry.node);
      const sx = ev.clientX, sy = ev.clientY;
      let started = false, ghost = null, line = null, target = null, last = ev, timer = 0;
      const firstCol = this.visible.find((c) => !this._isUtil(c));
      const label = moving.length > 1 ? 'Move ' + moving.length + ' rows'
        : 'Move ' + (firstCol ? this._cellText(firstCol, { node: moving[0], kind: 'leaf' }) || 'row' : 'row');
      const leafPos = new Map();
      this.display.forEach((e, i) => { if (e.kind === 'leaf' && !leafPos.has(e.node)) leafPos.set(e.node, i); });
      const compute = (clientY) => {
        const br = this.bodyEl.getBoundingClientRect();
        const y = clamp(clientY - br.top, 0, Math.max(0, this.totalHeight - 1));
        let r = this._rowAtY(y);
        let e = this.display[r];
        let after = y > (this.offsets[r] + this.offsets[r + 1]) / 2;
        if (e && e.kind === 'detail') { after = true; r--; e = this.display[r]; }
        if (!e) return;
        let idx = this.nodes.indexOf(e.node) + (after ? 1 : 0);
        idx = clamp(idx, 0, this.nodes.length);
        target = idx;
        const nextNode = this.nodes[idx];
        const lineY = nextNode && leafPos.has(nextNode) ? this.offsets[leafPos.get(nextNode)] : this.totalHeight;
        line.style.top = this.bodyEl.offsetTop + lineY - 1 + 'px';
      };
      const scrollTick = () => {
        const r = this.viewport.getBoundingClientRect();
        const top = r.top + this.headerHeightTotal, bot = r.bottom - (this.o.totalsRow ? this.o.rowHeight : 0);
        let dy = 0;
        if (last.clientY < top + 28) dy = -Math.ceil((top + 28 - last.clientY) / 2);
        else if (last.clientY > bot - 28) dy = Math.ceil((last.clientY - (bot - 28)) / 2);
        if (dy) { this.viewport.scrollTop += clamp(dy, -40, 40); compute(last.clientY); }
      };
      const move = (e) => {
        last = e;
        if (!started) {
          if (Math.abs(e.clientY - sy) < 4 && Math.abs(e.clientX - sx) < 4) return;
          started = true;
          ghost = el('div', 'lg-drag-ghost lg-ok ' + this._themeClass(), label);
          document.body.appendChild(ghost);
          line = el('div', 'lg-drop-line');
          line.style.width = this.totalWidth + 'px';
          this.canvas.appendChild(line);
          this._draggingIds = new Set(moving.map((n) => n.id));
          this.rootEl.classList.add('lg-dragging');
          this._renderRows();
          timer = setInterval(scrollTick, 30);
        }
        ghost.style.left = e.clientX + 14 + 'px';
        ghost.style.top = e.clientY + 10 + 'px';
        compute(e.clientY);
      };
      const finish = (commit) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('keydown', key, true);
        clearInterval(timer);
        if (!started) return;
        ghost.remove();
        line.remove();
        this._draggingIds = null;
        this.rootEl.classList.remove('lg-dragging');
        if (commit && target != null) this.moveRows(moving.map((n) => n.id), target);
        else this._renderRows();
      };
      const up = () => finish(true);
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('keydown', key, true);
    }

    _keyboardMove(dir) {
      const why = this._reorderBlockReason();
      if (why) { this._toast('Row reordering is paused: ' + why); return; }
      const e = this.display[this.focus.r];
      if (!e || e.kind !== 'leaf') return;
      const moving = this._movingNodes(e.node);
      const idxs = moving.map((n) => this.nodes.indexOf(n));
      const to = dir < 0 ? Math.min.apply(null, idxs) - 1 : Math.max.apply(null, idxs) + 2;
      if (to < 0 || to > this.nodes.length) return;
      this.moveRows(moving.map((n) => n.id), to);
    }

    /**
     * Moves the rows with the given ids so they sit before the row currently at
     * `toIndex` in the unfiltered row order (use rows.length to move to the end).
     * Returns true if anything moved. Undoable with undo().
     */
    moveRows(ids, toIndex, opts) {
      const why = this._reorderBlockReason();
      if (why && !(opts && opts.force)) { this._toast('Row reordering is paused: ' + why); return false; }
      const set = new Set(ids.map(String));
      const before = this.nodes.slice();
      const moving = before.filter((n) => set.has(n.id));
      if (!moving.length) return false;
      let adj = 0;
      for (let i = 0; i < Math.min(toIndex, before.length); i++) if (set.has(before[i].id)) adj++;
      const rest = before.filter((n) => !set.has(n.id));
      const at = clamp(toIndex - adj, 0, rest.length);
      const after = rest.slice(0, at).concat(moving, rest.slice(at));
      if (after.every((n, i) => n === before[i])) return false;
      const col = this.focus ? this.focus.c : this.visible.findIndex((c) => !this._isUtil(c));
      this._setOrder(after);
      if (!opts || opts.record !== false) {
        this.undoStack.push({ type: 'order', before, after });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack.length = 0;
      }
      const first = this.display.findIndex((e) => e.node === moving[0]);
      if (first >= 0) {
        const lastR = this.display.findIndex((e) => e.node === moving[moving.length - 1]);
        this._setRange({ r: first, c: Math.max(0, col) }, { r: lastR, c: Math.max(0, col) });
        this.ensureVisible(first, null);
      }
      this.emit('rowsReordered', { ids: moving.map((n) => n.id), toIndex: after.indexOf(moving[0]), rows: moving.map((n) => n.data) });
      return true;
    }
    _setOrder(order) {
      this.nodes = order.slice();
      this.rows.length = 0;
      for (const n of this.nodes) this.rows.push(n.data);
      this.refresh({ side: false });
    }

    /* ---------------- selection ---------------- */
    _entryIds(n) {
      const ids = n.leafs ? n.leafs.map((l) => l.id) : [];
      if (n.tree && n.data) ids.push(n.id);
      return ids;
    }
    _toggleSelectEntry(e, r, shift, fromRowClick) {
      if (!this.o.selection || !e || e.kind === 'detail') return;
      const n = e.node;
      if (this.o.selection === 'single') {
        const was = this.selected.has(n.id);
        this.selected.clear();
        if ((!was || fromRowClick) && n.data) this.selected.add(n.id);
      } else if (shift && this._lastSelR != null && r != null) {
        const a = Math.min(this._lastSelR, r), b = Math.max(this._lastSelR, r);
        for (let i = a; i <= b; i++) { const x = this.display[i]; if (x && x.kind === 'leaf') this.selected.add(x.node.id); }
      } else {
        const ids = e.kind === 'leaf' ? [n.id] : this._entryIds(n);
        const all = ids.every((id) => this.selected.has(id));
        if (fromRowClick && e.kind === 'leaf') {
          if (all) return;
          this.selected.clear();
          this.selected.add(n.id);
        } else for (const id of ids) { if (all) this.selected.delete(id); else this.selected.add(id); }
      }
      this._lastSelR = r;
      this._renderHeader();
      this._renderRows();
      this._renderStatus();
      this.emit('selectionChanged', this.getSelectedRows());
    }
    _allFilteredSelected() {
      const ids = this.filteredLeafs || [];
      return ids.length > 0 && ids.every((n) => this.selected.has(n.id));
    }
    selectAllFiltered(on) {
      for (const n of this.filteredLeafs || []) { if (on) this.selected.add(n.id); else this.selected.delete(n.id); }
      this._renderHeader();
      this._renderRows();
      this._renderStatus();
      this.emit('selectionChanged', this.getSelectedRows());
    }
    selectAll() { this.selectAllFiltered(true); }
    deselectAll() { this.selected.clear(); this.selectAllFiltered(false); }
    getSelectedRows() { return this.nodes.filter((n) => this.selected.has(n.id)).map((n) => n.data); }

    /* ---------------- expand / detail ---------------- */
    toggleExpand(node, value) {
      this.expandState.set(node.id, value == null ? !this._isExpanded(node) : !!value);
      this._flatten();
      this._afterModelChange();
    }
    _walkGroups(fn) {
      const rec = (arr) => { for (const n of arr) if (this._isGroupLike(n)) { fn(n); rec(n.children); } };
      rec(this.topNodes || []);
    }
    expandAll() { this._walkGroups((n) => this.expandState.set(n.id, true)); this._flatten(); this._afterModelChange(); }
    collapseAll() { this._walkGroups((n) => this.expandState.set(n.id, false)); this._flatten(); this._afterModelChange(); }
    toggleDetail(node) {
      if (!this.o.masterDetail) return;
      if (this.detailOpen.has(node.id)) this.detailOpen.delete(node.id); else this.detailOpen.add(node.id);
      this._flatten();
      this._afterModelChange();
    }

    /* ---------------- sorting / filtering API ---------------- */
    _toggleSort(col, multi) {
      const i = this.sorts.findIndex((s) => s.id === col.id);
      const dir = i < 0 ? 'asc' : this.sorts[i].dir === 'asc' ? 'desc' : null;
      if (!multi) this.sorts = dir ? [{ id: col.id, dir }] : [];
      else if (i >= 0) { if (dir) this.sorts[i].dir = dir; else this.sorts.splice(i, 1); }
      else this.sorts.push({ id: col.id, dir });
      this.emit('sortChanged', this.sorts.slice());
      this.refresh({ side: false });
    }
    setSort(sorts) {
      this.sorts = (sorts || []).map((s) => ({ id: s.id, dir: s.dir === 'desc' ? 'desc' : 'asc' }));
      this.emit('sortChanged', this.sorts.slice());
      this.refresh({ side: false });
    }
    _isActiveModel(m) {
      if (!m) return false;
      if (m.type === 'set') return Array.isArray(m.values);
      if (m.op === 'blank' || m.op === 'notBlank') return true;
      if (m.op === 'between') return m.value !== '' && m.value != null && m.value2 !== '' && m.value2 != null;
      return m.value !== '' && m.value != null;
    }
    setFilter(colId, model, opts) {
      if (model && this._isActiveModel(model)) this.filters.set(colId, model);
      else this.filters.delete(colId);
      this.page = 0;
      this.emit('filterChanged', this.getFilterModel());
      this.refresh({ side: !(opts && opts.skipSide) });
    }
    getFilterModel() {
      const out = {};
      for (const [k, m] of this.filters) out[k] = Object.assign({}, m);
      return out;
    }
    setFilterModel(model) {
      this.filters.clear();
      Object.keys(model || {}).forEach((k) => { if (this._isActiveModel(model[k])) this.filters.set(k, Object.assign({}, model[k])); });
      this.emit('filterChanged', this.getFilterModel());
      this.refresh();
    }
    clearFilters() {
      this.filters.clear();
      this.quickFilter = '';
      if (this.quickInput) { this.quickInput.value = ''; this.quickInput.dispatchEvent(new Event('change')); }
      this.emit('filterChanged', {});
      this.refresh();
    }
    setQuickFilter(text) {
      this.quickFilter = String(text || '').trim();
      if (this.quickInput && this.quickInput.value.trim() !== this.quickFilter) {
        this.quickInput.value = this.quickFilter;
        this.quickInput.dispatchEvent(new Event('change'));
      }
      this.page = 0;
      this.emit('filterChanged', this.getFilterModel());
      this.refresh({ side: false });
    }

    _uniqueValues(col) {
      let u = this._uvCache.get(col.id);
      if (u) return u;
      const map = new Map();
      for (const n of this.nodes) {
        const v = this._val(col, n.data);
        const k = this._setKey(col, v);
        const x = map.get(k);
        if (x) x.count++;
        else map.set(k, { key: k, raw: v, label: k === '(Blanks)' ? '(Blanks)' : this._fmt(col, v, n.data), count: 1 });
      }
      u = Array.from(map.values()).sort((a, b) => compareValues(a.raw, b.raw));
      this._uvCache.set(col.id, u);
      return u;
    }

    _buildFilterUI(col, inPopup) {
      const wrap = el('div', 'lg-filter');
      if (inPopup) wrap.appendChild(el('div', 'lg-filter-title', 'Filter: ' + col.header));
      const model = this.filters.get(col.id);
      const apply = (m) => this.setFilter(col.id, m, { skipSide: !inPopup });
      if (col.filterType === 'set') {
        const values = this._uniqueValues(col);
        const cur = model ? new Set(model.values) : new Set(values.map((v) => v.key));
        const search = el('input', 'lg-input');
        search.type = 'search';
        search.placeholder = 'Search values…';
        const allRow = el('label', 'lg-set-item');
        const allBox = el('input', 'lg-check');
        allBox.type = 'checkbox';
        allRow.append(allBox, el('span', 'lg-set-label', '(Select all)'));
        const list = el('div', 'lg-set-list');
        const LIMIT = 400;
        const shownValues = () => { const q = search.value.toLowerCase(); return values.filter((v) => v.label.toLowerCase().indexOf(q) >= 0); };
        const syncAll = (shown) => {
          let k = 0;
          for (const v of shown) if (cur.has(v.key)) k++;
          allBox.checked = shown.length > 0 && k === shown.length;
          allBox.indeterminate = k > 0 && k < shown.length;
        };
        const draw = () => {
          list.innerHTML = '';
          const shown = shownValues();
          shown.slice(0, LIMIT).forEach((v) => {
            const it = el('label', 'lg-set-item');
            const cb = el('input', 'lg-check');
            cb.type = 'checkbox';
            cb.checked = cur.has(v.key);
            cb.dataset.key = v.key;
            it.append(cb, el('span', 'lg-set-label', v.label), el('span', 'lg-set-count', intFmt.format(v.count)));
            list.appendChild(it);
          });
          if (shown.length > LIMIT) list.appendChild(el('div', 'lg-set-more', '+' + intFmt.format(shown.length - LIMIT) + ' more — refine the search'));
          syncAll(shown);
        };
        const commit = () => apply(cur.size === values.length ? null : { type: 'set', values: Array.from(cur) });
        list.addEventListener('change', (e) => {
          const k = e.target.dataset.key;
          if (k == null) return;
          if (e.target.checked) cur.add(k); else cur.delete(k);
          syncAll(shownValues());
          commit();
        });
        allBox.addEventListener('change', () => {
          for (const v of shownValues()) { if (allBox.checked) cur.add(v.key); else cur.delete(v.key); }
          draw();
          commit();
        });
        search.addEventListener('input', draw);
        wrap.append(clearable(search, draw), allRow, list);
        draw();
      } else {
        const ops = FILTER_OPS[col.filterType];
        const sel = el('select', 'lg-input');
        ops.forEach(([v, l]) => { const op = el('option', null, l); op.value = v; sel.appendChild(op); });
        sel.value = model ? model.op : ops[0][0];
        const mkIn = (ph, v) => {
          const i = el('input', 'lg-input');
          i.type = col.filterType === 'date' ? 'date' : col.filterType === 'number' ? 'number' : 'text';
          i.placeholder = ph;
          i.value = v == null ? '' : v;
          return i;
        };
        const in1 = mkIn('Filter…', model && model.value), in2 = mkIn('To…', model && model.value2);
        let w1 = null, w2 = null;
        const sync = () => {
          const op = sel.value;
          w1.style.display = op === 'blank' || op === 'notBlank' ? 'none' : '';
          w2.style.display = op === 'between' ? '' : 'none';
        };
        const fire = () => { sync(); apply({ type: col.filterType, op: sel.value, value: in1.value, value2: in2.value }); };
        const deb = debounce(fire, 220);
        w1 = clearable(in1, fire);
        w2 = clearable(in2, fire);
        sel.addEventListener('change', fire);
        in1.addEventListener('input', deb);
        in2.addEventListener('input', deb);
        wrap.append(sel, w1, w2);
        sync();
        if (inPopup) setTimeout(() => in1.focus(), 0);
      }
      const actions = el('div', 'lg-filter-actions');
      const clear = el('button', 'lg-btn lg-btn-sm', 'Clear');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        this.setFilter(col.id, null);
        if (inPopup) this._closePopup();
      });
      actions.appendChild(clear);
      if (inPopup) {
        const close = el('button', 'lg-btn lg-btn-sm', 'Close');
        close.type = 'button';
        close.addEventListener('click', () => this._closePopup());
        actions.appendChild(close);
      }
      wrap.appendChild(actions);
      return wrap;
    }
    openFilterPopup(col, anchor) {
      if (!col || !col.filterType) return;
      this._openPopup(this._buildFilterUI(col, true), anchor ? { anchor } : { x: 100, y: 100 });
    }

    /* ---------------- column API ---------------- */
    moveColumn(id, targetId, after) {
      const c = this.colMap.get(id), t = this.colMap.get(targetId);
      if (!c || !t || c === t) return;
      this.cols.splice(this.cols.indexOf(c), 1);
      this.cols.splice(this.cols.indexOf(t) + (after ? 1 : 0), 0, c);
      c.pinned = t.pinned;
      this.emit('columnMoved', { column: id });
      this._afterModelChange();
      this._renderSideBar();
    }
    setColumnVisible(id, visible) {
      const c = this.colMap.get(id);
      if (!c) return;
      c.hidden = !visible;
      this._afterModelChange();
      this._renderSideBar();
    }
    pinColumn(id, side) {
      const c = this._colById(id);
      if (!c) return;
      c.pinned = side === 'left' || side === 'right' ? side : null;
      this._afterModelChange();
      this._renderSideBar();
    }
    autoSizeColumn(id, skipRender) {
      const col = this._colById(id);
      if (!col || this._isUtil(col)) return;
      if (!this._mctx) this._mctx = document.createElement('canvas').getContext('2d');
      const ctx = this._mctx;
      const cs = getComputedStyle(this.rootEl);
      ctx.font = '600 ' + cs.fontSize + ' ' + cs.fontFamily;
      let max = ctx.measureText(col.header).width + 58;
      ctx.font = cs.fontSize + ' ' + cs.fontFamily;
      const sample = this.display.length > 400 ? this.display.slice(0, 400) : this.display;
      for (const e of sample) {
        if (e.kind === 'detail') continue;
        if (col.def && col.def.sparkline) { max = Math.max(max, 120); continue; }
        let w = ctx.measureText(this._cellText(col, e)).width + 28;
        if (col.special === 'group') w += e.level * 18 + 70;
        if (w > max) max = w;
      }
      col.width = Math.round(clamp(max, col.minWidth, 640));
      col.flex = 0;
      if (col.generated) this._genWidths.set(col.id, col.width);
      if (!skipRender) { this._layout(); this._renderAll(); }
    }
    autoSizeAll() {
      this.visible.forEach((c) => this.autoSizeColumn(c.id, true));
      this._layout();
      this._renderAll();
    }
    groupBy(ids) {
      this.groupCols = (ids || []).filter((id) => this.colMap.has(id));
      this.refresh();
    }
    pivotBy(ids) {
      this.pivotCols = (ids || []).filter((id) => this.colMap.has(id));
      this.refresh();
    }
    setPivotMode(on) {
      this.pivotMode = !!on;
      this.refresh();
    }
    setAggregate(id, fn) {
      const c = this.colMap.get(id);
      if (!c) return;
      c.agg = fn || null;
      this.refresh();
    }
    _dropToZone(zone, id, beforeId) {
      const col = this.colMap.get(id);
      if (!col) return;
      const insert = (arr) => {
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
        const j = beforeId ? arr.indexOf(beforeId) : -1;
        if (j < 0) arr.push(id); else arr.splice(j, 0, id);
      };
      if (zone === 'group') {
        if (this.o.treeData) return;
        if (!col.groupable) { this._toast(col.header + ' cannot be grouped'); return; }
        insert(this.groupCols);
      } else if (zone === 'pivot') {
        if (!col.pivotable) { this._toast(col.header + ' cannot be pivoted'); return; }
        insert(this.pivotCols);
      } else if (zone === 'value') {
        if (!col.agg) col.agg = col.type === 'number' ? 'sum' : 'count';
      } else return;
      this.refresh();
    }
    _removeFromZone(zone, id, silent) {
      if (zone === 'group') this.groupCols = this.groupCols.filter((x) => x !== id);
      else if (zone === 'pivot') this.pivotCols = this.pivotCols.filter((x) => x !== id);
      else if (zone === 'value') { const c = this.colMap.get(id); if (c) c.agg = null; }
      if (!silent) this.refresh();
    }
    resetColumns() {
      // keeps the current paging choice; everything else returns to start-up
      this.setState(Object.assign({}, this._initialState, { pagination: { enabled: !!this.o.pagination, pageSize: this.o.pageSize } }));
    }

    /* ---------------- state ---------------- */
    getState() {
      return {
        columns: this.cols.map((c) => ({ id: c.id, width: c.width, flex: c.flex, hidden: c.hidden, pinned: c.pinned, agg: typeof c.agg === 'string' ? c.agg : null, wrap: c.wrap })),
        groupColumn: { width: this._groupCol.width, pinned: this._groupCol.pinned },
        sorts: this.sorts.map((s) => Object.assign({}, s)),
        filters: this.getFilterModel(),
        groupBy: this.groupCols.slice(),
        pivotBy: this.pivotCols.slice(),
        pivotMode: this.pivotMode,
        quickFilter: this.quickFilter,
        pagination: { enabled: !!this.o.pagination, pageSize: this.o.pageSize },
      };
    }
    setState(s) {
      if (!s) return;
      if (s.columns) {
        const order = new Map(s.columns.map((c, i) => [c.id, i]));
        this.cols.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e9) - (order.has(b.id) ? order.get(b.id) : 1e9));
        s.columns.forEach((cs) => {
          const c = this.colMap.get(cs.id);
          if (!c) return;
          c.width = cs.width; c.flex = cs.flex; c.hidden = !!cs.hidden; c.pinned = cs.pinned || null;
          c.agg = cs.agg || (typeof c.agg === 'function' ? c.agg : null);
          if (cs.wrap !== undefined) c.wrap = cs.wrap;
        });
      }
      if (s.groupColumn) { this._groupCol.width = s.groupColumn.width; this._groupCol.pinned = s.groupColumn.pinned; }
      this.sorts = (s.sorts || []).map((x) => Object.assign({}, x));
      this.filters = new Map(Object.keys(s.filters || {}).map((k) => [k, Object.assign({}, s.filters[k])]));
      this.groupCols = (s.groupBy || []).filter((id) => this.colMap.has(id));
      this.pivotCols = (s.pivotBy || []).filter((id) => this.colMap.has(id));
      this.pivotMode = !!s.pivotMode;
      this.quickFilter = s.quickFilter || '';
      if (s.pagination) {
        this.o.pagination = !!s.pagination.enabled;
        if (s.pagination.pageSize > 0) this.o.pageSize = s.pagination.pageSize;
        if (this.o.pagination) this._ensurePager();
        this.page = 0;
      }
      if (this.quickInput) { this.quickInput.value = this.quickFilter; this.quickInput.dispatchEvent(new Event('change')); }
      this.refresh();
      if (s.pagination) this.emit('paginationChanged', this.getPaginationInfo());
    }

    /* ---------------- find ---------------- */
    setFind(term) {
      this.find.term = String(term || '').trim().toLowerCase();
      this.find.index = -1;
      this._recomputeFind();
      if (this.find.matches.length) { this.find.index = 0; this._gotoFind(); }
      else this._renderRows();
      this._renderFindInfo();
    }
    _recomputeFind() {
      const t = this.find.term;
      const m = [];
      if (t) {
        for (let r = 0; r < this.display.length; r++) {
          const e = this.display[r];
          if (e.kind === 'detail') continue;
          for (let c = 0; c < this.visible.length; c++) {
            const col = this.visible[c];
            if (this._isUtil(col)) continue;
            if (this._cellText(col, e).toLowerCase().indexOf(t) >= 0) m.push({ r, c });
          }
        }
      }
      this.find.matches = m;
      if (this.find.index >= m.length) this.find.index = m.length - 1;
      this._renderFindInfo();
    }
    findNext(dir) {
      const m = this.find.matches;
      if (!m.length) return;
      this.find.index = (this.find.index + (dir || 1) + m.length) % m.length;
      this._gotoFind();
      this._renderFindInfo();
    }
    _gotoFind() {
      const m = this.find.matches[this.find.index];
      if (!m) return;
      this.focus = { r: m.r, c: m.c };
      this.rangeEnd = this.focus;
      this.range = { r1: m.r, r2: m.r, c1: m.c, c2: m.c };
      this.ensureVisible(m.r, m.c);
      this._renderRows();
    }
    _renderFindInfo() {
      if (!this.findInfo) return;
      const m = this.find.matches;
      this.findInfo.textContent = this.find.term ? (m.length ? this.find.index + 1 + ' of ' + intFmt.format(m.length) : 'No matches') : '';
    }

    /* ---------------- popups & menus ---------------- */
    _openPopup(content, pos) {
      this._closePopup();
      const p = el('div', 'lg-popup ' + this._themeClass());
      p.appendChild(content);
      document.body.appendChild(p);
      let x, y;
      if (pos.anchor) { const r = pos.anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 2; }
      else { x = pos.x; y = pos.y; }
      const w = p.offsetWidth, h = p.offsetHeight;
      if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
      if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      const onDown = (ev) => { if (!p.contains(ev.target)) this._closePopup(); };
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); this._closePopup(); this.viewport.focus({ preventScroll: true }); } };
      const t = setTimeout(() => {
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
      }, 0);
      this._popup = { el: p, off: () => { clearTimeout(t); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); } };
      return p;
    }
    _closePopup() {
      if (!this._popup) return;
      this._popup.off();
      this._popup.el.remove();
      this._popup = null;
    }
    _buildMenu(items) {
      const m = el('div', 'lg-menu');
      m.setAttribute('role', 'menu');
      for (const it of items) {
        if (!it) continue;
        if (it === '-') { m.appendChild(el('div', 'lg-menu-sep')); continue; }
        const row = el('div', 'lg-menu-item' + (it.disabled ? ' lg-disabled' : ''));
        row.setAttribute('role', 'menuitem');
        const icon = el('span', 'lg-menu-icon');
        if (it.checked) icon.textContent = '✓';
        else if (it.iconHtml) icon.innerHTML = it.iconHtml;
        else if (it.icon) icon.textContent = it.icon;
        row.append(icon, el('span', 'lg-menu-label', it.label), el('span', 'lg-menu-sc', it.children ? '▸' : it.shortcut || ''));
        if (it.children) {
          const sub = this._buildMenu(it.children);
          sub.classList.add('lg-submenu');
          row.appendChild(sub);
          row.addEventListener('mouseenter', () => {
            const r = row.getBoundingClientRect();
            row.classList.toggle('lg-flip', r.right + 220 > window.innerWidth);
          });
        } else if (!it.disabled) {
          row.addEventListener('click', (e) => { e.stopPropagation(); this._closePopup(); it.action(); });
        }
        m.appendChild(row);
      }
      return m;
    }
    _openMenu(items, x, y) { this._openPopup(this._buildMenu(items), { x, y }); }

    _openColumnMenu(col, anchor) {
      if (!col) return;
      const isUser = !col.special && !col.generated;
      const grouped = this.groupCols.indexOf(col.id) >= 0;
      const items = [
        col.sortable && { label: 'Sort ascending', icon: '▲', action: () => this.setSort([{ id: col.id, dir: 'asc' }]) },
        col.sortable && { label: 'Sort descending', icon: '▼', action: () => this.setSort([{ id: col.id, dir: 'desc' }]) },
        col.sortable && { label: 'Clear sort', disabled: !this.sorts.some((s) => s.id === col.id), action: () => this.setSort(this.sorts.filter((s) => s.id !== col.id)) },
        '-',
        isUser && col.filterType && { label: 'Filter…', iconHtml: FUNNEL_SVG, action: () => setTimeout(() => this.openFilterPopup(col, anchor), 0) },
        isUser && col.filterType && this.filters.has(col.id) && { label: 'Clear filter', action: () => this.setFilter(col.id, null) },
        {
          label: 'Pin column', icon: '📌', children: [
            { label: 'Pin left', checked: col.pinned === 'left', action: () => this.pinColumn(col.id, 'left') },
            { label: 'Pin right', checked: col.pinned === 'right', action: () => this.pinColumn(col.id, 'right') },
            { label: 'No pin', checked: !col.pinned, action: () => this.pinColumn(col.id, null) },
          ],
        },
        { label: 'Autosize this column', icon: '↔', action: () => this.autoSizeColumn(col.id) },
        { label: 'Autosize all columns', action: () => this.autoSizeAll() },
        '-',
        isUser && col.groupable && !this.o.treeData && { label: grouped ? 'Un-group by ' + col.header : 'Group by ' + col.header, icon: '☷', action: () => (grouped ? this._removeFromZone('group', col.id) : this._dropToZone('group', col.id)) },
        isUser && { label: col.agg ? 'Remove aggregation' : 'Aggregate (' + (col.type === 'number' ? 'sum' : 'count') + ')', icon: 'Σ', action: () => (col.agg ? this.setAggregate(col.id, null) : this._dropToZone('value', col.id)) },
        isUser && { label: 'Hide column', icon: '⊘', action: () => this.setColumnVisible(col.id, false) },
        '-',
        { label: 'Reset columns', icon: '↺', action: () => this.resetColumns() },
      ];
      const r = anchor.getBoundingClientRect();
      this._openMenu(items, r.left, r.bottom + 2);
    }

    _onContextMenu(e) {
      if (!this.o.contextMenu || e.target.closest('.lg-detail')) return;
      e.preventDefault();
      const p = this._cellFromEvent(e);
      if (p && !this._inRange(p)) this._setRange(p, p);
      const entry = p ? this.display[p.r] : null;
      const hasRange = !!this.range;
      const chart = (t) => () => this.chartRange(t);
      let items = [
        { label: 'Copy', icon: '⧉', shortcut: 'Ctrl+C', disabled: !hasRange, action: () => this.copyRange(false) },
        { label: 'Copy with headers', disabled: !hasRange, action: () => this.copyRange(true) },
        { label: 'Paste', icon: '📋', shortcut: 'Ctrl+V', disabled: !hasRange, action: () => this.pasteFromClipboard() },
        '-',
        {
          label: 'Chart range', icon: '📊', disabled: !hasRange, children: [
            { label: 'Grouped bar', action: chart('bar') },
            { label: 'Stacked bar', action: chart('stacked') },
            { label: 'Line', action: chart('line') },
            { label: 'Area', action: chart('area') },
            { label: 'Pie', action: chart('pie') },
          ],
        },
        '-',
        this.o.selection && entry && entry.kind !== 'detail' && { label: 'Toggle row selection', icon: '☑', action: () => this._toggleSelectEntry(entry, p.r) },
        entry && entry.kind === 'group' && { label: this._isExpanded(entry.node) ? 'Collapse group' : 'Expand group', action: () => this.toggleExpand(entry.node) },
        { label: 'Expand all', action: () => this.expandAll() },
        { label: 'Collapse all', action: () => this.collapseAll() },
        { label: 'Autosize all columns', icon: '↔', action: () => this.autoSizeAll() },
        '-',
        { label: 'Undo', icon: '↶', shortcut: 'Ctrl+Z', disabled: !this.undoStack.length, action: () => this.undo() },
        { label: 'Redo', icon: '↷', shortcut: 'Ctrl+Y', disabled: !this.redoStack.length, action: () => this.redo() },
        '-',
        { label: 'Export', icon: '⤓', children: [
          { label: 'CSV export', action: () => this.exportCsv() },
          { label: 'Excel export (.xlsx)', action: () => this.exportExcel() },
        ] },
      ];
      if (this.o.contextMenuItems) items = this.o.contextMenuItems(items, { data: entry && entry.node.data, grid: this }) || items;
      this._openMenu(items, e.clientX, e.clientY);
    }

    _toast(msg) {
      const t = el('div', 'lg-toast', msg);
      this.rootEl.appendChild(t);
      setTimeout(() => t.classList.add('lg-hide'), 1800);
      setTimeout(() => t.remove(), 2200);
    }

    /* ---------------- charts ---------------- */
    chartRange(type) {
      const rg = this.range;
      if (!rg) return;
      const cols = this.visible.slice(rg.c1, rg.c2 + 1).filter((c) => !this._isUtil(c));
      const rows = this.display.slice(rg.r1, rg.r2 + 1).filter((e) => e.kind !== 'detail');
      if (!rows.length) return;
      const numeric = (c) => rows.some((e) => isNum(this._cellValue(c, e.node)));
      const catCol = cols.find((c) => c.special === 'group' || (!c.generated && c.type !== 'number' && !numeric(c)));
      const seriesCols = cols.filter((c) => c !== catCol && c.special !== 'group' && numeric(c));
      if (!seriesCols.length) { this._toast('Select a range that includes numeric cells to chart it'); return; }
      const cats = rows.map((e, i) => (catCol ? this._cellText(catCol, e) || '(blank)' : 'Row ' + (i + 1)));
      const series = seriesCols.map((c) => ({
        name: c.groupHeader && c.generated ? c.groupHeader + ' · ' + c.header : c.header,
        values: rows.map((e) => { const v = this._cellValue(c, e.node); return isNum(v) ? v : 0; }),
      }));
      this.openChart({ type, cats, series, title: series.map((s) => s.name).join(', ') + (catCol ? ' by ' + catCol.header : '') });
    }
    openChart(spec) {
      const dark = this.o.theme === 'dark';
      const back = el('div', 'lg-modal-backdrop ' + this._themeClass());
      const dlg = el('div', 'lg-modal');
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-label', 'Chart');
      const head = el('div', 'lg-modal-head');
      head.appendChild(el('div', 'lg-modal-title', spec.title || 'Chart'));
      const body = el('div', 'lg-chart-body');
      const btns = {};
      const draw = () => {
        body.innerHTML = chartSvg(spec.type, spec.cats, spec.series, 820, 440, dark);
        Object.keys(btns).forEach((k) => btns[k].classList.toggle('lg-active', k === spec.type));
      };
      [['bar', 'Bar'], ['stacked', 'Stacked'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie']].forEach(([k, l]) => {
        const b = el('button', 'lg-btn lg-btn-sm', l);
        b.type = 'button';
        b.addEventListener('click', () => { spec.type = k; draw(); });
        btns[k] = b;
        head.appendChild(b);
      });
      const dl = el('button', 'lg-btn lg-btn-sm', 'Download SVG');
      dl.type = 'button';
      dl.addEventListener('click', () => download(new Blob([body.innerHTML], { type: 'image/svg+xml' }), 'chart.svg'));
      const close = el('button', 'lg-btn lg-btn-sm', '✕');
      close.type = 'button';
      close.title = 'Close';
      const shut = () => { back.remove(); document.removeEventListener('keydown', onKey, true); this.viewport.focus({ preventScroll: true }); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
      close.addEventListener('click', shut);
      back.addEventListener('mousedown', (e) => { if (e.target === back) shut(); });
      document.addEventListener('keydown', onKey, true);
      head.append(dl, close);
      dlg.append(head, body);
      back.appendChild(dlg);
      document.body.appendChild(back);
      draw();
      close.focus();
    }

    /* ---------------- export ---------------- */
    _exportMatrix() {
      const cols = this.visible.filter((c) => !this._isUtil(c));
      const header = cols.map((c) => (c.generated && c.groupHeader ? c.groupHeader + ' - ' + c.header : c.header));
      const val = (c, e) => {
        if (c.special === 'group') {
          if (e.kind === 'total') return 'Total';
          const n = e.node;
          return n.group || n.tree ? '  '.repeat(e.level || 0) + (n.keyText == null ? '' : n.keyText) : '';
        }
        const v = this._cellValue(c, e.node);
        if (v == null) return '';
        if (Array.isArray(v)) return v.join(' ');
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        return c.def && c.def.exportFormatted ? this._cellText(c, e) : String(v);
      };
      const rows = [];
      for (const e of this.allDisplay) {
        if (e.kind === 'detail') continue;
        const r = cols.map((c) => val(c, e));
        if (e.kind === 'group') r._bold = true;
        rows.push(r);
      }
      if (this.o.totalsRow && this.root) {
        const r = cols.map((c, i) => { const v = val(c, { node: this.root, kind: 'total' }); return v === '' && i === 0 ? 'Total' : v; });
        r._bold = true;
        rows.push(r);
      }
      return { cols, header, rows };
    }
    getCsv() {
      const { header, rows } = this._exportMatrix();
      const q = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return [header].concat(rows).map((r) => r.map(q).join(',')).join('\r\n');
    }
    exportCsv(name) {
      download(new Blob(['﻿' + this.getCsv()], { type: 'text/csv;charset=utf-8' }), (name || this.o.exportFileName) + '.csv');
    }
    getExcelBlob() {
      const { cols, header, rows } = this._exportMatrix();
      return buildXlsx(header, rows, cols.map((c) => c.w || c.width || 120), 'Data');
    }
    exportExcel(name) {
      download(this.getExcelBlob(), (name || this.o.exportFileName) + '.xlsx');
    }

    /* ---------------- misc ---------------- */
    setTheme(theme) {
      this.o.theme = theme === 'dark' ? 'dark' : 'light';
      this.rootEl.classList.remove('lg-theme-light', 'lg-theme-dark');
      this.rootEl.classList.add(this._themeClass());
      this._detailCache.forEach((d) => { if (d._grid && d._grid.setTheme) d._grid.setTheme(this.o.theme); });
      this._renderRows();
    }
    destroy() {
      this._closePopup();
      if (this._ro) this._ro.disconnect();
      clearTimeout(this._flashTimer);
      this.rootEl.remove();
      this._listeners = {};
    }
  }

  LatticeGrid.aggregates = AGGS;
  LatticeGrid.sparkline = sparklineSvg;
  LatticeGrid.chartSvg = chartSvg;
  LatticeGrid.version = '1.5.0';
  global.LatticeGrid = LatticeGrid;
})(typeof window !== 'undefined' ? window : this);
