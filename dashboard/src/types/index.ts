export type Role = 'itsec' | 'infosec' | 'admin' | 'management' | 'dataprivacy' | 'viewer'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type EventAction = 'blocked' | 'blocked_hard' | 'allowed'
export type DomainMode = 'warn' | 'hard_block' | 'allow'

export interface User {
  username: string
  email: string
  role: Role
  totp_enabled: boolean
}

export interface AuthState {
  token: string | null
  user: User | null
}

export interface PasteEvent {
  id: string
  device_id: string
  device_hash: string
  device_label: string | null
  device_has_identity: boolean
  ts: string
  url_hash: string
  host: string | null
  action: EventAction
  findings: Finding[]
}

export interface Finding {
  rule_id: string
  severity: Severity
}

export interface Device {
  id: string
  device_hash: string
  label: string | null
  first_seen: string
  last_seen: string
  event_count: number
  has_identity: boolean
}

export interface DomainRule {
  id: string
  pattern: string
  mode: DomainMode
  is_active: boolean
  created_at: string
}

export interface ApiKey {
  id: string
  name: string
  is_active: boolean
  created_at: string
  last_used: string | null
}

export interface Stats {
  total_events: number
  blocked_today: number
  devices: number
  top_rules: { rule_id: string; count: number }[]
  by_severity: { severity: Severity; count: number }[]
  trend: { date: string; count: number }[]
}

export type CustomRuleKind = 'keywords' | 'prefix' | 'pattern' | 'regex'
export type PrefixCharset = 'alnum' | 'hex' | 'base64url' | 'digits'

export interface KeywordsConfig { words: string[]; case_sensitive: boolean; whole_word: boolean }
export interface PrefixConfig { prefix: string; charset: PrefixCharset; min_length: number; max_length: number }
export interface PatternConfig { template: string }
export interface RegexConfig { pattern: string; case_sensitive: boolean }

export type CustomRuleConfig = KeywordsConfig | PrefixConfig | PatternConfig | RegexConfig

export interface CustomRule {
  id: string
  rule_id: string
  name: string
  description: string | null
  kind: CustomRuleKind
  config: CustomRuleConfig
  severity: Severity
  is_active: boolean
  pattern: string
  flags: string
  created_at: string
  updated_at: string
}

export interface CustomRuleInput {
  name: string
  description: string | null
  kind: CustomRuleKind
  config: CustomRuleConfig
  severity: Severity
  is_active: boolean
}
