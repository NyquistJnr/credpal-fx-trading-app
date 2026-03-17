export abstract class DomainEvent {
  readonly occurredAt: Date;
  abstract readonly eventName: string;

  constructor() {
    this.occurredAt = new Date();
  }
}
