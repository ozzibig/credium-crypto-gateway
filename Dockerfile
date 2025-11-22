FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all source files
COPY . .

# Verify critical files exist
RUN echo "=== Verifying Build ===" && \
    echo "Files in /app:" && \
    ls -la && \
    echo "\n=== Files in src/ ===" && \
    ls -la src/ && \
    echo "\n=== Files in src/database/ ===" && \
    ls -la src/database/ && \
    echo "\n=== Verifying critical files ===" && \
    test -f src/server.js && echo "✓ src/server.js exists" || (echo "✗ src/server.js MISSING" && exit 1) && \
    test -f src/database/connection.js && echo "✓ src/database/connection.js exists" || (echo "✗ src/database/connection.js MISSING" && exit 1) && \
    test -f src/database/setup.js && echo "✓ src/database/setup.js exists" || (echo "✗ src/database/setup.js MISSING" && exit 1) && \
    echo "\n=== Build verification complete ==="

EXPOSE 3000

CMD ["node", "src/server.js"]
