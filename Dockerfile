# FitScan Backend - image pour déploiement
FROM node:22-alpine

WORKDIR /app

# Dépendances d'abord (meilleur cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Tout le code (server.js, routes/, services/, utils/, tests/) en une fois.
# services/ doit contenir : openai.js, nutrition.js, healthScore.js, barcode.js
# .dockerignore exclut node_modules, .env, .git, etc.
COPY . .

# Port exposé (Railway, Render, etc. injectent PORT)
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
