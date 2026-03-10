#
# Cabby Dockerfile (generic example)
#
# Multi-stage build that produces a small runtime image
# running `npm start` (Nitro / TanStack Start server).
#

FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only what is needed to run the built app
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output

# Default network configuration (can be overridden at runtime)
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]

