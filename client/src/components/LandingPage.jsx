import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidV4 } from "uuid";

function LandingPage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");

  const createRoom = () => {
    const id = uuidV4();
    navigator.clipboard.writeText(`http://localhost:5173/room/${id}`);
    setRoomId(id);
    navigate(`/room/${id}?host=true`);
  };

  const joinRoom = () => {
    if (
      roomId &&
      roomId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    ) {
      navigate(`/room/${roomId}`);
    } else {
      alert("Invalid Room ID");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-8">MeetMe</h1>
      <p className="text-lg mb-4">Secure, Anonymous P2P Video Calls</p>
      <button
        onClick={createRoom}
        className="bg-green-500 text-white px-6 py-3 rounded mb-4 hover:bg-green-600"
      >
        Start a New Call
      </button>
      <div className="flex">
        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="border p-2 rounded-l"
        />
        <button
          onClick={joinRoom}
          className="bg-blue-500 text-white px-4 py-2 rounded-r hover:bg-blue-600"
        >
          Join a Call
        </button>
      </div>
      <p className="mt-8 text-sm">End-to-end encrypted with WebRTC</p>
    </div>
  );
}

export default LandingPage;
