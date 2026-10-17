/* PV d'expertise GAUER : application terrain hors ligne */
(() => {
  'use strict';
  const S = window.PVSCHEMA, P = window.PVPDF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const has = P.has;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const EXPERT = { nom: 'Rodolphe GAUER', societe: 'GAUER Expertise Bâtiment', tel: '06 35 56 23 65', mail: 'gauer.expertise@outlook.fr' };

  /* ================= Stockage local (IndexedDB) ================= */
  const DB = {
    db: null,
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('gauer-pv', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          ['dossiers', 'pvs', 'blobs'].forEach((n) => d.createObjectStore(n, { keyPath: 'id' }));
          d.createObjectStore('meta', { keyPath: 'k' });
        };
        r.onsuccess = () => { this.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      });
    },
    tx(store, mode, fn) {
      return new Promise((res, rej) => {
        const t = this.db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let out;
        if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    },
    all(s) { return this.tx(s, 'readonly', (o) => o.getAll()); },
    get(s, k) { return this.tx(s, 'readonly', (o) => o.get(k)); },
    put(s, v) { return this.tx(s, 'readwrite', (o) => o.put(v)); }
  };

  const urlCache = new Map();
  async function blobURL(id) {
    if (!id) return '';
    if (urlCache.has(id)) return urlCache.get(id);
    const r = await DB.get('blobs', id);
    if (!r) return '';
    const u = URL.createObjectURL(r.blob);
    urlCache.set(id, u);
    return u;
  }
  async function saveBlob(blob, extra) {
    const id = 'b' + uid();
    let w = 0, h = 0;
    try { const bm = await createImageBitmap(blob); w = bm.width; h = bm.height; bm.close && bm.close(); } catch (e) { /* pas une image */ }
    await DB.put('blobs', Object.assign({ id, blob, type: blob.type, w, h, at: Date.now() }, extra || {}));
    return id;
  }

  /* ================= État ================= */
  const st = { dossiers: [], pvs: [], config: {}, pv: null, dos: null, saveT: null, dosT: null, cfgT: null, lastPdf: null };

  async function loadAll() {
    st.dossiers = await DB.all('dossiers');
    st.pvs = await DB.all('pvs');
    const sv = await DB.get('meta', 'suivi'); if (sv) st.suivi = sv.v;
    const c = await DB.get('meta', 'config');
    st.config = Object.assign({ expertNom: EXPERT.nom, villeDefaut: 'Le Mans', gps: true, delaiObs: '15' }, c ? c.v : {});
  }
  const liveDossiers = () => st.dossiers.filter((d) => !d.deleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pvsOf = (id, trash) => st.pvs.filter((p) => p.dossierId === id && !!p.deleted === !!trash).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const dossierOf = (pv) => st.dossiers.find((d) => d.id === pv.dossierId) || {};

  function setSaveState(t, cls) {
    const el = $('#save'); if (!el) return;
    el.textContent = t; el.className = 'save ' + (cls || '');
  }
  function schedulePV() {
    if (!st.pv) return;
    setSaveState('Modification en cours', 'busy');
    clearTimeout(st.saveT);
    st.saveT = setTimeout(savePV, 500);
  }
  async function savePV() {
    clearTimeout(st.saveT);
    if (!st.pv) return;
    st.pv.updatedAt = Date.now();
    try {
      await DB.put('pvs', clone(st.pv));
      const i = st.pvs.findIndex((p) => p.id === st.pv.id);
      if (i >= 0) st.pvs[i] = clone(st.pv); else st.pvs.push(clone(st.pv));
      touchDossier(st.pv.dossierId);
      setSaveState('Enregistré sur la tablette', 'ok');
    } catch (e) {
      setSaveState("Échec de l'enregistrement", 'bad');
      toast("L'enregistrement a échoué. Vérifiez l'espace libre de la tablette.", 'bad');
    }
  }
  async function touchDossier(id) {
    const d = st.dossiers.find((x) => x.id === id);
    if (!d) return;
    d.updatedAt = Date.now();
    await DB.put('dossiers', clone(d));
  }
  async function saveDossier(d) {
    d.updatedAt = Date.now();
    await DB.put('dossiers', clone(d));
    const i = st.dossiers.findIndex((x) => x.id === d.id);
    if (i >= 0) st.dossiers[i] = clone(d); else st.dossiers.push(clone(d));
  }
  async function saveConfig() {
    await DB.put('meta', { k: 'config', v: clone(st.config) });
  }

  /* ================= Utilitaires d'interface ================= */
  function toast(msg, cls, action) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
    if (action) t.querySelector('button').onclick = () => { action.fn(); t.remove(); };
    $('#toasts').appendChild(t);
    if (!action) {
      setTimeout(() => t.classList.add('out'), 4200);
      setTimeout(() => t.remove(), 4800);
    }
  }
  function modal(html, opts = {}) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'modal-back';
      m.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(m);
      const close = (v) => { m.remove(); resolve(v); };
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-res]');
        if (b) { const v = b.dataset.res; close(v === 'ok' && opts.collect ? opts.collect(m) : v); }
        else if (e.target === m && !opts.sticky) close(null);
      });
      if (opts.onOpen) opts.onOpen(m, close);
      const f = m.querySelector('input,textarea'); if (f) setTimeout(() => f.focus(), 60);
    });
  }
  const confirmBox = (title, text, ok = 'Confirmer', danger) => modal(
    `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="mbtns"><button class="btn ghost" data-res="no">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-res="ok">${esc(ok)}</button></div>`
  ).then((r) => r === 'ok');
  const askText = (title, value = '', label = '') => modal(
    `<h3>${esc(title)}</h3>${label ? `<label class="mlabel" for="askv">${esc(label)}</label>` : ''}<input id="askv" class="inp" value="${esc(value)}"><div class="mbtns"><button class="btn ghost" data-res="no">Annuler</button><button class="btn primary" data-res="ok">Valider</button></div>`,
    { collect: (m) => m.querySelector('#askv').value }
  ).then((r) => (r === 'no' || r == null) ? null : r);

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function setPath(obj, path, v) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      const k = ks[i];
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[k];
    }
    o[ks[ks.length - 1]] = v;
  }
  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 600) + 'px'; }

  /* ================= Routage ================= */
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  window.addEventListener('hashchange', () => render());

  async function render() {
    if (st.pv) await savePV();
    const h = location.hash.replace(/^#/, '');
    const [r, id] = h.split('/');
    st.pv = null;
    const main = $('#main');
    window.scrollTo(0, 0);
    if (r === 'd' && id) { st.dos = st.dossiers.find((d) => d.id === id); if (!st.dos) return go('#'); return renderDossier(main); }
    if (r === 'pv' && id) {
      const pv = st.pvs.find((p) => p.id === id);
      if (!pv) return go('#');
      st.pv = clone(pv);
      return renderPV(main);
    }
    if (r === 'reglages') return renderSettings(main);
    if (r === 'corbeille') return renderTrash(main);
    return renderHome(main);
  }
  function crumbs(items) {
    $('#crumbs').innerHTML = items.map((c, i) => i < items.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a><span aria-hidden="true">/</span>` : `<span class="cur">${esc(c[0])}</span>`).join('');
  }

  /* ================= Accueil ================= */
  function renderHome(main) {
    crumbs([['Dossiers', '#']]);
    const ds = liveDossiers();
    const drafts = st.pvs.filter((p) => !p.deleted && p.statut !== 'clos' && ds.some((d) => d.id === p.dossierId)).sort((a, b) => b.updatedAt - a.updatedAt);
    main.innerHTML = `
      <section class="home">
        <div class="home-head">
          <div>
            <p class="eyebrow">GAUER Expertise Bâtiment</p>
            <h1>Dossiers</h1>
          </div>
          <div class="row gap">
            <button class="btn ghost" data-act="importSuivi">Ajouter depuis le suivi Excel</button>
            <button class="btn primary" data-act="newDossier">Nouveau dossier</button>
          </div>
        </div>
        ${drafts.length ? `<div class="drafts"><h2 class="lbl">PV en cours</h2><div class="draft-list">${drafts.slice(0, 6).map((p) => {
          const d = dossierOf(p);
          return `<a class="draft" href="#pv/${p.id}"><span class="ref">${esc(d.ref || '')}</span><b>${esc(S.TYPES[p.type].label)}</b><span class="muted">v${p.version} du ${esc(P.fmtShort(p.f.date))}</span></a>`;
        }).join('')}</div></div>` : ''}
        <div class="row gap wrap filt"><div class="chips" role="group" aria-label="Filtre">${[['actifs', 'Dossiers actifs'], ['tous', 'Tous les dossiers']].map(([k, l]) => `<button type="button" class="chip${(st.filter || 'actifs') === k ? ' on' : ''}" data-act="filter" data-val="${k}">${l}</button>`).join('')}</div></div>
        <p id="qinfo" class="qinfo"></p>
        <div id="dlist" class="dgrid"></div>
      </section>`;
    const list = () => {
      const q = st.q || '';
      const items = ds.filter((d) => (st.filter === 'tous' || q || !d.etat || d.etat === 'Actif')).filter((d) => !q || matchDossier(d, q));
      const info = $('#qinfo');
      if (info) info.innerHTML = q ? `${items.length} dossier${items.length > 1 ? 's' : ''} pour « ${esc(st.qRaw)} » <button class="btn small ghost" data-act="clearSearch">Effacer la recherche</button>` : '';
      $('#dlist').innerHTML = items.length ? items.map((d) => {
        const pvs = pvsOf(d.id);
        const open = pvs.filter((p) => p.statut !== 'clos').length;
        return `<a class="dcard" href="#d/${d.id}">
          <span class="ref">${esc(d.ref || 'Sans référence')}</span>
          <b class="client">${esc(d.client || 'Client à renseigner')}</b>
          <span class="muted">${esc([d.adresse, d.ville].filter(has).join(', ') || 'Adresse à renseigner')}</span>
          <span class="dmeta"><span>${pvs.length} PV</span>${(d.intervenants || []).length ? `<span>${d.intervenants.length} intervenant${d.intervenants.length > 1 ? 's' : ''}</span>` : ''}${open ? `<span class="pill draft">${open} en cours</span>` : ''}${d.etat && d.etat !== 'Actif' ? `<span class="pill muted-pill">${esc(d.etat)}</span>` : ''}</span>
        </a>`;
      }).join('') : (ds.length ? `<p class="muted pad">Aucun dossier ne correspond à la recherche.</p>` : `
        <div class="empty">
          <h2>Aucun dossier pour l'instant</h2>
          <p>Ouvrez votre fichier « Suivi dossiers GAUER Expertise » depuis OneDrive et choisissez le dossier à préparer, ou créez un dossier au format RG-AAAA-MM-NOM, puis ouvrez-y un PV : réunion contradictoire, constat sur site, pré-livraison ou feuille de présence. Tout est enregistré sur la tablette et fonctionne sans réseau.</p>
          <div class="row gap wrap"><button class="btn primary" data-act="importSuivi">Ajouter depuis le suivi Excel</button><button class="btn ghost" data-act="newDossier">Créer un dossier</button><button class="btn ghost" data-act="import">Importer une sauvegarde</button></div>
        </div>`);
    };
    st.homeList = list;
    list();
  }

  /* ================= Recherche ================= */
  const fold = (t) => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function dossierFields(d) {
    return [
      ['Référence', d.ref], ['Client', d.client], ['Adresse', [d.adresse, d.cp, d.ville].filter(has).join(' ')], ['Mission', d.typeMission], ['Objet', d.objet],
      ['Téléphone', d.tel], ['Courriel', d.mail], ['Partie adverse', d.partieAdverse], ['Notes', d.notesSuivi]
    ].concat((d.intervenants || []).map((x) => ['Intervenant', [x.nom, x.qualite, x.societe, x.represente, x.mail, x.tel].filter(has).join(', ')]));
  }
  function matchDossier(d, q) {
    const words = q.split(/\s+/).filter(Boolean);
    const hay = fold(dossierFields(d).map((f) => f[1]).join(' '));
    return words.every((w) => hay.includes(w));
  }
  function hitOf(d, q) {
    const w = q.split(/\s+/).filter(Boolean);
    const f = dossierFields(d).find(([k, v]) => k !== 'Référence' && k !== 'Client' && has(v) && w.some((x) => fold(v).includes(x)));
    return f ? `${f[0]} : ${f[1]}` : '';
  }
  function mark(text, q) {
    let out = esc(text);
    q.split(/\s+/).filter((x) => x.length > 1).forEach((w) => {
      const t = fold(text); const i = t.indexOf(w);
      if (i >= 0) { const raw = String(text).slice(i, i + w.length); out = out.replace(esc(raw), `<mark>${esc(raw)}</mark>`); }
    });
    return out;
  }
  function renderResults() {
    const box = $('#gresults'); const q = st.q;
    if (!q) { box.hidden = true; return; }
    const ds = liveDossiers().filter((d) => matchDossier(d, q));
    const top = ds.slice(0, 8);
    box.innerHTML = (top.length ? `<div class="glbl">${ds.length} dossier${ds.length > 1 ? 's' : ''}</div>` + top.map((d, i) => {
      const hit = hitOf(d, q);
      return `<a href="#d/${d.id}" class="${i === st.qSel ? 'sel' : ''}" data-gr="${i}"><span class="ref">${mark(d.ref || 'Sans référence', q)}</span><b>${mark(d.client || '', q)}</b><span class="muted small">${mark([d.adresse, d.ville].filter(has).join(', '), q)}</span>${hit ? `<span class="hit">${mark(hit, q)}</span>` : ''}</a>`;
    }).join('') + (ds.length > top.length ? `<a href="#" data-act="allResults"><b>Voir les ${ds.length} dossiers</b></a>` : '') : '<div class="gnone">Aucun dossier ne correspond.</div>');
    box.hidden = false;
    st.qTop = top;
  }
  function onSearch(v) {
    st.qRaw = v.trim(); st.q = fold(st.qRaw); st.qSel = -1;
    const onHome = !location.hash || location.hash === '#';
    if (onHome && st.homeList) {
      st.homeList(); $('#gresults').hidden = true;
      st.qTop = st.q ? liveDossiers().filter((d) => matchDossier(d, st.q)).slice(0, 8) : [];
    } else renderResults();
  }
  function wireSearch() {
    const inp = $('#gsearch');
    inp.addEventListener('input', () => onSearch(inp.value));
    inp.addEventListener('focus', () => { if (st.q && location.hash && location.hash !== '#') renderResults(); });
    inp.addEventListener('keydown', (e) => {
      const n = (st.qTop || []).length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); st.qSel = (st.qSel + 1) % n; renderResults(); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); st.qSel = (st.qSel - 1 + n) % n; renderResults(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (!st.q) return;
        const list = liveDossiers().filter((d) => matchDossier(d, st.q));
        const d = st.qSel >= 0 ? (st.qTop || [])[st.qSel] : (list.length === 1 ? list[0] : null);
        closeResults(); inp.blur();
        go(d ? '#d/' + d.id : '#');
      } else if (e.key === 'Escape') { inp.value = ''; onSearch(''); closeResults(); }
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('#gresults a[data-gr]')) { closeResults(); return; }
      if (!e.target.closest('.gsearch')) closeResults();
    });
  }
  function closeResults() { const b = $('#gresults'); if (b) b.hidden = true; }

  function suggestRef(client) {
    const d = new Date();
    const nom = String(client || '').trim().split(/\s+/).filter((w) => !/^(m\.?|mme|mr|monsieur|madame|sci|sarl|sas|eurl|sa)$/i.test(w)).pop() || 'NOM';
    return `RG-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9-]/g, '')}`;
  }
  async function newDossier() {
    const d = { id: 'd' + uid(), ref: '', client: '', qualiteClient: 'Particulier', createdAt: Date.now(), updatedAt: Date.now() };
    await saveDossier(d);
    go('#d/' + d.id);
  }

  /* ================= Dossier ================= */
  const DOSSIER_FIELDS = [
    { k: 'client', l: 'Client', t: 'text' },
    { k: 'qualiteClient', l: 'Qualité du Client', t: 'select', o: S.QUALITES_CLIENT },
    { k: 'ref', l: 'Référence du dossier', t: 'text', mono: true },
    { k: 'tel', l: 'Téléphone du Client', t: 'tel' },
    { k: 'mail', l: 'Courriel du Client', t: 'email' },
    { k: 'typeMission', l: 'Type de mission', t: 'select', o: S.MISSIONS },
    { k: 'adresse', l: 'Adresse du bien', t: 'text', w: 2 },
    { k: 'cp', l: 'Code postal', t: 'text', im: 'numeric' },
    { k: 'ville', l: 'Commune', t: 'text' },
    { k: 'partieAdverse', l: 'Partie adverse ou entreprise en cause', t: 'text', w: 2 },
    { k: 'objet', l: 'Objet de la mission', t: 'textarea', w: 3 },
    { k: 'pieces', l: 'Pièces en ma possession (non imprimé)', t: 'textarea', w: 3 },
    { k: 'notes', l: 'Notes internes (non imprimées)', t: 'textarea', w: 3 }
  ];
  function synthFrom(d) {
    const cut = (t, n) => { t = String(t || '').trim(); if (t.length <= n) return t; const c = t.slice(0, n); const k = Math.max(c.lastIndexOf('. '), c.lastIndexOf(' ; ')); return (k > n * 0.5 ? c.slice(0, k + 1) : c) + ' (suite dans le suivi Excel)'; };
    return [
      has(d.typeMission) ? `Mission : ${d.typeMission}.` : '',
      has(d.lettre) ? `Lettre de mission : ${d.lettre}${has(d.statutMission) && d.statutMission !== '—' ? ', ' + d.statutMission.toLowerCase() : ''}.` : '',
      has(d.dateVisite) ? `Visite : ${d.dateVisite}.` : '',
      has(d.prochaineAction) ? `Prochaine action : ${cut(d.prochaineAction, 220)}` : '',
      has(d.notesSuivi) ? `Notes : ${cut(d.notesSuivi, 450)}` : ''
    ].filter(Boolean).join('\n');
  }
  function renderDossier(main) {
    const d = st.dos;
    crumbs([['Dossiers', '#'], [d.ref || 'Nouveau dossier', '#d/' + d.id]]);
    const pvs = pvsOf(d.id);
    const trash = pvsOf(d.id, true);
    const inter = d.intervenants || [];
    const coord = (label, v, copy) => has(v) ? `<div class="coord"><span class="lbl2">${label}</span><span class="cv">${esc(v)}</span>${copy ? `<button type="button" class="btn small ghost" data-act="copy" data-val="${esc(v)}">Copier</button>` : ''}</div>` : '';
    main.innerHTML = `
      <section class="dossier">
        <div class="page-head">
          <div><p class="eyebrow">Dossier</p><h1 class="ref-big">${esc(d.ref || 'Nouveau dossier')}</h1></div>
          <div class="row gap wrap">
            <button class="btn ghost" data-act="exportDossier">Sauvegarder vers OneDrive</button>
            <button class="btn ghost" data-act="deleteDossier">Mettre à la corbeille</button>
          </div>
        </div>
        <div class="panel fiche">
          <div class="fiche-client">
            <h2 class="lbl">Client</h2>
            <p class="cname">${esc(d.client || 'Client à renseigner')}${has(d.qualiteClient) ? ` <span class="muted small">${esc(d.qualiteClient)}</span>` : ''}</p>
            ${coord('Téléphone', d.tel, true)}${coord('Courriel', d.mail, true)}
            ${coord('Bien', [d.adresse, [d.cp, d.ville].filter(has).join(' ')].filter(has).join(', '), true)}
            ${coord('Mission', d.typeMission)}
            ${!has(d.tel) && !has(d.mail) && !has(d.adresse) ? '<p class="muted small">Coordonnées à compléter dans « Modifier la fiche du dossier ».</p>' : ''}
          </div>
          <div class="fiche-synth">
            <div class="fld w3"><label for="f_do_synthese">Synthèse du dossier</label>
              <textarea id="f_do_synthese" class="inp" data-b="do:synthese" rows="5" placeholder="Quelques lignes : désordre, demande du Client, point d'attention pour la visite">${esc(d.synthese || '')}</textarea></div>
            ${has(d.notesSuivi) || has(d.prochaineAction) || has(d.typeMission) ? `<button type="button" class="btn small ghost" data-act="synthExcel">${has(d.synthese) ? 'Remplacer par le résumé du suivi Excel' : 'Remplir à partir du suivi Excel'}</button>` : ''}
          </div>
        </div>
        <div class="split mt">
          <div class="panel">
            <h2 class="lbl">Nouveau PV</h2>
            <div class="types">
              ${Object.entries(S.TYPES).map(([k, T]) => `<button class="type" data-act="newPV" data-type="${k}"><b>${esc(T.label)}</b><span>${esc(typeHint(k))}</span></button>`).join('')}
            </div>
            <h2 class="lbl mt">PV du dossier</h2>
            <div class="pvlist">${pvs.length ? pvs.map(pvRow).join('') : '<p class="muted">Aucun PV dans ce dossier.</p>'}</div>
            ${trash.length ? `<details class="mt"><summary class="muted">Corbeille du dossier (${trash.length})</summary><div class="pvlist">${trash.map((p) => `<div class="pvrow"><span><b>${esc(S.TYPES[p.type].label)}</b> v${p.version}</span><button class="btn small ghost" data-act="restorePV" data-id="${p.id}">Restaurer</button></div>`).join('')}</div></details>` : ''}
          </div>
          <div class="panel" id="intervenants">
            <h2 class="lbl">Intervenants (${inter.length})</h2>
            ${inter.length ? `<div class="ilist">${inter.map((it) => `<div class="irow"><b>${esc(it.nom || 'Sans nom')}</b><span class="muted small">${esc([it.qualite, it.societe].filter(has).join(', '))}</span><span class="small">${esc([it.tel, it.mail].filter(has).join(' • '))}</span>${it.convoque === 'Non' ? '<span class="pill muted-pill">Non convoqué</span>' : ''}</div>`).join('')}</div>` : '<p class="muted small">Aucun intervenant. Ils sont repris du suivi Excel, ou ajoutés ici, puis proposés dans chaque PV.</p>'}
            <details class="mt" ${st.openInter ? 'open' : ''} id="interEdit"><summary class="btn small ghost">Modifier les intervenants</summary>
              <div class="mt">${inter.map((it, i) => `
                <div class="item">
                  <div class="item-head"><b>${esc(it.nom || 'Intervenant ' + (i + 1))}</b>${itemTools('do:intervenants', i, inter.length)}</div>
                  <div class="grid">${S.INTERVENANT_FIELDS.map((f) => fieldHTML(f, `do:intervenants.${i}.${f.k}`, it[f.k], false)).join('')}</div>
                </div>`).join('')}
              <button class="btn add" data-act="addInter">Ajouter un intervenant</button></div>
            </details>
          </div>
        </div>
        <details class="panel mt"><summary class="btn small ghost">Modifier la fiche du dossier</summary>
          <div class="grid mt">${DOSSIER_FIELDS.map((f) => fieldHTML(f, 'do:' + f.k, d[f.k], false)).join('')}</div>
          <button class="btn small ghost mt" data-act="suggestRef">Proposer la référence à partir du nom du Client</button>
          ${has(d.notesSuivi) || has(d.prochaineAction) || has(d.etat) ? `<div class="suivi"><span class="lbl">Depuis le suivi Excel</span>${d.etat ? `<p><b>Onglet :</b> ${esc(d.etat)}</p>` : ''}${has(d.prochaineAction) ? `<p><b>Prochaine action :</b> ${esc(d.prochaineAction)}</p>` : ''}${has(d.notesSuivi) ? `<p><b>Notes :</b> ${esc(d.notesSuivi)}</p>` : ''}</div>` : ''}
        </details>
      </section>`;
    $$('textarea', main).forEach(autosize);
    const ie = $('#interEdit', main); if (ie) ie.addEventListener('toggle', () => { st.openInter = ie.open; });
  }
  function typeHint(k) {
    return {
      contradictoire: 'Parties, dires, constatations, accords, investigations, signatures',
      constat: 'Désordres qualifiés, mesures, jauges SAUGNAC G1, environnement',
      reception: 'Réserves numérotées, essais, compteurs et clés, décision',
      presence: 'Émargement à l’arrivée, accord sur la prise de notes'
    }[k];
  }
  function pvRow(p) {
    const last = (p.pdfs || [])[(p.pdfs || []).length - 1];
    const env = last && last.envois && last.envois.length ? Math.min(...last.envois.map((e) => e.at)) : null;
    const n = delaiObs(p);
    const extra = p.statut === 'clos' ? (env ? (n ? `, observations jusqu'au ${P.fmtShort(isoDay(addDays(env, n)))}` : ', envoyé') : ', non envoyé') : '';
    return `<a class="pvrow" href="#pv/${p.id}">
      <span><b>${esc(S.TYPES[p.type].label)}</b>${p.type === 'reception' && p.f.nature ? ` <span class="muted">(${esc(p.f.nature)})</span>` : ''}<br><span class="muted">v${p.version} du ${esc(P.fmtShort(p.f.date))}${esc(extra)}</span></span>
      <span class="pill ${p.statut === 'clos' ? 'done' : 'draft'}">${p.statut === 'clos' ? 'Clôturé' : 'En cours'}</span>
    </a>`;
  }

  function newPV(d, type) {
    const T = S.TYPES[type];
    const f = {};
    T.sections.forEach((s) => { if (s.kind === 'fields') s.fields.forEach((x) => { if (x.d != null) f[x.k] = x.d; }); });
    Object.assign(f, { date: today(), heureDebut: nowHM(), adresse: d.adresse || '', ville: d.ville || '', faitA: d.ville || st.config.villeDefaut || 'Le Mans' });
    if (d.objet) f.objet = d.objet;
    const prev = pvsOf(d.id)[0];
    const expert = { id: uid(), nom: st.config.expertNom || EXPERT.nom, qualite: S.L.qualites[1], societe: EXPERT.societe, tel: EXPERT.tel, mail: EXPERT.mail, statut: 'Présent', arrivee: nowHM() };
    const conv = (d.intervenants || []).filter((x) => x.convoque !== 'Non' && has(x.nom));
    let participants;
    if (conv.length) {
      participants = [expert].concat(conv.map(fromInter));
      if (has(d.client) && !conv.some((x) => sameName(x.nom, d.client))) participants.splice(1, 0, { id: uid(), nom: d.client, qualite: 'Client', tel: d.tel || '', mail: d.mail || '', statut: '' });
    } else if (prev && prev.participants && prev.participants.length) {
      participants = prev.participants.map((p) => ({ id: uid(), nom: p.nom, qualite: p.qualite, represente: p.represente, societe: p.societe, tel: p.tel, mail: p.mail, statut: 'Présent' }));
    } else {
      participants = [expert, { id: uid(), nom: d.client || '', qualite: 'Client', tel: d.tel || '', mail: d.mail || '', statut: 'Présent' }];
    }
    return { id: 'p' + uid(), dossierId: d.id, type, version: 1, statut: 'brouillon', createdAt: Date.now(), updatedAt: Date.now(), f, lists: {}, participants, photos: [], essais: {}, enabled: {}, pdfs: [] };
  }

  const sameName = (a, b) => window.PVEXCEL.norm(a) === window.PVEXCEL.norm(b);
  function fromInter(x) {
    const q = S.L.qualites.find((o) => window.PVEXCEL.norm(o) === window.PVEXCEL.norm(x.qualite)) || x.qualite || '';
    return { id: uid(), interId: x.id, nom: x.nom, qualite: q, represente: x.represente || '', societe: x.societe || '', tel: x.tel || '', mail: x.mail || '', statut: '' };
  }

  /* ================= Champs ================= */
  function fieldHTML(f, bind, v, ro, extra = {}) {
    const id = 'f_' + bind.replace(/[^\w]/g, '_');
    const dis = ro ? ' disabled' : '';
    const cls = `fld w${f.w || 1}${f.mono ? ' mono' : ''}`;
    const lab = `<label for="${id}">${esc(f.l)}</label>`;
    const im = f.im ? ` inputmode="${f.im}"` : '';
    let inp;
    switch (f.t) {
      case 'textarea':
        inp = `<textarea id="${id}" class="inp" data-b="${bind}" rows="${f.main ? 3 : 2}"${dis}>${esc(v)}</textarea>`;
        break;
      case 'select':
        inp = `<select id="${id}" class="inp" data-b="${bind}"${dis}><option value="">Choisir</option>${f.o.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}${v && !f.o.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>`;
        break;
      case 'checks': {
        const arr = Array.isArray(v) ? v : [];
        return `<fieldset class="${cls}"><legend>${esc(f.l)}</legend><div class="chips">${f.o.map((o) => `<button type="button" class="chip${arr.includes(o) ? ' on' : ''}" data-act="toggleCheck" data-path="${bind}" data-val="${esc(o)}" aria-pressed="${arr.includes(o)}"${dis}>${esc(o)}</button>`).join('')}</div></fieldset>`;
      }
      case 'participant': {
        const parts = (st.pv && st.pv.participants) || [];
        inp = `<select id="${id}" class="inp" data-b="${bind}" data-ptype="1"${dis}>${participantOptions(parts, v)}</select>`;
        break;
      }
      case 'photorefs': {
        const arr = Array.isArray(v) ? v : [];
        const ph = (st.pv && st.pv.photos) || [];
        const labels = P.photoLabels(st.pv || {});
        return `<fieldset class="${cls}"><legend>${esc(f.l)}</legend><div class="chips">${ph.length ? ph.map((p) => `<button type="button" class="chip ref-chip${arr.includes(p.id) ? ' on' : ''}" data-act="toggleRef" data-path="${bind}" data-id="${p.id}" aria-pressed="${arr.includes(p.id)}"${dis}>${esc(labels[p.id])}</button>`).join('') : '<span class="muted small">Ajoutez des photos dans le bloc Photos et croquis pour les rattacher ici.</span>'}</div></fieldset>`;
      }
      case 'time':
        inp = `<div class="with-btn"><input id="${id}" class="inp" type="time" data-b="${bind}" value="${esc(v)}"${dis}>${ro ? '' : `<button type="button" class="btn small ghost" data-act="now" data-path="${bind}">Maintenant</button>`}</div>`;
        break;
      default: {
        const type = ['date', 'tel', 'email'].includes(f.t) ? f.t : 'text';
        inp = `<input id="${id}" class="inp" type="${type}" data-b="${bind}" value="${esc(v)}"${im}${dis}${type === 'text' ? ' autocapitalize="sentences"' : ''}>`;
      }
    }
    return `<div class="${cls}">${lab}${inp}</div>`;
  }
  function participantOptions(parts, v) {
    return `<option value="">Choisir</option>` + parts.map((p) => `<option value="${p.id}"${p.id === v ? ' selected' : ''}>${esc(p.nom || 'Participant sans nom')}${p.qualite ? ' (' + esc(p.qualite) + ')' : ''}</option>`).join('');
  }

  /* ================= Éditeur de PV ================= */
  function renderPV(main) {
    const pv = st.pv, T = S.TYPES[pv.type], d = dossierOf(pv), ro = pv.statut === 'clos';
    crumbs([['Dossiers', '#'], [d.ref || 'Dossier', '#d/' + d.id], [`${T.short} v${pv.version}`, '#pv/' + pv.id]]);
    const optional = T.sections.filter((s) => s.optional);
    const on = T.sections.filter((s) => P.isOn(pv, s));
    main.innerHTML = `
      <section class="editor">
        <div class="ed-head">
          <div>
            <p class="eyebrow"><span class="ref">${esc(d.ref || '')}</span></p>
            <h1>${esc(T.label)} <span class="ver">v${pv.version}</span></h1>
            <p class="muted">${esc(d.client || '')}${d.ville ? ', ' + esc(d.ville) : ''}</p>
          </div>
          <div class="ed-actions">
            <span class="pill ${ro ? 'done' : 'draft'}">${ro ? 'Clôturé le ' + esc(P.fmtStamp(pv.closedAt)) : 'En cours'}</span>
            <span id="save" class="save ok">${ro ? 'Lecture seule' : 'Enregistré sur la tablette'}</span>
            <div class="row gap wrap">
              ${ro ? `<button class="btn primary" data-act="sendPDF">Envoyer le PDF</button><button class="btn ghost" data-act="newVersion">Nouvelle version</button>`
                : `<button class="btn ghost" data-act="previewPDF">Aperçu PDF</button><button class="btn primary" data-act="closePV">Clôturer et générer le PDF</button>`}
              <button class="btn ghost" data-act="pvMenu" aria-label="Autres actions">Plus</button>
            </div>
          </div>
        </div>
        ${optional.length && !ro ? `<div class="opt-bar"><span class="lbl">Blocs optionnels</span><div class="chips">${optional.map((s) => `<button type="button" class="chip switch${P.isOn(pv, s) ? ' on' : ''}" data-act="toggleSection" data-key="${s.key}" aria-pressed="${P.isOn(pv, s)}">${esc(s.title)}</button>`).join('')}</div></div>` : ''}
        <div class="ed-body">
          <nav class="secnav" aria-label="Sections">${on.map((s, i) => `<a href="#" data-act="jump" data-key="${s.key}"><span class="n">${i + 1}</span>${esc(s.title)}${countBadge(pv, s)}</a>`).join('')}</nav>
          <div class="sections">${on.map((s, i) => sectionHTML(pv, s, i + 1, ro)).join('')}
            ${pv.pdfs && pv.pdfs.length ? `<section class="sec"><h2 class="sec-title"><span class="n">PDF</span>Archives de ce PV</h2><div class="pvlist">${pv.pdfs.map((x, i) => archiveRow(pv, x, i)).join('')}</div></section>` : ''}
          </div>
        </div>
      </section>`;
    $$('textarea', main).forEach(autosize);
    hydratePhotos(main);
  }
  function archiveRow(pv, x, i) {
    const n = delaiObs(pv);
    const env = x.envois || [];
    const first = env.length ? Math.min(...env.map((e) => e.at)) : null;
    const fin = first && n ? addDays(first, n) : null;
    const echu = fin && fin.getTime() < Date.now();
    return `<div class="archive">
      <div class="pvrow"><span><b>${esc(x.filename)}</b><br><span class="muted">Clôturé et généré le ${esc(P.fmtStamp(x.at))}</span></span><button class="btn small ghost" data-act="sharePdfArchive" data-i="${i}">Envoyer ou partager</button></div>
      ${x.fileHash ? `<p class="small muted">Empreinte du fichier : <span class="ref" title="${esc(x.fileHash)}">${esc(shortHash(x.fileHash))}</span>… &nbsp; Empreinte du contenu, imprimée sur le PV : <span class="ref">${esc(shortHash(x.contentHash))}</span>…</p>` : ''}
      ${env.length ? `<ul class="envois">${env.map((e) => `<li>Envoyé le ${esc(P.fmtShort(isoDay(new Date(e.at))))} (${esc(e.mode)})${e.dest && e.dest.length ? ' à ' + esc(e.dest.join(', ')) : ''}</li>`).join('')}</ul>` : '<p class="small warn-t">Aucun envoi inscrit.</p>'}
      ${fin ? `<p class="small"><span class="pill ${echu ? 'done' : 'draft'}">${echu ? 'Délai échu' : 'Délai en cours'}</span> Observations jusqu'au ${esc(P.fmtShort(isoDay(fin)))} (${n} jours après le premier envoi)</p>` : ''}
    </div>`;
  }
  function countBadge(pv, s) {
    let n = 0;
    if (s.kind === 'list') n = ((pv.lists || {})[s.key] || []).length;
    if (s.kind === 'participants') n = (pv.participants || []).length;
    if (s.kind === 'photos') n = (pv.photos || []).length;
    if (s.kind === 'signatures') { const sg = (pv.participants || []).filter((p) => ['Présent', 'Représenté'].includes(p.statut)); const done = sg.filter((p) => p.sigStatut).length; return `<span class="cnt${done < sg.length ? ' warn' : ''}">${done}/${sg.length}</span>`; }
    return n ? `<span class="cnt">${n}</span>` : '';
  }

  function sectionHTML(pv, s, n, ro) {
    const head = `<h2 class="sec-title"><span class="n">${n}</span>${esc(s.title)}</h2>`;
    let body = '';
    if (s.kind === 'fields') {
      body = `<div class="grid">${s.fields.map((f) => fieldHTML(f, 'pv:f.' + f.k, pv.f[f.k], ro)).join('')}</div>`;
      if (s.consent) body += `<p class="hint">Chaque participant indique son accord dans le bloc Participants (colonne Accord prise de notes).</p>`;
    } else if (s.kind === 'participants') {
      const consent = pv.type === 'presence' && P.isOn(pv, S.TYPES.presence.sections.find((x) => x.key === 'consentement'));
      const fields = S.PARTICIPANT_FIELDS.concat(consent ? [{ k: 'accordNotes', l: 'Accord prise de notes', t: 'select', o: ['Oui', 'Non'] }] : []);
      body = (pv.participants || []).map((p, i) => `
        <div class="item">
          <div class="item-head"><b>${esc(p.nom || 'Participant ' + (i + 1))}</b>${ro ? '' : itemTools('participants', i, pv.participants.length)}</div>
          <div class="grid">${fields.map((f) => fieldHTML(f, `pv:participants.${i}.${f.k}`, p[f.k], ro)).join('')}</div>
        </div>`).join('') + (ro ? '' : `<div class="row gap wrap"><button class="btn add" data-act="addItem" data-key="participants">Ajouter un participant</button>${(dossierOf(pv).intervenants || []).length ? '<button class="btn ghost" data-act="pickInter">Ajouter depuis les intervenants du dossier</button>' : ''}${prevParticipantsBtn(pv)}</div>`);
    } else if (s.kind === 'list') {
      const items = (pv.lists || {})[s.key] || [];
      body = items.map((it, i) => `
        <div class="item">
          <div class="item-head"><b>${esc(s.item)} ${i + 1}</b>${ro ? '' : itemTools('lists.' + s.key, i, items.length, true)}</div>
          <div class="grid">${s.fields.map((f) => fieldHTML(f, `pv:lists.${s.key}.${i}.${f.k}`, it[f.k], ro)).join('')}</div>
        </div>`).join('') + (items.length ? '' : `<p class="muted empty-sec">${s.emptyText ? esc(s.emptyText) + ' (mention imprimée si le bloc reste vide)' : 'Aucun élément. Un bloc vide n\'apparaît pas dans le PDF.'}</p>`) +
        (ro ? '' : `<button class="btn add" data-act="addItem" data-key="lists.${s.key}">Ajouter : ${esc(s.item.toLowerCase())}</button>`);
    } else if (s.kind === 'checklist') {
      body = `<div class="checklist">${s.items.map((label) => {
        const e = (pv.essais || {})[label] || {};
        const stt = e.statut || 'Non vérifié';
        return `<div class="ck ${stt === 'Réserve' ? 'res' : stt === 'Conforme' ? 'okk' : ''}">
          <span class="ck-l">${esc(label)}</span>
          <div class="seg" role="group" aria-label="${esc(label)}">${S.L.essai.map((o) => `<button type="button" class="${o === stt ? 'on' : ''}" data-act="essai" data-label="${esc(label)}" data-val="${esc(o)}"${ro ? ' disabled' : ''}>${esc(o)}</button>`).join('')}</div>
          <input class="inp small" placeholder="Observation" data-b="pv:essais.${label}.obs" value="${esc(e.obs)}" aria-label="Observation ${esc(label)}"${ro ? ' disabled' : ''}>
        </div>`;
      }).join('')}</div>`;
    } else if (s.kind === 'photos') {
      const labels = P.photoLabels(pv);
      body = (ro ? '' : `<div class="row gap wrap photo-btns">
          <label class="btn primary file">Prendre une photo<input type="file" accept="image/*" capture="environment" data-photo="camera" hidden></label>
          <label class="btn ghost file">Importer des photos<input type="file" accept="image/*" multiple data-photo="import" hidden></label>
          <button class="btn ghost" data-act="newSketch">Nouveau croquis</button>
        </div>`) +
        `<div class="photos">${(pv.photos || []).map((p, i) => `
          <figure class="photo">
            <div class="thumb" data-thumb="${esc(p.ann || p.blob || '')}"${ro ? '' : ` data-act="annotate" data-i="${i}" role="button" tabindex="0" aria-label="Dessiner sur la photo"`}><span class="tag">${esc(labels[p.id])}</span></div>
            <figcaption>
              <div class="pmeta muted small">${p.takenAt ? esc(P.fmtStamp(p.takenAt)) : ''}${p.lat != null ? ` • GPS ${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}` : (p.kind === 'photo' && st.config.gps ? ' • sans position GPS' : '')}</div>
              ${fieldHTML({ k: 'zone', l: 'Zone', t: 'text' }, `pv:photos.${i}.zone`, p.zone, ro)}
              ${fieldHTML({ k: 'legende', l: 'Légende (une ligne)', t: 'text' }, `pv:photos.${i}.legende`, p.legende, ro)}
              ${ro ? '' : `<div class="row gap wrap"><button class="btn small primary" data-act="annotate" data-i="${i}">${p.kind === 'croquis' ? 'Modifier le croquis' : 'Dessiner sur la photo'}</button>${itemTools('photos', i, pv.photos.length)}</div>`}
            </figcaption>
          </figure>`).join('')}</div>` + ((pv.photos || []).length ? '' : '<p class="muted empty-sec">Aucune photo. Les photos et croquis sont numérotés dans l\'ordre et peuvent être rattachés à chaque constatation.</p>');
    } else if (s.kind === 'signatures') {
      const signers = (pv.participants || []).map((p, i) => ({ p, i })).filter(({ p }) => ['Présent', 'Représenté'].includes(p.statut));
      body = signers.length ? `<div class="sigs">${signers.map(({ p, i }) => {
        const isExp = (p.qualite || '').startsWith('Expert du Client');
        return `<div class="sig">
          <div><b>${esc(p.nom || 'Participant sans nom')}</b><br><span class="muted small">${esc(p.qualite || '')}${p.represente ? ', pour ' + esc(p.represente) : ''}</span></div>
          <div class="sig-box" data-thumb="${esc(p.sig || '')}" data-sigbox="1">${p.sig ? '' : `<span class="muted small">${esc(p.sigStatut || 'Non signé')}</span>`}</div>
          ${ro ? `<span class="muted small">${p.sigAt ? 'Signé le ' + esc(P.fmtStamp(p.sigAt)) : esc(p.sigStatut || '')}${p.sigMotif ? ' : ' + esc(p.sigMotif) : ''}</span>` : `<div class="row gap wrap">
            <button class="btn small primary" data-act="sign" data-i="${i}">${p.sig ? 'Signer à nouveau' : 'Faire signer'}</button>
            ${isExp && st.config.signature ? `<button class="btn small ghost" data-act="signExpert" data-i="${i}">Apposer ma signature</button>` : ''}
            <button class="btn small ghost" data-act="refuse" data-i="${i}">Refus de signer</button>
            <button class="btn small ghost" data-act="defer" data-i="${i}">Signature différée</button>
          </div>`}
        </div>`;
      }).join('')}</div>` : '<p class="muted">Aucun participant présent. Renseignez la présence dans le bloc Participants.</p>';
      body += `<p class="hint">Seules les personnes présentes ou représentées figurent ici. Le PDF reprend la mention de clôture puis « Fait à ${esc(pv.f.faitA || '')}, le ${esc(P.fmtLong(pv.f.date))} ».</p>`;
    }
    return `<section class="sec" id="sec-${s.key}">${head}${body}</section>`;
  }
  function itemTools(path, i, n, dup) {
    return `<span class="tools">
      <button type="button" class="ic" data-act="move" data-path="${path}" data-i="${i}" data-dir="-1" aria-label="Monter"${i === 0 ? ' disabled' : ''}>↑</button>
      <button type="button" class="ic" data-act="move" data-path="${path}" data-i="${i}" data-dir="1" aria-label="Descendre"${i === n - 1 ? ' disabled' : ''}>↓</button>
      ${dup ? `<button type="button" class="ic" data-act="dupItem" data-path="${path}" data-i="${i}" aria-label="Dupliquer">⧉</button>` : ''}
      <button type="button" class="ic del" data-act="delItem" data-path="${path}" data-i="${i}" aria-label="Supprimer">✕</button>
    </span>`;
  }
  function prevParticipantsBtn(pv) {
    const prev = pvsOf(pv.dossierId).find((p) => p.id !== pv.id && (p.participants || []).length);
    return prev ? `<button class="btn ghost" data-act="importParticipants" data-from="${prev.id}">Reprendre les participants du PV ${esc(S.TYPES[prev.type].short)} v${prev.version}</button>` : '';
  }
  async function hydratePhotos(root) {
    for (const el of $$('[data-thumb]', root)) {
      const id = el.dataset.thumb;
      if (!id) continue;
      const u = await blobURL(id);
      if (!u) continue;
      if (el.dataset.sigbox) el.innerHTML = `<img src="${u}" alt="Signature">`;
      else { const img = document.createElement('img'); img.src = u; img.alt = ''; img.loading = 'lazy'; el.prepend(img); }
    }
  }
  function rerenderPV() {
    const y = window.scrollY;
    renderPV($('#main'));
    window.scrollTo(0, y);
  }

  /* ================= Photos, annotation, croquis ================= */
  let gpsPromise = null;
  function startGPS() {
    if (!st.config.gps || !navigator.geolocation) { gpsPromise = Promise.resolve(null); return; }
    gpsPromise = new Promise((res) => {
      navigator.geolocation.getCurrentPosition((p) => res(p.coords), () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  }
  async function compress(file, max = 1800, q = 0.84) {
    const bm = await createImageBitmap(file);
    const r = Math.min(1, max / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bm.width * r); c.height = Math.round(bm.height * r);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    bm.close && bm.close();
    return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  }
  async function addPhotos(files, camera) {
    if (!files.length) return;
    toast(files.length > 1 ? `Ajout de ${files.length} photos` : 'Ajout de la photo');
    const coords = camera ? await (gpsPromise || Promise.resolve(null)) : null;
    for (const file of files) {
      try {
        const blob = await compress(file);
        const id = await saveBlob(blob);
        st.pv.photos.push({ id: uid(), kind: 'photo', blob: id, legende: '', zone: '', takenAt: camera ? Date.now() : (file.lastModified || Date.now()), lat: coords ? coords.latitude : null, lon: coords ? coords.longitude : null, acc: coords ? Math.round(coords.accuracy) : null });
      } catch (e) {
        toast(`Photo « ${file.name} » illisible, elle n'a pas été ajoutée.`, 'bad');
      }
    }
    await savePV();
    rerenderPV();
    const last = $$('.photo').pop(); if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const COLORS = [['#E53935', 'Rouge'], ['#FFD400', 'Jaune'], ['#1A365D', 'Bleu marine'], ['#111111', 'Noir'], ['#FFFFFF', 'Blanc']];
  const TOOLS = [['free', 'Crayon'], ['line', 'Trait droit'], ['arrow', 'Flèche'], ['circle', 'Cercle'], ['rect', 'Cadre'], ['cote', 'Cote'], ['text', 'Texte']];
  async function openDrawing(photo) {
    const isSketch = photo.kind === 'croquis';
    let base = null, W = 1600, H = 1131;
    if (!isSketch) {
      const r = await DB.get('blobs', photo.blob);
      if (!r) return toast("Image introuvable sur la tablette.", 'bad');
      base = await createImageBitmap(r.blob); W = base.width; H = base.height;
    }
    const shapes = clone(photo.shapes || []);
    let tool = 'free', color = isSketch ? '#1A365D' : '#E53935', size = 2, cur = null;
    const ov = document.createElement('div');
    ov.className = 'draw';
    ov.innerHTML = `
      <div class="draw-bar">
        <div class="seg tools">${TOOLS.map(([k, l]) => `<button type="button" data-tool="${k}" class="${k === tool ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="colors">${COLORS.map(([c, l]) => `<button type="button" data-color="${c}" class="${c === color ? 'on' : ''}" style="--c:${c}" aria-label="${l}"></button>`).join('')}</div>
        <div class="seg sizes">${[['1', 'Fin'], ['2', 'Moyen'], ['3', 'Épais']].map(([k, l]) => `<button type="button" data-size="${k}" class="${+k === size ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="row gap"><button class="btn small ghost" data-d="undo">Annuler le dernier</button><button class="btn small ghost" data-d="clear">Tout effacer</button></div>
        <div class="row gap"><button class="btn small ghost" data-d="cancel">Fermer sans enregistrer</button><button class="btn small primary" data-d="save">Enregistrer</button></div>
      </div>
      <div class="draw-stage"><canvas></canvas></div>`;
    document.body.appendChild(ov);
    document.body.classList.add('noscroll');
    const cv = $('canvas', ov); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const unit = Math.max(W, H) / 400;
    const paint = () => {
      ctx.clearRect(0, 0, W, H);
      if (base) ctx.drawImage(base, 0, 0);
      else {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#E3E9F1'; ctx.lineWidth = 1;
        const g = W / 40;
        for (let x = g; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = g; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      }
      shapes.concat(cur ? [cur] : []).forEach(drawShape);
    };
    function drawShape(s) {
      const lw = unit * (s.size === 1 ? 0.7 : s.size === 3 ? 2 : 1.2);
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const halo = s.color !== '#111111' && s.color !== '#1A365D' && base;
      const stroke = (fn) => {
        if (halo) { ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = lw + unit * 0.8; fn(); ctx.stroke(); ctx.restore(); }
        fn(); ctx.stroke();
      };
      const [x1, y1, x2, y2] = [s.x1, s.y1, s.x2, s.y2];
      if (s.t === 'free') stroke(() => { ctx.beginPath(); s.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); });
      if (s.t === 'line') stroke(() => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); });
      if (s.t === 'rect') stroke(() => { ctx.beginPath(); ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); });
      if (s.t === 'circle') stroke(() => { ctx.beginPath(); ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2 || 1, Math.abs(y2 - y1) / 2 || 1, 0, 0, Math.PI * 2); });
      if (s.t === 'arrow' || s.t === 'cote') {
        const a = Math.atan2(y2 - y1, x2 - x1), hl = lw * 4.5;
        stroke(() => {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
          if (s.t === 'arrow') {
            ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(a - 0.45), y2 - hl * Math.sin(a - 0.45));
            ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(a + 0.45), y2 - hl * Math.sin(a + 0.45));
          } else {
            const p = a + Math.PI / 2, t = hl * 0.8;
            [[x1, y1], [x2, y2]].forEach(([x, y]) => { ctx.moveTo(x - t * Math.cos(p), y - t * Math.sin(p)); ctx.lineTo(x + t * Math.cos(p), y + t * Math.sin(p)); });
          }
        });
        if (s.t === 'cote' && s.label) label(s.label, (x1 + x2) / 2, (y1 + y2) / 2 - lw * 3, s.color, lw);
      }
      if (s.t === 'text') label(s.text, s.x1, s.y1, s.color, lw, true);
    }
    function label(txt, x, y, c, lw, left) {
      const fs = unit * (6 + lw / unit * 2);
      ctx.font = `700 ${fs}px "Source Sans 3", Arial, sans-serif`;
      ctx.textAlign = left ? 'left' : 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = fs / 5; ctx.strokeStyle = (c === '#FFFFFF' || c === '#FFD400') ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)';
      ctx.strokeText(txt, x, y); ctx.fillStyle = c; ctx.fillText(txt, x, y);
    }
    paint();
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const [x, y] = pt(e);
      cur = tool === 'free' ? { t: 'free', pts: [[x, y]], color, size } : { t: tool, x1: x, y1: y, x2: x, y2: y, color, size };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const [x, y] = pt(e);
      if (cur.t === 'free') cur.pts.push([x, y]); else { cur.x2 = x; cur.y2 = y; }
      paint();
    });
    const end = async () => {
      if (!cur) return;
      const s = cur; cur = null;
      if (s.t === 'text') {
        const t = await askText('Texte à placer', '', 'Le texte est placé à l\'endroit touché');
        if (t) { s.text = t; shapes.push(s); }
      } else if (s.t === 'free' ? s.pts.length > 1 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > unit * 2) {
        if (s.t === 'cote') { const t = await askText('Valeur de la cote', '', 'Exemple : 1,20 m ou 3 mm'); if (t) s.label = t; }
        shapes.push(s);
      }
      paint();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', () => { cur = null; paint(); });

    return new Promise((resolve) => {
      ov.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tool) { tool = b.dataset.tool; $$('[data-tool]', ov).forEach((x) => x.classList.toggle('on', x === b)); }
        if (b.dataset.color) { color = b.dataset.color; $$('[data-color]', ov).forEach((x) => x.classList.toggle('on', x === b)); }
        if (b.dataset.size) { size = +b.dataset.size; $$('[data-size]', ov).forEach((x) => x.classList.toggle('on', x === b)); }
        const d = b.dataset.d;
        if (d === 'undo') { shapes.pop(); paint(); }
        if (d === 'clear' && shapes.length && await confirmBox('Tout effacer ?', 'Les annotations de cette image seront retirées. La photo d\'origine est conservée.', 'Tout effacer', true)) { shapes.length = 0; paint(); }
        if (d === 'cancel') { ov.remove(); document.body.classList.remove('noscroll'); resolve(null); }
        if (d === 'save') {
          paint();
          const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
          ov.remove(); document.body.classList.remove('noscroll');
          resolve({ shapes, blob: shapes.length || isSketch ? blob : null });
        }
      });
    });
  }

  /* ================= Signatures ================= */
  async function signaturePad(title, sub) {
    return modal(`<h3>${esc(title)}</h3><p class="muted small">${esc(sub || '')}</p>
      <div class="pad"><canvas width="1200" height="420" aria-label="Zone de signature"></canvas><span class="pad-line"></span></div>
      <div class="mbtns"><button class="btn ghost" data-res="clear" type="button">Effacer</button><button class="btn ghost" data-res="no">Annuler</button><button class="btn primary" data-res="ok">Valider la signature</button></div>`,
    {
      wide: true, sticky: true,
      onOpen: (m) => {
        const cv = $('canvas', m), ctx = cv.getContext('2d');
        let drawing = false, last = null; cv.dataset.empty = '1';
        const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height, e.pressure || 0.5]; };
        cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pt(e); });
        cv.addEventListener('pointermove', (e) => {
          if (!drawing) return;
          const p = pt(e);
          ctx.strokeStyle = '#0F1E36'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.lineWidth = 3.2 + (e.pointerType === 'pen' ? p[2] * 3 : 1.8);
          ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
          last = p; cv.dataset.empty = '';
        });
        const stop = () => { drawing = false; };
        cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
        m.addEventListener('click', (e) => { if (e.target.closest('[data-res="clear"]')) { e.stopPropagation(); ctx.clearRect(0, 0, cv.width, cv.height); cv.dataset.empty = '1'; } }, true);
      },
      collect: (m) => { const cv = $('canvas', m); return cv.dataset.empty ? 'empty' : cv; }
    });
  }
  function trimCanvas(cv) {
    const ctx = cv.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0) return cv;
    const m = 16, o = document.createElement('canvas');
    o.width = x1 - x0 + 2 * m; o.height = y1 - y0 + 2 * m;
    o.getContext('2d').drawImage(cv, x0 - m, y0 - m, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }

  /* ================= PDF ================= */
  function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
  async function imgRec(id) {
    const r = id && await DB.get('blobs', id);
    if (!r) return null;
    let { w, h } = r;
    if (!w) { try { const bm = await createImageBitmap(r.blob); w = bm.width; h = bm.height; } catch (e) { return null; } }
    return { data: await blobToDataURL(r.blob), w, h, fmt: /png/i.test(r.type) ? 'PNG' : 'JPEG' };
  }
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function sha256(data) {
    const buf = data instanceof Blob ? await data.arrayBuffer() : new TextEncoder().encode(data);
    return hex(await crypto.subtle.digest('SHA-256', buf));
  }
  const shortHash = (h) => (h || '').toUpperCase().match(/.{1,4}/g).slice(0, 8).join(' ');
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v == null ? null : v);
  }
  async function contentHash(pv) {
    const blobHash = async (id) => { if (!id) return null; const r = await DB.get('blobs', id); return r ? sha256(r.blob) : 'introuvable'; };
    const photos = [];
    for (const p of pv.photos || []) photos.push({ id: p.id, kind: p.kind, legende: p.legende || '', zone: p.zone || '', takenAt: p.takenAt || null, lat: p.lat, lon: p.lon, image: await blobHash(p.ann || p.blob) });
    const participants = [];
    for (const p of pv.participants || []) {
      const c = Object.assign({}, p); delete c.sig; delete c.interId;
      c.signature = await blobHash(p.sig);
      participants.push(c);
    }
    const d = dossierOf(pv);
    return sha256(canon({ dossier: { ref: d.ref || '', client: d.client || '' }, type: pv.type, version: pv.version, closedAt: pv.closedAt, f: pv.f, lists: pv.lists, essais: pv.essais, enabled: pv.enabled, participants, photos }));
  }

  async function makePDF(pv, draft) {
    const imgs = {};
    if (st.config.logo) imgs.logo = await imgRec(st.config.logo);
    for (const p of pv.photos || []) { const r = await imgRec(p.ann || p.blob); if (r) imgs['ph:' + p.id] = r; }
    for (const p of pv.participants || []) { if (p.sig) { const r = await imgRec(p.sig); if (r) imgs['sig:' + p.id] = r; } }
    const stamp = draft ? null : { hash: pv.contentHash, closedAt: pv.closedAt };
    const doc = P.build({ jsPDF: window.jspdf.jsPDF, pv, dossier: dossierOf(pv), config: st.config, imgs, draft, stamp });
    const blob = doc.output('blob');
    return { blob, filename: P.fileName(pv, dossierOf(pv)).replace(/\.pdf$/, draft ? '_projet.pdf' : '.pdf') };
  }
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  async function shareFile(blob, filename, title, text) {
    const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
    download(blob, filename);
    toast(`Fichier enregistré dans Téléchargements : ${filename}`);
    return true;
  }
  function delaiObs(pv) { return pv.type === 'contradictoire' ? (+st.config.delaiObs || 15) : 0; }
  function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d; }
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function mailText(pv, file) {
    const d = dossierOf(pv);
    const T = S.TYPES[pv.type];
    const quoi = pv.type === 'presence' ? 'la feuille de présence' : 'le procès-verbal';
    const n = delaiObs(pv);
    const delai = n ? ` Vous pouvez m'adresser vos observations écrites sur ce procès-verbal dans un délai de ${n} jours à compter de sa réception.` : '';
    const empreinte = file && file.fileHash ? ` Empreinte SHA-256 du fichier, qui permet d'en vérifier l'intégrité : ${file.fileHash}.` : '';
    return {
      subject: `${d.ref || ''} : ${pv.type === 'presence' ? 'feuille de présence' : 'procès-verbal'} du ${P.fmtShort(pv.f.date)}`,
      body: `Madame, Monsieur,\n\nSuite à la ${pv.type === 'constat' ? 'visite' : 'réunion'} du ${P.fmtLong(pv.f.date)}${pv.f.adresse ? ' au ' + pv.f.adresse + (pv.f.ville ? ', ' + pv.f.ville : '') : ''}, veuillez trouver ci-joint ${quoi} (${T.label.toLowerCase()}, dossier ${d.ref || ''}).${delai}${empreinte}\n\nBonne réception,\n\nRodolphe GAUER\nGAUER Expertise Bâtiment\n06 35 56 23 65\ngauer.expertise@outlook.fr`
    };
  }
  async function logEnvoi(pv, file, mode) {
    const parts = (pv.participants || []).filter((p) => has(p.mail) && p.mail !== EXPERT.mail);
    const r = await modal(`<h3>Le PV est-il parti ?</h3>
      <p class="muted small">L'application ne voit pas votre messagerie. Confirmez l'envoi pour l'inscrire au journal du PV${delaiObs(pv) ? ' et faire courir le délai d\'observations' : ''}.</p>
      <div class="grid"><div class="fld"><label for="envDate">Date d'envoi</label><input id="envDate" class="inp" type="date" value="${today()}"></div></div>
      ${parts.length ? `<p class="mt small"><b>Destinataires</b></p><div class="pick">${parts.map((p) => `<label class="toggle"><input type="checkbox" value="${esc(p.id)}" checked> <span>${esc(p.nom || '')} <span class="muted">${esc(p.mail)}</span></span></label>`).join('')}</div>` : ''}
      <div class="fld w3 mt"><label for="envAutres">Autres destinataires (facultatif)</label><input id="envAutres" class="inp" placeholder="Nom ou adresse, séparés par des virgules"></div>
      <div class="mbtns"><button class="btn ghost" data-res="no">Non envoyé</button><button class="btn primary" data-res="ok">Envoi effectué</button></div>`,
    { sticky: true, collect: (m) => ({ date: $('#envDate', m).value, ids: $$('.pick input:checked', m).map((i) => i.value), autres: $('#envAutres', m).value }) });
    if (!r || typeof r !== 'object') return;
    const dest = parts.filter((p) => r.ids.includes(p.id)).map((p) => `${p.nom || ''} <${p.mail}>`.trim()).concat(r.autres.split(',').map((x) => x.trim()).filter(Boolean));
    const at = r.date ? new Date(r.date + 'T12:00:00').getTime() : Date.now();
    const x = pv.pdfs[file.index];
    if (!x) return;
    x.envois = (x.envois || []).concat([{ at, recordedAt: Date.now(), mode, dest }]);
    await savePV(); rerenderPV();
    const n = delaiObs(pv);
    toast(n ? `Envoi inscrit. Fin du délai d'observations : ${P.fmtShort(isoDay(addDays(at, n)))}.` : 'Envoi inscrit au journal du PV.');
  }
  async function sendDialog(pv, file) {
    const mails = (pv.participants || []).map((p) => p.mail).filter((m) => has(m) && m !== EXPERT.mail);
    const r = await modal(`<h3>Envoyer ${esc(file.filename)}</h3>
      <p class="muted">Le PDF est archivé dans ce PV sur la tablette.</p>
      <div class="send-opts">
        <button class="btn primary" data-res="mail">Envoyer par mail aux participants</button>
        <p class="small muted">Les adresses (${mails.length ? esc(mails.join(', ')) : 'aucune saisie'}) sont copiées : collez-les dans le champ À de votre messagerie, puis envoyez.</p>
        <button class="btn ghost" data-res="share">Enregistrer dans OneDrive ou autre application</button>
        <button class="btn ghost" data-res="dl">Enregistrer dans les téléchargements</button>
        ${file.index != null ? '<button class="btn ghost" data-res="remise">Inscrire un envoi fait autrement (courrier, remise en main propre)</button>' : ''}
      </div>
      ${file.fileHash ? `<p class="small muted mt">Empreinte du fichier : <span class="ref">${esc(shortHash(file.fileHash))}</span>…</p>` : ''}
      <div class="mbtns"><button class="btn ghost" data-res="no">Fermer</button></div>`);
    if (r === 'mail') {
      if (mails.length) { try { await navigator.clipboard.writeText(mails.join(', ')); toast('Adresses copiées. Collez-les dans le champ À.'); } catch (e) { toast('Copie des adresses impossible, saisissez-les dans la messagerie.', 'bad'); } }
      const m = mailText(pv, file);
      const ok = await shareFile(file.blob, file.filename, m.subject, m.body);
      if (ok && file.index != null) await logEnvoi(pv, file, 'Courriel');
    }
    if (r === 'share') await shareFile(file.blob, file.filename, file.filename, '');
    if (r === 'dl') { download(file.blob, file.filename); toast('PDF enregistré dans Téléchargements.'); }
    if (r === 'remise') await logEnvoi(pv, file, 'Remise en main propre ou autre envoi');
  }

  async function closePV() {
    const pv = st.pv, T = S.TYPES[pv.type];
    const warn = [];
    if (!has(pv.f.date)) warn.push('La date de la séance est vide.');
    if (pv.type !== 'presence' && !has(pv.f.heureFin)) warn.push("L'heure de fin n'est pas renseignée.");
    if (!has(pv.f.adresse)) warn.push("L'adresse du bien est vide.");
    const dires = T.sections.find((s) => s.key === 'dires');
    if (dires && P.isOn(pv, dires) && !((pv.lists || {}).dires || []).some((it) => P.itemFilled(dires, it))) warn.push("Aucun dire n'est consigné : le PV indiquera « Aucun dire n'a été formulé en séance ».");
    const unsigned = (pv.participants || []).filter((p) => ['Présent', 'Représenté'].includes(p.statut) && !p.sigStatut);
    if (unsigned.length) warn.push(`Sans signature ni mention : ${unsigned.map((p) => p.nom || 'participant sans nom').join(', ')}.`);
    const noPres = (pv.participants || []).filter((p) => !has(p.statut));
    if (noPres.length) warn.push(`Présence non renseignée : ${noPres.map((p) => p.nom || 'participant sans nom').join(', ')}.`);
    const noName = (pv.participants || []).filter((p) => !has(p.nom)).length;
    if (noName) warn.push(`${noName} participant(s) sans nom.`);
    const r = await modal(`<h3>Clôturer le PV ${esc(T.short.toLowerCase())} v${pv.version}</h3>
      ${warn.length ? `<p>Points à vérifier avant clôture :</p><ul class="warns">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p>Tout est renseigné.</p>'}
      <p class="muted small">Une fois clôturé, le PV passe en lecture seule. Pour le modifier, créez une nouvelle version.</p>
      <div class="mbtns"><button class="btn ghost" data-res="no">Revenir au PV</button><button class="btn primary" data-res="ok">Clôturer et générer le PDF</button></div>`);
    if (r !== 'ok') return;
    pv.statut = 'clos'; pv.closedAt = Date.now();
    try { pv.contentHash = await contentHash(pv); } catch (e) { pv.contentHash = null; }
    const d = st.dossiers.find((x) => x.id === pv.dossierId);
    if (d) {
      d.intervenants = d.intervenants || [];
      let added = 0;
      pv.participants.forEach((p) => {
        if (!has(p.nom) || (p.qualite || '').startsWith('Expert du Client')) return;
        const ex = d.intervenants.find((x) => (p.interId && x.id === p.interId) || sameName(x.nom, p.nom));
        if (!ex) { d.intervenants.push({ id: uid(), nom: p.nom, qualite: p.qualite || '', represente: p.represente || '', societe: p.societe || '', tel: p.tel || '', mail: p.mail || '', convoque: 'Oui', notes: 'Ajouté lors du PV du ' + P.fmtShort(pv.f.date) }); added++; }
        else ['tel', 'mail', 'societe', 'represente'].forEach((k) => { if (!has(ex[k]) && has(p[k])) ex[k] = p[k]; });
      });
      await saveDossier(d);
      if (added) toast(`${added} nouvel(le)s intervenant(s) ajouté(s) au dossier.`);
    }
    toast('Génération du PDF');
    try {
      const file = await makePDF(pv, false);
      const id = await saveBlob(file.blob);
      let fileHash = null;
      try { fileHash = await sha256(file.blob); } catch (e) { /* empreinte indisponible */ }
      pv.pdfs = (pv.pdfs || []).concat([{ blob: id, filename: file.filename, at: Date.now(), contentHash: pv.contentHash, fileHash, envois: [] }]);
      file.fileHash = fileHash; file.index = pv.pdfs.length - 1;
      await savePV();
      rerenderPV();
      st.lastPdf = file;
      await sendDialog(pv, file);
    } catch (e) {
      pv.statut = 'brouillon'; pv.closedAt = null; pv.contentHash = null; await savePV(); rerenderPV();
      toast('La génération du PDF a échoué : ' + (e.message || e), 'bad');
    }
  }

  /* ================= Sauvegarde et import ================= */
  async function exportData(dossierIds, label) {
    const dossiers = st.dossiers.filter((d) => dossierIds.includes(d.id));
    const pvs = st.pvs.filter((p) => dossierIds.includes(p.dossierId));
    const ids = new Set();
    pvs.forEach((p) => {
      (p.photos || []).forEach((x) => { if (x.blob) ids.add(x.blob); if (x.ann) ids.add(x.ann); });
      (p.participants || []).forEach((x) => x.sig && ids.add(x.sig));
      (p.pdfs || []).forEach((x) => ids.add(x.blob));
    });
    if (st.config.logo) ids.add(st.config.logo);
    if (st.config.signature) ids.add(st.config.signature);
    const blobs = [];
    for (const id of ids) {
      const r = await DB.get('blobs', id);
      if (r) blobs.push({ id, type: r.type, w: r.w, h: r.h, data: await blobToDataURL(r.blob) });
    }
    const json = JSON.stringify({ app: 'pv-gauer', format: 1, exportedAt: new Date().toISOString(), config: st.config, dossiers, pvs, blobs });
    const name = `${label}_sauvegarde-PV_${today()}`;
    const asJson = new File([json], name + '.json', { type: 'application/json' });
    if (!navigator.canShare || navigator.canShare({ files: [asJson] })) return shareFile(new Blob([json], { type: 'application/json' }), name + '.json', name, '');
    return shareFile(new Blob([json], { type: 'text/plain' }), name + '.txt', name, '');
  }
  async function importData(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return toast("Ce fichier n'est pas une sauvegarde lisible.", 'bad'); }
    if (!data || data.app !== 'pv-gauer') return toast("Ce fichier n'est pas une sauvegarde de l'application PV.", 'bad');
    let nb = 0, skip = 0;
    for (const b of data.blobs || []) {
      if (await DB.get('blobs', b.id)) continue;
      const blob = await (await fetch(b.data)).blob();
      await DB.put('blobs', { id: b.id, blob, type: b.type, w: b.w, h: b.h, at: Date.now() });
    }
    for (const [store, arr] of [['dossiers', data.dossiers || []], ['pvs', data.pvs || []]]) {
      for (const o of arr) {
        const ex = await DB.get(store, o.id);
        if (ex && (ex.updatedAt || 0) >= (o.updatedAt || 0)) { skip++; continue; }
        await DB.put(store, o); nb++;
      }
    }
    if (data.config && !st.config.logo && data.config.logo) { st.config.logo = data.config.logo; await saveConfig(); }
    if (data.config && !st.config.signature && data.config.signature) { st.config.signature = data.config.signature; await saveConfig(); }
    await loadAll();
    toast(`Import terminé : ${nb} élément(s) ajouté(s) ou mis à jour, ${skip} déjà à jour.`);
    render();
  }

  async function importSuivi(file) {
    let res;
    try { res = window.PVEXCEL.parse(window.XLSX, new Uint8Array(await file.arrayBuffer())); }
    catch (e) { return toast('Fichier Excel illisible : ' + (e.message || e), 'bad'); }
    if (!res.dossiers.length) return toast("Aucun dossier trouvé. Choisissez le fichier « Suivi dossiers GAUER Expertise ».", 'bad');
    st.suivi = { at: Date.now(), name: file.name, dossiers: res.dossiers, intervenants: res.intervenants };
    try { await DB.put('meta', { k: 'suivi', v: st.suivi }); } catch (e) { /* liste gardée pour cette session seulement */ }
    pickFromSuivi();
  }
  async function pickFromSuivi() {
    const sv = st.suivi;
    if (!sv) return $('#suiviFile').click();
    const N = window.PVEXCEL.norm;
    const nInter = (ref) => sv.intervenants.filter((x) => N(x.ref) === N(ref)).length;
    const known = new Set(st.dossiers.filter((d) => !d.deleted).map((d) => N(d.ref)));
    const rows = sv.dossiers.map((x, i) => ({ i, x, txt: fold([x.ref, x.client, x.adresse, x.ville, x.typeMission].join(' ')) }));
    const r = await modal(`<h3>Choisir un dossier du suivi Excel</h3>
      <p class="muted small">Fichier lu le ${esc(P.fmtStamp(sv.at))} : ${sv.dossiers.length} dossiers. Seul le dossier choisi est enregistré sur la tablette, avec ses coordonnées et ses intervenants.</p>
      <input id="pickq" class="inp" type="search" placeholder="Tapez un nom, un numéro ou une commune" autocomplete="off">
      <div id="pickl" class="picklist"></div>
      <div class="mbtns"><button class="btn ghost" data-res="reload">Relire le fichier Excel</button><button class="btn ghost" data-res="no">Fermer</button></div>`,
    { wide: true, onOpen: (m, close) => {
      const draw = () => {
        const q = fold($('#pickq', m).value).split(/\s+/).filter(Boolean);
        const prime = (r) => fold(r.x.ref + ' ' + r.x.client);
        const hits = rows.filter((r) => q.every((w) => r.txt.includes(w)))
          .sort((a, b) => (q.every((w) => prime(b).includes(w)) ? 1 : 0) - (q.every((w) => prime(a).includes(w)) ? 1 : 0));
        $('#pickl', m).innerHTML = hits.length ? hits.map(({ i, x }) => `<button type="button" class="pickrow" data-pick="${i}">
          <span class="ref">${esc(x.ref)}</span><b>${esc(x.client || '')}</b>
          <span class="muted small">${esc([x.adresse, x.ville].filter(has).join(', '))}${x.typeMission ? ' • ' + esc(x.typeMission) : ''}</span>
          <span class="pickmeta">${x.etat && x.etat !== 'Actif' ? `<span class="pill muted-pill">${esc(x.etat)}</span>` : ''}${nInter(x.ref) ? `<span class="small muted">${nInter(x.ref)} intervenant(s)</span>` : ''}${known.has(N(x.ref)) ? '<span class="pill done">Déjà sur la tablette</span>' : ''}</span>
        </button>`).join('') : '<p class="muted pad">Aucun dossier ne correspond.</p>';
      };
      $('#pickq', m).addEventListener('input', draw);
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) close('pick:' + b.dataset.pick); });
      draw();
    } });
    if (r === 'reload') return $('#suiviFile').click();
    if (!r || !String(r).startsWith('pick:')) return;
    const d = await importOne(sv.dossiers[+r.slice(5)]);
    if (d) go('#d/' + d.id);
  }
  async function importOne(x) {
    const N = window.PVEXCEL.norm, sv = st.suivi;
    let d = st.dossiers.find((y) => N(y.ref) === N(x.ref));
    const isNew = !d;
    if (!d) d = { id: 'd' + uid(), createdAt: Date.now(), intervenants: [] };
    if (d.deleted) d.deleted = false;
    Object.entries(x).forEach(([k, v]) => { if (has(v)) d[k] = v; });
    d.intervenants = d.intervenants || [];
    let iAdd = 0;
    sv.intervenants.filter((it) => N(it.ref) === N(x.ref)).forEach((it) => {
      const data = Object.assign({}, it); delete data.ref;
      const ex = d.intervenants.find((p) => sameName(p.nom, it.nom));
      if (!ex) { d.intervenants.push(Object.assign({ id: uid() }, data)); iAdd++; }
      else Object.entries(data).forEach(([k, v]) => { if (has(v)) ex[k] = v; });
    });
    if (!has(d.synthese)) d.synthese = synthFrom(d);
    await saveDossier(d);
    toast(`${x.ref} ${isNew ? 'ajouté' : 'mis à jour'}${iAdd ? `, ${iAdd} intervenant(s) repris` : ''}.`);
    return d;
  }

  /* ================= Réglages ================= */
  async function renderSettings(main) {
    crumbs([['Dossiers', '#'], ['Réglages', '#reglages']]);
    const c = st.config;
    let persisted = null, est = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* non disponible */ }
    try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { /* non disponible */ }
    const mb = (n) => (n / 1048576).toFixed(n > 1048576 * 100 ? 0 : 1).replace('.', ',') + ' Mo';
    const trashD = st.dossiers.filter((d) => d.deleted);
    main.innerHTML = `
      <section class="settings">
        <div class="page-head"><div><p class="eyebrow">Application</p><h1>Réglages</h1></div></div>
        <div class="split">
          <div class="panel">
            <h2 class="lbl">Identité sur les PV</h2>
            <div class="grid">
              ${fieldHTML({ k: 'expertNom', l: "Nom de l'expert", t: 'text' }, 'cf:expertNom', c.expertNom)}
              ${fieldHTML({ k: 'villeDefaut', l: 'Ville par défaut (Fait à)', t: 'text' }, 'cf:villeDefaut', c.villeDefaut)}
              ${fieldHTML({ k: 'delaiObs', l: "Délai d'observations, PV contradictoire (jours)", t: 'text', im: 'numeric' }, 'cf:delaiObs', c.delaiObs || '15')}
            </div>
            <div class="asset-row">
              <div><b>Logo GAUER EXPERTISE</b><p class="muted small">Affiché centré en tête de chaque page. PNG ou JPEG.</p></div>
              <div class="asset" data-thumb="${esc(c.logo || '')}">${c.logo ? '' : '<span class="muted small">Aucun logo, le nom est écrit en texte</span>'}</div>
              <label class="btn small ghost file">Choisir le logo<input type="file" accept="image/*" data-asset="logo" hidden></label>
            </div>
            <div class="asset-row">
              <div><b>Ma signature</b><p class="muted small">Apposée d'un geste sur vos PV. Image PNG sur fond transparent, ou signature dessinée ici.</p></div>
              <div class="asset sigbg" data-thumb="${esc(c.signature || '')}">${c.signature ? '' : '<span class="muted small">Aucune signature enregistrée</span>'}</div>
              <div class="row gap wrap"><label class="btn small ghost file">Importer une image<input type="file" accept="image/png,image/*" data-asset="signature" hidden></label><button class="btn small ghost" data-act="drawMySig">Dessiner ma signature</button></div>
            </div>
            <h2 class="lbl mt">Photos</h2>
            <label class="toggle"><input type="checkbox" data-b="cf:gps"${c.gps ? ' checked' : ''}> <span>Enregistrer la position GPS des photos prises sur place</span></label>
          </div>
          <div class="panel">
            <h2 class="lbl">Stockage sur la tablette</h2>
            <p>${persisted === true ? 'Stockage protégé : Android ne videra pas les données de l\'application.' : persisted === false ? 'Stockage non protégé. Installez l\'application sur l\'écran d\'accueil puis touchez « Protéger le stockage ».' : 'État du stockage inconnu sur cet appareil.'}</p>
            ${est ? `<p class="muted small">Utilisé : ${mb(est.usage || 0)} sur ${mb(est.quota || 0)} disponibles.</p>` : ''}
            ${persisted === false ? '<button class="btn small ghost" data-act="persist">Protéger le stockage</button>' : ''}
            <h2 class="lbl mt">Vérifier un PDF</h2>
            <p class="muted small">Choisissez un PDF reçu ou retrouvé : l'application calcule son empreinte et dit s'il est identique, octet pour octet, à un PV clôturé.</p>
            <label class="btn ghost file">Choisir un PDF à vérifier<input type="file" accept="application/pdf,.pdf" data-verify="1" hidden></label>
            <h2 class="lbl mt">Sauvegardes</h2>
            <p class="muted small">La sauvegarde regroupe dossiers, PV, photos, signatures et PDF en un seul fichier. Enregistrez-la dans OneDrive pour la retrouver sur le PC ou réinstaller la tablette. L'import ajoute et met à jour, il ne supprime jamais rien.</p>
            <div class="row gap wrap"><button class="btn primary" data-act="exportAll">Sauvegarde complète vers OneDrive</button><button class="btn ghost" data-act="import">Importer une sauvegarde</button></div>
            ${trashD.length ? `<h2 class="lbl mt">Corbeille</h2><div class="pvlist">${trashD.map((d) => `<div class="pvrow"><span><b class="ref">${esc(d.ref || 'Sans référence')}</b><br><span class="muted">${esc(d.client || '')}</span></span><button class="btn small ghost" data-act="restoreDossier" data-id="${d.id}">Restaurer</button></div>`).join('')}</div>` : ''}
            <h2 class="lbl mt">Dictée vocale</h2>
            <p class="muted small">Dans n'importe quel champ, touchez le micro du clavier Samsung ou Google pour dicter. Pour dicter sans réseau, téléchargez le français dans les paramètres de saisie vocale du clavier (reconnaissance hors connexion).</p>
            <h2 class="lbl mt">Version</h2>
            <p class="muted small">PV GAUER, version ${esc(window.PV_VERSION || '')}. Fonctionne sans réseau une fois installée.</p>
          </div>
        </div>
      </section>`;
    hydratePhotos(main);
  }
  function renderTrash() { go('#reglages'); }

  /* ================= Événements ================= */
  function rootFor(bind) {
    const [pfx, path] = [bind.slice(0, 3), bind.slice(3)];
    if (pfx === 'pv:') return [st.pv, path, schedulePV];
    if (pfx === 'do:') return [st.dos, path, () => { clearTimeout(st.dosT); st.dosT = setTimeout(() => saveDossier(st.dos), 400); }];
    if (pfx === 'cf:') return [st.config, path, () => { clearTimeout(st.cfgT); st.cfgT = setTimeout(saveConfig, 300); }];
    return [null];
  }
  function onBind(el) {
    const [root, path, save] = rootFor(el.dataset.b);
    if (!root) return;
    if (st.pv && root === st.pv && st.pv.statut === 'clos') return;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(root, path, v);
    save();
    if (el.tagName === 'TEXTAREA') autosize(el);
    if (root === st.dos && /^intervenants\.\d+\.nom$/.test(path)) {
      const head = el.closest('.item') && el.closest('.item').querySelector('.item-head b');
      if (head) head.textContent = v || 'Intervenant';
    }
    if (st.pv && root === st.pv && /^participants\.\d+\.(nom|qualite)$/.test(path)) {
      const parts = st.pv.participants;
      $$('select[data-ptype]').forEach((s) => { const cur = s.value; s.innerHTML = participantOptions(parts, cur); });
      const i = +path.split('.')[1];
      const head = el.closest('.item') && el.closest('.item').querySelector('.item-head b');
      if (head && path.endsWith('nom')) head.textContent = parts[i].nom || 'Participant ' + (i + 1);
    }
    if (root === st.dos && path === 'ref') { const h = $('.ref-big'); if (h) h.textContent = v || 'Nouveau dossier'; }
  }
  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.b) onBind(e.target); });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.b && (t.type === 'checkbox' || t.tagName === 'SELECT')) onBind(t);
    if (t.dataset && t.dataset.photo) { const files = Array.from(t.files || []); t.value = ''; addPhotos(files, t.dataset.photo === 'camera'); }
    if (t.dataset && t.dataset.asset) {
      const f = t.files && t.files[0]; t.value = '';
      if (!f) return;
      const blob = t.dataset.asset === 'logo' && f.size > 1500000 ? await compress(f, 1200, 0.9) : f;
      st.config[t.dataset.asset] = await saveBlob(blob);
      await saveConfig(); render();
    }
    if (t.id === 'importFile') { const f = t.files && t.files[0]; t.value = ''; if (f) importData(f); }
    if (t.dataset && t.dataset.verify) {
      const f = t.files && t.files[0]; t.value = '';
      if (!f) return;
      const h = await sha256(f);
      let hit = null;
      st.pvs.forEach((p) => (p.pdfs || []).forEach((x) => { if (x.fileHash === h) hit = { p, x }; }));
      if (hit) {
        const d = dossierOf(hit.p);
        await modal(`<h3>PDF authentique</h3><p>« ${esc(f.name)} » est identique au PV ${esc(S.TYPES[hit.p.type].label.toLowerCase())} v${hit.p.version} du dossier ${esc(d.ref || '')}, clôturé le ${esc(P.fmtStamp(hit.x.at))}.</p><p class="small muted">Empreinte : <span class="ref">${esc(h)}</span></p><div class="mbtns"><button class="btn primary" data-res="ok">Fermer</button></div>`);
      } else {
        await modal(`<h3>Aucune correspondance</h3><p>« ${esc(f.name)} » ne correspond à aucun PV clôturé enregistré sur cette tablette. S'il s'agit d'un de vos PV, il a été modifié après sa clôture, ou il provient d'une autre tablette.</p><p class="small muted">Empreinte : <span class="ref">${esc(h)}</span></p><div class="mbtns"><button class="btn primary" data-res="ok">Fermer</button></div>`);
      }
      return;
    }
    if (t.id === 'suiviFile') { const f = t.files && t.files[0]; t.value = ''; if (f) importSuivi(f); }
  });
  document.addEventListener('pointerdown', (e) => {
    const lab = e.target.closest('label.file');
    if (lab && lab.querySelector('[data-photo="camera"]')) startGPS();
  });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const pv = st.pv;
    if (act === 'jump') { e.preventDefault(); const s = $('#sec-' + b.dataset.key); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (act === 'newDossier') return newDossier();
    if (act === 'import') return $('#importFile').click();
    if (act === 'importSuivi') return st.suivi ? pickFromSuivi() : $('#suiviFile').click();
    if (act === 'filter') { st.filter = b.dataset.val; return render(); }
    if (act === 'synthExcel') {
      if (has(st.dos.synthese) && !await confirmBox('Remplacer la synthèse ?', 'Le texte actuel sera remplacé par le résumé du suivi Excel.', 'Remplacer')) return;
      st.dos.synthese = synthFrom(st.dos); await saveDossier(st.dos); return render();
    }
    if (act === 'copy') { try { await navigator.clipboard.writeText(b.dataset.val); toast('Copié.'); } catch (er) { toast('Copie impossible sur cet appareil.', 'bad'); } return; }
    if (act === 'clearSearch') { $('#gsearch').value = ''; onSearch(''); return; }
    if (act === 'allResults') { e.preventDefault(); closeResults(); return go('#'); }
    if (act === 'addInter') {
      st.openInter = true;
      st.dos.intervenants = (st.dos.intervenants || []).concat([{ id: uid(), convoque: 'Oui' }]);
      await saveDossier(st.dos); render();
      const it = $$('#intervenants .item').pop(); if (it) { it.scrollIntoView({ block: 'center' }); const f = it.querySelector('input'); if (f) f.focus({ preventScroll: true }); }
      return;
    }
    if ((act === 'move' || act === 'delItem') && (b.dataset.path || '').startsWith('do:')) {
      const arr = st.dos.intervenants; const i = +b.dataset.i;
      if (act === 'move') { const j = i + (+b.dataset.dir); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
      else { if (!await confirmBox('Retirer cet intervenant du dossier ?', 'Il ne sera plus proposé dans les nouveaux PV. Les PV déjà établis ne changent pas. Une ligne du fichier Excel le réimportera.', 'Retirer', true)) return; arr.splice(i, 1); }
      await saveDossier(st.dos); const y = window.scrollY; render(); setTimeout(() => window.scrollTo(0, y), 0); return;
    }
    if (act === 'suggestRef') { st.dos.ref = suggestRef(st.dos.client); await saveDossier(st.dos); return render(); }
    if (act === 'newPV') { const p = newPV(st.dos, b.dataset.type); await DB.put('pvs', p); st.pvs.push(p); touchDossier(p.dossierId); return go('#pv/' + p.id); }
    if (act === 'deleteDossier') {
      if (!await confirmBox('Mettre le dossier à la corbeille ?', 'Le dossier et ses PV restent sur la tablette et se restaurent depuis les Réglages.', 'Mettre à la corbeille', true)) return;
      st.dos.deleted = true; await saveDossier(st.dos); toast('Dossier placé dans la corbeille.'); return go('#');
    }
    if (act === 'restoreDossier') { const d = st.dossiers.find((x) => x.id === b.dataset.id); d.deleted = false; await saveDossier(d); toast('Dossier restauré.'); return render(); }
    if (act === 'restorePV') { const p = st.pvs.find((x) => x.id === b.dataset.id); p.deleted = false; await DB.put('pvs', p); toast('PV restauré.'); return render(); }
    if (act === 'exportDossier') { await savePV(); return exportData([st.dos.id], st.dos.ref || 'dossier'); }
    if (act === 'exportAll') return exportData(st.dossiers.map((d) => d.id), 'GAUER');
    if (act === 'persist') { try { await navigator.storage.persist(); } catch (er) { /* refusé */ } return render(); }
    if (act === 'drawMySig') {
      const cv = await signaturePad('Ma signature', 'Elle sera apposée sur vos PV d\'un geste.');
      if (cv && cv !== 'empty' && cv !== 'no') { const t = trimCanvas(cv); st.config.signature = await saveBlob(await new Promise((r) => t.toBlob(r, 'image/png'))); await saveConfig(); render(); }
      return;
    }

    if (!pv) return;
    const ro = pv.statut === 'clos';
    if (act === 'pvMenu') {
      const r = await modal(`<h3>Autres actions</h3><div class="send-opts">
        <button class="btn ghost" data-res="dup">Dupliquer ce PV (nouveau PV v1)</button>
        ${ro ? '<button class="btn ghost" data-res="preview">Télécharger le PDF archivé</button>' : '<button class="btn ghost" data-res="preview">Aperçu PDF (filigrane PROJET)</button>'}
        <button class="btn ghost" data-res="export">Sauvegarder le dossier vers OneDrive</button>
        <button class="btn danger" data-res="del">Mettre ce PV à la corbeille</button></div>
        <div class="mbtns"><button class="btn ghost" data-res="no">Fermer</button></div>`);
      if (r === 'dup') { const c = clone(pv); Object.assign(c, { id: 'p' + uid(), version: 1, statut: 'brouillon', closedAt: null, pdfs: [], createdAt: Date.now() }); c.participants.forEach((p) => { delete p.sig; delete p.sigAt; delete p.sigStatut; delete p.sigMotif; }); await DB.put('pvs', c); st.pvs.push(c); return go('#pv/' + c.id); }
      if (r === 'preview') { if (ro && pv.pdfs.length) { const x = pv.pdfs[pv.pdfs.length - 1]; const rec = await DB.get('blobs', x.blob); return download(rec.blob, x.filename); } const f = await makePDF(pv, true); download(f.blob, f.filename); return toast('Aperçu enregistré dans Téléchargements.'); }
      if (r === 'export') return exportData([pv.dossierId], dossierOf(pv).ref || 'dossier');
      if (r === 'del' && await confirmBox('Mettre ce PV à la corbeille ?', 'Il reste restaurable depuis la fiche du dossier.', 'Mettre à la corbeille', true)) { pv.deleted = true; await savePV(); return go('#d/' + pv.dossierId); }
      return;
    }
    if (act === 'previewPDF') {
      toast('Préparation de l\'aperçu');
      try { const f = await makePDF(pv, true); download(f.blob, f.filename); toast('Aperçu enregistré dans Téléchargements. Ouvrez-le depuis la notification.'); }
      catch (er) { toast('Aperçu impossible : ' + (er.message || er), 'bad'); }
      return;
    }
    if (act === 'closePV') return closePV();
    if (act === 'sendPDF') {
      const i = (pv.pdfs || []).length - 1;
      const x = (pv.pdfs || [])[i];
      if (!x) return toast('Aucun PDF archivé pour ce PV.', 'bad');
      const rec = await DB.get('blobs', x.blob);
      return sendDialog(pv, { blob: rec.blob, filename: x.filename, fileHash: x.fileHash, index: i });
    }
    if (act === 'sharePdfArchive') { const i = +b.dataset.i; const x = pv.pdfs[i]; const rec = await DB.get('blobs', x.blob); return sendDialog(pv, { blob: rec.blob, filename: x.filename, fileHash: x.fileHash, index: i }); }
    if (act === 'newVersion') {
      if (!await confirmBox('Créer une nouvelle version ?', `Le PV v${pv.version} reste archivé tel quel. La v${pv.version + 1} reprend son contenu, sans les signatures.`, 'Créer la v' + (pv.version + 1))) return;
      const c = clone(pv);
      Object.assign(c, { id: 'p' + uid(), version: pv.version + 1, parentId: pv.id, statut: 'brouillon', closedAt: null, pdfs: [], createdAt: Date.now() });
      c.participants.forEach((p) => { delete p.sig; delete p.sigAt; delete p.sigStatut; delete p.sigMotif; });
      await DB.put('pvs', c); st.pvs.push(c); return go('#pv/' + c.id);
    }
    if (ro) return;

    if (act === 'toggleSection') {
      const sec = S.TYPES[pv.type].sections.find((s) => s.key === b.dataset.key);
      pv.enabled[sec.key] = !P.isOn(pv, sec);
      await savePV(); rerenderPV();
      if (pv.enabled[sec.key]) { const s = $('#sec-' + sec.key); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    if (act === 'now') { const [root, path, save] = rootFor(b.dataset.path); setPath(root, path, nowHM()); save(); const inp = b.parentElement.querySelector('input'); if (inp) inp.value = nowHM(); return; }
    if (act === 'toggleCheck' || act === 'toggleRef') {
      const [root, path, save] = rootFor(b.dataset.path);
      const arr = (getPath(root, path) || []).slice();
      const v = act === 'toggleRef' ? b.dataset.id : b.dataset.val;
      const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
      setPath(root, path, arr); save();
      b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', String(i < 0));
      return;
    }
    if (act === 'essai') {
      pv.essais = pv.essais || {};
      const e0 = pv.essais[b.dataset.label] || {};
      e0.statut = b.dataset.val; pv.essais[b.dataset.label] = e0;
      schedulePV();
      const row = b.closest('.ck');
      $$('button', row).forEach((x) => x.classList.toggle('on', x === b));
      row.classList.toggle('res', b.dataset.val === 'Réserve'); row.classList.toggle('okk', b.dataset.val === 'Conforme');
      return;
    }
    if (act === 'addItem') {
      const key = b.dataset.key;
      if (key === 'participants') pv.participants.push({ id: uid(), statut: 'Présent', arrivee: nowHM() });
      else {
        const sk = key.split('.')[1];
        const sec = S.TYPES[pv.type].sections.find((s) => s.key === sk);
        const it = { id: uid() };
        sec.fields.forEach((f) => { if (f.d != null) it[f.k] = f.d; });
        if (sk === 'jauges') it.datePose = pv.f.date;
        pv.lists[sk] = (pv.lists[sk] || []).concat([it]);
      }
      await savePV(); rerenderPV();
      const items = $$('#sec-' + (key === 'participants' ? 'participants' : key.split('.')[1]) + ' .item');
      const last = items[items.length - 1];
      if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const f = last.querySelector('input,textarea'); if (f) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body || document.activeElement === b) f.focus({ preventScroll: true }); }, 350); }
      return;
    }
    if (act === 'move' || act === 'delItem' || act === 'dupItem') {
      const arr = getPath(pv, b.dataset.path); const i = +b.dataset.i;
      if (act === 'move') { const j = i + (+b.dataset.dir); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
      if (act === 'dupItem') { const c = clone(arr[i]); c.id = uid(); arr.splice(i + 1, 0, c); }
      if (act === 'delItem') {
        if (!await confirmBox('Supprimer cet élément ?', b.dataset.path === 'photos' ? 'La photo est retirée du PV et des constatations qui la citent.' : 'Son contenu sera retiré du PV.', 'Supprimer', true)) return;
        const [gone] = arr.splice(i, 1);
        if (b.dataset.path === 'photos') Object.values(pv.lists || {}).forEach((l) => l.forEach((it) => { if (Array.isArray(it.photos)) it.photos = it.photos.filter((x) => x !== gone.id); }));
      }
      await savePV(); return rerenderPV();
    }
    if (act === 'pickInter') {
      const d = dossierOf(pv);
      const avail = (d.intervenants || []).filter((x) => has(x.nom) && !pv.participants.some((p) => p.interId === x.id || sameName(p.nom, x.nom)));
      if (!avail.length) return toast('Tous les intervenants du dossier figurent déjà dans le PV.');
      const r = await modal(`<h3>Ajouter des intervenants</h3><div class="pick">${avail.map((x) => `<label class="toggle"><input type="checkbox" value="${x.id}" checked> <span><b>${esc(x.nom)}</b>${x.qualite ? ', ' + esc(x.qualite) : ''}${x.societe ? ' (' + esc(x.societe) + ')' : ''}</span></label>`).join('')}</div><div class="mbtns"><button class="btn ghost" data-res="no">Annuler</button><button class="btn primary" data-res="ok">Ajouter</button></div>`,
        { collect: (m) => $$('input:checked', m).map((i) => i.value) });
      if (!Array.isArray(r) || !r.length) return;
      avail.filter((x) => r.includes(x.id)).forEach((x) => pv.participants.push(fromInter(x)));
      await savePV(); return rerenderPV();
    }
    if (act === 'importParticipants') {
      const from = st.pvs.find((p) => p.id === b.dataset.from);
      const names = new Set(pv.participants.map((p) => (p.nom || '').toLowerCase()));
      let n = 0;
      from.participants.forEach((p) => { if (!names.has((p.nom || '').toLowerCase())) { pv.participants.push({ id: uid(), nom: p.nom, qualite: p.qualite, represente: p.represente, societe: p.societe, tel: p.tel, mail: p.mail, statut: 'Présent' }); n++; } });
      await savePV(); rerenderPV(); return toast(n ? `${n} participant(s) ajouté(s).` : 'Tous ces participants figurent déjà dans le PV.');
    }
    if (act === 'newSketch') {
      const p = { id: uid(), kind: 'croquis', blob: null, ann: null, legende: '', zone: '', takenAt: Date.now(), lat: null, lon: null, shapes: [] };
      const r = await openDrawing(p);
      if (!r || !r.blob) return;
      p.shapes = r.shapes; p.ann = await saveBlob(r.blob);
      pv.photos.push(p); await savePV(); return rerenderPV();
    }
    if (act === 'annotate') {
      const p = pv.photos[+b.dataset.i];
      const r = await openDrawing(p);
      if (!r) return;
      p.shapes = r.shapes; p.ann = r.blob ? await saveBlob(r.blob) : null;
      await savePV(); return rerenderPV();
    }
    if (act === 'sign') {
      const p = pv.participants[+b.dataset.i];
      const cv = await signaturePad(`Signature de ${p.nom || 'participant'}`, [p.qualite, p.represente ? 'pour ' + p.represente : ''].filter(has).join(', '));
      if (cv === 'empty') return toast('Signature vide, rien n\'a été enregistré.', 'bad');
      if (!cv || cv === 'no' || cv === 'clear') return;
      const t = trimCanvas(cv);
      p.sig = await saveBlob(await new Promise((r) => t.toBlob(r, 'image/png')));
      p.sigStatut = 'Signé'; p.sigAt = Date.now(); delete p.sigMotif;
      await savePV(); return rerenderPV();
    }
    if (act === 'signExpert') { const p = pv.participants[+b.dataset.i]; p.sig = st.config.signature; p.sigStatut = 'Signé'; p.sigAt = Date.now(); await savePV(); return rerenderPV(); }
    if (act === 'refuse') {
      const p = pv.participants[+b.dataset.i];
      const m = await askText(`Refus de signer : ${p.nom || 'participant'}`, p.sigMotif || '', 'Motif indiqué par la personne (facultatif)');
      if (m === null) return;
      p.sigStatut = 'Refus de signer'; p.sigMotif = m; delete p.sig; p.sigAt = null;
      await savePV(); return rerenderPV();
    }
    if (act === 'defer') { const p = pv.participants[+b.dataset.i]; p.sigStatut = 'Signature différée'; delete p.sig; p.sigAt = null; await savePV(); return rerenderPV(); }
  });

  window.addEventListener('pagehide', () => { if (st.pv) savePV(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.pv) savePV(); });

  /* ================= Démarrage ================= */
  async function start() {
    try { await DB.open(); } catch (e) {
      $('#main').innerHTML = '<div class="empty"><h2>Stockage indisponible</h2><p>La tablette refuse le stockage local (navigation privée ?). Ouvrez l\'application normalement depuis l\'écran d\'accueil.</p></div>';
      return;
    }
    await loadAll();
    if (!st.config.logo && !st.config.logoDefault) {
      try {
        const r = await fetch('icons/logo-gauer.jpg');
        if (r.ok) { st.config.logo = await saveBlob(await r.blob()); st.config.logoDefault = true; await saveConfig(); }
      } catch (e) { /* logo par défaut indisponible */ }
    }
    wireSearch();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* refusé */ }
    const net = () => document.body.classList.toggle('offline', !navigator.onLine);
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
    render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              toast("Nouvelle version de l'application disponible.", '', { label: 'Mettre à jour', fn: async () => { await savePV(); nw.postMessage('skip'); } });
            }
          });
        });
      }).catch(() => { /* pas de mode hors ligne */ });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    }
  }
  start();
})();
