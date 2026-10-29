FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY tests ./tests

EXPOSE 4000

CMD ["npm", "start"]
