import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Peer from "peerjs";
import io from "socket.io-client";

const socket = io("/", {
  // Use relative URL to use Vite proxy
  reconnection: true,
  reconnectionAttempts: 5,
});

function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get("host") === "true";
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peer = useRef(null);

  useEffect(() => {
    peer.current = new Peer();

    peer.current.on("open", (id) => {
      console.log("My peer ID:", id);
      socket.emit("join-room", roomId, id);
    });

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;

        peer.current.on("call", (call) => {
          call.answer(stream);
          call.on("stream", (remoteStream) => {
            remoteVideoRef.current.srcObject = remoteStream;
          });
        });

        socket.on("user-connected", (userId) => {
          if (isHost) {
            setTimeout(() => {
              const call = peer.current.call(userId, stream);
              call.on("stream", (remoteStream) => {
                remoteVideoRef.current.srcObject = remoteStream;
              });
            }, 1000);
          }
        });

        socket.on("user-disconnected", () => {
          remoteVideoRef.current.srcObject = null;
        });
      });

    return () => {
      socket.off("user-connected");
      socket.off("user-disconnected");
      peer.current.destroy();
    };
  }, [roomId, isHost]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4">
      <h2 className="text-white text-2xl mb-4">Room: {roomId}</h2>
      <div className="flex flex-col md:flex-row gap-4">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          className="w-80 h-60 bg-black rounded"
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          className="w-80 h-60 bg-black rounded"
        />
      </div>
    </div>
  );
}

export default Room;
