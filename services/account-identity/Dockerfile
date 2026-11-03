FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY schema.sql ./schema.sql
COPY archive-v3.sql ./archive-v3.sql
COPY archive-operations.sql ./archive-operations.sql
COPY archive-permissions.sql ./archive-permissions.sql
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
