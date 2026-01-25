const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:5173", // Allow React app origin
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const { v4: uuidV4 } = require("uuid");

// Serve static files (optional for now, can host client separately)
app.use(express.static("../client/dist"));

const rooms = new Map(); // roomId -> { host: userId, users: [userId1, userId2] }

// Socket.io signaling
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId, isHost) => {
    if (isHost) {
      console.log("host is going in");
      rooms.set(roomId, {
        host: userId,
        users: [userId],
      });

      socket.join(roomId);
    } else {
      console.log("going in");
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.users.push(userId);
        socket.join(roomId);
        console.log("user-joined");
        socket.to(roomId).emit("user-connected", userId);
      } else {
        socket.emit("room-not-found");
        return;
      }
    }

    console.log("room: ", rooms.get(roomId));

    socket.on("offer", (offer, targetId) => {
      socket.to(roomId).emit("offer", offer, userId);
    });

    socket.on("answer", (answer, targetId) => {
      socket.to(roomId).emit("answer", answer, userId);
    });

    socket.on("ice-candidate", (candidate, targetId) => {
      socket.to(roomId).emit("ice-candidate", candidate, userId);
    });

    const handleUserLeave = (roomId, userId) => {
      const room = rooms.get(roomId);
      if (!room) return;

      room.users = room.users.filter((u) => u !== userId);
      console.log("coming to handle user leave");
      // If host left, assign new host
      if (room.host === userId) {
        console.log("oldhost: ", userId);
        if (room.users.length > 0) {
          room.host = room.users[0]; // promote next user
          console.log("new host: ", room.host);
          socket.to(roomId).emit("host-changed", room.host);
        } else {
          rooms.delete(roomId); // no users left
        }
      }
    };
    // for leave room button
    socket.on("leave-room", (roomId, userId, isHost) => {
      console.log("you are leaving room, ", userId);
    });

    //when page refresh or socket disconnect
    socket.on("disconnect", () => {
      console.log("you came to disconnect");
      socket.to(roomId).emit("user-disconnected", userId);
      handleUserLeave(roomId, userId);
      console.log("room: ", rooms.get(roomId));
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
