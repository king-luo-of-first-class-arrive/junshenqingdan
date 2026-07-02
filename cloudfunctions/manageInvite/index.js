const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
const _ = db.command;

/**
 * 管理邀请码：创建、接受、移除成员
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, spaceId, code, userId } = event;

  switch (action) {
    case 'create': return createInvite(OPENID, spaceId);
    case 'accept': return acceptInvite(OPENID, code);
    case 'removeMember': return removeMember(OPENID, spaceId, userId);
    default: throw new Error('未知操作');
  }
};

async function createInvite(openid, spaceId) {
  const { data: space } = await db.collection('spaces').doc(spaceId).get();
  if (!space) throw new Error('空间不存在');

  // 仅成员可生成邀请码
  const member = (space.members || []).find(m => m.userId === openid);
  if (!member) throw new Error('无权操作');

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小时过期

  await db.collection('invites').add({
    data: { spaceId, code, createdBy: openid, createdAt: new Date(), expiresAt }
  });

  return { code, expiresAt };
}

async function acceptInvite(openid, code) {
  const { data: invites } = await db.collection('invites')
    .where({ code }).get();

  if (invites.length === 0) throw new Error('邀请码无效');
  const invite = invites[0];

  if (new Date(invite.expiresAt) < new Date()) {
    throw new Error('邀请码已过期');
  }

  const spaceId = invite.spaceId;
  const { data: space } = await db.collection('spaces').doc(spaceId).get();
  if (!space) throw new Error('空间不存在');

  const alreadyMember = (space.members || []).find(m => m.userId === openid);
  if (alreadyMember) return { ok: true, message: '已是成员' };

  await db.collection('spaces').doc(spaceId).update({
    data: {
      members: _.push({
        userId: openid,
        role: 'member',
        joinedAt: new Date()
      })
    }
  });

  // 邀请码用过即删
  await db.collection('invites').doc(invite._id).remove();

  return { ok: true };
}

async function removeMember(openid, spaceId, targetUserId) {
  const { data: space } = await db.collection('spaces').doc(spaceId).get();
  if (!space) throw new Error('空间不存在');

  const self = (space.members || []).find(m => m.userId === openid);
  if (!self || self.role !== 'owner') throw new Error('仅空间所有者可以移除成员');

  const target = (space.members || []).find(m => m.userId === targetUserId);
  if (!target) throw new Error('该用户不是成员');
  if (target.role === 'owner') throw new Error('不能移除所有者');

  await db.collection('spaces').doc(spaceId).update({
    data: {
      members: _.pull({ userId: targetUserId })
    }
  });

  return { ok: true };
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
