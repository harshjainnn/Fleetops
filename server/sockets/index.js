module.exports = function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    // We can handle specific client-to-server events here if needed
  });
};
