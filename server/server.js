import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidV4 } from "uuid";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/dist")));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

app.post("/api/summarize", async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({
        error: true,
        message: "Invalid transcript format",
      });
    }

    // Format transcript
    const formattedTranscript = transcript
      .map((t) => `Speaker ${t.speakerId}: ${t.text}`)
      .join("\n");

    const prompt = `
      You are a meeting assistant.

      Based on the transcript below, return ONLY valid JSON with this structure.
      Do NOT include markdown or explanations.

      {
        "actions": [{"text": "task string", "speakerId": "person 1"}],
        "decisions": [{"text": "decision string", "speakerId": "person 2"}],
        "summary": "one paragraph overview"
      }

      Rules:
      - Refer to speakers as "person 1", "person 2", etc (not raw IDs)
      - Be concise and accurate

      Transcript:
      ${formattedTranscript}
      `;

    const completion = await cerebras.chat.completions.create({
      model: "llama-3.3-70b",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (err) {
      console.error("Invalid JSON from Cerebras:", responseText);
      return res.status(500).json({
        error: true,
        message: "AI returned invalid JSON",
      });
    }

    res.json(parsed);
  } catch (error) {
    console.error("Cerebras Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to process transcript",
    });
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
