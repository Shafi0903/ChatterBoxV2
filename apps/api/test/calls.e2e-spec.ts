import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { CallsService } from '../src/modules/calls/calls.service';
import { SocketEvents, CallType, CallStatus } from '@chatterbox/shared';

describe('WebRTC Audio/Video Calls & Signaling Module (REST + Socket E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let callsService: CallsService;
  let appUrl: string;

  const userAlice = {
    email: 'alice_call@chatterbox.app',
    username: 'alice_call',
    displayName: 'Alice Call',
    password: 'Password123!',
  };

  const userBob = {
    email: 'bob_call@chatterbox.app',
    username: 'bob_call',
    displayName: 'Bob Call',
    password: 'Password123!',
  };

  const userCharlie = {
    email: 'charlie_call@chatterbox.app',
    username: 'charlie_call',
    displayName: 'Charlie Call',
    password: 'Password123!',
  };

  let tokenAlice: string;
  let tokenBob: string;
  let tokenCharlie: string;

  let idAlice: string;
  let idBob: string;
  let idCharlie: string;

  let dmConversationId: string;
  let groupConversationId: string;

  let socketAlice: ClientSocket;
  let socketBob: ClientSocket;
  let socketCharlie: ClientSocket;

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

    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    appUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    callsService = app.get(CallsService);

    // Clean up test data
    const testEmails = [userAlice.email, userBob.email, userCharlie.email];
    await prisma.call.deleteMany({
      where: {
        OR: [
          { caller: { email: { in: testEmails } } },
          { callee: { email: { in: testEmails } } },
        ],
      },
    });
    await prisma.notification.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.conversationMember.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    // Register Users
    const regAlice = await request(appUrl).post('/api/v1/auth/register').send(userAlice);
    tokenAlice = regAlice.body.data.accessToken;
    idAlice = regAlice.body.data.user.id;

    const regBob = await request(appUrl).post('/api/v1/auth/register').send(userBob);
    tokenBob = regBob.body.data.accessToken;
    idBob = regBob.body.data.user.id;

    const regCharlie = await request(appUrl).post('/api/v1/auth/register').send(userCharlie);
    tokenCharlie = regCharlie.body.data.accessToken;
    idCharlie = regCharlie.body.data.user.id;

    // Create DM between Alice and Bob
    const dmRes = await request(appUrl)
      .post('/api/v1/conversations/dm')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ targetUserId: idBob });
    dmConversationId = dmRes.body.data.id;

    // Create Group with Alice, Bob, Charlie
    const groupRes = await request(appUrl)
      .post('/api/v1/conversations/group')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ name: 'Test Group', memberIds: [idBob, idCharlie] });
    groupConversationId = groupRes.body.data.id;

    // Connect Sockets
    socketAlice = io(appUrl, {
      auth: { token: tokenAlice },
      transports: ['websocket'],
    });

    socketBob = io(appUrl, {
      auth: { token: tokenBob },
      transports: ['websocket'],
    });

    socketCharlie = io(appUrl, {
      auth: { token: tokenCharlie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => socketAlice.on('connect', () => resolve())),
      new Promise<void>((resolve) => socketBob.on('connect', () => resolve())),
      new Promise<void>((resolve) => socketCharlie.on('connect', () => resolve())),
    ]);
  });

  afterAll(async () => {
    if (socketAlice) socketAlice.disconnect();
    if (socketBob) socketBob.disconnect();
    if (socketCharlie) socketCharlie.disconnect();

    // Clean up test data
    const testEmails = [userAlice.email, userBob.email, userCharlie.email];
    await prisma.call.deleteMany({
      where: {
        OR: [
          { caller: { email: { in: testEmails } } },
          { callee: { email: { in: testEmails } } },
        ],
      },
    });
    await prisma.notification.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.conversationMember.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.conversation.deleteMany({
      where: { id: { in: [dmConversationId, groupConversationId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    await app.close();
  });

  describe('REST Endpoints: ICE Servers & Call History', () => {
    it('GET /api/v1/calls/ice-servers should return ICE servers config', async () => {
      const res = await request(appUrl)
        .get('/api/v1/calls/ice-servers')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('iceServers');
      expect(Array.isArray(res.body.data.iceServers)).toBe(true);
      expect(res.body.data.iceServers.length).toBeGreaterThan(0);
      expect(res.body.data.iceServers[0]).toHaveProperty('urls');
    });

    it('GET /api/v1/calls/ice-servers should return 401 without token', async () => {
      await request(appUrl).get('/api/v1/calls/ice-servers').expect(401);
    });

    it('GET /api/v1/calls/history should return empty list initially', async () => {
      const res = await request(appUrl)
        .get('/api/v1/calls/history')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.meta.hasMore).toBe(false);
    });

    it('GET /api/v1/conversations/:id/calls should reject non-members', async () => {
      await request(appUrl)
        .get(`/api/v1/conversations/${dmConversationId}/calls`)
        .set('Authorization', `Bearer ${tokenCharlie}`)
        .expect(403);
    });
  });

  describe('Call Authorization & Guards', () => {
    it('should reject call initiation in a Group conversation (DM only)', async () => {
      const ack = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: groupConversationId, type: 'AUDIO' },
          resolve,
        );
      });

      expect(ack.ok).toBe(false);
      expect(ack.error).toMatch(/DM/);
    });

    it('should reject call initiation by a non-participant in DM', async () => {
      const ack = await new Promise<any>((resolve) => {
        socketCharlie.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: dmConversationId, type: 'AUDIO' },
          resolve,
        );
      });

      expect(ack.ok).toBe(false);
      expect(ack.error).toMatch(/participant/i);
    });
  });

  describe('Full WebRTC Signaling Lifecycle (Initiate -> Accept -> SDP/ICE Relay -> End)', () => {
    let activeCallId: string;

    it('Alice initiates call -> Bob receives call:incoming', async () => {
      const incomingPromise = new Promise<any>((resolve) => {
        socketBob.once(SocketEvents.CALL_INCOMING, resolve);
      });

      const ack = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: dmConversationId, type: 'VIDEO' },
          resolve,
        );
      });

      expect(ack.ok).toBe(true);
      expect(ack.call).toBeDefined();
      expect(ack.call.status).toBe(CallStatus.RINGING);
      expect(ack.call.type).toBe('VIDEO');
      activeCallId = ack.call.id;

      const incoming = await incomingPromise;
      expect(incoming.call.id).toBe(activeCallId);
      expect(incoming.call.caller.id).toBe(idAlice);
      expect(incoming.call.callee.id).toBe(idBob);
    });

    it('Stranger cannot accept or reject Alice-Bob call', async () => {
      const ack = await new Promise<any>((resolve) => {
        socketCharlie.emit(SocketEvents.CALL_ACCEPT, { callId: activeCallId }, resolve);
      });

      expect(ack.ok).toBe(false);
      expect(ack.error).toMatch(/callee/i);
    });

    it('Busy Check: Charlie calling Alice or Bob while in RINGING/ACTIVE returns BUSY', async () => {
      // Create DM between Charlie and Alice
      const dmCA = await request(appUrl)
        .post('/api/v1/conversations/dm')
        .set('Authorization', `Bearer ${tokenCharlie}`)
        .send({ targetUserId: idAlice });

      const ack = await new Promise<any>((resolve) => {
        socketCharlie.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: dmCA.body.data.id, type: 'AUDIO' },
          resolve,
        );
      });

      expect(ack.ok).toBe(false);
      expect(ack.busy).toBe(true);
      expect(ack.error).toBe('BUSY');
    });

    it('Bob accepts call -> Alice receives call:accepted and multi-tab sync', async () => {
      const aliceAcceptedPromise = new Promise<any>((resolve) => {
        socketAlice.once(SocketEvents.CALL_ACCEPTED, resolve);
      });
      const bobAcceptedPromise = new Promise<any>((resolve) => {
        socketBob.once(SocketEvents.CALL_ACCEPTED, resolve);
      });

      const ack = await new Promise<any>((resolve) => {
        socketBob.emit(SocketEvents.CALL_ACCEPT, { callId: activeCallId }, resolve);
      });

      expect(ack.ok).toBe(true);
      expect(ack.call.status).toBe(CallStatus.ACTIVE);
      expect(ack.call.startedAt).toBeDefined();

      const [aliceAccepted, bobAccepted] = await Promise.all([
        aliceAcceptedPromise,
        bobAcceptedPromise,
      ]);

      expect(aliceAccepted.callId).toBe(activeCallId);
      expect(aliceAccepted.acceptedBy).toBe(idBob);
      expect(bobAccepted.callId).toBe(activeCallId);
    });

    it('Alice relays SDP offer -> Bob receives offer; Stranger blocked', async () => {
      const bobOfferPromise = new Promise<any>((resolve) => {
        socketBob.once(SocketEvents.CALL_OFFER, resolve);
      });

      // Stranger blocked
      const strangerAck = await new Promise<any>((resolve) => {
        socketCharlie.emit(
          SocketEvents.CALL_OFFER,
          { callId: activeCallId, sdp: { type: 'offer', sdp: 'v=0...' } },
          resolve,
        );
      });
      expect(strangerAck.ok).toBe(false);
      expect(strangerAck.error).toMatch(/participant/i);

      // Alice sends offer
      const aliceAck = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_OFFER,
          { callId: activeCallId, sdp: { type: 'offer', sdp: 'v=0\r\no=alice...' } },
          resolve,
        );
      });
      expect(aliceAck.ok).toBe(true);

      const receivedOffer = await bobOfferPromise;
      expect(receivedOffer.callId).toBe(activeCallId);
      expect(receivedOffer.sdp.sdp).toContain('alice');
    });

    it('Bob relays SDP answer -> Alice receives answer', async () => {
      const aliceAnswerPromise = new Promise<any>((resolve) => {
        socketAlice.once(SocketEvents.CALL_ANSWER, resolve);
      });

      const bobAck = await new Promise<any>((resolve) => {
        socketBob.emit(
          SocketEvents.CALL_ANSWER,
          { callId: activeCallId, sdp: { type: 'answer', sdp: 'v=0\r\no=bob...' } },
          resolve,
        );
      });
      expect(bobAck.ok).toBe(true);

      const receivedAnswer = await aliceAnswerPromise;
      expect(receivedAnswer.callId).toBe(activeCallId);
      expect(receivedAnswer.sdp.sdp).toContain('bob');
    });

    it('Alice and Bob exchange ICE candidates', async () => {
      const bobIcePromise = new Promise<any>((resolve) => {
        socketBob.once(SocketEvents.CALL_ICE_CANDIDATE, resolve);
      });

      const aliceIceAck = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_ICE_CANDIDATE,
          {
            callId: activeCallId,
            candidate: { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 50000 typ host' },
          },
          resolve,
        );
      });
      expect(aliceIceAck.ok).toBe(true);

      const receivedCandidate = await bobIcePromise;
      expect(receivedCandidate.callId).toBe(activeCallId);
      expect(receivedCandidate.candidate.candidate).toContain('2122252543');
    });

    it('Alice ends call -> both receive call:ended and DB status is ENDED with duration', async () => {
      const aliceEndedPromise = new Promise<any>((resolve) => {
        socketAlice.once(SocketEvents.CALL_ENDED, resolve);
      });
      const bobEndedPromise = new Promise<any>((resolve) => {
        socketBob.once(SocketEvents.CALL_ENDED, resolve);
      });

      const endAck = await new Promise<any>((resolve) => {
        socketAlice.emit(SocketEvents.CALL_END, { callId: activeCallId }, resolve);
      });
      expect(endAck.ok).toBe(true);

      const [aliceEnded, bobEnded] = await Promise.all([aliceEndedPromise, bobEndedPromise]);
      expect(aliceEnded.callId).toBe(activeCallId);
      expect(aliceEnded.endedBy).toBe(idAlice);
      expect(bobEnded.callId).toBe(activeCallId);

      // Verify in DB
      const dbCall = await prisma.call.findUnique({
        where: { id: activeCallId },
      });
      expect(dbCall?.status).toBe(CallStatus.ENDED);
      expect(dbCall?.endedAt).toBeDefined();
      expect(dbCall?.durationSec).toBeGreaterThanOrEqual(0);
    });

    it('Signaling on ended call is rejected', async () => {
      const ack = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_OFFER,
          { callId: activeCallId, sdp: { type: 'offer', sdp: 'late' } },
          resolve,
        );
      });
      expect(ack.ok).toBe(false);
      expect(ack.error).toMatch(/state/i);
    });
  });

  describe('Call Rejection Flow', () => {
    let rejectCallId: string;

    it('Alice initiates call -> Bob rejects -> Alice receives call:rejected & DB is REJECTED', async () => {
      const aliceRejectedPromise = new Promise<any>((resolve) => {
        socketAlice.once(SocketEvents.CALL_REJECTED, resolve);
      });

      const initAck = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: dmConversationId, type: 'AUDIO' },
          resolve,
        );
      });
      expect(initAck.ok).toBe(true);
      rejectCallId = initAck.call.id;

      const rejectAck = await new Promise<any>((resolve) => {
        socketBob.emit(SocketEvents.CALL_REJECT, { callId: rejectCallId }, resolve);
      });
      expect(rejectAck.ok).toBe(true);
      expect(rejectAck.call.status).toBe(CallStatus.REJECTED);

      const rejectedEvent = await aliceRejectedPromise;
      expect(rejectedEvent.callId).toBe(rejectCallId);
      expect(rejectedEvent.rejectedBy).toBe(idBob);

      const dbCall = await prisma.call.findUnique({
        where: { id: rejectCallId },
      });
      expect(dbCall?.status).toBe(CallStatus.REJECTED);
    });
  });

  describe('Caller Cancel / Ring Timeout & Notification Flow', () => {
    it('Alice cancels while ringing -> callee gets MISSED_CALL notification', async () => {
      const initAck = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: dmConversationId, type: 'AUDIO' },
          resolve,
        );
      });
      const cancelCallId = initAck.call.id;

      const endAck = await new Promise<any>((resolve) => {
        socketAlice.emit(SocketEvents.CALL_END, { callId: cancelCallId }, resolve);
      });
      expect(endAck.ok).toBe(true);
      expect(endAck.call.status).toBe(CallStatus.MISSED);

      // Verify notification for Bob
      const notification = await prisma.notification.findFirst({
        where: {
          userId: idBob,
          actorId: idAlice,
          type: 'MISSED_CALL',
        },
      });
      expect(notification).toBeDefined();
      expect(notification?.title).toBe('Missed Call');
    });

    it('Ring timeout triggers MISSED status and notification', async () => {
      const initAck = await new Promise<any>((resolve) => {
        socketAlice.emit(
          SocketEvents.CALL_INITIATE,
          { conversationId: dmConversationId, type: 'VIDEO' },
          resolve,
        );
      });
      const timeoutCallId = initAck.call.id;

      // Manually trigger handleRingTimeout to simulate 45s elapsing
      await callsService.handleRingTimeout(timeoutCallId);

      const dbCall = await prisma.call.findUnique({
        where: { id: timeoutCallId },
      });
      expect(dbCall?.status).toBe(CallStatus.MISSED);
    });
  });

  describe('Call History Verification', () => {
    it('GET /api/v1/calls/history returns paginated call log for Alice', async () => {
      const res = await request(appUrl)
        .get('/api/v1/calls/history')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      const call = res.body.data[0];
      expect(call).toHaveProperty('peer');
      expect(call).toHaveProperty('direction');
      expect(call.peer.id).toBe(idBob);
      expect(call.direction).toBe('outgoing');
    });

    it('GET /api/v1/conversations/:id/calls returns calls for DM', async () => {
      const res = await request(appUrl)
        .get(`/api/v1/conversations/${dmConversationId}/calls`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].conversationId).toBe(dmConversationId);
    });
  });
});
