FROM node:22-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3100
CMD ["npm", "run", "dev", "--", "--port", "3100"]
