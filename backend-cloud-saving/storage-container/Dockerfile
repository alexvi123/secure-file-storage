FROM node:18-alpine

# Crează directoarele de lucru
WORKDIR /app
RUN mkdir -p /app/storage
# Copiază fișierele de configurare
COPY package*.json ./
# Instalează dependențele
RUN npm install --production
# Copiază codul sursă
COPY . .
# Expune portul
EXPOSE 3000
# Definește variabile de mediu
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_PATH=/app/storage
# Rulează aplicația
CMD ["node", "app.js"]