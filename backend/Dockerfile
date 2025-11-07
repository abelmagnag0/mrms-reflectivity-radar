FROM node:20-bookworm-slim

RUN set -eux; \
  apt-get update; \
  for i in 1 2 3; do \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-venv \
      libeccodes0 \
      libeccodes-dev \
      && break || (echo "APT install failed, retry $i" && sleep 2); \
  done; \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json ./package.json
RUN npm install --only=production

COPY backend/requirements.txt ./requirements.txt
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --upgrade pip setuptools wheel \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

ENV PATH="/opt/venv/bin:$PATH"

COPY backend/src ./src

ENV NODE_ENV=production \
    PORT=8080 \
    PYTHON_EXECUTABLE=python3 \
    MONGO_URI=mongodb://mongo:27017 \
    MONGO_DB=radar

EXPOSE 8080

CMD ["node", "src/server.js"]
