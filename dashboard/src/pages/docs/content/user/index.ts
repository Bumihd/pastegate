import type { DocSet } from '../shared'
import type { UserDoc, UserSectionId } from './types'
import en from './en'
import de from './de'
import fr from './fr'
import es from './es'

// Neue Sprache: Datei <code>.ts anlegen und hier eine Zeile ergänzen.
export const USER_DOCS: DocSet<UserDoc> = { en, de, fr, es }

/** Welche Rollen welchen Abschnitt sehen (sprachunabhängig). `null` = alle. */
export const USER_SECTION_ROLES: Record<UserSectionId, readonly string[] | null> = {
  getting_started: null,
  admin:           ['admin'],
  itsec:           ['itsec', 'infosec'],
  management:      ['management'],
  dataprivacy:     ['dataprivacy'],
}

export const USER_SECTION_ORDER: readonly UserSectionId[] = [
  'getting_started', 'admin', 'itsec', 'management', 'dataprivacy',
]

export type { UserDoc, UserSectionId, DocItem } from './types'
