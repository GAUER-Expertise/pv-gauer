/* PV d'expertise GAUER : description des types de PV, partagée par l'application et le générateur PDF */
(function (g) {
  'use strict';

  const L = {
    qualites: [
      'Client',
      'Expert du Client (GAUER Expertise Bâtiment)',
      'Partie adverse',
      'Expert de la partie adverse',
      'Expert mandaté par un assureur',
      'Entreprise',
      'Sous-traitant',
      "Maître d'œuvre",
      'Constructeur / vendeur',
      "Maître d'ouvrage",
      'Syndic',
      'Avocat',
      'Courtier',
      'Sapiteur',
      'Occupant',
      'Autre'
    ],
    presence: ['Présent', 'Représenté', 'Absent', 'Excusé'],
    qualif: ['Structurel', 'Fonctionnel', 'Esthétique', 'À déterminer'],
    gravite: ['Faible', 'Moyenne', 'Élevée'],
    source: ['Constaté', 'Constaté contradictoirement', 'Déclaratif', "Hypothèse de l'expert"],
    evol: ['Évolutif', 'Stabilisé en apparence', 'Non déterminé'],
    meteo: ['Ensoleillé', 'Nuageux', 'Couvert', 'Pluie', 'Pluie récente', 'Neige', 'Gel', 'Vent fort', 'Canicule'],
    orientation: ['Verticale', 'Horizontale', 'Oblique', 'En escalier', 'En étoile', 'Multidirectionnelle', 'Sans objet'],
    ouiNon: ['Oui', 'Non', 'Non déterminé'],
    mesure: ['Humidité de surface', "Teneur en eau du bois", 'Ouverture de fissure', 'Température de surface', 'Température ambiante', 'Hygrométrie ambiante', 'Planéité', 'Aplomb', 'Niveau', 'Dimension', 'Autre'],
    materiel: ['Appareil photo', 'Fissuromètre', 'Jauges SAUGNAC G1', 'Humidimètre', 'Caméra thermique', 'Hygromètre d\'ambiance', 'Télémètre laser', 'Niveau', 'Règle', 'Mètre', 'Endoscope', 'Drone', 'Échelle'],
    cadre: ['Expertise amiable contradictoire', 'Réunion technique', 'Réunion de conciliation', 'Autre'],
    convocation: ['Courrier recommandé', 'Courriel', 'Courrier simple', 'Téléphone', 'Sans convocation'],
    accord: ['Accord', 'Désaccord'],
    natureRec: ['Pré-livraison', 'Réception', 'Levée des réserves'],
    contrat: ['CCMI', 'VEFA', 'Marché de travaux privé', "Contrat d'entreprise", 'Autre'],
    natureRes: ['Non-conformité', 'Malfaçon', 'Non-finition', 'Dégradation', "Défaut d'aspect", 'Manquement documentaire'],
    etatRes: ['Non levée', 'Levée', 'Partiellement levée'],
    decision: ['Sans objet (pré-livraison)', 'Réception prononcée sans réserve', 'Réception prononcée avec réserves', 'Réception refusée', 'Réception différée'],
    essai: ['Non vérifié', 'Conforme', 'Réserve', 'Sans objet'],
    sig: ['Signé', 'Refus de signer', 'Signature différée']
  };

  const ESSAIS = [
    'Alimentation eau froide et eau chaude', 'Évacuations (eaux usées, eaux vannes)', 'Appareils sanitaires',
    "Production d'eau chaude", 'Chauffage', 'Ventilation (VMC)', 'Tableau électrique et protections',
    'Prises, interrupteurs et éclairages', 'Menuiseries extérieures', 'Occultations (volets)', 'Portes intérieures',
    'Sols et revêtements', 'Murs et plafonds', 'Faïences et carrelages', 'Cuisine équipée', 'Escalier et garde-corps',
    'Isolation des combles (visuel)', 'Toiture et zinguerie (visuel)', 'Façades', 'Évacuation des eaux pluviales',
    'Garage', 'Abords, VRD et clôtures'
  ];

  const seance = (extra) => [
    { k: 'date', l: 'Date', t: 'date' },
    { k: 'heureDebut', l: 'Heure de début', t: 'time' },
    { k: 'heureFin', l: 'Heure de fin', t: 'time' },
    { k: 'adresse', l: 'Adresse du bien', t: 'text', w: 2 },
    { k: 'ville', l: 'Commune', t: 'text' },
    { k: 'meteo', l: 'Conditions météo', t: 'select', o: L.meteo },
    { k: 'temperature', l: 'Température extérieure (°C)', t: 'text', im: 'decimal' },
    { k: 'hygrometrie', l: 'Hygrométrie (%)', t: 'text', im: 'decimal' },
    { k: 'acces', l: "Conditions d'accès", t: 'text', w: 2 },
    { k: 'nonVisite', l: 'Zones non accessibles ou non visitées', t: 'textarea', w: 3 }
  ].concat(extra || []);

  const constatFields = (src) => [
    { k: 'zone', l: 'Zone', t: 'text' },
    { k: 'localisation', l: 'Localisation précise', t: 'text' },
    { k: 'description', l: 'Description', t: 'textarea', w: 3, main: true },
    { k: 'mesures', l: 'Mesures relevées', t: 'text', w: 2 },
    { k: 'qualification', l: 'Qualification', t: 'select', o: L.qualif },
    { k: 'gravite', l: 'Gravité', t: 'select', o: L.gravite },
    { k: 'source', l: 'Nature de l\'information', t: 'select', o: L.source, d: src },
    { k: 'observations', l: 'Observations des parties', t: 'textarea', w: 3 },
    { k: 'photos', l: 'Photos', t: 'photorefs', w: 3 }
  ];

  const TYPES = {
    contradictoire: {
      label: 'Réunion contradictoire',
      short: 'Contradictoire',
      titre: "RÉUNION D'EXPERTISE AMIABLE CONTRADICTOIRE",
      slug: 'reunion-contradictoire',
      sections: [
        { key: 'seance', title: 'Séance', kind: 'fields', fields: seance([
          { k: 'cadre', l: 'Cadre de la réunion', t: 'select', o: L.cadre, d: 'Expertise amiable contradictoire' },
          { k: 'convoquePar', l: 'Convoquée par', t: 'text' },
          { k: 'dateConvocation', l: 'Date de la convocation', t: 'date' },
          { k: 'modeConvocation', l: 'Mode de convocation', t: 'select', o: L.convocation },
          { k: 'objet', l: 'Objet de la réunion', t: 'textarea', w: 3, role: 'objet' }
        ]) },
        { key: 'participants', title: 'Participants', kind: 'participants' },
        { key: 'pieces', title: 'Pièces remises en séance', kind: 'list', item: 'Pièce', pdf: 'table', fields: [
          { k: 'designation', l: 'Désignation', t: 'text', w: 2, main: true },
          { k: 'remisPar', l: 'Remise par', t: 'text' },
          { k: 'pages', l: 'Nombre de pages', t: 'text', im: 'numeric' },
          { k: 'observation', l: 'Observation', t: 'text', w: 2 }
        ] },
        { key: 'contexte', title: 'Rappel des faits', kind: 'fields', fields: [
          { k: 'rappelFaits', l: 'Rappel des faits (déclaratif du Client)', t: 'textarea', w: 3 },
          { k: 'historique', l: 'Chronologie et interventions antérieures (déclaratif)', t: 'textarea', w: 3 }
        ] },
        { key: 'dires', title: 'Dires et réserves des parties', kind: 'list', item: 'Dire', pdf: 'table', optional: true, defaultOn: true,
          emptyText: "Aucun dire n'a été formulé en séance.", confirmEmpty: true, fields: [
          { k: 'participant', l: 'Partie', t: 'participant' },
          { k: 'texte', l: 'Dire ou réserve', t: 'textarea', w: 3, main: true }
        ] },
        { key: 'constats', title: 'Constatations contradictoires', kind: 'list', item: 'Constatation', pdf: 'cards', fields: constatFields('Constaté contradictoirement') },
        { key: 'accords', title: 'Accords et désaccords', kind: 'list', item: 'Point', pdf: 'table', optional: true, fields: [
          { k: 'type', l: 'Accord ou désaccord', t: 'select', o: L.accord },
          { k: 'sujet', l: 'Sujet', t: 'text', w: 2, main: true },
          { k: 'positions', l: 'Positions des parties', t: 'textarea', w: 3 }
        ] },
        { key: 'investigations', title: 'Investigations décidées', kind: 'list', item: 'Investigation', pdf: 'table', optional: true, fields: [
          { k: 'action', l: 'Investigation, sondage ou essai', t: 'textarea', w: 3, main: true },
          { k: 'intervenant', l: 'Réalisée par', t: 'text' },
          { k: 'frais', l: 'Frais à la charge de', t: 'text' },
          { k: 'delai', l: 'Délai ou date', t: 'text' }
        ] },
        { key: 'piecesDemandees', title: 'Pièces à communiquer', kind: 'list', item: 'Pièce', pdf: 'table', optional: true, fields: [
          { k: 'piece', l: 'Pièce', t: 'text', w: 2, main: true },
          { k: 'fournisseur', l: 'À fournir par', t: 'text' },
          { k: 'destinataire', l: 'À adresser à', t: 'text' },
          { k: 'delai', l: 'Délai', t: 'text' }
        ] },
        { key: 'photos', title: 'Photos et croquis', kind: 'photos' },
        { key: 'suite', title: 'Suite donnée', kind: 'fields', fields: [
          { k: 'prochaineEtape', l: 'Prochaine étape', t: 'textarea', w: 3 },
          { k: 'reunionDate', l: 'Prochaine réunion, date', t: 'date' },
          { k: 'reunionHeure', l: 'Heure', t: 'time' },
          { k: 'reunionLieu', l: 'Lieu', t: 'text' },
          { k: 'diffusion', l: 'Diffusion du procès-verbal', t: 'textarea', w: 3 },
          { k: 'observationsLibres', l: 'Observations', t: 'textarea', w: 3 }
        ] },
        { key: 'cloture', title: 'Clôture', kind: 'fields', fields: [
          { k: 'mention', l: 'Mention de clôture', t: 'textarea', w: 3, d: "Le présent procès-verbal relate le déroulement de la réunion et les constatations faites en présence des participants. Il ne préjuge pas de l'analyse ni des conclusions du rapport d'expertise. Les participants peuvent adresser leurs observations écrites sur le présent procès-verbal dans un délai de 15 jours." },
          { k: 'faitA', l: 'Fait à', t: 'text' }
        ] },
        { key: 'signatures', title: 'Signatures', kind: 'signatures' }
      ]
    },

    constat: {
      label: 'Constat sur site',
      short: 'Constat',
      titre: 'CONSTAT SUR SITE',
      slug: 'constat',
      sections: [
        { key: 'seance', title: 'Visite', kind: 'fields', fields: seance([
          { k: 'objet', l: 'Objet de la visite', t: 'textarea', w: 3, role: 'objet' }
        ]) },
        { key: 'participants', title: 'Personnes présentes', kind: 'participants' },
        { key: 'materiel', title: 'Matériel utilisé', kind: 'fields', fields: [
          { k: 'materiel', l: 'Matériel', t: 'checks', o: L.materiel, w: 3 },
          { k: 'appareils', l: 'Références des appareils de mesure', t: 'text', w: 3 }
        ] },
        { key: 'declaratif', title: 'Déclaratif du Client', kind: 'fields', fields: [
          { k: 'declaratif', l: 'Déclaratif du Client', t: 'textarea', w: 3 },
          { k: 'apparition', l: "Date d'apparition déclarée", t: 'text' },
          { k: 'evolution', l: 'Évolution déclarée', t: 'text', w: 2 },
          { k: 'travaux', l: 'Travaux et interventions antérieurs déclarés', t: 'textarea', w: 3 }
        ] },
        { key: 'desordres', title: 'Désordres constatés', kind: 'list', item: 'Désordre', pdf: 'cards', fields: [
          { k: 'zone', l: 'Zone', t: 'text' },
          { k: 'localisation', l: 'Localisation précise', t: 'text' },
          { k: 'description', l: 'Description', t: 'textarea', w: 3, main: true },
          { k: 'longueur', l: 'Longueur', t: 'text' },
          { k: 'ouverture', l: 'Ouverture (mm)', t: 'text', im: 'decimal' },
          { k: 'orientation', l: 'Orientation', t: 'select', o: L.orientation },
          { k: 'traversante', l: 'Traversante', t: 'select', o: L.ouiNon },
          { k: 'qualification', l: 'Qualification', t: 'select', o: L.qualif },
          { k: 'gravite', l: 'Gravité', t: 'select', o: L.gravite },
          { k: 'evolutivite', l: 'Évolutivité', t: 'select', o: L.evol },
          { k: 'source', l: "Nature de l'information", t: 'select', o: L.source, d: 'Constaté' },
          { k: 'photos', l: 'Photos', t: 'photorefs', w: 3 }
        ] },
        { key: 'releves', title: 'Relevés de mesures', kind: 'list', item: 'Relevé', pdf: 'table', optional: true, fields: [
          { k: 'point', l: 'Point de mesure', t: 'text', main: true },
          { k: 'typeMesure', l: 'Type de mesure', t: 'select', o: L.mesure },
          { k: 'valeur', l: 'Valeur', t: 'text', im: 'decimal' },
          { k: 'unite', l: 'Unité', t: 'text' },
          { k: 'appareil', l: 'Appareil', t: 'text' },
          { k: 'observation', l: 'Observation', t: 'text', w: 2 }
        ] },
        { key: 'jauges', title: 'Jauges de fissuration SAUGNAC G1', kind: 'list', item: 'Jauge', pdf: 'table', optional: true, fields: [
          { k: 'numero', l: 'N° de jauge (QR code)', t: 'text', main: true },
          { k: 'emplacement', l: 'Emplacement', t: 'text', w: 2 },
          { k: 'fissure', l: 'Fissure suivie', t: 'text' },
          { k: 'lecture', l: 'Lecture initiale', t: 'text' },
          { k: 'datePose', l: 'Date de pose', t: 'date' },
          { k: 'photos', l: 'Photos', t: 'photorefs', w: 3 }
        ] },
        { key: 'environnement', title: 'Environnement du bien', kind: 'fields', optional: true, fields: [
          { k: 'vegetation', l: 'Végétation proche (essences, distances)', t: 'textarea', w: 3 },
          { k: 'eauxPluviales', l: 'Gestion des eaux pluviales', t: 'textarea', w: 3 },
          { k: 'terrain', l: 'Pente et configuration du terrain', t: 'text', w: 3 },
          { k: 'mitoyennete', l: 'Mitoyenneté et constructions voisines', t: 'text', w: 3 },
          { k: 'sol', l: 'Nature du sol (déclarée ou documentée)', t: 'text', w: 3 },
          { k: 'autres', l: 'Autres éléments', t: 'textarea', w: 3 }
        ] },
        { key: 'photos', title: 'Photos et croquis', kind: 'photos' },
        { key: 'suite', title: 'Suite donnée', kind: 'fields', fields: [
          { k: 'piecesADemander', l: 'Pièces à demander', t: 'textarea', w: 3 },
          { k: 'investigations', l: 'Investigations à prévoir', t: 'textarea', w: 3 },
          { k: 'prochaineVisite', l: 'Prochaine visite ou relevé de jauges', t: 'text', w: 3 },
          { k: 'observationsLibres', l: 'Observations', t: 'textarea', w: 3 }
        ] },
        { key: 'cloture', title: 'Clôture', kind: 'fields', fields: [
          { k: 'mention', l: 'Mention de clôture', t: 'textarea', w: 3, d: "Les constatations ci-dessus ont été faites visuellement à la date de la visite, sans sondage destructif sauf mention contraire. Elles ne préjugent pas de l'analyse ni des conclusions du rapport d'expertise." },
          { k: 'faitA', l: 'Fait à', t: 'text' }
        ] },
        { key: 'signatures', title: 'Signatures', kind: 'signatures' }
      ]
    },

    reception: {
      label: 'Pré-livraison / réception',
      short: 'Réception',
      titre: 'OPÉRATIONS DE RÉCEPTION',
      titreBy: { 'Pré-livraison': 'VISITE DE PRÉ-LIVRAISON', 'Réception': 'OPÉRATIONS DE RÉCEPTION', 'Levée des réserves': 'LEVÉE DES RÉSERVES' },
      slug: 'reception',
      slugBy: { 'Pré-livraison': 'pre-livraison', 'Réception': 'reception', 'Levée des réserves': 'levee-des-reserves' },
      sections: [
        { key: 'seance', title: 'Séance', kind: 'fields', fields: seance([
          { k: 'nature', l: 'Nature des opérations', t: 'select', o: L.natureRec, d: 'Pré-livraison', role: 'nature' },
          { k: 'contrat', l: 'Type de contrat', t: 'select', o: L.contrat },
          { k: 'maitreOuvrage', l: "Maître d'ouvrage", t: 'text' },
          { k: 'constructeur', l: 'Constructeur ou vendeur', t: 'text' },
          { k: 'maitreOeuvre', l: "Maître d'œuvre", t: 'text' },
          { k: 'dateAchevement', l: "Date d'achèvement annoncée", t: 'date' },
          { k: 'dateRemiseCles', l: 'Date de remise des clés', t: 'date' },
          { k: 'objet', l: 'Ouvrage concerné', t: 'textarea', w: 3, role: 'objet' }
        ]) },
        { key: 'participants', title: 'Participants', kind: 'participants' },
        { key: 'entreprises', title: 'Entreprises', kind: 'list', item: 'Entreprise', pdf: 'table', fields: [
          { k: 'nom', l: 'Entreprise', t: 'text', main: true },
          { k: 'lot', l: 'Lot', t: 'text' },
          { k: 'representant', l: 'Représentant', t: 'text' },
          { k: 'presence', l: 'Présence', t: 'select', o: L.presence }
        ] },
        { key: 'essais', title: "Check-list d'essais et vérifications", kind: 'checklist', optional: true, items: ESSAIS },
        { key: 'reserves', title: 'Réserves', kind: 'list', item: 'Réserve', pdf: 'table', numbered: true, fields: [
          { k: 'lot', l: 'Lot ou entreprise', t: 'text' },
          { k: 'localisation', l: 'Pièce ou localisation', t: 'text' },
          { k: 'description', l: 'Description', t: 'textarea', w: 3, main: true },
          { k: 'nature', l: 'Nature', t: 'select', o: L.natureRes },
          { k: 'gravite', l: 'Gravité', t: 'select', o: L.gravite },
          { k: 'delai', l: 'Délai de levée', t: 'text' },
          { k: 'etat', l: 'État', t: 'select', o: L.etatRes, d: 'Non levée' },
          { k: 'photos', l: 'Photos', t: 'photorefs', w: 3 }
        ] },
        { key: 'compteurs', title: 'Compteurs, clés et documents', kind: 'fields', optional: true, fields: [
          { k: 'indexEau', l: 'Index eau', t: 'text', im: 'decimal' },
          { k: 'indexElec', l: 'Index électricité', t: 'text', im: 'decimal' },
          { k: 'indexGaz', l: 'Index gaz', t: 'text', im: 'decimal' },
          { k: 'cles', l: 'Clés et badges remis', t: 'textarea', w: 3 },
          { k: 'documents', l: 'Documents remis (notices, attestations, DOE)', t: 'textarea', w: 3 }
        ] },
        { key: 'photos', title: 'Photos et croquis', kind: 'photos' },
        { key: 'decision', title: 'Décision', kind: 'fields', fields: [
          { k: 'decision', l: 'Décision du maître d\'ouvrage', t: 'select', o: L.decision, w: 2 },
          { k: 'dateEffet', l: "Date d'effet", t: 'date' },
          { k: 'motif', l: 'Motif du refus ou du report', t: 'textarea', w: 3 },
          { k: 'consignation', l: 'Retenue ou consignation convenue', t: 'text', w: 3 },
          { k: 'observationsLibres', l: 'Observations', t: 'textarea', w: 3 }
        ] },
        { key: 'cloture', title: 'Clôture', kind: 'fields', fields: [
          { k: 'mention', l: 'Mention de clôture', t: 'textarea', w: 3, d: "La réception est un acte du maître d'ouvrage. GAUER Expertise Bâtiment assiste le Client lors des opérations et ne prononce pas la réception." },
          { k: 'faitA', l: 'Fait à', t: 'text' }
        ] },
        { key: 'signatures', title: 'Signatures', kind: 'signatures' }
      ]
    },

    presence: {
      label: 'Feuille de présence',
      short: 'Présence',
      titre: 'FEUILLE DE PRÉSENCE',
      slug: 'feuille-de-presence',
      sections: [
        { key: 'seance', title: 'Réunion', kind: 'fields', fields: [
          { k: 'date', l: 'Date', t: 'date' },
          { k: 'heureDebut', l: 'Heure de début', t: 'time' },
          { k: 'adresse', l: 'Adresse', t: 'text', w: 2 },
          { k: 'ville', l: 'Commune', t: 'text' },
          { k: 'objet', l: 'Objet de la réunion', t: 'textarea', w: 3, role: 'objet' }
        ] },
        { key: 'participants', title: 'Participants', kind: 'participants' },
        { key: 'consentement', title: 'Accord sur la prise de notes', kind: 'fields', optional: true, consent: true, fields: [
          { k: 'outil', l: 'Outil utilisé (prise de notes ou transcription)', t: 'text', w: 3 },
          { k: 'mentionAccord', l: 'Mention', t: 'textarea', w: 3, d: "Chaque participant indique ci-dessus s'il accepte l'utilisation d'un outil de prise de notes ou de transcription pendant la réunion. Les notes servent uniquement à la rédaction du procès-verbal." }
        ] },
        { key: 'cloture', title: 'Clôture', kind: 'fields', fields: [
          { k: 'mention', l: 'Mention de clôture', t: 'textarea', w: 3, d: 'Les personnes ci-dessus attestent de leur présence à la réunion.' },
          { k: 'faitA', l: 'Fait à', t: 'text' }
        ] },
        { key: 'signatures', title: 'Signatures', kind: 'signatures' }
      ]
    }
  };

  const PARTICIPANT_FIELDS = [
    { k: 'nom', l: 'Nom et prénom', t: 'text', main: true },
    { k: 'qualite', l: 'Qualité', t: 'select', o: L.qualites },
    { k: 'represente', l: 'Représente ou pour le compte de', t: 'text' },
    { k: 'societe', l: 'Société ou cabinet', t: 'text' },
    { k: 'tel', l: 'Téléphone', t: 'tel' },
    { k: 'mail', l: 'Courriel', t: 'email' },
    { k: 'statut', l: 'Présence', t: 'select', o: L.presence, d: 'Présent' },
    { k: 'arrivee', l: 'Arrivée', t: 'time' },
    { k: 'depart', l: 'Départ', t: 'time' }
  ];

  const INTERVENANT_FIELDS = [
    { k: 'nom', l: 'Nom et prénom', t: 'text', main: true },
    { k: 'qualite', l: 'Qualité', t: 'select', o: L.qualites },
    { k: 'convoque', l: 'À convoquer', t: 'select', o: ['Oui', 'Non'], d: 'Oui' },
    { k: 'represente', l: 'Représente ou pour le compte de', t: 'text' },
    { k: 'societe', l: 'Société ou cabinet', t: 'text' },
    { k: 'tel', l: 'Téléphone', t: 'tel' },
    { k: 'adresse', l: 'Adresse postale', t: 'text', w: 2 },
    { k: 'mail', l: 'Courriel', t: 'email' },
    { k: 'notes', l: 'Notes', t: 'text', w: 3 }
  ];

  const MISSIONS = [
    'Recherche de cause et analyse des désordres', 'Expertise fissures', 'Humidité et infiltrations', 'Recherche de fuite',
    'Contre-expertise', 'Expertise amiable contradictoire', 'Assistance en litige', 'CCMI', 'VEFA',
    'Audit avant achat', 'Réception et pré-livraison', 'Vice caché', 'Malfaçon', 'Suivi de chantier'
  ];
  const QUALITES_CLIENT = ['Particulier', 'Professionnel', 'Syndic', 'Profession juridique', 'Courtier'];

  const API = { L, TYPES, ESSAIS, PARTICIPANT_FIELDS, INTERVENANT_FIELDS, MISSIONS, QUALITES_CLIENT };
  g.PVSCHEMA = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
