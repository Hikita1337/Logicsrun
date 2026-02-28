#!/bin/bash

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install it first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install it first."
    exit 1
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Install Node.js dependencies and build frontend
echo "Installing Node.js dependencies..."
npm install
echo "Building frontend..."
npm run build

# Start the server
echo "Starting server..."
python3 server.py &

echo "Application started!"
wait
