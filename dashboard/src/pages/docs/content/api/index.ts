import type { DocSet } from '../shared'
import type { ApiDoc } from './types'
import en from './en'
import de from './de'
import fr from './fr'
import es from './es'

// Neue Sprache: Datei <code>.ts anlegen und hier eine Zeile ergänzen.
export const API_DOCS: DocSet<ApiDoc> = { en, de, fr, es }

export { API_SECTIONS } from './endpoints'
export type { Method, Auth, EndpointId } from './endpoints'
export type { ApiDoc } from './types'
