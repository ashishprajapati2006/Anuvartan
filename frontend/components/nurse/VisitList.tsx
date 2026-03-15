"use client"

import { Button } from "@/components/ui/button"
import {
  AlertCircle, AlertTriangle, CheckCircle, Clock, FileText,
  MapPin, Phone, ShieldAlert, TrendingUp, Activity, Thermometer,
  Pill, Wind, Brain
} from "lucide-react"
import { useEffect, useState } from "react"

type RiskFactor = { feature: string; impact: string }

type Patient = {
  id: number
  userId?: string
  name: string
  age: number
  condition: string
  risk: number
  lastCheckup: string
  today_aura?: {
    summary: {
      pain_score: number
      fever_celsius: number
      wound_status: string
      meds_taken: boolean
      activity_level: string
      mood: number
    }
    transcript: Array<{ from: string; time: string; text: string }>
    risk_analysis: {
      risk_score: number
      risk_band: string
      top_factors: RiskFactor[]
      nurse_action_hint: string
    }
  }
}

/* ─────────────────────────────────────────────────────────
   Utility: Derive per-patient flag criteria from AURA data
───────────────────────────────────────────────────────── */
function getFlagCriteria(patient: Patient) {
  const flags: { label: string; severity: "critical" | "warning" | "ok" }[] = []
  if (!patient.today_aura) return flags
  const s = patient.today_aura.summary

  if (s.pain_score >= 8)        flags.push({ label: `Pain ${s.pain_score}/10 — Severe`, severity: "critical" })
  else if (s.pain_score >= 5)   flags.push({ label: `Pain ${s.pain_score}/10 — Moderate`, severity: "warning" })
  else                          flags.push({ label: `Pain ${s.pain_score}/10 — Mild`, severity: "ok" })

  if (s.fever_celsius >= 38.5)  flags.push({ label: `Fever ${s.fever_celsius}°C — High`, severity: "critical" })
  else if (s.fever_celsius >= 37.5) flags.push({ label: `Temp ${s.fever_celsius}°C — Mild fever`, severity: "warning" })

  if (!s.meds_taken)            flags.push({ label: "Medications NOT taken", severity: "critical" })

  const woundLower = s.wound_status.toLowerCase()
  if (woundLower.includes("infect") || woundLower.includes("pus") || woundLower.includes("bleed"))
    flags.push({ label: `Wound: ${s.wound_status}`, severity: "critical" })
  else if (woundLower.includes("redden") || woundLower.includes("swollen") || woundLower.includes("swell"))
    flags.push({ label: `Wound: ${s.wound_status}`, severity: "warning" })

  if (s.mood <= 3)              flags.push({ label: `Mood score ${s.mood}/10 — Poor`, severity: "warning" })

  return flags
}

/* Detect flagged keywords in a chat message */
const FLAG_KEYWORDS = [
  "pain", "bleeding", "fever", "hot", "swollen", "pus", "infect",
  "dizzy", "vomit", "nausea", "chest", "breath", "numb", "bleed",
  "severe", "worse", "terrible", "unbearable", "emergency"
]

function isFlaggedMessage(text: string) {
  return FLAG_KEYWORDS.some(kw => text.toLowerCase().includes(kw))
}

/* ─────────────────────────────────────────────────────────
   Sub-component: Flag badge
───────────────────────────────────────────────────────── */
function FlagBadge({ severity, label }: { severity: "critical" | "warning" | "ok"; label: string }) {
  const styles = {
    critical: "bg-red-50 border-red-300 text-red-700",
    warning:  "bg-amber-50 border-amber-300 text-amber-700",
    ok:       "bg-emerald-50 border-emerald-300 text-emerald-700",
  }
  const Icon = severity === "critical" ? ShieldAlert : severity === "warning" ? AlertTriangle : CheckCircle
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${styles[severity]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────
   Sub-component: AI Analysis Panel
───────────────────────────────────────────────────────── */
function AIAnalysisPanel({ aura }: { aura: NonNullable<Patient["today_aura"]> }) {
  const ra = aura.risk_analysis
  const bandColor =
    ra.risk_band === "High"    ? "text-red-600"   :
    ra.risk_band === "Medium"  ? "text-amber-600"  : "text-emerald-600"

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-violet-100/70 border-b border-violet-200">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-600" />
          <span className="text-xs font-bold text-violet-800 uppercase tracking-wide">AI Risk Analysis</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-extrabold ${bandColor}`}>{ra.risk_band} Risk</span>
          <span className="text-xs text-slate-500">· Score {ra.risk_score}</span>
        </div>
      </div>

      {/* Risk bar */}
      <div className="px-3 pt-2 pb-1">
        <div className="relative h-2.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              ra.risk_score > 70 ? "bg-red-500" : ra.risk_score > 40 ? "bg-amber-400" : "bg-emerald-400"
            }`}
            style={{ width: `${ra.risk_score}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>0 — Low</span><span>50 — Medium</span><span>100 — High</span>
        </div>
      </div>

      {/* Top Factors */}
      <div className="px-3 pt-1 pb-2 space-y-1.5">
        <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide mt-1">Top Contributing Factors</p>
        {ra.top_factors.map((f, i) => {
          const positive = f.impact.startsWith("+")
          return (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <TrendingUp className={`w-3 h-3 shrink-0 ${positive ? "text-red-400" : "text-emerald-400"}`} />
                <span className="text-xs text-slate-700 truncate">{f.feature}</span>
              </div>
              <span className={`text-xs font-bold shrink-0 ${positive ? "text-red-600" : "text-emerald-600"}`}>
                {f.impact}
              </span>
            </div>
          )
        })}
      </div>

      {/* Nurse Action */}
      <div className="border-t border-violet-200 px-3 py-2 bg-violet-100/50 flex gap-2 items-start">
        <AlertCircle className="w-4 h-4 shrink-0 text-violet-600 mt-0.5" />
        <p className="text-xs text-violet-900 leading-relaxed font-medium">{ra.nurse_action_hint}</p>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Sub-component: Vitals Summary chips
───────────────────────────────────────────────────────── */
function VitalChip({ icon: Icon, label, value, alert }: {
  icon: React.ElementType; label: string; value: string; alert?: boolean
}) {
  return (
    <div className={`flex flex-col gap-0.5 p-2 rounded-lg border shadow-sm ${alert ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
      <div className="flex items-center gap-1 text-slate-400">
        <Icon className={`w-3.5 h-3.5 ${alert ? "text-red-500" : ""}`} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-sm font-bold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Chat history modal with color-coded + flagged messages
───────────────────────────────────────────────────────── */
function ChatHistoryModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const flagCriteria = getFlagCriteria(patient)
  const criticalFlags = flagCriteria.filter(f => f.severity === "critical")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[88vh] flex flex-col border border-slate-200">

        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-2xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Patient Chat Transcript
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {patient.name} · {patient.condition} · Age {patient.age}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={onClose}>✕</Button>
          </div>

          {/* Risk badge */}
          {patient.today_aura && (
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                patient.today_aura.risk_analysis.risk_band === "High"
                  ? "bg-red-100 text-red-700 border-red-200"
                  : patient.today_aura.risk_analysis.risk_band === "Medium"
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-emerald-100 text-emerald-700 border-emerald-200"
              }`}>
                AI Risk Score: {patient.today_aura.risk_analysis.risk_score} ({patient.today_aura.risk_analysis.risk_band})
              </span>
            </div>
          )}
        </div>

        {/* Critical Flags Banner */}
        {criticalFlags.length > 0 && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span className="text-xs font-bold text-red-700 uppercase tracking-wide">⚠ Critical Flags Detected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {criticalFlags.map((f, i) => <FlagBadge key={i} {...f} />)}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {patient.today_aura ? (
            patient.today_aura.transcript.map((msg, idx) => {
              const isAura = msg.from === "AURA"
              const flagged = !isAura && isFlaggedMessage(msg.text)
              return (
                <div key={idx} className={`flex flex-col ${isAura ? "items-start" : "items-end"}`}>
                  {/* Sender label */}
                  <span className={`text-[10px] font-semibold mb-0.5 px-1 ${isAura ? "text-blue-500" : "text-slate-500"}`}>
                    {isAura ? "🤖 AURA (AI)" : "🧑 Patient"} · {msg.time}
                  </span>

                  {/* Bubble */}
                  <div className={`relative max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm border ${
                    isAura
                      ? "bg-blue-50 border-blue-100 text-blue-900 rounded-tl-sm"
                      : flagged
                        ? "bg-red-50 border-red-300 text-red-900 rounded-tr-sm ring-1 ring-red-400"
                        : "bg-slate-100 border-slate-200 text-slate-800 rounded-tr-sm"
                  }`}>
                    {msg.text}

                    {/* Flagged indicator */}
                    {flagged && (
                      <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-red-200">
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Clinical flag detected</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            /* Fallback mock transcript */
            <>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-semibold mb-0.5 px-1 text-blue-500">🤖 AURA (AI) · 10:00 AM</span>
                <div className="bg-blue-50 border border-blue-100 text-blue-900 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm shadow-sm">
                  Hello! How are you feeling today?
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-semibold mb-0.5 px-1 text-slate-500">🧑 Patient · 10:01 AM</span>
                {patient.risk > 50 ? (
                  <div className="bg-red-50 border border-red-300 text-red-900 rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-red-400 max-w-[85%]">
                    I'm in a lot of pain. My wound feels hot.
                    <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-red-200">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Clinical flag detected</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-100 border border-slate-200 text-slate-800 rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm shadow-sm max-w-[85%]">
                    I am feeling better today. No pain.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* AI Analysis inside modal */}
        {patient.today_aura && (
          <div className="px-4 pb-1">
            <AIAnalysisPanel aura={patient.today_aura} />
          </div>
        )}

        <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex gap-2">
          <Button className="flex-1" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────── */
export function VisitList() {
  const [visits, setVisits] = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [selectedHistoryPatient, setSelectedHistoryPatient] = useState<Patient | null>(null)
  const [visitedIds, setVisitedIds] = useState<number[]>([])
  const [escalatingId, setEscalatingId] = useState<number | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await fetch("/api/doctor/patients")
        const data = await res.json()
        if (Array.isArray(data)) {
          setVisits(data.slice(6).sort((a: Patient, b: Patient) => b.risk - a.risk))
        } else {
          console.error("Expected array from API, got:", data)
          setVisits([])
        }
      } catch (error) {
        console.error("Failed to fetch patients:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPatients()
  }, [])

  const handleStartVisit = async (id: number, name: string) => {
    setEscalatingId(id)
    try {
      const response = await fetch("/api/patient/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: id })
      });

      if (response.ok) {
        const data = await response.json();
        setVisitedIds(prev => [...prev, id])
        setToastMessage(`✅ ${name} escalated to doctor - Status changed to RED CODE`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 4000)
        
        // Remove escalated patient from nurse list
        setVisits(visits.filter(v => v.id !== id))
      } else {
        setToastMessage(`❌ Failed to escalate ${name}`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 3000)
      }
    } catch (error) {
      console.error("Escalation failed:", error)
      setToastMessage(`❌ Error escalating patient`)
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
    } finally {
      setEscalatingId(null)
    }
  }

  return (
    <div className="space-y-4 relative">

      {/* Toast */}
      {showToast && (
        <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-5 fade-in duration-300">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 border border-slate-700">
            <div className="bg-green-500 rounded-full p-1">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">Action Confirmed</p>
              <p className="text-xs text-slate-300">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}

      {visits.map((patient, patientIndex) => {
        const flags = getFlagCriteria(patient)
        const criticalCount = flags.filter(f => f.severity === "critical").length
        const warningCount  = flags.filter(f => f.severity === "warning").length

        const theme = patient.risk > 70
          ? { border: "border-l-red-500",    bg: "bg-red-50/40",    badge: "bg-red-100 text-red-700",     button: "bg-red-600 hover:bg-red-700"     }
          : patient.risk > 40
          ? { border: "border-l-orange-500", bg: "bg-orange-50/40", badge: "bg-orange-100 text-orange-700", button: "bg-orange-600 hover:bg-orange-700" }
          : { border: "border-l-teal-500",   bg: "bg-teal-50/40",   badge: "bg-teal-100 text-teal-700",   button: "bg-teal-600 hover:bg-teal-700"   }

        const isVisited = visitedIds.includes(patient.id)

        return (
          <div
            key={`${patient.userId || patient.id}-${patientIndex}`}
            className={`p-4 rounded-xl shadow-sm border border-slate-100 border-l-[6px] flex flex-col gap-3 transition-all duration-300 ${theme.border} ${theme.bg}`}
          >
            {/* Patient Header */}
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-semibold text-slate-900 text-lg leading-tight">{patient.name}</h3>
                <p className="text-slate-600 text-sm font-medium">{patient.condition}, {patient.age} yrs</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${theme.badge} border border-black/5`}>
                  <AlertCircle className="w-3 h-3" />
                  {patient.risk > 70 ? "High Risk" : patient.risk > 40 ? "Medium Risk" : "Low Risk"}
                </span>
                {/* Mini flag count badges */}
                {criticalCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <ShieldAlert className="w-2.5 h-2.5" />
                    {criticalCount} Critical
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {warningCount} Warning
                  </span>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Last: {patient.lastCheckup}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>2.5 km away</span>
              </div>
            </div>

            {/* ── Highlighted Flagging Criteria row ── */}
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {flags.map((f, i) => <FlagBadge key={i} {...f} />)}
              </div>
            )}

            {/* ── Expanded: Vitals + AI Analysis ── */}
            {expandedId === patient.id && (
              <div className="mt-1 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">

                {patient.today_aura ? (
                  <>
                    {/* Vitals Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <VitalChip
                        icon={Activity}  label="Pain" value={`${patient.today_aura.summary.pain_score}/10`}
                        alert={patient.today_aura.summary.pain_score >= 8}
                      />
                      <VitalChip
                        icon={Thermometer} label="Temp" value={`${patient.today_aura.summary.fever_celsius}°C`}
                        alert={patient.today_aura.summary.fever_celsius >= 38.5}
                      />
                      <VitalChip
                        icon={Pill} label="Meds" value={patient.today_aura.summary.meds_taken ? "Taken ✓" : "MISSED ✗"}
                        alert={!patient.today_aura.summary.meds_taken}
                      />
                      <VitalChip
                        icon={Wind} label="Mood" value={`${patient.today_aura.summary.mood}/10`}
                        alert={patient.today_aura.summary.mood <= 3}
                      />
                    </div>

                    {/* Wound status */}
                    <div className={`text-xs px-3 py-2 rounded-lg border font-medium ${
                      isFlaggedMessage(patient.today_aura.summary.wound_status)
                        ? "bg-red-50 border-red-200 text-red-800"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}>
                      <span className="text-slate-400 font-normal">Wound: </span>
                      {patient.today_aura.summary.wound_status}
                    </div>

                    {/* AI Analysis */}
                    <AIAnalysisPanel aura={patient.today_aura} />
                  </>
                ) : (
                  /* Fallback static vitals */
                  <div className="p-3 bg-white/60 rounded-lg border border-slate-200/60 text-sm space-y-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-2 rounded border border-slate-100 shadow-sm">
                        <span className="block text-xs text-slate-500">BP (mmHg)</span>
                        <span className="font-medium">138/88</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-100 shadow-sm">
                        <span className="block text-xs text-slate-500">Heart Rate</span>
                        <span className="font-medium">88 bpm</span>
                      </div>
                    </div>
                    <p className="text-slate-700 italic border-l-2 border-slate-300 pl-3 text-xs">
                      "Patient reported increased pain levels. Monitor wound healing progress."
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="pt-3 border-t border-black/5 flex gap-2">
              <Button
                onClick={() => handleStartVisit(patient.id, patient.name)}
                disabled={isVisited || escalatingId === patient.id}
                className={`flex-1 h-10 rounded-lg shadow-sm transition-colors ${isVisited || escalatingId === patient.id ? "bg-slate-300 text-slate-500 cursor-not-allowed" : theme.button}`}
                size="sm"
              >
                {escalatingId === patient.id ? "Escalating..." : isVisited ? "Escalated ✓" : "Escalate to Doctor"}
              </Button>
              <Button
                variant="outline" size="sm"
                className="h-10 w-10 p-0 rounded-lg text-slate-600 border-slate-200 bg-white/50"
                onClick={() => setSelectedHistoryPatient(patient)}
                title="View Chat & AI Analysis"
              >
                <FileText className="w-4 h-4" />
              </Button>
              <Button
                variant="outline" size="sm"
                className={`h-10 px-3 rounded-lg border-slate-200 ${expandedId === patient.id ? "bg-white text-slate-900 shadow-inner" : "bg-white/50 text-slate-600"}`}
                onClick={() => setExpandedId(expandedId === patient.id ? null : patient.id)}
              >
                {expandedId === patient.id ? "Hide" : "Info"}
              </Button>
              <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-lg text-slate-600 border-slate-200 bg-white/50">
                <Phone className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )
      })}

      {isLoading && (
        <div className="text-center py-10 text-slate-500">Loading today's schedule...</div>
      )}

      {!isLoading && visits.length === 0 && (
        <div className="text-center py-10">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
          <p className="text-slate-500">No high-risk visits scheduled for today.</p>
        </div>
      )}

      {/* Chat History + AI Modal */}
      {selectedHistoryPatient && (
        <ChatHistoryModal patient={selectedHistoryPatient} onClose={() => setSelectedHistoryPatient(null)} />
      )}
    </div>
  )
}
