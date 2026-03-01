const { Server } = require("socket.io");

// Render uses the PORT environment variable to tell Node where to listen
const port = process.env.PORT || 3000;

const io = new Server({
    cors: {
        origin: "*", // allow connections from anywhere
        methods: ["GET", "POST"]
    }
});

// Track available AI DJs (Agents)
let availableAgents = [];

io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);

    // --- AGENT LOGIC (The AI DJ) ---
    socket.on('register-agent', () => {
        // Prevent duplicate registrations
        if (!availableAgents.includes(socket.id)) {
            availableAgents.push(socket.id);
            socket.isAgent = true; // Tag it
            console.log(`🤖 Agent Registered: ${socket.id}. Total Available: ${availableAgents.length}`);
        }
    });

    // --- CLIENT LOGIC (Dextral Player) ---
    socket.on('request-agent', () => {
        console.log(`🎧 Client ${socket.id} requesting an Agent...`);

        if (availableAgents.length === 0) {
            console.log(`⚠️ No agents available for Client ${socket.id}. Telling client to wait.`);
            socket.emit('match-failed', { error: 'No AI DJs are currently online.' });
            return;
        }

        // Pop an Agent off the pool
        const assignedAgentId = availableAgents.shift();

        // Generate a unique 1-on-1 private room ID based on the Client
        const privateRoomId = `session_${socket.id.substring(0, 8)}`;

        // Put both the Client and the assigned Agent into the private room
        socket.join(privateRoomId);

        // The Agent socket object might not be accessible directly if we scale,
        // but for a single Node instance, we can instruct the specific agent to join:
        const agentSocket = io.sockets.sockets.get(assignedAgentId);

        if (agentSocket) {
            agentSocket.join(privateRoomId);
            console.log(`🤝 Matched! Agent ${assignedAgentId} assigned to Client ${socket.id} in room: ${privateRoomId}`);

            // Tell the Agent it was assigned to a session so it can generate the WebRTC Offer
            agentSocket.emit('agent-assigned', { roomId: privateRoomId, clientId: socket.id });

            // Tell the Client they got an Agent
            socket.emit('agent-found', { roomId: privateRoomId });
        } else {
            // Edge case: Agent dropped offline the exact millisecond we popped it
            console.log(`❌ Agent ${assignedAgentId} disappeared before matchmaking could finish!`);
            socket.emit('match-failed', { error: 'Assigned Agent dropped offline. Try again.' });
        }
    });

    // --- WEBRTC SIGNALING (For both Agents and Clients inside their private room) ---
    socket.on('signal', (data) => {
        // data contains { roomId, signalData, senderId }
        // We broadcast it to the EXACT room, but io.to() handles that securely.
        socket.to(data.roomId).emit('signal', {
            signalData: data.signalData,
            senderId: data.senderId
        });
    });

    // --- DISCONNECT HANDLING ---
    socket.on("disconnect", () => {
        console.log(`❌ Disconnected: ${socket.id}`);

        // If an Agent disconnected, remove them from the available pool
        if (socket.isAgent) {
            availableAgents = availableAgents.filter(id => id !== socket.id);
            console.log(`🗑️ Agent ${socket.id} removed from pool. Total Available: ${availableAgents.length}`);
        }
    });

}); // Close io.on('connection')

io.listen(port);
console.log(`🚀 Dextral Relay Server running on port ${port}`);
