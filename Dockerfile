# Debian-based image so local dev (Mac) matches production servers (Ubuntu).
# Node 22 (not 20): several deps in package-lock.json (@supabase/supabase-js,
# jsdom, @testing-library/jest-dom) require Node >=22 — Vercel's Next.js 16
# runtime is Node 22+ too, so this also keeps the Fluid Compute parity CLAUDE.md asks for.
FROM node:22-bookworm-slim AS base
# node:*-bookworm-slim is Debian-based, close enough to Ubuntu for parity on
# glibc/native-binary behavior. For exact Ubuntu parity instead, swap for:
# FROM ubuntu:22.04   and install node via apt/nvm manually.

WORKDIR /app

# System deps needed for Playwright browsers + native module builds (e.g. sharp, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Chromium only — playwright.config.ts only configures the chromium project.
# --with-deps pulls the OS libs Playwright needs beyond build-essential above.
RUN npx playwright install --with-deps chromium

COPY . .

# Next.js dev server default port
EXPOSE 3000

CMD ["npm", "run", "dev"]
