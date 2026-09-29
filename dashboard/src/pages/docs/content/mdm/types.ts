// Struktur des MDM-Guides. Jede Sprachdatei muss exakt diese Form haben.
// Code-Beispiele (JSON, plist, Registry) sind sprachunabhängig und liegen in MdmGuide.tsx.
// Inline-Markup: `code` und **fett**. Schritt-Listen sind Tupel, damit alle Sprachen
// dieselbe Anzahl Schritte haben.

type Steps4 = [string, string, string, string]

export interface MdmDoc {
  intro: string
  step1: {
    title: string
    lead: string
    steps: Steps4
    zipNote: string
  }
  intune: {
    optionA: string
    optionALead: string
    optionASteps: Steps4
    webStoreNote: string
    configTitle: string
    configLead: string
    precedenceNote: string
    optionB: string
    optionBSteps: Steps4
  }
  jamf: {
    steps: [string, string, string]
    configLead: string
    scope: string
  }
  gpo: {
    steps: [string, string, string]
    configLead: string
  }
  manual: {
    title: string
    steps: Steps4
    note: string
  }
  language: {
    title: string
    paragraphs: [string, string, string]
  }
  bestPractice: {
    title: string
    text: string
  }
}
