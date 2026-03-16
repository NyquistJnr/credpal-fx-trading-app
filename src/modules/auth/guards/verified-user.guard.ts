import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserNotVerifiedException } from '../../../common/filters/business-exception';

@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User;

    if (!user.isVerified) {
      throw new UserNotVerifiedException();
    }

    return true;
  }
}
