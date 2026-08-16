# Imagen de producción: Next.js (Node) + Python3/Pillow para la generación
# de la imagen motivacional. Pensada para hosts tipo Railway/Render que
# soportan Dockerfile custom (Vercel no sirve aquí por la dependencia de Python).
FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip fonts-dejavu-core imagemagick \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir Pillow

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
