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

// Redirect root to new room
app.get("/", (req, res) => {
  res.redirect(`/room/${uuidV4()}`);
});

// Socket.io signaling
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userId);

    socket.on("offer", (offer, targetId) => {
      socket.to(roomId).emit("offer", offer, userId);
    });

    socket.on("answer", (answer, targetId) => {
      socket.to(roomId).emit("answer", answer, userId);
    });

    socket.on("ice-candidate", (candidate, targetId) => {
      socket.to(roomId).emit("ice-candidate", candidate, userId);
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
      // Optional: Clean up room if empty
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
