const { Server } = require("socket.io");

// Render uses the PORT environment variable to tell Node where to listen
const port = process.env.PORT || 3000;

const io = new Server({
    cors: {
        origin: "*", // allow connections from anywhere
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // Dextral Player and your AI DJ will send 'join-room' with your API key
    // This ensures only YOUR computers can find each other
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Client ${socket.id} joined room: ${roomId}`);
    });

    // The core WebRTC "Matchmaking" logic
    // When Dextral sends connection info, Relay passes it to the AI DJ, and vice versa.
    socket.on('signal', (data) => {
        // data contains { roomId, signalData }
        // We broadcast it to everyone else in the room (the other peer)
        socket.to(data.roomId).emit('signal', data.signalData);
    });

    socket.on("disconnect", () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });
});

io.listen(port);
console.log(`🚀 Dextral Relay Server running on port ${port}`);
