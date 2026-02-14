import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidV4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";
import cors from "cors";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  }),
);

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static("../client/dist"));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/api/summarize", async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || !Array.isArray(transcript)) {
      return res.status(400).json({ error: "Invalid transcript format" });
    }

    // Format transcript: "Speaker ID: text"
    const formattedTranscript = transcript
      .map((t) => `Speaker ${t.speakerId}: ${t.text}`)
      .join("\n");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are a meeting assistant. Based on the transcript below, provide a summary in JSON format.
      Return ONLY the JSON with this structure. Also refer the spreakers not with the id, but person 1 and person 2:
      {
        "actions": [{"text": "task string", "speakerId": "id"}],
        "decisions": [{"text": "decision string", "speakerId": "id"}],
        "summary": "one paragraph overview"
      }
      
      Transcript:
      ${formattedTranscript}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Clean up potential markdown code blocks from AI response
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error("Invalid JSON from Gemini:", cleanJson);
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    res.json(parsed);
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Failed to process transcript" });
  }
});

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

    socket.on("transcript-chunk", (roomId, chunk) => {
      console.log(chunk);
      socket.to(roomId).emit("transcript-chunk", chunk);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
