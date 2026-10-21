# Multi-stage build for production deployment
# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy only necessary files from builder
COPY --from=builder --chown=nodejs:nodejs /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package*.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Switch to non-root user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server.js"]

# Metadata
LABEL org.opencontainers.image.title="Claude Router API"
LABEL org.opencontainers.image.description="Intelligent Claude API router optimizing token usage"
LABEL org.opencontainers.image.version="1.0.0"
