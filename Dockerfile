# Debian-based image so local dev (Mac) matches production servers (Ubuntu).
FROM node:20-bookworm-slim AS base
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

COPY . .

# Next.js dev server default port
EXPOSE 3000

CMD ["npm", "run", "dev"]
