import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../../common/enums';

@Entity('transactions')
@Index('IDX_transaction_user', ['userId'])
@Index('IDX_transaction_idempotency', ['idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
export class Transaction extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({
    name: 'from_currency',
    type: 'enum',
    enum: Currency,
    nullable: true,
  })
  fromCurrency: Currency | null;

  @Column({ name: 'to_currency', type: 'enum', enum: Currency })
  toCurrency: Currency;

  @Column({
    name: 'from_amount',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  fromAmount: number | null;

  @Column({ name: 'to_amount', type: 'decimal', precision: 18, scale: 4 })
  toAmount: number;

  @Column({
    name: 'rate_used',
    type: 'decimal',
    precision: 18,
    scale: 8,
    nullable: true,
  })
  rateUsed: number | null;

  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ManyToOne(() => User, (user) => user.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
