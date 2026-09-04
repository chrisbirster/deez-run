# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS web-build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM debian:bookworm-slim AS deez-build
ARG TARGETARCH
ARG DEEZ_COMMIT=f00f5ec92b5fd2918b9310fcbfbe9bacadb5d2c7
ARG ZIG_VERSION=0.16.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      libsqlite3-dev \
      python3 \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) zig_arch=x86_64 ;; \
      arm64) zig_arch=aarch64 ;; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-${zig_arch}-linux-${ZIG_VERSION}.tar.xz" -o /tmp/zig.tar.xz; \
    mkdir -p /opt/zig; \
    tar -xJf /tmp/zig.tar.xz --strip-components=1 -C /opt/zig; \
    rm /tmp/zig.tar.xz

ENV PATH="/opt/zig:${PATH}"
COPY patches/patch-hosted-web.py /tmp/patch-hosted-web.py
WORKDIR /src/deez
RUN git clone https://github.com/chrisbirster/deez.git . \
    && git checkout --detach "${DEEZ_COMMIT}" \
    && test "$(git rev-parse HEAD)" = "${DEEZ_COMMIT}" \
    && python3 /tmp/patch-hosted-web.py src/hosted_web.zig
RUN zig fmt src/hosted_web.zig \
    && zig build -Doptimize=ReleaseSafe

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deez-build /src/deez/zig-out/bin/deez /app/deez
COPY --from=web-build /src/dist /app/web
COPY --from=deez-build /src/deez/zig-out/bin/deez-scheduler.wasm /app/web/deez-scheduler.wasm

ENV DEEZ_STORAGE=mongodb
ENV DEEZ_WEB_ROOT=/app/web

EXPOSE 8080

CMD ["/app/deez", "serve", "--host", "0.0.0.0", "--port", "8080", "--web-root", "/app/web"]
