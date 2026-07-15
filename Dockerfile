# syntax=docker/dockerfile:1
FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY package.json package-lock.json* ./
COPY web/package.json ./web/
COPY server/package.json ./server/

RUN npm install

COPY . .

RUN npm run build -w web

ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHON_BIN=python3

EXPOSE 3000

CMD ["node", "server/src/index.js"]
