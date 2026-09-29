import type { ApiSectionId, EndpointId, EndpointText } from './endpoints'

// Struktur der API-Doku. Jede Sprachdatei muss alle Abschnitte, alle Endpoints und
// alle Body-/Query-Felder aus endpoints.ts beschreiben. Inline-Markup: `code`, **fett**.

export interface ApiDoc {
  ui: {
    baseUrl: string
    authPublic: string
    authPublicDesc: string
    authApiKey: string
    authJwt: string
    authToken: string
    roles: string
    requestBody: string
    queryParams: string
    response: string
    /** Hinweis zu Accept-Language / Fehlermeldungen. */
    languageNote: string
  }
  sections: Record<ApiSectionId, string>
  endpoints: { [K in EndpointId]: EndpointText<K> }
}
