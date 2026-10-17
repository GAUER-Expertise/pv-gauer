/* Lecture du fichier « Suivi dossiers GAUER Expertise.xlsx » : dossiers et intervenants */
(function (g) {
  'use strict';
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const txt = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const ONGLETS = { actifs: 'Actif', clos: 'Clos', sansreponse: 'Sans réponse' };

  // En-têtes reconnus (comparés sans accents, espaces ni ponctuation)
  const DOSSIER_COLS = {
    ref: ['ndossier', 'nodossier', 'numerodossier', 'numerodedossier', 'dossiern', 'reference', 'refdossier', 'ref'],
    client: ['client', 'nomclient', 'clientnom'],
    tel: ['telephone', 'tel', 'telclient', 'telephoneclient', 'portable'],
    mail: ['email', 'mail', 'courriel', 'emailclient', 'adressemail'],
    adresse: ['adressebienconcerne', 'adressedubien', 'adressebien', 'adresse', 'lieu'],
    typeMission: ['typedemissiondesordre', 'typedemission', 'typemission', 'mission', 'typedexpertise'],
    dateVisite: ['datevisiteexpertise', 'datevisite', 'datedevisite'],
    prochaineAction: ['prochaineaction'],
    notesSuivi: ['notes', 'note', 'observations']
  };
  const INTER_COLS = {
    ref: DOSSIER_COLS.ref.concat(['dossier']),
    nom: ['nom', 'nometprenom', 'nomprenom', 'personne', 'intervenant'],
    qualite: ['qualite', 'role', 'fonction'],
    represente: ['represente', 'representepourlecomptede', 'pourlecomptede', 'mandant'],
    societe: ['societe', 'societeoucabinet', 'cabinet', 'entreprise'],
    adresse: ['adresse', 'adressepostale'],
    tel: ['telephone', 'tel', 'portable'],
    mail: ['email', 'mail', 'courriel'],
    convoque: ['aconvoquer', 'convoque', 'convocation'],
    notes: ['notes', 'note', 'observations']
  };

  function findHeader(rows, needles) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cells = (rows[i] || []).map(norm);
      if (needles.every((n) => cells.some((c) => c === n || c.startsWith(n)))) return i;
    }
    return -1;
  }
  function mapCols(header, spec) {
    const cells = header.map(norm);
    const map = {};
    Object.entries(spec).forEach(([k, names]) => {
      for (const n of names) { const i = cells.indexOf(n); if (i >= 0 && !Object.values(map).includes(i)) { map[k] = i; return; } }
    });
    return map;
  }
  function splitAdresse(a) {
    const m = txt(a).match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
    return m ? { adresse: m[1].replace(/[,\s]+$/, ''), cp: m[2], ville: m[3] } : { adresse: txt(a) };
  }

  function parse(XLSX, data) {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const out = { dossiers: [], intervenants: [], sheets: [], warnings: [] };
    wb.SheetNames.forEach((name) => {
      const key = norm(name);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
      if (ONGLETS[key]) {
        const h = findHeader(rows, ['client']);
        if (h < 0) { out.warnings.push(`Onglet « ${name} » : ligne d'en-tête introuvable.`); return; }
        const c = mapCols(rows[h], DOSSIER_COLS);
        if (c.ref == null) { out.warnings.push(`Onglet « ${name} » : colonne du numéro de dossier introuvable.`); return; }
        let n = 0;
        rows.slice(h + 1).forEach((r) => {
          const get = (k) => (c[k] == null ? '' : txt(r[c[k]]));
          const ref = get('ref'), client = get('client');
          if (!ref && !client) return;
          if (!ref) { out.warnings.push(`Onglet « ${name} » : dossier « ${client} » sans numéro, ignoré.`); return; }
          const ad = splitAdresse(get('adresse'));
          out.dossiers.push({ ref, client, tel: get('tel'), mail: get('mail'), adresse: ad.adresse, cp: ad.cp || '', ville: ad.ville || '', typeMission: get('typeMission'), notesSuivi: get('notesSuivi'), prochaineAction: get('prochaineAction'), dateVisite: get('dateVisite'), etat: ONGLETS[key] });
          n++;
        });
        out.sheets.push(`${name} : ${n} dossier(s)`);
      } else if (key.startsWith('intervenant') || key.startsWith('contact') || key.startsWith('convoque')) {
        const h = findHeader(rows, ['nom']);
        if (h < 0) { out.warnings.push(`Onglet « ${name} » : ligne d'en-tête introuvable.`); return; }
        const c = mapCols(rows[h], INTER_COLS);
        let n = 0;
        rows.slice(h + 1).forEach((r) => {
          const get = (k) => (c[k] == null ? '' : txt(r[c[k]]));
          const ref = get('ref'), nom = get('nom');
          if (!ref || !nom) return;
          out.intervenants.push({ ref, nom, qualite: get('qualite'), represente: get('represente'), societe: get('societe'), adresse: get('adresse'), tel: get('tel'), mail: get('mail'), convoque: get('convoque') || 'Oui', notes: get('notes') });
          n++;
        });
        out.sheets.push(`${name} : ${n} intervenant(s)`);
      }
    });
    return out;
  }

  const API = { parse, norm };
  g.PVEXCEL = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
