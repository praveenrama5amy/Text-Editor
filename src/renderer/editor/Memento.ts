export class Memento {
  private readonly state: string;

  constructor(state: string) {
    this.state = state;
  }

  getState(): string {
    return this.state;
  }
}

export default Memento;


