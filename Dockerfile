FROM node:20

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    make \
    g++ \
    pkg-config \
    libopus-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY gc.wav ./src/test.wav

CMD ["node", "src/index.js"]
