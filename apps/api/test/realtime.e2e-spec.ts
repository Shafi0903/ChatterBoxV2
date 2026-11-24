import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { SocketEvents } from '@chatterbox/shared';

describe('Realtime Gateway & Socket.IO (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let serverPort: number;

  const userA = { email: 'socket_a@chatterbox.app', username: 'socket_alice', displayName: 'Socket Alice', password: 'Password123!' };
  const userB = { email: 'socket_b@chatterbox.app', username: 'socket_bob', displayName: 'Socket Bob', password: 'Password123!' };
  const userC = { email: 'socket_c@chatterbox.app', username: 'socket_charlie', displayName: 'Socket Charlie', password: 'Password123!' };

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  let idA: string;
  let idB: string;
  let idC: string;

  let conversationId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.listen(0); // bind to dynamic ephemeral port
    const address = app.getHttpServer().address();
    serverPort = typeof address === 'string' ? 4000 : address.port;

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    // Clean up
    await prisma.user.deleteMany({
      where: {
        email: { in: [userA.email, userB.email, userC.email] },
      },
    });

    // Register accounts
    const resA = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userA).expect(201);
    tokenA = resA.body.data.accessToken;
    idA = resA.body.data.user.id;

    const resB = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userB).expect(201);
    tokenB = resB.body.data.accessToken;
    idB = resB.body.data.user.id;

    const resC = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userC).expect(201);
    tokenC = resC.body.data.accessToken;
    idC = resC.body.data.user.id;

    // Create DM between A & B
    const dmRes = await request(app.getHttpServer())
      .post('/api/v1/conversations/dm')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: idB })
      .expect(201);

    conversationId = dmRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [userA.email, userB.email, userC.email] },
      },
    });
    await app.close();
  });

  describe('1. Handshake Authentication', () => {
    it('rejects connection when no token is provided', (done) => {
      const socket = io(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect_error', (err) => {
        expect(err.message).toBe('Authentication token required');
        socket.disconnect();
        done();
      });

      socket.on('connect', () => {
        socket.disconnect();
        done(new Error('Should not have connected without token'));
      });
    });

    it('rejects connection with invalid token', (done) => {
      const socket = io(`http://localhost:${serverPort}`, {
        auth: { token: 'invalid_forged_jwt_token' },
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect_error', (err) => {
        expect(err.message).toBe('Invalid or expired token');
        socket.disconnect();
        done();
      });

      socket.on('connect', () => {
        socket.disconnect();
        done(new Error('Should not have connected with invalid token'));
      });
    });

    it('connects successfully with valid token', (done) => {
      const socket = io(`http://localhost:${serverPort}`, {
        auth: { token: tokenA },
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.disconnect();
        done();
      });
    });
  });

  describe('2. Multi-Client Real-Time Messaging & Idempotency', () => {
    let socketA: Socket;
    let socketB: Socket;

    beforeAll((done) => {
      socketA = io(`http://localhost:${serverPort}`, {
        auth: { token: tokenA },
        transports: ['websocket'],
        reconnection: false,
      });

      socketB = io(`http://localhost:${serverPort}`, {
        auth: { token: tokenB },
        transports: ['websocket'],
        reconnection: false,
      });

      let connectedCount = 0;
      const checkConnected = () => {
        connectedCount++;
        if (connectedCount === 2) done();
      };

      socketA.on('connect', checkConnected);
      socketB.on('connect', checkConnected);
    });

    afterAll(() => {
      socketA?.disconnect();
      socketB?.disconnect();
    });

    it('Socket A sends message:send -> Socket B receives message:new and Socket A gets ack', (done) => {
      const clientMessageId = `live_socket_msg_${Date.now()}`;
      const content = 'Realtime greeting from Alice to Bob!';

      // Socket B expects message:new
      socketB.once(SocketEvents.MESSAGE_NEW, (payload: any) => {
        try {
          expect(payload.message).toBeDefined();
          expect(payload.message.clientMessageId).toBe(clientMessageId);
          expect(payload.message.content).toBe(content);
          expect(payload.message.sender.username).toBe(userA.username);
          done();
        } catch (err) {
          done(err);
        }
      });

      // Socket A sends message
      socketA.emit(
        SocketEvents.MESSAGE_SEND,
        {
          conversationId,
          clientMessageId,
          content,
        },
        (ack: any) => {
          expect(ack.ok).toBe(true);
          expect(ack.message.clientMessageId).toBe(clientMessageId);
        },
      );
    });

    it('Idempotency: Re-emitting same clientMessageId returns original without second broadcast', (done) => {
      const clientMessageId = 'idempotent_test_001';

      // First send
      socketA.emit(
        SocketEvents.MESSAGE_SEND,
        {
          conversationId,
          clientMessageId,
          content: 'First emit text',
        },
        (ack1: any) => {
          expect(ack1.ok).toBe(true);

          // Second send with same clientMessageId
          socketA.emit(
            SocketEvents.MESSAGE_SEND,
            {
              conversationId,
              clientMessageId,
              content: 'Duplicate emit text',
            },
            (ack2: any) => {
              expect(ack2.ok).toBe(true);
              expect(ack2.message.id).toBe(ack1.message.id);
              done();
            },
          );
        },
      );
    });

    it('Typing indicator: Socket A emits typing:start -> Socket B receives typing:update', (done) => {
      socketB.once(SocketEvents.TYPING_UPDATE, (payload: any) => {
        expect(payload.conversationId).toBe(conversationId);
        expect(payload.userId).toBe(idA);
        expect(payload.isTyping).toBe(true);
        done();
      });

      socketA.emit(SocketEvents.TYPING_START, { conversationId });
    });
  });

  describe('3. Stranger Room Intrusion Protection', () => {
    let socketC: Socket;

    beforeAll((done) => {
      socketC = io(`http://localhost:${serverPort}`, {
        auth: { token: tokenC }, // User C is stranger to conversationId
        transports: ['websocket'],
        reconnection: false,
      });

      socketC.on('connect', () => done());
    });

    afterAll((done) => {
      if (socketC?.connected) {
        socketC.disconnect();
      }
      setTimeout(done, 50);
    });

    it('Socket C emits conversation:join for private chat -> rejected with FORBIDDEN', (done) => {
      socketC.emit(
        SocketEvents.CONVERSATION_JOIN,
        { conversationId },
        (ack: any) => {
          expect(ack.ok).toBe(false);
          expect(ack.code).toBe('FORBIDDEN');
          done();
        },
      );
    });
  });

  describe('4. Redis Presence Tracking & Grace Period', () => {
    let tempSocket: Socket;

    beforeAll(async () => {
      await redis.del(`presence:sockets:${idC}`);
    });

    it('User connects -> presence set shows active socket', (done) => {
      tempSocket = io(`http://localhost:${serverPort}`, {
        auth: { token: tokenC },
        transports: ['websocket'],
        reconnection: false,
      });

      tempSocket.on('connect', () => {
        setTimeout(async () => {
          try {
            const count = await redis.scard(`presence:sockets:${idC}`);
            expect(count).toBeGreaterThanOrEqual(1);
            done();
          } catch (err) {
            done(err);
          }
        }, 50);
      });
    });

    it('User disconnects -> after test grace timeout (150ms), presence transitions to OFFLINE', (done) => {
      tempSocket.disconnect();

      setTimeout(async () => {
        try {
          const count = await redis.scard(`presence:sockets:${idC}`);
          expect(count).toBe(0);
          done();
        } catch (err) {
          done(err);
        }
      }, 250);
    });
  });
});
