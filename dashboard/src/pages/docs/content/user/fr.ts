import type { UserDoc } from './types'

const fr: UserDoc = {
  sections: {
    getting_started: {
      title: 'Premiers pas',
      items: {
        what: {
          heading: 'Qu\'est-ce que Pastegate ?',
          text: 'Pastegate est une extension de navigateur qui empêche que des données sensibles (mots de passe, API keys, numéros de carte bancaire, documents personnels) soient collées par erreur dans des sites externes. Elle fonctionne en arrière-plan, analyse automatiquement le presse-papiers à chaque collage et avertit l\'utilisateur avant toute insertion.',
        },
        detection: {
          heading: 'Comment fonctionne la détection ?',
          text: 'Pastegate utilise plus de 80 règles basées sur des motifs (expressions régulières), exécutées localement dans le navigateur. Aucun texte en clair ne quitte le poste. Seules des métadonnées anonymisées sont transmises au serveur : règle et niveau de gravité, action effectuée, domaine (p. ex. claude.ai) et un hash SHA-256 de l\'URL complète.',
        },
        severity: {
          heading: 'Niveaux de gravité',
          text: 'Critique : clés AWS/GCP/Azure, clés privées, mots de passe en clair\nÉlevé : tokens GitHub/GitLab, JWT, API keys génériques\nMoyen : adresses e-mail, IBAN, numéros de carte bancaire\nFaible : contenu potentiellement sensible (détection heuristique)',
        },
        language: {
          heading: 'Langue de l\'extension',
          text: 'L\'extension utilise la langue de l\'organisation définie par vos administrateurs. Les utilisateurs peuvent à tout moment basculer entre la langue de l\'organisation et l\'anglais dans la fenêtre de l\'extension.',
        },
      },
    },
    admin: {
      title: 'Manuel administrateur',
      items: {
        install: {
          heading: 'Installation',
          text: 'Pastegate s\'installe avec un seul script. Celui-ci met en place automatiquement PostgreSQL, le backend FastAPI, le dashboard React et nginx.',
          code: 'sudo bash install.sh',
        },
        org_language: {
          heading: 'Langue de l\'organisation',
          text: 'La langue de l\'organisation est choisie dans l\'assistant de configuration et peut être modifiée ensuite sous **Paramètres → Langue de l\'organisation**. Elle s\'applique par défaut au dashboard et à toutes les extensions déployées.\n\nLes extensions déployées prennent en compte la modification automatiquement lors de la prochaine récupération de leur configuration (`GET /api/v1/config`, champ `default_lang`) — inutile de recréer ou de redéployer le paquet. Les utilisateurs peuvent toujours basculer entre la langue de l\'organisation et l\'anglais dans la fenêtre de l\'extension.',
        },
        build: {
          heading: 'Générer le paquet de l\'extension',
          text: 'Sous **Créer l\'extension**, sélectionnez une API key de base, la langue (par défaut : langue de l\'organisation) et l\'URL du serveur. Le ZIP généré contient l\'extension avec l\'URL du serveur et une clé déjà intégrées — les utilisateurs n\'ont rien à configurer.\n\nChaque génération crée une nouvelle clé de déploiement rattachée à la clé de base sélectionnée. Lors d\'un nouveau déploiement, vous pouvez révoquer en même temps les anciennes clés de déploiement de cette clé de base ; les extensions qui utilisent encore ces clés cessent alors de remonter des événements.',
        },
        mdm: {
          heading: 'Déploiement MDM (Intune, Jamf, GPO)',
          text: '1. Forcer l\'installation de l\'extension via une Chrome policy (ExtensionInstallForcelist ou ExtensionSettings)\n2. Facultatif : fournir `server_url`, `api_key` et `lang` (de, en, fr, es) comme configuration gérée de l\'extension\n3. Affecter la policy aux groupes d\'appareils cibles\n\nDétails : voir le guide MDM dans le dashboard.',
        },
        api_keys: {
          heading: 'Gérer les API keys',
          text: 'Recommandation : une clé de base par service ou par site. Les clés de déploiement créées par le générateur d\'extension sont regroupées sous leur clé de base. En cas de compromission, révoquez la clé de base : toutes ses clés de déploiement sont révoquées avec elle, sans impact sur les autres groupes.\n\nLes clés sont stockées uniquement sous forme de hash HMAC-SHA256 — la clé en clair n\'est visible qu\'une seule fois, à sa création.',
        },
        users: {
          heading: 'Créer des utilisateurs',
          text: 'Créez de nouveaux comptes sous **Utilisateurs → Créer un utilisateur**. Choisissez le rôle avec soin — itsec et infosec ont accès à tous les détails des événements. Recommandation : activer la 2FA pour tous les rôles privilégiés.',
        },
      },
    },
    itsec: {
      title: 'Manuel sécurité informatique',
      items: {
        events: {
          heading: 'Analyse des événements',
          text: 'Sous **Événements**, tous les collages sont listés par ordre chronologique. Vous pouvez filtrer par action (blocked, blocked_hard, allowed) et par gravité ; la colonne « App / Host » indique le domaine cible. Soyez particulièrement attentif à `action=allowed` : l\'utilisateur a délibérément ignoré l\'avertissement.',
        },
        domain_rules: {
          heading: 'Règles de domaine',
          text: 'Sous **Règles de domaine**, chaque domaine peut être placé dans l\'un des trois modes suivants :\n\n• warn : un avertissement s\'affiche, l\'utilisateur peut quand même coller (par défaut)\n• hard_block : un avertissement s\'affiche, aucun contournement possible (p. ex. ChatGPT, Pastebin)\n• allow : aucune analyse, aucun avertissement (outils internes comme Jira ou Confluence)\n\nJokers : `*.chatgpt.com` couvre tous les sous-domaines.',
        },
        identity: {
          heading: 'Afficher les identités',
          text: 'Pour tous les rôles, événements et appareils n\'apparaissent que sous forme de hash d\'appareil. Les utilisateurs itsec et infosec peuvent utiliser « Afficher l\'identité » sous **Appareils** ou **Événements** pour voir à qui appartient un appareil (e-mail du profil ou identité définie par MDM, extension 2.1 ou ultérieure).\n\nAucune demande n\'est nécessaire, mais chaque consultation est consignée dans le journal d\'audit avec nom d\'utilisateur, appareil, heure et IP, et reste visible par la protection des données.',
        },
        incident: {
          heading: 'Réponse à incident',
          text: 'En cas de suspicion de fuite de données :\n1. Filtrer les événements sur action=allowed\n2. Traiter en priorité la gravité « critique »\n3. Identifier l\'appareil concerné via « Afficher l\'identité »\n4. Exporter le journal d\'audit pour la documentation (CSV via Rapports RGPD)',
        },
      },
    },
    management: {
      title: 'Manuel direction',
      items: {
        risk: {
          heading: 'Comprendre la carte des risques',
          text: 'Le score de risque (0–100) agrège tous les événements selon leur gravité. Les événements critiques comptent 4 fois, les événements élevés 2 fois. Un score supérieur à 70 nécessite l\'attention de l\'équipe sécurité.',
        },
        trend: {
          heading: 'Interpréter la tendance mensuelle',
          text: 'Une hausse des événements peut signifier deux choses :\n• davantage de tentatives de coller des données sensibles (négatif)\n• une meilleure sensibilisation après des formations (positif, car les utilisateurs sont avertis)\n\nLue avec le taux d\'action=allowed, la tendance devient nettement plus parlante.',
        },
      },
    },
    dataprivacy: {
      title: 'Manuel protection des données',
      items: {
        gdpr: {
          heading: 'Conformité RGPD',
          text: 'Pastegate ne stocke jamais le contenu collé. Les hashes d\'appareil sont des valeurs HMAC-SHA256 avec un sel côté serveur, irréversibles sans celui-ci. L\'identité de l\'appareil (e-mail) n\'est stockée que chiffrée en AES-GCM et seuls itsec/infosec peuvent la lire. Les URL sont stockées sous forme de hash SHA-256 ; seul le domaine reste en clair pour le tri. Aucun extrait.',
        },
        audit: {
          heading: 'Journal d\'audit',
          text: 'Le journal d\'audit consigne avec le nom d\'utilisateur toutes les actions pertinentes pour la sécurité, notamment :\n• chaque consultation d\'identité (qui a consulté l\'identité de quel appareil, et quand)\n• les connexions\n\nLe journal est inaltérable et exportable en CSV.',
        },
        access: {
          heading: 'Droit d\'accès (art. 15 RGPD)',
          text: 'Sur demande, tous les événements d\'un appareil donné peuvent être identifiés via son hash. Seuls itsec/infosec voient à quelle personne appartient un hash ; chaque consultation est consignée dans le journal d\'audit.',
        },
        erasure: {
          heading: 'Droit à l\'effacement (art. 17 RGPD)',
          text: 'Pastegate est un système d\'audit de sécurité. Les événements sont supprimés automatiquement à l\'issue de la durée de conservation configurée (par défaut : 90 jours). Les appareils dont l\'extension ne s\'est pas manifestée depuis 30 jours sont entièrement supprimés, avec tous leurs événements et l\'identité chiffrée (`DEVICE_RETENTION_DAYS`, 0 = désactivé). La vérification s\'exécute au démarrage puis toutes les 6 heures. La suppression manuelle immédiate d\'événements individuels n\'est volontairement pas prévue, car elle compromettrait l\'intégrité de la piste d\'audit.',
        },
      },
    },
  },
}

export default fr
