FROM node:20.11-alpine

WORKDIR /app
RUN npm install -g typescript

COPY . .
RUN npm ci
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
