const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ElevenLabsClient } = require("elevenlabs");

const app = express();
const PORT = 5000;

// ─── Local JSON data store ────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'patients.json');

function readPatients() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to read patients.json:', e.message);
        return [];
    }
}

function writePatients(patients) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(patients, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to write patients.json:', e.message);
    }
}
// ─────────────────────────────────────────────────────────────────────────────

console.log("Checking Gemini API Key:", process.env.GEMINI_API_KEY ? "Loaded ✅" : "Missing ❌");

// Initialize Gemini API
let geminiClient = null;
try {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_gemini_api_key_here") {
        geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log("✅ Gemini client initialized successfully");
    } else {
        console.error("❌ GEMINI_API_KEY is not set or is a placeholder. Set it to use Gemini AI.");
    }
} catch (err) {
    console.error("❌ Error initializing Gemini:", err.message);
}

// Initialize Eleven Labs API
let elevenLabsClient = null;
try {
    if (process.env.ELEVEN_LABS_API_KEY && process.env.ELEVEN_LABS_API_KEY !== "your_eleven_labs_api_key_here") {
        elevenLabsClient = new ElevenLabsClient({ apiKey: process.env.ELEVEN_LABS_API_KEY });
        console.log("✅ Eleven Labs client initialized successfully");
    } else {
        console.warn("⚠️  ELEVEN_LABS_API_KEY is not set. Text-to-speech will be unavailable.");
    }
} catch (err) {
    console.error("❌ Error initializing Eleven Labs:", err.message);
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const SYSTEM_PROMPT = `
You are ANUVARTAN, a virtual triage nurse assistant for post-surgery recovery monitoring.

=== CORE IDENTITY ===
Your name: ANUVARTAN (अनुवर्तन - "Following/Tracking/Follow-up")
Your role: Compassionate triage nurse helping patients recover safely at home
Your goal: Ask brief, focused questions to assess infection risk (pain, fever, wound condition)
Language: English (primary), supportive Gen-Z tone, like texting a trusted nurse

=== CRITICAL RULES (ENFORCE STRICTLY) ===

RULE 1: ONE QUESTION PER MESSAGE
- Ask exactly ONE short question at a time
- Wait for the patient's reply before asking the next question
- Do NOT ask follow-up questions in the same message
- Do NOT provide explanations unless asked

RULE 2: GREETING PROTOCOL
- If patient's first message is "Hi", "Hello", "Hey", or similar greeting:
  └─ Respond with EXACTLY: "How is your pain today on a scale of 0 to 10?"
  └─ Do NOT add emojis, explanations, or extra text

RULE 3: EMERGENCY OVERRIDE (HIGHEST PRIORITY)
- At ANY time, if patient mentions these keywords (even in long sentences):
  └─ "chest pain" OR "difficulty breathing" OR "severe bleeding" OR "hemorrhage"
  └─ IMMEDIATELY reply with EXACTLY: "EMERGENCY: Call 911 immediately."
  └─ Do NOT ask any other question in that turn

RULE 4: NO MEDICAL DIAGNOSIS
- NEVER say: "This IS an infection" or "This is NOT an infection"
- NEVER provide: Medical diagnosis, treatment plans, medication recommendations
- Instead, use phrases like:
  ├─ "This could be a warning sign. Please contact your nurse or doctor."
  └─ "This is worth monitoring closely. Your doctor should know."

RULE 5: OFF-TOPIC HANDLING
- If patient asks something unrelated to recovery:
  └─ Respond with: "I can only ask about your recovery and infection warning signs. How are you feeling now?"

RULE 6: SHORT & SIMPLE LANGUAGE
- Keep every message 1-2 sentences max (like WhatsApp)
- Use simple words, no medical jargon

=== ASSESSMENT AREAS (Internal Reference Only) ===
PAIN: Current level (0-10), changes, location
FEVER: Temperature, chills, weakness, sweating
WOUND: Redness, swelling, warmth, discharge color/smell, edge separation
OTHER RED FLAGS: Medication compliance, activity level, appetite, mood

=== ESCALATION LOGIC ===
IF pain > 7 for 2+ consecutive days → ALERT NURSE
IF fever > 38.5°C on Day 5-10 post-op → ALERT DOCTOR
IF wound draining pus or green discharge → ALERT DOCTOR
IF patient misses 2+ days of meds → ALERT NURSE
IF redness spreading or wound gaping → ALERT DOCTOR

=== IMAGE HANDLING ===
When patient uploads wound image:
1. Describe what you see (neutral, factual) - no diagnosis
2. Ask ONE follow-up question about the finding
3. Check for emergency signs

=== TONE ===
Be warm, supportive, like a trusted friend who happens to be a nurse.
Keep messages short like WhatsApp. 0-1 emoji per message max.
---
`;

// ─── API ENDPOINTS ────────────────────────────────────────────────────────────

// 1. GET ALL PATIENTS
app.get('/api/doctor/patients', (req, res) => {
    try {
        const patients = readPatients();
        res.json(patients);
    } catch (error) {
        console.error("Error fetching patients:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// 2. PATIENT LOOKUP BY NAME (called before login to check if patient exists)
app.post('/api/patient/lookup', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ found: false, error: "Name is required" });

    try {
        const patients = readPatients();
        const match = patients.find(p =>
            p.name.trim().toLowerCase() === name.trim().toLowerCase()
        );

        if (match) {
            return res.json({ found: true, patient: match });
        }
        return res.json({ found: false });
    } catch (error) {
        console.error("Lookup error:", error);
        res.status(500).json({ found: false, error: error.message });
    }
});

// 3. PATIENT LOGIN / SYNC (create new record)
app.post('/api/patient/login', (req, res) => {
    const { userId, name, age, condition } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    try {
        const patients = readPatients();
        const existing = patients.find(p => p.userId === userId);

        if (existing) {
            return res.json(existing);
        }

        // Create new patient record matching patients.json schema
        const newPatient = {
            userId,
            id: Date.now(),
            name: name || "Unknown",
            age: age || 30,
            condition: condition || "Post-Op",
            risk: 0,
            lastCheckup: new Date().toISOString().split('T')[0],
            profile: {
                sex: "Unknown",
                surgery_type: condition || "Post-Op",
                surgery_date: new Date().toISOString().split('T')[0],
                discharge_date: new Date().toISOString().split('T')[0],
                day_post_op: 1,
                primary_doctor: "Unassigned"
            },
            overall_status: {
                current_risk_score: 0,
                current_band: "GREEN",
                ai_flag: "New patient. Awaiting first check-in.",
                trend_summary: "No data yet."
            },
            today_aura: {
                summary: {
                    pain_score: 0,
                    fever_celsius: 37.0,
                    wound_status: "Pending Check-in",
                    meds_taken: false,
                    activity_level: "Unknown",
                    mood: 3
                },
                transcript: [
                    // Seed the opening AURA question so the first patient reply is matched correctly
                    {
                        from: "AURA",
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        text: `Hello ${name || 'there'}! I'm AURA, your recovery assistant. Let's start your check-in — how is your pain today on a scale of 0 to 10?`
                    }
                ],
                risk_analysis: {
                    risk_score: 0,
                    risk_band: "GREEN",
                    top_factors: [],
                    nurse_action_hint: "New patient — await first AURA check-in."
                }
            },
            daily_checkins: [],
            aura_recent_chats: []
        };

        patients.push(newPatient);
        writePatients(patients);
        return res.json(newPatient);

    } catch (error) {
        console.error("Login sync error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 4. ESCALATE PATIENT TO DOCTOR (Nurse Dashboard)
app.post('/api/patient/escalate', (req, res) => {
    const { patientId } = req.body;

    if (!patientId) return res.status(400).json({ error: "patientId is required" });

    try {
        const patients = readPatients();
        const idx = patients.findIndex(p => p.id === patientId);

        if (idx === -1) return res.status(404).json({ error: "Patient not found" });

        const patient = patients[idx];
        
        // Set risk to 75 (HIGH - RED CODE) so it appears in doctor dashboard (>70)
        patient.risk = 75;
        patient.overall_status.current_risk_score = 75;
        patient.overall_status.current_band = "RED";
        patient.overall_status.ai_flag = "🚨 Escalated to doctor by nurse";
        
        // Update AURA risk analysis
        patient.today_aura.risk_analysis.risk_score = 75;
        patient.today_aura.risk_analysis.risk_band = "RED";
        patient.today_aura.summary.wound_status = "🚨 ESCALATED TO DOCTOR";
        
        writePatients(patients);
        
        return res.json({
            success: true,
            message: `Patient ${patient.name} escalated to doctor dashboard`,
            patient: {
                id: patient.id,
                name: patient.name,
                risk: patient.risk,
                band: patient.overall_status.current_band
            }
        });

    } catch (error) {
        console.error("Escalation error:", error);
        res.status(500).json({ error: error.message });
    }
});


// ─── GEMINI AI FUNCTION ───────────────────────────────────────────────────────

// Use Gemini for all AI responses
async function getGeminiResponse(userMessage, transcript) {
    try {
        if (!geminiClient) {
            return null; // Fall back to mock if Gemini not available
        }

        const model = geminiClient.getGenerativeModel({ model: "gemini-pro" });
        
        // Build conversation history for Gemini
        const conversationHistory = transcript.slice(-8).map(t => ({
            role: t.from === "PATIENT" ? "user" : "model",
            parts: [{ text: t.text }]
        }));

        const chat = model.startChat({ history: conversationHistory });
        
        const systemContext = `${SYSTEM_PROMPT}

Always follow the CORE RULES and keep responses short (1-2 sentences max, like WhatsApp).`;

        const response = await chat.sendMessage(systemContext + "\n\nPatient: " + userMessage);
        const responseText = response.response.text();
        
        console.log("✅ Gemini response generated");
        return responseText;
    } catch (error) {
        console.error("❌ Gemini API Error:", error.message);
        return null; // Fall back to mock
    }
}

// ─── MOCK AI RESPONSE (Fallback when Groq unavailable) ────────────────────────
function getMockAIResponse(userMessage, patient) {
    const lowerMsg = userMessage.toLowerCase();
    
    // Extract patterns from patient data
    const summary = patient.today_aura?.summary || {};
    
    // Contextual mock responses
    if (lowerMsg.includes('pain') || lowerMsg.match(/^\d{1,2}$/)) {
        const painLevel = parseInt(userMessage.match(/\d+/)?.[0] || 5);
        if (painLevel > 7) return "I see you're in significant pain. This requires medical attention. Please reach out to your nurse immediately about pain management options.";
        if (painLevel > 4) return "That's moderate pain. It's important to follow your prescribed pain management. Keep monitoring and let me know if it worsens.";
        return "Good to hear your pain is manageable. Keep resting and taking your medications as prescribed.";
    }
    
    if (lowerMsg.includes('fever') || lowerMsg.includes('temp') || lowerMsg.includes('hot')) {
        if (lowerMsg.includes('yes') || lowerMsg.includes('high') || lowerMsg.includes('38') || lowerMsg.includes('39') || lowerMsg.includes('40')) {
            return "Elevated temperature is concerning. Please check with your doctor soon. In the meantime, stay hydrated and monitor your temperature regularly.";
        }
        return "Good, normal temperature is a positive sign. Continue monitoring and stay comfortable.";
    }
    
    if (lowerMsg.includes('wound') || lowerMsg.includes('discharge') || lowerMsg.includes('infection') || 
        lowerMsg.includes('pus') || lowerMsg.includes('smell') || lowerMsg.includes('swollen')) {
        return "Thank you for sharing about your wound. This information is important. Can you describe the color and thickness of any discharge you notice?";
    }
    
    if (lowerMsg.includes('medication') || lowerMsg.includes('medicine') || lowerMsg.includes('took')) {
        return "Great! Taking your medications on schedule is crucial for recovery. Make sure to follow the prescribed dosage and timing.";
    }
    
    if (lowerMsg.includes('hi') || lowerMsg.includes('hello') || lowerMsg.includes('hey')) {
        return `Hello! I'm AURA, your recovery assistant. How is your pain today on a scale of 0 to 10?`;
    }
    
    if (lowerMsg.includes('no') || lowerMsg.includes('none') || lowerMsg.includes('nope')) {
        return "Thank you for letting me know. That's helpful information for monitoring your recovery.";
    }
    
    if (lowerMsg.includes('yes') || lowerMsg.includes('yep') || lowerMsg.includes('yeah')) {
        return "I appreciate you confirming that. It helps me understand your condition better.";
    }
    
    // Default helpful response
    return "Thank you for sharing. Your recovery is important to me. What else can you tell me about how you're feeling today?";
}

// ─── TEXT-TO-SPEECH WITH ELEVEN LABS ──────────────────────────────────────────
async function generateSpeech(text) {
    try {
        if (!elevenLabsClient) {
            console.warn("⚠️  Eleven Labs not initialized. Speech generation unavailable.");
            return null;
        }

        // Use the default voice ID for Eleven Labs (Rachel)
        const response = await elevenLabsClient.generate({
            voice_id: "EXAVITQu4vr4xnSDxMaL", // Rachel - Professional female voice
            text: text,
            model_id: "eleven_monolingual_v1"
        });

        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of response) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);
        
        console.log("✅ Speech generated successfully");
        return audioBuffer;
    } catch (error) {
        console.error("❌ Eleven Labs speech generation error:", error.message);
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
function generateFinalVerdict(risk, band, pain, feverC, woundStatus = null) {
    if (band === 'RED') {
        let verdict = `🚨 **ALERT: RED CODE** 🚨\n\n*Risk Level: HIGH (${risk}%)*\n`;
        verdict += `Pain: ${pain}/10 | Temperature: ${feverC}°C`;
        if (woundStatus) verdict += ` | Wound: ${woundStatus}`;
        verdict += `\n\n⚠️ *Your condition needs immediate medical attention.*\n`;
        verdict += `➡️ **Please contact your doctor or visit the nearest hospital TODAY.**\n`;
        verdict += `Do not delay — your recovery team has been notified.\n`;
        verdict += `If you experience difficulty breathing or severe bleeding, call 911 immediately.`;
        return verdict;
    } else if (band === 'YELLOW') {
        let verdict = `⚠️ **CODE: YELLOW** ⚠️\n\n*Risk Level: MODERATE (${risk}%)*\n`;
        verdict += `Pain: ${pain}/10 | Temperature: ${feverC}°C`;
        if (woundStatus) verdict += ` | Wound: ${woundStatus}`;
        verdict += `\n\n📞 *You have some warning signs that need close monitoring.*\n`;
        verdict += `➡️ **Your nurse will reach out to schedule a visit.** Let's meet again tonight or early morning for a check-up.\n`;
        verdict += `✅ Keep taking your medications and rest well.\n`;
        verdict += `⛔ If pain worsens or fever increases, contact me immediately.`;
        return verdict;
    } else {
        let verdict = `✅ **CODE: GREEN** ✅\n\n*Risk Level: LOW (${risk}%)*\n`;
        verdict += `Pain: ${pain}/10 | Temperature: ${feverC}°C`;
        if (woundStatus) verdict += ` | Wound: ${woundStatus}`;
        verdict += `\n\n👍 *Great news! Your recovery is on track.*\n`;
        verdict += `➡️ **Let's meet again tonight or tomorrow morning** for your next check-in.\n`;
        verdict += `💊 Continue with your medications and activity as advised.\n`;
        verdict += `🔔 If anything changes unexpectedly — pain spikes, fever rises above 38.5°C, or wound looks different — reach out immediately!`;
        return verdict;
    }
}
// ─────────────────────────────────────────────────────────────────────────────

// 3. CHAT MESSAGE & AI PROCESSING
app.post('/api/chat/message', upload.single('image'), async (req, res) => {
    const { userId, message } = req.body;
    const file = req.file;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    // --- HANDLE IMAGE ---
    if (file) {
        try {
            const form = new FormData();
            form.append('file', file.buffer, { filename: file.originalname });

            let aiResponse;
            try {
                const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
                aiResponse = await axios.post(AI_SERVICE_URL + '/predict/wound', form, {
                    headers: { ...form.getHeaders() }
                });
            } catch (connErr) {
                console.error("Python Service Error:", connErr.message);
                return res.json({ response: "I'm having trouble analyzing the image right now (AI Service Offline). Please describe the wound in text." });
            }

            const { risk_score, status, confidence } = aiResponse.data;

            // Combine image risk with existing conversation risk
            const patients = readPatients();
            const idx = patients.findIndex(p => p.userId === userId);
            const existingRisk = idx !== -1 ? (patients[idx].risk || 0) : 0;
            const combinedRisk = Math.max(risk_score, existingRisk);
            const combinedBand = combinedRisk > 70 ? 'RED' : combinedRisk > 40 ? 'YELLOW' : 'GREEN';

            const pain   = idx !== -1 ? (patients[idx].today_aura?.summary?.pain_score   || 0)    : 0;
            const feverC = idx !== -1 ? (patients[idx].today_aura?.summary?.fever_celsius || 37.0) : 37.0;

        // Determine wound severity from AI analysis
        let woundSeverity = status;
        if (status === "Normal") {
            woundSeverity = "✅ Wound appears healthy";
        } else if (risk_score > 70) {
            woundSeverity = `🚨 ${status} (HIGH RISK)`;
        } else if (risk_score > 40) {
            woundSeverity = `⚠️ ${status} (MODERATE RISK)`;
        }

        const analysisMsg = {
            from: "AURA",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: `🔍 **Wound Analysis Result:**\n• Classification: ${woundSeverity}\n• AI Risk Assessment: ${risk_score}%\n• Confidence Level: ${confidence}%`
        };
        
        const verdictMsg = {
            from: "AURA",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: generateFinalVerdict(combinedRisk, combinedBand, pain, feverC, woundSeverity)
            }

            return res.json({ response: verdictMsg.text });

        } catch (error) {
            console.error("Image processing failed:", error);
            return res.json({ response: "Error processing image." });
        }
    }

    // --- HANDLE TEXT ---
    try {
        const patients = readPatients();
        const idx = patients.findIndex(p => p.userId === userId);
        if (idx === -1) return res.status(404).json({ error: "Patient not found. Please login first." });

        const patient = patients[idx];
        const transcript = patient.today_aura?.transcript || [];

        const userMsgObj = {
            from: "PATIENT",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: message
        };

        let botText = "I'm listening.";
        
        // Use Gemini for all AI responses
        try {
            console.log("🤖 Using Gemini API for response");
            const geminiText = await getGeminiResponse(message, transcript);
            if (geminiText) {
                botText = geminiText;
            } else {
                // Gemini failed, fall back to mock
                console.log("⚠️  Gemini failed, using mock response");
                botText = getMockAIResponse(message, patient);
            }
        } catch (err) {
            console.error("Error getting Gemini response:", err.message);
            botText = getMockAIResponse(message, patient);
        }

        // ── SMART RISK CALCULATION FROM FULL TRANSCRIPT CONTEXT ────────────────
        const updatedTranscript = [...transcript, userMsgObj];

        // 1. Extract PAIN: look for a bare number (0-10) right after a pain-scale AURA question
        let painScore = patient.today_aura?.summary?.pain_score || 0;
        for (let i = 0; i < updatedTranscript.length; i++) {
            const msg  = updatedTranscript[i];
            const prev = updatedTranscript[i - 1];
            if (msg.from === 'PATIENT' && prev?.from === 'AURA') {
                const prevLower = prev.text.toLowerCase();
                const isScaleQ  = prevLower.includes('scale') || prevLower.includes('pain') || prevLower.includes('0 to 10') || prevLower.includes('0-10');
                const numMatch  = msg.text.match(/\b([0-9]|10)\b/);
                if (isScaleQ && numMatch) painScore = Math.max(painScore, Number(numMatch[1]));
                // Also catch inline: "pain 7", "it's a 6", "about 8"
                const inlineMatch = msg.text.match(/(?:pain is|it'?s?|about|around|maybe)\s*(?:a\s*)?([0-9]|10)\b/i);
                if (inlineMatch) painScore = Math.max(painScore, Number(inlineMatch[1]));
            }
        }
        // Direct inline in current message
        const directPain = message.match(/\bpain\D{0,15}([0-9]|10)\b/i) || message.match(/\b([0-9]|10)\s*(?:out of|\/)?\s*10\b/i);
        if (directPain) painScore = Math.max(painScore, Number(directPain[1]));

        // Fallback: if a bare digit (1-10) appears in ANY of the first 6 patient messages
        // and we still haven't resolved pain, treat the first such number as pain score
        if (painScore === 0) {
            const earlyPatient = updatedTranscript.filter(t => t.from === 'PATIENT').slice(0, 6);
            for (const m of earlyPatient) {
                const bare = m.text.match(/^\s*([0-9]|10)\s*$/);
                if (bare) { painScore = Number(bare[1]); break; }
            }
        }

        // 2. Extract FEVER / TEMPERATURE
        let feverCelsius = patient.today_aura?.summary?.fever_celsius || 37.0;
        let feverConfirmed = false;
        const allPatientText = updatedTranscript.filter(t => t.from === 'PATIENT').map(t => t.text).join(' ');
        for (let i = 0; i < updatedTranscript.length; i++) {
            const msg  = updatedTranscript[i];
            const prev = updatedTranscript[i - 1];
            if (msg.from === 'PATIENT') {
                // Fahrenheit range 97–104 → convert
                const fMatch = msg.text.match(/\b(9[7-9]|10[0-4])(?:\.\d)?\b/);
                if (fMatch) { feverCelsius = Math.round(((Number(fMatch[1]) - 32) * 5/9) * 10) / 10; feverConfirmed = true; }
                // Celsius range 37.5+
                const cMatch = msg.text.match(/\b(3[7-9]\.[0-9]|40)\b/);
                if (cMatch) { feverCelsius = Number(cMatch[1]); feverConfirmed = true; }
                // "yes" to fever question
                if (prev?.from === 'AURA' && prev.text.toLowerCase().includes('fever') && /\byes\b/i.test(msg.text)) {
                    feverConfirmed = true;
                    if (feverCelsius < 37.5) feverCelsius = 38.0; // assume moderate if said yes without temp
                }
            }
        }

        // 3. WOUND RISK BONUS from patient messages + contextual yes/no
        const WOUND_KEYWORDS = {
            'yellow': 15, 'pus': 22, 'green': 18, 'discharge': 8,
            'swollen': 8, 'swelling': 8, 'redness': 7, ' red ': 5,
            'smell': 14, 'smelly': 14, 'foul': 20, 'thick': 10,
            'gaping': 16, 'open wound': 12, 'bleeding': 12, 'blood': 8,
            'pain when touch': 10, 'painful': 5, 'warm to': 8
        };
        // Keywords AURA might ask about — if patient says "yes", add the score
        const AURA_WOUND_TRIGGERS = {
            'thick':     10, 'smelly':   14, 'smell':    14, 'foul':   20,
            'gaping':    16, 'swollen':   8, 'redness':   7, 'pus':   22,
            'discharge':  8, 'bleeding': 12, 'green':    18, 'yellow': 15,
            'warm':       8
        };
        let woundBonus = 0;
        const patientMsgs = allPatientText.toLowerCase();
        const topWoundFactors = [];
        // Direct keyword match in patient messages
        for (const [kw, score] of Object.entries(WOUND_KEYWORDS)) {
            if (patientMsgs.includes(kw)) {
                woundBonus += score;
                topWoundFactors.push({ label: kw, score });
            }
        }
        // Contextual: if patient says "yes" to an AURA wound question
        for (let i = 0; i < updatedTranscript.length; i++) {
            const msg  = updatedTranscript[i];
            const prev = updatedTranscript[i - 1];
            if (msg.from === 'PATIENT' && prev?.from === 'AURA' && /\byes\b/i.test(msg.text)) {
                const prevLower = prev.text.toLowerCase();
                for (const [kw, score] of Object.entries(AURA_WOUND_TRIGGERS)) {
                    if (prevLower.includes(kw) && !patientMsgs.includes(kw)) {
                        woundBonus += score;
                        topWoundFactors.push({ label: kw + ' (confirmed)', score });
                    }
                }
            }
        }
        woundBonus = Math.min(woundBonus, 40); // cap at 40

        // 4. COMPUTE FINAL RISK
        const painRisk   = Math.min(100, Math.max(0, painScore * 8));
        const feverRisk  = Math.min(100, Math.max(0, (feverCelsius - 36.4) * 22));
        const baseRisk   = Math.round((painRisk * 0.5) + (feverRisk * 0.2) + (woundBonus * 0.3));
        const computedRisk = Math.min(100, Math.max(0, baseRisk + (woundBonus > 0 ? Math.round(woundBonus * 0.5) : 0)));
        const computedBand = computedRisk > 70 ? "RED" : computedRisk > 40 ? "YELLOW" : "GREEN";

        // 5. BUILD top_factors & nurse_action_hint
        const topFactors = [];
        if (painScore > 0) topFactors.push({ feature: `Pain ${painScore}/10`, impact: `+${Math.round(painRisk * 0.5)}%` });
        if (feverConfirmed || feverCelsius > 37.4) topFactors.push({ feature: `Fever ${feverCelsius}°C`, impact: `+${Math.round(feverRisk * 0.2)}%` });
        topWoundFactors.sort((a, b) => b.score - a.score).slice(0, 3).forEach(f => {
            topFactors.push({ feature: `Wound: ${f.label}`, impact: `+${Math.round(f.score * 0.5)}%` });
        });

        const hint = computedRisk > 70
            ? "URGENT: Patient shows critical symptoms. Contact doctor immediately for evaluation."
            : computedRisk > 40
                ? "Monitor closely. Consider home visit if symptoms worsen."
                : "Routine monitoring. Patient appears stable.";

        // ── CONVERSATION FLOW CONTROL ──────────────────────────────────────────
        const patientMsgCount    = updatedTranscript.filter(t => t.from === 'PATIENT').length;
        const hasWoundData       = woundBonus > 0 || /\b(no|normal|clean|healing|okay|fine)\b/i.test(patientMsgs);
        const conversationDone   = patientMsgCount >= 4 && painScore > 0 && hasWoundData;

        const photoAlreadyAsked  = transcript.some(t => t.from === 'AURA'    && t.text.toLowerCase().includes('photo'));
        const photoAlreadyDone   = transcript.some(t => t.from === 'AURA'    && t.text.includes('[Image Analysis]'));
        const verdictAlreadySent = transcript.some(t => t.from === 'AURA'    && t.text.includes('CODE:'));
        const preliminaryShown   = transcript.some(t => t.from === 'AURA'    && t.text.includes('PRELIMINARY RISK'));

        // Determine wound status from keywords
        let woundStatus = "Appears to be healing normally";
        if (woundBonus > 20) woundStatus = "Shows concerning signs (discharge/odor)";
        else if (woundBonus > 10) woundStatus = "Some minor concerns (redness/swelling)";
        else if (woundBonus === 0 && hasWoundData) woundStatus = "Appears clean and normal";

        if (!verdictAlreadySent) {
            // Step 0: Show preliminary risk analysis after collecting basic data
            if (patientMsgCount >= 3 && painScore > 0 && !preliminaryShown && computedBand !== 'GREEN') {
                botText = `📊 **PRELIMINARY RISK ANALYSIS**\n\n`;
                botText += `Based on what you've told me (Pain: ${painScore}/10, Temp: ${feverC}°C):\n`;
                if (computedBand === 'RED') {
                    botText += `• Your symptoms suggest **RED CODE** (High Risk)\n`;
                    botText += `• This requires immediate medical attention\n`;
                } else if (computedBand === 'YELLOW') {
                    botText += `• Your symptoms suggest **YELLOW CODE** (Moderate Risk)\n`;
                    botText += `• Close monitoring and possible home visit needed\n`;
                }
                botText += `📸 To give you the most accurate advice, I'd like to see your wound.\n\n`;
                botText += `Can you tap the 📎 **paperclip button** and send a clear photo of the wound area? Make sure the lighting is good.`;
            }
            // Step 1: Ask for wound photo (for RED/YELLOW without photo yet)
            else if (conversationDone && (computedBand === 'RED' || computedBand === 'YELLOW') && !photoAlreadyAsked && !photoAlreadyDone) {
                botText = `🔍 **Let me get a better picture of your wound.**\n\n`;
                if (computedBand === 'RED') {
                    botText += `Given your **RED CODE** status (pain ${painScore}/10, temp ${feverC}°C), I need to assess your wound closely.\n\n`;
                } else {
                    botText += `Since you're showing **YELLOW CODE** warning signs (pain ${painScore}/10, temp ${feverC}°C), let me evaluate your wound.\n\n`;
                }
                botText += `📸 Tap the **📎 paperclip button** below and send a photo of your wound.\n`;
                botText += `**Tips:** Good lighting, clear angle, show the entire wound area.`;
            }
            // Step 2: Final verdict (after photo or immediately for GREEN)
            else if (conversationDone && (photoAlreadyDone || computedBand === 'GREEN')) {
                botText = generateFinalVerdict(computedRisk, computedBand, painScore, feverCelsius, woundStatus);
            }
            // else: let the Groq AI response remain as botText
        }

        const botMsgObj = {
            from: "AURA",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: botText
        };

        // Update patient record and persist
        patients[idx].today_aura.transcript.push(userMsgObj, botMsgObj);
        patients[idx].risk                                      = computedRisk;
        patients[idx].today_aura.risk_analysis.risk_score       = computedRisk;
        patients[idx].today_aura.risk_analysis.risk_band        = computedBand;
        patients[idx].today_aura.risk_analysis.top_factors      = topFactors;
        patients[idx].today_aura.risk_analysis.nurse_action_hint = hint;
        patients[idx].today_aura.summary.pain_score             = painScore;
        patients[idx].today_aura.summary.fever_celsius          = feverCelsius;
        patients[idx].overall_status.current_risk_score         = computedRisk;
        patients[idx].overall_status.current_band               = computedBand;
        patients[idx].lastCheckup = new Date().toISOString().split('T')[0];

        writePatients(patients);
        res.json({ response: botText });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ response: "System error." });
    }
});

// ─── TEXT-TO-SPEECH ENDPOINT ──────────────────────────────────────────────────
app.post('/api/chat/speech', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }

    try {
        const audioBuffer = await generateSpeech(text);
        
        if (!audioBuffer) {
            return res.status(503).json({ error: "Speech generation failed. Try again later." });
        }

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', audioBuffer.length);
        res.send(audioBuffer);
        
    } catch (error) {
        console.error("Speech endpoint error:", error);
        res.status(500).json({ error: "Failed to generate speech" });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
    console.log(`📁 Data store: ${DATA_FILE}`);
});
