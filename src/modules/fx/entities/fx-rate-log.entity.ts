import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('fx_rate_logs')
@Index('IDX_fx_rate_pair', ['baseCurrency', 'targetCurrency'])
export class FxRateLog extends BaseEntity {
  @Column({ name: 'base_currency', length: 3 })
  baseCurrency: string;

  @Column({ name: 'target_currency', length: 3 })
  targetCurrency: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rate: number;

  @Column({ name: 'provider' })
  provider: string;

  @Column({ name: 'fetched_at', type: 'timestamp' })
  fetchedAt: Date;
}
