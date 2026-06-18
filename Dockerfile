# --- Frontend build: produce the static SPA bundle ---
FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci
COPY frontend ./frontend
RUN npm run build -w @designer/frontend

# --- Backend build: compile TypeScript to dist ---
FROM node:24-alpine AS backend
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci
COPY backend ./backend
RUN npm run build -w @designer/backend

# --- Runtime: Node serving the API + the static frontend ---
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
# Install production dependencies for the backend workspace only.
RUN npm ci --omit=dev --workspace=@designer/backend --include-workspace-root=false \
  && npm cache clean --force
COPY --from=backend /app/backend/dist ./backend/dist
COPY --from=frontend /app/frontend/dist ./frontend/dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://localhost:'+p+'/api/auth/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/index.js"]
