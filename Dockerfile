# Backend image for Render. Unlike Render's plain Node runtime, this installs the
# compilers/interpreters the backend shells out to (via compile-run), so C, C++,
# Java and Python programs can actually run on the server.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ default-jdk-headless python3 python-is-python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./
# backend/index.js does require('../src/Actions')
COPY src/Actions.js /app/src/Actions.js

ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "index.js"]