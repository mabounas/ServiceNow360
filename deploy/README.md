# Déploiement sur le VPS OVH

L'application tourne sur un VPS OVH (Ubuntu 26.04, 2 vCPU, 4 Go, 40 Go) derrière Nginx.

| Élément | Valeur |
| --- | --- |
| URL publique | https://servicedesk.parcelinksystems.com |
| Serveur | `92.222.93.127` (`vps-9cb71770`) |
| Compte SSH | `ubuntu` (sudo) |
| Compte applicatif | `sn360` — compte système, sans shell de connexion |
| Répertoire | `/srv/servicenow360/app` |
| Port interne | `3001`, écoute sur `127.0.0.1` uniquement |
| Service | `servicenow360.service` (systemd, redémarrage automatique) |
| Base | PostgreSQL 18 local, base et rôle `servicenow360` |
| Certificat | Let's Encrypt, renouvellement automatique par `certbot.timer` |

## Architecture

```
Internet ─→ :80  Nginx ──(301)──→ :443 Nginx
                                    │  servicedesk.parcelinksystems.com
                                    └─→ 127.0.0.1:3001   Next.js (systemd)
                                              └─→ 127.0.0.1:5432  PostgreSQL
```

Ni le port applicatif ni PostgreSQL ne sont exposés : UFW n'ouvre que 22, 80 et 443.
Pour héberger une autre application sur le même serveur, il suffit de reprendre ce schéma
avec un port interne différent (3002, 3003…), une base dédiée et un nouveau bloc `server`
Nginx portant son propre `server_name`.

## HTTPS obligatoire

Le cookie de session est émis avec l'attribut `Secure` en production : servi en clair, il est
rejeté par le navigateur et **la connexion échoue en silence** — le formulaire semble ne rien faire.
Deux garde-fous sont en place :

- Nginx redirige tout le trafic HTTP en 301 vers HTTPS ;
- l'en-tête `Strict-Transport-Security: max-age=31536000` est servi sur le bloc HTTPS, si bien que
  le navigateur bascule de lui-même en HTTPS pour ce domaine, sans même émettre de requête en clair.

Ne pas retirer cet en-tête : c'est ce qui empêche un onglet ou un favori en `http://` de revenir.

## Mettre à jour l'application

```bash
sudo bash /srv/servicenow360/app/deploy/redeploy.sh
```

Le script récupère `main`, réinstalle les dépendances, applique le schéma Prisma,
reconstruit et redémarre le service.

## Exploitation courante

```bash
sudo systemctl status servicenow360      # état du service
sudo journalctl -u servicenow360 -f      # logs en direct
sudo systemctl restart servicenow360     # redémarrage
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run             # test du renouvellement TLS
```

## Configuration

`/srv/servicenow360/app/.env` (permissions `600`, propriétaire `sn360`) porte
`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NODE_ENV` et `PORT`.
Ce fichier n'est pas versionné : le régénérer en cas de réinstallation.

La connexion PostgreSQL est **directe** (pas de pooler), donc le paramètre `pgbouncer=true`
imposé par Neon n'est plus nécessaire — `src/lib/prisma.ts` l'ajoute de toute façon sans effet néfaste.

## Sauvegarde de la base

Aucune sauvegarde automatique n'est encore en place. À mettre en œuvre :

```bash
sudo -u postgres pg_dump -Fc servicenow360 > /var/backups/servicenow360-$(date +%F).dump
```

à planifier via `cron` ou un timer systemd, avec copie hors du serveur.

## Points restants

- Sauvegarde automatique de la base et test de restauration.
- Redémarrage du serveur en attente (`*** System restart required ***`) pour appliquer les mises à jour noyau.
- SMTP à configurer pour activer le canal e-mail des notifications.
