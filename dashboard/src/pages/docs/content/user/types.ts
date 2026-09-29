// Struktur der Benutzer-Handbücher. Jede Sprachdatei muss exakt diese Form haben.
// Texte: `\n` = Zeilenumbruch, `code` und **fett** als Inline-Markup.

export interface DocItem {
  heading: string
  text: string
  code?: string
}

interface Section<K extends string> {
  title: string
  items: Record<K, DocItem>
}

export interface UserDoc {
  sections: {
    getting_started: Section<'what' | 'detection' | 'severity' | 'language'>
    admin: Section<'install' | 'org_language' | 'build' | 'mdm' | 'api_keys' | 'users'>
    itsec: Section<'events' | 'domain_rules' | 'identity' | 'incident'>
    management: Section<'risk' | 'trend'>
    dataprivacy: Section<'gdpr' | 'audit' | 'access' | 'erasure'>
  }
}

export type UserSectionId = keyof UserDoc['sections']
