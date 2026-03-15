"use client"

import { Button, cn } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, Loader2, Paperclip, Send, UserCheck, UserPlus } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"

type Message = {
  id: string
  role: "bot" | "user"
  content: string
  type: "text" | "image"
  imageUrl?: string
}

type PatientRecord = {
  userId: string
  name: string
  age: number
  condition: string
  risk: number
  today_aura?: {
    transcript: Array<{ from: string; time: string; text: string }>
    risk_analysis: { risk_score: number; risk_band: string; nurse_action_hint: string }
  }
}

// ─── Onboarding Steps ────────────────────────────────────────────────────────
type Step = "ask_name" | "looking_up" | "returning_patient" | "new_patient_form" | "chat" | "error"

export function ChatInterface() {
  const [step, setStep]             = useState<Step>("ask_name")
  const [errorMsg, setErrorMsg]     = useState("")
  const [userName, setUserName]     = useState("")
  const [nameInput, setNameInput]   = useState("")
  const [userId, setUserId]         = useState("")
  const [patientRecord, setPatientRecord] = useState<PatientRecord | null>(null)

  // New patient onboarding fields
  const [newAge, setNewAge]         = useState("")
  const [newCondition, setNewCondition] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Step 1: Look up patient by name ────────────────────────────────────────
  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameInput.trim()) return

    setStep("looking_up")
    setUserName(nameInput.trim())

    try {
      const res  = await fetch("/api/patient/lookup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: nameInput.trim() }),
      })
      const data = await res.json()

      if (data.found && data.patient) {
        // ── Returning patient ──────────────────────────────────────────────
        const p = data.patient as PatientRecord
        setPatientRecord(p)
        setUserId(p.userId)

        // Pre-load existing transcript into chat messages
        const history: Message[] = (p.today_aura?.transcript || []).map((t, i) => ({
          id:      `history-${i}`,
          role:    t.from === "AURA" ? "bot" : "user",
          content: t.text,
          type:    "text",
        }))

        setMessages([
          {
            id:      "welcome-back",
            role:    "bot",
            content: `Welcome back, ${p.name}! 👋 I can see your last check-in. Risk score was ${p.today_aura?.risk_analysis?.risk_score ?? p.risk}% (${p.today_aura?.risk_analysis?.risk_band ?? "—"}). How are you feeling today?`,
            type:    "text",
          },
          ...history,
        ])
        setStep("chat")
      } else {
        // ── New patient — collect details ──────────────────────────────────
        setStep("new_patient_form")
      }
    } catch (err) {
      console.error("Lookup error:", err)
      setErrorMsg("Cannot reach the server. Make sure the Node backend is running on port 5000.")
      setStep("error")
    }
  }

  // ── Step 2b: Create new patient ─────────────────────────────────────────────
  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAge.trim() || !newCondition.trim()) return

    setIsCreating(true)
    const generatedId = `P-${Date.now()}`

    try {
      const res  = await fetch("/api/patient/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          userId:    generatedId,
          name:      userName,
          age:       Number(newAge),
          condition: newCondition.trim(),
        }),
      })
      const newPatient = await res.json()
      setPatientRecord(newPatient)
      setUserId(generatedId)

      setMessages([{
        id:      "welcome-new",
        role:    "bot",
        content: `Hello ${userName}! 👋 I'm AURA, your recovery assistant. I've created your profile. Let's start your check-in — how is your pain today on a scale of 0 to 10?`,
        type:    "text",
      }])
      setStep("chat")
    } catch (err) {
      console.error("Create patient error:", err)
      setErrorMsg("Failed to create profile. Please check the server is running.")
      setStep("error")
    } finally {
      setIsCreating(false)
    }
  }

  // ── Chat: send message ──────────────────────────────────────────────────────
  const handleSendMessage = async (text: string, file?: File) => {
    if ((!text.trim() && !file) || isLoading) return

    const newMessage: Message = {
      id:       Date.now().toString(),
      role:     "user",
      content:  text,
      type:     file ? "image" : "text",
      imageUrl: file ? URL.createObjectURL(file) : undefined,
    }

    setMessages(prev => [...prev, newMessage])
    setInput("")
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append("userId",  userId)
      formData.append("message", text || (file ? "Uploaded image" : ""))
      if (file) formData.append("image", file)

      const res  = await fetch("/api/chat/message", { method: "POST", body: formData })
      const data = await res.json()

      setMessages(prev => [...prev, {
        id:      (Date.now() + 1).toString(),
        role:    "bot",
        content: data.response || "Sorry, I didn't understand that.",
        type:    "text",
      }])
    } catch {
      setMessages(prev => [...prev, {
        id:      (Date.now() + 1).toString(),
        role:    "bot",
        content: "Sorry, connection error. Please try again.",
        type:    "text",
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSendMessage(input)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleSendMessage("", e.target.files[0])
  }

  // ── SCREEN: Ask for name ────────────────────────────────────────────────────
  if (step === "ask_name") {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-white p-6 shadow-xl justify-center">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 rounded-full bg-teal-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome to AURA</h1>
          <p className="text-slate-500 mt-1">Your post-surgery recovery assistant</p>
        </div>
        <form onSubmit={handleNameSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">What is your full name?</label>
            <Input
              placeholder="e.g. Arun Singh"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="w-full"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 rounded-lg"
            disabled={!nameInput.trim()}
          >
            Continue
          </Button>
        </form>
      </div>
    )
  }

  // ── SCREEN: Looking up ──────────────────────────────────────────────────────
  if (step === "looking_up") {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-white justify-center items-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
        <p className="text-slate-600 font-medium">Checking records for <strong>{userName}</strong>…</p>
      </div>
    )
  }

  // ── SCREEN: Error ──────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-white p-6 shadow-xl justify-center items-center text-center gap-4">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-lg font-bold text-slate-800">Connection Error</h2>
        <p className="text-sm text-slate-500 max-w-xs">{errorMsg}</p>
        <div className="bg-slate-800 text-green-400 text-xs font-mono rounded-lg px-4 py-3 text-left w-full max-w-xs">
          <p>cd service-node</p>
          <p>node index.js</p>
        </div>
        <button
          className="mt-2 text-teal-600 font-semibold hover:underline text-sm"
          onClick={() => { setStep("ask_name"); setNameInput(""); setErrorMsg(""); }}
        >
          ← Try again
        </button>
      </div>
    )
  }

  // ── SCREEN: New patient onboarding form ─────────────────────────────────────
  if (step === "new_patient_form") {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-white p-6 shadow-xl justify-center">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <UserPlus className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">New Patient Registration</h1>
          <p className="text-slate-500 text-sm mt-1">
            No existing record found for{" "}
            <span className="font-semibold text-slate-700 not-italic">{userName}</span>.
            {" "}Let&apos;s set up your profile.
          </p>
        </div>

        <form onSubmit={handleCreatePatient} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <Input value={userName} disabled className="w-full bg-slate-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
            <Input
              type="number"
              placeholder="e.g. 45"
              value={newAge}
              onChange={e => setNewAge(e.target.value)}
              className="w-full"
              min={1} max={120}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Surgery / Condition</label>
            <Input
              placeholder="e.g. Post-Surgery (Appendectomy)"
              value={newCondition}
              onChange={e => setNewCondition(e.target.value)}
              className="w-full"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 rounded-lg"
            disabled={!newAge.trim() || !newCondition.trim() || isCreating}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
            {isCreating ? "Creating profile…" : "Start Check-in"}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-slate-400 hover:text-slate-600 underline"
            onClick={() => { setStep("ask_name"); setNameInput(""); }}
          >
            ← Back (wrong name?)
          </button>
        </form>
      </div>
    )
  }

  // ── SCREEN: Chat ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 border-x border-slate-200 shadow-xl">
      {/* Header */}
      <div className="bg-teal-600 p-4 text-white shadow-md z-10 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            AURA Assistant
          </h1>
          <p className="text-teal-100 text-xs flex items-center gap-1">
            {patientRecord ? (
              <><UserCheck className="w-3 h-3" /> {userName} · Risk {patientRecord.risk}%</>
            ) : (
              <>Helping {userName}</>
            )}
          </p>
        </div>
        {patientRecord && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            patientRecord.risk > 70 ? "bg-red-500" : patientRecord.risk > 40 ? "bg-amber-500" : "bg-emerald-500"
          }`}>
            {patientRecord.risk > 70 ? "HIGH" : patientRecord.risk > 40 ? "MEDIUM" : "LOW"}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div className={cn(
              "max-w-[80%] rounded-lg p-3 shadow-sm",
              msg.role === "user"
                ? "bg-teal-600 text-white rounded-br-none"
                : "bg-white text-slate-800 rounded-bl-none border border-slate-100",
              msg.type === "image" && "p-1 overflow-hidden"
            )}>
              {msg.type === "image" && msg.imageUrl ? (
                <img src={msg.imageUrl} alt="User upload" className="w-full h-auto rounded-lg" />
              ) : msg.role === "bot" && msg.content.includes("Check-in Complete") ? (
                // ── FINAL VERDICT CARD ────────────────────────────────────
                <div className={`rounded-xl p-4 border-2 ${
                  msg.content.includes("HIGH")  ? "bg-red-50 border-red-400" :
                  msg.content.includes("MODERATE") ? "bg-amber-50 border-amber-400" :
                  "bg-emerald-50 border-emerald-400"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">
                      {msg.content.includes("HIGH") ? "🚨" : msg.content.includes("MODERATE") ? "⚠️" : "✅"}
                    </span>
                    <span className={`font-bold text-sm ${
                      msg.content.includes("HIGH") ? "text-red-700" :
                      msg.content.includes("MODERATE") ? "text-amber-700" : "text-emerald-700"
                    }`}>
                      {msg.content.includes("HIGH") ? "HIGH RISK — Immediate Action Needed" :
                       msg.content.includes("MODERATE") ? "MODERATE RISK — Nurse Follow-up" :
                       "LOW RISK — Stable Recovery"}
                    </span>
                  </div>
                  <p className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                    {msg.content.replace(/^[🚨⚠️✅]\s*\*Check-in Complete\*\s*—\s*Risk:\s*\w+\s*\(\d+%\)\s*\n?\n?/, "")}
                  </p>
                </div>
              ) : msg.role === "bot" && msg.content.includes("📸") ? (
                // ── PHOTO REQUEST CARD ────────────────────────────────────
                <div className="rounded-xl p-4 bg-blue-50 border-2 border-blue-300">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📸</span>
                    <span className="font-bold text-sm text-blue-700">Wound Photo Requested</span>
                  </div>
                  <p className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              ) : (
                <p className="leading-relaxed whitespace-pre-line">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg p-3 shadow-sm rounded-bl-none flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span className="text-slate-500 text-sm">Typing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-3 border-t border-slate-200 flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileSelect}
        />
        <Button
          variant="ghost" size="icon"
          className="text-slate-500 hover:text-teal-600"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Input
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded-full bg-slate-100 border-none focus-visible:ring-1 focus-visible:ring-teal-600"
          disabled={isLoading}
        />
        <Button
          variant="default" size="icon"
          className="bg-teal-600 hover:bg-teal-700 rounded-full"
          onClick={() => handleSendMessage(input)}
          disabled={isLoading || !input.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
