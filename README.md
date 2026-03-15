# Anuvartan 🏥

**Anuvartan** (अनुवर्तन - "Following/Tracking/Follow-up") is an AI-powered post-surgery recovery monitoring platform that connects patients, nurses, and doctors for seamless healthcare coordination.

## 🌟 Features

- **Patient Recovery Monitoring**: Track pain levels, fever, wounds, and medication adherence post-surgery
- **AI Triage Nurse (AURA)**: Intelligent conversational assistant powered by Google Gemini API
- **Text-to-Speech**: Human-like voice responses via Eleven Labs API
- **Wound Analysis**: ML-based wound classification using TensorFlow Lite
- **Doctor Dashboard**: Monitor high-risk patients requiring escalation
- **Nurse Interface**: Visit tracking and patient escalation system
- **Risk Scoring**: Real-time calculation of patient infection/complication risk

## 📋 Project Structure

```
rgthg/
├── frontend/                 # Next.js React Application
│   ├── app/                 # Pages (patient, nurse, doctor dashboards)
│   ├── components/          # Reusable UI components
│   ├── data/               # Static data
│   └── package.json        # Frontend dependencies
│
├── service-node/           # Express.js Backend API
│   ├── index.js           # Main server with AI & TTS integration
│   ├── .env               # API keys (Gemini, Eleven Labs)
│   ├── patients.json      # Patient data store
│   └── package.json
│
├── service-python/        # FastAPI ML Service
│   ├── main.py           # Wound classification API
│   ├── wound_model.tflite # Pre-trained ML model
│   └── requirements.txt
│
└── README.md             # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Python 3.9+
- npm or yarn

### 1. Clone Repository
```bash
git clone https://github.com/ashishprajapati2006/Anuvartan.git
cd Anuvartan/rgthg
```

### 2. Backend Setup (Node.js)
```bash
cd service-node
npm install
```

Create `.env` file:
```env
GEMINI_API_KEY=your_gemini_api_key_here
ELEVEN_LABS_API_KEY=your_eleven_labs_api_key_here
```

Start the server:
```bash
npm start
# Server runs on http://localhost:5000
```

### 3. Python Service Setup
```bash
cd service-python
pip install -r requirements.txt
python main.py
# Service runs on http://localhost:8000
```

### 4. Frontend Setup (Next.js)
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:3001
```

## 🔐 Environment Variables

Create `.env` file in `service-node/`:

```env
# Google Gemini API Key (for AI responses)
GEMINI_API_KEY=AIzaSyDp2N92A02F9-0YBLR56IdykLfI5MkDsDU

# Eleven Labs API Key (for text-to-speech)
ELEVEN_LABS_API_KEY=sk_ce5b156e61a2f35038193b534c1af49e70ec13735115400f
```

Get your own keys:
- **Gemini**: https://makersuite.google.com/app/apikey
- **Eleven Labs**: https://elevenlabs.io/app/api-keys

## 🤖 AI Integration

### Gemini API (Chat)
- Powers the AURA virtual nurse assistant
- Handles post-surgery recovery questions
- Surgery-specific knowledge for advanced queries
- Endpoint: `POST /api/chat/message`

### Eleven Labs TTS
- Converts nurse responses to natural speech
- Female professional voice (Rachel)
- Endpoint: `POST /api/chat/speech`

### TensorFlow Lite (Wound Classification)
- Classifies wound types from images
- 10 wound categories
- Endpoint: `POST /predict/wound`

## 📡 API Endpoints

### Chat API
```
POST /api/chat/message
Content-Type: application/json

{
  "userId": "patient123",
  "message": "My pain is 7 out of 10"
}

Response: { "response": "That's moderate pain..." }
```

### Text-to-Speech API
```
POST /api/chat/speech
Content-Type: application/json

{
  "text": "Your recovery is on track."
}

Response: audio/mpeg (MP3 stream)
```

### Patient APIs
```
GET  /api/doctor/patients          # Get all patients (doctor view)
POST /api/patient/lookup           # Check if patient exists
POST /api/patient/login            # Patient login/registration
POST /api/patient/escalate         # Escalate to doctor
```

## 🏥 Use Cases

### Patient
- Daily recovery check-ins via chat
- Symptom tracking (pain, fever, wound status)
- Medication compliance monitoring
- Real-time risk alerts

### Nurse
- Monitor assigned patients
- Track visit schedules
- Escalate high-risk cases to doctors
- Get AI-recommended actions

### Doctor
- Dashboard of high-risk patients (RED code)
- Patient history and risk trends
- Comprehensive patient profiles
- Escalation notifications

## 📊 Risk Scoring Algorithm

Risk is calculated based on:
- **Pain level** (0-10 scale): 50% weight
- **Fever/Temperature**: 20% weight
- **Wound indicators** (discharge, redness, etc.): 30% weight

**Risk Bands:**
- 🟢 **GREEN** (0-40%): Routine monitoring
- 🟡 **YELLOW** (41-70%): Monitor closely, possible home visit
- 🔴 **RED** (71-100%): Urgent - contact doctor immediately

## 🛠️ Technology Stack

**Frontend:**
- Next.js 16 (React 19)
- TypeScript
- Tailwind CSS
- Firebase Auth

**Backend:**
- Node.js / Express.js
- Google Generative AI (Gemini)
- Eleven Labs TTS SDK
- Firebase Admin

**ML/Python:**
- FastAPI
- TensorFlow Lite
- Scikit-learn
- XGBoost

**Database:**
- Local JSON storage (patients.json)
- SQLite (optional)

## 📝 Known Issues

### "AI Unavailable" Error
✅ **FIXED** - Now uses mock AI responses when API keys are unavailable

### MetaMask Console Error
ℹ️ **NOT AN APP ERROR** - This is the MetaMask browser extension. Disable it in `chrome://extensions/` if it bothers you.

See [FIX_GUIDE.md](FIX_GUIDE.md) for detailed fixes.

## 🔄 Deployment

### Render / Railway
1. Push to GitHub
2. Connect repository
3. Set environment variables
4. Deploy

### Docker (Optional)
```bash
docker-compose up
```

## 📚 Documentation

- [FIX_GUIDE.md](FIX_GUIDE.md) - Troubleshooting and fixes
- API Docs: http://localhost:8000/docs (FastAPI Swagger)
- Next.js Docs: https://nextjs.org/docs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to GitHub
5. Create Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 👨‍💻 Author

**Ashish Prajapati** - [GitHub](https://github.com/ashishprajapati2006)

## 🎯 Roadmap

- [ ] Mobile app (React Native)
- [ ] Video consultations with doctors
- [ ] Medication reminder notifications
- [ ] Integration with electronic health records (EHR)
- [ ] Telemedicine dashboard
- [ ] Multi-language support
- [ ] Advanced analytics for healthcare providers

## 💬 Support

For issues or questions:
1. Check [FIX_GUIDE.md](FIX_GUIDE.md)
2. Open an GitHub Issue
3. Contact: anuvartan@healthcare.dev

---

**Made with ❤️ for post-surgery patient care**
