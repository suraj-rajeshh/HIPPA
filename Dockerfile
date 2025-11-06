FROM node:20-alpine

# Install necessary build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY lerna.json ./
COPY packages/*/package*.json ./packages/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Expose ports for local development
EXPOSE 3000 4000 8000

# Start development server
CMD ["npm", "run", "start:dev"]