import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
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
  const isHostRef = useRef(searchParams.get("host") === "true");
  const streamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localScreenRef = useRef(null);
  const cameraCallRef = useRef(null);
  const navigate = useNavigate();
  const peerRef = useRef(null);

  const remoteScreenRef = useRef(null);
  const screenCallRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);

  const hasRendered = useRef(false);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect(); // 👈 reconnect
    }
    if (hasRendered.current) return;
    console.log("render started");
    let currentPeer;

    const init = async () => {
      try {
        //Ask for permissions FIRST
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        streamRef.current = stream;
        localVideoRef.current.srcObject = stream;

        //Create Peer only after stream exists
        currentPeer = new Peer();
        peerRef.current = currentPeer;

        //When peer is ready, join room
        currentPeer.on("open", (id) => {
          console.log("My peer ID:", id);
          socket.emit("join-room", roomId, id, isHostRef.current);
        });

        //Answer incoming calls with stream
        currentPeer.on("call", (call) => {
          const isScreen = call.metadata?.type === "screen";
          if (isScreen) {
            call.answer();
            screenCallRef.current = call;

            call.on("stream", (remoteStream) => {
              remoteScreenStreamRef.current = remoteStream;
              setIsRemoteScreenSharing(true);
            });

            call.on("close", () => {
              remoteScreenStreamRef.current = null;
              setIsRemoteScreenSharing(false);
            });
          } else {
            call.answer(streamRef.current);
            cameraCallRef.current = call;

            call.on("stream", (remoteStream) => {
              remoteVideoRef.current.srcObject = remoteStream;
            });
          }
        });

        //Host calls newly connected users
        socket.on("user-connected", (userId) => {
          console.log("second user is connecting");
          console.log(isHostRef.current, " and ", streamRef.current);
          if (isHostRef.current && streamRef.current) {
            console.log("sending stream");
            const call = currentPeer.call(userId, streamRef.current, {
              metadata: { type: "camera" },
            });
            cameraCallRef.current = call;
            call.on("stream", (remoteStream) => {
              remoteVideoRef.current.srcObject = remoteStream;
            });
          }
        });

        socket.on("user-disconnected", (userId) => {
          remoteVideoRef.current.srcObject = null;
          remoteScreenRef.current.srcObject = null;
          alert("User " + userId + " has left the call");
        });

        socket.on("host-changed", (newHostId) => {
          if (peerRef.current?.id === newHostId) {
            isHostRef.current = true;
            alert("You are now the host");
          }
        });

        socket.on("room-not-found", () => {
          alert("Room does not exist");
          navigate("/");
        });
      } catch (err) {
        console.error("Permission error:", err);
        alert("Camera & microphone permissions are required");
        navigate("/");
      }
    };

    init();
    hasRendered.current = true;

    return () => {
      socket.off("user-connected");
      socket.off("user-disconnected");
      socket.off("room-not-found");

      currentPeer?.destroy();

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isScreenSharing && localScreenRef.current && screenStreamRef.current) {
      localScreenRef.current.srcObject = screenStreamRef.current;
    }
    if (!isScreenSharing && localScreenRef.current) {
      localScreenRef.current.srcObject = null;
    }
    if (
      isRemoteScreenSharing &&
      remoteScreenRef.current &&
      remoteScreenStreamRef.current
    ) {
      remoteScreenRef.current.srcObject = remoteScreenStreamRef.current;
    }

    if (!isRemoteScreenSharing && remoteScreenRef.current) {
      remoteScreenRef.current.srcObject = null;
    }
  }, [isRemoteScreenSharing, isScreenSharing]);

  //Mute / Unmute
  const toggleMute = () => {
    const audioTracks = streamRef.current?.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) return;

    audioTracks.forEach((track) => {
      track.enabled = isMuted;
    });

    setIsMuted(!isMuted);
  };

  //Video ON / OFF
  const toggleVideo = () => {
    const videoTracks = streamRef.current?.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) return;

    videoTracks.forEach((track) => {
      track.enabled = isVideoOff;
    });

    setIsVideoOff(!isVideoOff);
  };

  // 🖥 Start screen share (SECOND CALL)
  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      screenStreamRef.current = screenStream;

      // 🔴 DO NOT touch localScreenRef here
      setIsScreenSharing(true);

      const call = peerRef.current.call(
        cameraCallRef.current.peer,
        screenStream,
        { metadata: { type: "screen" } }
      );

      screenCallRef.current = call;

      screenStream.getVideoTracks()[0].onended = stopScreenShare;
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const stopScreenShare = () => {
    screenCallRef.current?.close();
    screenCallRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    // 👉 clear only screen preview
    if (localScreenRef.current) {
      localScreenRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
  };

  const leaveCall = () => {
    // Stop media
    streamRef.current?.getTracks().forEach((track) => track.stop());

    // Notify server
    socket.emit("leave-room", roomId, peerRef.current?.id, isHostRef.current);

    // Destroy peer
    peerRef.current?.destroy();
    hasRendered.current = false;
    socket.disconnect();

    // Navigate out
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4">
      <h2 className="text-white text-2xl mb-4">Room: {roomId}</h2>

      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="w-80 h-60 bg-black rounded"
        />

        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-80 h-60 bg-black rounded"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-4">
        {isScreenSharing && (
          <video
            ref={localScreenRef}
            autoPlay
            muted
            playsInline
            className="w-80 h-60 bg-black rounded"
          />
        )}

        {isRemoteScreenSharing && (
          <video
            ref={remoteScreenRef}
            autoPlay
            playsInline
            className="w-80 h-60 bg-black rounded"
          />
        )}
      </div>

      {/* 🎛 Controls */}
      <div className="flex gap-4">
        <button
          onClick={toggleMute}
          className={`px-4 py-2 rounded text-white ${
            isMuted ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        <button
          onClick={toggleVideo}
          className={`px-4 py-2 rounded text-white ${
            isVideoOff ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {isVideoOff ? "Turn Video On" : "Turn Video Off"}
        </button>

        <button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          className="px-4 py-2 bg-blue-600"
        >
          {isScreenSharing ? "Stop Share" : "Share Screen"}
        </button>

        <button
          onClick={leaveCall}
          className="px-4 py-2 rounded text-white bg-red-700 hover:bg-red-800"
        >
          Leave Call
        </button>
      </div>
    </div>
  );
}

export default Room;
