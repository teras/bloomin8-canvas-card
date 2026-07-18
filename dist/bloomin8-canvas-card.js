/*
 * bloomin8-canvas-card
 * Custom Lovelace card for BLOOMIN8 E-Ink Canvas panels.
 * Pick an image, crop-to-content, orientation-aware, saturation/contrast,
 * live preview, then upload via bloomin8_eink_canvas.upload_image_data.
 *
 * Destination is single-select (radio); each panel shows a thumbnail of its
 * current image, cached in localStorage. To save battery the device is never
 * polled for previews: thumbnails update on upload (from the sent image) or via
 * the manual "refresh" button (the only preview read that touches the device).
 *
 * Config:
 *   type: custom:bloomin8-canvas-card
 *   title: E-Ink Uploader            # optional
 *   panels:
 *     - entity: media_player.canvas1_media_player
 *       name: Canvas1
 *       resolution_entity: sensor.canvas1_screen_resolution   # optional
 *     - entity: media_player.canvas2_media_player
 *       name: Canvas2
 */

const CARD_VERSION = '1.0.0';

const TRANSLATIONS = {
  en: {
    drop_idle: 'Drag an image here or click to choose',
    close_image: 'Close image',
    saturation: 'Saturation',
    gamma: 'Gamma',
    contrast: 'Contrast',
    advanced: 'Advanced',
    crop_to_content: 'Crop to content',
    auto_rotate: 'Auto-rotate (landscape→portrait)',
    trim_tolerance: 'Trim tolerance',
    jpeg_quality: 'JPEG quality',
    refresh_preview: '↻ Refresh preview',
    destination: 'Destination',
    upload: 'Upload',
    refreshing: 'Refreshing previews from devices…',
    refreshed: (n) => `✓ Refreshed ${n} preview${n === 1 ? '' : 's'}.`,
    no_preview: 'No preview available (device asleep?).',
    read_error: "Couldn't read the image (unsupported type?).",
    pick_panel: 'Select a panel.',
    no_connection: 'No connection to Home Assistant.',
    uploading: (name) => `Uploading to ${name}…`,
    uploaded: (name) => `✓ Uploaded to ${name}.`,
    upload_error: (name, err) => `Error on ${name}: ${err}`,
  },
  el: {
    drop_idle: 'Σύρε μια εικόνα εδώ ή κάνε κλικ για επιλογή',
    close_image: 'Κλείσιμο εικόνας',
    saturation: 'Κορεσμός',
    gamma: 'Gamma',
    contrast: 'Αντίθεση',
    advanced: 'Για προχωρημένους',
    crop_to_content: 'Crop στο περιεχόμενο',
    auto_rotate: 'Auto-rotate (landscape→portrait)',
    trim_tolerance: 'Ανοχή trim',
    jpeg_quality: 'Ποιότητα JPEG',
    refresh_preview: '↻ Ανανέωση preview',
    destination: 'Προορισμός',
    upload: 'Ανέβασμα',
    refreshing: 'Ανανέωση preview από τις συσκευές…',
    refreshed: (n) => `✓ Ανανεώθηκαν ${n} preview.`,
    no_preview: 'Δεν ήταν διαθέσιμο κάποιο preview (συσκευή σε sleep;).',
    read_error: 'Δεν μπόρεσα να διαβάσω την εικόνα (μη υποστηριζόμενος τύπος;).',
    pick_panel: 'Διάλεξε έναν πίνακα.',
    no_connection: 'Δεν υπάρχει σύνδεση με το Home Assistant.',
    uploading: (name) => `Ανεβάζω στο ${name}…`,
    uploaded: (name) => `✓ Ανέβηκε στο ${name}.`,
    upload_error: (name, err) => `Σφάλμα στο ${name}: ${err}`,
  },
};

class Bloomin8CanvasCard extends HTMLElement {
  setConfig(config) {
    if (!config.panels || !config.panels.length) {
      throw new Error('bloomin8-canvas-card: define at least one panel under "panels"');
    }
    this._config = config;
    this._selectedEntity = config.panels[0].entity; // radio: first by default
    if (!this._built) this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._refreshThumbnails();
    if (this._el && this._lang() !== this._lastLang) this._localize();
  }

  getCardSize() { return 11; }

  static getStubConfig() {
    return {
      title: 'E-Ink Uploader',
      panels: [
        { entity: 'media_player.canvas1_media_player', name: 'Canvas1' },
        { entity: 'media_player.canvas2_media_player', name: 'Canvas2' },
      ],
    };
  }

  // ---------- DOM ----------
  _build() {
    this._built = true;
    const card = document.createElement('ha-card');
    const title = this._config.title || 'E-Ink Uploader';

    const wrap = document.createElement('div');
    wrap.className = 'b8-wrap';
    wrap.innerHTML = `
      <style>
        .b8-wrap { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
        .b8-header {
          font-family: var(--ha-card-header-font-family, inherit);
          font-size: var(--ha-card-header-font-size, 24px);
          color: var(--ha-card-header-color, var(--primary-text-color));
          letter-spacing: -0.012em; line-height: 1.2;
        }
        .b8-drop {
          border: 2px dashed var(--divider-color, #999); border-radius: 10px;
          padding: 18px; text-align: center; color: var(--secondary-text-color);
          cursor: pointer; transition: background .15s, border-color .15s;
        }
        .b8-drop.drag { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }
        .b8-drop.has { border-style: solid; }
        .b8-preview-box { display: none; justify-content: center; background: var(--card-background-color); }
        .b8-pvwrap { position: relative; display: inline-block; }
        .b8-preview {
          max-width: 100%; max-height: 420px; border: 1px solid var(--divider-color);
          border-radius: 6px; display: block;
        }
        .b8-close {
          position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; border: none;
          border-radius: 50%; background: rgba(0,0,0,.55); color: #fff; font-size: 17px; line-height: 28px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
        }
        .b8-close:hover { background: var(--error-color, #db4437); }
        .b8-ctrl { display: flex; flex-direction: column; gap: 4px; }
        .b8-ctrl-head {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 13px; color: var(--secondary-text-color);
        }
        .b8-ctrl input[type=range] { width: 100%; margin: 0; box-sizing: border-box; }
        .b8-val { font-variant-numeric: tabular-nums; color: var(--primary-text-color); font-weight: 500; }
        .b8-toggles { display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; }
        .b8-toggles label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .b8-dest-label { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 6px; }
        .b8-dest { display: flex; gap: 12px; flex-wrap: wrap; }
        .b8-tile {
          position: relative; border: 2px solid var(--divider-color); border-radius: 10px;
          padding: 8px; cursor: pointer; width: 120px; text-align: center;
          transition: border-color .15s, box-shadow .15s; background: var(--secondary-background-color);
        }
        .b8-tile.on { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
        .b8-thumb {
          width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px;
          background: var(--card-background-color); display: block;
        }
        .b8-thumb-ph {
          width: 100%; aspect-ratio: 3 / 4; border-radius: 6px; display: flex;
          align-items: center; justify-content: center; color: var(--secondary-text-color);
          background: var(--card-background-color);
        }
        .b8-tile-name { font-size: 14px; font-weight: 500; margin-top: 6px; }
        .b8-tile-cur { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; }
        .b8-radio {
          position: absolute; top: 6px; right: 6px; width: 18px; height: 18px; border-radius: 50%;
          border: 2px solid var(--divider-color); background: var(--card-background-color);
        }
        .b8-tile.on .b8-radio { border-color: var(--primary-color); }
        .b8-tile.on .b8-radio::after {
          content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--primary-color);
        }
        .b8-actions { display: flex; gap: 12px; align-items: center; }
        .b8-btn {
          background: var(--primary-color); color: #fff; border: none; border-radius: 8px;
          padding: 9px 18px; font-size: 14px; cursor: pointer;
        }
        .b8-btn[disabled] { opacity: .5; cursor: default; }
        .b8-btn-sec {
          background: var(--secondary-background-color); color: var(--primary-text-color);
          border: 1px solid var(--divider-color);
        }
        .b8-status { font-size: 13px; color: var(--secondary-text-color); flex: 1; }
        .b8-adv { font-size: 13px; }
        .b8-adv summary { cursor: pointer; color: var(--secondary-text-color); }
      </style>

      <div class="b8-header">${title}</div>

      <div class="b8-drop" id="drop">
        <ha-icon icon="mdi:image-plus"></ha-icon>
        <div id="dropLabel">Drag an image here or click to choose</div>
      </div>
      <input type="file" id="file" accept="image/*" style="display:none">

      <div class="b8-preview-box" id="pvbox">
        <div class="b8-pvwrap" id="pvwrap">
          <canvas class="b8-preview" id="preview"></canvas>
          <button class="b8-close" id="clear" title="Close image">✕</button>
        </div>
      </div>

      <div class="b8-ctrl">
        <div class="b8-ctrl-head"><span id="satLbl">Saturation</span><span class="b8-val" id="satVal">1.00</span></div>
        <input type="range" id="sat" min="0" max="2" step="0.05" value="1">
      </div>
      <div class="b8-ctrl">
        <div class="b8-ctrl-head"><span id="gamLbl">Gamma</span><span class="b8-val" id="gamVal">1.00</span></div>
        <input type="range" id="gam" min="0.4" max="2.5" step="0.05" value="1">
      </div>
      <div class="b8-ctrl">
        <div class="b8-ctrl-head"><span id="conLbl">Contrast</span><span class="b8-val" id="conVal">0</span></div>
        <input type="range" id="con" min="-60" max="60" step="1" value="0">
      </div>

      <details class="b8-adv">
        <summary id="advSummary">Advanced</summary>
        <div class="b8-toggles" style="margin-top:10px">
          <label><input type="checkbox" id="trim" checked> <span id="trimLbl">Crop to content</span></label>
          <label><input type="checkbox" id="rot" checked> <span id="rotLbl">Auto-rotate (landscape→portrait)</span></label>
        </div>
        <div class="b8-ctrl" style="margin-top:10px">
          <div class="b8-ctrl-head"><span id="tolLbl">Trim tolerance</span><span class="b8-val" id="tolVal">14</span></div>
          <input type="range" id="tol" min="0" max="60" step="1" value="14">
        </div>
        <div class="b8-ctrl" style="margin-top:10px">
          <div class="b8-ctrl-head"><span id="qLbl">JPEG quality</span><span class="b8-val" id="qVal">0.85</span></div>
          <input type="range" id="q" min="0.5" max="0.95" step="0.05" value="0.85">
        </div>
        <button class="b8-btn b8-btn-sec" id="refresh" style="margin-top:12px">↻ Refresh preview</button>
      </details>

      <div>
        <div class="b8-dest-label" id="destLbl">Destination</div>
        <div class="b8-dest" id="panels"></div>
      </div>

      <div class="b8-actions">
        <button class="b8-btn" id="send" disabled>Upload</button>
        <div class="b8-status" id="status"></div>
      </div>
    `;

    card.appendChild(wrap);
    this.appendChild(card);
    this._el = {};
    for (const id of ['drop','dropLabel','file','pvbox','pvwrap','preview','clear','sat','satVal','satLbl',
                      'gam','gamVal','gamLbl','con','conVal','conLbl',
                      'advSummary','trim','trimLbl','rot','rotLbl','tol','tolVal','tolLbl',
                      'q','qVal','qLbl','refresh','destLbl','panels','send','status']) {
      this._el[id] = wrap.querySelector('#' + id);
    }
    this._buildPanelTiles();
    this._wire();
    this._refreshThumbnails();
    this._localize();
  }

  // ---------- i18n ----------
  _lang() {
    let l = this._config && this._config.language;
    if (!l && this._hass) l = (this._hass.locale && this._hass.locale.language) || this._hass.language;
    l = (l || 'en').toLowerCase().split('-')[0];
    return TRANSLATIONS[l] ? l : 'en';
  }

  _t(key, ...args) {
    const dict = TRANSLATIONS[this._lang()] || TRANSLATIONS.en;
    const v = dict[key] !== undefined ? dict[key] : TRANSLATIONS.en[key];
    return typeof v === 'function' ? v(...args) : v;
  }

  _localize() {
    const e = this._el;
    if (!e) return;
    this._lastLang = this._lang();
    if (!this._srcImg) e.dropLabel.textContent = this._t('drop_idle'); // keep filename if an image is loaded
    e.clear.title = this._t('close_image');
    e.satLbl.textContent = this._t('saturation');
    e.gamLbl.textContent = this._t('gamma');
    e.conLbl.textContent = this._t('contrast');
    e.advSummary.textContent = this._t('advanced');
    e.trimLbl.textContent = this._t('crop_to_content');
    e.rotLbl.textContent = this._t('auto_rotate');
    e.tolLbl.textContent = this._t('trim_tolerance');
    e.qLbl.textContent = this._t('jpeg_quality');
    e.refresh.textContent = this._t('refresh_preview');
    e.destLbl.textContent = this._t('destination');
    e.send.textContent = this._t('upload');
  }

  _buildPanelTiles() {
    this._el.panels.innerHTML = '';
    this._tiles = [];
    for (const p of this._config.panels) {
      const tile = document.createElement('div');
      tile.className = 'b8-tile' + (p.entity === this._selectedEntity ? ' on' : '');
      tile.innerHTML = `
        <div class="b8-radio"></div>
        <div class="b8-thumb-ph"><ha-icon icon="mdi:image-off-outline"></ha-icon></div>
        <div class="b8-tile-name"></div>
        <div class="b8-tile-cur"></div>
      `;
      const img = document.createElement('img');
      img.className = 'b8-thumb';
      img.style.display = 'none';
      tile.insertBefore(img, tile.querySelector('.b8-thumb-ph'));
      tile.querySelector('.b8-tile-name').textContent = p.name || p.entity;
      tile.addEventListener('click', () => this._selectPanel(p.entity));
      this._el.panels.appendChild(tile);
      const rec = { panel: p, el: tile, img, ph: tile.querySelector('.b8-thumb-ph'),
                    cur: tile.querySelector('.b8-tile-cur') };
      this._tiles.push(rec);
      // Show locally-cached thumbnail (no device call). Populated on upload / manual refresh.
      const cached = this._loadThumb(p.entity);
      if (cached) this._setTileImg(rec, cached);
    }
  }

  // ---------- local thumbnail cache (battery-friendly: no device polling) ----------
  _thumbKey(entity) { return 'b8thumb:' + entity; }

  _loadThumb(entity) {
    try { return localStorage.getItem(this._thumbKey(entity)); } catch (e) { return null; }
  }

  _saveThumb(entity, dataUrl) {
    try { localStorage.setItem(this._thumbKey(entity), dataUrl); } catch (e) { /* quota/disabled */ }
  }

  _setTileImg(rec, dataUrl) {
    rec.img.onload = () => { rec.img.style.display = 'block'; rec.ph.style.display = 'none'; };
    rec.img.onerror = () => { rec.img.style.display = 'none'; rec.ph.style.display = 'flex'; };
    rec.img.src = dataUrl;
  }

  _makeThumb(src) {
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const TW = 180, TH = 240, tr = TW / TH, sr = sw / sh;
    let dsw, dsh;
    if (sr > tr) { dsh = sh; dsw = Math.round(sh * tr); }
    else         { dsw = sw; dsh = Math.round(sw / tr); }
    const dsx = Math.round((sw - dsw) / 2), dsy = Math.round((sh - dsh) / 2);
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, dsx, dsy, dsw, dsh, 0, 0, TW, TH);
    return c.toDataURL('image/jpeg', 0.8);
  }

  _loadImageThumb(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => { try { resolve(this._makeThumb(im)); } catch (e) { reject(e); } };
      im.onerror = reject;
      im.src = url;
    });
  }

  async _refreshPreviews() {
    if (!this._hass) return;
    this._el.refresh.disabled = true;
    this._setStatus(this._t('refreshing'));
    let n = 0;
    for (const t of this._tiles) {
      const st = this._hass.states[t.panel.entity];
      const pic = st && st.attributes && st.attributes.entity_picture;
      if (!pic) continue;
      try {
        const dataUrl = await this._loadImageThumb(pic);
        this._setTileImg(t, dataUrl);
        this._saveThumb(t.panel.entity, dataUrl);
        n++;
      } catch (e) { /* device asleep/offline */ }
    }
    this._el.refresh.disabled = false;
    this._setStatus(n ? this._t('refreshed', n) : this._t('no_preview'));
  }

  _selectPanel(entity) {
    this._selectedEntity = entity;
    for (const t of this._tiles) t.el.classList.toggle('on', t.panel.entity === entity);
    this._render(); // aspect may differ per panel
  }

  _refreshThumbnails() {
    // Only sync the free, state-derived filename text. Thumbnails come from the
    // local cache (set on upload / manual refresh) so we never poll the device.
    if (!this._hass || !this._tiles) return;
    for (const t of this._tiles) {
      const st = this._hass.states[t.panel.entity];
      const curName = (st && st.attributes && (st.attributes.current_image || st.attributes.media_title)) || '';
      t.cur.textContent = curName;
    }
  }

  _wire() {
    const e = this._el;
    e.drop.addEventListener('click', () => e.file.click());
    e.drop.addEventListener('dragover', (ev) => { ev.preventDefault(); e.drop.classList.add('drag'); });
    e.drop.addEventListener('dragleave', () => e.drop.classList.remove('drag'));
    e.drop.addEventListener('drop', (ev) => {
      ev.preventDefault(); e.drop.classList.remove('drag');
      if (ev.dataTransfer.files && ev.dataTransfer.files[0]) this._loadFile(ev.dataTransfer.files[0]);
    });
    e.file.addEventListener('change', (ev) => {
      if (ev.target.files && ev.target.files[0]) this._loadFile(ev.target.files[0]);
    });

    const live = () => this._scheduleRender();
    e.sat.addEventListener('input', () => { e.satVal.textContent = (+e.sat.value).toFixed(2); live(); });
    e.gam.addEventListener('input', () => { e.gamVal.textContent = (+e.gam.value).toFixed(2); live(); });
    e.con.addEventListener('input', () => { e.conVal.textContent = e.con.value; live(); });
    e.tol.addEventListener('input', () => { e.tolVal.textContent = e.tol.value; live(); });
    e.q.addEventListener('input',   () => { e.qVal.textContent   = (+e.q.value).toFixed(2); });
    e.trim.addEventListener('change', live);
    e.rot.addEventListener('change', live);
    e.clear.addEventListener('click', () => this._clear());
    e.refresh.addEventListener('click', () => this._refreshPreviews());
    e.send.addEventListener('click', () => this._send());
  }

  // ---------- resolution ----------
  _resFor(panel) {
    let w = 1200, h = 1600; // default: 13.3" Canvas
    const guess = panel.resolution_entity ||
      (panel.entity ? panel.entity.replace(/^media_player\./, 'sensor.').replace(/_media_player$/, '_screen_resolution') : null);
    const st = guess && this._hass && this._hass.states[guess];
    if (st && st.attributes && st.attributes.width && st.attributes.height) {
      w = +st.attributes.width; h = +st.attributes.height;
    }
    return { w, h };
  }

  _targetRatio() {
    const first = this._config.panels.find((p) => p.entity === this._selectedEntity) || this._config.panels[0];
    const r = this._resFor(first);
    return { ...r, ratio: r.w / r.h };
  }

  // ---------- image pipeline ----------
  _loadFile(file) {
    this._fileName = (file.name || 'image').replace(/\.[^.]+$/, '');
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      this._srcImg = img;
      this._el.drop.classList.add('has');
      this._el.dropLabel.textContent = `${file.name} — ${img.naturalWidth}×${img.naturalHeight}`;
      this._el.pvbox.style.display = 'flex';
      this._el.send.disabled = false;
      this._setStatus('');
      this._render();
    };
    img.onerror = () => this._setStatus(this._t('read_error'), true);
    img.src = URL.createObjectURL(file);
  }

  _clear() {
    this._srcImg = null;
    this._outCanvas = null;
    this._fileName = null;
    this._el.file.value = '';
    this._el.pvbox.style.display = 'none';
    this._el.drop.classList.remove('has');
    this._el.dropLabel.textContent = this._t('drop_idle');
    this._el.send.disabled = true;
    this._setStatus('');
  }

  _scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._render(); });
  }

  _maybeRotate(img) {
    const c = document.createElement('canvas');
    const cx = c.getContext('2d');
    const wantRotate = this._el.rot.checked && img.naturalWidth > img.naturalHeight;
    if (wantRotate) {
      c.width = img.naturalHeight; c.height = img.naturalWidth;
      cx.translate(c.width / 2, c.height / 2);
      cx.rotate(Math.PI / 2);
      cx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    } else {
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      cx.drawImage(img, 0, 0);
    }
    return c;
  }

  _trimBox(data, width, height, tol) {
    const br = data[0], bg = data[1], bb = data[2];
    const differs = (i) =>
      Math.abs(data[i] - br) > tol || Math.abs(data[i + 1] - bg) > tol || Math.abs(data[i + 2] - bb) > tol;
    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    let found = false;
    top:  for (; top <= bottom; top++)   for (let x = 0; x < width; x++) if (differs((top * width + x) * 4))    { found = true; break top; }
    if (!found) return { x: 0, y: 0, w: width, h: height };
    bot:  for (; bottom > top; bottom--)  for (let x = 0; x < width; x++) if (differs((bottom * width + x) * 4)) break bot;
    lft:  for (; left <= right; left++)   for (let y = top; y <= bottom; y++) if (differs((y * width + left) * 4))  break lft;
    rgt:  for (; right > left; right--)   for (let y = top; y <= bottom; y++) if (differs((y * width + right) * 4)) break rgt;
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  _coverRect(box, ratio) {
    const cRatio = box.w / box.h;
    let sw, sh;
    if (cRatio > ratio) { sh = box.h; sw = Math.round(box.h * ratio); }
    else                { sw = box.w; sh = Math.round(box.w / ratio); }
    const sx = box.x + Math.round((box.w - sw) / 2);
    const sy = box.y + Math.round((box.h - sh) / 2);
    return { sx, sy, sw, sh };
  }

  _render() {
    if (!this._srcImg) return;
    const { w: outW, h: outH, ratio } = this._targetRatio();

    const base = this._maybeRotate(this._srcImg);
    const bctx = base.getContext('2d', { willReadFrequently: true });

    let box = { x: 0, y: 0, w: base.width, h: base.height };
    if (this._el.trim.checked) {
      const full = bctx.getImageData(0, 0, base.width, base.height);
      box = this._trimBox(full.data, base.width, base.height, +this._el.tol.value);
      if (box.w < 2 || box.h < 2) box = { x: 0, y: 0, w: base.width, h: base.height };
    }

    const cover = this._coverRect(box, ratio);
    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(base, cover.sx, cover.sy, cover.sw, cover.sh, 0, 0, outW, outH);

    const sat = +this._el.sat.value;
    const gam = +this._el.gam.value;
    const con = +this._el.con.value;
    if (sat !== 1 || gam !== 1 || con !== 0) this._adjust(octx, outW, outH, sat, gam, con);

    const pv = this._el.preview;
    pv.width = outW; pv.height = outH;
    pv.getContext('2d').drawImage(out, 0, 0);
    this._outCanvas = out;
  }

  _adjust(ctx, w, h, sat, gamma, conSlider) {
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    // Precompute a per-channel tone LUT: gamma (midtone remap) then contrast (pivot 128).
    const cf = (259 * (conSlider + 255)) / (255 * (259 - conSlider));
    const invG = 1 / gamma; // gamma>1 brightens midtones
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let t = 255 * Math.pow(v / 255, invG);
      t = cf * (t - 128) + 128;
      lut[v] = t;
    }
    for (let i = 0; i < d.length; i += 4) {
      const r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      d[i]     = lum + (r - lum) * sat;
      d[i + 1] = lum + (g - lum) * sat;
      d[i + 2] = lum + (b - lum) * sat;
    }
    ctx.putImageData(im, 0, 0);
  }

  // ---------- upload ----------
  async _send() {
    if (!this._outCanvas) return;
    const target = this._config.panels.find((p) => p.entity === this._selectedEntity);
    if (!target) { this._setStatus(this._t('pick_panel'), true); return; }
    if (!this._hass) { this._setStatus(this._t('no_connection'), true); return; }

    const q = +this._el.q.value;
    const b64 = this._outCanvas.toDataURL('image/jpeg', q).split(',', 2)[1];
    const filename = (this._fileName || 'ha_image') + '.jpg';
    const name = target.name || target.entity;

    this._el.send.disabled = true;
    this._setStatus(this._t('uploading', name));
    try {
      await this._hass.callService('bloomin8_eink_canvas', 'upload_image_data', {
        entity_id: target.entity,
        image_data: b64,
        filename,
        gallery: 'default',
        show_now: true,
        process: true,
      });
      // Update this panel's cached preview locally from what we just sent (no device call).
      try {
        const rec = this._tiles.find((t) => t.panel.entity === target.entity);
        const thumb = this._makeThumb(this._outCanvas);
        if (rec) this._setTileImg(rec, thumb);
        this._saveThumb(target.entity, thumb);
      } catch (e) { /* non-fatal */ }
      this._setStatus(this._t('uploaded', name));
    } catch (err) {
      this._setStatus(this._t('upload_error', name, err && err.message ? err.message : err), true);
    } finally {
      this._el.send.disabled = false;
    }
  }

  _setStatus(msg, isError) {
    this._el.status.textContent = msg;
    this._el.status.style.color = isError ? 'var(--error-color, #db4437)' : 'var(--secondary-text-color)';
  }
}

customElements.define('bloomin8-canvas-card', Bloomin8CanvasCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'bloomin8-canvas-card',
  name: 'BLOOMIN8 Canvas Uploader',
  description: 'Upload an image with crop-to-content, saturation and live preview to a BLOOMIN8 E-Ink Canvas.',
});
console.info(
  `%c bloomin8-canvas-card %c v${CARD_VERSION} `,
  'background:#555;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px',
  'background:#1e88e5;color:#fff;border-radius:0 3px 3px 0;padding:2px 4px',
);
