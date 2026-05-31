FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm build

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
CMD ["start"]
