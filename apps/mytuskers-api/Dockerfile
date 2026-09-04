FROM node:22-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY src ./src
EXPOSE 4100
CMD ["npm", "start"]
