import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from './domain-event';

@Injectable()
export class DomainEventEmitter {
  private readonly logger = new Logger(DomainEventEmitter.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async emit(event: DomainEvent): Promise<void> {
    this.logger.log(
      `Emitting event: ${event.eventName} at ${event.occurredAt.toISOString()}`,
    );

    this.eventEmitter.emit(event.eventName, event);
  }

  async emitAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.emit(event);
    }
  }
}
