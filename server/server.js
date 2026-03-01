import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  transports: ["websocket"],
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Prevent caching of index.html
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

//cerebras api call to llama LLM for meeting notes
app.post("/api/summarize", async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({
        error: true,
        message: "Invalid transcript format",
      });
    }

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
      model: "gpt-oss-120b",
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

//socket.io
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId, isHost) => {
    if (isHost) {
      rooms.set(roomId, {
        host: userId,
        users: [userId],
      });

      socket.join(roomId);
    } else {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        if (room.users.length >= 2) {
          socket.emit("room-full");
          return;
        }
        room.users.push(userId);
        socket.join(roomId);
        socket.to(roomId).emit("user-connected", userId);
      } else {
        socket.emit("room-not-found");
        return;
      }
    }

    socket.on("offer", (offer, targetId) => {
      socket.to(roomId).emit("offer", offer, userId);
    });

    socket.on("answer", (answer, targetId) => {
      socket.to(roomId).emit("answer", answer, userId);
    });

    socket.on("ice-candidate", (candidate, targetId) => {
      socket.to(roomId).emit("ice-candidate", candidate, userId);
    });

    socket.on("ping-keepalive", () => {
      // keep connection alive
    });

    const handleUserLeave = (roomId, userId) => {
      const room = rooms.get(roomId);
      if (!room) return;

      room.users = room.users.filter((u) => u !== userId);
      if (room.host === userId) {
        if (room.users.length > 0) {
          room.host = room.users[0]; // next user to be host
          socket.to(roomId).emit("host-changed", room.host);
        } else {
          rooms.delete(roomId); // delete room when no users left
        }
      }
    };

    // for leave room button
    socket.on("leave-room", (roomId, userId, isHost) => {
      console.log("user leaving, ", userId);
    });

    //when page refresh or socket disconnect
    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected");
      handleUserLeave(roomId, userId);
    });

    //to sent transcript from one user to other
    socket.on("transcript-chunk", (roomId, chunk) => {
      socket.to(roomId).emit("transcript-chunk", chunk);
    });

    socket.on("camera-state", ({ roomId, enabled }) => {
      socket.to(roomId).emit("camera-state", { enabled });
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
