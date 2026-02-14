import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidV4 } from "uuid";
import { Github, Video, Sparkles } from "lucide-react";

function LandingPage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");

  const createRoom = () => {
    const id = uuidV4();
    setRoomId(id);
    navigate(`/room/${id}?host=true`);
  };

  const joinRoom = () => {
    if (
      roomId &&
      roomId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    ) {
      navigate(`/room/${roomId}`);
    } else {
      alert("Invalid Room ID");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex flex-col">
      {/* 🔗 GitHub Link */}
      <a
        href="https://github.com/PrasanthCoder/MeetMe"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-4 flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
      >
        <Github size={18} />
        View Code
      </a>

      {/* 🌟 Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl md:text-5xl font-bold mb-4 font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          MeetMe
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-6">
          Secure, real-time video calls with
          <span className="text-white font-medium">
            {" "}
            AI-powered meeting notes
          </span>
        </p>

        {/* Feature row */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <Video size={16} /> Video & Screen Sharing
          </div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} /> Smart AI Summary
          </div>
        </div>

        {/* Actions */}
        <div className="w-full max-w-md space-y-4">
          <button
            onClick={createRoom}
            className="w-full bg-green-600 hover:bg-green-500 transition px-6 py-3 rounded-xl font-medium shadow-lg"
          >
            Start a New Call
          </button>

          <div className="flex">
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 px-4 py-3 rounded-l-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={joinRoom}
              className="bg-purple-600 hover:bg-purple-500 transition px-5 py-3 rounded-r-xl font-medium"
            >
              Join
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            Room ID is a UUID (auto-generated)
          </p>
        </div>
      </main>

      {/* 👤 Footer */}
      <footer className="text-center text-gray-500 text-sm py-4">
        Made with ❤️ by <span className="text-gray-300">Prasanth</span>
      </footer>
    </div>
  );
}

export default LandingPage;
