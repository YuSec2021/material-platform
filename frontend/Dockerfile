FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.html app.js styles.css server.js ./

ENV FRONTEND_PORT=5173
EXPOSE 5173

CMD ["node", "server.js"]
