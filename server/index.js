require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const setupSockets = require('./sockets');
const apiRoutes = require('./routes/api');
const { startSimulation } = require('./services/simulationService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

const path = require('path');

app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Socket.io setup
setupSockets(io);

// MongoDB connection
const { MongoMemoryServer } = require('mongodb-memory-server');

async function connectDB() {
  try {
    let uri = process.env.MONGODB_URI;
    if (!uri || uri.includes('localhost')) {
      console.log('Using MongoDB Memory Server for local development...');
      const mongoServer = await MongoMemoryServer.create();
      uri = mongoServer.getUri();
    }
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Automatically seed mock data if collections are empty
    const { seedDatabase } = require('./seed');
    await seedDatabase();

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Start simulation
      startSimulation(io);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectDB();
