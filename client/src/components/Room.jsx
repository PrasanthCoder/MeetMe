import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import Peer from "peerjs";
import io from "socket.io-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  FileText,
  Sparkles,
  PhoneOff,
  XCircle,
} from "lucide-react";

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
  const ScreenRef = useRef(null);
  const cameraCallRef = useRef(null);
  const navigate = useNavigate();
  const peerRef = useRef(null);

  const screenCallRef = useRef(null);
  const screenStreamRef = useRef(null); // Local screen stream
  const remoteScreenStreamRef = useRef(null); // Remote screen stream

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSomeoneElseSharing, setIsSomeoneElseSharing] = useState(false);

  // 🎙 Distributed transcription
  const recognitionRef = useRef(null);
  const transcriptLogRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState(null);

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
              setIsScreenSharing(true);
              setIsSomeoneElseSharing(true);
            });

            call.on("close", () => {
              remoteScreenStreamRef.current = null;
              setIsScreenSharing(false);
              setIsSomeoneElseSharing(false);
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
          setIsScreenSharing(false);
          setIsSomeoneElseSharing(false);
          alert("User " + userId + " has left the call");
        });

        socket.on("host-changed", (newHostId) => {
          if (peerRef.current?.id === newHostId) {
            isHostRef.current = true;
            alert("You are now the host");
          }
        });

        socket.on("transcript-chunk", (chunk) => {
          console.log(chunk);
          transcriptLogRef.current.push(chunk);
        });

        socket.on("screen-share-started", (sharerId) => {
          if (peerRef.current?.id !== sharerId) {
            setIsSomeoneElseSharing(true);
          }
        });

        socket.on("screen-share-stopped", () => {
          setIsSomeoneElseSharing(false);
          setIsScreenSharing(false); // Clean up remote view
        });

        socket.on("screen-share-denied", (message) => {
          alert(message);
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
      socket.off("transcript-chunk");

      currentPeer?.destroy();

      streamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isScreenSharing && ScreenRef.current && screenStreamRef.current) {
      console.log("screenRef.current: ", ScreenRef.current);
      ScreenRef.current.srcObject = screenStreamRef.current;
    }
    if (!isScreenSharing && ScreenRef.current) {
      ScreenRef.current.srcObject = null;
    }
    if (isScreenSharing && ScreenRef.current && remoteScreenStreamRef.current) {
      ScreenRef.current.srcObject = remoteScreenStreamRef.current;
    }
  }, [isScreenSharing]);

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
    if (isSomeoneElseSharing) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      screenStreamRef.current = screenStream;

      socket.emit("request-screen-share", roomId, peerRef.current.id);

      // 🔴 DO NOT touch ScreenRef here
      setIsScreenSharing(true);

      const call = peerRef.current.call(
        cameraCallRef.current.peer,
        screenStream,
        { metadata: { type: "screen" } },
      );

      screenCallRef.current = call;

      screenStream.getVideoTracks()[0].onended = stopScreenShare;
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const stopScreenShare = () => {
    socket.emit("stop-screen-share-server", roomId);
    screenCallRef.current?.close();
    screenCallRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    // 👉 clear only screen preview
    if (ScreenRef.current) {
      ScreenRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
  };

  const leaveCall = () => {
    // Stop media
    streamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());

    // Notify server
    socket.emit("leave-room", roomId, peerRef.current?.id, isHostRef.current);

    // Destroy peer
    peerRef.current?.destroy();
    hasRendered.current = false;
    socket.disconnect();

    // Navigate out
    navigate("/");
  };

  const startTranscription = () => {
    if (isRecording) return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition not supported in this browser");
      return;
    }

    console.log("recogniton starts");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim();

        const chunk = {
          text,
          timestamp: Date.now(),
          speakerId: peerRef.current.id,
        };

        // Store locally
        transcriptLogRef.current.push(chunk);
        console.log(transcriptLogRef.current);
        // Send to peer
        socket.emit("transcript-chunk", roomId, chunk);
      }
    };

    recognition.onend = () => {
      // auto-restart while recording
      if (isRecording) recognition.start();
    };

    recognition.start();
    recognitionRef.current = recognition;
    console.log(recognitionRef.current);
    setIsRecording(true);
  };

  const stopTranscription = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  };

  const generateNotes = async () => {
    if (transcriptLogRef.current.length === 0)
      return alert("No transcript available.");

    setIsRecording(false); // Stop recording

    try {
      const response = await fetch("http://localhost:3000/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptLogRef.current }),
      });

      const data = await response.json();
      setMeetingNotes(data); // This now sets the summary, actions, and decisions from Gemini
    } catch (err) {
      console.error("AI Error:", err);
    }
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
            ref={ScreenRef}
            autoPlay
            muted
            playsInline
            className="w-80 h-60 bg-black rounded"
          />
        )}
      </div>

      {meetingNotes && (
        <div className="mt-6 bg-gray-800 p-4 rounded text-white max-w-3xl">
          <h3 className="text-xl mb-2">📝 AI-Assisted Meeting Notes</h3>

          <h4 className="font-semibold">Action Items</h4>
          <ul className="list-disc ml-6">
            {meetingNotes.actions.map((a, i) => (
              <li key={i}>
                [{a.speakerId}] {a.text}
                <span className="text-sm text-gray-400 ml-2">
                  ({a.confidence})
                </span>
              </li>
            ))}
          </ul>

          <h4 className="font-semibold mt-4">Decisions</h4>
          <ul className="list-disc ml-6">
            {meetingNotes.decisions.map((d, i) => (
              <li key={i}>
                [{d.speakerId}] {d.text}
              </li>
            ))}
          </ul>

          <h4 className="font-semibold mt-4"></h4>

          {meetingNotes.summary && (
            <div className="mb-4 italic text-gray-300">
              <h4 className="font-semibold text-white">Summary:</h4>
              {meetingNotes.summary}
            </div>
          )}
        </div>
      )}

      {/* 🎛 Controls 
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
          disabled={isSomeoneElseSharing && isScreenSharing}
          className={`px-4 py-2 ${
            isSomeoneElseSharing && isScreenSharing
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-blue-600"
          }`}
        >
          {isSomeoneElseSharing
            ? "Sharing Locked"
            : isScreenSharing
              ? "Stop Share"
              : "Share Screen"}
        </button>

        <button
          onClick={isRecording ? stopTranscription : startTranscription}
          className={`px-4 py-2 rounded text-white ${
            isRecording ? "bg-yellow-600" : "bg-gray-600"
          }`}
        >
          {isRecording ? "Stop Notes" : "Start Notes"}
        </button>

        <button
          onClick={generateNotes}
          className="px-4 py-2 bg-purple-600 text-white rounded"
        >
          Generate Notes
        </button>

        <button
          onClick={leaveCall}
          className="px-4 py-2 rounded text-white bg-red-700 hover:bg-red-800"
        >
          Leave Call
        </button>
      </div>
      */}

      <div className="fixed bottom-0 left-0 right-0 flex justify-center p-6 z-[100] pointer-events-none">
        <div className="pointer-events-auto flex flex-row items-center gap-2 md:gap-4 bg-gray-900/90 backdrop-blur-xl p-3 md:p-4 rounded-3xl border border-white/10 shadow-2xl transition-all">
          {/* Mute Button */}
          <div className="relative group">
            <button
              onClick={toggleMute}
              className={`p-3 md:p-4 rounded-2xl transition-all duration-200 ${
                isMuted
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-black text-white text-[10px] md:text-xs py-1 px-2 rounded">
              {isMuted ? "Unmute" : "Mute"}
            </span>
          </div>

          {/* Video Button */}
          <div className="relative group">
            <button
              onClick={toggleVideo}
              className={`p-3 md:p-4 rounded-2xl transition-all duration-200 ${
                isVideoOff
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-black text-white text-[10px] md:text-xs py-1 px-2 rounded whitespace-nowrap">
              Camera
            </span>
          </div>

          {/* Screen Share - Your working logic */}
          <div className="relative group">
            <button
              onClick={
                isScreenSharing && !isSomeoneElseSharing
                  ? stopScreenShare
                  : startScreenShare
              }
              disabled={isSomeoneElseSharing}
              className={`p-3 md:p-4 rounded-2xl transition-all duration-200 ${
                isSomeoneElseSharing
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed opacity-50"
                  : isScreenSharing
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                    : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isScreenSharing && !isSomeoneElseSharing ? (
                <XCircle size={22} />
              ) : (
                <MonitorUp size={22} />
              )}
            </button>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-black text-white text-[10px] md:text-xs py-1 px-2 rounded whitespace-nowrap">
              {isSomeoneElseSharing
                ? "Sharing Locked"
                : isScreenSharing
                  ? "Stop Share"
                  : "Share Screen"}
            </span>
          </div>

          {/* Notes Button */}
          <div className="relative group">
            <button
              onClick={isRecording ? stopTranscription : startTranscription}
              className={`p-3 md:p-4 rounded-2xl transition-all duration-200 ${
                isRecording
                  ? "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <FileText size={22} />
            </button>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-black text-white text-[10px] md:text-xs py-1 px-2 rounded">
              Notes
            </span>
          </div>

          {/* Summary Button */}
          <div className="relative group">
            <button
              onClick={generateNotes}
              className="p-3 md:p-4 rounded-2xl bg-purple-500/20 text-purple-400 hover:bg-purple-500/40 transition-all"
            >
              <Sparkles size={22} />
            </button>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-black text-white text-[10px] md:text-xs py-1 px-2 rounded">
              Summary
            </span>
          </div>

          <div className="w-[1px] h-8 bg-white/10 mx-1" />

          {/* Leave Button */}
          <button
            onClick={leaveCall}
            className="p-3 md:p-4 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-900/40"
          >
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Room;
