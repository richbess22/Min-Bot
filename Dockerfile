# Use Node.js LTS
FROM node:20

# Create working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy rest of the project files
COPY . .

# Render exposes PORT automatically
EXPOSE 8000

# Start app (index.js is your entry)
CMD ["node", "index.js"]
