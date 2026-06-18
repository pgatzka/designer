# --- Build stage: compile the Vite SPA ---
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the static bundle into /app/dist.
COPY . .
RUN npm run build

# --- Runtime stage: serve the static files with nginx ---
FROM nginx:1.27-alpine AS runtime

# SPA-aware config (history fallback + gzip).
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
