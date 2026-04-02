const { Server } = require("socket.io");
const port = process.env.PORT || 3000;
const io = new Server({
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});


// Track device assignments: deviceId -> { agentName, roomId }
const deviceAssignments = new Map();
// Stable device ID routing
const socketToDeviceId = new Map();
const deviceIdToSocketId = new Map();

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

        // Send current active connections
        deviceAssignments.forEach((assignment, deviceId) => {
            socket.emit('active-connection', {
                deviceId: deviceId,
                agentName: assignment.agentName,
                roomId: assignment.roomId
            });
        });
    });

    // Manager asking for current state
    socket.on('get-state', () => {
        const state = {
            pending: Array.from(pendingDevices.values()),
            active: []
        };
        deviceAssignments.forEach((assignment, deviceId) => {
            state.active.push({
                deviceId: deviceId,
                agentName: assignment.agentName,
                roomId: assignment.roomId
            });
        });
        socket.emit('state', state);
    });

    // --- CLIENT LOGIC (Dextral Player) ---
    socket.on('request-agent', (data = {}) => {
        const stableDeviceId = String(data.deviceId || socket.id);
        const deviceName = data.deviceName || `Device-${stableDeviceId.substr(0, 6)}`;

        console.log(`🎧 ${deviceName} (${stableDeviceId}) requesting agent...`);
        socketToDeviceId.set(socket.id, stableDeviceId);
        deviceIdToSocketId.set(stableDeviceId, socket.id);

        // Store pending device
        const deviceInfo = {
            id: stableDeviceId,
            socketId: socket.id,
            deviceName: deviceName,
            requestedAt: Date.now()
        };
        pendingDevices.set(stableDeviceId, deviceInfo);

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

        const pendingDevice = pendingDevices.get(deviceId);
        const targetSocketId = pendingDevice?.socketId || deviceIdToSocketId.get(deviceId);
        const deviceSocket = io.sockets.sockets.get(targetSocketId);
        if (!deviceSocket) {
            console.log(`❌ Device ${deviceId} disconnected`);
            pendingDevices.delete(deviceId);
            deviceIdToSocketId.delete(deviceId);
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

        // Clean up pending device
        const stableDeviceId = socketToDeviceId.get(socket.id) || socket.id;
        if (pendingDevices.has(stableDeviceId)) {
            pendingDevices.delete(stableDeviceId);
            if (managerSocket) {
                managerSocket.emit('device-disconnected', { deviceId: stableDeviceId });
            }
        }

        deviceAssignments.delete(stableDeviceId);
        socketToDeviceId.delete(socket.id);
        deviceIdToSocketId.delete(stableDeviceId);
    });

    // --- CLIENT MESSAGE ---
    socket.on("client-message", (data) => {
        const stableDeviceId = socketToDeviceId.get(socket.id) || socket.id;
        if (managerSocket) {
            managerSocket.emit("client-message", {
                deviceId: socket.id,
                stableUserId: stableDeviceId,
                message: data.message
            });
        }
    });

    // --- MANAGER RESPONSE ---
    socket.on("server-message", (data) => {
        const { deviceId, message } = data;

        const deviceSocket = io.sockets.sockets.get(deviceId);
        if (deviceSocket) {
            deviceSocket.emit("server-message", { message });
        }
    });
});

io.listen(port);
console.log(`🚀 Dextral Relay Server running on port ${port}`);