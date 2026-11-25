import {
  PrismaClient,
  ThemePreference,
  ProfileVisibility,
  ConversationType,
  ConversationRole,
  MessageType,
  CommunityRole,
  ChannelType,
  PostVisibility,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Hashes a password using Argon2id with exact spec parameters from PasswordService:
 * minimum 64 MiB memory (65536 KB), 3 iterations, parallelism 1
 */
async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

async function main() {
  console.log('🌱 Starting ChatterBox database seed...');

  const defaultPassword = 'Password123!';
  const passwordHash = await hashPassword(defaultPassword);

  // ==========================================
  // 1. Seed Baseline Users, Profiles & Settings
  // ==========================================
  const usersData = [
    {
      email: 'alice@chatterbox.app',
      username: 'alice',
      displayName: 'Alice Vance',
      bio: 'Building ChatterBox & exploring real-time web tech.',
      location: 'San Francisco, CA',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256&h=256&fit=crop',
    },
    {
      email: 'bob@chatterbox.app',
      username: 'bob',
      displayName: 'Bob Stone',
      bio: 'Frontend dev and UI enthusiast. Coffee lover.',
      location: 'New York, NY',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&h=256&fit=crop',
    },
    {
      email: 'charlie@chatterbox.app',
      username: 'charlie',
      displayName: 'Charlie Root',
      bio: 'DevOps & Systems engineer. Keeping uptime at 99.99%.',
      location: 'Austin, TX',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&h=256&fit=crop',
    },
  ];

  const users: Record<string, any> = {};

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        username: u.username,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: u.email,
        username: u.username,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    users[u.username] = user;

    // Upsert Profile
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        displayName: u.displayName,
        bio: u.bio,
        location: u.location,
        avatarUrl: u.avatarUrl,
      },
      create: {
        userId: user.id,
        displayName: u.displayName,
        bio: u.bio,
        location: u.location,
        avatarUrl: u.avatarUrl,
      },
    });

    // Upsert UserSettings
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        theme: ThemePreference.DARK,
        profileVisibility: ProfileVisibility.PUBLIC,
        showOnlineStatus: true,
        showReadReceipts: true,
        allowDirectMessages: true,
        notifyNewMessages: true,
        notifyMentions: true,
      },
      create: {
        userId: user.id,
        theme: ThemePreference.DARK,
        profileVisibility: ProfileVisibility.PUBLIC,
        showOnlineStatus: true,
        showReadReceipts: true,
        allowDirectMessages: true,
        notifyNewMessages: true,
        notifyMentions: true,
      },
    });

    console.log(`  ✓ User @${u.username} (${u.email}) ready`);
  }

  // ==========================================
  // 2. Seed Default Community, Channels & Posts
  // ==========================================
  const communitySlug = 'chatterbox-hq';
  const community = await prisma.community.upsert({
    where: { slug: communitySlug },
    update: {
      name: 'ChatterBox HQ',
      description: 'Official ChatterBox community for dev discussions, announcements, and feedback.',
      isPublic: true,
      ownerId: users.alice.id,
    },
    create: {
      name: 'ChatterBox HQ',
      slug: communitySlug,
      description: 'Official ChatterBox community for dev discussions, announcements, and feedback.',
      isPublic: true,
      ownerId: users.alice.id,
    },
  });

  // Community Memberships
  const memberships = [
    { userId: users.alice.id, role: CommunityRole.OWNER },
    { userId: users.bob.id, role: CommunityRole.ADMIN },
    { userId: users.charlie.id, role: CommunityRole.MEMBER },
  ];

  for (const m of memberships) {
    await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: community.id,
          userId: m.userId,
        },
      },
      update: { role: m.role },
      create: {
        communityId: community.id,
        userId: m.userId,
        role: m.role,
      },
    });
  }
  console.log(`  ✓ Community "${community.name}" memberships seeded`);

  // Default Channels
  const channelsData = [
    { name: 'general', topic: 'General discussions and hangouts', type: ChannelType.TEXT, position: 0 },
    { name: 'announcements', topic: 'Platform updates and announcements', type: ChannelType.ANNOUNCEMENT, position: 1 },
    { name: 'dev-chat', topic: 'Engineering and feature development', type: ChannelType.TEXT, position: 2 },
  ];

  const channels: Record<string, any> = {};

  for (const ch of channelsData) {
    const channel = await prisma.channel.upsert({
      where: {
        communityId_name: {
          communityId: community.id,
          name: ch.name,
        },
      },
      update: {
        topic: ch.topic,
        type: ch.type,
        position: ch.position,
      },
      create: {
        communityId: community.id,
        name: ch.name,
        topic: ch.topic,
        type: ch.type,
        position: ch.position,
      },
    });
    channels[ch.name] = channel;
  }
  console.log(`  ✓ Channels (#general, #announcements, #dev-chat) seeded`);

  // Channel Messages
  const generalMessages = [
    {
      senderId: users.alice.id,
      clientMessageId: 'seed-general-alice-1',
      content: 'Welcome to ChatterBox HQ! Feel free to explore communities, DMs, stories, and E2EE.',
    },
    {
      senderId: users.bob.id,
      clientMessageId: 'seed-general-bob-1',
      content: 'Awesome to be here! The real-time messaging feels super smooth.',
    },
    {
      senderId: users.charlie.id,
      clientMessageId: 'seed-general-charlie-1',
      content: 'System status looks green across all services. Let\'s build something great.',
    },
  ];

  for (const msg of generalMessages) {
    await prisma.channelMessage.upsert({
      where: {
        senderId_clientMessageId: {
          senderId: msg.senderId,
          clientMessageId: msg.clientMessageId,
        },
      },
      update: {
        content: msg.content,
      },
      create: {
        channelId: channels.general.id,
        senderId: msg.senderId,
        clientMessageId: msg.clientMessageId,
        content: msg.content,
      },
    });
  }

  // Announcements Message
  await prisma.channelMessage.upsert({
    where: {
      senderId_clientMessageId: {
        senderId: users.alice.id,
        clientMessageId: 'seed-announcement-alice-1',
      },
    },
    update: {
      content: '🚀 ChatterBox v0.1.0 is live! Check out communities, feeds, and encrypted messaging.',
    },
    create: {
      channelId: channels.announcements.id,
      senderId: users.alice.id,
      clientMessageId: 'seed-announcement-alice-1',
      content: '🚀 ChatterBox v0.1.0 is live! Check out communities, feeds, and encrypted messaging.',
    },
  });
  console.log(`  ✓ Sample community channel messages seeded`);

  // ==========================================
  // 3. Seed Default 1:1 Direct Message (Alice & Bob)
  // ==========================================
  const dmKey = [users.alice.id, users.bob.id].sort().join(':');
  const dmConversation = await prisma.conversation.upsert({
    where: { dmKey },
    update: {
      lastMessageAt: new Date(),
    },
    create: {
      type: ConversationType.DM,
      dmKey,
      isEncrypted: false,
      lastMessageAt: new Date(),
    },
  });

  // Conversation Members
  await prisma.conversationMember.upsert({
    where: {
      conversationId_userId: {
        conversationId: dmConversation.id,
        userId: users.alice.id,
      },
    },
    update: { role: ConversationRole.OWNER },
    create: {
      conversationId: dmConversation.id,
      userId: users.alice.id,
      role: ConversationRole.OWNER,
    },
  });

  await prisma.conversationMember.upsert({
    where: {
      conversationId_userId: {
        conversationId: dmConversation.id,
        userId: users.bob.id,
      },
    },
    update: { role: ConversationRole.MEMBER },
    create: {
      conversationId: dmConversation.id,
      userId: users.bob.id,
      role: ConversationRole.MEMBER,
    },
  });

  // Sample Messages
  const dmMessages = [
    {
      senderId: users.alice.id,
      clientMessageId: 'seed-dm-alice-1',
      content: 'Hey Bob! Welcome to ChatterBox direct messages.',
    },
    {
      senderId: users.bob.id,
      clientMessageId: 'seed-dm-bob-1',
      content: 'Hey Alice! Excited to test out the direct messaging and calls.',
    },
    {
      senderId: users.alice.id,
      clientMessageId: 'seed-dm-alice-2',
      content: 'Everything is hooked up to Postgres and Socket.IO cleanly.',
    },
  ];

  for (const msg of dmMessages) {
    await prisma.message.upsert({
      where: {
        senderId_clientMessageId: {
          senderId: msg.senderId,
          clientMessageId: msg.clientMessageId,
        },
      },
      update: {
        content: msg.content,
      },
      create: {
        conversationId: dmConversation.id,
        senderId: msg.senderId,
        clientMessageId: msg.clientMessageId,
        content: msg.content,
        type: MessageType.TEXT,
        isEncrypted: false,
      },
    });
  }
  console.log(`  ✓ 1:1 DM conversation (Alice <-> Bob) seeded with sample messages`);

  // ==========================================
  // 4. Seed Social Follows & Baseline Feed Post
  // ==========================================
  const follows = [
    { followerId: users.bob.id, followingId: users.alice.id },
    { followerId: users.charlie.id, followingId: users.alice.id },
    { followerId: users.alice.id, followingId: users.bob.id },
  ];

  for (const f of follows) {
    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: f.followerId,
          followingId: f.followingId,
        },
      },
      update: {},
      create: {
        followerId: f.followerId,
        followingId: f.followingId,
      },
    });
  }
  console.log(`  ✓ Baseline social follows seeded`);

  // Baseline Post by Alice
  const existingPost = await prisma.post.findFirst({
    where: {
      authorId: users.alice.id,
      content: 'Excited to welcome everyone to ChatterBox! The modern real-time social platform.',
    },
  });

  let samplePost = existingPost;
  if (!samplePost) {
    samplePost = await prisma.post.create({
      data: {
        authorId: users.alice.id,
        content: 'Excited to welcome everyone to ChatterBox! The modern real-time social platform.',
        visibility: PostVisibility.PUBLIC,
      },
    });
  }

  // Like by Bob
  if (samplePost) {
    await prisma.postLike.upsert({
      where: {
        postId_userId: {
          postId: samplePost.id,
          userId: users.bob.id,
        },
      },
      update: {},
      create: {
        postId: samplePost.id,
        userId: users.bob.id,
      },
    });
  }
  console.log(`  ✓ Sample public post & like seeded`);

  console.log('✅ ChatterBox database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Database seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
