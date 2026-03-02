const { Server } = require("socket.io");
const port = process.env.PORT || 3000;
const io = new Server({ 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    } 
});

// Track available agents
let availableAgents = [];

// Track device assignments: deviceId -> { agentName, roomId }
const deviceAssignments = new Map();

// Manager socket
let managerSocket = null;

// Pending devices waiting for agent assignment
const pendingDevices = new Map();

io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);

    // --- MANAGER LOGIC ---
    socket.on('manager-register', () => {
        managerSocket = socket;
        socket.isManager = true;
        console.log(`📋 Manager registered: ${socket.id}`);
        
        // Send any pending devices
        pendingDevices.forEach((device, id) => {
            socket.emit('device-connecting', device);
        });
    });

    // --- AGENT LOGIC ---
    socket.on('register-agent', (data = {}) => {
        const agentInfo = {
            id: socket.id,
            name: data.name || 'agent',
            deviceId: data.deviceId || null
        };
        
        // Remove existing registration if any
        availableAgents = availableAgents.filter(a => a.id !== socket.id);
        availableAgents.push(agentInfo);
        
        socket.isAgent = true;
        socket.agentName = agentInfo.name;
        
        console.log(`🤖 Agent Registered: ${agentInfo.name} (${socket.id}). Pool: ${availableAgents.length}`);
        
        // If this agent was assigned to a device, connect them
        if (agentInfo.deviceId && deviceAssignments.has(agentInfo.deviceId)) {
            const assignment = deviceAssignments.get(agentInfo.deviceId);
            matchAgentToDevice(socket, agentInfo, assignment.deviceId);
        }
    });

    // --- CLIENT LOGIC (Dextral Player) ---
    socket.on('request-agent', (data = {}) => {
        const deviceId = socket.id;
        const deviceName = data.deviceName || `Device-${deviceId.substr(0, 6)}`;
        
        console.log(`🎧 ${deviceName} (${deviceId}) requesting agent...`);
        
        // Store pending device
        const deviceInfo = {
            id: deviceId,
            deviceName: deviceName,
            requestedAt: Date.now()
        };
        pendingDevices.set(deviceId, deviceInfo);
        
        // Notify manager
        if (managerSocket) {
            managerSocket.emit('device-connecting', deviceInfo);
        }
        
        // Tell device to wait
        socket.emit('waiting-for-agent', { 
            message: 'Connecting you to a DJ...' 
        });
    });

    // --- MANAGER: ASSIGN AGENT ---
    socket.on('assign-agent', (data) => {
        const { deviceId, agentName } = data;
        
        if (!pendingDevices.has(deviceId)) {
            console.log(`❌ No pending device: ${deviceId}`);
            return;
        }
        
        const deviceSocket = io.sockets.sockets.get(deviceId);
        if (!deviceSocket) {
            console.log(`❌ Device ${deviceId} disconnected`);
            pendingDevices.delete(deviceId);
            return;
        }
        
        const roomId = `session_${deviceId.substr(0, 8)}_${Date.now()}`;
        
        // Store assignment
        deviceAssignments.set(deviceId, {
            agentName: agentName,
            roomId: roomId
        });
        
        // Notify device
        deviceSocket.emit('agent-assigned', {
            agentName: agentName,
            roomId: roomId,
            message: `You're being connected to ${agentName}`
        });
        
        // Notify manager
        if (managerSocket) {
            managerSocket.emit('agent-assigned', {
                deviceId: deviceId,
                agentName: agentName,
                roomId: roomId
            });
        }
        
        pendingDevices.delete(deviceId);
        
        console.log(`✅ Assigned ${agentName} to device ${deviceId}`);
    });

    // --- AGENT: CONNECT TO ASSIGNED DEVICE ---
    socket.on('connect-to-device', (data) => {
        const { deviceId } = data;
        
        if (deviceAssignments.has(deviceId)) {
            const assignment = deviceAssignments.get(deviceId);
            const agentInfo = availableAgents.find(a => a.id === socket.id);
            if (agentInfo) {
                matchAgentToDevice(socket, agentInfo, deviceId);
            }
        }
    });

    // --- SIGNALING ---
    socket.on('signal', (data) => {
        socket.to(data.roomId).emit('signal', { 
            signalData: data.signalData, 
            senderId: data.senderId 
        });
    });

    // --- DISCONNECT ---
    socket.on("disconnect", () => {
        console.log(`❌ Disconnected: ${socket.id}`);
        
        if (socket.isManager) {
            managerSocket = null;
        }
        
        if (socket.isAgent) {
            availableAgents = availableAgents.filter(a => a.id !== socket.id);
            console.log(`🗑️ Agent ${socket.agentName} removed. Pool: ${availableAgents.length}`);
        }
        
        // Clean up pending device
        if (pendingDevices.has(socket.id)) {
            pendingDevices.delete(socket.id);
            if (managerSocket) {
                managerSocket.emit('device-disconnected', { deviceId: socket.id });
            }
        }
        
        deviceAssignments.delete(socket.id);
    });
});

function matchAgentToDevice(agentSocket, agentInfo, deviceId) {
    const assignment = deviceAssignments.get(deviceId);
    if (!assignment) return;
    
    const deviceSocket = io.sockets.sockets.get(deviceId);
    if (!deviceSocket) {
        console.log(`❌ Device ${deviceId} gone`);
        return;
    }
    
    const roomId = assignment.roomId;
    
    agentSocket.join(roomId);
    deviceSocket.join(roomId);
    
    agentSocket.emit('agent-connected', { 
        roomId: roomId, 
        clientId: deviceId 
    });
    
    deviceSocket.emit('agent-connected', {
        roomId: roomId,
        agentName: agentInfo.name
    });
    
    console.log(`🤝 ${agentInfo.name} connected to device ${deviceId}`);
}

io.listen(port);
console.log(`🚀 Dextral Relay Server running on port ${port}`);
