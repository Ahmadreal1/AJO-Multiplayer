# AJO production container
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Reproducible dependency installation
COPY package*.json ./

RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi && \
    npm cache clean --force

# Application files
COPY server.js ./
COPY server ./server
COPY public ./public
COPY data ./data
COPY scripts ./scripts
COPY docs ./docs
COPY .env.example ./.env.example
COPY .env.production.example ./.env.production.example

# Runtime directory
RUN mkdir -p /app/data && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
