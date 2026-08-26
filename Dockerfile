FROM node:24-alpine

WORKDIR /app

ENV HOME=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8181
VOLUME ["/data"]

CMD ["node", "/app/cli.js", "web", "8181"]