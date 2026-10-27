FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY schema.sql ./schema.sql
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
