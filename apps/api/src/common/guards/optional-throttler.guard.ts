import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class OptionalThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Never allow disabling throttling in production
    if (
      process.env.NODE_ENV !== 'production' &&
      (process.env.THROTTLE_DISABLED === 'true' ||
        (process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_THROTTLE !== 'true'))
    ) {
      return true;
    }
    return super.canActivate(context);
  }
}
