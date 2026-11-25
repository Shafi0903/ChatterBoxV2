import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EncryptionService } from './encryption.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  registerDeviceSchema,
  rotateSignedPreKeySchema,
  replenishPreKeysSchema,
  RegisterDeviceDto,
  RotateSignedPreKeyDto,
  ReplenishPreKeysDto,
  SocketEvents,
} from '@chatterbox/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('encryption')
@UseGuards(JwtAuthGuard)
export class EncryptionController {
  constructor(
    private readonly encryptionService: EncryptionService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    return this.encryptionService.registerDevice(userId, dto);
  }

  @Get('devices')
  async getMyDevices(@CurrentUser('userId') userId: string) {
    return this.encryptionService.getMyDevices(userId);
  }

  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.OK)
  async revokeDevice(
    @CurrentUser('userId') userId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.encryptionService.revokeDevice(userId, deviceId);
  }

  @Post('devices/:deviceId/signed-prekey')
  @HttpCode(HttpStatus.OK)
  async rotateSignedPreKey(
    @CurrentUser('userId') userId: string,
    @Param('deviceId') deviceId: string,
    @Body(new ZodValidationPipe(rotateSignedPreKeySchema)) dto: RotateSignedPreKeyDto,
  ) {
    return this.encryptionService.rotateSignedPreKey(userId, deviceId, dto);
  }

  @Post('devices/:deviceId/prekeys')
  @HttpCode(HttpStatus.OK)
  async replenishPreKeys(
    @CurrentUser('userId') userId: string,
    @Param('deviceId') deviceId: string,
    @Body(new ZodValidationPipe(replenishPreKeysSchema)) dto: ReplenishPreKeysDto,
  ) {
    return this.encryptionService.replenishPreKeys(userId, deviceId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('users/:userId/keys')
  async getUserKeyBundles(
    @CurrentUser('userId') callerId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.encryptionService.getUserKeyBundles(callerId, targetUserId);
  }

  @Post('conversations/:conversationId/enable')
  @HttpCode(HttpStatus.OK)
  async enableConversationE2ee(
    @CurrentUser('userId') userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    const updated = await this.encryptionService.enableConversationE2ee(conversationId, userId);
    const conversation = await this.conversationsService.getConversation(userId, conversationId);

    this.realtimeService.emitToConversation(
      conversationId,
      SocketEvents.CONVERSATION_UPDATED,
      { conversation },
    );

    return { success: true, conversationId: updated.id, isEncrypted: updated.isEncrypted };
  }

  @Get('users/:userId/safety-number')
  async getSafetyNumber(
    @CurrentUser('userId') callerId: string,
    @Param('userId') peerUserId: string,
  ) {
    return this.encryptionService.getSafetyNumber(callerId, peerUserId);
  }
}
