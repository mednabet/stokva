FROM node:20-alpine

# Build deps for native modules (bcrypt, serialport)
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

WORKDIR /app

# Install deps first for caching
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

# Auto-migrate on container start, then run server
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node src/server.js"]
