// Real ProseMirror editor (as on claude.ai / chatgpt.com) for the bypass test
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-schema-basic';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

window.view = new EditorView(document.querySelector('#pm'), {
  state: EditorState.create({ schema, plugins: [keymap(baseKeymap)] }),
});
