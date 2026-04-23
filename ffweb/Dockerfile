# Build stage for Angular app
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build -- --configuration production

# Production stage
FROM node:20-alpine

# Install supervisor, nginx, and MariaDB server
RUN apk add --no-cache supervisor nginx mariadb mariadb-client

# Create directories
RUN mkdir -p /var/log/supervisor /var/cache/nginx /var/run/nginx /run/mysqld /docker-entrypoint-initdb.d \
    && chown -R mysql:mysql /run/mysqld /var/lib/mysql

# Copy built Angular application
COPY --from=build /app/dist/ffweb/browser /usr/share/nginx/html

# Copy backend code
COPY backend /app/backend
COPY docker/start-mysql.sh /usr/local/bin/start-mysql.sh
COPY docker/start-backend.sh /usr/local/bin/start-backend.sh
WORKDIR /app/backend

# Install backend dependencies
RUN npm ci --omit=dev

# Ensure the startup scripts are executable
RUN chmod +x /usr/local/bin/start-mysql.sh /usr/local/bin/start-backend.sh

# Copy nginx configuration
RUN echo 'server {\
    listen 80;\
    server_name localhost;\
    root /usr/share/nginx/html;\
    index index.html;\
    \
    location /api/ {\
        proxy_pass http://127.0.0.1:3000/api/;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_cache_bypass $http_upgrade;\
    }\
    \
    location / {\
        try_files $uri $uri/ /index.html;\
    }\
}' > /etc/nginx/http.d/default.conf

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisord.conf

# Keep MariaDB data on a mountable path for Rancher Desktop / attached volumes
VOLUME ["/var/lib/mysql"]

# Expose port 80
EXPOSE 80

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
