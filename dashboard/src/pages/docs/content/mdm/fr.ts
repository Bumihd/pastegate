import type { MdmDoc } from './types'

const fr: MdmDoc = {
  intro: 'Comment déployer l\'extension Pastegate de manière centralisée avec un outil MDM. Les utilisateurs n\'ont rien à configurer — tout est géré de façon centralisée.',
  step1: {
    title: 'Étape 1 – Générer le paquet de l\'extension',
    lead: 'Dans le dashboard, sous **Créer l\'extension** :',
    steps: [
      'Sélectionner une API key de base (recommandé : une par service ou groupe de déploiement)',
      'Choisir la langue — par défaut, la langue de l\'organisation',
      'Vérifier l\'URL du serveur : les appareils doivent pouvoir la joindre en HTTPS avec un certificat valide',
      'Cliquer sur « Télécharger le paquet de l\'extension »',
    ],
    zipNote: 'Le ZIP contient l\'extension avec un fichier `config.js` intégré. Chaque génération crée une nouvelle clé de déploiement rattachée à la clé de base sélectionnée :',
  },
  intune: {
    optionA: 'Option A – Installation forcée via le catalogue de paramètres (recommandé)',
    optionALead: 'Intune installe l\'extension via une Chrome policy ; les utilisateurs ne peuvent pas la supprimer.',
    optionASteps: [
      'Intune → Appareils → Configuration → Créer → Nouvelle stratégie',
      'Plateforme : Windows 10 et versions ultérieures · Type de profil : Catalogue des paramètres',
      'Ajouter le paramètre : Google Chrome → Extensions → `Configure extension management settings`',
      'Saisir le JSON ci-dessous (remplacer `EXTENSION_ID`) :',
    ],
    webStoreNote: 'L\'URL de mise à jour ci-dessus est celle du Chrome Web Store. Pour un paquet auto-hébergé, indiquez à la place l\'URL de votre propre manifeste de mise à jour (voir option B).',
    configTitle: 'Configuration gérée (facultatif)',
    configLead: 'Chrome lit la configuration gérée des extensions dans la clé de policy `3rdparty`. Déployez ces valeurs de registre, par exemple avec un script PowerShell Intune (Appareils → Scripts et corrections) :',
    precedenceNote: 'Les valeurs intégrées par le générateur d\'extension (`config.js`) sont prioritaires. La configuration gérée ne complète que les champs absents du paquet ; elle sert donc surtout pour un paquet générique sans clé intégrée.',
    optionB: 'Option B – Paquet auto-hébergé (CRX)',
    optionBSteps: [
      'Décompresser le paquet et l\'empaqueter en CRX : `chrome://extensions` → Mode développeur → Empaqueter l\'extension. Conservez le fichier .pem généré — il détermine l\'ID de l\'extension.',
      'Déposer le fichier .crx et un manifeste de mise à jour (`updates.xml`) sur un serveur web HTTPS interne',
      'Forcer l\'installation avec `EXTENSION_ID;https://intranet.example.com/pastegate/updates.xml` (option A, `update_url`, ou ExtensionInstallForcelist)',
      'Affecter le profil aux groupes d\'appareils cibles',
    ],
  },
  jamf: {
    steps: [
      'Jamf Pro → Computers → Configuration Profiles → New',
      'Application & Custom Settings → Upload · Preference domain : `com.google.Chrome`',
      'Property list pour l\'installation forcée :',
    ],
    configLead: 'Pour la configuration gérée, ajoutez une seconde payload avec le preference domain `com.google.Chrome.extensions.EXTENSION_ID` :',
    scope: 'Scope : les groupes d\'ordinateurs qui doivent recevoir le déploiement.',
  },
  gpo: {
    steps: [
      'Télécharger les modèles ADMX de Chrome et les copier dans le magasin central (SYSVOL → PolicyDefinitions)',
      'Gestion des stratégies de groupe → Configuration ordinateur → Stratégies → Modèles d\'administration → Google Chrome → Extensions',
      '**Configure the list of force-installed apps and extensions** → ajouter `EXTENSION_ID;UPDATE_URL`',
    ],
    configLead: 'Configuration gérée (facultatif) : Configuration ordinateur → Préférences → Paramètres Windows → Registre, créer ces valeurs :',
  },
  manual: {
    title: 'Manuel (développement / test)',
    steps: [
      'Télécharger et décompresser le paquet',
      'Chrome → `chrome://extensions` → activer le mode développeur',
      '« Charger l\'extension non empaquetée » → sélectionner le dossier `extension/`',
      'L\'extension est active — aucune autre configuration nécessaire',
    ],
    note: 'Pour un déploiement en production, nous recommandons le MDM : une installation manuelle permet aux utilisateurs de supprimer l\'extension.',
  },
  language: {
    title: 'Langue de l\'extension',
    paragraphs: [
      'L\'extension suit la langue de l\'organisation, définie dans l\'assistant de configuration et sous **Paramètres → Langue de l\'organisation**. Les extensions déployées prennent en compte une modification automatiquement lors de la récupération suivante de leur configuration (`GET /api/v1/config`, champ `default_lang`) — aucun nouveau déploiement n\'est nécessaire.',
      'Les utilisateurs finaux peuvent basculer entre la langue de l\'organisation et l\'anglais dans la fenêtre de l\'extension.',
      'Dans la configuration gérée, la clé `lang` accepte `de`, `en`, `fr` et `es`. Si elle est absente, la langue de l\'organisation s\'applique.',
    ],
  },
  bestPractice: {
    title: 'Bonne pratique – API keys :',
    text: 'Créez une clé de base distincte par service ou par site. Chaque paquet généré à partir d\'elle reçoit sa propre clé de déploiement, listée sous la clé de base dans **API keys**. Lors d\'un nouveau déploiement, activez « Révoquer les anciennes clés de déploiement » pour que les anciens paquets cessent de remonter des événements. En cas de suspicion de compromission, révoquez la clé de base : toutes ses clés de déploiement sont révoquées avec elle, sans impact sur les autres groupes.',
  },
}

export default fr
