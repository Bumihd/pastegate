import type { DocSet } from '../shared'
import type { MdmDoc } from './types'
import en from './en'
import de from './de'
import fr from './fr'
import es from './es'

// Neue Sprache: Datei <code>.ts anlegen und hier eine Zeile ergänzen.
export const MDM_DOCS: DocSet<MdmDoc> = { en, de, fr, es }

export type { MdmDoc } from './types'
