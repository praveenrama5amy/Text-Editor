import Editor from './Editor';
import HistoryManager from './HistoryManager';
import type { Command } from './Command';

class TypeCommand implements Command {
  private readonly editor: Editor;

  private readonly textToAdd: string;

  private readonly history: HistoryManager;

  private  stateTimeout: NodeJS.Timeout | null = null;

  constructor(editor: Editor, history: HistoryManager, textToAdd: string) {
    this.editor = editor;
    this.textToAdd = textToAdd;
    this.history = history;
  }

  execute(): void {
    this.history.saveState(this.editor);
    this.editor.setText(this.editor.getText() + this.textToAdd);
  }

  undo(): void {
    this.history.undo(this.editor);
  }
}

export default TypeCommand;


