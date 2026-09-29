// ═══════════════════════════════════════════════════════
// Pastegate · ZeroTrustLab — content.js (combined)
// detector.js + content script in a single file
// Compatible with Chrome (MV3) and Firefox (MV2)
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// Pastegate · ZeroTrustLab — detector.js
// ~100 detection rules + organisation rules, runs entirely locally
// ═══════════════════════════════════════════════════════

const RULES = [

  // ── AWS ──────────────────────────────────────────────
  {
    id: 'aws_access_key',
    name: 'AWS Access Key',
    severity: 'critical',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    description: 'Amazon Web Services Access Key ID',
  },
  {
    id: 'aws_secret_key',
    name: 'AWS Secret Access Key',
    severity: 'critical',
    pattern: /(?:aws[_\-\s]?secret[_\-\s]?(?:access[_\-\s]?)?key|aws_secret)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/i,
    description: 'Amazon Web Services Secret Access Key',
  },
  {
    id: 'aws_mfa',
    name: 'AWS MFA Serial',
    severity: 'high',
    pattern: /arn:aws:iam::[0-9]{12}:mfa\//,
    description: 'AWS MFA Device ARN',
  },
  {
    id: 'aws_arn',
    name: 'AWS ARN with account ID',
    severity: 'medium',
    pattern: /arn:aws:[a-z0-9\-]+:[a-z0-9\-]*:[0-9]{12}:[^\s]{4,}/,
    description: 'AWS Resource Name with account ID',
  },

  // ── GitHub / GitLab / Bitbucket ───────────────────────
  {
    id: 'github_token',
    name: 'GitHub Token',
    severity: 'critical',
    pattern: /\b(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/,
    description: 'GitHub Personal Access Token',
  },
  {
    id: 'gitlab_token',
    name: 'GitLab Token',
    severity: 'critical',
    pattern: /\bglpat-[A-Za-z0-9_\-]{20,}\b/,
    description: 'GitLab Personal Access Token',
  },
  {
    id: 'gitlab_runner',
    name: 'GitLab Runner Token',
    severity: 'critical',
    pattern: /\bglrt-[A-Za-z0-9_\-]{20,}\b/,
    description: 'GitLab Runner Registration Token',
  },
  {
    id: 'bitbucket_token',
    name: 'Bitbucket Token',
    severity: 'critical',
    pattern: /\bATBB[A-Za-z0-9]{32,}\b/,
    description: 'Bitbucket Access Token',
  },

  // ── OpenAI / Anthropic / AI Services ─────────────────
  {
    id: 'openai_key',
    name: 'OpenAI API Key',
    severity: 'critical',
    pattern: /\bsk-[A-Za-z0-9]{20,50}T3BlbkFJ[A-Za-z0-9]{20,50}\b|\bsk-proj-[A-Za-z0-9_\-]{50,150}\b/,
    description: 'OpenAI API Key',
  },
  {
    id: 'anthropic_key',
    name: 'Anthropic API Key',
    severity: 'critical',
    pattern: /\bsk-ant-api\d{2}-[A-Za-z0-9_\-]{90,110}\b/,
    description: 'Anthropic Claude API Key',
  },
  {
    id: 'huggingface_token',
    name: 'HuggingFace Token',
    severity: 'high',
    pattern: /\bhf_[A-Za-z0-9]{34,}\b/,
    description: 'HuggingFace API Token',
  },
  {
    id: 'cohere_key',
    name: 'Cohere API Key',
    severity: 'high',
    pattern: /\b[A-Za-z0-9]{40}\b/,
    description: 'Cohere API Key (potential)',
    extraCheck: (text) => /cohere/i.test(text),
  },

  // ── Google ────────────────────────────────────────────
  {
    id: 'google_api_key',
    name: 'Google API Key',
    severity: 'high',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    description: 'Google API Key',
  },
  {
    id: 'google_oauth',
    name: 'Google OAuth Token',
    severity: 'critical',
    pattern: /\bya29\.[A-Za-z0-9_\-]{50,200}\b/,
    description: 'Google OAuth 2.0 Access Token',
  },
  {
    id: 'google_service_account',
    name: 'Google Service Account',
    severity: 'critical',
    pattern: /"type"\s*:\s*"service_account"[\s\S]*?"private_key"/,
    description: 'Google Cloud Service Account JSON',
  },
  {
    id: 'google_oauth_client_secret',
    name: 'Google OAuth Client Secret',
    severity: 'critical',
    pattern: /\bGOCSPX-[A-Za-z0-9_\-]{28}(?![A-Za-z0-9_\-])/,
    description: 'Google OAuth 2.0 client secret',
  },
  {
    id: 'firebase_config',
    name: 'Firebase configuration',
    severity: 'high',
    pattern: /apiKey\s*:\s*["'][A-Za-z0-9_\-]{30,}["'][\s\S]*?authDomain\s*:/,
    description: 'Firebase Web App configuration',
  },

  // ── Azure / Microsoft ─────────────────────────────────
  {
    id: 'azure_storage_key',
    name: 'Azure Storage Key',
    severity: 'critical',
    pattern: /[A-Za-z0-9+/]{86}==/,
    description: 'Azure Storage Account Key',
    validator: (m) => m[0].length === 88,
  },
  {
    id: 'azure_connection_string',
    name: 'Azure Connection String',
    severity: 'critical',
    pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+/,
    description: 'Azure Storage Connection String',
  },
  {
    id: 'azure_sas_token',
    name: 'Azure SAS Token',
    severity: 'critical',
    // sv= and sig= in the same query, in any order
    pattern: /\bsv=\d{4}-\d{2}-\d{2}(?:&[A-Za-z]{2,6}=[^&\s"'<>]*)*?&sig=[A-Za-z0-9%+/]{30,}|[?&]sig=[A-Za-z0-9%+/]{30,}(?:&[A-Za-z]{2,6}=[^&\s"'<>]*)*?&sv=\d{4}-\d{2}-\d{2}/,
    description: 'Azure Shared Access Signature (sv + sig)',
  },
  {
    id: 'azure_client_secret',
    name: 'Azure Client Secret',
    severity: 'critical',
    pattern: /(?:client.?secret|clientsecret)\s*[=:]\s*["']?([A-Za-z0-9~._\-]{34,40})["']?/i,
    description: 'Azure AD Client Secret',
  },
  {
    id: 'teams_webhook',
    name: 'Microsoft Teams Webhook',
    severity: 'high',
    pattern: /https:\/\/[a-z0-9]+\.webhook\.office\.com\/webhookb2\/[A-Za-z0-9\-@]+\/IncomingWebhook\/[A-Za-z0-9]+\/[A-Za-z0-9\-]+/,
    description: 'Microsoft Teams Incoming Webhook URL',
  },

  // ── Stripe / PayPal / Payment ─────────────────────────
  {
    id: 'stripe_live_key',
    name: 'Stripe Live Key',
    severity: 'critical',
    pattern: /\b(sk_live_[A-Za-z0-9]{24,}|pk_live_[A-Za-z0-9]{24,}|rk_live_[A-Za-z0-9]{24,})\b/,
    description: 'Stripe Live API Key',
  },
  {
    id: 'stripe_test_key',
    name: 'Stripe Test Key',
    severity: 'medium',
    pattern: /\b(sk_test_[A-Za-z0-9]{24,}|pk_test_[A-Za-z0-9]{24,})\b/,
    description: 'Stripe Test API Key',
  },
  {
    id: 'stripe_webhook',
    name: 'Stripe Webhook Secret',
    severity: 'critical',
    pattern: /\bwhsec_[A-Za-z0-9]{32,}\b/,
    description: 'Stripe Webhook Signing Secret',
  },
  {
    id: 'paypal_secret',
    name: 'PayPal Client Secret',
    severity: 'critical',
    pattern: /(?:paypal|pp)[_\-\s]?(?:client[_\-\s]?)?secret\s*[=:]\s*["']?([A-Za-z0-9_\-]{30,})["']?/i,
    description: 'PayPal Client Secret',
  },
  {
    id: 'shopify_token',
    name: 'Shopify Token',
    severity: 'critical',
    pattern: /\bshpat_[A-Za-z0-9]{32,}\b|\bshpss_[A-Za-z0-9]{32,}\b|\bshpca_[A-Za-z0-9]{32,}\b/,
    description: 'Shopify Access Token',
  },
  {
    id: 'square_token',
    name: 'Square Access Token',
    severity: 'critical',
    pattern: /\bEAAA[A-Za-z0-9]{60,}\b/,
    description: 'Square Payment Access Token',
  },

  // ── Communication Services ────────────────────────────
  {
    id: 'twilio_key',
    name: 'Twilio API Key',
    severity: 'high',
    pattern: /\bSK[0-9a-fA-F]{32}\b/,
    description: 'Twilio API Key/SID',
  },
  {
    id: 'twilio_account',
    name: 'Twilio Account SID',
    severity: 'high',
    pattern: /\bAC[0-9a-fA-F]{32}\b/,
    description: 'Twilio Account SID',
  },
  {
    id: 'sendgrid_key',
    name: 'SendGrid API Key',
    severity: 'high',
    pattern: /\bSG\.[A-Za-z0-9\-_]{22,}\.[A-Za-z0-9\-_]{43,}\b/,
    description: 'SendGrid API Key',
  },
  {
    id: 'mailgun_key',
    name: 'Mailgun API Key',
    severity: 'high',
    pattern: /\bkey-[0-9a-zA-Z]{32}\b/,
    description: 'Mailgun API Key',
  },
  {
    id: 'resend_key',
    name: 'Resend API Key',
    severity: 'high',
    pattern: /\bre_[A-Za-z0-9]{32,}\b/,
    description: 'Resend API Key',
  },
  {
    id: 'slack_token',
    name: 'Slack Token',
    severity: 'high',
    pattern: /\b(xox[baprs]-[0-9A-Za-z\-]{10,})\b/,
    description: 'Slack API Token',
  },
  {
    id: 'slack_webhook',
    name: 'Slack Webhook URL',
    severity: 'high',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/,
    description: 'Slack Incoming Webhook URL',
  },
  {
    id: 'slack_app_token',
    name: 'Slack App Token',
    severity: 'high',
    pattern: /\bxapp-\d-[A-Z0-9]{8,12}-\d{10,16}-[a-f0-9]{64}\b/,
    description: 'Slack app-level token (Socket Mode)',
  },
  {
    id: 'discord_token',
    name: 'Discord Bot Token',
    severity: 'high',
    pattern: /\b[MNO][A-Za-z0-9]{23,25}\.[A-Za-z0-9\-_]{6}\.[A-Za-z0-9\-_]{27,38}\b/,
    description: 'Discord Bot Token',
  },
  {
    id: 'discord_webhook',
    name: 'Discord Webhook URL',
    severity: 'medium',
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_\-]+/,
    description: 'Discord Webhook URL',
  },
  {
    id: 'telegram_bot',
    name: 'Telegram Bot Token',
    severity: 'high',
    pattern: /\b[0-9]{8,10}:[A-Za-z0-9_\-]{35}\b/,
    description: 'Telegram Bot API Token',
  },

  // ── Infrastructure & DevOps ───────────────────────────
  {
    id: 'private_key',
    name: 'Private Key',
    severity: 'critical',
    pattern: /-----BEGIN\s(?:RSA\s|EC\s|DSA\s|OPENSSH\s)?PRIVATE KEY-----/,
    description: 'Private cryptographic key (SSH/TLS/PGP)',
  },
  {
    id: 'pgp_private',
    name: 'PGP Private Key',
    severity: 'critical',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
    description: 'PGP/GPG Private Key Block',
  },
  {
    id: 'putty_private_key',
    name: 'PuTTY Private Key',
    severity: 'critical',
    pattern: /PuTTY-User-Key-File-[23]:\s*[\w\-]+/,
    description: 'PuTTY private key file (.ppk)',
  },
  {
    id: 'encrypted_private_key',
    name: 'Encrypted private key',
    severity: 'high',
    pattern: /-----BEGIN ENCRYPTED PRIVATE KEY-----/,
    description: 'Passphrase-protected private key (PKCS#8)',
  },
  {
    id: 'npm_token',
    name: 'NPM Access Token',
    severity: 'high',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/,
    description: 'NPM Access Token',
  },
  {
    id: 'pypi_token',
    name: 'PyPI API Token',
    severity: 'high',
    pattern: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_\-]{50,}/,
    description: 'PyPI upload token',
  },
  {
    id: 'dockerhub_pat',
    name: 'Docker Hub Token',
    severity: 'high',
    pattern: /\bdckr_(?:pat|oat)_[A-Za-z0-9_\-]{20,}(?![A-Za-z0-9_\-])/,
    description: 'Docker Hub personal or organization access token',
  },
  {
    id: 'digitalocean_token',
    name: 'DigitalOcean Token',
    severity: 'critical',
    pattern: /\bdop_v1_[a-f0-9]{64}\b/,
    description: 'DigitalOcean Personal Access Token',
  },
  {
    id: 'heroku_key',
    name: 'Heroku API Key',
    severity: 'critical',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/,
    description: 'Heroku API Key (UUID format)',
    extraCheck: (text) => /heroku/i.test(text),
  },
  {
    id: 'terraform_token',
    name: 'Terraform Cloud Token',
    severity: 'critical',
    pattern: /\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_\-]{60,}\b/,
    description: 'Terraform Cloud / HCP API Token',
  },
  {
    id: 'vault_token',
    name: 'HashiCorp Vault Token',
    severity: 'critical',
    pattern: /\b(hvs\.[A-Za-z0-9_\-]{90,}|s\.[A-Za-z0-9]{24})\b/,
    description: 'HashiCorp Vault Secret Token',
  },
  {
    id: 'databricks_token',
    name: 'Databricks Token',
    severity: 'high',
    pattern: /\bdapi[a-f0-9]{32}(?:-\d)?\b/,
    description: 'Databricks personal access token',
  },
  {
    id: 'supabase_service_key',
    name: 'Supabase Service Key',
    severity: 'critical',
    pattern: /\bsb_secret_[A-Za-z0-9_\-]{20,}|\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/,
    description: 'Supabase secret key or service_role JWT (bypasses row-level security)',
    validator: (m) => m[0].startsWith('sb_secret_') || jwtHasServiceRole(m[0]),
  },

  // ── SaaS / Dev-Tools ──────────────────────────────────
  {
    id: 'atlassian_api_token',
    name: 'Atlassian API Token',
    severity: 'high',
    pattern: /\bATATT3[A-Za-z0-9_\-=]{150,}/,
    description: 'Atlassian (Jira/Confluence) API token',
  },
  {
    id: 'linear_api_key',
    name: 'Linear API Key',
    severity: 'high',
    pattern: /\blin_api_[A-Za-z0-9]{40}\b/,
    description: 'Linear personal API key',
  },
  {
    id: 'notion_token',
    name: 'Notion Token',
    severity: 'high',
    pattern: /\b(?:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{46})\b/,
    description: 'Notion integration token',
  },
  {
    id: 'vercel_token',
    name: 'Vercel Token',
    severity: 'high',
    // Vercel tokens have no prefix -> only together with a key name
    pattern: /\bvercel[_\-]?(?:api[_\-]?|access[_\-]?)?token["']?\s*[=:]\s*["']?[A-Za-z0-9]{24}\b/i,
    description: 'Vercel access token',
  },
  {
    id: 'db_connection',
    name: 'Database connection',
    severity: 'critical',
    pattern: /\b(mysql|postgres|postgresql|mongodb(?:\+srv)?|rediss?|mssql|oracle|jdbc|mariadb|cockroachdb):\/\/[^@\s]+:[^@\s]+@[^\s]+/i,
    description: 'Database connection string with credentials',
  },
  {
    id: 'vpn_config',
    name: 'WireGuard VPN Config',
    severity: 'critical',
    pattern: /\[Interface\][\s\S]*?PrivateKey\s*=/i,
    description: 'WireGuard VPN configuration with private key',
  },
  {
    id: 'ovpn_config',
    name: 'OpenVPN configuration',
    severity: 'critical',
    pattern: /^(client|dev\s+tun|proto\s+(tcp|udp))/im,
    description: 'OpenVPN configuration file',
    extraCheck: (text) => /-----BEGIN (CERTIFICATE|PRIVATE KEY)-----/.test(text),
  },
  {
    id: 'kubeconfig',
    name: 'Kubernetes config',
    severity: 'critical',
    pattern: /apiVersion:\s*v1/,
    description: 'Kubernetes kubeconfig with cluster credentials',
    extraCheck: (text) => /kind:\s*Config/.test(text) && /clusters:/.test(text),
  },
  {
    id: 'docker_config',
    name: 'Docker Registry Auth',
    severity: 'high',
    pattern: /"auths"\s*:\s*\{/,
    description: 'Docker registry authentication data',
    extraCheck: (text) => /"auth"\s*:\s*"[A-Za-z0-9+/=]{20,}"/.test(text),
  },
  {
    id: 'ansible_vault',
    name: 'Ansible Vault',
    severity: 'critical',
    pattern: /\$ANSIBLE_VAULT;[0-9]+\.[0-9]+;AES256/,
    description: 'Ansible Vault encrypted data',
  },
  {
    id: 'ssh_config_password',
    name: 'SSH config with password',
    severity: 'critical',
    pattern: /Host\s+\S+[\s\S]*?Password\s+\S+/i,
    description: 'SSH configuration with password',
  },

  // ── Auth Tokens ────────────────────────────────────────
  {
    id: 'jwt_token',
    name: 'JWT Token',
    severity: 'high',
    pattern: /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/,
    description: 'JSON Web Token (JWT)',
  },
  {
    id: 'bearer_token',
    name: 'Bearer Token',
    severity: 'high',
    pattern: /\bBearer\s+[A-Za-z0-9\-_\.]{20,}\b/i,
    description: 'HTTP Bearer Authentication Token',
  },
  {
    id: 'basic_auth_header',
    name: 'Basic Auth Header',
    severity: 'critical',
    pattern: /\bBasic\s+[A-Za-z0-9+/]{20,}={0,2}\b/,
    description: 'HTTP Basic Authentication (Base64 encoded)',
  },
  {
    id: 'password_in_url',
    name: 'Password in URL',
    severity: 'critical',
    pattern: /https?:\/\/[^:@\s]+:[^@\s]{4,}@[^\s]+/,
    description: 'Username and password directly in URL',
  },
  {
    id: 'apple_apns',
    name: 'Apple APNS Key',
    severity: 'critical',
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/,
    description: 'Apple Push Notification Service Private Key',
    extraCheck: (text) => /apns|apple|ios/i.test(text),
  },

  // ── .env & Config Files ───────────────────────────────
  {
    id: 'env_file',
    name: '.env file content',
    severity: 'critical',
    pattern: /^[A-Z_]{2,50}=.+$/m,
    description: 'Content of a .env configuration file',
    validator: (m, text) => {
      const lines = text.split('\n').filter(l => /^[A-Z_]{2,50}=.+/.test(l));
      return lines.length >= 3;
    },
  },
  {
    id: 'password_in_text',
    name: 'Password in text',
    severity: 'high',
    pattern: /(?:password|passwd|pwd|passwort|kennwort|secret)\s*[=:]\s*["']?([^\s"']{8,})["']?/i,
    description: 'Password visible directly in text',
  },
  {
    id: 'secret_in_text',
    name: 'Secret in text',
    severity: 'high',
    pattern: /(?:api[_\-]?key|access[_\-]?key|access[_\-]?token|auth[_\-]?token)\s*[=:]\s*["']?([A-Za-z0-9\-_\.]{16,})["']?/i,
    description: 'API key/token directly in text',
  },
  {
    id: 'env_secret_assignment',
    name: 'Secret variable',
    severity: 'high',
    // Lengths are bounded, otherwise quadratic backtracking on long uppercase lines
    pattern: /^[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]{0,40}(?:TOKEN|SECRET|PASSWORD|PASSWD|PWD|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)[A-Z0-9_]{0,20}[ \t]*=[ \t]*["']?([^\s"'#]{12,})/m,
    description: 'Environment variable (SECRET/PASSWORD/TOKEN) with a real value',
    validator: (m) => isNonTrivialSecret(m[1]),
  },

  // ── Financial Data ─────────────────────────────────────
  {
    id: 'credit_card',
    name: 'Credit card number',
    severity: 'critical',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    description: 'Credit card number (Visa/MC/Amex/Discover)',
    validator: luhnCheck,
  },
  {
    id: 'iban',
    name: 'IBAN',
    severity: 'high',
    pattern: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]{0,16})\b/,
    description: 'International Bank Account Number',
    validator: validateIBAN,
  },
  {
    id: 'sepa_mandate',
    name: 'SEPA mandate',
    severity: 'medium',
    pattern: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{6,30}\b/,
    description: 'SEPA Mandate Reference',
    extraCheck: (text) => /sepa|mandat|lastschrift/i.test(text),
  },

  // ── German PII ─────────────────────────────────────────
  {
    id: 'de_personalausweis',
    name: 'German ID card number',
    severity: 'critical',
    pattern: /\b[LMNPRTVWXY][0-9A-Z]{8}[0-9]\b/,
    description: 'German Personalausweis number',
    extraCheck: (text) => /(?:personalausweis|ausweis|perso|dokument)/i.test(text),
    validator: validateIcaoCheckDigit,
  },
  {
    id: 'de_reisepass',
    name: 'German passport number',
    severity: 'critical',
    pattern: /\b[CFGHJKLMNPRTVWXYZ][0-9A-Z]{8}[0-9]\b/,
    description: 'German passport',
    extraCheck: (text) => /(?:reisepass|pass(?:nummer)?)/i.test(text),
    validator: validateIcaoCheckDigit,
  },
  {
    id: 'de_sozialversicherung',
    name: 'Social security number (DE)',
    severity: 'critical',
    pattern: /\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{3}\b/,
    description: 'German social security number',
    validator: validateDeRvnr,
  },
  {
    id: 'at_svnr',
    name: 'Social security number (AT)',
    severity: 'critical',
    pattern: /\b\d{4}[0-3]\d[0-1]\d{3}\d{2}\b/,
    description: 'Austrian social security number',
    extraCheck: (text) => /(?:svnr|sozialversicherung|österreich|austria)/i.test(text),
  },
  {
    id: 'ch_ahv',
    name: 'AHV number (CH)',
    severity: 'critical',
    pattern: /\b756\.[0-9]{4}\.[0-9]{4}\.[0-9]{2}\b/,
    description: 'Swiss AHV number',
  },
  {
    id: 'de_steuerid',
    name: 'Tax ID (DE)',
    severity: 'high',
    pattern: /\b[1-9]\d{10}\b/,
    description: 'German tax identification number',
    extraCheck: (text) => /(?:steuer|tin|steuer.?id|steuernummer)/i.test(text),
    validator: validateDeSteuerId,
  },
  {
    id: 'de_umsatzsteuer',
    name: 'VAT-ID (DE)',
    severity: 'medium',
    pattern: /\bDE[0-9]{9}\b/,
    description: 'German VAT identification number',
    validator: (m) => mod11_10(m[0].slice(2)),
  },
  {
    id: 'eu_vat_id',
    name: 'VAT ID (EU)',
    severity: 'medium',
    pattern: /\b(?:ATU\d{8}|BE[01]\d{9}|FR\d{11}|IT\d{11}|NL\d{9}B\d{2}|PL\d{10})\b/,
    description: 'VAT identification number (AT/BE/FR/IT/NL/PL) with valid check digit',
    validator: validateEuVat,
  },
  {
    id: 'de_kvnr',
    name: 'Health insurance number (DE)',
    severity: 'high',
    pattern: /\b[A-Z]\d{9}\b/,
    description: 'German health insurance number (KVNR)',
    extraCheck: (text) => /(?:krankenkasse|versicherung|kvnr|kasse)/i.test(text),
  },
  {
    id: 'de_phone',
    name: 'Phone number with name',
    severity: 'medium',
    pattern: /(?:tel|phone|mobil|fax|handy)\s*[=:.]?\s*\+?[0-9\s\-/()]{10,20}/i,
    description: 'Phone number with context',
  },

  // ── International IDs ──────────────────────────────────
  {
    id: 'us_ssn',
    name: 'US Social Security Number',
    severity: 'critical',
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    description: 'US Social Security Number (SSN)',
  },
  {
    id: 'uk_nino',
    name: 'UK National Insurance Number',
    severity: 'critical',
    pattern: /\b[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]\b/i,
    description: 'UK National Insurance Number',
  },
  {
    id: 'fr_nir',
    name: 'Social security number (FR)',
    severity: 'high',
    pattern: /\b[12378]\s?\d{2}\s?(?:0[1-9]|1[0-2]|[2-9]\d)\s?(?:\d{2}|2[AB])\s?\d{3}\s?\d{3}\s?\d{2}\b/,
    description: 'French social security number (NIR)',
    validator: validateFrNir,
  },
  {
    id: 'es_dni_nie',
    name: 'DNI/NIE (ES)',
    severity: 'high',
    pattern: /\b(?:\d{8}|[XYZ]-?\d{7})-?[TRWAGMYFPDXBNJZSQVHLCKE]\b/,
    description: 'Spanish national ID (DNI) or foreigner ID (NIE)',
    validator: validateEsDniNie,
  },
  {
    id: 'passport_generic',
    name: 'Passport (generic)',
    severity: 'high',
    pattern: /\b[A-Z]{1,2}[0-9]{6,9}\b/,
    description: 'Possible passport number',
    extraCheck: (text) => /(?:passport|reisepass|pass\s*no|passnummer)/i.test(text),
  },

  // ── CI/CD & Cloud Native ──────────────────────────────
  {
    id: 'circleci_token',
    name: 'CircleCI Token',
    severity: 'critical',
    pattern: /\b[A-Za-z0-9]{40}\b/,
    description: 'CircleCI API Token',
    extraCheck: (text) => /circleci/i.test(text),
  },
  {
    id: 'travis_token',
    name: 'Travis CI Token',
    severity: 'high',
    pattern: /\b[A-Za-z0-9]{22}\b/,
    description: 'Travis CI Token',
    extraCheck: (text) => /travis/i.test(text),
  },
  {
    id: 'github_actions_secret',
    name: 'GitHub Actions Secret',
    severity: 'critical',
    pattern: /\$\{\{\s*secrets\.[A-Z_]+\s*\}\}/,
    description: 'GitHub Actions secret reference (should not appear in logs)',
  },
  {
    id: 'jenkins_token',
    name: 'Jenkins Token',
    severity: 'high',
    pattern: /[A-Za-z0-9]{32,}/,
    description: 'Jenkins API Token',
    extraCheck: (text) => /jenkins/i.test(text),
  },

  // ── Monitoring & Analytics ────────────────────────────
  {
    id: 'datadog_key',
    name: 'Datadog API Key',
    severity: 'high',
    pattern: /\b[a-f0-9]{32}\b/,
    description: 'Datadog API Key',
    extraCheck: (text) => /datadog/i.test(text),
  },
  {
    id: 'sentry_dsn',
    name: 'Sentry DSN',
    severity: 'medium',
    pattern: /https:\/\/[a-f0-9]{32}@[a-z0-9.]+\.sentry\.io\/[0-9]+/,
    description: 'Sentry Data Source Name',
  },
  {
    id: 'newrelic_key',
    name: 'New Relic License Key',
    severity: 'high',
    pattern: /\b[A-Za-z0-9]{40}\b/,
    description: 'New Relic License Key',
    extraCheck: (text) => /new.?relic/i.test(text),
  },

  // ── High-Entropy Detection ────────────────────────────
  {
    id: 'high_entropy_hex',
    name: 'High-entropy hex string',
    severity: 'medium',
    pattern: /\b[0-9a-f]{40,}\b/i,
    description: 'Possible secret/token (high-entropy hex string)',
    validator: (m) => shannonEntropy(m[0]) > 3.5,
  },
  {
    id: 'high_entropy_b64',
    name: 'High-entropy Base64 string',
    severity: 'medium',
    pattern: /[A-Za-z0-9+/]{40,}={0,2}/,
    description: 'Possible secret (high-entropy Base64 string)',
    validator: (m) => shannonEntropy(m[0]) > 4.5 && m[0].length >= 40,
  },
  {
    id: 'private_key_material',
    name: 'Possible private key',
    severity: 'high',
    pattern: /[A-Za-z0-9+/]{64,}={0,2}/,
    description: 'High-entropy string — possible cryptographic key',
    validator: (m) => shannonEntropy(m[0]) > 5.0,
    extraCheck: (text) => !/<[^>]+>/.test(text), // No HTML
  },
];


// ── Validator Functions ───────────────────────────────────────────

function luhnCheck(match) {
  const num = match[0].replace(/\D/g, '');
  let sum = 0, alternate = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alternate) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function validateIBAN(match) {
  const iban = match[0].replace(/\s/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.split('').map(c => {
    const code = c.charCodeAt(0);
    return code >= 65 ? (code - 55).toString() : c;
  }).join('');
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + parseInt(numeric[i], 10)) % 97;
  }
  return remainder === 1;
}

function shannonEntropy(str) {
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  return Object.values(freq).reduce((e, f) => {
    const p = f / str.length;
    return e - p * Math.log2(p);
  }, 0);
}

// ISO 7064 MOD 11,10 (German tax ID, German VAT ID). Last digit = check digit.
function mod11_10(digits) {
  if (!/^\d{2,}$/.test(digits)) return false;
  let product = 10;
  for (let i = 0; i < digits.length - 1; i++) {
    let sum = (+digits[i] + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const check = (11 - product) % 10;
  return check === +digits[digits.length - 1];
}

// German tax ID: check digit + exactly one digit appearing 2 or 3 times in the first 10 digits
function validateDeSteuerId(match) {
  const d = match[0];
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const counts = {};
  for (const c of d.slice(0, 10)) counts[c] = (counts[c] || 0) + 1;
  const multi = Object.values(counts).filter((n) => n > 1);
  if (multi.length !== 1 || multi[0] > 3) return false;
  if (multi[0] === 3 && /(\d)\1\1/.test(d.slice(0, 10))) return false;
  return mod11_10(d);
}

// German pension insurance number: 2 area, 6 date of birth, letter, 2 serial, 1 check digit.
// Letter -> two-digit alphabet position, weights 2,1,2,5,7,1,2,1,2,1,2,1 (digit sums), mod 10.
function validateDeRvnr(match) {
  const v = match[0].replace(/\s/g, '');
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})([A-Z])(\d{2})(\d)$/.exec(v);
  if (!m) return false;
  const day = +m[2], month = +m[3];
  if (day < 1 || day > 31 || month < 1 || month > 12) return false;
  const letter = String(m[5].charCodeAt(0) - 64).padStart(2, '0');
  const digits = (m[1] + m[2] + m[3] + m[4] + letter + m[6]).split('').map(Number);
  const weights = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1];
  let sum = 0;
  digits.forEach((n, i) => { const p = n * weights[i]; sum += Math.floor(p / 10) + (p % 10); });
  return sum % 10 === +m[7];
}

// ICAO 9303 check digit (weights 7-3-1), last character = check digit.
// ID card/passport: 9-character serial number + check digit.
function validateIcaoCheckDigit(match) {
  const v = match[0].toUpperCase();
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < v.length - 1; i++) {
    const c = v[i];
    const n = c >= '0' && c <= '9' ? +c : c.charCodeAt(0) - 55;
    sum += n * weights[i % 3];
  }
  return sum % 10 === +v[v.length - 1];
}

// VAT IDs AT/BE/FR/IT/NL/PL (check digit algorithms of the member states)
function validateEuVat(match) {
  const v = match[0];
  const cc = v.slice(0, 2);
  if (cc === 'AT') {
    const d = v.slice(3).split('').map(Number);
    let s = 0;
    for (let i = 0; i < 7; i++) {
      const p = d[i] * (i % 2 ? 2 : 1);
      s += Math.floor(p / 10) + (p % 10);
    }
    return (10 - ((s + 4) % 10)) % 10 === d[7];
  }
  if (cc === 'BE') {
    const n = v.slice(2);
    return 97 - (+n.slice(0, 8) % 97) === +n.slice(8);
  }
  if (cc === 'FR') {
    const siren = +v.slice(4);
    return (12 + 3 * (siren % 97)) % 97 === +v.slice(2, 4);
  }
  if (cc === 'IT') {
    return !/^0{7}/.test(v.slice(2)) && luhnCheck([v.slice(2)]);
  }
  if (cc === 'NL') {
    const d = v.slice(2, 11).split('').map(Number);
    let s = 0;
    for (let i = 0; i < 8; i++) s += d[i] * (9 - i);
    if ((s - d[8]) % 11 === 0) return true;
    // Algorithm since 2020: "NL" + number mod 97 == 1 (N=23, L=21, B=11)
    const num = '2321' + v.slice(2, 11) + '11' + v.slice(12);
    let r = 0;
    for (const c of num) r = (r * 10 + +c) % 97;
    return r === 1;
  }
  if (cc === 'PL') {
    const d = v.slice(2).split('').map(Number);
    const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    const s = w.reduce((a, wi, i) => a + wi * d[i], 0) % 11;
    return s !== 10 && s === d[9];
  }
  return false;
}

// NIR: key = 97 - (13 digits mod 97); Corsica 2A/2B -> 19/18
function validateFrNir(match) {
  const v = match[0].replace(/\s/g, '').toUpperCase();
  if (v.length !== 15) return false;
  const dept = v.slice(5, 7);
  let body = v.slice(0, 13);
  if (dept === '2A') body = body.slice(0, 5) + '19' + body.slice(7);
  else if (dept === '2B') body = body.slice(0, 5) + '18' + body.slice(7);
  if (!/^\d{13}$/.test(body)) return false;
  return 97 - (Number(body) % 97) === +v.slice(13);
}

// DNI: 8 digits + letter (mod 23). NIE: X/Y/Z -> 0/1/2
function validateEsDniNie(match) {
  const v = match[0].replace(/-/g, '');
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const num = v.slice(0, -1).replace(/^[XYZ]/, (c) => 'XYZ'.indexOf(c));
  return letters[+num % 23] === v[v.length - 1];
}

// JWT payload contains "role":"service_role" (Supabase)
function jwtHasServiceRole(token) {
  let b64 = (token.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  let json = '';
  try {
    json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  } catch { return false; }
  return /"role"\s*:\s*"service_role"/.test(json);
}

// Value of a SECRET/TOKEN variable: no placeholders, variable references or example values
function isNonTrivialSecret(value) {
  if (!value) return false;
  if (/^(?:\$|<|%|\{\{)/.test(value)) return false;
  if (/change.?me|example|placeholder|your[_\-]|dummy|redacted|xxxx|\*\*\*|^(?:true|false|null|none)$/i.test(value)) return false;
  return shannonEntropy(value) >= 3;
}


// ── Main Scan Function ────────────────────────────────────────────

// Upper bound for the synchronous scan. ~80 regexes over several MB would
// freeze the main thread on paste. 1 MB comfortably covers real secret/config
// pastes; for larger pastes only the beginning is scanned (secrets in config
// dumps are practically always at the top).
const MAX_SCAN_LEN = 1_000_000;

// Organisation rules from the server (/config custom_rules), compiled via
// compileCustomRules() from custom-rules.js. Populated by the content script.
let CUSTOM_RULES = [];

function setCustomRules(list) {
  CUSTOM_RULES = compileCustomRules(list);
}

// findRuleMatch() (custom-rules.js): first valid match, including validator,
// match limit and protection against empty matches.
function scanText(text, customRules = CUSTOM_RULES) {
  if (!text || text.trim().length < 8) return [];
  if (text.length > MAX_SCAN_LEN) text = text.slice(0, MAX_SCAN_LEN);
  const findings = [];

  for (const rule of RULES.concat(customRules || [])) {
    try {
      if (rule.extraCheck && !rule.extraCheck(text)) continue;
      const match = findRuleMatch(rule, text);
      if (!match) continue;
      const f = {
        id:          rule.id,
        name:        rule.name,
        severity:    rule.severity,
        description: rule.description,
        match:       redact(match[0]),
      };
      if (rule.custom) f.custom = true;
      findings.push(f);
    } catch(e) {
      // Ignore rule errors
    }
  }
  return findings;
}

function redact(value) {
  if (!value) return '****';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

// HTML escaping for values inserted into the overlay innerHTML.
// f.match contains (redacted) fragments of the pasted text – escape defensively
// so no markup from pasted content is interpreted inside the overlay.
function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function sortFindings(findings) {
  return findings.sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
}

// Node tests (tests/detect.test.js) load the detector part via require().
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RULES, scanText, setCustomRules, sortFindings, redact, MAX_SCAN_LEN };
}

// ═══════════════════════════════════════════════════════
// Content Script
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  // Outside the browser (Node tests) only expose the detector
  if (typeof document === 'undefined') return;

  let activeWarning = null;
  let pendingPasteEvent = null;
  let pendingTarget = null;
  let pendingFindings = [];
  let ignoredDomains = new Set();
  const currentDomain = location.hostname;

  const ext = typeof browser !== 'undefined' ? browser : chrome;

  // Becomes true when the extension was reinstalled/reloaded while this page is still alive.
  // The content script can then no longer talk to the (new) service worker.
  let _extensionInvalidated = false;

  function isExtensionAlive() {
    if (_extensionInvalidated) return false;
    try {
      // chrome.runtime.id is undefined once the context has been invalidated
      if (!ext.runtime || !ext.runtime.id) {
        _extensionInvalidated = true;
        showReloadHint();
        return false;
      }
      return true;
    } catch {
      _extensionInvalidated = true;
      showReloadHint();
      return false;
    }
  }

  // One-time hint that the page needs to be reloaded
  let _reloadHintShown = false;
  function showReloadHint() {
    if (_reloadHintShown) return;
    _reloadHintShown = true;
    try {
      const hint = document.createElement('div');
      hint.style.cssText = `
        position: fixed; top: 24px; right: 24px;
        background: #1a1a1a; color: #f59e0b;
        border: 1px solid #f59e0b66; border-radius: 8px;
        padding: 14px 18px; font: 13px/1.4 system-ui, -apple-system, sans-serif;
        z-index: 2147483647; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        max-width: 360px;
      `;
      hint.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">Pastegate</div>
        <div style="color:#cbd5e1;font-size:12px;">${escHtml(t('reload_hint'))}</div>
      `;
      document.body.appendChild(hint);
      setTimeout(() => hint.remove(), 8000);
    } catch { /* page not in a state where we can modify the DOM */ }
  }
  let domainRules = [];

  // Initialise i18n – keep the promise, await it before showWarning
  initI18n(); // starts immediately, resolves quickly (normally <10ms)
  // ignoredDomains is populated by the admin backend (phase 2).
  // Users can no longer ignore domains themselves.
  ext.storage.sync.get(['enabled'], (_data) => {});
  ext.storage.local.get(['domain_rules', 'custom_rules'], (data) => {
    if (Array.isArray(data.domain_rules)) domainRules = data.domain_rules;
    setCustomRules(data.custom_rules);
  });
  // New config from the server takes effect without reloading the page
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.domain_rules) domainRules = Array.isArray(changes.domain_rules.newValue) ? changes.domain_rules.newValue : [];
    if (changes.custom_rules) setCustomRules(changes.custom_rules.newValue);
  });

  // ── Domain-Rule Matching ──────────────────────────────────────────
  function getDomainMode(hostname) {
    for (const rule of domainRules) {
      if (!rule.pattern || !rule.mode) continue;
      const pattern = rule.pattern.toLowerCase().trim();
      const host    = hostname.toLowerCase();
      if (pattern.startsWith('*.')) {
        const base = pattern.slice(2);
        if (host === base || host.endsWith('.' + base)) return rule.mode;
      } else {
        if (host === pattern) return rule.mode;
      }
    }
    return null;
  }

    // ── Paste Event ────────────────────────────────────────

  // Bypass flag: when the user clicked "Paste anyway", let the next paste
  // event within 10 seconds through without scanning.
  // Prevents the overlay from re-triggering on our own synthetic paste.
  let bypassNextPaste = 0;  // unix-ms timestamp until which the bypass is active

  document.addEventListener('paste', (e) => {
    // Extension context invalidated (e.g. after an update)?
    // Then let the paste through — the user should reload the page.
    if (!isExtensionAlive()) return;

    // If the bypass is active: let the paste through, clear the flag
    if (bypassNextPaste > Date.now()) {
      bypassNextPaste = 0;
      return;
    }

    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text || text.trim().length < 8) return;
    if (ignoredDomains.has(currentDomain)) return;

    // allow mode: the admin has allowlisted this domain – no scan
    if (getDomainMode(currentDomain) === 'allow') return;

    const findings = sortFindings(scanText(text));
    if (findings.length === 0) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    pendingPasteEvent = text;
    pendingTarget = e.target;

    ext.storage.sync.get({ enabled: true }, (data) => {
      if (!data.enabled) { pasteText(pendingTarget, pendingPasteEvent); return; }
      const domainMode = getDomainMode(currentDomain);
      // Make sure i18n is ready before the overlay is rendered
      initI18n().then(() => {
        showWarning(findings, text, pendingTarget, domainMode);
        updateStats(findings.length);
        reportEvent(findings, domainMode === 'hard_block' ? 'blocked_hard' : 'blocked');
      });
    });
  }, true);


  // ── Warning UI ─────────────────────────────────────────

  function showWarning(findings, text, target, mode) {
    pendingFindings = findings;
    const isHardBlock = mode === 'hard_block';
    if (activeWarning) activeWarning.remove();

    const severity = findings[0].severity;
    const severityColor = { critical:'#ef4444', high:'#f59e0b', medium:'#3b82f6', low:'#22c55e' }[severity] || '#ef4444';
    const severityLabel = t(`warn_severity_${severity}`) || t('warn_severity_critical');

    const overlay = document.createElement('div');
    overlay.id = '__pastegate_overlay__';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      backdrop-filter:blur(3px);animation:pg_fade_in 0.15s ease;
    `;

    // Organisation rules: name/description as delivered by the server (not translated)
    const label = (f) => f.custom
      ? { name: f.name, desc: f.description || '' }
      : tRule(f.id, f.name, f.description);

    const findingsHTML = findings.slice(0, 6).map(f => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
        border-radius:8px;margin-bottom:6px;">
        <div style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;
          background:${getSeverityBg(f.severity)};color:${getSeverityColor(f.severity)};
          white-space:nowrap;margin-top:1px;flex-shrink:0;">${t('sev_' + f.severity)}</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:#f0f0f0;margin-bottom:2px;">${escHtml(label(f).name)}</div>
          <div style="font-size:11px;color:#9ca3af;">${escHtml(label(f).desc)}</div>
          <div style="font-size:11px;color:#6b7280;font-family:monospace;margin-top:3px;">${escHtml(f.match)}</div>
        </div>
      </div>`).join('');

    const moreCount = findings.length > 6
      ? `<div style="font-size:12px;color:#6b7280;text-align:center;margin-top:4px;">${t('warn_more', {n: findings.length - 6})}</div>` : '';

    overlay.innerHTML = `
      <style>
        @keyframes pg_fade_in{from{opacity:0}to{opacity:1}}
        @keyframes pg_slide_up{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        #__ps_block__:hover,#__ps_paste__:hover{filter:brightness(1.12)}
      </style>
      <div style="background:#0d1117;border:1px solid rgba(255,255,255,0.1);
        border-top:3px solid ${severityColor};border-radius:14px;padding:24px;
        width:500px;max-width:calc(100vw - 40px);max-height:calc(100vh - 80px);
        overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.6);
        animation:pg_slide_up 0.2s ease;">

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0;">
            <rect width="24" height="24" rx="5.5" fill="#12181f" stroke="#2d3742" stroke-width="0.6"/>
            <rect x="5.5" y="5" width="13" height="15.5" rx="2.3" fill="none" stroke="#e6edf3" stroke-width="1.9"/>
            <rect x="9" y="3.3" width="6" height="3.4" rx="1.1" fill="#e6edf3"/>
            <rect x="3" y="11" width="18" height="3.6" rx="1.8" fill="#22c55e"/>
          </svg>
          <div>
            <div style="font-size:15px;font-weight:700;color:#f0f0f0;" data-i18n-overlay="warn_title">Pastegate</div>
            <div style="font-size:12px;color:#6b7280;" data-i18n-overlay="warn_subtitle">${t("warn_subtitle")} — ${severityLabel}</div>
          </div>
        </div>

        <div style="margin-bottom:16px;">${findingsHTML}${moreCount}</div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="__ps_block__" style="flex:1;min-width:120px;padding:10px 16px;
            background:#ef4444;color:#fff;border:none;border-radius:8px;
            font-size:13px;font-weight:600;cursor:pointer;transition:filter 0.15s;">
            ${t('btn_block')}</button>
          ${isHardBlock ? '' : `
          <button id="__ps_paste__" style="flex:1;min-width:120px;padding:10px 16px;
            background:rgba(255,255,255,0.06);color:#e0e0e0;
            border:1px solid rgba(255,255,255,0.12);border-radius:8px;
            font-size:13px;font-weight:500;cursor:pointer;transition:filter 0.15s;">
            ${t('btn_paste')}</button>`}
        </div>
        ${isHardBlock
          ? `<div style="margin-top:10px;text-align:center;font-size:11px;color:#6b7280;">
               ${t('hard_block_text')}
             </div>`
          : ''}
      </div>`;

    document.body.appendChild(overlay);
    activeWarning = overlay;

    // mousedown preventDefault on the overlay buttons: without it the click
    // steals focus/selection from the original edit target before the
    // subsequent insert runs — especially with contenteditable/framework editors
    // the insert then fails. preventDefault keeps focus & selection.
    const blockBtn = document.getElementById('__ps_block__');
    blockBtn.addEventListener('mousedown', (e) => e.preventDefault());
    blockBtn.addEventListener('click', closeWarning);

    const pasteBtn  = document.getElementById('__ps_paste__');
    if (pasteBtn) {
      pasteBtn.addEventListener('mousedown', (e) => e.preventDefault());
      pasteBtn.addEventListener('click', () => {
        // closeWarning() resets the pending values – save them first
        const target = pendingTarget;
        const text   = pendingPasteEvent;
        reportEvent(pendingFindings, 'allowed');
        closeWarning();
        pasteText(target, text);
      });
    }

    document.addEventListener('keydown', handleEsc);
  }

  function handleEsc(e) { if (e.key === 'Escape') closeWarning(); }

  function closeWarning() {
    if (activeWarning) { activeWarning.remove(); activeWarning = null; }
    document.removeEventListener('keydown', handleEsc);
    pendingPasteEvent = null; pendingTarget = null;
  }

  // ════════════════════════════════════════════════════════════════
  // pasteText - multi-editor strategy for maximum site compatibility
  // ════════════════════════════════════════════════════════════════
  // Order of attempts:
  //   1. Native input/textarea via React-compatible value setter
  //   2. Editor-specific insertion (Lexical, Slate, ProseMirror, CodeMirror, Monaco)
  //   3. Generic contenteditable via Selection API
  //   4. execCommand('insertText')
  //   5. Synthetic ClipboardEvent with DataTransfer
  //   6. Clipboard fallback with a hint to the user (Ctrl+V)

  function pasteText(target, text) {
    if (!text) return;

    // IMPORTANT: do NOT set the bypass unconditionally here. Only the synthetic
    // paste path (insertViaSyntheticPaste) and the clipboard fallback fire a
    // 'paste' event that would consume the bypass. Native insert / beforeinput
    // fires NO paste event → a blanket 10s bypass would wave through EVERY
    // further paste for 10 seconds (= "stops detecting").
    // So the bypass is now armed selectively, right before a synthetic
    // paste (see armPasteBypass()).

    if (!target) {
      writeClipboardWithHint(text);
      return;
    }

    // Focus the target — async via RAF so browser focus lands
    try { target.focus(); } catch { /* ignore */ }

    requestAnimationFrame(() => {
      // ── Path 1: <input>/<textarea> – direct, reliable insertion via the
      // value setter. Also covers Monaco (its input is a hidden textarea).
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (insertIntoNativeInput(target, text)) return;
      }

      // ── Path 2: rich editors (ProseMirror/claude.ai, Lexical, Slate, Quill,
      // Draft.js) + generic contenteditable. Only VERIFIED methods
      // (execCommand → synthetic paste) WITH success check. beforeinput is
      // deliberately NOT used – it is a no-op on ProseMirror but falsely reports
      // success (this was the cause of "Paste anyway does nothing").
      if (insertIntoRichEditor(target, text)) return;

      // ── Path 3: always-working fallback ──
      // After blocking, the text is still in the clipboard anyway.
      // Arm the bypass + show a "Ctrl+V" hint; the manual paste is let through.
      writeClipboardWithHint(text);
    });
  }

  // Native value setter (React/Vue compatible) for input/textarea
  function insertIntoNativeInput(target, text) {
    try {
      const proto  = target instanceof HTMLInputElement
        ? window.HTMLInputElement.prototype
        : window.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      const start  = target.selectionStart ?? target.value.length;
      const end    = target.selectionEnd   ?? target.value.length;
      const cur    = target.value ?? '';
      const newVal = cur.slice(0, start) + text + cur.slice(end);
      if (setter) setter.call(target, newVal);
      else        target.value = newVal;
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event('input',  { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch { return false; }
  }

  // Find the editable root (nearest contenteditable ancestor) to reliably
  // measure success by text length.
  function editableRoot(node) {
    let n = node;
    for (let i = 0; i < 8 && n; i++) {
      if (n.isContentEditable || n.getAttribute?.('contenteditable') === 'true') return n;
      n = n.parentElement;
    }
    return node;
  }

  // Inserts into rich editors / contenteditable – only with methods VERIFIED on
  // real editors (ProseMirror) and with a success check: we measure the text
  // length of the editable root before/after. If it does not grow, the attempt
  // counts as failed and the caller falls back to the clipboard hint.
  function insertIntoRichEditor(target, text) {
    const root = editableRoot(target);
    const sizeBefore = (root.textContent || '').length;

    // 1) execCommand('insertText') – verified on ProseMirror, Quill, generic CE
    try { document.execCommand('insertText', false, text); } catch { /* */ }
    if ((root.textContent || '').length > sizeBefore) return true;

    // 2) Synthetic paste event – verified on ProseMirror
    try { insertViaSyntheticPaste(target, text); } catch { /* */ }
    if ((root.textContent || '').length > sizeBefore) return true;

    return false;
  }

  // detectEditorType() is defined in editor-detect.js (loaded BEFORE content.js,
  // exposes the function globally). Single source of truth; the same function
  // is used in the Node harness tests.

  // Editor-specific insertion. Returns true if the insert succeeded.
  function insertIntoEditor(editorType, target, text) {
    switch (editorType) {
      case 'lexical':
      case 'slate':
      case 'prosemirror':
      case 'quill':
      case 'draftjs':
        // These editors respond most reliably to the native
        // beforeinput/InputEvent with inputType='insertFromPaste'.
        // They all have internal state machines that would ignore our selection inserts.
        return insertViaBeforeInput(target, text)
            || insertViaSyntheticPaste(target, text);

      case 'codemirror':
        // CodeMirror v6 responds to beforeinput, v5 to execCommand
        return insertViaBeforeInput(target, text)
            || insertViaExecCommand(target, text);

      case 'monaco':
        // Monaco ONLY responds to its internal API or beforeinput on the right element
        // (target is normally .inputarea — a hidden textarea)
        if (target instanceof HTMLTextAreaElement) {
          return insertIntoNativeInput(target, text);
        }
        return insertViaBeforeInput(target, text);
    }
    return false;
  }

  // Tries to dispatch a native InputEvent of type 'insertFromPaste' / 'insertText'
  function insertViaBeforeInput(target, text) {
    try {
      // First prepare the clipboard DataTransfer object
      const dt = new DataTransfer();
      dt.setData('text/plain', text);

      // beforeinput with inputType='insertFromPaste' — the "official" way on the modern web
      const beforeEvt = new InputEvent('beforeinput', {
        bubbles: true, cancelable: true,
        inputType: 'insertFromPaste',
        data: text,
        dataTransfer: dt,
      });
      const ok = target.dispatchEvent(beforeEvt);
      if (!ok) return true; // Editor handled it (preventDefault)

      // If the editor did not consume beforeinput: send an explicit InputEvent
      const inputEvt = new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      });
      target.dispatchEvent(inputEvt);
      return true;
    } catch { return false; }
  }

  // Arms the bypass only briefly (1.5s) so the synthetic paste dispatched right
  // after is let through by our own listener and NOT scanned again.
  // Short window: does not block the user's next real paste.
  function armPasteBypass(ms) {
    bypassNextPaste = Date.now() + (ms || 1500);
  }

  // Synthetic ClipboardEvent (paste) with DataTransfer
  function insertViaSyntheticPaste(target, text) {
    try {
      armPasteBypass();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const evt = new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt,
      });
      // dispatchEvent returns false if the event was preventDefault'ed
      // (= editor handled it = success)
      const notHandled = target.dispatchEvent(evt);
      return !notHandled;
    } catch { return false; }
  }

  // execCommand fallback (deprecated but widely supported)
  function insertViaExecCommand(target, text) {
    try {
      return document.execCommand('insertText', false, text);
    } catch { return false; }
  }

  // Generic contenteditable via Selection API
  function insertIntoContentEditable(target, text) {
    // Selection API first
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (target.contains(range.commonAncestorContainer) || target === range.commonAncestorContainer) {
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          target.dispatchEvent(new InputEvent('input', {
            bubbles: true, inputType: 'insertText', data: text,
          }));
          return true;
        }
      }
    } catch { /* fallthrough */ }

    // Then execCommand
    if (insertViaExecCommand(target, text)) {
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: text,
      }));
      return true;
    }

    // Then synthetic paste
    return insertViaSyntheticPaste(target, text);
  }

  // Writes the text to the system clipboard and shows the user a short hint to
  // press Ctrl+V. The user then pastes MANUALLY → longer bypass window (10s)
  // so their own Ctrl+V does not open the overlay again.
  function writeClipboardWithHint(text) {
    armPasteBypass(10000);
    try {
      navigator.clipboard.writeText(text).then(() => {
        showPasteHint();
      }).catch(() => {
        // Clipboard API blocked — last resort: execCommand('copy') with a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* nothing */ }
        ta.remove();
        showPasteHint();
      });
    } catch {
      showPasteHint();
    }
  }

  // Shows a 4-second hint telling the user to press Ctrl+V
  function showPasteHint() {
    const existing = document.getElementById('__ps_hint__');
    if (existing) existing.remove();

    const hint = document.createElement('div');
    hint.id = '__ps_hint__';
    hint.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      background: #1a1a1a; color: #00d4aa;
      border: 1px solid #00d4aa66; border-radius: 8px;
      padding: 14px 18px; font: 13px/1.4 system-ui, -apple-system, sans-serif;
      z-index: 2147483647; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      max-width: 320px;
    `;
    const isMac = /Mac/i.test(navigator.platform);
    const shortcut = isMac ? '⌘ + V' : (getI18nLang() === 'de' ? 'Strg + V' : 'Ctrl + V');
    hint.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">Pastegate</div>
      <div style="color:#cbd5e1;font-size:12px;">${t('paste_hint').replace('{kbd}', `<kbd style="background:#2a2a2a;padding:2px 6px;border-radius:3px;color:#00d4aa;font-size:11px;border:1px solid #444;">${shortcut}</kbd>`)}</div>
    `;
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 4000);
  }


  function updateStats(count) {
    ext.storage.sync.get({ totalBlocked: 0, todayBlocked: 0, lastDate: '' }, (data) => {
      const today = new Date().toDateString();
      ext.storage.sync.set({
        totalBlocked: (data.totalBlocked || 0) + count,
        todayBlocked: data.lastDate === today ? (data.todayBlocked || 0) + 1 : 1,
        lastDate: today,
      });
    });
  }

  // ── API-Reporter ────────────────────────────────────────────────
  // Sends an anonymised event to the background.js service worker,
  // which queues it and sends it to the server in batches.
  // What is sent:
  //   - category + severity of the rule (no plaintext, no snippet)
  //   - SHA-256 hash of the current URL (not the URL itself)
  //   - hostname/domain in plaintext (host only, not the path) – for triage
  //   - timestamp (UTC, rounded to the minute for k-anonymity)
  //   - action: "blocked" or "allowed" (pasted anyway)
  //   - rule_ids: array of triggered rule IDs

  async function reportEvent(findings, action) {
    try {
      const urlHash = await sha256(location.href);
      const ts = new Date();
      ts.setSeconds(0, 0); // Round to the minute

      const payload = {
        ts:        ts.toISOString(),
        url_hash:  urlHash,
        // Plaintext hostname (domain only, NOT the full path) for triage in the
        // dashboard ("which app?"). The full URL stays anonymous as a hash.
        host:      location.hostname,
        action,
        findings:  findings.map(f => ({
          rule_id:  f.id,
          severity: f.severity,
        })),
      };

      // Defensive: the extension context can be invalidated between the check and sendMessage
      if (!isExtensionAlive()) return;

      try {
        const sendResult = ext.runtime.sendMessage({ type: 'PASTE_EVENT', payload });
        // In MV3 sendMessage returns a promise — errors must be caught
        if (sendResult && typeof sendResult.catch === 'function') {
          sendResult.catch((err) => {
            // "Extension context invalidated" or "Could not establish connection"
            if (String(err?.message || '').match(/context invalidated|Could not establish/i)) {
              _extensionInvalidated = true;
              showReloadHint();
            }
          });
        }
      } catch (err) {
        if (String(err?.message || '').match(/context invalidated|Could not establish/i)) {
          _extensionInvalidated = true;
          showReloadHint();
        }
      }

      // Trigger a flush immediately → events show up in the dashboard right away
      setTimeout(() => {
        if (!isExtensionAlive()) return;
        try {
          const r = ext.runtime.sendMessage({ type: 'FLUSH_NOW' });
          if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch { /* nothing */ }
      }, 500);
    } catch {
      // Reporter errors must never block the paste flow
    }
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getSeverityBg(s) {
    return { critical:'rgba(239,68,68,0.15)', high:'rgba(245,158,11,0.15)', medium:'rgba(59,130,246,0.15)', low:'rgba(34,197,94,0.15)' }[s] || 'rgba(239,68,68,0.15)';
  }
  function getSeverityColor(s) {
    return { critical:'#ef4444', high:'#f59e0b', medium:'#60a5fa', low:'#22c55e' }[s] || '#ef4444';
  }

})();
