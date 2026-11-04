FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
RUN npm ci --omit=dev

FROM node:24-alpine
RUN apk add --no-cache tzdata
ENV TZ=America/Lima NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=10 --start-period=2s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.js"]
