# ServiceNow360

**En ligne : https://servicedesk360-rosy.vercel.app** — dépôt : https://github.com/mabounas/ServiceNow360

Portail client de **gestion des anomalies (tickets)** et de **suivi de projet (planning / diagramme de Gantt)**,
réalisé d'après le cahier des charges *Portail Client de Gestion des Anomalies et Module de Suivi de Projet* (v0.1).

La page d'accueil reprend le design **ServiceDesk360** produit avec Claude Design (système « Modernist » :
Archivo, accent rouge `#ec3013`, aucun rayon, filets 2 px). Le système de design est repris tel quel dans
[`src/app/design-system.css`](src/app/design-system.css) et documenté dans [`docs-design-system.md`](docs-design-system.md) ;
toute l'application consomme ses tokens.

---

## Pile technique

| Composant | Choix |
| --- | --- |
| Front-end | Next.js 16 (App Router), React 19, TypeScript — web responsive |
| Back-end | Routes API Next.js (REST), architecture modulaire |
| Base de données | PostgreSQL via Prisma |
| Authentification | Session JWT signée (`jose`) en cookie httpOnly, mots de passe `bcrypt` |
| Notifications | In-app (systématique) + e-mail SMTP via `nodemailer` (optionnel) |
| Hébergement | Vercel (serverless, région `cdg1`) + PostgreSQL Neon |

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner DATABASE_URL et AUTH_SECRET
npm run db:push        # crée le schéma
npm run db:seed        # jeu de démonstration (facultatif)
npm run dev
```

### Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (poolée en serverless) |
| `AUTH_SECRET` | Secret de signature des sessions (32 caractères aléatoires minimum) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Notifications e-mail — si absentes, seules les notifications in-app sont produites |
| `NEXT_PUBLIC_APP_URL` | URL publique, utilisée dans les liens des e-mails |

### Comptes de démonstration

Après `npm run db:seed` — mot de passe commun **`Demo1234`**, sauf l'administrateur :

| Compte | Rôle |
| --- | --- |
| `admin_servicedesk@servicenow360.com` | Administrateur (tous projets) |
| `chef.projet@servicenow360.dev` | Chef de projet |
| `technicien@servicenow360.dev` | Technicien IT |
| `superviseur@nordline.dev` | Superviseur (client) |
| `client@nordline.dev` | Utilisateur standard (client) |
| `nouveau@velum.dev` | Compte **en attente** de validation |

> L'adresse et le mot de passe de l'administrateur se définissent par `SEED_ADMIN_EMAIL` et
> `SEED_ADMIN_PASSWORD` au moment du seed : aucun mot de passe réel n'est stocké dans le dépôt.
>
> Sans jeu de démonstration, le **tout premier compte créé** via le formulaire d'inscription devient
> automatiquement administrateur : sans lui, aucune inscription ne pourrait être validée.

---

## Couverture du cahier des charges

### Module 1 — Portail de gestion des anomalies

- **Trois types de tickets** avec formulaires, circuits et suivis distincts : incident (`INC-xxxx`),
  évolution (`EVO-xxxx`), nouvelle demande (`DEM-xxxx`). Numérotation unique par type.
- **Champs communs** : titre, description, module concerné, sous-catégorie, pièces jointes, initiateur, projet.
  **Spécifiques incident** : environnement, sévérité, priorité, étapes de reproduction.
  **Spécifiques évolution/demande** : justification métier, bénéfice attendu, urgence business, budget envisagé.
- **Circuit incident** : Nouveau → En qualification → Assigné → En cours → (En attente d'information) →
  Traité → Clôturé, plus Rejeté / non reproductible. Chaque transition est contrôlée par rôle.
- **Circuit évolution / nouvelle demande** : Soumise → En analyse → Chiffrée → En attente d'arbitrage →
  Acceptée/Planifiée → En cours de réalisation → Livrée → Clôturée, plus Refusée / Reportée.
- **Fil de discussion** horodaté, avec notes internes invisibles du client, et pièces jointes.
- **Historique complet** des changements de statut et d'affectation (audit trail par ticket).
- **SLA** par sévérité pour les incidents, avec échéances calculées, état (dans les délais, échéance proche,
  dépassé, respecté) et alerte sur le tableau de bord.
- **Liste filtrable** (type, statut, sévérité, priorité, module, assigné, période, recherche plein texte) et export CSV.
- **Enquête de satisfaction** (note /5 + commentaire) proposée à l'initiateur après clôture.

### Module 2 — Suivi de projet (planning et Gantt)

- **Structure WBS** arborescente : phases, lots, tâches, sous-tâches, avec responsable, dates, avancement, statut.
- **Jalons** mis en évidence (losanges) et **dépendances** entre tâches (création contrôlée, refus des cycles).
- **Chemin critique** calculé par la méthode des potentiels (marge nulle) et mis en évidence visuellement.
- **Gantt interactif** en SVG : zoom jour / semaine / mois, repère « aujourd'hui », glisser-déposer pour
  déplacer une tâche et poignée de redimensionnement (réservés au chef de projet).
- **Historique des versions du planning** : une version peut être figée puis comparée au planning courant
  (barres de référence affichées sous les barres actuelles).
- **Vue des retards** et avancement consolidé (global et par phase), pondéré par la durée des tâches.
- **Journal des risques** avec probabilité, impact, criticité et visibilité client paramétrable.
- **Exports** : Gantt en PNG, planning en CSV, impression PDF via le navigateur.
- **Lien avec le module 1** : une demande passée à « Acceptée / Planifiée » crée automatiquement la tâche
  correspondante au planning et reste liée au ticket ; le rattachement peut aussi être fait à la main
  vers une tâche existante.

### Module 3 — Utilisateurs, projets et droits

- **Auto-inscription** (nom, prénom, e-mail, société, téléphone, fonction, pays, mot de passe) — le compte
  reste **en attente** tant qu'il n'est pas affecté à un projet.
- **Affectation par projet avec un rôle par projet** ; un utilisateur peut cumuler des rôles différents
  selon les projets. L'affectation active le compte en attente.
- **Cloisonnement multi-projet strict** : chaque requête est filtrée par projet et par rôle, côté serveur.
- Retrait d'un projet, changement de rôle, activation / désactivation de compte, promotion administrateur.

Visibilité appliquée (§2.5) :

| Rôle | Tickets visibles | Planning |
| --- | --- | --- |
| Utilisateur standard | uniquement ceux qu'il a créés | lecture seule + commentaires |
| Superviseur | tous ceux du projet | lecture seule + commentaires |
| Technicien IT | ceux qui lui sont assignés **et la file non assignée à qualifier** | lecture |
| Chef de projet | tous ceux du projet | création / modification complète |
| Administrateur | tous, tous projets | tous les plannings |

### Module 4 — Tableau de bord et reporting

Tickets par type, par statut, par sévérité et par module ; délai moyen de traitement ; taux de respect des SLA ;
pipeline des évolutions et nouvelles demandes façon backlog ; avancement global et par phase ; tâches en retard ;
satisfaction moyenne ; exports CSV et impression PDF.

### Module 5 — Notifications

Notification à chaque changement de statut significatif, à chaque nouveau commentaire (hors note interne),
à l'affectation d'un utilisateur à un projet et à l'arrivée d'une inscription à valider. Canal in-app
systématique, e-mail en complément si SMTP est configuré.

### Exigences non fonctionnelles

- Interface en français, responsive (mobile, tablette, ordinateur), sans formation préalable.
- Sessions JWT httpOnly, `SameSite=Lax`, `Secure` en production ; mots de passe hachés (bcrypt) ;
  message d'erreur de connexion identique que le compte existe ou non (pas d'énumération de comptes).
- Contrôle d'accès systématiquement **côté serveur** (aucune décision de visibilité laissée au client).
- Journalisation des actions sensibles dans `AuditLog` (connexion, création de projet, transitions, droits).

---

## Points du cahier des charges tranchés dans cette implémentation

Le cahier des charges laisse plusieurs points ouverts ; voici les choix retenus, tous réversibles :

1. **Validation des inscriptions** — validation manuelle par l'administrateur, matérialisée par l'affectation
   à un projet (pas d'e-mail de confirmation ni de domaine de confiance).
2. **Rôle « référent client »** — couvert par le rôle **Superviseur**, qui porte aussi l'arbitrage des
   évolutions et nouvelles demandes.
3. **Chiffrage / devis avant planification** — modélisé par les statuts *Chiffrée* puis *En attente d'arbitrage*,
   avec charge et coût estimés saisis sur le ticket. Aucun circuit contractuel externe n'est géré.
4. **Génération de la tâche au planning** — **automatique** au passage en « Acceptée / Planifiée », avec
   possibilité de relier ensuite le ticket à une autre tâche existante.
5. **Visibilité des tickets pour le technicien** — élargie à la file non assignée en début de circuit, faute
   de quoi aucun technicien ne pourrait prendre un ticket en qualification.
6. **SLA** — grille par sévérité en heures calendaires (bloquante 1 h/4 h, majeure 4 h/24 h, mineure 8 h/72 h,
   cosmétique 24 h/240 h). Une grille en heures ouvrées demanderait un calendrier de service.
7. **Pièces jointes** — stockées en base sous forme de data URL (4 Mo par fichier, 10 Mo par ticket).
   Un stockage objet (S3, Vercel Blob) est à prévoir pour de gros volumes ou des vidéos.
8. **Exports PDF** — assurés par l'impression navigateur (feuilles `@media print` dédiées) plutôt que par un
   moteur PDF serveur ; le Gantt s'exporte en PNG haute définition.
9. **Application mobile native** — hors périmètre, conformément au §2.2 ; l'interface est responsive.
10. **Authentification SSO** — non implémentée (e-mail / mot de passe uniquement) ; le point reste ouvert au §5.1.

## Reste à faire pour une mise en production

- Configurer le SMTP pour activer le canal e-mail des notifications.
- Réinitialisation de mot de passe en libre-service (aujourd'hui à la main par l'administrateur).
- Rappels automatiques d'inactivité et d'approche d'échéance SLA (tâche planifiée / cron).
- Tests automatisés et recette fonctionnelle avec le client.

## Structure du dépôt

```
prisma/schema.prisma       modèle de données (utilisateurs, projets, tickets, planning, risques, audit)
prisma/seed.ts             jeu de démonstration (planning du §9 + tickets des 3 circuits)
src/app/                   pages (accueil publique + espace de travail) et routes API
src/components/landing/    page d'accueil issue du design ServiceDesk360
src/components/app/        composants de l'espace de travail (Gantt, tickets, administration)
src/lib/                   règles métier : workflow, RBAC, SLA, planning, notifications, audit
src/app/design-system.css  système de design « Modernist » (tokens + composants)
```
