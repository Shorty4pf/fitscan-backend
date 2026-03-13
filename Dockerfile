# FitScan Backend - image pour déploiement
FROM node:22-alpine

WORKDIR /app

# Fichiers de dépendances
COPY package.json package-lock.json* ./

# Installation des dépendances (sans dev)
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Code source (TOUT le projet : server.js + routes/ + services/ + utils/)
COPY server.js ./
COPY routes ./routes
COPY services ./services
COPY utils ./utils

# Port exposé (Railway, Render, etc. injectent PORT)
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
