import { Column, Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
import { Currency } from '../../../common/enums';

@Entity('wallet_balances')
@Unique('UQ_user_currency', ['userId', 'currency'])
export class WalletBalance extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: Currency })
  currency: Currency;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  balance: number;

  @ManyToOne(() => User, (user) => user.walletBalances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
