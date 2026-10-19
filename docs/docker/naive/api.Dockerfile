# BASELINE ONLY: the "before" image for the size comparison. Do not use.
# Single stage, full Node image, dev dependencies kept, runs as root.
FROM node:24
WORKDIR /app
COPY . .
RUN npm install
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build
RUN cd src && find generated -type f ! -name '*.ts' -exec cp --parents {} ../dist/ \;
CMD ["node", "dist/index.js"]
