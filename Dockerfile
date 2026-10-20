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
ENV ALLOWED_ORIGINS=https://lemonadestand.stabthefinger.com

EXPOSE 8080

CMD ["node", "--no-warnings", "backend/server.js"]
