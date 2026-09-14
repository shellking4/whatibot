# Pinned Debian release: node:latest moved to Debian trixie, where several of these Chrome libs were renamed/removed
FROM node:22-bookworm-slim

# Runtime libraries for the Chrome that puppeteer downloads
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release tini wget xdg-utils && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /whatibot

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3009
# tini as PID 1 reaps the Chrome processes that get killed when a stuck WhatsApp client is restarted
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
