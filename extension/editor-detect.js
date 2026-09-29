// ═══════════════════════════════════════════════════════
// Pastegate — editor-detect.js
// Detects the editor type from typical DOM markers.
// Loaded BEFORE content.js (manifest content_scripts) and exposes the
// function globally. Also usable via module.exports for Node tests
// (extension/tests/) — single source of truth, no duplicate.
// ═══════════════════════════════════════════════════════

(function (root) {
  // Scans the element + up to 8 ancestors for known editor markers.
  // Order = priority. Returns the editor type or null.
  function detectEditorType(el) {
    if (!el) return null;
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      // Lexical (Outlook, Facebook)
      if (node.hasAttribute && node.hasAttribute('data-lexical-editor')) return 'lexical';
      // Slate (Notion-like, many modern React editors)
      if (node.hasAttribute && node.hasAttribute('data-slate-editor')) return 'slate';
      // ProseMirror (Atlassian, TipTap)
      if (node.classList && (node.classList.contains('ProseMirror') || node.classList.contains('tiptap'))) return 'prosemirror';
      // CodeMirror v6 (.cm-editor) and v5 (.CodeMirror)
      if (node.classList && (node.classList.contains('cm-editor') || node.classList.contains('CodeMirror'))) return 'codemirror';
      // Monaco (VS Code Web, GitHub Copilot Web)
      if (node.classList && node.classList.contains('monaco-editor')) return 'monaco';
      // Quill
      if (node.classList && node.classList.contains('ql-editor')) return 'quill';
      // Draft.js (old Twitter, some Notion predecessors)
      if (node.hasAttribute && node.hasAttribute('data-contents')) return 'draftjs';
      node = node.parentElement;
    }
    return null;
  }

  // List of supported framework editors (for tests / docs).
  const SUPPORTED_EDITORS = ['lexical', 'slate', 'prosemirror', 'codemirror', 'monaco', 'quill', 'draftjs'];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectEditorType, SUPPORTED_EDITORS };
  }
  if (root) {
    root.detectEditorType = detectEditorType;       // bare global for content.js
    root.PSEditorDetect = { detectEditorType, SUPPORTED_EDITORS };
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
