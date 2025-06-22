FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
# Copiere fișiere de configurare
COPY package*.json ./
# Instalare dependințe
RUN npm install --production
RUN npm rebuild bcrypt --build-from-source
# Copiere cod sursă
COPY . .
# Expunere port
EXPOSE 5000
# Setare variabile de mediu
ENV NODE_ENV=production
ENV PORT=5000
# Rulare aplicație
CMD ["node", "server.js"]