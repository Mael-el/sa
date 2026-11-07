# syntax=docker/dockerfile:1
# Image de production SANTÉ+ — construction multi-étapes.
#
# L'application tourne en utilisateur non privilégié, sans outils de compilation
# dans l'image finale, et n'embarque aucune variable d'environnement : les
# secrets sont injectés à l'exécution par le gestionnaire de secrets.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` échoue si le lockfile ne correspond pas : la production ne peut pas
# embarquer une dépendance non verrouillée.
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valeurs de construction uniquement : le build ne contacte pas la base et ne
# doit dépendre d'aucun secret réel.
ARG DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ARG SESSION_SECRET="build-time-placeholder-not-used-at-runtime-000000"
ARG DATA_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur dédié : une faille applicative n'obtient pas root dans le conteneur.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Seuls les artefacts nécessaires sont copiés (pas de code source, pas de secrets).
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# Les migrations et scripts d'exploitation restent disponibles pour la tâche de
# déploiement (db:migrate) et la maintenance (purge).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts

USER nextjs
EXPOSE 3000

# Le contrôle de santé interroge la base : un conteneur qui ne peut plus la
# joindre est retiré du service plutôt que de servir des erreurs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
