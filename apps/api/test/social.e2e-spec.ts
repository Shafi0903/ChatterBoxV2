import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { S3Service } from '../src/modules/media/s3.service';

describe('Social Graph, Posts, Likes, Comments & Stories Module (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3Service: S3Service;

  const userAuthor = {
    email: 'author_social@chatterbox.app',
    username: 'author_social',
    displayName: 'Author Social',
    password: 'Password123!',
  };

  const userFollower = {
    email: 'follower_social@chatterbox.app',
    username: 'follower_social',
    displayName: 'Follower Social',
    password: 'Password123!',
  };

  const userStranger = {
    email: 'stranger_social@chatterbox.app',
    username: 'stranger_social',
    displayName: 'Stranger Social',
    password: 'Password123!',
  };

  let tokenAuthor: string;
  let tokenFollower: string;
  let tokenStranger: string;

  let idAuthor: string;
  let idFollower: string;
  let idStranger: string;

  let publicPostId: string;
  let followersPostId: string;
  let followersMediaAttachmentId: string;
  let commentId: string;
  let storyId: string;
  let storyMediaAttachmentId: string;

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

    prisma = app.get(PrismaService);
    s3Service = app.get(S3Service);

    // Clean up test users and their related entities
    const testEmails = [userAuthor.email, userFollower.email, userStranger.email];
    const usersToClean = await prisma.user.findMany({
      where: { email: { in: testEmails } },
      select: { id: true },
    });
    const userIds = usersToClean.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.storyView.deleteMany({ where: { viewerId: { in: userIds } } });
      await prisma.story.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.postComment.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.postLike.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.follow.deleteMany({
        where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
      });
      await prisma.mediaAttachment.deleteMany({ where: { uploaderId: { in: userIds } } });
      await prisma.notification.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { actorId: { in: userIds } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    // Register test users
    const registerUser = async (u: any) => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send(u).expect(201);
      return { token: res.body.data.accessToken, id: res.body.data.user.id };
    };

    const resAuthor = await registerUser(userAuthor);
    tokenAuthor = resAuthor.token;
    idAuthor = resAuthor.id;

    const resFollower = await registerUser(userFollower);
    tokenFollower = resFollower.token;
    idFollower = resFollower.id;

    const resStranger = await registerUser(userStranger);
    tokenStranger = resStranger.token;
    idStranger = resStranger.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Follows Graph & Real Profile Metrics', () => {
    it('POST /api/v1/users/:userId/follow -> rejects self-follow (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/users/${idAuthor}/follow`)
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .expect(400);

      expect(res.body.error.message).toContain('cannot follow yourself');
    });

    it('POST /api/v1/users/:userId/follow -> follower follows author (idempotent)', async () => {
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/users/${idAuthor}/follow`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res1.body.data.isFollowing).toBe(true);

      // Duplicate call is idempotent
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/users/${idAuthor}/follow`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res2.body.data.isFollowing).toBe(true);
    });

    it('creates a NEW_FOLLOWER notification for author', async () => {
      const notifs = await prisma.notification.findMany({
        where: { userId: idAuthor, type: 'NEW_FOLLOWER' },
      });
      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toBe('New Follower');
      expect(notifs[0].actorId).toBe(idFollower);
    });

    it('GET /api/v1/profiles/:username -> returns real follower counts & isFollowing flag', async () => {
      // Follower viewing author profile
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/profiles/${userAuthor.username}`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res1.body.data.counts.followers).toBe(1);
      expect(res1.body.data.counts.following).toBe(0);
      expect(res1.body.data.isFollowing).toBe(true);

      // Stranger viewing author profile
      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/profiles/${userAuthor.username}`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(200);

      expect(res2.body.data.counts.followers).toBe(1);
      expect(res2.body.data.isFollowing).toBe(false);
    });

    it('GET /api/v1/users/:userId/followers & following -> lists users with isFollowing flag', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${idAuthor}/followers`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(idFollower);
      expect(res.body.data[0].username).toBe(userFollower.username);
    });
  });

  describe('2. Posts Creation, Visibility & Cross-Phase Media Security', () => {
    it('POST /api/v1/posts -> creates PUBLIC post with text only', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .send({
          content: 'Hello world from ChatterBox Phase 6!',
          visibility: 'PUBLIC',
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe('Hello world from ChatterBox Phase 6!');
      expect(res.body.data.visibility).toBe('PUBLIC');
      expect(res.body.data.likesCount).toBe(0);
      expect(res.body.data.commentsCount).toBe(0);
      expect(res.body.data.isLiked).toBe(false);
      publicPostId = res.body.data.id;
    });

    it('creates FOLLOWERS post with confirmed media attachment', async () => {
      // 1. Presign attachment
      const validPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('secret-feed-png-data'),
      ]);

      const presignRes = await request(app.getHttpServer())
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .send({
          filename: 'secret_feed.png',
          mimeType: 'image/png',
          sizeBytes: validPng.length,
        })
        .expect(200);

      followersMediaAttachmentId = presignRes.body.data.attachmentId;

      // 2. Put simulated object in RustFS using fetch PUT
      await fetch(presignRes.body.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: validPng,
      });

      // 3. Confirm upload
      await request(app.getHttpServer())
        .post(`/api/v1/media/${followersMediaAttachmentId}/confirm`)
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .expect(200);

      // 4. Create FOLLOWERS post linking attachment
      const postRes = await request(app.getHttpServer())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .send({
          content: 'Followers only VIP post!',
          visibility: 'FOLLOWERS',
          attachmentIds: [followersMediaAttachmentId],
        })
        .expect(201);

      expect(postRes.body.data.id).toBeDefined();
      expect(postRes.body.data.visibility).toBe('FOLLOWERS');
      expect(postRes.body.data.attachments.length).toBe(1);
      expect(postRes.body.data.attachments[0].id).toBe(followersMediaAttachmentId);

      followersPostId = postRes.body.data.id;
    });

    it('Stranger receives 403 Forbidden on FOLLOWERS post and its media URL', async () => {
      // Attempting to read post
      const postRes = await request(app.getHttpServer())
        .get(`/api/v1/posts/${followersPostId}`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(403);

      expect(postRes.body.error.message).toContain('restricted to followers');

      // Attempting to get media download URL
      const mediaRes = await request(app.getHttpServer())
        .get(`/api/v1/media/${followersMediaAttachmentId}/url`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(403);

      expect(mediaRes.body.error.message).toContain('must follow the author');
    });

    it('Follower receives 200 OK on FOLLOWERS post and its media URL', async () => {
      // Reading post
      const postRes = await request(app.getHttpServer())
        .get(`/api/v1/posts/${followersPostId}`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(postRes.body.data.id).toBe(followersPostId);

      // Getting media download URL
      const mediaRes = await request(app.getHttpServer())
        .get(`/api/v1/media/${followersMediaAttachmentId}/url`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(mediaRes.body.data.downloadUrl).toBeDefined();
    });

    it('GET /api/v1/posts/feed -> explore tab returns only PUBLIC posts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/posts/feed?tab=explore')
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(200);

      const postIds = res.body.data.map((p: any) => p.id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).not.toContain(followersPostId);
    });

    it('GET /api/v1/posts/feed -> following tab returns both PUBLIC and FOLLOWERS posts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/posts/feed?tab=following')
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      const postIds = res.body.data.map((p: any) => p.id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).toContain(followersPostId);
    });
  });

  describe('3. Likes, Comments & Notifications', () => {
    it('POST /api/v1/posts/:id/like -> follower likes post and triggers POST_LIKE notification', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${publicPostId}/like`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res.body.data.isLiked).toBe(true);
      expect(res.body.data.likesCount).toBe(1);

      // Verify notification created
      const notif = await prisma.notification.findFirst({
        where: { userId: idAuthor, type: 'POST_LIKE', postId: publicPostId },
      });
      expect(notif).toBeDefined();
      expect(notif?.actorId).toBe(idFollower);
    });

    it('DELETE /api/v1/posts/:id/like -> unlike post decrements likesCount', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${publicPostId}/like`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res.body.data.isLiked).toBe(false);
      expect(res.body.data.likesCount).toBe(0);
    });

    it('POST /api/v1/posts/:id/comments -> adds comment and triggers POST_COMMENT notification', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${publicPostId}/comments`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .send({ content: 'Awesome post, congratulations!' })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe('Awesome post, congratulations!');
      expect(res.body.data.author.username).toBe(userFollower.username);
      commentId = res.body.data.id;

      // Verify notification with postId
      const notif = await prisma.notification.findFirst({
        where: { userId: idAuthor, type: 'POST_COMMENT', postId: publicPostId },
      });
      expect(notif).toBeDefined();
      expect(notif?.postId).toBe(publicPostId);
    });

    it('Stranger cannot delete follower comment (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/posts/comments/${commentId}`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(403);
    });

    it('Post author CAN delete comment (200 OK)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/posts/comments/${commentId}`)
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .expect(200);

      const dbComment = await prisma.postComment.findUnique({ where: { id: commentId } });
      expect(dbComment?.deletedAt).not.toBeNull();
    });
  });

  describe('4. 24-Hour Stories & Expiration Lifecycle', () => {
    it('POST /api/v1/stories -> creates story with image attachment expiring in 24 hours', async () => {
      // 1. Presign attachment
      const validJpg = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
        Buffer.from('story-photo-jpeg-data'),
      ]);

      const presignRes = await request(app.getHttpServer())
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .send({
          filename: 'story_photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: validJpg.length,
        })
        .expect(200);

      storyMediaAttachmentId = presignRes.body.data.attachmentId;

      // 2. Put simulated object in RustFS using fetch PUT
      await fetch(presignRes.body.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: validJpg,
      });

      // 3. Confirm upload
      await request(app.getHttpServer())
        .post(`/api/v1/media/${storyMediaAttachmentId}/confirm`)
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .expect(200);

      // 4. Create story
      const res = await request(app.getHttpServer())
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .send({
          caption: '24-hour sunset vibe',
          attachmentId: storyMediaAttachmentId,
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.caption).toBe('24-hour sunset vibe');
      expect(res.body.data.attachment.id).toBe(storyMediaAttachmentId);

      storyId = res.body.data.id;
    });

    it('GET /api/v1/stories/feed -> follower sees active story group with hasViewed: false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stories/feed')
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const authorGroup = res.body.data.find((g: any) => g.author.id === idAuthor);
      expect(authorGroup).toBeDefined();
      expect(authorGroup.hasUnviewed).toBe(true);

      const targetStory = authorGroup.stories.find((s: any) => s.id === storyId);
      expect(targetStory).toBeDefined();
      expect(targetStory.hasViewed).toBe(false);
    });

    it('POST /api/v1/stories/:id/view -> marks story as viewed and author inspects views', async () => {
      // Follower marks viewed
      await request(app.getHttpServer())
        .post(`/api/v1/stories/${storyId}/view`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      // Author checks viewers list
      const viewsRes = await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}/views`)
        .set('Authorization', `Bearer ${tokenAuthor}`)
        .expect(200);

      expect(viewsRes.body.meta.totalCount).toBe(1);
      expect(viewsRes.body.data[0].viewer.id).toBe(idFollower);
    });

    it('Expired stories are excluded from feed and their media download is rejected', async () => {
      // Update story to have expired 1 hour ago
      const pastDate = new Date(Date.now() - 3600 * 1000);
      await prisma.story.update({
        where: { id: storyId },
        data: { expiresAt: pastDate },
      });

      // Follower story feed should now exclude story
      const feedRes = await request(app.getHttpServer())
        .get('/api/v1/stories/feed')
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(200);

      const authorGroup = feedRes.body.data.find((g: any) => g.author.id === idAuthor);
      const expiredStory = authorGroup?.stories.find((s: any) => s.id === storyId);
      expect(expiredStory).toBeUndefined();

      // Media download URL must be rejected (404 Not Found as per Adjustment #2)
      await request(app.getHttpServer())
        .get(`/api/v1/media/${storyMediaAttachmentId}/url`)
        .set('Authorization', `Bearer ${tokenFollower}`)
        .expect(404);
    });
  });
});
