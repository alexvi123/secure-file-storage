# Dockerfile pentru backend
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copiază fișierele de configurare
COPY package*.json ./

# Instalează dependențele
RUN npm install --production
RUN npm rebuild bcrypt --build-from-source

# Copiază codul sursă
COPY . .

# Expune portul
EXPOSE 5000

# Setează variabilele de mediu
ENV NODE_ENV=production
ENV PORT=5000

# Rulează aplicația
CMD ["node", "server.js"]