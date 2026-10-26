FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci
COPY shared ./shared
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
RUN npm --prefix server run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /workspace/server/dist ./dist
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8788/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/index.js"]
