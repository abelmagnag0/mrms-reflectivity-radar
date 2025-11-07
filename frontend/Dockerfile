FROM node:20-bullseye-slim AS build
WORKDIR /app
COPY frontend/package.json ./package.json
RUN npm install

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY frontend ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /srv/app
RUN npm i -g serve@14
COPY --from=build /app/dist ./dist

EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
