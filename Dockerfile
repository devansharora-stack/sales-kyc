# Use official Node.js 20 slim image for better compatibility with native modules
FROM node:20-bullseye-slim AS base
WORKDIR /app

# Build stage: install dev deps and build the Next.js app
FROM base AS builder
WORKDIR /app

# Build-time args (available only during build).
# Only include values here that are required to produce the built assets.
# WARNING: ARG values can be provided at build time but should NOT contain
# secrets that must remain private unless you explicitly understand the risk.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXTAUTH_URL
# Optional: if you pre-render content at build time using external AI or APIs,


# Export them as env vars inside the builder stage so `npm run build` can see them.
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}

# Copy package manifests and install all dependencies (including dev) for build
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production image: install only production dependencies and run as non-root
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy package manifests and install only production dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --production

# Copy built assets and public files from the builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Optional: copy other runtime files (if your project reads these at runtime)
COPY --from=builder /app/next.config.js ./next.config.js

# Use built-in non-root user provided by the Node image for security
USER node

EXPOSE 3000
CMD ["npm", "start"]
