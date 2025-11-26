# syntax=docker/dockerfile:1

# Multi-stage build for the Journal.vet Next.js application.
# The resulting image runs the production server via Coolify.

FROM node:20-alpine AS base
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Next.js requires glibc compatibility on Alpine.
RUN apk add --no-cache libc6-compat \
&& corepack enable

FROM base AS deps

# Install dependencies based on the available lockfile.
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
elif [ -f package-lock.json ]; then npm ci; \
elif [ -f package.json ]; then npm install; \
fi

FROM base AS builder

ENV NODE_ENV=production

# Map Coolify build args to the env vars expected by the app during build.
ARG SUPABASE_URL
ARG SUPABASE_ANON
ENV NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Mirror the application into /app/app so Next.js can locate the expected `app` directory during the build.
COPY . ./app
# Ensure the public directory exists so the final copy step succeeds even if it is empty.
RUN mkdir -p public
RUN \
if [ -f pnpm-lock.yaml ]; then pnpm run build; \
elif [ -f yarn.lock ]; then yarn build; \
else npm run build; \
fi

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Map build args to runtime env as well (useful if any server code reads process.env at runtime).
ARG SUPABASE_URL
ARG SUPABASE_ANON
ENV NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON

RUN addgroup -g 1001 nodejs \
&& adduser -S -G nodejs -u 1001 nextjs

# Copy the compiled server (standalone output) and static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
