# 基础镜像统一用 glibc（bookworm-slim）而非 alpine：
# better-sqlite3 是原生模块，其 prebuilt 二进制（prebuilds/linux-x64.node）链接了
# libstdc++ / GLIBCXX_3.4.29，alpine 的 musl libc 无法加载该二进制；
# 且 glibc 平台的 prebuild 比 musl 覆盖更完整。
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
# 构建期工具链：better-sqlite3 通常直接用 prebuilt 二进制，但保留编译链兜底，
# 当目标平台缺少对应 prebuild 时可回退到 node-gyp 源码编译。
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/desktop/package.json apps/desktop/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/desktop apps/desktop
RUN pnpm --filter @tashkent/shared build 2>/dev/null || true
RUN pnpm --filter @tashkent/desktop build
# server 的 build 脚本会把运行时读取的 schema.sql 一起拷进 dist
RUN pnpm --filter @tashkent/server build

FROM node:22-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
# libstdc++6 是 better-sqlite3 原生二进制的运行时依赖，缺它 require('better-sqlite3') 会失败；
# tini 负责转发信号并回收僵尸进程，保证容器能被优雅停止。
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 只安装 server 的生产依赖（--prod 剔除 devDependencies，--filter 剔除 desktop 的构建期依赖），
# 避免把 typescript / vitest / playwright 等带进运行镜像。
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json ./
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/desktop/package.json ./apps/desktop/
RUN pnpm install --prod --frozen-lockfile --filter @tashkent/server

# 运行期只需要编译产物与共享类型声明
COPY --from=build /app/packages/shared/src ./packages/shared/src
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/desktop/dist ./apps/desktop/dist

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
