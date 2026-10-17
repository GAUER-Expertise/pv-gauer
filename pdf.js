/* Générateur PDF des PV, charte GAUER Expertise Bâtiment */
(function (g) {
  'use strict';
  const S = (g.PVSCHEMA) || (typeof require !== 'undefined' ? require('./schema.js') : null);

  const NAVY = [26, 54, 93];
  const TINT = [232, 238, 245];
  const ALT = [244, 246, 249];
  const LINE = [214, 220, 228];
  const INK = [33, 37, 41];
  const GREY = [74, 74, 74];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const FOOT = [
    'GAUER Expertise Bâtiment, EURL au capital de 1 000 € • 14 avenue du Docteur Zamenhof, 72000 Le Mans • Tél. 06 35 56 23 65 • gauer.expertise@outlook.fr',
    'RCS Le Mans 130 440 316 • SIRET 130 440 316 00011 • APE 71.12B',
    'RC Professionnelle et décennale Zurich, contrat n° 7400042329-199800292'
  ];

  const clean = (v) => String(v == null ? '' : v)
    .replace(/[    ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\u0000-ɏ‘’“”•€Œœ\n]/g, '');
  const has = (v) => Array.isArray(v) ? v.length > 0 : (v != null && String(v).trim() !== '');
  const val = (f, v) => Array.isArray(v) ? v.join(', ') : (f && f.t === 'date' ? fmtShort(v) : v);

  function fmtLong(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y) return iso;
    return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;
  }
  function fmtShort(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  function fmtStamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}`;
  }
  const hhmm = (t) => t ? t.replace(':', 'h') : '';

  function isOn(pv, sec) {
    if (!sec.optional) return true;
    const e = pv.enabled && pv.enabled[sec.key];
    return e == null ? !!sec.defaultOn : !!e;
  }
  function photoLabels(pv) {
    const map = {}; let np = 0, nc = 0;
    (pv.photos || []).forEach((p) => { map[p.id] = p.kind === 'croquis' ? `Croquis ${++nc}` : `Photo ${++np}`; });
    return map;
  }
  function itemFilled(sec, it) {
    return sec.fields.some((f) => has(it[f.k]) && !(f.d && it[f.k] === f.d) && f.t !== 'photorefs') || has(it.photos);
  }
  function titreOf(pv) {
    const T = S.TYPES[pv.type];
    if (T.titreBy) return T.titreBy[(pv.f || {}).nature] || T.titre;
    return T.titre;
  }
  function slugOf(pv) {
    const T = S.TYPES[pv.type];
    if (T.slugBy) return T.slugBy[(pv.f || {}).nature] || T.slug;
    return T.slug;
  }
  function fileName(pv, dossier) {
    return `${(dossier && dossier.ref) || 'PV'}_PV-${slugOf(pv)}_v${pv.version || 1}.pdf`;
  }

  function build(o) {
    const { jsPDF, pv, dossier = {}, config = {}, imgs = {}, draft, stamp } = o;
    const T = S.TYPES[pv.type];
    const F = pv.f || {};
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const ML = 25, MR = 185, W = 160, TOP = 33, BOT = 263;
    let y = TOP;
    const labels = photoLabels(pv);
    const parts = pv.participants || [];
    const partName = (id) => { const p = parts.find((x) => x.id === id); return p ? (p.nom || 'Participant sans nom') : ''; };
    const refText = (ids) => (ids || []).map((id) => labels[id]).filter(Boolean).join(', ');

    doc.setProperties({ title: `${dossier.ref || ''} ${titreOf(pv)} v${pv.version || 1}`, author: 'GAUER Expertise Bâtiment', creator: 'PV GAUER' });

    const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const ensure = (h) => { if (y + h > BOT) { doc.addPage(); y = TOP; return true; } return false; };
    const spaced = (txt, size, cs, yy, style, color) => {
      font(style || 'bold', size, color || NAVY);
      const t = clean(txt);
      const w = doc.getTextWidth(t) + cs * (t.length - 1);
      doc.text(t, 105 - w / 2, yy, { charSpace: cs });
    };
    const para = (txt, opt = {}) => {
      if (!has(txt)) return;
      const size = opt.size || 10;
      font(opt.style || 'normal', size, opt.color);
      const lines = doc.splitTextToSize(clean(txt), W - (opt.indent || 0));
      const lh = size * 0.3528 * 1.4;
      lines.forEach((ln) => { ensure(lh); doc.text(ln, ML + (opt.indent || 0), y + lh * 0.75); y += lh; });
      y += opt.gap == null ? 2 : opt.gap;
    };
    let secN = 0;
    const heading = (t, need) => {
      ensure(need || 30);
      y += 3;
      font('bold', 12, NAVY);
      doc.text(`${++secN}. ${clean(t)}`, ML, y + 4);
      y += 8.5;
    };
    const tableOpts = (extra) => Object.assign({
      startY: y,
      margin: { top: TOP, bottom: 297 - BOT, left: ML, right: 210 - MR },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.1, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', lineColor: NAVY },
      alternateRowStyles: { fillColor: ALT },
      rowPageBreak: 'avoid'
    }, extra);
    const table = (head, body, extra) => {
      doc.autoTable(tableOpts(Object.assign({ head: head ? [head.map(clean)] : undefined, body: body.map((r) => r.map((c) => typeof c === 'object' && c !== null ? c : clean(c))) }, extra || {})));
      y = doc.lastAutoTable.finalY + 5;
    };
    const kv = (rows, extra) => {
      if (!rows.length) return;
      table(null, rows, Object.assign({
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: INK, valign: 'top' },
        columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: NAVY, fontSize: 8.2 } },
        alternateRowStyles: { fillColor: ALT }
      }, extra || {}));
    };
    const box = (label, lines) => {
      font('normal', 9.6);
      const wrapped = [].concat(...lines.filter(has).map((l) => doc.splitTextToSize(clean(l), W - 9)));
      if (!wrapped.length) return;
      const lh = 4.7;
      const h = 9 + wrapped.length * lh + 1.5;
      ensure(h);
      doc.setFillColor(...TINT); doc.setDrawColor(...NAVY); doc.setLineWidth(0.3);
      doc.rect(ML, y, W, h, 'FD');
      font('bold', 7.8, NAVY);
      doc.text(clean(label), ML + 4.5, y + 5.2, { charSpace: 0.9 });
      font('normal', 9.6);
      wrapped.forEach((l, i) => doc.text(l, ML + 4.5, y + 10.5 + i * lh));
      y += h + 5;
    };

    /* ---------- Bloc titre ---------- */
    y = TOP + 4;
    if (pv.type === 'presence') {
      spaced('FEUILLE DE PRÉSENCE', 18, 1.6, y + 6);
      spaced(`RÉUNION DU ${fmtLong(F.date).toUpperCase()}`, 10.5, 1.1, y + 14, 'normal');
    } else {
      spaced('PROCÈS-VERBAL', 18, 1.6, y + 6);
      spaced(titreOf(pv), 10.5, 1.1, y + 14, 'normal');
    }
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.6); doc.line(91, y + 19, 119, y + 19);
    if (has(dossier.typeMission)) { font('italic', 9, GREY); doc.text(clean(dossier.typeMission), 105, y + 25, { align: 'center' }); }
    y += 31;
    font('normal', 10);
    const lieu = F.faitA || F.ville || dossier.ville || config.villeDefaut || 'Le Mans';
    if (F.date) doc.text(clean(`${lieu}, le ${fmtLong(F.date)}`), MR, y, { align: 'right' });
    y += 7;

    /* ---------- Tableau d'en-tête ---------- */
    const head = [
      ['DOSSIER', dossier.ref || ''],
      ['CLIENT', [dossier.client, dossier.qualiteClient ? `(${dossier.qualiteClient})` : ''].filter(has).join(' ')],
      ['BIEN', [F.adresse || dossier.adresse, F.ville || [dossier.cp, dossier.ville].filter(has).join(' ')].filter(has).join(', ')],
      ['SÉANCE', [F.date ? fmtShort(F.date) : '', F.heureDebut ? `de ${hhmm(F.heureDebut)}` : '', F.heureFin ? `à ${hhmm(F.heureFin)}` : ''].filter(has).join(' ')],
      ['VERSION', `v${pv.version || 1}${pv.statut === 'clos' ? ', clôturée le ' + fmtStamp(pv.closedAt) : ', projet'}`]
    ].filter((r) => has(r[1]));
    doc.autoTable({
      startY: y, body: head.map((r) => r.map(clean)), theme: 'plain',
      margin: { left: ML, right: 210 - MR, top: TOP, bottom: 297 - BOT },
      styles: { font: 'helvetica', fontSize: 9.4, cellPadding: { top: 1.9, bottom: 1.9, left: 2.5, right: 2 }, textColor: INK },
      columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold', textColor: NAVY, fontSize: 7.8 } },
      didDrawCell: (d) => {
        if (d.section === 'body' && d.row.index < head.length - 1 && d.column.index === 1) {
          doc.setDrawColor(...LINE); doc.setLineWidth(0.15);
          doc.line(ML, d.cell.y + d.cell.height, MR, d.cell.y + d.cell.height);
        }
      },
      didParseCell: (d) => { if (d.column.index === 0) d.cell.styles.charSpace = 0.8; }
    });
    y = doc.lastAutoTable.finalY + 5;

    if (has(F.objet)) box(pv.type === 'reception' ? 'OUVRAGE CONCERNÉ' : 'OBJET', [F.objet]);

    /* ---------- Sections ---------- */
    const consentOn = pv.type === 'presence' && isOn(pv, T.sections.find((s) => s.key === 'consentement'));

    T.sections.forEach((sec) => {
      if (!isOn(pv, sec)) return;
      if (sec.kind === 'fields') {
        if (sec.key === 'cloture') return; // imprimée avant les signatures
        const rows = sec.fields
          .filter((f) => f.role !== 'objet' && has(F[f.k]))
          .filter((f) => !(sec.key === 'seance' && ['date', 'heureDebut', 'heureFin', 'adresse', 'ville'].includes(f.k)))
          .filter((f) => !(sec.consent && f.k === 'mentionAccord'))
          .map((f) => [f.l, val(f, F[f.k])]);
        if (sec.key === 'seance' && F.reunionDate) { /* rien */ }
        if (sec.consent) {
          if (!has(F.outil) && !has(F.mentionAccord)) return;
          heading(sec.title);
          kv(rows);
          para(F.mentionAccord, { size: 9.5 });
          return;
        }
        if (!rows.length) return;
        heading(sec.title);
        kv(rows);
        return;
      }

      if (sec.kind === 'participants') {
        if (!parts.length) return;
        heading(sec.title);
        const isPres = pv.type === 'presence';
        const pres = (p) => [p.statut || '', [p.arrivee ? 'arrivée ' + hhmm(p.arrivee) : '', p.depart ? 'départ ' + hhmm(p.depart) : ''].filter(has).join(', ')].filter(has).join('\n');
        if (isPres) {
          const headRow = ['Nom et qualité', 'Représente / société', 'Coordonnées', 'Présence'];
          if (consentOn) headRow.push('Accord notes');
          headRow.push('Signature');
          const body = parts.map((p) => {
            const r = [[p.nom, p.qualite].filter(has).join('\n'), [p.represente, p.societe].filter(has).join('\n'), [p.tel, p.mail].filter(has).join('\n'), pres(p)];
            if (consentOn) r.push(p.accordNotes || '');
            r.push(sigText(p));
            return r;
          });
          const sc = headRow.length - 1;
          const cs = { 0: { cellWidth: 38 }, 1: { cellWidth: 25 }, 2: { cellWidth: consentOn ? 31 : 36 }, 3: { cellWidth: 18 } };
          if (consentOn) cs[4] = { cellWidth: 14, halign: 'center' };
          cs[sc] = { cellWidth: 'auto', minCellHeight: 19, fontSize: 6.8, textColor: GREY };
          table(headRow, body, {
            styles: Object.assign({}, tableOpts().styles, { fontSize: 7.8 }),
            columnStyles: cs,
            didParseCell: (d) => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.fontStyle = 'bold'; },
            didDrawCell: sigDrawer(sc, parts, true)
          });
        } else {
          const headRow = ['Nom', 'Qualité', 'Représente / société', 'Coordonnées', 'Présence'];
          const body = parts.map((p) => [p.nom || '', p.qualite || '', [p.represente, p.societe].filter(has).join('\n'), [p.tel, p.mail].filter(has).join('\n'), pres(p)]);
          table(headRow, body, {
            styles: Object.assign({}, tableOpts().styles, { fontSize: 8 }),
            columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 34 }, 3: { cellWidth: 44 }, 4: { cellWidth: 21 } }
          });
        }
        return;
      }

      if (sec.kind === 'list') {
        const items = ((pv.lists || {})[sec.key] || []).filter((it) => itemFilled(sec, it));
        if (!items.length) {
          if (sec.emptyText) { heading(sec.title); para(sec.emptyText, { style: 'italic', size: 9.5 }); }
          return;
        }
        heading(sec.title);
        const cell = (f, it) => f.t === 'participant' ? partName(it[f.k]) : f.t === 'photorefs' ? refText(it[f.k]) : val(f, it[f.k]);
        if (sec.pdf === 'cards') {
          items.forEach((it, i) => {
            const title = `${sec.item} ${i + 1}${has(it.zone) ? ' : ' + it.zone : ''}${has(it.localisation) ? ', ' + it.localisation : ''}`;
            ensure(22);
            doc.setFillColor(...TINT); doc.rect(ML, y, W, 7, 'F');
            doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(ML, y, ML, y + 7);
            font('bold', 9.4, NAVY); doc.text(clean(title), ML + 3, y + 4.8);
            y += 8.5;
            const desc = sec.fields.find((f) => f.k === 'description');
            if (desc && has(it.description)) para(it.description, { size: 9.6, indent: 2, gap: 1.5 });
            const rows = sec.fields
              .filter((f) => !['zone', 'localisation', 'description'].includes(f.k))
              .map((f) => [f.l, cell(f, it)]).filter((r) => has(r[1]));
            if (rows.length) kv(rows, { margin: { top: TOP, bottom: 297 - BOT, left: ML + 2, right: 210 - MR } });
            y += 2;
          });
          return;
        }
        const fields = sec.fields;
        const used = fields.filter((f) => items.some((it) => has(cell(f, it))));
        const headRow = (sec.numbered ? ['N°'] : []).concat(used.map((f) => f.l));
        const body = items.map((it, i) => (sec.numbered ? [String(i + 1)] : []).concat(used.map((f) => cell(f, it) || '')));
        const cs = {};
        used.forEach((f, i) => { if (f.main) cs[i + (sec.numbered ? 1 : 0)] = { cellWidth: 'auto' }; });
        if (sec.numbered) cs[0] = { cellWidth: 9, halign: 'center' };
        table(headRow, body, { columnStyles: cs, styles: Object.assign({}, tableOpts().styles, { fontSize: used.length > 5 ? 7.8 : 8.6 }) });
        return;
      }

      if (sec.kind === 'checklist') {
        const rows = (sec.items || []).map((label) => {
          const e = (pv.essais || {})[label] || {};
          return [label, e.statut || 'Non vérifié', e.obs || ''];
        }).filter((r) => r[1] !== 'Non vérifié' || has(r[2]));
        if (!rows.length) return;
        heading(sec.title);
        table(['Élément vérifié', 'État', 'Observation'], rows, {
          columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 24 } },
          didParseCell: (d) => {
            if (d.section === 'body' && d.column.index === 1) {
              if (d.cell.raw === 'Réserve') { d.cell.styles.textColor = [160, 30, 30]; d.cell.styles.fontStyle = 'bold'; }
            }
          }
        });
        return;
      }

      if (sec.kind === 'photos') {
        const list = (pv.photos || []).filter((p) => p.blob || p.ann);
        if (!list.length) return;
        heading(sec.title);
        const cw = (W - 6) / 2;
        for (let i = 0; i < list.length; i += 2) {
          const pair = list.slice(i, i + 2).map((p) => {
            const im = imgs['ph:' + p.id];
            let w = cw, h = cw * 0.72;
            if (im && im.w && im.h) { const r = im.h / im.w; h = Math.min(cw * r, 78); w = h / r; if (w > cw) { w = cw; h = w * r; } }
            font('bold', 8.4);
            const cap1 = doc.splitTextToSize(clean(`${labels[p.id]}${has(p.legende) ? ' : ' + p.legende : ''}`), cw);
            font('normal', 7.2);
            const meta = [p.zone, p.takenAt ? fmtStamp(p.takenAt) : '', (p.lat != null && p.lon != null) ? `GPS ${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}` : ''].filter(has).join(' • ');
            const cap2 = meta ? doc.splitTextToSize(clean(meta), cw) : [];
            return { p, im, w, h, cap1, cap2, total: h + 2 + cap1.length * 3.7 + cap2.length * 3.2 + 4 };
          });
          const rowH = Math.max(...pair.map((c) => c.total));
          ensure(rowH);
          pair.forEach((c, j) => {
            const x = ML + j * (cw + 6);
            if (c.im) {
              try { doc.addImage(c.im.data, c.im.fmt, x + (cw - c.w) / 2, y, c.w, c.h, undefined, 'FAST'); } catch (e) { placeholder(x, cw, c.h); }
              doc.setDrawColor(...LINE); doc.setLineWidth(0.1); doc.rect(x + (cw - c.w) / 2, y, c.w, c.h);
            } else placeholder(x, cw, c.h);
            let yy = y + c.h + 4;
            font('bold', 8.4); c.cap1.forEach((l) => { doc.text(l, x, yy); yy += 3.7; });
            font('normal', 7.2, GREY); c.cap2.forEach((l) => { doc.text(l, x, yy); yy += 3.2; });
          });
          y += rowH + 2;
        }
        return;
      }

      if (sec.kind === 'signatures') {
        const signers = parts.filter((p) => ['Présent', 'Représenté'].includes(p.statut || 'Présent'));
        const clo = T.sections.find((s) => s.key === 'cloture');
        const hasClo = clo && (has(F.mention));
        if (pv.type === 'presence') {
          if (hasClo) { ensure(14); y += 2; para(F.mention, { size: 9.5 }); }
          return;
        }
        heading(sec.title, Math.min(120, 45 + signers.length * 24));
        if (hasClo) para(F.mention, { size: 9.5 });
        if (F.date) para(`Fait à ${lieu}, le ${fmtLong(F.date)}.`, { size: 9.8, gap: 3 });
        if (!signers.length) return;
        table(['Nom', 'Qualité', 'Mention', 'Signature'], signers.map((p) => [
          p.nom || '', [p.qualite, p.represente ? 'pour ' + p.represente : ''].filter(has).join('\n'), sigText(p), ''
        ]), {
          columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold' }, 3: { cellWidth: 52, minCellHeight: 22 } },
          didDrawCell: sigDrawer(3, signers)
        });
      }
    });

    function sigText(p) {
      if (p.sigStatut === 'Signé' || p.sig) return p.sigAt ? `Signé le ${fmtStamp(p.sigAt)}` : 'Signé';
      if (p.sigStatut === 'Refus de signer') return `Refus de signer${has(p.sigMotif) ? ' : ' + p.sigMotif : ''}`;
      if (p.sigStatut === 'Signature différée') return 'Signature différée';
      return '';
    }
    function sigDrawer(col, rows, low) {
      return (d) => {
        if (d.section !== 'body' || d.column.index !== col) return;
        const p = rows[d.row.index]; if (!p) return;
        const im = imgs['sig:' + p.id];
        if (!im || !im.w) return;
        const r = im.h / im.w;
        const top = low ? 5 : 1.5;
        let h = Math.min(d.cell.height - top - 1.5, 18), w = h / r;
        if (w > d.cell.width - 4) { w = d.cell.width - 4; h = w * r; }
        const yy = low ? d.cell.y + top : d.cell.y + (d.cell.height - h) / 2;
        try { doc.addImage(im.data, im.fmt, d.cell.x + (d.cell.width - w) / 2, yy, w, h); } catch (e) { /* image illisible */ }
      };
    }
    function placeholder(x, w, h) {
      doc.setFillColor(...ALT); doc.rect(x, y, w, h, 'F');
      font('italic', 8, GREY); doc.text('Image non disponible', x + w / 2, y + h / 2, { align: 'center' });
    }

    /* ---------- En-tête, pied de page, filigrane ---------- */
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      const logo = imgs.logo;
      if (logo && logo.w) {
        const h = 13, w = Math.min(70, h * logo.w / logo.h);
        const hh = w * logo.h / logo.w;
        try { doc.addImage(logo.data, logo.fmt, 105 - w / 2, 9 + (13 - hh) / 2, w, hh); } catch (e) { /* logo illisible */ }
      } else {
        spaced('GAUER EXPERTISE', 12.5, 2.2, 17.5);
        spaced('BÂTIMENT', 6.8, 2.4, 22, 'normal', GREY);
      }
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.35); doc.line(ML, 25.5, MR, 25.5);

      doc.setLineWidth(0.3); doc.line(ML, 270, MR, 270);
      FOOT.forEach((t, k) => {
        let size = 7;
        font('normal', size, GREY);
        while (doc.getTextWidth(t) > W && size > 5) { size -= 0.2; doc.setFontSize(size); }
        doc.text(t, 105, 274.3 + k * 3.6, { align: 'center' });
      });
      if (stamp && stamp.hash) {
        font('normal', 6.2, GREY);
        doc.text(clean(`Empreinte SHA-256 du contenu, clôture du ${fmtStamp(stamp.closedAt)} : ${stamp.hash.toUpperCase()}`), 105, 285.3, { align: 'center' });
      }
      font('normal', 7.6, GREY);
      doc.text(`Page ${i} sur ${n}`, 105, 289.2, { align: 'center' });

      if (draft) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.07 }));
          font('bold', 92, NAVY);
          doc.text('PROJET', 105, 175, { align: 'center', angle: 35 });
          doc.restoreGraphicsState();
        } catch (e) { /* filigrane non supporté */ }
      }
    }
    return doc;
  }

  const API = { build, fileName, titreOf, slugOf, fmtLong, fmtShort, fmtStamp, isOn, photoLabels, itemFilled, has };
  g.PVPDF = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
