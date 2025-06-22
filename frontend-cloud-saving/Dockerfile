# Dockerfile pentru frontend
FROM node:18-alpine AS build
WORKDIR /app
# Copiază fișierele de configurare
COPY package*.json ./
# Instalează dependențele
RUN npm install
# Copiază codul sursă
COPY . .
RUN npm run build

FROM nginx:alpine

# Copiază fișierele de configurare Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiază fișierele construite din etapa anterioară
COPY --from=build /app/dist /usr/share/nginx/html

# Expune portul
EXPOSE 80

# Rulează Nginx
CMD ["nginx", "-g", "daemon off;"]