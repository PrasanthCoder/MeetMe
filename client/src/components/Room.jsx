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

  const [copied, setCopied] = useState(false);

  const screenCallRef = useRef(null);
  const screenStreamRef = useRef(null); // Local screen stream
  const remoteScreenStreamRef = useRef(null); // Remote screen stream

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSomeoneElseSharing, setIsSomeoneElseSharing] = useState(false);
  const [isScreenExpanded, setIsScreenExpanded] = useState(false);

  // 🎙 Distributed transcription
  const recognitionRef = useRef(null);
  const transcriptLogRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState(null);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [notesError, setNotesError] = useState(null);

  const hasRendered = useRef(false);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect(); // 👈 reconnect
    }
    if (hasRendered.current) return;
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
              setIsScreenExpanded(false);
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
          if (isHostRef.current && streamRef.current) {
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
          setIsScreenExpanded(false);
          alert("User " + userId + " has left the call");
        });

        socket.on("host-changed", (newHostId) => {
          if (peerRef.current?.id === newHostId) {
            isHostRef.current = true;
            alert("You are now the host");
          }
        });

        socket.on("transcript-chunk", (chunk) => {
          transcriptLogRef.current.push(chunk);
        });

        //future-maintenane if needed
        socket.on("screen-share-started", (sharerId) => {
          if (peerRef.current?.id !== sharerId) {
            setIsSomeoneElseSharing(true);
          }
        });

        //future-maintenane if needed
        socket.on("screen-share-stopped", () => {
          setIsSomeoneElseSharing(false);
          setIsScreenExpanded(false);
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

    const Screenhandler = (e) => {
      if (e.key === "Escape") setIsScreenExpanded(false);
    };
    window.addEventListener("keydown", Screenhandler);

    hasRendered.current = true;

    return () => {
      socket.off("user-connected");
      socket.off("user-disconnected");
      socket.off("room-not-found");
      socket.off("transcript-chunk");

      currentPeer?.destroy();

      streamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.removeEventListener("keydown", Screenhandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isScreenSharing && ScreenRef.current && screenStreamRef.current) {
      ScreenRef.current.srcObject = screenStreamRef.current;
    }
    if (!isScreenSharing && ScreenRef.current) {
      ScreenRef.current.srcObject = null;
    }
    if (isScreenSharing && ScreenRef.current && remoteScreenStreamRef.current) {
      ScreenRef.current.srcObject = remoteScreenStreamRef.current;
    }
  }, [isScreenSharing]);

  useEffect(() => {
    if (isScreenExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isScreenExpanded]);

  useEffect(() => {
    if (meetingNotes) {
      setNotesCollapsed(true);
    }
  }, [meetingNotes]);

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

  //Start screen share (SECOND CALL)
  const startScreenShare = async () => {
    if (isSomeoneElseSharing) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      screenStreamRef.current = screenStream;

      socket.emit("request-screen-share", roomId, peerRef.current.id);

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

    if (ScreenRef.current) {
      ScreenRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
    setIsScreenExpanded(false);
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

        //store transcript locally
        transcriptLogRef.current.push(chunk);
        //send transcript to peer
        socket.emit("transcript-chunk", roomId, chunk);
      }
    };

    recognition.onend = () => {
      // auto-restart while recording
      if (isRecording) recognition.start();
    };

    recognition.start();
    recognitionRef.current = recognition;
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
    setNotesError(null);
    setIsGeneratingNotes(true);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptLogRef.current }),
      });

      const data = await response.json();

      if (data.error) {
        setNotesError(data.message || "AI failed");
        setMeetingNotes(null);
        return;
      }

      setMeetingNotes(data);
    } catch (err) {
      console.error("AI Error:", err);
      setNotesError("Unable to reach AI service");
      setMeetingNotes(null);
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex flex-col items-center p-4 pb-32 text-white">
      <div className="absolute inset-0 -z-10 bg-purple-500/5 blur-3xl" />
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold mb-2">Meeting Room</h2>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span className="break-all">ID: {roomId}</span>

          <button
            onClick={() => {
              navigator.clipboard.writeText(roomId);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition text-gray-300"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      {/* camera feeds */}
      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="w-80 h-60 bg-black rounded-xl border border-white/10 shadow-lg"
        />

        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-80 h-60 bg-black rounded-xl border border-white/10 shadow-lg"
        />
      </div>

      {/* screen share feed */}
      {isScreenSharing && (
        <div
          className={`transition-all duration-300 ${
            isScreenExpanded
              ? "fixed inset-0 z-[90] bg-black flex items-center justify-center"
              : "relative"
          }`}
          style={
            isScreenExpanded
              ? {
                  width: "100dvw",
                  height: "100dvh",
                  paddingBottom: "env(safe-area-inset-bottom)",
                  paddingTop: "env(safe-area-inset-top)",
                }
              : undefined
          }
        >
          <button
            onClick={() => setIsScreenExpanded((v) => !v)}
            className="absolute top-4 right-4 z-[95] bg-black/60 text-white p-2 rounded-lg"
          >
            {isScreenExpanded ? "✕" : "⛶"}
          </button>

          <video
            ref={ScreenRef}
            autoPlay
            muted
            playsInline
            onDoubleClick={() => setIsScreenExpanded((v) => !v)}
            className={`bg-black transition-all duration-300 ${
              isScreenExpanded
                ? "w-full h-full object-contain"
                : "w-80 h-60 rounded-xl border border-white/10 shadow-lg"
            }`}
          />
        </div>
      )}

      {/* notes loaded */}
      {isGeneratingNotes && (
        <div className="mt-8 bg-gray-900/80 backdrop-blur border border-white/10 rounded-2xl p-5 text-white max-w-3xl w-full shadow-xl flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-300">
            Generating AI meeting notes… please wait
          </span>
        </div>
      )}

      {/* Notes generated by LLM - collapsable */}
      {meetingNotes && (
        <div className="mt-8 bg-gray-900/80 backdrop-blur border border-white/10 rounded-2xl text-white max-w-3xl w-full shadow-xl">
          {/* Header */}
          <button
            onClick={() => setNotesCollapsed((v) => !v)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <h3 className="text-lg font-semibold">
              📝 AI-Assisted Meeting Notes
            </h3>
            <span className="text-sm text-gray-400">
              {notesCollapsed ? "▼" : "▲"}
            </span>
          </button>

          {/* Content */}
          {!notesCollapsed && (
            <div className="px-5 pb-5 space-y-4">
              <div>
                <h4 className="font-semibold mb-1">Action Items</h4>
                <ul className="list-disc ml-6 space-y-1">
                  {meetingNotes.actions?.map((a, i) => (
                    <li key={i}>
                      [{a.speakerId}] {a.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Decisions</h4>
                <ul className="list-disc ml-6 space-y-1">
                  {meetingNotes.decisions?.map((d, i) => (
                    <li key={i}>
                      [{d.speakerId}] {d.text}
                    </li>
                  ))}
                </ul>
              </div>

              {meetingNotes.summary && (
                <div className="italic text-gray-300">
                  <h4 className="font-semibold text-white mb-1">Summary</h4>
                  {meetingNotes.summary}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {notesError && (
        <div className="mt-4 bg-red-700 text-white p-3 rounded max-w-3xl">
          ⚠️ {notesError}
        </div>
      )}

      {/* Controls buttons */}
      {!isScreenExpanded && (
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

            {/* Notes transcription Button */}
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
      )}
    </div>
  );
}

export default Room;
