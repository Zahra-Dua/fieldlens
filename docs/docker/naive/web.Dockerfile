# BASELINE ONLY: the "before" image for the size comparison. Do not use.
# Single stage: Node, all node_modules and the source stay in the image.
FROM node:24
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8080"]
