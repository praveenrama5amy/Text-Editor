import Memento from './Memento';

class Editor {
  private content: string = '';

  getText(): string {
    return this.content;
  }

  setText(nextText: string): void {
    this.content = nextText;
  }

  createMemento(): Memento {
    return new Memento(this.content);
  }

  restore(memento: Memento): void {
    this.content = memento.getState();
  }
}

export default Editor;


