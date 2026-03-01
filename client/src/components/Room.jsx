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

const socket = io({
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isHostRef = useRef(searchParams.get("host") === "true");

  const peerRef = useRef(null);
  const callRef = useRef(null);

  const cameraStreamRef = useRef(null);
  const activeStreamRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // UI state
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteExpanded, setIsRemoteExpanded] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);

  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const screenStreamRef = useRef(null);

  // transcription / notes
  const recognitionRef = useRef(null);
  const transcriptLogRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState(null);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [notesError, setNotesError] = useState(null);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
    let peer;

    const init = async () => {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        const videoTrack = cameraStream.getVideoTracks()[0];
        setHasLocalVideo(videoTrack && videoTrack.readyState === "live");

        videoTrack.onended = () => setHasLocalVideo(false);

        cameraStreamRef.current = cameraStream;
        activeStreamRef.current = cameraStream;
        localVideoRef.current.srcObject = cameraStream;

        peer = new Peer(undefined, {
          config: {
            iceServers: [
              {
                urls: "stun:stun.relay.metered.ca:80",
              },
              {
                urls: "turn:standard.relay.metered.ca:80",
                username: "3254082a476a7fda8c59005c",
                credential: "yi1VQWa5L/RpCnB0",
              },
              {
                urls: "turn:standard.relay.metered.ca:80?transport=tcp",
                username: "3254082a476a7fda8c59005c",
                credential: "yi1VQWa5L/RpCnB0",
              },
              {
                urls: "turn:standard.relay.metered.ca:443",
                username: "3254082a476a7fda8c59005c",
                credential: "yi1VQWa5L/RpCnB0",
              },
              {
                urls: "turns:standard.relay.metered.ca:443?transport=tcp",
                username: "3254082a476a7fda8c59005c",
                credential: "yi1VQWa5L/RpCnB0",
              },
            ],
          },
        });

        peerRef.current = peer;

        peer.on("open", (id) => {
          socket.emit("join-room", roomId, id, isHostRef.current);
        });

        peer.on("call", (call) => {
          call.answer(activeStreamRef.current);
          callRef.current = call;

          call.on("stream", (remoteStream) => {
            remoteVideoRef.current.srcObject = remoteStream;
            const remoteVideoTrack = remoteStream.getVideoTracks()[0];
            setHasRemoteVideo(
              !!remoteVideoTrack && remoteVideoTrack.readyState === "live",
            );

            if (remoteVideoTrack) {
              remoteVideoTrack.onended = () => setHasRemoteVideo(false);
            }
          });
        });

        socket.on("user-connected", (userId) => {
          if (isHostRef.current) {
            startCall(userId, activeStreamRef.current);
          }
        });

        socket.on("user-disconnected", () => {
          alert("The other user has left the meeting");
          remoteVideoRef.current.srcObject = null;
          setIsRemoteExpanded(false);
        });

        socket.on("host-changed", (newHostId) => {
          if (peerRef.current?.id === newHostId) {
            isHostRef.current = true;
            alert("You are now the host");
          }
        });

        socket.on("room-full", () => {
          alert("Room already has 2 participants");
          navigate("/");
        });

        socket.on("camera-state", ({ enabled }) => {
          setHasRemoteVideo(enabled);
        });

        socket.on("transcript-chunk", (chunk) => {
          transcriptLogRef.current.push(chunk);
        });

        socket.on("room-not-found", () => {
          alert("Room not found");
          navigate("/");
        });
      } catch (err) {
        alert("Camera & microphone permission required: ", err);
        navigate("/");
      }
    };

    init();

    const escHandler = (e) => {
      if (e.key === "Escape") setIsRemoteExpanded(false);
    };
    window.addEventListener("keydown", escHandler);

    return () => {
      socket.off("user-connected");
      socket.off("user-disconnected");
      socket.off("room-not-found");
      socket.off("transcript-chunk");
      socket.off("host-changed");
      socket.off("room-full");

      peer?.destroy();
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      activeStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      window.removeEventListener("keydown", escHandler);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isRemoteExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => (document.body.style.overflow = "");
  }, [isRemoteExpanded]);

  /* -------------------------------------------------- */
  /* CALL HELPER */
  /* -------------------------------------------------- */
  const startCall = (userId, stream) => {
    callRef.current?.close();
    const call = peerRef.current.call(userId, stream);
    callRef.current = call;

    call.on("stream", (remoteStream) => {
      remoteVideoRef.current.srcObject = remoteStream;
      const remoteVideoTrack = remoteStream.getVideoTracks()[0];
      setHasRemoteVideo(
        !!remoteVideoTrack && remoteVideoTrack.readyState === "live",
      );

      if (remoteVideoTrack) {
        remoteVideoTrack.onended = () => setHasRemoteVideo(false);
      }
    });
  };

  /* -------------------------------------------------- */
  /* SCREEN SHARE */
  /* -------------------------------------------------- */
  const startScreenShare = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    screenStreamRef.current = screenStream;

    activeStreamRef.current = screenStream;
    localVideoRef.current.srcObject = screenStream;

    startCall(callRef.current.peer, screenStream);
    setIsScreenSharing(true);
    setHasLocalVideo(true);
    setIsMuted(false);
    setIsVideoOff(false);

    screenStream.getVideoTracks()[0].onended = stopScreenShare;
  };

  const stopScreenShare = async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    cameraStreamRef.current = cameraStream;
    activeStreamRef.current = cameraStream;
    localVideoRef.current.srcObject = cameraStream;

    setIsMuted(false);
    setIsVideoOff(false);

    startCall(callRef.current.peer, cameraStream);
    setIsScreenSharing(false);
  };

  /* -------------------------------------------------- */
  /* CONTROLS */
  /* -------------------------------------------------- */
  const toggleMute = () => {
    cameraStreamRef.current
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = isMuted));
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    setIsVideoOff((prev) => {
      const next = !prev;

      cameraStreamRef.current
        ?.getVideoTracks()
        .forEach((t) => (t.enabled = !next));

      screenStreamRef.current
        ?.getVideoTracks()
        .forEach((t) => (t.enabled = !next));

      setHasLocalVideo(!next);
      socket.emit("camera-state", {
        roomId,
        enabled: !next,
      });

      return next;
    });
  };

  const stopStream = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (e) {
        console.log("error: ", e);
      }
    });
  };

  const leaveCall = () => {
    stopStream(screenStreamRef.current);
    stopStream(cameraStreamRef.current);
    stopStream(activeStreamRef.current);

    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    activeStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    callRef.current?.close();
    peerRef.current?.destroy();
    socket.emit("leave-room", roomId, peerRef.current?.id, isHostRef.current);
    socket.disconnect();
    navigate("/");
  };

  /* -------------------------------------------------- */
  /* TRANSCRIPTION */
  /* -------------------------------------------------- */
  const startTranscription = () => {
    if (isRecording) return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim();
        const chunk = {
          text,
          timestamp: Date.now(),
          speakerId: peerRef.current.id,
        };
        transcriptLogRef.current.push(chunk);
        socket.emit("transcript-chunk", roomId, chunk);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const stopTranscription = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  /* -------------------------------------------------- */
  /* NOTES */
  /* -------------------------------------------------- */
  const generateNotes = async () => {
    if (!transcriptLogRef.current.length) {
      return alert("No transcript available");
    }

    setIsGeneratingNotes(true);
    setNotesError(null);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptLogRef.current }),
      });

      const data = await res.json();
      if (data.error) throw new Error();

      setMeetingNotes(data);
      setNotesCollapsed(true);
    } catch {
      setNotesError("Failed to generate notes");
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  /* -------------------------------------------------- */
  /* UI */
  /* -------------------------------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex flex-col items-center p-4 pb-32 text-white">
      <div className="absolute inset-0 -z-10 bg-purple-500/5 blur-3xl" />

      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold mb-2">Meeting Room</h2>
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>ID: {roomId}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(roomId);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      {/* Videos */}
      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="relative w-80 h-60">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full bg-black rounded-xl border border-white/10 shadow-lg"
          />

          {!hasLocalVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-xl">
              <VideoOff size={28} />
            </div>
          )}
        </div>

        <div
          className={`transition-all duration-300 ${
            isRemoteExpanded
              ? "fixed inset-0 z-[90] bg-black flex items-center justify-center"
              : "relative"
          }`}
        >
          {/* Expand / Collapse */}
          <button
            onClick={() => setIsRemoteExpanded((v) => !v)}
            className="absolute top-4 right-4 z-[95] bg-black/60 text-white p-2 rounded-lg"
          >
            {isRemoteExpanded ? "✕" : "⛶"}
          </button>

          {/* Remote Audio Mute */}
          <button
            onClick={() => {
              if (!remoteVideoRef.current) return;
              remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
              setIsRemoteMuted((v) => !v);
            }}
            className="absolute top-4 right-14 z-[95] bg-black/60 text-white p-2 rounded-lg"
          >
            {isRemoteMuted ? "🔇" : "🔊"}
          </button>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onDoubleClick={() => setIsRemoteExpanded((v) => !v)}
            className={`bg-black transition-all duration-300 ${
              isRemoteExpanded
                ? "w-full h-full object-contain"
                : "w-80 h-60 rounded-xl border border-white/10 shadow-lg"
            }`}
          />

          {!hasRemoteVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl text-gray-300">
              <VideoOff size={32} />
              <span className="text-sm mt-2">Camera Off</span>
            </div>
          )}
        </div>
      </div>

      {/* Notes loading */}
      {isGeneratingNotes && (
        <div className="mt-6 text-sm text-gray-300">
          Generating AI meeting notes…
        </div>
      )}

      {/* Notes */}
      {meetingNotes && (
        <div className="mt-6 bg-gray-900/80 backdrop-blur border border-white/10 rounded-2xl max-w-3xl w-full shadow-xl">
          <button
            onClick={() => setNotesCollapsed((v) => !v)}
            className="w-full flex items-center justify-between p-5"
          >
            <h3 className="font-semibold">📝 AI-Assisted Meeting Notes</h3>
            <span>{notesCollapsed ? "▼" : "▲"}</span>
          </button>

          {!notesCollapsed && (
            <div className="px-5 pb-5 space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-1">Action Items</h4>
                <ul className="list-disc ml-5">
                  {meetingNotes.actions?.map((a, i) => (
                    <li key={i}>
                      [{a.speakerId}] {a.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Decisions</h4>
                <ul className="list-disc ml-5">
                  {meetingNotes.decisions?.map((d, i) => (
                    <li key={i}>
                      [{d.speakerId}] {d.text}
                    </li>
                  ))}
                </ul>
              </div>

              {meetingNotes.summary && (
                <div className="italic text-gray-300">
                  {meetingNotes.summary}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {notesError && (
        <div className="mt-4 bg-red-700 text-white p-3 rounded">
          ⚠️ {notesError}
        </div>
      )}

      {/* Controls */}
      {!isRemoteExpanded && (
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

            {/* Screen Share */}
            <div className="relative group">
              <button
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`p-3 md:p-4 rounded-2xl transition-all duration-200 ${
                  isScreenSharing
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {isScreenSharing ? (
                  <XCircle size={22} />
                ) : (
                  <MonitorUp size={22} />
                )}
              </button>
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-black text-white text-[10px] md:text-xs py-1 px-2 rounded whitespace-nowrap">
                {isScreenSharing ? "Stop Share" : "Share Screen"}
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

            {/* Leave */}
            <button
              onClick={leaveCall}
              className="p-3 md:p-4 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-900/40"
            >
              <PhoneOff size={22} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Room;
