FROM node:22-alpine

WORKDIR /app

# Install the exact dependency tree from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Run development server and bind it to all interfaces so Docker can publish it.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
