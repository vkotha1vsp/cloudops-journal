# syntax=docker/dockerfile:1.7
# CloudOps Journal: multi-stage build producing a small, non-root runtime image.
#   docker build -t cloudops-journal .                 → app image (default target)
#   docker build --target migrator -t cloudops-migrate . → one-off image that runs `prisma migrate deploy`

# Override with a mirror to avoid Docker Hub rate limits (CodeBuild uses ECR Public):
#   --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-alpine
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma version` also downloads the native schema engine for this platform so the
# migrator image can run `migrate deploy` without internet access at runtime.
RUN npx prisma generate && npx prisma version && npm run build

# One-off migration runner (used by CI as an ECS task before each deploy).
FROM ${NODE_IMAGE} AS migrator
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/prisma.config.ts ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache wget
# node-postgres verifies the server certificate for sslmode=require; RDS certificates chain to
# the Amazon RDS CA, which is not in Node's default trust store.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
