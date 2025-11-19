import Editor from './Editor';
import Memento from './Memento';

class HistoryManager {
  private undoStack: Memento[] = [];

  private redoStack: Memento[] = [];

  private stateTimeout: NodeJS.Timeout | null = null;

  saveState(editor: Editor): void {
    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
    }
    this.stateTimeout = setTimeout(() => {
      this.undoStack.push(editor.createMemento());
      this.redoStack = [];
    }, 500);

  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(editor: Editor): void {
    if (!this.canUndo()) return;
    const current = editor.createMemento();
    const previous = this.undoStack.pop()!;
    this.redoStack.push(current);
    editor.restore(previous);
  }

  redo(editor: Editor): void {
    if (!this.canRedo()) return;
    const current = editor.createMemento();
    const next = this.redoStack.pop()!;
    this.undoStack.push(current);
    editor.restore(next);
  }
}

export default HistoryManager;


