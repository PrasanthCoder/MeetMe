
# MeetMe 🎥✨

MeetMe is a real-time peer-to-peer video meeting application built using WebRTC, featuring screen sharing and AI-generated meeting summaries.

The application is designed to be lightweight, scalable, and privacy-friendly — media streams flow directly between participants without passing through the server.

---

## 🚀 Live Demo

👉 https://meetme-792737465626.europe-west1.run.app/

*(Best experienced on Chrome or Chromium-based browsers)*

---

## ✨ Features

- 🔗 Peer-to-peer video & audio calls (WebRTC)
- 🖥 Screen sharing with fullscreen support (desktop & mobile)
- 🧠 AI-powered meeting notes & summaries
- 📋 Action items and decisions extraction
- ⚡ Real-time signaling using Socket.io
- 🎨 Modern, responsive UI with Tailwind CSS
- ☁️ Deployed on Google Cloud Run

---

## 🧠 Architecture Overview

- **WebRTC (P2P)**  
  Audio, video, and screen-sharing streams are sent directly between participants.

- **Backend (Node.js + Express)**  
  Handles:
  - WebRTC signaling
  - Room coordination
  - AI summarization requests

- **AI Summarization**  
  Uses **Cerebras (LLaMA 3.3 70B)** to generate structured meeting notes.

👉 **No media bandwidth passes through the backend server.**

---

## 🛠 Tech Stack

### Frontend
- React + Vite
- Tailwind CSS
- WebRTC APIs
- Socket.io Client

### Backend
- Node.js
- Express
- Socket.io
- Cerebras Cloud SDK (LLaMA 3.3 70B)

### Deployment
- Google Cloud Run


## 🔐 Environment Variables

Create a `.env` file inside the `server` directory:

```env
CEREBRAS_API_KEY=your_cerebras_api_key_here
PORT=server_port

