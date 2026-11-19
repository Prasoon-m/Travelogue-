# --- Builder Stage ---
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

COPY . .

# Build NestJS application
RUN npm run build

# --- Runner Stage ---
FROM node:20-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Create directories for encrypted uploads and SQLite persistence
RUN mkdir -p /app/uploads /app/prisma

EXPOSE 4000

# Push database schema if needed and start the NestJS API
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]
