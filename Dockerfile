FROM node:18-slim

# Install FFmpeg and required dependencies for media handling
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for efficient caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Expose port for Express web server (/pair route)
EXPOSE 8000

# Start the bot
CMD ["npm", "start"]
