import Editor from './Editor';
import HistoryManager from './HistoryManager';
import type { Command } from './Command';

class DeleteCommand implements Command {
  private readonly editor: Editor;

  private readonly count: number;

  private readonly history: HistoryManager;

  constructor(editor: Editor, history: HistoryManager, count: number) {
    this.editor = editor;
    this.count = count;
    this.history = history;
  }

  execute(): void {
    this.history.saveState(this.editor);
    const current = this.editor.getText();
    const next = current.slice(0, Math.max(0, current.length - this.count));
    this.editor.setText(next);
  }

  undo(): void {
    this.history.undo(this.editor);
  }
}

export default DeleteCommand;


