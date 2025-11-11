# Use an official Ubuntu as the base image
FROM node:latest

RUN apt-get update

RUN apt-get install -y gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget

# Update and install required dependencies
RUN apt-get update && \
    apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

RUN npm install -g pnpm

WORKDIR /whatibot

COPY package.json pnpm-lock.yaml ./
RUN npm install

COPY . .
COPY ./.wwebjs_auth ./wwebjs_auth
COPY ./.wwebjs_cache ./wwebjs_cache

RUN npm run build

EXPOSE 3009
CMD ["node", "dist/main.js"]