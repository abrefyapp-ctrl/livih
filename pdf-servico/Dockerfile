# livih-pdf: gerar o pacote antes (na raiz do repo): npm run pdf:build
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY servidor.mjs ./
COPY dist ./dist
USER node
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/saude || exit 1
CMD ["node", "servidor.mjs"]
