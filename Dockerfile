FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Debug: List files to verify src/database exists
RUN ls -la src/ && ls -la src/database/ || echo "WARNING: src/database NOT FOUND"

EXPOSE 3000

CMD ["node", "src/server.js"]
