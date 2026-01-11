FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=development

# Install dependencies needed for some node modules
RUN apk add --no-cache libc6-compat

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Expose port
EXPOSE 3000

CMD ["npm", "run", "dev"]
