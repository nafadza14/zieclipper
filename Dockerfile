# Use node:18-slim as the base image
FROM node:18-slim

# Install system dependencies: python3, pip, ffmpeg, curl
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Copy Python requirements and install Python dependencies
COPY api/requirements.txt ./api/requirements.txt
RUN pip3 install --no-cache-dir -r api/requirements.txt --break-system-packages

# Copy the rest of the application code
COPY . .

# Set environment variables for production
ENV NODE_ENV=production

# Build Next.js app
RUN npm run build

# Expose ports (Next.js runs on PORT env, default to 8000 if not set)
ENV PORT=8000
EXPOSE 8000

# Start both services
CMD ["npm", "run", "start:prod"]
