/**
 * Jeu de données de démonstration.
 * Reprend le planning indicatif du cahier des charges (§9) et un échantillon
 * de tickets couvrant les trois circuits de traitement.
 *
 *   npm run db:push && npm run db:seed
 */
import { PrismaClient, type Prisma, type Severity, type TicketType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Demo1234';
const DAY = 86_400_000;

function day(offset: number) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return new Date(date.getTime() + offset * DAY);
}

const SLA_HOURS: Record<Severity, { first: number; resolution: number }> = {
  BLOCKING: { first: 1, resolution: 4 },
  MAJOR: { first: 4, resolution: 24 },
  MINOR: { first: 8, resolution: 72 },
  COSMETIC: { first: 24, resolution: 240 },
};

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const people = [
    { key: 'admin', firstName: 'Sophie', lastName: 'Marchand', email: 'admin@servicenow360.dev', company: 'ITLS', jobRole: 'Direction', isAdmin: true },
    { key: 'pm', firstName: 'Karim', lastName: 'Benali', email: 'chef.projet@servicenow360.dev', company: 'ITLS', jobRole: 'Chef de projet' },
    { key: 'tech', firstName: 'Léa', lastName: 'Fontaine', email: 'technicien@servicenow360.dev', company: 'ITLS', jobRole: 'IT et support' },
    { key: 'tech2', firstName: 'Marc', lastName: 'Dubois', email: 'technicien2@servicenow360.dev', company: 'ITLS', jobRole: 'IT et support' },
    { key: 'supervisor', firstName: 'Claire', lastName: 'Nadeau', email: 'superviseur@nordline.dev', company: 'Nordline', jobRole: 'Direction' },
    { key: 'user', firstName: 'Antoine', lastName: 'Roux', email: 'client@nordline.dev', company: 'Nordline', jobRole: 'Autre' },
    { key: 'user2', firstName: 'Nadia', lastName: 'Cherif', email: 'client2@nordline.dev', company: 'Nordline', jobRole: 'Autre' },
    { key: 'velum', firstName: 'Paul', lastName: 'Grandet', email: 'client@velum.dev', company: 'Velum', jobRole: 'Direction' },
  ];

  const users: Record<string, { id: string }> = {};
  for (const person of people) {
    const { key, isAdmin, ...rest } = person;
    users[key] = await prisma.user.upsert({
      where: { email: rest.email },
      update: {},
      create: { ...rest, passwordHash, isAdmin: Boolean(isAdmin), status: 'ACTIVE' },
      select: { id: true },
    });
  }

  // Un compte laissé en attente pour illustrer la validation par l'administrateur (§2.4).
  await prisma.user.upsert({
    where: { email: 'nouveau@velum.dev' },
    update: {},
    create: {
      firstName: 'Julie',
      lastName: 'Meyer',
      email: 'nouveau@velum.dev',
      company: 'Velum',
      jobRole: 'Chef de projet',
      passwordHash,
      status: 'PENDING',
    },
  });

  const project = await prisma.project.upsert({
    where: { code: 'PORTAIL' },
    update: {},
    create: {
      code: 'PORTAIL',
      name: 'Déploiement du portail client Nordline',
      clientName: 'Nordline',
      description: 'Déploiement de la solution de gestion commerciale et du portail client associé.',
      startDate: day(-45),
      endDate: day(120),
    },
  });

  const secondProject = await prisma.project.upsert({
    where: { code: 'VELUM' },
    update: {},
    create: {
      code: 'VELUM',
      name: 'Migration ERP Velum',
      clientName: 'Velum',
      description: 'Migration de l’ERP historique et reprise des données.',
      startDate: day(-10),
      endDate: day(180),
    },
  });

  const memberships: [string, string, Prisma.ProjectMemberCreateInput['role']][] = [
    ['pm', project.id, 'PROJECT_MANAGER'],
    ['tech', project.id, 'TECHNICIAN'],
    ['tech2', project.id, 'TECHNICIAN'],
    ['supervisor', project.id, 'SUPERVISOR'],
    ['user', project.id, 'USER'],
    ['user2', project.id, 'USER'],
    ['pm', secondProject.id, 'PROJECT_MANAGER'],
    ['velum', secondProject.id, 'SUPERVISOR'],
  ];

  for (const [key, projectId, role] of memberships) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: users[key].id } },
      update: { role },
      create: { projectId, userId: users[key].id, role },
    });
  }

  // ── Planning : reprise des phases du §9 du cahier des charges ──────────────
  const existingTasks = await prisma.task.count({ where: { projectId: project.id } });
  if (existingTasks === 0) {
    const phases = [
      { name: '1. Cadrage', start: -45, end: -28, progress: 100, children: [
        { name: 'Ateliers de cadrage', start: -45, end: -38, progress: 100 },
        { name: 'Validation du cahier des charges', start: -37, end: -33, progress: 100 },
        { name: 'Spécifications fonctionnelles détaillées', start: -32, end: -28, progress: 100 },
      ] },
      { name: '2. Conception', start: -27, end: -6, progress: 100, children: [
        { name: 'Maquettage UX/UI', start: -27, end: -16, progress: 100 },
        { name: 'Architecture technique', start: -15, end: -9, progress: 100 },
        { name: 'Validation des maquettes', start: -8, end: -6, progress: 100 },
      ] },
      { name: '3. Développement', start: -5, end: 58, progress: 45, children: [
        { name: 'Module anomalies', start: -5, end: 20, progress: 70 },
        { name: 'Module planning et Gantt', start: 12, end: 38, progress: 35 },
        { name: 'Utilisateurs, rôles et droits', start: 20, end: 44, progress: 15 },
        { name: 'Tableau de bord et exports', start: 38, end: 58, progress: 0 },
      ] },
      { name: '4. Recette', start: 59, end: 79, progress: 0, children: [
        { name: 'Tests internes', start: 59, end: 68, progress: 0 },
        { name: 'Recette client', start: 69, end: 79, progress: 0 },
      ] },
      { name: '5. Déploiement', start: 80, end: 92, progress: 0, children: [
        { name: 'Mise en production', start: 80, end: 84, progress: 0 },
        { name: 'Formation des utilisateurs clés', start: 85, end: 92, progress: 0 },
      ] },
      { name: '6. Garantie', start: 93, end: 120, progress: 0, children: [] },
    ];

    const created: Record<string, string> = {};
    let order = 0;
    for (const phase of phases) {
      const parent = await prisma.task.create({
        data: {
          projectId: project.id,
          name: phase.name,
          startDate: day(phase.start),
          endDate: day(phase.end),
          progress: phase.progress,
          status: phase.progress >= 100 ? 'DONE' : phase.progress > 0 ? 'IN_PROGRESS' : 'TODO',
          sortOrder: (order += 10),
          ownerId: users.pm.id,
        },
      });
      created[phase.name] = parent.id;

      for (const child of phase.children) {
        const task = await prisma.task.create({
          data: {
            projectId: project.id,
            parentId: parent.id,
            name: child.name,
            startDate: day(child.start),
            endDate: day(child.end),
            progress: child.progress,
            status: child.progress >= 100 ? 'DONE' : child.progress > 0 ? 'IN_PROGRESS' : 'TODO',
            sortOrder: (order += 10),
            ownerId: child.name.includes('Module') ? users.tech.id : users.pm.id,
          },
        });
        created[child.name] = task.id;
      }
    }

    // Jalons
    for (const milestone of [
      { name: '★ Cahier des charges validé', at: -33 },
      { name: '★ Maquettes validées', at: -6 },
      { name: '★ Livraison recette', at: 58 },
      { name: '★ Mise en production', at: 84 },
    ]) {
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          name: milestone.name,
          startDate: day(milestone.at),
          endDate: day(milestone.at),
          isMilestone: true,
          progress: milestone.at < 0 ? 100 : 0,
          status: milestone.at < 0 ? 'DONE' : 'TODO',
          sortOrder: (order += 10),
        },
      });
      created[milestone.name] = task.id;
    }

    const links: [string, string][] = [
      ['Ateliers de cadrage', 'Validation du cahier des charges'],
      ['Validation du cahier des charges', 'Spécifications fonctionnelles détaillées'],
      ['Spécifications fonctionnelles détaillées', 'Maquettage UX/UI'],
      ['Maquettage UX/UI', 'Architecture technique'],
      ['Architecture technique', 'Validation des maquettes'],
      ['Validation des maquettes', 'Module anomalies'],
      ['Module anomalies', 'Module planning et Gantt'],
      ['Module planning et Gantt', 'Utilisateurs, rôles et droits'],
      ['Utilisateurs, rôles et droits', 'Tableau de bord et exports'],
      ['Tableau de bord et exports', 'Tests internes'],
      ['Tests internes', 'Recette client'],
      ['Recette client', 'Mise en production'],
      ['Mise en production', 'Formation des utilisateurs clés'],
    ];
    for (const [from, to] of links) {
      if (!created[from] || !created[to]) continue;
      await prisma.taskDependency.upsert({
        where: { predecessorId_successorId: { predecessorId: created[from], successorId: created[to] } },
        update: {},
        create: { predecessorId: created[from], successorId: created[to] },
      });
    }

    await prisma.risk.createMany({
      data: [
        {
          projectId: project.id,
          title: 'Disponibilité des référents métier pour la recette',
          description: 'Les créneaux de recette ne sont pas encore confirmés côté client. Parade : réserver les créneaux dès la fin du développement.',
          probability: 3,
          impact: 3,
          ownerId: users.pm.id,
        },
        {
          projectId: project.id,
          title: 'Reprise des données historiques incomplète',
          description: 'Le référentiel client comporte des doublons. Parade : dédoublonnage préalable et jeu de test dédié.',
          probability: 2,
          impact: 4,
          ownerId: users.tech.id,
        },
        {
          projectId: project.id,
          title: 'Charge interne de l’équipe technique en fin de trimestre',
          description: 'Point d’attention interne, non partagé avec le client.',
          probability: 3,
          impact: 2,
          sharedWithClient: false,
          ownerId: users.pm.id,
        },
      ],
    });
  }

  // ── Tickets ───────────────────────────────────────────────────────────────
  const existingTickets = await prisma.ticket.count({ where: { projectId: project.id } });
  if (existingTickets > 0) {
    console.log('Données de démonstration déjà présentes — rien à ajouter.');
    return;
  }

  const counters: Record<string, number> = { INC: 0, EVO: 0, DEM: 0 };
  const prefixes: Record<TicketType, string> = { INCIDENT: 'INC', EVOLUTION: 'EVO', DEMANDE: 'DEM' };

  async function makeTicket(input: {
    type: TicketType;
    status: Prisma.TicketCreateInput['status'];
    title: string;
    description: string;
    createdBy: string;
    assignee?: string;
    severity?: Severity;
    moduleName?: string;
    createdOffset: number;
    resolvedOffset?: number;
    closedOffset?: number;
    estimateDays?: number;
    satisfaction?: number;
    comments?: { author: string; body: string; internal?: boolean; offset: number }[];
  }) {
    const prefix = prefixes[input.type];
    counters[prefix] += 1;
    const reference = `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
    const createdAt = day(input.createdOffset);
    const sla = input.severity ? SLA_HOURS[input.severity] : null;

    const ticket = await prisma.ticket.create({
      data: {
        reference,
        projectId: project.id,
        type: input.type,
        status: input.status,
        title: input.title,
        description: input.description,
        moduleName: input.moduleName ?? null,
        severity: input.severity ?? null,
        priority: input.severity === 'BLOCKING' ? 'P1' : input.severity === 'MAJOR' ? 'P2' : 'P3',
        environmentName: input.type === 'INCIDENT' ? 'Production' : null,
        createdById: users[input.createdBy].id,
        assigneeId: input.assignee ? users[input.assignee].id : null,
        estimateDays: input.estimateDays ?? null,
        createdAt,
        slaFirstResponseDue: sla ? new Date(createdAt.getTime() + sla.first * 3_600_000) : null,
        slaResolutionDue: sla ? new Date(createdAt.getTime() + sla.resolution * 3_600_000) : null,
        firstResponseAt: input.status === 'NEW' || input.status === 'SUBMITTED' ? null : new Date(createdAt.getTime() + 2 * 3_600_000),
        resolvedAt: input.resolvedOffset != null ? day(input.resolvedOffset) : null,
        closedAt: input.closedOffset != null ? day(input.closedOffset) : null,
        satisfactionRating: input.satisfaction ?? null,
      },
    });

    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, actorId: users[input.createdBy].id, field: 'created', toValue: 'NEW', createdAt, note: `Ticket ${reference} créé.` },
    });

    for (const comment of input.comments ?? []) {
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: users[comment.author].id,
          body: comment.body,
          internal: Boolean(comment.internal),
          createdAt: day(comment.offset),
        },
      });
    }

    return ticket;
  }

  await makeTicket({
    type: 'INCIDENT',
    status: 'CLOSED',
    severity: 'BLOCKING',
    title: 'Impossible de valider une commande en production',
    description: 'Depuis la mise à jour de vendredi, la validation d’une commande renvoie une erreur 500.',
    moduleName: 'Commandes',
    createdBy: 'user',
    assignee: 'tech',
    createdOffset: -12,
    resolvedOffset: -11.85,
    closedOffset: -11,
    satisfaction: 5,
    comments: [
      { author: 'tech', body: 'Incident reproduit sur l’environnement de recette. Analyse en cours.', offset: -12 },
      { author: 'tech', body: 'Correctif déployé en production, merci de vérifier de votre côté.', offset: -12 },
      { author: 'user', body: 'La validation fonctionne à nouveau. Merci pour la réactivité.', offset: -11 },
    ],
  });

  await makeTicket({
    type: 'INCIDENT',
    status: 'IN_PROGRESS',
    severity: 'MAJOR',
    title: 'Lenteurs sur la recherche client au-delà de 5 000 fiches',
    description: 'La recherche met plus de 15 secondes à répondre sur le référentiel complet.',
    moduleName: 'Référentiel client',
    createdBy: 'user2',
    assignee: 'tech2',
    createdOffset: -2,
    comments: [
      { author: 'tech2', body: 'Index manquant identifié sur la table clients. Correctif en préparation.', internal: true, offset: -1 },
      { author: 'tech2', body: 'Nous avons identifié la cause, un correctif est prévu cette semaine.', offset: -1 },
    ],
  });

  await makeTicket({
    type: 'INCIDENT',
    status: 'NEW',
    severity: 'MINOR',
    title: 'Libellé tronqué sur l’export PDF des devis',
    description: 'Le nom du client est coupé au-delà de 30 caractères dans l’en-tête du PDF.',
    moduleName: 'Devis',
    createdBy: 'user',
    createdOffset: 0,
  });

  await makeTicket({
    type: 'INCIDENT',
    status: 'WAITING_INFO',
    severity: 'MAJOR',
    title: 'Écart de stock après import CSV',
    description: 'Les quantités importées ne correspondent pas au fichier source sur certaines références.',
    moduleName: 'Stocks',
    createdBy: 'user2',
    assignee: 'tech',
    createdOffset: -1,
    comments: [
      { author: 'tech', body: 'Pouvez-vous nous transmettre le fichier CSV utilisé ainsi que l’heure de l’import ?', offset: -1 },
    ],
  });

  await makeTicket({
    type: 'EVOLUTION',
    status: 'PENDING_ARBITRATION',
    title: 'Ajouter un filtre par commercial sur le tableau de bord',
    description: 'Permettre de filtrer les indicateurs par commercial afin de suivre la performance individuelle.',
    moduleName: 'Tableau de bord',
    createdBy: 'supervisor',
    estimateDays: 4,
    createdOffset: -8,
    comments: [
      { author: 'pm', body: 'Chiffrage : 4 jours de développement, 1 jour de recette. En attente d’arbitrage du comité.', offset: -4 },
    ],
  });

  await makeTicket({
    type: 'EVOLUTION',
    status: 'IN_ANALYSIS',
    title: 'Amélioration de l’ergonomie de saisie des commandes',
    description: 'Réduire le nombre de clics nécessaires à la saisie d’une commande récurrente.',
    moduleName: 'Commandes',
    createdBy: 'user',
    createdOffset: -3,
  });

  await makeTicket({
    type: 'DEMANDE',
    status: 'ACCEPTED_PLANNED',
    title: 'Nouveau module de facturation récurrente',
    description: 'Gérer les abonnements et la facturation automatique mensuelle.',
    moduleName: 'Facturation',
    createdBy: 'supervisor',
    estimateDays: 15,
    createdOffset: -20,
    comments: [
      { author: 'pm', body: 'Demande acceptée par le comité de pilotage, intégrée au planning de développement.', offset: -6 },
    ],
  });

  await makeTicket({
    type: 'DEMANDE',
    status: 'SUBMITTED',
    title: 'Application mobile de consultation des tickets',
    description: 'Disposer d’une application mobile native pour consulter et déclarer des tickets.',
    createdBy: 'user2',
    createdOffset: -1,
  });

  await prisma.counter.upsert({ where: { id: 'INC' }, update: { value: counters.INC }, create: { id: 'INC', value: counters.INC } });
  await prisma.counter.upsert({ where: { id: 'EVO' }, update: { value: counters.EVO }, create: { id: 'EVO', value: counters.EVO } });
  await prisma.counter.upsert({ where: { id: 'DEM' }, update: { value: counters.DEM }, create: { id: 'DEM', value: counters.DEM } });

  console.log('Jeu de démonstration créé.');
  console.log(`Mot de passe commun : ${PASSWORD}`);
  for (const person of people) console.log(` - ${person.email} (${person.jobRole})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
