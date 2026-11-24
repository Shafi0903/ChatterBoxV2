import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { SocketEvents } from '@chatterbox/shared';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  getServer(): Server | null {
    return this.server;
  }

  /**
   * User adjustment #1: Immediately joins active sockets of user into conversation room
   * and emits conversation:updated to personal user room.
   */
  joinUserSocketsToRoom(userId: string, conversationId: string) {
    if (!this.server) return;
    try {
      this.server.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);
    } catch (err: any) {
      this.logger.error(`Error joining sockets of user ${userId}: ${err.message}`);
    }
  }

  /**
   * Adjustment #2: Evicts active sockets of user from specified room (e.g. channel:<channelId>)
   */
  leaveUserSocketsFromRoom(userId: string, roomName: string) {
    if (!this.server) return;
    try {
      this.server.in(`user:${userId}`).socketsLeave(roomName);
    } catch (err: any) {
      this.logger.error(`Error evicting sockets of user ${userId} from room ${roomName}: ${err.message}`);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToRoom(roomName: string, event: string, payload: unknown, excludeSocketId?: string) {
    if (!this.server) return;
    if (excludeSocketId) {
      this.server.to(roomName).except(excludeSocketId).emit(event, payload);
    } else {
      this.server.to(roomName).emit(event, payload);
    }
  }

  emitToConversation(conversationId: string, event: string, payload: unknown, excludeSocketId?: string) {
    this.emitToRoom(`conversation:${conversationId}`, event, payload, excludeSocketId);
  }
}
