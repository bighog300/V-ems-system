FROM node:22.14.0-bookworm-slim

ENV NODE_ENV=development \
    PORT=3001 \
    HOST=0.0.0.0 \
    VEMS_DB_PATH=/var/lib/vems/data/platform.sqlite \
    VEMS_REQUIRE_EXISTING_DB=true

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/mobile-crew/package.json apps/mobile-crew/package.json
COPY apps/web-control/package.json apps/web-control/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
COPY services/orchestration/package.json services/orchestration/package.json

RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace=@vems/api-gateway --workspace=@vems/orchestration --workspace=@vems/shared

COPY packages/shared packages/shared
COPY services/orchestration services/orchestration
COPY services/api-gateway services/api-gateway
COPY scripts/windows scripts/windows

RUN chown -R node:node /app
USER node

EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@vems/api-gateway"]
