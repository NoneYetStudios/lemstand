# Production Dockerfile for Lemonade Stand (Fly.io / Render)
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY schema.sql ./
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts

# Generate static icons & sound assets and initialize directory for SQLite
RUN mkdir -p /data && node scripts/generateAssets.js

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/lemonadestand.db
ENV TRUST_PROXY=2
ENV ALLOWED_ORIGINS=*

EXPOSE 8080

CMD ["node", "backend/server.js"]
