FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile=false
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @tashkent/shared build 2>/dev/null || true
RUN pnpm --filter @tashkent/server build
# schema.sql 是运行时读取的资源，tsc 不会把它拷进 dist，需手动复制
RUN cp apps/server/src/db/schema.sql apps/server/dist/db/schema.sql

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
COPY --from=build /app/apps/server/dist ./apps/server/dist
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
