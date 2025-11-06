#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting local development environment..."

# Start Docker containers
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Initialize DynamoDB tables
echo "🏗️ Creating DynamoDB tables..."
npm run init-dynamodb

# Initialize PostgreSQL schema
echo "🗃️ Creating PostgreSQL schema..."
npm run init-database

# Seed data
echo "🌱 Seeding test data..."
npm run seed-data

echo "✅ Local development environment is ready!"
echo "
Services available at:
- API Gateway: http://localhost:3000
- AppSync: http://localhost:4000
- DynamoDB Admin: http://localhost:8001
- PostgreSQL: localhost:5432

Environment variables set:
- DYNAMODB_ENDPOINT=http://localhost:8000
- POSTGRES_HOST=localhost
- POSTGRES_PORT=5432
- POSTGRES_DB=healthcare
- POSTGRES_USER=healthcare_user
"